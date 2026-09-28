import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/family_gallery.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';

Map<String, dynamic> photo(String id, String captured) => {
  'id': id,
  'ownerId': 'owner',
  'fileCreatedAt': captured,
  'hideFromPersonalTimeline': false,
  'updatedAt': '2026-09-28T10:00:00Z',
};

FamilySyncManifest manifest() => FamilySyncManifest.fromJson({
  'version': 1,
  'householdId': 'household',
  'generatedAt': '2026-09-28T10:00:00Z',
  'assets': [
    photo('old', '2024-01-05T12:00:00Z'),
    photo('new', '2026-09-28T12:00:00Z'),
    photo('middle', '2026-09-27T12:00:00Z'),
  ],
  'albums': [
    {'id': 'album', 'name': 'Wakacje', 'description': '', 'defaultMode': 'share', 'updatedAt': '2026-09-28T10:00:00Z'},
  ],
  'albumAssets': [
    {'albumId': 'album', 'assetId': 'old'},
    {'albumId': 'album', 'assetId': 'new'},
  ],
});

void main() {
  test('family gallery shows only explicit family publications in capture-time order', () {
    final assets = familyGalleryAssets(manifest());
    expect(assets.map((asset) => asset.id), ['new', 'middle', 'old']);
    expect(familyGalleryMonths(assets).length, 2);
  });

  test('album filter never adds an unpublished or private photo', () {
    final assets = familyGalleryAssets(manifest(), albumId: 'album');
    expect(assets.map((asset) => asset.id), ['new', 'old']);
    expect(familyGalleryAssets(manifest(), albumId: 'nonexistent'), isEmpty);
  });

  test('older version 1 manifest without capture date remains readable', () {
    final old = photo('old', '2024-01-05T12:00:00Z')..remove('fileCreatedAt');
    final data = manifest().toJson()
      ..['assets'] = [old]
      ..['albumAssets'] = <Object>[];
    final parsed = FamilySyncManifest.fromJson(data);
    expect(parsed.assets.single.fileCreatedAt, DateTime.utc(2026, 9, 28, 10));
  });

  test('cache roundtrip preserves capture dates and album links', () {
    final original = manifest();
    final restored = FamilySyncManifest.fromJson(original.toJson());
    expect(restored.assets.map((asset) => asset.fileCreatedAt), original.assets.map((asset) => asset.fileCreatedAt));
    expect(restored.albumAssets, original.albumAssets);
  });
}
