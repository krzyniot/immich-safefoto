import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/presentation/widgets/memory/memory_lane.widget.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/memory.provider.dart';

@RoutePage()
class MainTimelinePage extends ConsumerStatefulWidget {
  const MainTimelinePage({super.key});

  @override
  ConsumerState<MainTimelinePage> createState() => _MainTimelinePageState();
}

class _MainTimelinePageState extends ConsumerState<MainTimelinePage> {
  StreamSubscription? _openedSubscription;
  @override
  void initState() {
    super.initState();
    _openedSubscription = EventStream.shared.listen<PrivateGalleryOpenedEvent>((_) => _refreshVisibility());
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshVisibility());
  }

  @override
  void dispose() {
    _openedSubscription?.cancel();
    super.dispose();
  }

  Future<void> _refreshVisibility() async {
    if (!mounted) {
      return;
    }
    final identity = currentFamilySyncIdentity(ref.read(storeServiceProvider));
    if (identity == null) {
      return;
    }
    try {
      final manifest = (await ref.read(familySyncCacheServiceProvider).refresh()).manifest;
      if (!mounted) {
        return;
      }
      await ref.read(familyPrivateVisibilityProvider).reconcile(manifest, identity);
    } catch (_) {
      // Offline: keep the last account-scoped suppression; never restore a
      // moved photo merely because the server is unreachable.
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasMemories = ref.watch(driftMemoryFutureProvider.select((state) => state.value?.isNotEmpty ?? false));
    return Timeline(
      topSliverWidget: hasMemories ? const SliverToBoxAdapter(child: DriftMemoryLane()) : null,
      topSliverWidgetHeight: hasMemories ? 200 : null,
      showStorageIndicator: true,
    );
  }
}
