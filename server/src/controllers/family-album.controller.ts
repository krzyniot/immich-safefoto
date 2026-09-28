import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyAlbumAddPhotosDto, FamilyAlbumDto, FamilyAlbumPublicationDto } from 'src/dtos/family-album.dto';
import { FamilyPhotoPageDto, FamilyPhotoQueryDto } from 'src/dtos/family-photo.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { FamilyAlbumService } from 'src/services/family-album.service';
import { UUIDParamDto } from 'src/validation';

@ApiTags(ApiTag.Albums)
@Controller('family/albums')
export class FamilyAlbumController {
  constructor(private service: FamilyAlbumService) {}

  @Get()
  @Authenticated({ permission: Permission.AlbumRead })
  @Endpoint({ summary: 'List published family albums', history: new HistoryBuilder().added('v3') })
  getAlbums(@Auth() auth: AuthDto): Promise<FamilyAlbumDto[]> {
    return this.service.getAlbums(auth);
  }

  @Get(':id/photos')
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({ summary: 'List published photos in a family album', history: new HistoryBuilder().added('v3') })
  getPhotos(
    @Auth() auth: AuthDto,
    @Param() { id }: UUIDParamDto,
    @Query() dto: FamilyPhotoQueryDto,
  ): Promise<FamilyPhotoPageDto> {
    return this.service.getPhotos(auth, id, dto);
  }

  @Put(':id/publication')
  @Authenticated({ permission: Permission.AlbumUpdate })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Publish an owned album and its own photos to the family',
    history: new HistoryBuilder().added('v3'),
  })
  publish(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: FamilyAlbumPublicationDto): Promise<void> {
    return this.service.publish(auth, id, dto);
  }

  @Put(':id/photos')
  @Authenticated({ permission: Permission.AssetUpdate })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Explicitly contribute owned photos to a published family album',
    history: new HistoryBuilder().added('v3'),
  })
  addPhotos(@Auth() auth: AuthDto, @Param() { id }: UUIDParamDto, @Body() dto: FamilyAlbumAddPhotosDto): Promise<void> {
    return this.service.addPhotos(auth, id, dto);
  }
}
