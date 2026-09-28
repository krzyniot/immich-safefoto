import 'dart:convert';

import 'package:drift/drift.dart' show TableUpdate;

import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';

/// Account-scoped visibility overlay for the PRIVATE timeline only.
///
/// A move never changes the remote original or the phone gallery. SQLite's
/// merged timeline reads this store row for both its asset and bucket queries,
/// so a successful move immediately removes the tile and its date count.
class FamilyPrivateVisibilityService {
  const FamilyPrivateVisibilityService(this.store, {this.db});

  final StoreService store;
  final Drift? db;

  Set<String> _current(FamilySyncIdentity identity) {
    final raw = store.tryGet(StoreKey.familyPrivateHiddenJson);
    if (raw == null) {
      return {};
    }
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic> ||
          json['userId'] != identity.userId ||
          json['serverEndpoint'] != identity.serverEndpoint) {
        return {};
      }
      final ids = json['hiddenIds'];
      if (ids is! List || ids.any((id) => id is! String)) {
        return {};
      }
      return ids.cast<String>().toSet();
    } on FormatException {
      return {};
    }
  }

  Future<void> update(String assetId, String mode, FamilySyncIdentity identity) async {
    if (currentFamilySyncIdentity(store) != identity) {
      return;
    }
    final hidden = _current(identity);
    if (mode == 'move') {
      hidden.add(assetId);
    } else if (mode == 'share' || mode == 'private') {
      hidden.remove(assetId);
    } else {
      throw ArgumentError.value(mode, 'mode');
    }
    if (currentFamilySyncIdentity(store) == identity) {
      await _save(hidden, identity);
    }
  }

  Future<void> reconcile(FamilySyncManifest manifest, FamilySyncIdentity identity) async {
    if (currentFamilySyncIdentity(store) != identity) {
      return;
    }
    final hidden = {
      for (final asset in manifest.assets)
        if (asset.ownerId == identity.userId && asset.hideFromPersonalTimeline) asset.id,
    };
    await _save(hidden, identity);
  }

  Future<void> _save(Set<String> hidden, FamilySyncIdentity identity) async {
    if (currentFamilySyncIdentity(store) != identity) {
      return;
    }
    await store.put(
      StoreKey.familyPrivateHiddenJson,
      jsonEncode({
        'userId': identity.userId,
        'serverEndpoint': identity.serverEndpoint,
        'hiddenIds': hidden.toList()..sort(),
      }),
    );
    // Drift's SQL parser does not infer that json_each reads store_entity.
    // Notify the merged timeline explicitly so both tiles and date buckets
    // update immediately, even without a remote sync event.
    final database = db;
    if (database != null) {
      database.notifyUpdates({TableUpdate.onTable(database.remoteAssetEntity)});
    }
  }
}
