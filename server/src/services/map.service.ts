import { Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import { MapMarkerDto, MapMarkerResponseDto, MapReverseGeocodeDto } from 'src/dtos/map.dto';
import { Permission } from 'src/enum';
import { BaseService } from 'src/services/base.service';
import { getMyPartnerIds } from 'src/utils/asset.util';

@Injectable()
export class MapService extends BaseService {
  async getMapMarkers(auth: AuthDto, options: MapMarkerDto): Promise<MapMarkerResponseDto[]> {
    const householdUsers = await this.familyPolicy.getDiscoverableUsers(auth.user.id);
    const householdUserIds = new Set(householdUsers.map(({ id }) => id));
    if (!householdUserIds.has(auth.user.id)) {
      return [];
    }

    const userIds = [auth.user.id];
    if (options.withPartners) {
      const partnerIds = await getMyPartnerIds({ userId: auth.user.id, repository: this.partnerRepository });
      userIds.push(...partnerIds.filter((id) => householdUserIds.has(id)));
    }

    const candidateAlbumIds = options.withSharedAlbums ? await this.albumRepository.getAllIds(auth.user.id) : [];
    const albumIds = await this.checkAccess({ auth, permission: Permission.AlbumRead, ids: candidateAlbumIds });

    return this.mapRepository.getMapMarkers(auth.user.id, userIds, [...albumIds], [...householdUserIds], options);
  }

  async reverseGeocode(dto: MapReverseGeocodeDto) {
    const { lat: latitude, lon: longitude } = dto;
    // eventually this should probably return an array of results
    const result = await this.mapRepository.reverseGeocode({ latitude, longitude });
    return result ? [result] : [];
  }
}
