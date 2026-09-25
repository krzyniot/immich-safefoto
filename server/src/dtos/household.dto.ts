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

export const HouseholdMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  isHouseholdAdmin: z.boolean(),
  quotaSizeInBytes: z.number().int().nullable(),
  quotaUsageInBytes: z.number().int().nonnegative(),
}).meta({ id: 'HouseholdMemberDto' });

export class HouseholdMemberDto extends createZodDto(HouseholdMemberSchema) {}


export const HouseholdMemberCreateSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(128),
  password: z.string().min(8).max(128),
  forceAutoBalanceIfNeeded: z.boolean().optional().default(false),
}).meta({ id: 'HouseholdMemberCreateDto' });

export class HouseholdMemberCreateDto extends createZodDto(HouseholdMemberCreateSchema) {}

export const HouseholdQuotaUpdateSchema = z.object({
  quotaSizeInBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  allocation: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('auto') }),
    z.object({
      mode: z.literal('manual'),
      limits: z.record(z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
    }),
  ]),
}).meta({ id: 'HouseholdQuotaUpdateDto' });

export class HouseholdQuotaUpdateDto extends createZodDto(HouseholdQuotaUpdateSchema) {}

export class HouseholdIdParamDto extends createZodDto(z.object({ id: z.uuid() }).meta({ id: 'HouseholdIdParamDto' })) {}

export const HouseholdStoragePoolSchema = z.object({
  quotaSizeInBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).meta({ id: 'HouseholdStoragePoolDto' });

export class HouseholdStoragePoolDto extends createZodDto(HouseholdStoragePoolSchema) {}

export const HouseholdAdminSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
}).meta({ id: 'HouseholdAdminDto' });
export class HouseholdAdminDto extends createZodDto(HouseholdAdminSchema) {}
