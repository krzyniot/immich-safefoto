import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';

/// The ONLY family mutation exposed in the read-only family viewer.
/// Only the original owner can publish or withdraw their own remote IMAGE.
class FamilyPublicationButton extends ConsumerStatefulWidget {
  const FamilyPublicationButton({super.key, required this.asset, required this.origin});

  final RemoteAsset asset;
  final TimelineOrigin origin;

  @override
  ConsumerState<FamilyPublicationButton> createState() => _FamilyPublicationButtonState();
}

class _FamilyPublicationButtonState extends ConsumerState<FamilyPublicationButton> {
  bool _busy = false;

  Future<void> _publish(String mode) async {
    if (_busy) {
      return;
    }
    final store = ref.read(storeServiceProvider);
    final identity = currentFamilySyncIdentity(store);
    if (identity == null || identity.userId != widget.asset.ownerId || !widget.asset.isImage) {
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(familySyncApiRepositoryProvider).updatePublication(assetIds: [widget.asset.id], mode: mode);
      // Never emit a previous account's update into the current UI.
      if (!mounted || currentFamilySyncIdentity(store) != identity) {
        return;
      }
      // Revocation must invalidate the old cached authorization before the
      // gallery is allowed to re-render, including during a network outage.
      await ref.read(familyPrivateVisibilityProvider).update(widget.asset.id, mode, identity);
      await ref.read(familySyncCacheServiceProvider).invalidate();
      if (!mounted || currentFamilySyncIdentity(store) != identity) {
        return;
      }
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(
        SnackBar(
          content: Text(switch (mode) {
            'share' => 'Zdjęcie udostępniono rodzinie.',
            'move' => 'Zdjęcie przeniesiono do galerii rodziny.',
            _ => 'Wycofano zdjęcie z galerii rodziny.',
          }),
        ),
      );
      if (widget.origin == TimelineOrigin.family || mode == 'move') {
        await context.maybePop();
      }
      EventStream.shared.emit(const FamilyPublicationChangedEvent());
      // A move changes the server-side private timeline. A publication does
      // not remove a local phone original or alter backup settings.
      if (mode == 'move' || mode == 'private') {
        EventStream.shared.emit(const TimelineReloadEvent());
      }
    } on FamilySyncFetchException catch (error) {
      if (!mounted || currentFamilySyncIdentity(store) != identity) {
        return;
      }
      final message = error.statusCode == 401 || error.statusCode == 403
          ? 'Brak dostępu. Zaloguj się ponownie lub sprawdź uprawnienia.'
          : 'Nie udało się zmienić widoczności zdjęcia. Spróbuj ponownie.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (_) {
      if (mounted && currentFamilySyncIdentity(store) == identity) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Nie udało się zapisać zmiany. Sprawdź połączenie.')));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_busy) {
      return const Padding(
        padding: EdgeInsets.all(10),
        child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    return PopupMenuButton<String>(
      tooltip: 'Widoczność w rodzinie',
      icon: const Icon(Icons.groups_outlined),
      onSelected: _publish,
      itemBuilder: (_) => [
        const PopupMenuItem(
          value: 'share',
          child: ListTile(
            leading: Icon(Icons.people_outline),
            title: Text('Udostępnij rodzinie'),
            subtitle: Text('Zdjęcie pozostanie także w Moich zdjęciach'),
          ),
        ),
        const PopupMenuItem(
          value: 'move',
          child: ListTile(
            leading: Icon(Icons.drive_file_move_outlined),
            title: Text('Przenieś do rodziny'),
            subtitle: Text('Ukryj na prywatnej osi, bez kopiowania pliku'),
          ),
        ),
        if (widget.origin == TimelineOrigin.family)
          const PopupMenuItem(
            value: 'private',
            child: ListTile(
              leading: Icon(Icons.lock_outline),
              title: Text('Wycofaj z galerii rodziny'),
              subtitle: Text('Inne udostępnienia pozostają bez zmian'),
            ),
          ),
      ],
    );
  }
}
