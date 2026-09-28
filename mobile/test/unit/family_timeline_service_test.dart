import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';

RemoteAsset photo(String id, DateTime captured) => RemoteAsset(
  id: id,
  name: '$id.jpg',
  ownerId: 'owner',
  checksum: null,
  type: AssetType.image,
  createdAt: captured,
  updatedAt: captured,
  isEdited: false,
);

void main() {
  test('family uses the common timeline engine and chronological day buckets', () async {
    final service = TimelineService.fromAssetsWithBuckets([
      photo('old', DateTime(2024, 1, 5)),
      photo('new', DateTime(2026, 9, 28)),
      photo('same-day', DateTime(2026, 9, 28, 10)),
    ], origin: TimelineOrigin.family);
    final buckets = await service.watchBuckets().first;
    expect(buckets.map((bucket) => bucket.assetCount), [2, 1]);
    expect((await service.loadAssets(0, 3)).map((asset) => asset.remoteId), ['same-day', 'new', 'old']);
    expect(service.origin, TimelineOrigin.family);
    await service.dispose();
  });

  test('family month grouping uses the same timeline model without local phone assets', () async {
    final service = TimelineService.fromAssetsWithBuckets(
      [
        photo('january', DateTime(2026, 1, 2)),
        photo('february', DateTime(2026, 2, 4)),
        photo('january2', DateTime(2026, 1, 12)),
      ],
      origin: TimelineOrigin.family,
      groupBy: GroupAssetsBy.month,
    );
    final buckets = await service.watchBuckets().first;
    expect(buckets.map((bucket) => bucket.assetCount), [1, 2]);
    await service.dispose();
  });
}
