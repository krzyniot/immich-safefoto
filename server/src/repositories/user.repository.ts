import { Injectable } from '@nestjs/common';
import { ExpressionBuilder, Insertable, Kysely, sql, Updateable } from 'kysely';
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
        .values({ ...dto, householdId: household.id })
        .returning(columns.userAdmin)
        .returning(withMetadata)
        .executeTakeFirstOrThrow();
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
        .select(['id', 'householdId'])
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();

      if (!household || !user) {
        return;
      }

      if (user.householdId === household.householdId) {
        return user;
      }

      const affectedUserIds = new Set<string>([userId]);

      const partners = await tx
        .selectFrom('partner')
        .select(['sharedById', 'sharedWithId'])
        .where((eb) => eb.or([eb('sharedById', '=', userId), eb('sharedWithId', '=', userId)]))
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
        .where('membership.userId', '=', userId)
        .where('membership.role', '!=', AlbumUserRole.Owner)
        .execute();
      for (const membership of albumMemberships) {
        affectedUserIds.add(membership.ownerId);
      }

      const ownedAlbumMembers = await tx
        .selectFrom('album_user as owner')
        .innerJoin('album_user as member', 'member.albumId', 'owner.albumId')
        .select(['member.userId'])
        .where('owner.userId', '=', userId)
        .where('owner.role', '=', AlbumUserRole.Owner)
        .where('member.role', '!=', AlbumUserRole.Owner)
        .execute();
      for (const member of ownedAlbumMembers) {
        affectedUserIds.add(member.userId);
      }

      await tx
        .deleteFrom('partner')
        .where((eb) => eb.or([eb('sharedById', '=', userId), eb('sharedWithId', '=', userId)]))
        .execute();
      await tx.deleteFrom('album_user').where('userId', '=', userId).where('role', '!=', AlbumUserRole.Owner).execute();
      await tx
        .deleteFrom('album_user')
        .where('albumId', 'in', (eb) =>
          eb
            .selectFrom('album_user as owner')
            .select('owner.albumId')
            .where('owner.userId', '=', userId)
            .where('owner.role', '=', AlbumUserRole.Owner),
        )
        .where('role', '!=', AlbumUserRole.Owner)
        .execute();

      const updated = await tx
        .updateTable('user')
        .set({ householdId: household.householdId })
        .where('id', '=', userId)
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
      }

      return updated;
    });
  }

  update(id: string, dto: Updateable<UserTable>) {
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

  delete(user: { id: string }, hard?: boolean) {
    return hard
      ? this.db.deleteFrom('user').where('id', '=', user.id).execute()
      : this.db.updateTable('user').set({ deletedAt: new Date() }).where('id', '=', user.id).execute();
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
