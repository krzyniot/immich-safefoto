import { createZodDto } from 'nestjs-zod';
import { isoDatetimeToDate } from 'src/validation';
import z from 'zod';

export const HouseholdInvitationCreateSchema = z.object({
  email: z.email(),
}).meta({ id: 'HouseholdInvitationCreateDto' });
export class HouseholdInvitationCreateDto extends createZodDto(HouseholdInvitationCreateSchema) {}

export const HouseholdInvitationResponseSchema = z.object({
  id: z.uuid(),
  householdId: z.uuid(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED']),
  createdAt: isoDatetimeToDate,
  invitee: z.object({ id: z.uuid(), name: z.string(), email: z.email() }),
  admin: z.object({ id: z.uuid(), name: z.string(), email: z.email() }),
}).meta({ id: 'HouseholdInvitationResponseDto' });
export class HouseholdInvitationResponseDto extends createZodDto(HouseholdInvitationResponseSchema) {}
