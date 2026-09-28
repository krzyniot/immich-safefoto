import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { AlbumUserRole, AssetStatus, AssetType, AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';

type AlbumMode = FamilyPhotoPublicationMode.Share | FamilyPhotoPublicationMode.Move;

@Injectable()
export class FamilyAlbumRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  private async publishAssets(tx: Kysely<DB>, ownerId: string, householdId: string, ids: string[], mode: AlbumMode) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return;
    }
    const valid = await tx
      .selectFrom('asset')
      .select('id')
      .where('id', 'in', unique)
      .where('ownerId', '=', ownerId)
      .where('deletedAt', 'is', null)
      .where('status', '=', AssetStatus.Active)
      .where('type', '=', AssetType.Image)
      .where('visibility', '!=', AssetVisibility.Locked)
      .execute();
    if (valid.length !== unique.length) {
      throw new BadRequestException('Album contains assets not publishable by this user');
    }
    const now = new Date();
    await tx
      .insertInto('family_asset')
      .values(
        unique.map((assetId) => ({
          assetId,
          householdId,
          hideFromPersonalTimeline: mode === FamilyPhotoPublicationMode.Move,
          publishedAt: now,
          updatedAt: now,
        })),
      )
      .onConflict((oc) =>
        oc.column('assetId').doUpdateSet({
          householdId,
          hideFromPersonalTimeline: mode === FamilyPhotoPublicationMode.Move,
          updatedAt: now,
        }),
      )
      .execute();
  }

  /** Publishing an existing album is atomic: either all of its photos can be published or none are. */
  async publishAlbum(userId: string, albumId: string, mode: AlbumMode) {
    await this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('user')
        .select('householdId')
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!user) {
        throw new BadRequestException('Active user not found');
      }
      const album = await tx
        .selectFrom('album')
        .innerJoin('album_user', 'album_user.albumId', 'album.id')
        .select('album.id')
        .where('album.id', '=', albumId)
        .where('album.deletedAt', 'is', null)
        .where('album_user.userId', '=', userId)
        .where('album_user.role', '=', AlbumUserRole.Owner)
        .forUpdate('album')
        .executeTakeFirst();
      if (!album) {
        throw new NotFoundException('Owned album not found');
      }
      const assets = await tx.selectFrom('album_asset').select('assetId').where('albumId', '=', albumId).execute();
      await this.publishAssets(
        tx,
        userId,
        user.householdId,
        assets.map(({ assetId }) => assetId),
        mode,
      );
      const now = new Date();
      await tx
        .insertInto('family_album')
        .values({
          albumId,
          householdId: user.householdId,
          defaultMode: mode,
          publishedAt: now,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.column('albumId').doUpdateSet({
            householdId: user.householdId,
            defaultMode: mode,
            updatedAt: now,
          }),
        )
        .execute();
    });
  }

  /** A member explicitly adds only their own images; nothing is published implicitly on upload. */
  async addPhotos(userId: string, albumId: string, ids: string[], mode: AlbumMode) {
    await this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('user')
        .select('householdId')
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!user) {
        throw new BadRequestException('Active user not found');
      }
      const album = await tx
        .selectFrom('family_album')
        .innerJoin('album', 'album.id', 'family_album.albumId')
        .innerJoin('album_user as albumOwner', (join) =>
          join.onRef('albumOwner.albumId', '=', 'album.id').on('albumOwner.role', '=', AlbumUserRole.Owner),
        )
        .innerJoin('user as owner', 'owner.id', 'albumOwner.userId')
        .select('family_album.albumId')
        .where('family_album.albumId', '=', albumId)
        .where('family_album.householdId', '=', user.householdId)
        .whereRef('owner.householdId', '=', 'family_album.householdId')
        .where('owner.deletedAt', 'is', null)
        .where('album.deletedAt', 'is', null)
        .forUpdate('family_album')
        .executeTakeFirst();
      if (!album) {
        throw new NotFoundException('Family album not found');
      }
      await this.publishAssets(tx, userId, user.householdId, ids, mode);
      await tx
        .insertInto('album_asset')
        .values([...new Set(ids)].map((assetId) => ({ albumId, assetId })))
        .onConflict((oc) => oc.columns(['albumId', 'assetId']).doNothing())
        .execute();
    });
  }

  async getAlbums(userId: string) {
    return this.db
      .selectFrom('family_album')
      .innerJoin('album', 'album.id', 'family_album.albumId')
      .innerJoin('album_user as albumOwner', (join) =>
        join.onRef('albumOwner.albumId', '=', 'album.id').on('albumOwner.role', '=', AlbumUserRole.Owner),
      )
      .innerJoin('user as owner', 'owner.id', 'albumOwner.userId')
      .innerJoin('user as requester', 'requester.householdId', 'family_album.householdId')
      .select([
        'album.id',
        'album.albumName',
        'album.description',
        'family_album.defaultMode',
        'family_album.publishedAt',
      ])
      .where('requester.id', '=', userId)
      .where('requester.deletedAt', 'is', null)
      .where('owner.deletedAt', 'is', null)
      .whereRef('owner.householdId', '=', 'family_album.householdId')
      .where('album.deletedAt', 'is', null)
      .orderBy('family_album.publishedAt', 'desc')
      .execute();
  }

  async getAlbumPhotos(userId: string, albumId: string, page: number, limit: number) {
    const offset = (page - 1) * limit;
    const items = await this.db
      .selectFrom('family_album')
      .innerJoin('album', 'album.id', 'family_album.albumId')
      .innerJoin('album_user as albumOwner', (join) =>
        join.onRef('albumOwner.albumId', '=', 'album.id').on('albumOwner.role', '=', AlbumUserRole.Owner),
      )
      .innerJoin('user as albumOwnerUser', 'albumOwnerUser.id', 'albumOwner.userId')
      .innerJoin('user as requester', 'requester.householdId', 'family_album.householdId')
      .innerJoin('album_asset', 'album_asset.albumId', 'family_album.albumId')
      .innerJoin('asset', 'asset.id', 'album_asset.assetId')
      .innerJoin('family_asset', 'family_asset.assetId', 'asset.id')
      .innerJoin('user as photoOwner', 'photoOwner.id', 'asset.ownerId')
      .select([
        'asset.id',
        'asset.ownerId',
        'asset.type',
        'asset.fileCreatedAt',
        'asset.localDateTime',
        'family_asset.hideFromPersonalTimeline',
        'family_asset.publishedAt',
        'family_asset.updatedAt',
      ])
      .where('family_album.albumId', '=', albumId)
      .where('requester.id', '=', userId)
      .where('requester.deletedAt', 'is', null)
      .where('albumOwnerUser.deletedAt', 'is', null)
      .where('photoOwner.deletedAt', 'is', null)
      .whereRef('albumOwnerUser.householdId', '=', 'family_album.householdId')
      .whereRef('photoOwner.householdId', '=', 'family_album.householdId')
      .whereRef('family_asset.householdId', '=', 'family_album.householdId')
      .where('album.deletedAt', 'is', null)
      .where('asset.deletedAt', 'is', null)
      .where('asset.status', '=', AssetStatus.Active)
      .where('asset.type', '=', AssetType.Image)
      .where('asset.visibility', '!=', AssetVisibility.Locked)
      .orderBy('asset.fileCreatedAt', 'desc')
      .orderBy('asset.id', 'desc')
      .limit(limit + 1)
      .offset(offset)
      .execute();
    return { items: items.slice(0, limit), page, limit, nextPage: items.length > limit ? page + 1 : null };
  }
}
