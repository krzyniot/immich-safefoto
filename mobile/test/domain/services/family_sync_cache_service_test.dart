import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';

import '../../fixtures/user.stub.dart';

Map<String, dynamic> manifestPayload({String family = 'one', List<String> photos = const []}) => {
  'version': 1,
  'householdId': family,
  'generatedAt': '2026-09-28T10:00:00Z',
  'assets': photos
      .map(
        (id) => {'id': id, 'ownerId': 'owner', 'hideFromPersonalTimeline': false, 'updatedAt': '2026-09-28T10:00:00Z'},
      )
      .toList(),
  'albums': <Object>[],
  'albumAssets': <Object>[],
};

void main() {
  late Drift db;
  late StoreService store;
  late StoreFamilySyncCache cache;
  FamilySyncManifest response = FamilySyncManifest.fromJson(manifestPayload());
  int fetchCount = 0;
  Future<FamilySyncManifest> Function()? fetchOverride;

  FamilySyncCacheService makeService() => FamilySyncCacheService(
    cache: cache,
    identity: () => currentFamilySyncIdentity(store),
    fetchManifest: () async {
      fetchCount++;
      return fetchOverride == null ? response : fetchOverride!();
    },
  );

  setUp(() async {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    store = await StoreService.create(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    cache = StoreFamilySyncCache(store);
    response = FamilySyncManifest.fromJson(manifestPayload(photos: ['one']));
    fetchCount = 0;
    fetchOverride = null;
    await store.put(StoreKey.currentUser, UserStub.admin);
    await store.put(StoreKey.serverEndpoint, 'https://test.safefoto.pl/api');
    await store.put(StoreKey.accessToken, 'session-A');
  });

  tearDown(() async {
    await store.dispose();
    await db.close();
  });

  test('persists and reloads a complete manifest from the real Drift-backed store', () async {
    final first = makeService();
    final result = await first.refresh();
    expect(result.delta.addedAssetIds, {'one'});
    expect(fetchCount, 1);

    // Simulate a new service instance and a new StoreService after app restart.
    await store.dispose();
    store = await StoreService.create(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    cache = StoreFamilySyncCache(store);
    final restored = await makeService().load();
    expect(restored?.assets.map((a) => a.id), ['one']);
    expect(fetchCount, 1);
  });

  test('persists family albums and their shared-photo links across service instances', () async {
    response = FamilySyncManifest.fromJson({
      ...manifestPayload(photos: ['one']),
      'albums': [
        {
          'id': 'family-album',
          'name': 'Nasza rodzina',
          'description': '',
          'defaultMode': 'share',
          'updatedAt': '2026-09-28T10:00:00Z',
        },
      ],
      'albumAssets': [
        {'albumId': 'family-album', 'assetId': 'one'},
      ],
    });
    await makeService().refresh();
    final restored = await makeService().load();
    expect(restored?.albums.single.name, 'Nasza rodzina');
    expect(restored?.albumAssets, {(albumId: 'family-album', assetId: 'one')});
  });

  test('reconciles changed publications against persisted previous manifest', () async {
    await makeService().refresh();
    response = FamilySyncManifest.fromJson(manifestPayload(photos: ['two']));
    final result = await makeService().refresh();
    expect(result.delta.addedAssetIds, {'two'});
    expect(result.delta.removedAssetIds, {'one'});
    expect((await makeService().load())?.assets.map((a) => a.id), ['two']);
  });

  test('changed household invalidates previous shared cache without touching private assets', () async {
    await makeService().refresh();
    response = FamilySyncManifest.fromJson(manifestPayload(family: 'two', photos: ['two']));
    final result = await makeService().refresh();
    expect(result.delta.householdChanged, isTrue);
    expect(result.delta.removedAssetIds, {'one'});
    expect(result.delta.addedAssetIds, {'two'});
  });

  test('different account or server cannot read persisted family cache', () async {
    await makeService().refresh();
    await store.put(StoreKey.serverEndpoint, 'https://other.example/api');
    expect(await makeService().load(), isNull);
    await store.put(StoreKey.serverEndpoint, 'https://test.safefoto.pl/api');
    await store.delete(StoreKey.currentUser);
    expect(await makeService().load(), isNull);
  });

  test('a new login token cannot reuse an old session cache', () async {
    await makeService().refresh();
    final raw = await cache.read();
    expect(raw, isNot(contains('session-A')));
    await store.put(StoreKey.accessToken, 'session-B');
    expect(await makeService().load(), isNull);
  });

  test('HTTP failure leaves the previously persisted manifest intact', () async {
    await makeService().refresh();
    fetchOverride = () async => throw StateError('503');
    await expectLater(makeService().refresh(), throwsStateError);
    expect((await makeService().load())?.assets.map((a) => a.id), ['one']);
  });

  test('invalid or partial persisted JSON is ignored, never treated as a deletion event', () async {
    await cache.write('{bad json');
    expect(await makeService().load(), isNull);
    await cache.write(jsonEncode({'cacheVersion': 1, 'userId': UserStub.admin.id, 'manifest': {}}));
    expect(await makeService().load(), isNull);
  });

  test('logout while HTTP is pending rejects the stale response without overwriting cache', () async {
    final pending = Completer<FamilySyncManifest>();
    fetchOverride = () => pending.future;
    final refresh = makeService().refresh();
    // Ensure the request has started before invalidating the session.
    while (fetchCount == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await store.delete(StoreKey.accessToken);
    pending.complete(response);
    await expectLater(refresh, throwsStateError);
    expect(await cache.read(), isNull);
  });

  test('server switch while HTTP is pending rejects the old server response', () async {
    final pending = Completer<FamilySyncManifest>();
    fetchOverride = () => pending.future;
    final refresh = makeService().refresh();
    while (fetchCount == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    await store.put(StoreKey.serverEndpoint, 'https://another-server/api');
    pending.complete(response);
    await expectLater(refresh, throwsStateError);
    expect(await cache.read(), isNull);
  });

  test('concurrent refresh requests share a single fetch', () async {
    final pending = Completer<FamilySyncManifest>();
    fetchOverride = () => pending.future;
    final service = makeService();
    final a = service.refresh();
    final b = service.refresh();
    while (fetchCount == 0) {
      await Future<void>.delayed(Duration.zero);
    }
    pending.complete(response);
    final results = await Future.wait([a, b]);
    expect(fetchCount, 1);
    expect(results[0].manifest.householdId, results[1].manifest.householdId);
  });

  test('logout during a pending cache write discards the stale payload', () async {
    FamilySyncIdentity? identity = (userId: 'first', serverEndpoint: 'https://test/api', accessToken: 'token-1');
    final racingCache = _RaceCache(() => identity = null);
    final service = FamilySyncCacheService(
      cache: racingCache,
      identity: () => identity,
      fetchManifest: () async => response,
    );
    await expectLater(service.refresh(), throwsStateError);
    expect(racingCache.data, isNull);
  });

  test('requires authenticated identity for cache load and refresh', () async {
    await store.delete(StoreKey.currentUser);
    final service = makeService();
    expect(await service.load(), isNull);
    await expectLater(service.refresh(), throwsStateError);
    expect(fetchCount, 0);
  });
}

class _RaceCache implements FamilySyncCacheStore {
  _RaceCache(this.onWrite);
  final void Function() onWrite;
  String? data;

  @override
  Future<String?> read() async => data;

  @override
  Future<void> write(String json) async {
    data = json;
    onWrite();
  }

  @override
  Future<void> clear() async => data = null;
}
