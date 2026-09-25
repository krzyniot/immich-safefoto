import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, sql, Transaction, Updateable } from 'kysely';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { DateTime } from 'luxon';
import { InjectKysely } from 'nestjs-kysely';
import { columns } from 'src/database';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AlbumUserRole, AssetType, AssetVisibility, UserStatus } from 'src/enum';
import { DB } from 'src/schema';
import { UserTable } from 'src/schema/tables/user.table';
import { UserMetadata, UserMetadataItem } from 'src/types';
import { asUuid } from 'src/utils/database';

export interface UserListFilter {
  id?: string;
  withDeleted?: boolean;
}

export interface UserStatsQueryResponse {
  userId: string;
  userName: string;
  photos: number;
  videos: number;
  usage: number;
  usagePhotos: number;
  usageVideos: number;
  quotaSizeInBytes: number | null;
}

export interface UserFindOptions {
  withDeleted?: boolean;
}

export type UserCreate = Omit<Insertable<UserTable>, 'householdId'>;

const MAX_HOUSEHOLD_MEMBERS = 6;
const MIN_MEMBER_QUOTA_BYTES = 1024 ** 3;

const withMetadata = (eb: ExpressionBuilder<DB, 'user'>) => {
  return jsonArrayFrom(
    eb
      .selectFrom('user_metadata')
      .select(['user_metadata.key', 'user_metadata.value'])
      .whereRef('user.id', '=', 'user_metadata.userId'),
  ).as('metadata');
};

