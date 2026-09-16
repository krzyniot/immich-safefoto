import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AlbumUserRole } from 'src/enum';
import { DB } from 'src/schema';
import { AlbumUserTable } from 'src/schema/tables/album-user.table';

export type AlbumPermissionId = {
  albumId: string;
  userId: string;
};

@Injectable()
export class AlbumUserRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [{ userId: DummyValue.UUID, albumId: DummyValue.UUID }] })
  create({ albumId, userId, role = AlbumUserRole.Editor }: Insertable<AlbumUserTable>) {
    return this.db
      .insertInto('album_user')
      .columns(['albumId', 'userId', 'role'])
      .expression((eb) =>
        eb
          .selectFrom('album_user as ownerMembership')
          .innerJoin('user as owner', 'owner.id', 'ownerMembership.userId')
          .innerJoin('user as member', 'member.householdId', 'owner.householdId')
          .select((eb) => [eb.val(albumId).as('albumId'), eb.val(userId).as('userId'), eb.val(role).as('role')])
          .where('ownerMembership.albumId', '=', albumId)
          .where('ownerMembership.role', '=', AlbumUserRole.Owner)
          .where('member.id', '=', userId)
          .where('owner.deletedAt', 'is', null)
          .where('member.deletedAt', 'is', null),
      )
      .returning(['userId', 'albumId', 'role'])
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [{ userId: DummyValue.UUID, albumId: DummyValue.UUID }, { role: AlbumUserRole.Viewer }] })
  async update({ userId, albumId }: AlbumPermissionId, dto: Updateable<AlbumUserTable>) {
    await this.db
      .updateTable('album_user')
      .set(dto)
      .where('userId', '=', userId)
      .where('albumId', '=', albumId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('album_user as ownerMembership')
            .innerJoin('user as owner', 'owner.id', 'ownerMembership.userId')
            .innerJoin('user as member', 'member.householdId', 'owner.householdId')
            .select('ownerMembership.albumId')
            .where('ownerMembership.albumId', '=', albumId)
            .where('ownerMembership.role', '=', AlbumUserRole.Owner)
            .where('member.id', '=', userId)
            .where('owner.deletedAt', 'is', null)
            .where('member.deletedAt', 'is', null),
        ),
      )
      .execute();
  }

  @GenerateSql({ params: [{ userId: DummyValue.UUID, albumId: DummyValue.UUID }] })
  async delete({ userId, albumId }: AlbumPermissionId): Promise<void> {
    await this.db
      .deleteFrom('album_user')
      .where('userId', '=', userId)
      .where('albumId', '=', albumId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('album_user as ownerMembership')
            .innerJoin('user as owner', 'owner.id', 'ownerMembership.userId')
            .innerJoin('user as member', 'member.householdId', 'owner.householdId')
            .select('ownerMembership.albumId')
            .where('ownerMembership.albumId', '=', albumId)
            .where('ownerMembership.role', '=', AlbumUserRole.Owner)
            .where('member.id', '=', userId)
            .where('owner.deletedAt', 'is', null)
            .where('member.deletedAt', 'is', null),
        ),
      )
      .execute();
  }
}
