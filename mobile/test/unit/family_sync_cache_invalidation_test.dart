import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';

class _Cache implements FamilySyncCacheStore {
  String? data;
  Completer<void>? blockWrite;
  Completer<void>? writeStarted;

  @override
  Future<String?> read() async => data;
  @override
  Future<void> write(String json) async {
    writeStarted?.complete();
    await blockWrite?.future;
    data = json;
  }

  @override
  Future<void> clear() async => data = null;
}

void main() {
  const identity = (userId: 'user', serverEndpoint: 'https://test/api', accessToken: 'session');
  final manifest = FamilySyncManifest.fromJson({
    'version': 1,
    'householdId': 'household',
    'generatedAt': '2026-09-28T10:00:00Z',
    'assets': [],
    'albums': [],
    'albumAssets': [],
  });

  test('a response fetched before withdrawal cannot resurrect withdrawn photos', () async {
    final cache = _Cache();
    final fetching = Completer<void>();
    final release = Completer<void>();
    final service = FamilySyncCacheService(
      cache: cache,
      identity: () => identity,
      fetchManifest: () async {
        fetching.complete();
        await release.future;
        return manifest;
      },
    );
    final pending = service.refresh();
    await fetching.future;
    await service.invalidate();
    release.complete();
    await expectLater(pending, throwsStateError);
    expect(cache.data, isNull);
  });

  test('a stale write completing after invalidation is also discarded', () async {
    final cache = _Cache()
      ..writeStarted = Completer<void>()
      ..blockWrite = Completer<void>();
    final service = FamilySyncCacheService(cache: cache, identity: () => identity, fetchManifest: () async => manifest);
    final pending = service.refresh();
    await cache.writeStarted!.future;
    await service.invalidate();
    cache.blockWrite!.complete();
    await expectLater(pending, throwsStateError);
    expect(cache.data, isNull);
  });
}
