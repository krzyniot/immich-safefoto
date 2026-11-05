import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/presentation/widgets/images/backup_status_indicator.dart';

void main() {
  final now = DateTime.utc(2026, 11, 5, 14, 0);

  RemoteAsset remote({DateTime? uploadedAt, String? localId}) => RemoteAsset(
    id: 'server-1',
    localId: localId,
    ownerId: 'owner',
    name: 'photo.jpg',
    checksum: 'checksum',
    type: AssetType.image,
    createdAt: now.subtract(const Duration(days: 30)),
    updatedAt: now,
    uploadedAt: uploadedAt,
    isEdited: false,
  );

  LocalAsset local() => LocalAsset(
    id: 'local-1',
    name: 'photo.jpg',
    type: AssetType.image,
    createdAt: now,
    updatedAt: now,
    playbackStyle: AssetPlaybackStyle.image,
    isEdited: false,
  );

  test('local photo without a server copy retains crossed-out cloud', () {
    expect(backupIndicatorForAsset(local(), now), BackupIndicator.notBackedUp);
  });

  test('newly uploaded remote and merged photos show checked cloud', () {
    final uploadedAt = now.subtract(const Duration(minutes: 2));
    expect(backupIndicatorForAsset(remote(uploadedAt: uploadedAt), now), BackupIndicator.recentlyBackedUp);
    expect(
      backupIndicatorForAsset(remote(uploadedAt: uploadedAt, localId: 'local-1'), now),
      BackupIndicator.recentlyBackedUp,
    );
  });

  test('checked cloud expires exactly 15 minutes after upload', () {
    final uploadedAt = now.subtract(const Duration(minutes: 15));
    expect(
      backupIndicatorForAsset(remote(uploadedAt: uploadedAt.add(const Duration(microseconds: 1))), now),
      BackupIndicator.recentlyBackedUp,
    );
    expect(backupIndicatorForAsset(remote(uploadedAt: uploadedAt), now), BackupIndicator.none);
    expect(
      backupIndicatorForAsset(remote(uploadedAt: now.subtract(const Duration(hours: 1))), now),
      BackupIndicator.none,
    );
  });

  test('missing or future timestamps never claim recent backup', () {
    expect(backupIndicatorForAsset(remote(), now), BackupIndicator.none);
    expect(backupIndicatorForAsset(remote(uploadedAt: now.add(const Duration(minutes: 2))), now), BackupIndicator.none);
  });

  test('reopening later does not reset countdown', () {
    final asset = remote(uploadedAt: now);
    expect(backupIndicatorForAsset(asset, now.add(const Duration(minutes: 14))), BackupIndicator.recentlyBackedUp);
    expect(backupIndicatorForAsset(asset, now.add(const Duration(minutes: 16))), BackupIndicator.none);
  });

  test('remaining time is based on server timestamp', () {
    expect(backupConfirmationRemaining(now.subtract(const Duration(minutes: 5)), now), const Duration(minutes: 10));
    expect(backupConfirmationRemaining(now.subtract(const Duration(minutes: 15)), now), isNull);
  });
}
