import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/family_gallery.model.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/domain/services/timeline.service.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/timeline.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';

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
  FamilySyncIdentity? _visibleIdentity;
  bool _loading = true;
  bool _refreshing = false;
  String? _error;
  int _requestGeneration = 0;
  StreamSubscription? _userSubscription;
  StreamSubscription? _tokenSubscription;
  StreamSubscription? _publicationSubscription;
  String? _lastObservedToken;
  TimelineService? _familyTimeline;
  FamilySyncManifest? _timelineManifest;
  String? _timelineAlbumId;
  GroupAssetsBy? _timelineGrouping;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final store = ref.read(storeServiceProvider);
    _lastObservedToken = store.tryGet(StoreKey.accessToken);
    _userSubscription = store.watch(StoreKey.currentUser).listen((user) {
      if (user == null) {
        _clearVisibleFamily();
      }
    });
    _tokenSubscription = store.watch(StoreKey.accessToken).listen((token) {
      final changed = token != _lastObservedToken;
      _lastObservedToken = token;
      if (changed || token == null) {
        _clearVisibleFamily();
      }
    });
    _publicationSubscription = EventStream.shared.listen<FamilyPublicationChangedEvent>((_) {
      if (mounted) {
        _dropTimeline();
        setState(() => _manifest = null);
        _loadAndRefresh();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _loadAndRefresh();
      }
    });
  }

  void _dropTimeline() {
    final previous = _familyTimeline;
    _familyTimeline = null;
    _timelineManifest = null;
    _timelineAlbumId = null;
    _timelineGrouping = null;
    if (previous != null) {
      unawaited(previous.dispose());
    }
  }

  void _clearVisibleFamily() {
    _requestGeneration++;
    _dropTimeline();
    if (mounted) {
      setState(() {
        _manifest = null;
        _albumId = null;
        _visibleUserId = null;
        _visibleIdentity = null;
        _refreshing = false;
        _loading = false;
        _error = 'Zaloguj się, aby zobaczyć zdjęcia rodziny.';
      });
    }
  }

  @override
  void dispose() {
    _requestGeneration++;
    _userSubscription?.cancel();
    _tokenSubscription?.cancel();
    _publicationSubscription?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _dropTimeline();
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
      _dropTimeline();
      if (mounted) {
        setState(() {
          _manifest = null;
          _visibleUserId = null;
          _visibleIdentity = null;
          _loading = false;
          _refreshing = false;
          _error = 'Zaloguj się, aby zobaczyć zdjęcia rodziny.';
        });
      }
      return;
    }

    setState(() {
      if (_visibleIdentity != identity) {
        _manifest = null;
        _albumId = null;
      }
      _visibleUserId = identity.userId;
      _visibleIdentity = identity;
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
      if (unauthorized || session != identity) {
        _dropTimeline();
      }
      setState(() {
        // On a revoked session, NEVER render previously cached family thumbnails.
        if (unauthorized || session != identity) {
          _manifest = null;
          _albumId = null;
          _visibleIdentity = null;
        }
        _loading = false;
        _refreshing = false;
        _error = unauthorized || session != identity
            ? 'Brak dostępu do zdjęć rodziny. Zaloguj się ponownie.'
            : 'Nie udało się odświeżyć zdjęć rodziny. Sprawdź połączenie.';
      });
    }
  }

  TimelineService _timelineFor(FamilySyncManifest manifest, GroupAssetsBy groupBy) {
    if (_familyTimeline == null ||
        !identical(_timelineManifest, manifest) ||
        _timelineAlbumId != _albumId ||
        _timelineGrouping != groupBy) {
      final previous = _familyTimeline;
      _familyTimeline = TimelineService.fromAssetsWithBuckets(
        familyTimelineAssets(manifest, albumId: _albumId),
        origin: TimelineOrigin.family,
        groupBy: groupBy,
      );
      _timelineManifest = manifest;
      _timelineAlbumId = _albumId;
      _timelineGrouping = groupBy;
      if (previous != null) {
        unawaited(previous.dispose());
      }
    }
    return _familyTimeline!;
  }

  @override
  Widget build(BuildContext context) {
    // A family manifest must never be rendered after the session is revoked.
    final userId = ref.watch(currentUserProvider.select((user) => user?.id));
    final identity = currentFamilySyncIdentity(ref.read(storeServiceProvider));
    final manifest = identity != null && _visibleIdentity == identity && _visibleUserId == userId ? _manifest : null;
    final colors = Theme.of(context).colorScheme;

    if (manifest == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Zdjęcia rodziny')),
        body: Center(
          child: _loading
              ? const CircularProgressIndicator()
              : Text(_error ?? 'Nie ma jeszcze zdjęć rodziny.', textAlign: TextAlign.center),
        ),
      );
    }

    final configuredGroup = ref.watch(appConfigProvider.select((config) => config.timeline.groupAssetsBy));
    final groupBy = configuredGroup == GroupAssetsBy.month ? GroupAssetsBy.month : GroupAssetsBy.day;
    final timeline = _timelineFor(manifest, groupBy);
    final assets = familyGalleryAssets(manifest, albumId: _albumId);
    final timelineKey = [
      'family-timeline',
      identity!.userId,
      manifest.householdId,
      manifest.generatedAt.toIso8601String(),
      _albumId ?? 'all',
      groupBy.name,
    ].join('-');
    return ProviderScope(
      key: ValueKey(timelineKey),
      overrides: [timelineServiceProvider.overrideWithValue(timeline)],
      child: Timeline(
        readOnly: true,
        groupBy: groupBy,
        onRefresh: _loadAndRefresh,
        appBar: SliverAppBar(
          floating: true,
          title: const Text('Zdjęcia rodziny'),
          actions: [
            if (_refreshing)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 18),
                child: Center(child: SizedBox(width: 19, height: 19, child: CircularProgressIndicator(strokeWidth: 2))),
              )
            else
              IconButton(tooltip: 'Odśwież', icon: const Icon(Icons.refresh), onPressed: _loadAndRefresh),
          ],
        ),
        topSliverWidget: SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Card(
                    color: colors.surfaceContainerHighest,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(_error!, style: TextStyle(color: colors.onSurface)),
                    ),
                  ),
                ),
              if (manifest.albums.isNotEmpty)
                SingleChildScrollView(
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
              if (assets.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    'Nie ma jeszcze zdjęć w tej części galerii.\n'
                    'Udostępnione zdjęcia członków rodziny pojawią się tutaj.',
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
        topSliverWidgetHeight: manifest.albums.isEmpty ? 0 : 65,
      ),
    );
  }
}
