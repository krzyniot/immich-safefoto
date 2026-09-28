import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_private_visibility.service.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/infrastructure/entities/remote_asset.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/user.entity.drift.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';

import '../../fixtures/user.stub.dart';

void main() {
  late Drift db;
  late StoreService store;
  late FamilyPrivateVisibilityService visibility;
  late FamilySyncIdentity identity;

  Future<List<String>> privateIds() async {
    final rows = await db.mergedAssetDrift.mergedAsset(userIds: [identity.userId], limit: (_) => Limit(20, 0)).get();
    return rows.map((r) => r.remoteId).nonNulls.toList();
  }

  Future<int> bucketCount() async {
    final rows = await db.mergedAssetDrift
        .mergedBucket(groupBy: GroupAssetsBy.day.index, userIds: [identity.userId])
        .get();
    return rows.fold<int>(0, (sum, row) => sum + row.assetCount);
  }

  setUp(() async {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    store = await StoreService.create(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    await store.put(StoreKey.currentUser, UserStub.admin);
    await store.put(StoreKey.serverEndpoint, 'https://test.safefoto.pl/api');
    await store.put(StoreKey.accessToken, 'session');
    identity = currentFamilySyncIdentity(store)!;
    visibility = FamilyPrivateVisibilityService(store, db: db);

    await db
        .into(db.userEntity)
        .insert(UserEntityCompanion.insert(id: identity.userId, email: 'test@example.com', name: 'Test'));
    for (final id in ['photo-1', 'photo-2']) {
      await db
          .into(db.remoteAssetEntity)
          .insert(
            RemoteAssetEntityCompanion.insert(
              id: id,
              name: '$id.jpg',
              type: AssetType.image,
              checksum: 'checksum-$id',
              ownerId: identity.userId,
              visibility: AssetVisibility.timeline,
              createdAt: Value(DateTime.utc(2026, 9, 28)),
              updatedAt: Value(DateTime.utc(2026, 9, 28)),
              uploadedAt: Value(DateTime.utc(2026, 9, 28)),
            ),
          );
    }
  });

  tearDown(() async {
    await store.dispose();
    await db.close();
  });

  test('move hides only selected private tile and corrects date bucket count', () async {
    expect(await privateIds(), containsAll(['photo-1', 'photo-2']));
    expect(await bucketCount(), 2);
    await visibility.update('photo-1', 'move', identity);
    expect(await privateIds(), ['photo-2']);
    expect(await bucketCount(), 1);
    await visibility.update('photo-1', 'share', identity);
    expect(await privateIds(), containsAll(['photo-1', 'photo-2']));
    expect(await bucketCount(), 2);
  });

  test('live private timeline bucket stream reacts to move and restore', () async {
    final stream = db.mergedAssetDrift
        .mergedBucket(groupBy: GroupAssetsBy.day.index, userIds: [identity.userId])
        .watch()
        .map((rows) => rows.fold<int>(0, (sum, row) => sum + row.assetCount));
    final observed = <int>[];
    final subscription = stream.listen(observed.add);
    try {
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(observed.last, 2);
      await visibility.update('photo-1', 'move', identity);
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(observed.last, 1);
      await visibility.update('photo-1', 'private', identity);
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(observed.last, 2);
    } finally {
      await subscription.cancel();
    }
  });

  test('withdrawal returns a moved image to private timeline', () async {
    await visibility.update('photo-1', 'move', identity);
    await visibility.update('photo-1', 'private', identity);
    expect(await privateIds(), contains('photo-1'));
  });

  test('server manifest reconciles hidden IDs without deleting server originals', () async {
    await visibility.reconcile(
      FamilySyncManifest.fromJson({
        'version': 1,
        'householdId': 'family',
        'generatedAt': '2026-09-28T21:00:00Z',
        'assets': [
          {
            'id': 'photo-2',
            'ownerId': identity.userId,
            'fileCreatedAt': '2026-09-28T20:00:00Z',
            'hideFromPersonalTimeline': true,
            'updatedAt': '2026-09-28T21:00:00Z',
          },
          {
            'id': 'photo-1',
            'ownerId': 'other-member',
            'fileCreatedAt': '2026-09-28T20:00:00Z',
            'hideFromPersonalTimeline': true,
            'updatedAt': '2026-09-28T21:00:00Z',
          },
        ],
        'albums': [],
        'albumAssets': [],
      }),
      identity,
    );
    expect(await privateIds(), ['photo-1']);
    final originals = await db.select(db.remoteAssetEntity).get();
    expect(originals, hasLength(2));
  });

  test('different account cannot inherit previous account private suppression', () async {
    await visibility.update('photo-1', 'move', identity);
    await store.put(StoreKey.serverEndpoint, 'https://different.safefoto.pl/api');
    expect(await privateIds(), contains('photo-1'));
    // A delayed response from the old session cannot write into the new one.
    await visibility.update('photo-2', 'move', identity);
    expect(await privateIds(), contains('photo-2'));
  });

  test('hidden IDs survive recreation of the visibility service', () async {
    await visibility.update('photo-1', 'move', identity);
    final recreated = FamilyPrivateVisibilityService(store, db: db);
    await recreated.update('photo-2', 'move', identity);
    expect(await privateIds(), isEmpty);
  });
}
