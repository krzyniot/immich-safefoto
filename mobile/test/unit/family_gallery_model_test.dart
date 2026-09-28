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

  test('shared timeline projects only published IDs into the same remote asset model as private timeline', () {
    final shared = familyTimelineAssets(manifest(), albumId: 'album');
    expect(shared.map((asset) => asset.id), ['new', 'old']);
    expect(shared.every((asset) => asset.localId == null && asset.hasRemote), isTrue);
    expect(shared.every((asset) => asset.ownerId == 'owner'), isTrue);
  });

  test('shared timeline preserves authorized metadata and capture time', () {
    final data = manifest().toJson();
    final first = (data['assets'] as List).first as Map<String, dynamic>;
    first['name'] = 'rodzina.jpg';
    first['width'] = 4032;
    first['height'] = 3024;
    first['isFavorite'] = true;
    first['localDateTime'] = '2024-01-05T13:00:00Z';
    final shared = familyTimelineAssets(FamilySyncManifest.fromJson(data));
    final old = shared.singleWhere((asset) => asset.id == 'old');
    expect(old.name, 'rodzina.jpg');
    expect(old.width, 4032);
    expect(old.height, 3024);
    expect(old.isFavorite, isTrue);
    expect(old.createdAt, DateTime.utc(2024, 1, 5, 13));
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
