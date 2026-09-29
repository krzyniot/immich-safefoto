import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/enums.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/presentation/widgets/action_buttons/base_action_button.widget.dart';
import 'package:immich_mobile/presentation/widgets/action_buttons/share_action_button.widget.dart';
import 'package:immich_mobile/presentation/widgets/bottom_sheet/base_bottom_sheet.widget.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';

/// Family-specific actions; generic trash is intentionally excluded.
class FamilySelectionBottomSheet extends ConsumerStatefulWidget {
  const FamilySelectionBottomSheet({super.key, required this.manifest});
  final FamilySyncManifest manifest;
  @override
  ConsumerState<FamilySelectionBottomSheet> createState() => _FamilySelectionBottomSheetState();
}

class _FamilySelectionBottomSheetState extends ConsumerState<FamilySelectionBottomSheet> {
  bool busy = false;

  Future<void> _run({String? albumId}) async {
    final store = ref.read(storeServiceProvider);
    final identity = currentFamilySyncIdentity(store);
    final selected = ref.read(multiSelectProvider).selectedAssets;
    if (busy ||
        identity == null ||
        selected.isEmpty ||
        selected.any((asset) => asset is! RemoteAsset || asset.ownerId != identity.userId))
      return;
    final ids = selected.cast<RemoteAsset>().map((asset) => asset.id).toSet().toList();
    if (albumId == null) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Usuń z rodziny?'),
          content: Text(
            'Przenieść ' + ids.length.toString() + ' zdjęć do galerii osobistej? Oryginały nie zostaną usunięte.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialog, false), child: const Text('Anuluj')),
            FilledButton(onPressed: () => Navigator.pop(dialog, true), child: const Text('Przenieś')),
          ],
        ),
      );
      if (confirmed != true || !mounted || currentFamilySyncIdentity(store) != identity) return;
    }
    setState(() => busy = true);
    try {
      if (albumId != null) {
        await ref.read(familySyncApiRepositoryProvider).addPhotosToFamilyAlbum(albumId: albumId, assetIds: ids);
      } else {
        await ref.read(familySyncApiRepositoryProvider).updatePublication(assetIds: ids, mode: 'private');
        if (!mounted || currentFamilySyncIdentity(store) != identity) return;
        for (final id in ids) {
          await ref.read(familyPrivateVisibilityProvider).update(id, 'private', identity);
        }
      }
      await ref.read(familySyncCacheServiceProvider).invalidate();
      if (!mounted || currentFamilySyncIdentity(store) != identity) return;
      ref.read(multiSelectProvider.notifier).reset();
      EventStream.shared.emit(const FamilyPublicationChangedEvent());
      EventStream.shared.emit(const TimelineReloadEvent());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            albumId == null ? 'Przeniesiono zdjęcia do osobistej.' : 'Dodano zdjęcia do albumu rodzinnego.',
          ),
        ),
      );
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Nie udało się wykonać operacji. Spróbuj ponownie.')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _chooseAlbum() async {
    if (widget.manifest.albums.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Brak albumów rodzinnych.')));
      return;
    }
    final album = await showModalBottomSheet<FamilySyncAlbum>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(title: Text('Dodaj do albumu rodzinnego')),
            for (final album in widget.manifest.albums)
              ListTile(title: Text(album.name), onTap: () => Navigator.pop(context, album)),
          ],
        ),
      ),
    );
    if (album != null && mounted) await _run(albumId: album.id);
  }

  @override
  Widget build(BuildContext context) {
    final selected = ref.watch(multiSelectProvider).selectedAssets;
    final identity = currentFamilySyncIdentity(ref.read(storeServiceProvider));
    final ownSelection =
        identity != null &&
        selected.isNotEmpty &&
        selected.every((asset) => asset is RemoteAsset && asset.ownerId == identity.userId);
    return BaseBottomSheet(
      initialChildSize: 0.35,
      minChildSize: 0.28,
      maxChildSize: 0.65,
      wrapActions: true,
      shouldCloseOnMinExtent: false,
      actions: [
        const ShareActionButton(source: ActionSource.timeline),
        if (ownSelection)
          BaseActionButton(
            label: 'Dodaj do albumu',
            iconData: Icons.photo_album_outlined,
            onPressed: busy ? null : _chooseAlbum,
          ),
        if (ownSelection)
          BaseActionButton(
            label: 'Usuń z rodziny',
            iconData: Icons.drive_file_move_outlined,
            onPressed: busy ? null : _run,
          ),
      ],
    );
  }
}
