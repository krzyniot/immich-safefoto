/// SafeFoto family-only synchronization contract. This never represents local
/// phone photos or the user's private originals.
typedef FamilyAlbumLink = ({String albumId, String assetId});

class FamilySyncAsset {
  const FamilySyncAsset({
    required this.id,
    required this.ownerId,
    required this.hideFromPersonalTimeline,
    required this.updatedAt,
  });

  final String id;
  final String ownerId;
  final bool hideFromPersonalTimeline;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'ownerId': ownerId,
    'hideFromPersonalTimeline': hideFromPersonalTimeline,
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };

  factory FamilySyncAsset.fromJson(Map<String, dynamic> data) => FamilySyncAsset(
    id: _requiredString(data, 'id'),
    ownerId: _requiredString(data, 'ownerId'),
    hideFromPersonalTimeline: _requiredBool(data, 'hideFromPersonalTimeline'),
    updatedAt: DateTime.parse(_requiredString(data, 'updatedAt')),
  );
}

class FamilySyncAlbum {
  const FamilySyncAlbum({
    required this.id,
    required this.name,
    required this.description,
    required this.defaultMode,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String description;
  final String defaultMode;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'defaultMode': defaultMode,
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };

  factory FamilySyncAlbum.fromJson(Map<String, dynamic> data) {
    final mode = _requiredString(data, 'defaultMode');
    if (mode != 'share' && mode != 'move') {
      throw const FormatException('Unsupported family album mode');
    }
    return FamilySyncAlbum(
      id: _requiredString(data, 'id'),
      name: _requiredString(data, 'name'),
      description: _requiredString(data, 'description', allowEmpty: true),
      defaultMode: mode,
      updatedAt: DateTime.parse(_requiredString(data, 'updatedAt')),
    );
  }
}

class FamilySyncManifest {
  const FamilySyncManifest({
    required this.householdId,
    required this.generatedAt,
    required this.assets,
    required this.albums,
    required this.albumAssets,
  });

  final String householdId;
  final DateTime generatedAt;
  final List<FamilySyncAsset> assets;
  final List<FamilySyncAlbum> albums;
  final List<FamilyAlbumLink> albumAssets;

  Map<String, dynamic> toJson() => {
    'version': 1,
    'householdId': householdId,
    'generatedAt': generatedAt.toUtc().toIso8601String(),
    'assets': assets.map((asset) => asset.toJson()).toList(),
    'albums': albums.map((album) => album.toJson()).toList(),
    'albumAssets': albumAssets.map((link) => {'albumId': link.albumId, 'assetId': link.assetId}).toList(),
  };

  factory FamilySyncManifest.fromJson(Map<String, dynamic> data) {
    if (data['version'] != 1) {
      throw const FormatException('Unsupported family manifest version');
    }

    final assets = _requiredList(data, 'assets').map((item) => FamilySyncAsset.fromJson(_object(item))).toList();
    final albums = _requiredList(data, 'albums').map((item) => FamilySyncAlbum.fromJson(_object(item))).toList();
    final albumAssets = _requiredList(data, 'albumAssets').map((item) {
      final link = _object(item);
      return (albumId: _requiredString(link, 'albumId'), assetId: _requiredString(link, 'assetId'));
    }).toList();

    final assetIds = assets.map((asset) => asset.id).toSet();
    final albumIds = albums.map((album) => album.id).toSet();
    if (assetIds.length != assets.length ||
        albumIds.length != albums.length ||
        albumAssets.toSet().length != albumAssets.length ||
        albumAssets.any((link) => !assetIds.contains(link.assetId) || !albumIds.contains(link.albumId))) {
      throw const FormatException('Incomplete or inconsistent family manifest');
    }

    return FamilySyncManifest(
      householdId: _requiredString(data, 'householdId'),
      generatedAt: DateTime.parse(_requiredString(data, 'generatedAt')),
      assets: List.unmodifiable(assets),
      albums: List.unmodifiable(albums),
      albumAssets: List.unmodifiable(albumAssets),
    );
  }

