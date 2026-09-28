import { Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPageDto, FamilyPhotoPublicationDto, FamilyPhotoQueryDto } from 'src/dtos/family-photo.dto';
import { FamilyPhotoRepository } from 'src/repositories/family-photo.repository';

@Injectable()
export class FamilyPhotoService {
  constructor(private repository: FamilyPhotoRepository) {}

  async getPhotos(auth: AuthDto, dto: FamilyPhotoQueryDto): Promise<FamilyPhotoPageDto> {
    const page = await this.repository.getPage(auth.user.id, dto);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        fileCreatedAt: item.fileCreatedAt.toISOString(),
        localDateTime: item.localDateTime.toISOString(),
        publishedAt: item.publishedAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async updatePublication(auth: AuthDto, dto: FamilyPhotoPublicationDto): Promise<void> {
    await this.repository.publish(auth.user.id, dto.assetIds, dto.mode);
  }
}
