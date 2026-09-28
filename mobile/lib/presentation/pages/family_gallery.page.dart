import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/family_gallery.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:openapi/api.dart';
import 'package:immich_mobile/presentation/widgets/images/remote_image_provider.dart';

/// A distinct read-only family gallery. It never imports photos from the
/// private timeline and has no delete or phone-gallery operations.
@RoutePage()
class FamilyGalleryPage extends ConsumerStatefulWidget {
  const FamilyGalleryPage({super.key});

  @override
  ConsumerState<FamilyGalleryPage> createState() => _FamilyGalleryPageState();
}

class _FamilyGalleryPageState extends ConsumerState<FamilyGalleryPage> with WidgetsBindingObserver {
  FamilySyncManifest? _manifest;
  String? _albumId;
  String? _visibleUserId;
  bool _loading = true;
  bool _refreshing = false;
  String? _error;
  int _requestGeneration = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _loadAndRefresh();
      }
    });
  }

  @override
  void dispose() {
    _requestGeneration++;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadAndRefresh();
    }
  }

  Future<void> _loadAndRefresh() async {
    final generation = ++_requestGeneration;
    final service = ref.read(familySyncCacheServiceProvider);
    final identity = currentFamilySyncIdentity(ref.read(storeServiceProvider));
    if (identity == null) {
      if (mounted) {
        setState(() {
          _manifest = null;
          _visibleUserId = null;
          _loading = false;
          _refreshing = false;
          _error = 'Zaloguj się, aby zobaczyć zdjęcia rodziny.';
        });
      }
      return;
    }

    setState(() {
      if (_visibleUserId != identity.userId) {
        _manifest = null;
        _albumId = null;
      }
      _visibleUserId = identity.userId;
      _loading = _manifest == null;
      _refreshing = true;
      _error = null;
    });

    try {
      final cached = await service.load();
      if (!mounted || generation != _requestGeneration) {
        return;
      }
      if (cached != null) {
        setState(() {
          _manifest = cached;
          _loading = false;
        });
      }
      final result = await service.refresh();
      if (!mounted || generation != _requestGeneration) {
        return;
      }
      setState(() {
        _manifest = result.manifest;
        if (_albumId != null && !_manifest!.albums.any((album) => album.id == _albumId)) {
          _albumId = null;
        }
        _loading = false;
        _refreshing = false;
      });
    } catch (error) {
      if (!mounted || generation != _requestGeneration) {
        return;
      }
      final session = currentFamilySyncIdentity(ref.read(storeServiceProvider));
      final unauthorized = error is FamilySyncFetchException && (error.statusCode == 401 || error.statusCode == 403);
      setState(() {
        // On a revoked session, NEVER render previously cached family thumbnails.
        if (unauthorized || session != identity) {
          _manifest = null;
          _albumId = null;
        }
        _loading = false;
        _refreshing = false;
        _error = unauthorized || session != identity
            ? 'Brak dostępu do zdjęć rodziny. Zaloguj się ponownie.'
            : 'Nie udało się odświeżyć zdjęć rodziny. Sprawdź połączenie.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Do not render another account's manifest even for a single stale frame.
    final userId = ref.watch(currentUserProvider.select((user) => user?.id));
    final manifest = _visibleUserId == userId ? _manifest : null;
    final colors = Theme.of(context).colorScheme;
    final assets = manifest == null ? <FamilySyncAsset>[] : familyGalleryAssets(manifest, albumId: _albumId);
    final groups = familyGalleryMonths(assets);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Zdjęcia rodziny'),
        actions: [
          if (_refreshing)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 18),
              child: SizedBox(width: 19, height: 19, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            IconButton(tooltip: 'Odśwież', icon: const Icon(Icons.refresh), onPressed: _loadAndRefresh),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAndRefresh,
        child: _loading && manifest == null
            ? const Center(child: CircularProgressIndicator())
            : CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  if (_error != null)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Card(
                          color: colors.surfaceContainerHighest,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(_error!, style: TextStyle(color: colors.onSurface)),
                          ),
                        ),
                      ),
                    ),
                  if (manifest != null) ...[
                    if (manifest.albums.isNotEmpty)
                      SliverToBoxAdapter(
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          child: Row(
                            children: [
                              ChoiceChip(
                                label: const Text('Wszystkie'),
                                selected: _albumId == null,
                                onSelected: (_) => setState(() => _albumId = null),
                              ),
                              for (final album in manifest.albums) ...[
                                const SizedBox(width: 8),
                                ChoiceChip(
                                  label: Text(album.name),
                                  selected: _albumId == album.id,
                                  onSelected: (_) => setState(() => _albumId = album.id),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    if (assets.isEmpty)
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'Nie ma jeszcze zdjęć w tej części galerii.\n'
                              'Udostępnione zdjęcia członków rodziny pojawią się tutaj.',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                    for (final group in groups) ...[
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 22, 16, 12),
                          child: Text(
                            MaterialLocalizations.of(context).formatMonthYear(group.month),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                      ),
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        sliver: SliverGrid.builder(
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 3,
                            mainAxisSpacing: 3,
                          ),
                          itemCount: group.assets.length,
                          itemBuilder: (context, index) {
                            final asset = group.assets[index];
                            return Semantics(
                              label: 'Zdjęcie rodzinne',
                              child: InkWell(
                                key: ValueKey('family-photo-${asset.id}'),
                                onTap: () => _preview(context, asset),
                                child: Image(
                                  image: RemoteImageProvider(url: getThumbnailUrlForRemoteId(asset.id)),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, error, stackTrace) =>
                                      const Center(child: Icon(Icons.broken_image_outlined)),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ],
                ],
              ),
      ),
    );
  }

  Future<void> _preview(BuildContext context, FamilySyncAsset asset) async {
    // A new request checks current server permissions; no server deletion
    // or local gallery changes are available in this read-only viewer.
    await showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            InteractiveViewer(
              child: Image(
                image: RemoteImageProvider(url: getThumbnailUrlForRemoteId(asset.id, type: AssetMediaSize.preview)),
                fit: BoxFit.contain,
                errorBuilder: (_, error, stackTrace) => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('Nie można wyświetlić zdjęcia.', style: TextStyle(color: Colors.white)),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                tooltip: 'Zamknij',
                color: Colors.white,
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
