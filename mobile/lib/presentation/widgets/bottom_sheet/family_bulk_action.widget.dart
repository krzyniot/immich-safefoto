import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/presentation/widgets/action_buttons/base_action_button.widget.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';

class FamilyBulkAction extends ConsumerStatefulWidget {
  const FamilyBulkAction({super.key, required this.mode});
  final String mode;
  @override
  ConsumerState<FamilyBulkAction> createState() => _FamilyBulkActionState();
}

class _FamilyBulkActionState extends ConsumerState<FamilyBulkAction> {
  bool busy = false;
  Future<void> publish() async {
    if (busy) {
      return;
    }
    final store = ref.read(storeServiceProvider);
    final identity = currentFamilySyncIdentity(store);
    final assets = ref.read(multiSelectProvider).selectedAssets;
    if (identity == null ||
        assets.isEmpty ||
        assets.any((a) => a is! RemoteAsset || !a.isImage || a.ownerId != identity.userId)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Wybierz tylko własne zdjęcia zapisane w SafeFoto.')));
      return;
    }
    final ids = assets.cast<RemoteAsset>().map((a) => a.id).toSet().toList();
    setState(() => busy = true);
    try {
      await ref.read(familySyncApiRepositoryProvider).updatePublication(assetIds: ids, mode: widget.mode);
      if (!mounted || currentFamilySyncIdentity(store) != identity) {
        return;
      }
      final visibility = ref.read(familyPrivateVisibilityProvider);
      for (final id in ids) {
        if (currentFamilySyncIdentity(store) != identity) {
          return;
        }
        await visibility.update(id, widget.mode, identity);
      }
      await ref.read(familySyncCacheServiceProvider).invalidate();
      if (!mounted || currentFamilySyncIdentity(store) != identity) {
        return;
      }
      ref.read(multiSelectProvider.notifier).reset();
      EventStream.shared.emit(const FamilyPublicationChangedEvent());
      EventStream.shared.emit(const TimelineReloadEvent());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.mode == 'move'
                ? 'Przeniesiono ${ids.length} zdjęć do rodziny.'
                : 'Udostępniono rodzinie ${ids.length} zdjęć.',
          ),
        ),
      );
    } on FamilySyncFetchException catch (_) {
      if (mounted && currentFamilySyncIdentity(store) == identity) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Nie udało się zapisać zdjęć rodziny. Spróbuj ponownie.')));
      }
    } catch (_) {
      if (mounted && currentFamilySyncIdentity(store) == identity) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Błąd połączenia. Sprawdź galerię przed ponowną próbą.')));
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => BaseActionButton(
    label: widget.mode == 'move' ? 'Do rodziny' : 'Dla rodziny',
    iconData: widget.mode == 'move' ? Icons.drive_file_move_outlined : Icons.groups_outlined,
    onPressed: busy ? null : publish,
  );
}
