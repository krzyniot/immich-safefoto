import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';

/// The cloud confirmation remains visible for 15 minutes after the server
/// created the asset, regardless of when the gallery was opened.
const backupConfirmationDuration = Duration(minutes: 15);

enum BackupIndicator { notBackedUp, recentlyBackedUp, none }

/// Returns the remaining time before the confirmation should disappear.
/// Null means no confirmation should be shown (including missing or future
/// server timestamps, which must not be treated as proof of a recent upload).
Duration? backupConfirmationRemaining(DateTime? uploadedAt, DateTime now) {
  if (uploadedAt == null) {
    return null;
  }
  final elapsed = now.difference(uploadedAt);
  if (elapsed.isNegative || elapsed >= backupConfirmationDuration) {
    return null;
  }
  return backupConfirmationDuration - elapsed;
}

BackupIndicator backupIndicatorForAsset(BaseAsset asset, DateTime now) {
  if (asset.storage == AssetState.local) {
    return BackupIndicator.notBackedUp;
  }
  if (asset is RemoteAsset && backupConfirmationRemaining(asset.uploadedAt, now) != null) {
    return BackupIndicator.recentlyBackedUp;
  }
  return BackupIndicator.none;
}
