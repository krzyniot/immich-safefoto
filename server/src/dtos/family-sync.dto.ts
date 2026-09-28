import { createZodDto } from 'nestjs-zod';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import z from 'zod';

const FamilySyncAsset = z.object({
  id: z.uuidv4(),
  ownerId: z.uuidv4(),
  hideFromPersonalTimeline: z.boolean(),
  updatedAt: z.string().meta({ format: 'date-time' }),
});

const FamilySyncAlbum = z.object({
  id: z.uuidv4(),
  name: z.string(),
  description: z.string(),
  defaultMode: z.union([z.literal(FamilyPhotoPublicationMode.Share), z.literal(FamilyPhotoPublicationMode.Move)]),
  updatedAt: z.string().meta({ format: 'date-time' }),
});

const FamilySyncAlbumAsset = z.object({
  albumId: z.uuidv4(),
  assetId: z.uuidv4(),
});

const FamilySyncManifest = z
  .object({
    version: z.literal(1),
    householdId: z.uuidv4(),
    generatedAt: z.string().meta({ format: 'date-time' }),
    assets: z.array(FamilySyncAsset),
    albums: z.array(FamilySyncAlbum),
    albumAssets: z.array(FamilySyncAlbumAsset),
  })
  .meta({ id: 'FamilySyncManifestDto' });

export class FamilySyncManifestDto extends createZodDto(FamilySyncManifest) {}