  /// Compute changes for the SHARED cache only. This function never deletes
  /// originals or phone gallery photos, even after leaving a household.
  FamilySyncDelta reconcile(FamilySyncManifest? previous) {
    final oldAssets = {for (final asset in previous?.assets ?? <FamilySyncAsset>[]) asset.id: asset};
    final newAssets = {for (final asset in assets) asset.id: asset};
    final oldAlbums = {for (final album in previous?.albums ?? <FamilySyncAlbum>[]) album.id: album};
    final newAlbums = {for (final album in albums) album.id: album};
    final oldLinks = previous?.albumAssets.toSet() ?? <FamilyAlbumLink>{};
    final newLinks = albumAssets.toSet();
    final changedHousehold = previous != null && previous.householdId != householdId;

    return FamilySyncDelta(
      householdChanged: changedHousehold,
      addedAssetIds: newAssets.keys.toSet().difference(changedHousehold ? <String>{} : oldAssets.keys.toSet()),
      removedAssetIds: oldAssets.keys.toSet().difference(changedHousehold ? <String>{} : newAssets.keys.toSet()),
      updatedAssetIds: changedHousehold
          ? <String>{}
          : newAssets.keys.where((id) {
              final before = oldAssets[id];
              final after = newAssets[id]!;
              return before != null &&
                  (before.updatedAt != after.updatedAt ||
                      before.hideFromPersonalTimeline != after.hideFromPersonalTimeline ||
                      before.ownerId != after.ownerId);
            }).toSet(),
      addedAlbumIds: newAlbums.keys.toSet().difference(changedHousehold ? <String>{} : oldAlbums.keys.toSet()),
      removedAlbumIds: oldAlbums.keys.toSet().difference(changedHousehold ? <String>{} : newAlbums.keys.toSet()),
      updatedAlbumIds: changedHousehold
          ? <String>{}
          : newAlbums.keys.where((id) {
              final before = oldAlbums[id];
              final after = newAlbums[id]!;
              return before != null &&
                  (before.updatedAt != after.updatedAt ||
                      before.name != after.name ||
                      before.description != after.description ||
                      before.defaultMode != after.defaultMode);
            }).toSet(),
      addedAlbumLinks: newLinks.difference(changedHousehold ? <FamilyAlbumLink>{} : oldLinks),
      removedAlbumLinks: oldLinks.difference(changedHousehold ? <FamilyAlbumLink>{} : newLinks),
    );
  }
}

class FamilySyncDelta {
  const FamilySyncDelta({
    required this.householdChanged,
    required this.addedAssetIds,
    required this.removedAssetIds,
    required this.updatedAssetIds,
    required this.addedAlbumIds,
    required this.removedAlbumIds,
    required this.updatedAlbumIds,
    required this.addedAlbumLinks,
    required this.removedAlbumLinks,
  });

  final bool householdChanged;
  final Set<String> addedAssetIds;
  final Set<String> removedAssetIds;
  final Set<String> updatedAssetIds;
  final Set<String> addedAlbumIds;
  final Set<String> removedAlbumIds;
  final Set<String> updatedAlbumIds;
  final Set<FamilyAlbumLink> addedAlbumLinks;
  final Set<FamilyAlbumLink> removedAlbumLinks;
}

Map<String, dynamic> _object(Object? value) {
  if (value is! Map<String, dynamic>) {
    throw const FormatException('Expected JSON object');
  }
  return value;
}

String _requiredString(Map<String, dynamic> data, String key, {bool allowEmpty = false}) {
  final value = data[key];
  if (value is! String || (!allowEmpty && value.isEmpty)) {
    throw FormatException('Missing or invalid $key');
  }
  return value;
}

bool _requiredBool(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is! bool) {
    throw FormatException('Missing or invalid $key');
  }
  return value;
}

List<dynamic> _requiredList(Map<String, dynamic> data, String key) {
  final value = data[key];
  if (value is! List<dynamic>) {
    throw FormatException('Missing or invalid $key');
  }
  return value;
}
