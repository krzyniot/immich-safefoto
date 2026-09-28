import { createZodDto } from 'nestjs-zod';
import { AssetTypeSchema } from 'src/enum';
import z from 'zod';

export enum FamilyPhotoPublicationMode {
  Share = 'share',
  Move = 'move',
  Private = 'private',
}

const FamilyPhotoPublicationSchema = z
  .object({
    assetIds: z.array(z.uuidv4()).min(1).max(1000).describe('Asset IDs owned by the authenticated user'),
    mode: z.enum(FamilyPhotoPublicationMode).describe('Family publication mode'),
  })
  .meta({ id: 'FamilyPhotoPublicationDto' });

const FamilyPhotoQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .meta({ id: 'FamilyPhotoQueryDto' });

const FamilyPhotoSchema = z.object({
  id: z.uuidv4(),
  ownerId: z.uuidv4(),
  type: AssetTypeSchema,
  fileCreatedAt: z.string().meta({ format: 'date-time' }),
  localDateTime: z.string().meta({ format: 'date-time' }),
  hideFromPersonalTimeline: z.boolean(),
  publishedAt: z.string().meta({ format: 'date-time' }),
  updatedAt: z.string().meta({ format: 'date-time' }),
});

const FamilyPhotoPageSchema = z
  .object({
    items: z.array(FamilyPhotoSchema),
    page: z.int().min(1),
    limit: z.int().min(1),
    nextPage: z.int().min(2).nullable(),
  })
  .meta({ id: 'FamilyPhotoPageDto' });

export class FamilyPhotoPublicationDto extends createZodDto(FamilyPhotoPublicationSchema) {}
export class FamilyPhotoQueryDto extends createZodDto(FamilyPhotoQuerySchema) {}
export class FamilyPhotoPageDto extends createZodDto(FamilyPhotoPageSchema) {}
