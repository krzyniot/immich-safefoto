import { Body, Controller, Get, HttpCode, HttpStatus, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Endpoint, HistoryBuilder } from 'src/decorators';
import { AuthDto } from 'src/dtos/auth.dto';
import { FamilyPhotoPageDto, FamilyPhotoPublicationDto, FamilyPhotoQueryDto } from 'src/dtos/family-photo.dto';
import { ApiTag, Permission } from 'src/enum';
import { Auth, Authenticated } from 'src/middleware/auth.guard';
import { FamilyPhotoService } from 'src/services/family-photo.service';

@ApiTags(ApiTag.Assets)
@Controller('family/photos')
export class FamilyPhotoController {
  constructor(private service: FamilyPhotoService) {}

  @Get()
  @Authenticated({ permission: Permission.AssetRead })
  @Endpoint({
    summary: 'Get family photos',
    description: 'Retrieve a paginated timeline of photos explicitly published to the current family.',
    history: new HistoryBuilder().added('v3'),
  })
  getPhotos(@Auth() auth: AuthDto, @Query() dto: FamilyPhotoQueryDto): Promise<FamilyPhotoPageDto> {
    return this.service.getPhotos(auth, dto);
  }

  @Put('publication')
  @Authenticated({ permission: Permission.AssetUpdate })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Endpoint({
    summary: 'Update family photo publication',
    description: 'Share, move, or return owned photos to private space without copying files.',
    history: new HistoryBuilder().added('v3'),
  })
  updatePublication(@Auth() auth: AuthDto, @Body() dto: FamilyPhotoPublicationDto): Promise<void> {
    return this.service.updatePublication(auth, dto);
  }
}
