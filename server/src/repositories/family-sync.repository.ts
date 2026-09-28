import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { AlbumUserRole, AssetStatus, AssetType, AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';

// A bounded, one-request reconciliation snapshot. Never return a truncated manifest:
// clients must not interpret an incomplete result as a reason to evict their shared cache.
const MAX_MANIFEST_ROWS = 100_000;

@Injectable()
export class FamilySyncRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async getManifest(userId: string) {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (tx) => {
        const requester = await tx
          .selectFrom('user')
          .select('householdId')
          .where('id', '=', userId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();
        if (!requester) {
          throw new NotFoundException('Active family member not found');
        }
        const householdId = requester.householdId;

        const assets = await tx
          .selectFrom('family_asset')
          .innerJoin('asset', 'asset.id', 'family_asset.assetId')
          .innerJoin('user as owner', 'owner.id', 'asset.ownerId')
          .select([
            'asset.id',
            'asset.ownerId',
            'asset.fileCreatedAt',
            'asset.localDateTime',
            'asset.originalFileName',
            'asset.width',
            'asset.height',
            'asset.isFavorite',
            'asset.thumbhash',
            'family_asset.hideFromPersonalTimeline',
            'family_asset.updatedAt',
          ])
          .where('family_asset.householdId', '=', householdId)
          .where('owner.householdId', '=', householdId)
          .where('owner.deletedAt', 'is', null)
          .where('asset.deletedAt', 'is', null)
          .where('asset.status', '=', AssetStatus.Active)
          .where('asset.type', '=', AssetType.Image)
          .where('asset.visibility', '!=', AssetVisibility.Locked)
          .orderBy('asset.id', 'asc')
          .limit(MAX_MANIFEST_ROWS + 1)
          .execute();
        if (assets.length > MAX_MANIFEST_ROWS) {
          throw new PayloadTooLargeException('Family photo manifest exceeds the supported size');
        }

        const albums = await tx
          .selectFrom('family_album')
          .innerJoin('album', 'album.id', 'family_album.albumId')
          .innerJoin('album_user as albumOwner', (join) =>
            join.onRef('albumOwner.albumId', '=', 'album.id').on('albumOwner.role', '=', AlbumUserRole.Owner),
          )
          .innerJoin('user as owner', 'owner.id', 'albumOwner.userId')
          .select([
            'album.id',
            'album.albumName as name',
            'album.description',
            'family_album.defaultMode',
            'family_album.updatedAt',
          ])
          .where('family_album.householdId', '=', householdId)
          .where('owner.householdId', '=', householdId)
          .where('owner.deletedAt', 'is', null)
          .where('album.deletedAt', 'is', null)
          .orderBy('album.id', 'asc')
          .limit(MAX_MANIFEST_ROWS + 1)
          .execute();
        if (albums.length > MAX_MANIFEST_ROWS) {
          throw new PayloadTooLargeException('Family album manifest exceeds the supported size');
        }

        // Album links are only included if BOTH the album and photo are currently shared
        // with this household. Stale album_asset rows cannot expose private photo IDs.
        const albumAssets = await tx
          .selectFrom('family_album')
          .innerJoin('album', 'album.id', 'family_album.albumId')
          .innerJoin('album_user as albumOwner', (join) =>
            join.onRef('albumOwner.albumId', '=', 'album.id').on('albumOwner.role', '=', AlbumUserRole.Owner),
          )
          .innerJoin('user as albumOwnerUser', 'albumOwnerUser.id', 'albumOwner.userId')
          .innerJoin('album_asset', 'album_asset.albumId', 'album.id')
          .innerJoin('asset', 'asset.id', 'album_asset.assetId')
          .innerJoin('family_asset', 'family_asset.assetId', 'asset.id')
          .innerJoin('user as photoOwner', 'photoOwner.id', 'asset.ownerId')
          .select(['album_asset.albumId', 'album_asset.assetId'])
          .where('family_album.householdId', '=', householdId)
          .where('family_asset.householdId', '=', householdId)
          .where('albumOwnerUser.householdId', '=', householdId)
          .where('albumOwnerUser.deletedAt', 'is', null)
          .where('photoOwner.householdId', '=', householdId)
          .where('photoOwner.deletedAt', 'is', null)
          .where('album.deletedAt', 'is', null)
          .where('asset.deletedAt', 'is', null)
          .where('asset.status', '=', AssetStatus.Active)
          .where('asset.type', '=', AssetType.Image)
          .where('asset.visibility', '!=', AssetVisibility.Locked)
          .orderBy('album_asset.albumId', 'asc')
          .orderBy('album_asset.assetId', 'asc')
          .limit(MAX_MANIFEST_ROWS + 1)
          .execute();
        if (albumAssets.length > MAX_MANIFEST_ROWS) {
          throw new PayloadTooLargeException('Family album membership manifest exceeds the supported size');
        }

        return {
          version: 1 as const,
          householdId,
          generatedAt: new Date().toISOString(),
          assets: assets.map((asset) => ({
            ...asset,
            fileCreatedAt: asset.fileCreatedAt.toISOString(),
            localDateTime: asset.localDateTime.toISOString(),
            name: asset.originalFileName,
            thumbHash: asset.thumbhash?.toString('base64') ?? null,
            updatedAt: asset.updatedAt.toISOString(),
          })),
          albums: albums.map((album) => ({ ...album, updatedAt: album.updatedAt.toISOString() })),
          albumAssets,
        };
      });
  }
}
