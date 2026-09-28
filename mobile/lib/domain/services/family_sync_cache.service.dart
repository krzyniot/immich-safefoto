import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/services/api.service.dart';

/// Identity is read at the start AND end of a request so a response from a
/// previous login or server cannot be committed into the new session's cache.
/// Access tokens are only compared in memory; they are never stored here.
typedef FamilySyncIdentity = ({String userId, String serverEndpoint, String accessToken});

abstract interface class FamilySyncCacheStore {
  Future<String?> read();
  Future<void> write(String json);
  Future<void> clear();
}

class StoreFamilySyncCache implements FamilySyncCacheStore {
  const StoreFamilySyncCache(this.store);

  final StoreService store;

  @override
  Future<String?> read() async => store.tryGet(StoreKey.familySyncManifestJson);

  @override
  Future<void> write(String json) => store.put(StoreKey.familySyncManifestJson, json);

  @override
  Future<void> clear() => store.delete(StoreKey.familySyncManifestJson);
}

FamilySyncIdentity? currentFamilySyncIdentity(StoreService store) {
  final userId = store.tryGet(StoreKey.currentUser)?.id;
  final endpoint = store.tryGet(StoreKey.serverEndpoint);
  final token = store.tryGet(StoreKey.accessToken);
  if (userId == null || userId.isEmpty || endpoint == null || endpoint.isEmpty || token == null || token.isEmpty) {
    return null;
  }
  return (userId: userId, serverEndpoint: endpoint, accessToken: token);
}

class FamilySyncRefreshResult {
  const FamilySyncRefreshResult({required this.manifest, required this.delta});

  final FamilySyncManifest manifest;
  final FamilySyncDelta delta;
}

/// A small, account-scoped persisted family projection. No server originals,
/// private library, or local phone gallery are modified by this service.
/// UI/sync integration is a separate stage.
class FamilySyncCacheService {
  FamilySyncCacheService({
    required FamilySyncCacheStore cache,
    required FamilySyncIdentity? Function() identity,
    required Future<FamilySyncManifest> Function() fetchManifest,
  }) : _cache = cache,
       _identity = identity,
       _fetchManifest = fetchManifest;

  factory FamilySyncCacheService.fromApiService(ApiService api, StoreService store) => FamilySyncCacheService(
    cache: StoreFamilySyncCache(store),
    identity: () => currentFamilySyncIdentity(store),
    fetchManifest: FamilySyncApiRepository.fromApiService(api).fetchManifest,
  );

  final FamilySyncCacheStore _cache;
  final FamilySyncIdentity? Function() _identity;
  final Future<FamilySyncManifest> Function() _fetchManifest;
  Future<FamilySyncRefreshResult>? _inFlight;
  int _revision = 0;

  /// Read only a cache belonging to the CURRENT account on the CURRENT server.
  /// Invalid or unrecognized cache data is never interpreted as an empty
  /// successful server response.
  Future<FamilySyncManifest?> load() async {
    final identity = _identity();
    if (identity == null) {
      return null;
    }
    final raw = await _cache.read();
    if (_identity() != identity || raw == null) {
      return null;
    }
    try {
      final data = jsonDecode(raw);
      if (data is! Map<String, dynamic> ||
          data['cacheVersion'] != 1 ||
          data['userId'] != identity.userId ||
          data['serverEndpoint'] != identity.serverEndpoint ||
          data['sessionFingerprint'] != _fingerprint(identity.accessToken)) {
        return null;
      }
      final manifestData = data['manifest'];
      if (manifestData is! Map<String, dynamic>) {
        return null;
      }
      return FamilySyncManifest.fromJson(manifestData);
    } on FormatException {
      return null;
    }
  }

  /// A successful publication invalidates the old authorization snapshot.
  /// Never show a withdrawn family photo from disk while offline.
  Future<void> invalidate() async {
    // An older in-flight response must not resurrect a withdrawn publication.
    _revision++;
    await _cache.clear();
  }

  /// Coalesce simultaneous refreshes. Failed HTTP, invalid data, or a changed
  /// login leave the previous cache intact. Only complete manifests are saved.
  Future<FamilySyncRefreshResult> refresh() {
    final running = _inFlight;
    if (running != null) {
      return running;
    }
    final request = _refresh();
    _inFlight = request;
    return request.whenComplete(() {
      _inFlight = null;
    });
  }

  Future<FamilySyncRefreshResult> _refresh() async {
    final revision = _revision;
    final identity = _identity();
    if (identity == null) {
      throw StateError('Family sync requires an authenticated account');
    }

    final previous = await load();
    if (_identity() != identity || _revision != revision) {
      throw StateError('Family sync session or publication changed during refresh');
    }

    final manifest = await _fetchManifest();
    if (_identity() != identity || _revision != revision) {
      throw StateError('Family sync session or publication changed during refresh');
    }

    final delta = manifest.reconcile(previous);
    final encoded = jsonEncode({
      'cacheVersion': 1,
      'userId': identity.userId,
      'serverEndpoint': identity.serverEndpoint,
      'sessionFingerprint': _fingerprint(identity.accessToken),
      'manifest': manifest.toJson(),
    });
    await _cache.write(encoded);
    // A session switch during a database write must not retain old data.
    if (_identity() != identity || _revision != revision) {
      if (await _cache.read() == encoded) {
        await _cache.clear();
      }
      throw StateError("Family sync session or publication changed during refresh");
    }
    return FamilySyncRefreshResult(manifest: manifest, delta: delta);
  }
}

String _fingerprint(String token) => sha256.convert(utf8.encode(token)).toString();
