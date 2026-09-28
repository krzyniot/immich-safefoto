import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';

/// Read-only gallery projection. Every displayed ID must be in the currently
/// authorized family manifest; never query the entire private asset library.
List<FamilySyncAsset> familyGalleryAssets(FamilySyncManifest manifest, {String? albumId}) {
  final allowedIds = albumId == null
      ? null
      : manifest.albumAssets.where((link) => link.albumId == albumId).map((link) => link.assetId).toSet();
  return manifest.assets.where((asset) => allowedIds == null || allowedIds.contains(asset.id)).toList()..sort((a, b) {
    final date = b.fileCreatedAt.compareTo(a.fileCreatedAt);
    return date != 0 ? date : b.id.compareTo(a.id);
  });
}

/// Chronological groups with stable month ordering and no physical copies.
List<({DateTime month, List<FamilySyncAsset> assets})> familyGalleryMonths(List<FamilySyncAsset> sortedAssets) {
  final groups = <DateTime, List<FamilySyncAsset>>{};
  for (final asset in sortedAssets) {
    final date = asset.fileCreatedAt.toLocal();
    final month = DateTime(date.year, date.month);
    groups.putIfAbsent(month, () => []).add(asset);
  }
  return [for (final entry in groups.entries) (month: entry.key, assets: List.unmodifiable(entry.value))];
}

/// Convert only explicitly authorized manifest IDs to the SAME asset model
/// used by the personal timeline. No private-library query or file copy.
List<RemoteAsset> familyTimelineAssets(FamilySyncManifest manifest, {String? albumId}) => [
  for (final asset in familyGalleryAssets(manifest, albumId: albumId))
    RemoteAsset(
      id: asset.id,
      ownerId: asset.ownerId,
      name: asset.name ?? 'Zdjęcie rodzinne',
      checksum: null,
      type: AssetType.image,
      createdAt: asset.localDateTime ?? asset.fileCreatedAt,
      updatedAt: asset.updatedAt,
      width: asset.width,
      height: asset.height,
      isFavorite: asset.isFavorite,
      thumbHash: asset.thumbHash,
      isEdited: false,
    ),
];
