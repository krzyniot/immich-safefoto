import { BadRequestException, Injectable } from '@nestjs/common';
import { Partner } from 'src/database';
import { AuthDto } from 'src/dtos/auth.dto';
import { PartnerCreateDto, PartnerResponseDto, PartnerSearchDto, PartnerUpdateDto } from 'src/dtos/partner.dto';
import { mapUser } from 'src/dtos/user.dto';
import { Permission } from 'src/enum';
import { PartnerDirection, PartnerIds } from 'src/repositories/partner.repository';
import { BaseService } from 'src/services/base.service';

@Injectable()
export class PartnerService extends BaseService {
  async create(auth: AuthDto, { sharedWithId }: PartnerCreateDto): Promise<PartnerResponseDto> {
    if (!(await this.familyPolicy.getDiscoverableUser(auth.user.id, sharedWithId))) {
      throw new BadRequestException('Partner not found');
    }
    const partnerId: PartnerIds = { sharedById: auth.user.id, sharedWithId };
    const exists = await this.partnerRepository.get(partnerId);
    if (exists) {
      throw new BadRequestException(`Partner already exists`);
    }

    const partner = await this.partnerRepository.create(partnerId);
    return this.mapPartner(partner, PartnerDirection.SharedBy);
  }

  async remove(auth: AuthDto, sharedWithId: string): Promise<void> {
    if (!(await this.familyPolicy.getDiscoverableUser(auth.user.id, sharedWithId))) {
      throw new BadRequestException('Partner not found');
    }
    const partnerId: PartnerIds = { sharedById: auth.user.id, sharedWithId };
    const partner = await this.partnerRepository.get(partnerId);
    if (!partner) {
      throw new BadRequestException('Partner not found');
    }

    await this.partnerRepository.remove(partnerId);
  }

  async search(auth: AuthDto, { direction }: PartnerSearchDto): Promise<PartnerResponseDto[]> {
    const partners = await this.partnerRepository.getAll(auth.user.id);
    const key = direction === PartnerDirection.SharedBy ? 'sharedById' : 'sharedWithId';
    const activePartners = partners
      .filter((partner): partner is Partner => !!(partner.sharedBy && partner.sharedWith)) // Filter out soft deleted users
      .filter((partner) => partner[key] === auth.user.id);
    const safePartners = await Promise.all(
      activePartners.map(async (partner) => {
        const otherUserId = partner.sharedById === auth.user.id ? partner.sharedWithId : partner.sharedById;
        return (await this.familyPolicy.getDiscoverableUser(auth.user.id, otherUserId)) ? partner : undefined;
      }),
    );
    return safePartners
      .filter((partner) => partner !== undefined)
      .map((partner) => this.mapPartner(partner, direction));
  }

  async update(auth: AuthDto, sharedById: string, dto: PartnerUpdateDto): Promise<PartnerResponseDto> {
    if (!(await this.familyPolicy.getDiscoverableUser(auth.user.id, sharedById))) {
      throw new BadRequestException('Partner not found');
    }
    await this.requireAccess({ auth, permission: Permission.PartnerUpdate, ids: [sharedById] });
    const partnerId: PartnerIds = { sharedById, sharedWithId: auth.user.id };

    const entity = await this.partnerRepository.update(partnerId, { inTimeline: dto.inTimeline });
    return this.mapPartner(entity, PartnerDirection.SharedWith);
  }

  private mapPartner(partner: Partner, direction: PartnerDirection): PartnerResponseDto {
    // this is opposite to return the non-me user of the "partner"
    const sharedUser = direction === PartnerDirection.SharedBy ? partner.sharedWith : partner.sharedBy;
    const user = mapUser(sharedUser);

    return { ...user, inTimeline: partner.inTimeline };
  }
}
