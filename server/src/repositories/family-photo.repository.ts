import { BadRequestException, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { FamilyPhotoPublicationMode, FamilyPhotoQueryDto } from 'src/dtos/family-photo.dto';
import { AssetStatus, AssetType, AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';

@Injectable()
export class FamilyPhotoRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async publish(ownerId: string, assetIds: string[], mode: FamilyPhotoPublicationMode): Promise<void> {
    const ids = [...new Set(assetIds)];
    await this.db.transaction().execute(async (tx) => {
      const owner = await tx
        .selectFrom('user')
        .select('householdId')
        .where('id', '=', ownerId)
        .where('deletedAt', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!owner) {
        throw new BadRequestException('Active family owner not found');
      }

      const ownedAssets = await tx
        .selectFrom('asset')
        .select('id')
        .where('id', 'in', ids)
        .where('ownerId', '=', ownerId)
        .where('deletedAt', 'is', null)
        .where('status', '=', AssetStatus.Active)
        .where('type', '=', AssetType.Image)
        .where('visibility', '!=', AssetVisibility.Locked)
        .execute();
      if (ownedAssets.length !== ids.length) {
        throw new BadRequestException('Not found or no owner access');
      }

      if (mode === FamilyPhotoPublicationMode.Private) {
        await tx.deleteFrom('family_asset').where('assetId', 'in', ids).execute();
        return;
      }

      const now = new Date();
      await tx
        .insertInto('family_asset')
        .values(
          ids.map((assetId) => ({
            assetId,
            householdId: owner.householdId,
            hideFromPersonalTimeline: mode === FamilyPhotoPublicationMode.Move,
            publishedAt: now,
            updatedAt: now,
          })),
        )
        .onConflict((oc) =>
          oc.column('assetId').doUpdateSet({
            householdId: owner.householdId,
            hideFromPersonalTimeline: mode === FamilyPhotoPublicationMode.Move,
            updatedAt: now,
          }),
        )
        .execute();
    });
  }

  async getPage(userId: string, { page, limit }: FamilyPhotoQueryDto) {
    const offset = (page - 1) * limit;
    const base = this.db
      .selectFrom('family_asset')
      .innerJoin('asset', 'asset.id', 'family_asset.assetId')
      .innerJoin('user as owner', 'owner.id', 'asset.ownerId')
      .innerJoin('user as requester', 'requester.householdId', 'family_asset.householdId')
      .where('requester.id', '=', userId)
      .where('requester.deletedAt', 'is', null)
      .where('owner.deletedAt', 'is', null)
      .whereRef('owner.householdId', '=', 'family_asset.householdId')
      .where('asset.deletedAt', 'is', null)
      .where('asset.status', '=', AssetStatus.Active)
      .where('asset.type', '=', AssetType.Image)
      .where('asset.visibility', '!=', AssetVisibility.Locked);

    const items = await base
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
      .orderBy('asset.fileCreatedAt', 'desc')
      .orderBy('asset.id', 'desc')
      .limit(limit + 1)
      .offset(offset)
      .execute();

    const hasNextPage = items.length > limit;
    return { items: items.slice(0, limit), page, limit, nextPage: hasNextPage ? page + 1 : null };
  }
}
