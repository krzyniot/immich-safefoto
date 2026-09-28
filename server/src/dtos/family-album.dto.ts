import { createZodDto } from 'nestjs-zod';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import z from 'zod';

const Mode = z.union([z.literal(FamilyPhotoPublicationMode.Share), z.literal(FamilyPhotoPublicationMode.Move)]);

const Publication = z
  .object({
    mode: Mode,
  })
  .meta({ id: 'FamilyAlbumPublicationDto' });

const AddPhotos = z
  .object({
    assetIds: z.array(z.uuidv4()).min(1).max(1000),
    mode: Mode,
  })
  .meta({ id: 'FamilyAlbumAddPhotosDto' });

const FamilyAlbum = z
  .object({
    id: z.uuidv4(),
    albumName: z.string(),
    description: z.string(),
    defaultMode: Mode,
    publishedAt: z.string().meta({ format: 'date-time' }),
  })
  .meta({ id: 'FamilyAlbumDto' });

export class FamilyAlbumPublicationDto extends createZodDto(Publication) {}
export class FamilyAlbumAddPhotosDto extends createZodDto(AddPhotos) {}
export class FamilyAlbumDto extends createZodDto(FamilyAlbum) {}