@Injectable()
export class UserRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.BOOLEAN] })
  get(userId: string, options: UserFindOptions) {
    options = options || {};

    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .where('user.id', '=', userId)
      .$if(!options.withDeleted, (eb) => eb.where('user.deletedAt', 'is', null))
      .executeTakeFirst();
  }

  getMetadata(userId: string) {
    return this.db
      .selectFrom('user_metadata')
      .select(['key', 'value'])
      .where('user_metadata.userId', '=', userId)
      .execute() as Promise<UserMetadataItem[]>;
  }

  @GenerateSql()
  getAdmin() {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .where('user.isAdmin', '=', true)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql()
  getFileSamples() {
    return this.db
      .selectFrom('user')
      .select(['id', 'profileImagePath'])
      .where('profileImagePath', '!=', sql.lit(''))
      .limit(sql.lit(3))
      .execute();
  }

  @GenerateSql()
  async hasAdmin(): Promise<boolean> {
    const admin = await this.db
      .selectFrom('user')
      .select('user.id')
      .where('user.isAdmin', '=', true)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();

    return !!admin;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getForPinCode(id: string) {
    return this.db
      .selectFrom('user')
      .select(['user.pinCode', 'user.password'])
      .where('user.id', '=', id)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getForChangePassword(id: string) {
    return this.db
      .selectFrom('user')
      .select(['user.id', 'user.password'])
      .where('user.id', '=', id)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.EMAIL] })
  getByEmail(email: string, options?: { withPassword?: boolean }) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .$if(!!options?.withPassword, (eb) => eb.select('password'))
      .where('email', '=', email)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.STRING] })
  getByStorageLabel(storageLabel: string) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .where('user.storageLabel', '=', storageLabel)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DummyValue.STRING] })
  getByOAuthId(oauthId: string) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .where('user.oauthId', '=', oauthId)
      .where('user.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  @GenerateSql({ params: [DateTime.now().minus({ years: 1 })] })
  getDeletedAfter(target: DateTime) {
    return this.db.selectFrom('user').select(['id']).where('user.deletedAt', '<', target.toJSDate()).execute();
  }

  @GenerateSql(
    { name: 'with deleted', params: [{ withDeleted: true }] },
    { name: 'without deleted', params: [{ withDeleted: false }] },
  )
  getList({ id, withDeleted }: UserListFilter = {}) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .$if(!withDeleted, (eb) => eb.where('user.deletedAt', 'is', null))
      .$if(!!id, (eb) => eb.where('user.id', '=', id!))
      .orderBy('createdAt', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getByHousehold(userId: string) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .where('user.deletedAt', 'is', null)
      .where('user.householdId', '=', (eb) =>
        eb
          .selectFrom('user as requester')
          .select('requester.householdId')
          .where('requester.id', '=', userId)
          .where('requester.deletedAt', 'is', null),
      )
      .orderBy('createdAt', 'desc')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getInHousehold(userId: string, targetUserId: string) {
    return this.db
      .selectFrom('user')
      .select(columns.userAdmin)
      .select(withMetadata)
      .where('user.id', '=', targetUserId)
      .where('user.deletedAt', 'is', null)
      .where('user.householdId', '=', (eb) =>
        eb
          .selectFrom('user as requester')
          .select('requester.householdId')
          .where('requester.id', '=', userId)
          .where('requester.deletedAt', 'is', null),
      )
      .executeTakeFirst();
  }

  async create(dto: UserCreate) {
    return this.db.transaction().execute(async (tx) => {
      const household = await tx.insertInto('household').defaultValues().returning('id').executeTakeFirstOrThrow();

      return tx
        .insertInto('user')
        .values({ ...dto, householdId: household.id, isHouseholdAdmin: true })
        .returning(columns.userAdmin)
        .returning(withMetadata)
        .executeTakeFirstOrThrow();
    });
  }

  async createHouseholdMember(adminId: string, dto: UserCreate, forceAutoBalanceIfNeeded = false) {
    return this.db.transaction().execute(async (tx) => {
      const admin = await tx
        .selectFrom('user')
        .select(['householdId', 'isHouseholdAdmin'])
        .where('id', '=', adminId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!admin?.isHouseholdAdmin) {
        throw new ForbiddenException('Household admin required');
      }

      const household = await tx
        .selectFrom('household')
        .select(['quotaSizeInBytes', 'isQuotaAutoBalanced'])
        .where('id', '=', admin.householdId)
        .forUpdate()
        .executeTakeFirst();
      if (!household) {
        throw new NotFoundException('Household not found');
      }

      const members = await tx
        .selectFrom('user')
        .select(['id', 'quotaSizeInBytes', 'quotaUsageInBytes'])
        .where('householdId', '=', admin.householdId)
        .where('deletedAt', 'is', null)
        .orderBy('createdAt')
        .orderBy('id')
        .execute();
      if (members.length >= MAX_HOUSEHOLD_MEMBERS) {
        throw new BadRequestException('Household is full');
      }

      let memberQuota: number | null = null;
      let autoBalance = household.isQuotaAutoBalanced;
      if (household.quotaSizeInBytes !== null) {
        const pool = Number(household.quotaSizeInBytes);
        if (!autoBalance) {
          const allocated = members.reduce((sum, member) => sum + Number(member.quotaSizeInBytes ?? 0), 0);
          memberQuota = MIN_MEMBER_QUOTA_BYTES;
          if (pool - allocated < memberQuota) {
            if (!forceAutoBalanceIfNeeded) {
              throw new BadRequestException('Manual household quota has no free space; auto balance required');
            }
            autoBalance = true;
            memberQuota = null;
            await tx.updateTable('household').set({ isQuotaAutoBalanced: true }).where('id', '=', admin.householdId).execute();
          }
        }

        if (autoBalance) {
          const share = Math.floor(pool / (members.length + 1));
          if (share < MIN_MEMBER_QUOTA_BYTES || members.some((member) => Number(member.quotaUsageInBytes) > share)) {
            throw new BadRequestException('Household quota cannot accommodate another member');
          }
        }
      }

      const user = await tx
        .insertInto('user')
        .values({ ...dto, householdId: admin.householdId, isHouseholdAdmin: false, quotaSizeInBytes: memberQuota })
        .returning(columns.userAdmin)
        .returning(withMetadata)
        .executeTakeFirstOrThrow();

      if (autoBalance) {
        await this.rebalanceHousehold(tx, admin.householdId);
      }
      return user;
    });
  }

  getHouseholdId(userId: string) {
    return this.db
      .selectFrom('user')
      .select('householdId')
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async getOwnHouseholdSummary(userId: string) {
    const household = await this.db.selectFrom('user')
      .innerJoin('household', 'household.id', 'user.householdId')
      .select(['household.id as householdId', 'user.isHouseholdAdmin',
        'household.quotaSizeInBytes', 'household.isQuotaAutoBalanced'])
      .select((eb) => eb.selectFrom('user as member').select(eb.fn.countAll<number>().as('count'))
        .whereRef('member.householdId', '=', 'user.householdId')
        .where('member.deletedAt', 'is', null).as('memberCount'))
      .where('user.id', '=', userId).where('user.deletedAt', 'is', null).executeTakeFirst();
    if (!household) {
      throw new NotFoundException('Household not found');
    }
    return { ...household, quotaSizeInBytes: household.quotaSizeInBytes === null
      ? null : Number(household.quotaSizeInBytes), memberCount: Number(household.memberCount) };
  }

  async getOwnHouseholdAdmin(userId: string) {
    const actor = await this.db.selectFrom('user').select('householdId')
      .where('id', '=', userId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!actor) {
      throw new BadRequestException('Household is unavailable');
    }
    const admin = await this.db.selectFrom('user').select(['id', 'name', 'email'])
      .where('householdId', '=', actor.householdId).where('isHouseholdAdmin', '=', true)
      .where('deletedAt', 'is', null).executeTakeFirst();
    if (!admin) {
      throw new BadRequestException('Household admin is unavailable');
    }
    return admin;
  }

  async getOwnHouseholdMembers(userId: string) {
    const actor = await this.db.selectFrom('user').select('householdId')
      .where('id', '=', userId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!actor) {
      throw new NotFoundException('Household not found');
    }
    const members = await this.db.selectFrom('user')
      .select(['id', 'name', 'email', 'isHouseholdAdmin', 'quotaSizeInBytes', 'quotaUsageInBytes'])
      .where('householdId', '=', actor.householdId)
      .where('deletedAt', 'is', null)
      .orderBy('isHouseholdAdmin', 'desc')
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return members.map((member) => ({
      ...member,
      quotaSizeInBytes: member.quotaSizeInBytes === null ? null : Number(member.quotaSizeInBytes),
      quotaUsageInBytes: Number(member.quotaUsageInBytes),
    }));
  }

  async getHouseholdUsage(householdId: string) {
    const members = await this.db.selectFrom('user').select('quotaUsageInBytes')
      .where('householdId', '=', householdId).where('deletedAt', 'is', null).execute();
    return members.reduce((sum, member) => sum + Number(member.quotaUsageInBytes), 0);
  }

  // Internal domain operation for a future authenticated billing integration; no public route is exposed.
  async setHouseholdStoragePool(householdId: string, pool: number) {
    this.validateHouseholdPool(pool);
    return this.db.transaction().execute(async (tx) => {
      const household = await tx.selectFrom('household').select('isQuotaAutoBalanced')
        .where('id', '=', householdId).forUpdate().executeTakeFirst();
      if (!household) {
        throw new NotFoundException('Household not found');
      }
      if (!household.isQuotaAutoBalanced) {
        const members = await tx.selectFrom('user').select(['quotaSizeInBytes', 'quotaUsageInBytes'])
          .where('householdId', '=', householdId).where('deletedAt', 'is', null).execute();
        const assigned = members.reduce((sum, member) => sum + Number(member.quotaSizeInBytes ?? 0), 0);
        if (assigned > pool || members.some((member) =>
          Number(member.quotaSizeInBytes ?? 0) < Math.max(MIN_MEMBER_QUOTA_BYTES, Number(member.quotaUsageInBytes)))) {
          throw new BadRequestException('Member quotas exceed household quota or current usage');
        }
      }
      await this.applyHouseholdPool(tx, householdId, pool, household.isQuotaAutoBalanced);
    });
  }

  private validateHouseholdPool(pool: number) {
    if (!Number.isSafeInteger(pool) || pool < MIN_MEMBER_QUOTA_BYTES) {
      throw new BadRequestException('Invalid household quota');
    }
  }

  private async applyHouseholdPool(tx: Transaction<DB>, householdId: string, pool: number, auto: boolean) {
    await tx.updateTable('household').set({ quotaSizeInBytes: pool, isQuotaAutoBalanced: auto })
      .where('id', '=', householdId).execute();
    if (auto) {
      await this.rebalanceHousehold(tx, householdId);
    }
  }

  async setHouseholdQuota(
    adminId: string,
    pool: number,
    allocation: { mode: 'auto' } | { mode: 'manual'; limits: Record<string, number> },
  ) {
    this.validateHouseholdPool(pool);
    return this.db.transaction().execute(async (tx) => {
      const actor = await tx.selectFrom('user').select('householdId').where('id', '=', adminId).executeTakeFirst();
      if (!actor) {
        throw new ForbiddenException('Household admin required');
      }
      await tx
        .selectFrom('household')
        .select('id')
        .where('id', '=', actor.householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const admin = await tx
        .selectFrom('user')
        .select('id')
        .where('id', '=', adminId)
        .where('householdId', '=', actor.householdId)
        .where('isHouseholdAdmin', '=', true)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!admin) {
        throw new ForbiddenException('Household admin required');
      }
      const members = await tx
        .selectFrom('user')
        .select(['id', 'quotaUsageInBytes'])
        .where('householdId', '=', actor.householdId)
        .where('deletedAt', 'is', null)
        .orderBy('createdAt')
        .orderBy('id')
        .execute();
      if (allocation.mode === 'manual') {
        const ids = Object.keys(allocation.limits);
        if (ids.length !== members.length || ids.some((id) => !members.some((member) => member.id === id))) {
          throw new BadRequestException('Limits must cover exactly the household members');
        }
        let total = 0;
        for (const member of members) {
          const limit = allocation.limits[member.id];
          if (
            !Number.isSafeInteger(limit) ||
            limit < Math.max(MIN_MEMBER_QUOTA_BYTES, Number(member.quotaUsageInBytes))
          ) {
            throw new BadRequestException('Member quota is below the minimum or current usage');
          }
          total += limit;
        }
        if (!Number.isSafeInteger(total) || total > pool) {
          throw new BadRequestException('Member quotas exceed household quota');
        }
        for (const member of members) {
          await tx
            .updateTable('user')
            .set({ quotaSizeInBytes: allocation.limits[member.id] })
            .where('id', '=', member.id)
            .execute();
        }
      }
      await this.applyHouseholdPool(tx, actor.householdId, pool, allocation.mode === 'auto');
    });
  }

  async transferHouseholdAdmin(adminId: string, successorId: string) {
    return this.db.transaction().execute(async (tx) => {
      const actor = await tx.selectFrom('user').select('householdId').where('id', '=', adminId).executeTakeFirst();
      if (!actor) {
        throw new ForbiddenException('Household admin required');
      }
      await tx
        .selectFrom('household')
        .select('id')
        .where('id', '=', actor.householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const members = await tx
        .selectFrom('user')
        .select(['id', 'isHouseholdAdmin'])
        .where('householdId', '=', actor.householdId)
        .where('deletedAt', 'is', null)
        .where('id', 'in', [adminId, successorId])
        .execute();
      if (!members.some((member) => member.id === adminId && member.isHouseholdAdmin)) {
        throw new ForbiddenException('Household admin required');
      }
      if (!members.some((member) => member.id === successorId)) {
        throw new BadRequestException('Successor must belong to the household');
      }
      if (adminId === successorId) {
        return;
      }
      await tx.updateTable('user').set({ isHouseholdAdmin: false }).where('id', '=', adminId).execute();
      await tx.updateTable('user').set({ isHouseholdAdmin: true }).where('id', '=', successorId).execute();
    });
  }

  async createHouseholdInvitation(adminId: string, inviteeId: string) {
    return this.db.transaction().execute(async (tx) => {
      const admin = await tx.selectFrom('user').select('householdId').where('id', '=', adminId)
        .where('deletedAt', 'is', null).executeTakeFirst();
      if (!admin) {
        throw new ForbiddenException('Household admin required');
      }
      await tx.selectFrom('household').select('id').where('id', '=', admin.householdId)
        .forUpdate().executeTakeFirstOrThrow();
      const actor = await tx.selectFrom('user').select('isHouseholdAdmin').where('id', '=', adminId)
        .where('householdId', '=', admin.householdId).where('deletedAt', 'is', null).executeTakeFirst();
      if (!actor?.isHouseholdAdmin) {
        throw new ForbiddenException('Household admin required');
      }
      const invitee = await tx.selectFrom('user').select('householdId').where('id', '=', inviteeId)
        .where('deletedAt', 'is', null).executeTakeFirst();
      if (!invitee || invitee.householdId === admin.householdId) {
        throw new BadRequestException('Invitee must be an active user outside the household');
      }
      const members = await tx.selectFrom('user').select('id').where('householdId', '=', admin.householdId)
        .where('deletedAt', 'is', null).execute();
      if (members.length >= MAX_HOUSEHOLD_MEMBERS) {
        throw new BadRequestException('Household is full');
      }
      const pending = await tx.selectFrom('household_invitation').select('id')
        .where('householdId', '=', admin.householdId).where('inviteeId', '=', inviteeId)
        .where('status', '=', 'PENDING').executeTakeFirst();
      if (pending) {
        throw new BadRequestException('Household invitation already pending');
      }
      return tx.insertInto('household_invitation')
        .values({ householdId: admin.householdId, adminId, inviteeId, status: 'PENDING' })
        .returningAll().executeTakeFirstOrThrow();
    });
  }

  listHouseholdInvitations(inviteeId: string) {
    return this.db.selectFrom('household_invitation').selectAll()
      .where('inviteeId', '=', inviteeId).where('status', '=', 'PENDING').execute();
  }

  async listOutgoingHouseholdInvitations(adminId: string) {
    const admin = await this.db.selectFrom('user').select(['householdId', 'isHouseholdAdmin'])
      .where('id', '=', adminId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!admin?.isHouseholdAdmin) {
      throw new ForbiddenException('Household admin required');
    }
    return this.db.selectFrom('household_invitation as invitation')
      .innerJoin('user as invitee', 'invitee.id', 'invitation.inviteeId')
      .innerJoin('user as admin', 'admin.id', 'invitation.adminId')
      .select([
        'invitation.id', 'invitation.householdId', 'invitation.status', 'invitation.createdAt',
        'invitee.id as inviteeId', 'invitee.name as inviteeName', 'invitee.email as inviteeEmail',
        'admin.id as adminId', 'admin.name as adminName', 'admin.email as adminEmail',
      ])
      .where('invitation.householdId', '=', admin.householdId)
      .where('invitation.status', '=', 'PENDING')
      .orderBy('invitation.createdAt', 'desc')
      .execute();
  }

  async listIncomingHouseholdInvitations(inviteeId: string) {
    return this.db.selectFrom('household_invitation as invitation')
      .innerJoin('user as invitee', 'invitee.id', 'invitation.inviteeId')
      .innerJoin('user as admin', 'admin.id', 'invitation.adminId')
      .select([
        'invitation.id', 'invitation.householdId', 'invitation.status', 'invitation.createdAt',
        'invitee.id as inviteeId', 'invitee.name as inviteeName', 'invitee.email as inviteeEmail',
        'admin.id as adminId', 'admin.name as adminName', 'admin.email as adminEmail',
      ])
      .where('invitation.inviteeId', '=', inviteeId)
      .where('invitation.status', '=', 'PENDING')
      .orderBy('invitation.createdAt', 'desc')
      .execute();
  }

  async getHouseholdInvitationPreview(inviteeId: string, invitationId: string) {
    const invitation = await this.db.selectFrom('household_invitation').select(['householdId', 'status'])
      .where('id', '=', invitationId).where('inviteeId', '=', inviteeId).executeTakeFirst();
    const user = await this.db.selectFrom('user').select(['householdId', 'isHouseholdAdmin'])
      .where('id', '=', inviteeId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!invitation || !user || invitation.status !== 'PENDING') {
      throw new BadRequestException('Household invitation is unavailable');
    }
    const otherMember = await this.db.selectFrom('user').select('id')
      .where('householdId', '=', user.householdId).where('id', '!=', inviteeId)
      .where('deletedAt', 'is', null).executeTakeFirst();
    return {
      currentHouseholdId: user.householdId,
      targetHouseholdId: invitation.householdId,
      requiresAdminTransfer: user.isHouseholdAdmin && !!otherMember,
    };
  }

  async rejectHouseholdInvitation(inviteeId: string, invitationId: string) {
    const updated = await this.db.updateTable('household_invitation')
      .set({ status: 'REJECTED', resolvedAt: new Date() })
      .where('id', '=', invitationId).where('inviteeId', '=', inviteeId).where('status', '=', 'PENDING')
      .returning('id').executeTakeFirst();
    if (!updated) {
      throw new BadRequestException('Household invitation is unavailable');
    }
  }

  async cancelHouseholdInvitation(adminId: string, invitationId: string) {
    return this.db.transaction().execute(async (tx) => {
      const invitation = await tx.selectFrom('household_invitation').select(['householdId', 'status'])
        .where('id', '=', invitationId).executeTakeFirst();
      if (!invitation || invitation.status !== 'PENDING') {
        throw new BadRequestException('Household invitation is unavailable');
      }
      await tx.selectFrom('household').select('id').where('id', '=', invitation.householdId)
        .forUpdate().executeTakeFirstOrThrow();
      const admin = await tx.selectFrom('user').select('id').where('id', '=', adminId)
        .where('householdId', '=', invitation.householdId).where('isHouseholdAdmin', '=', true)
        .where('deletedAt', 'is', null).executeTakeFirst();
      if (!admin) {
        throw new ForbiddenException('Household admin required');
      }
      const updated = await tx.updateTable('household_invitation')
        .set({ status: 'CANCELLED', resolvedAt: new Date() })
        .where('id', '=', invitationId).where('status', '=', 'PENDING').returning('id').executeTakeFirst();
      if (!updated) {
        throw new BadRequestException('Household invitation is unavailable');
      }
    });
  }

  async acceptHouseholdInvitation(inviteeId: string, invitationId: string) {
    return this.db.transaction().execute(async (tx) => {
      const invitation = await tx.selectFrom('household_invitation')
        .select(['householdId', 'adminId', 'status', 'inviteeId'])
        .where('id', '=', invitationId).forUpdate().executeTakeFirst();
      if (!invitation || invitation.inviteeId !== inviteeId || invitation.status !== 'PENDING') {
        throw new BadRequestException('Household invitation is unavailable');
      }
      const invitee = await tx.selectFrom('user').select(['id', 'householdId'])
        .where('id', '=', inviteeId).where('deletedAt', 'is', null).forUpdate().executeTakeFirst();
      if (!invitee || invitee.householdId === invitation.householdId) {
        throw new BadRequestException('Invitee must be an active user outside the household');
      }
      const target = await tx.selectFrom('household').select('id').where('id', '=', invitation.householdId)
        .executeTakeFirst();
      if (!target) {
        throw new BadRequestException('Target household no longer exists');
      }
      const admin = await tx.selectFrom('user').select('id').where('id', '=', invitation.adminId)
        .where('householdId', '=', invitation.householdId).where('isHouseholdAdmin', '=', true)
        .where('deletedAt', 'is', null).executeTakeFirst();
      if (!admin) {
        throw new BadRequestException('Inviting admin no longer administers the household');
      }
      const moved = await this.moveUserToHousehold(tx, invitee, invitation.householdId);
      await tx.updateTable('household_invitation').set({ status: 'ACCEPTED', resolvedAt: new Date() })
        .where('id', '=', invitationId).execute();
      return moved;
    });
  }

  async moveToHouseholdOf(userId: string, householdMemberId: string) {
    return this.db.transaction().execute(async (tx) => {
      const household = await tx
        .selectFrom('user')
        .select('householdId')
        .where('id', '=', householdMemberId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      const user = await tx
        .selectFrom('user')
        .select(['id', 'householdId', 'quotaUsageInBytes'])
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      if (!household || !user) {
        return;
      }

      return this.moveUserToHousehold(tx, user, household.householdId);
    });
  }

  async removeHouseholdMember(adminId: string, memberId: string) {
    if (adminId === memberId) {
      throw new BadRequestException('Household admin cannot remove self');
    }
    return this.db.transaction().execute(async (tx) => {
      const admin = await tx
        .selectFrom('user')
        .select(['id', 'householdId', 'isHouseholdAdmin'])
        .where('id', '=', adminId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!admin?.isHouseholdAdmin) {
        throw new ForbiddenException('Household admin required');
      }
      const member = await tx
        .selectFrom('user')
        .select(['id', 'householdId', 'isHouseholdAdmin', 'quotaUsageInBytes'])
        .where('id', '=', memberId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!member || member.householdId !== admin.householdId) {
        throw new BadRequestException('Member must belong to the household');
      }
      if (member.isHouseholdAdmin) {
        throw new BadRequestException('Household admin cannot be removed');
      }
      const household = await tx.insertInto('household').defaultValues().returning('id').executeTakeFirstOrThrow();
      const moved = await this.moveUserToHousehold(tx, member, household.id);
      if (moved) {
        await this.applyStandaloneHoldingQuota(tx, household.id, member.id, Number(member.quotaUsageInBytes));
      }
      return moved;
    });
  }

  async moveToNewHousehold(userId: string) {
    return this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('user')
        .select(['id', 'householdId', 'quotaUsageInBytes'])
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      if (!user) {
        return;
      }

      const otherHouseholdMember = await tx
        .selectFrom('user')
        .select('id')
        .where('householdId', '=', user.householdId)
        .where('id', '!=', userId)
        .executeTakeFirst();
      if (!otherHouseholdMember) {
        return user;
      }

      const household = await tx.insertInto('household').defaultValues().returning('id').executeTakeFirstOrThrow();
      const moved = await this.moveUserToHousehold(tx, user, household.id);
      if (moved) {
        await this.applyStandaloneHoldingQuota(tx, household.id, user.id, Number(user.quotaUsageInBytes));
      }
      return moved;
    });
  }

  private async applyStandaloneHoldingQuota(
    tx: Transaction<DB>,
    householdId: string,
    userId: string,
    usageBytes: number,
  ) {
    const holdingQuota = Math.max(1, Number.isSafeInteger(usageBytes) && usageBytes >= 0 ? usageBytes : 0);
    await tx
      .updateTable('household')
      .set({ quotaSizeInBytes: holdingQuota, isQuotaAutoBalanced: true })
      .where('id', '=', householdId)
      .execute();
    await tx
      .updateTable('user')
      .set({ quotaSizeInBytes: holdingQuota })
      .where('id', '=', userId)
      .where('householdId', '=', householdId)
      .execute();
  }

  private async moveUserToHousehold(
    tx: Transaction<DB>,
    user: { id: string; householdId: string },
    targetHouseholdId: string,
  ) {
    if (user.householdId === targetHouseholdId) {
      return user;
    }

    // Serialize membership and quota changes for both households.
    await tx
      .selectFrom('household')
      .select('id')
      .where('id', 'in', [user.householdId, targetHouseholdId])
      .orderBy('id')
      .forUpdate()
      .execute();

    const target = await tx
      .selectFrom('household')
      .select(['quotaSizeInBytes', 'isQuotaAutoBalanced'])
      .where('id', '=', targetHouseholdId)
      .executeTakeFirstOrThrow();
    const targetMembers = await tx
      .selectFrom('user')
      .select(['id', 'quotaSizeInBytes', 'quotaUsageInBytes'])
      .where('householdId', '=', targetHouseholdId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    if (targetMembers.length >= MAX_HOUSEHOLD_MEMBERS) {
      throw new BadRequestException('Household is full');
    }
    const moving = await tx
      .selectFrom('user')
      .select(['isHouseholdAdmin', 'quotaUsageInBytes'])
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    let memberQuota: number | null = null;
    if (target.quotaSizeInBytes !== null) {
      const pool = Number(target.quotaSizeInBytes);
      if (target.isQuotaAutoBalanced) {
        const share = Math.floor(pool / (targetMembers.length + 1));
        if (
          share < MIN_MEMBER_QUOTA_BYTES ||
          [...targetMembers, moving].some((member) => Number(member.quotaUsageInBytes) > share)
        ) {
          throw new BadRequestException('Household quota cannot accommodate another member');
        }
      } else {
        const used = targetMembers.reduce((sum, member) => sum + Number(member.quotaSizeInBytes ?? 0), 0);
        memberQuota = Math.max(MIN_MEMBER_QUOTA_BYTES, Number(moving.quotaUsageInBytes));
        if (pool - used < memberQuota) {
          throw new BadRequestException('Free household quota is insufficient for a new member');
        }
      }
    }

    if (moving.isHouseholdAdmin) {
      const remainingMember = await tx
        .selectFrom('user')
        .select('id')
        .where('householdId', '=', user.householdId)
        .where('id', '!=', user.id)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (remainingMember) {
        throw new BadRequestException('Household admin must transfer administration before leaving');
      }
    }

    const affectedUserIds = new Set<string>([user.id]);

    const partners = await tx
      .selectFrom('partner')
      .select(['sharedById', 'sharedWithId'])
      .where((eb) => eb.or([eb('sharedById', '=', user.id), eb('sharedWithId', '=', user.id)]))
      .execute();
    for (const partner of partners) {
      affectedUserIds.add(partner.sharedById);
      affectedUserIds.add(partner.sharedWithId);
    }

    const albumMemberships = await tx
      .selectFrom('album_user as membership')
      .innerJoin('album_user as owner', (join) =>
        join.onRef('owner.albumId', '=', 'membership.albumId').on('owner.role', '=', AlbumUserRole.Owner),
      )
      .select(['membership.albumId', 'owner.userId as ownerId'])
      .where('membership.userId', '=', user.id)
      .where('membership.role', '!=', AlbumUserRole.Owner)
      .execute();
    for (const membership of albumMemberships) {
      affectedUserIds.add(membership.ownerId);
    }

    const ownedAlbumMembers = await tx
      .selectFrom('album_user as owner')
      .innerJoin('album_user as member', 'member.albumId', 'owner.albumId')
      .select(['member.userId'])
      .where('owner.userId', '=', user.id)
      .where('owner.role', '=', AlbumUserRole.Owner)
      .where('member.role', '!=', AlbumUserRole.Owner)
      .execute();
    for (const member of ownedAlbumMembers) {
      affectedUserIds.add(member.userId);
    }

    await tx
      .deleteFrom('partner')
      .where((eb) => eb.or([eb('sharedById', '=', user.id), eb('sharedWithId', '=', user.id)]))
      .execute();
    await tx.deleteFrom('album_user').where('userId', '=', user.id).where('role', '!=', AlbumUserRole.Owner).execute();
    await tx
      .deleteFrom('album_user')
      .where('albumId', 'in', (eb) =>
        eb
          .selectFrom('album_user as owner')
          .select('owner.albumId')
          .where('owner.userId', '=', user.id)
          .where('owner.role', '=', AlbumUserRole.Owner),
      )
      .where('role', '!=', AlbumUserRole.Owner)
      .execute();

    const updated = await tx
      .updateTable('user')
      .set({ householdId: targetHouseholdId, isHouseholdAdmin: false, quotaSizeInBytes: memberQuota })
      .where('id', '=', user.id)
      .where('deletedAt', 'is', null)
      .returning(['id', 'householdId'])
      .executeTakeFirst();

    if (!updated) {
      return;
    }

    await tx
      .updateTable('session')
      .set({ isPendingSyncReset: true })
      .where('userId', 'in', [...affectedUserIds])
      .execute();

    const oldHouseholdStillUsed = await tx
      .selectFrom('user')
      .select('id')
      .where('householdId', '=', user.householdId)
      .executeTakeFirst();
    if (!oldHouseholdStillUsed) {
      await tx.deleteFrom('household').where('id', '=', user.householdId).execute();
    } else {
      await this.rebalanceHousehold(tx, user.householdId);
    }

    // A newly created household has no admin until its first member arrives.
    if (targetMembers.length === 0) {
      await tx.updateTable('user').set({ isHouseholdAdmin: true }).where('id', '=', user.id).execute();
    }
    await this.rebalanceHousehold(tx, targetHouseholdId);

    return updated;
  }

  private async rebalanceHousehold(tx: Transaction<DB>, householdId: string) {
    const household = await tx
      .selectFrom('household')
      .select(['quotaSizeInBytes', 'isQuotaAutoBalanced'])
      .where('id', '=', householdId)
      .executeTakeFirst();
    if (!household || !household.isQuotaAutoBalanced || household.quotaSizeInBytes === null) {
      return;
    }
    const members = await tx
      .selectFrom('user')
      .select(['id', 'quotaUsageInBytes'])
      .where('householdId', '=', householdId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    if (!members.length) {
      return;
    }
    const pool = Number(household.quotaSizeInBytes);
    const share = Math.floor(pool / members.length);
    if (share < MIN_MEMBER_QUOTA_BYTES || members.some((member) => Number(member.quotaUsageInBytes) > share)) {
      throw new BadRequestException('Household quota cannot be divided among members');
    }
    const remainder = pool % members.length;
    for (const [index, member] of members.entries()) {
      const quotaSizeInBytes = share + (index < remainder ? 1 : 0);
      await tx.updateTable('user').set({ quotaSizeInBytes }).where('id', '=', member.id).execute();
    }
  }

  async update(id: string, dto: Updateable<UserTable>) {
    if (dto.quotaSizeInBytes !== undefined) {
      const household = await this.db
        .selectFrom('user')
        .innerJoin('household', 'household.id', 'user.householdId')
        .select('household.quotaSizeInBytes')
        .where('user.id', '=', asUuid(id))
        .executeTakeFirst();
      if (household?.quotaSizeInBytes !== null && household?.quotaSizeInBytes !== undefined) {
        throw new BadRequestException('Manage member limits through the household quota');
      }
    }
    return this.db
      .updateTable('user')
      .set(dto)
      .where('user.id', '=', asUuid(id))
      .where('user.deletedAt', 'is', null)
      .returning(columns.userAdmin)
      .returning(withMetadata)
      .executeTakeFirstOrThrow();
  }

  async updateAll(dto: Updateable<UserTable>) {
    await this.db.updateTable('user').set(dto).execute();
  }

  restore(id: string) {
    return this.db
      .updateTable('user')
      .set({ status: UserStatus.Active, deletedAt: null })
      .where('user.id', '=', asUuid(id))
      .returning(columns.userAdmin)
      .returning(withMetadata)
      .executeTakeFirstOrThrow();
  }

  async upsertMetadata<T extends keyof UserMetadata>(id: string, { key, value }: { key: T; value: UserMetadata[T] }) {
    await this.db
      .insertInto('user_metadata')
      .values({ userId: id, key, value })
      .onConflict((oc) =>
        oc.columns(['userId', 'key']).doUpdateSet({
          key,
          value,
        }),
      )
      .execute();
  }

  async deleteMetadata<T extends keyof UserMetadata>(id: string, key: T) {
    await this.db.deleteFrom('user_metadata').where('userId', '=', id).where('key', '=', key).execute();
  }

  async delete(user: { id: string }, hard?: boolean) {
    if (!hard) {
      return this.db.updateTable('user').set({ deletedAt: new Date() }).where('id', '=', user.id).execute();
    }

    return this.db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('user')
        .select('householdId')
        .where('id', '=', user.id)
        .forUpdate()
        .executeTakeFirst();
      if (!existing) {
        return [];
      }

      const result = await tx.deleteFrom('user').where('id', '=', user.id).execute();
      const householdStillUsed = await tx
        .selectFrom('user')
        .select('id')
        .where('householdId', '=', existing.householdId)
        .executeTakeFirst();
      if (!householdStillUsed) {
        await tx.deleteFrom('household').where('id', '=', existing.householdId).execute();
      }

      return result;
    });
  }

  @GenerateSql()
  getUserStats() {
    return this.db
      .selectFrom('user')
      .leftJoin('asset', (join) => join.onRef('asset.ownerId', '=', 'user.id').on('asset.deletedAt', 'is', null))
      .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
      .select(['user.id as userId', 'user.name as userName', 'user.quotaSizeInBytes'])
      .select((eb) => [
        eb.fn
          .countAll<number>()
          .filterWhere((eb) =>
            eb.and([
              eb('asset.type', '=', sql.lit(AssetType.Image)),
              eb('asset.visibility', '!=', sql.lit(AssetVisibility.Hidden)),
            ]),
          )
          .as('photos'),
        eb.fn
          .countAll<number>()
          .filterWhere((eb) =>
            eb.and([
              eb('asset.type', '=', sql.lit(AssetType.Video)),
              eb('asset.visibility', '!=', sql.lit(AssetVisibility.Hidden)),
            ]),
          )
          .as('videos'),
        eb.fn
          .coalesce(
            eb.fn.sum<number>('asset_exif.fileSizeInByte').filterWhere('asset.libraryId', 'is', null),
            eb.lit(0),
          )
          .as('usage'),
        eb.fn
          .coalesce(
            eb.fn
              .sum<number>('asset_exif.fileSizeInByte')
              .filterWhere((eb) =>
                eb.and([eb('asset.libraryId', 'is', null), eb('asset.type', '=', sql.lit(AssetType.Image))]),
              ),
            eb.lit(0),
          )
          .as('usagePhotos'),
        eb.fn
          .coalesce(
            eb.fn
              .sum<number>('asset_exif.fileSizeInByte')
              .filterWhere((eb) =>
                eb.and([eb('asset.libraryId', 'is', null), eb('asset.type', '=', sql.lit(AssetType.Video))]),
              ),
            eb.lit(0),
          )
          .as('usageVideos'),
      ])
      .groupBy('user.id')
      .orderBy('user.createdAt', 'asc')
      .execute();
  }

  @GenerateSql()
  async getCount(): Promise<number> {
    const result = await this.db
      .selectFrom('user')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('user.deletedAt', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.NUMBER] })
  async updateUsage(id: string, delta: number): Promise<void> {
    await this.db
      .updateTable('user')
      .set({ quotaUsageInBytes: sql`"quotaUsageInBytes" + ${delta}`, updatedAt: new Date() })
      .where('id', '=', asUuid(id))
      .where('user.deletedAt', 'is', null)
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async syncUsage(id?: string) {
    const query = this.db
      .updateTable('user')
      .set({
        quotaUsageInBytes: (eb) =>
          eb
            .selectFrom('asset')
            .leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id')
            .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('asset_exif.fileSizeInByte'), eb.lit(0)).as('usage'))
            .where('asset.libraryId', 'is', null)
            .where('asset.ownerId', '=', eb.ref('user.id')),
        updatedAt: new Date(),
      })
      .where('user.deletedAt', 'is', null)
      .$if(id != undefined, (eb) => eb.where('user.id', '=', asUuid(id!)));

    await query.execute();
  }
}
