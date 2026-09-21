import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const HouseholdSummarySchema = z.object({
  householdId: z.uuid(),
  isHouseholdAdmin: z.boolean(),
  quotaSizeInBytes: z.number().int().nullable(),
  isQuotaAutoBalanced: z.boolean(),
  memberCount: z.number().int().nonnegative(),
}).meta({ id: 'HouseholdSummaryDto' });

export class HouseholdSummaryDto extends createZodDto(HouseholdSummarySchema) {}

export class HouseholdIdParamDto extends createZodDto(z.object({ id: z.uuid() }).meta({ id: 'HouseholdIdParamDto' })) {}

export const HouseholdStoragePoolSchema = z.object({
  quotaSizeInBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).meta({ id: 'HouseholdStoragePoolDto' });

export class HouseholdStoragePoolDto extends createZodDto(HouseholdStoragePoolSchema) {}
