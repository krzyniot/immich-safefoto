import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';

Map<String, dynamic> asset(String id, {bool moved = false, String updatedAt = '2026-09-28T10:00:00Z'}) => {
  'id': id,
  'ownerId': 'owner',
  'hideFromPersonalTimeline': moved,
  'updatedAt': updatedAt,
};

Map<String, dynamic> album(String id, {String name = 'Weekend'}) => {
  'id': id,
  'name': name,
  'description': '',
  'defaultMode': 'share',
  'updatedAt': '2026-09-28T10:00:00Z',
};

Map<String, dynamic> payload({
  String household = 'household-1',
  List<Map<String, dynamic>> assets = const [],
  List<Map<String, dynamic>> albums = const [],
  List<Map<String, dynamic>> links = const [],
}) => {
  'version': 1,
  'householdId': household,
  'generatedAt': '2026-09-28T10:00:00Z',
  'assets': assets,
  'albums': albums,
  'albumAssets': links,
};

void main() {
  test('new family starts with empty shared cache and never touches phone photos', () {
    final manifest = FamilySyncManifest.fromJson(payload());
    final delta = manifest.reconcile(null);
    expect(delta.householdChanged, isFalse);
    expect(delta.addedAssetIds, isEmpty);
    expect(delta.removedAssetIds, isEmpty);
    expect(delta.addedAlbumIds, isEmpty);
  });

  test('reconciles new publications and updates without confusing share with move', () {
    final before = FamilySyncManifest.fromJson(payload(assets: [asset('one')]));
    final after = FamilySyncManifest.fromJson(payload(assets: [asset('one', moved: true), asset('two')]));
    final delta = after.reconcile(before);
    expect(delta.addedAssetIds, {'two'});
    expect(delta.removedAssetIds, isEmpty);
    expect(delta.updatedAssetIds, {'one'});
  });

  test('reconciles withdrawn publications and album links only in the shared cache', () {
    final before = FamilySyncManifest.fromJson(
      payload(
        assets: [asset('one')],
        albums: [album('weekend')],
        links: [
          {'albumId': 'weekend', 'assetId': 'one'},
        ],
      ),
    );
    final after = FamilySyncManifest.fromJson(payload(albums: [album('weekend')]));
    final delta = after.reconcile(before);
    expect(delta.removedAssetIds, {'one'});
    expect(delta.removedAlbumLinks, {(albumId: 'weekend', assetId: 'one')});
    expect(delta.removedAlbumIds, isEmpty);
  });

  test('switching households evicts the old shared cache even when photo IDs overlap', () {
    final before = FamilySyncManifest.fromJson(
      payload(household: 'old-family', assets: [asset('same'), asset('old')], albums: [album('old-album')]),
    );
    final after = FamilySyncManifest.fromJson(payload(household: 'new-family', assets: [asset('same'), asset('new')]));
    final delta = after.reconcile(before);
    expect(delta.householdChanged, isTrue);
    expect(delta.removedAssetIds, {'same', 'old'});
    expect(delta.addedAssetIds, {'same', 'new'});
    expect(delta.removedAlbumIds, {'old-album'});
  });

  test('rejects incomplete manifests rather than silently deleting cached photos', () {
    final incomplete = payload(
      assets: [asset('one')],
      links: [
        {'albumId': 'missing', 'assetId': 'one'},
      ],
    );
    expect(() => FamilySyncManifest.fromJson(incomplete), throwsFormatException);
    expect(() => FamilySyncManifest.fromJson({...payload(), 'version': 2}), throwsFormatException);
    expect(() => FamilySyncManifest.fromJson({...payload(), 'assets': null}), throwsFormatException);
    expect(() => FamilySyncManifest.fromJson(payload(assets: [asset('one'), asset('one')])), throwsFormatException);
  });

  test('detects renamed albums and changed memberships', () {
    final before = FamilySyncManifest.fromJson(
      payload(
        assets: [asset('one')],
        albums: [album('weekend')],
        links: [
          {'albumId': 'weekend', 'assetId': 'one'},
        ],
      ),
    );
    final after = FamilySyncManifest.fromJson(
      payload(
        assets: [asset('one')],
        albums: [album('weekend', name: 'Our weekend')],
      ),
    );
    final delta = after.reconcile(before);
    expect(delta.updatedAlbumIds, {'weekend'});
    expect(delta.removedAlbumLinks, {(albumId: 'weekend', assetId: 'one')});
  });
}
