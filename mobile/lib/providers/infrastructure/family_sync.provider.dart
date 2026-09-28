import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';

/// The family cache is separate from the private timeline and local backups.
final familySyncCacheServiceProvider = Provider<FamilySyncCacheService>(
  (ref) => FamilySyncCacheService.fromApiService(ref.watch(apiServiceProvider), ref.watch(storeServiceProvider)),
);
