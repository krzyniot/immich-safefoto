import { Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyAlbumAddPhotosDto, FamilyAlbumPublicationDto } from 'src/dtos/family-album.dto';
import { FamilyPhotoQueryDto } from 'src/dtos/family-photo.dto';
import { FamilyAlbumRepository } from 'src/repositories/family-album.repository';

@Injectable()
export class FamilyAlbumService {
  constructor(private repository: FamilyAlbumRepository) {}

  publish(auth: AuthDto, albumId: string, dto: FamilyAlbumPublicationDto) {
    return this.repository.publishAlbum(auth.user.id, albumId, dto.mode);
  }

  addPhotos(auth: AuthDto, albumId: string, dto: FamilyAlbumAddPhotosDto) {
    return this.repository.addPhotos(auth.user.id, albumId, dto.assetIds, dto.mode);
  }

  async getAlbums(auth: AuthDto) {
    const albums = await this.repository.getAlbums(auth.user.id);
    return albums.map((album) => ({ ...album, publishedAt: album.publishedAt.toISOString() }));
  }

  async getPhotos(auth: AuthDto, albumId: string, query: FamilyPhotoQueryDto) {
    const page = await this.repository.getAlbumPhotos(auth.user.id, albumId, query.page, query.limit);
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
}
