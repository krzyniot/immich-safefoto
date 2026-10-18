import 'package:easy_localization/easy_localization.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/widgets/common/safefoto_icon.dart';
import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/constants.dart';
import 'package:immich_mobile/domain/models/events.model.dart';
import 'package:immich_mobile/domain/utils/event_stream.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/presentation/pages/search/paginated_search.provider.dart';
import 'package:immich_mobile/providers/haptic_feedback.provider.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/memory.provider.dart';
import 'package:immich_mobile/providers/infrastructure/people.provider.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/search/search_input_focus.provider.dart';
import 'package:immich_mobile/providers/tab.provider.dart';
import 'package:immich_mobile/routing/router.dart';

@RoutePage()
class TabShellPage extends ConsumerStatefulWidget {
  const TabShellPage({super.key});

  @override
  ConsumerState<TabShellPage> createState() => _TabShellPageState();
}

class _TabShellPageState extends ConsumerState<TabShellPage> {
  bool _railExpanded = false;
  @override
  Widget build(BuildContext context) {
    final isScreenLandscape = context.orientation == Orientation.landscape;
    final isReadonlyModeEnabled = ref.watch(readonlyModeProvider);
    final iconStyle = ref.watch(appConfigProvider.select((config) => config.theme.iconStyle));
    final reduceMotion = MediaQuery.disableAnimationsOf(context) || MediaQuery.accessibleNavigationOf(context);
    final navigationDestinations = [
      for (var i = 0; i < 5; i++)
        NavigationDestination(
          label: ['my_photos'.tr(), 'family_photos'.tr(), 'search'.tr(), 'albums'.tr(), 'Więcej'][i],
          icon: SafeFotoIcon(symbol: SafeFotoSymbol.values[i], style: iconStyle),
          selectedIcon: SafeFotoIcon(symbol: SafeFotoSymbol.values[i], style: iconStyle, active: true),
          enabled: i < 2 || !isReadonlyModeEnabled,
        ),
    ];

    Widget navigationRail(TabsRouter tabsRouter) {
      return NavigationRail(
        extended: _railExpanded,
        scrollable: true,
        minWidth: 64,
        minExtendedWidth: 210,
        leading: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Builder(
              builder: (railContext) {
                final animation = NavigationRail.extendedAnimation(railContext);
                return AnimatedBuilder(
                  animation: animation,
                  builder: (context, _) {
                    final progress = reduceMotion ? (_railExpanded ? 1.0 : 0.0) : animation.value;
                    return SizedBox(
                      width: 54 + 136 * progress,
                      height: 46,
                      child: ClipRect(
                        child: OverflowBox(
                          minWidth: 190,
                          maxWidth: 190,
                          alignment: Alignment.centerLeft,
                          child: Row(
                            children: [
                              SizedBox(
                                width: 54,
                                child: Image.asset('assets/safefoto-logo.png', width: 32, height: 32),
                              ),
                              Opacity(
                                opacity: progress,
                                child: Text(
                                  'SafeFoto',
                                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w500),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
            IconButton(
              key: const ValueKey('safefoto_navigation_toggle'),
              tooltip: _railExpanded ? 'Zwiń menu' : 'Rozwiń menu',
              icon: SafeFotoIcon(symbol: SafeFotoSymbol.menu, style: iconStyle, active: _railExpanded),
              onPressed: () => setState(() => _railExpanded = !_railExpanded),
            ),
          ],
        ),
        destinations: [
          for (var i = 0; i < navigationDestinations.length; i++)
            NavigationRailDestination(
              icon: SafeFotoIcon(
                symbol: SafeFotoSymbol.values[i],
                style: iconStyle,
                active: tabsRouter.activeIndex == i,
              ),
              label: Text(navigationDestinations[i].label),
              disabled: !navigationDestinations[i].enabled,
            ),
        ],
        onDestinationSelected: (index) => _onNavigationSelected(tabsRouter, index, ref),
        selectedIndex: tabsRouter.activeIndex,
        labelType: NavigationRailLabelType.none,
        groupAlignment: -1.0,
      );
    }

    return AutoTabsRouter(
      routes: const [
        MainTimelineRoute(),
        FamilyGalleryRoute(),
        DriftSearchRoute(),
        DriftAlbumsRoute(),
        DriftLibraryRoute(),
      ],
      duration: reduceMotion ? Duration.zero : const Duration(milliseconds: 240),
      transitionBuilder: (context, child, animation) => FadeTransition(opacity: animation, child: child),
      builder: (context, child) {
        final tabsRouter = AutoTabsRouter.of(context);
        return PopScope(
          canPop: tabsRouter.activeIndex == kPhotoTabIndex,
          onPopInvokedWithResult: (didPop, _) => !didPop ? tabsRouter.setActiveIndex(kPhotoTabIndex) : null,
          child: Scaffold(
            resizeToAvoidBottomInset: false,
            // Keep the gallery at the same element location during rotation.
            body: Row(
              children: [
                if (isScreenLandscape)
                  MediaQuery(
                    data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
                    child: navigationRail(tabsRouter),
                  ),
                if (isScreenLandscape) const VerticalDivider(width: 1),
                Expanded(key: const ValueKey('safefoto_tab_content'), child: child),
              ],
            ),
            bottomNavigationBar: _BottomNavigationBar(tabsRouter: tabsRouter, destinations: navigationDestinations),
          ),
        );
      },
    );
  }
}

void _onNavigationSelected(TabsRouter router, int index, WidgetRef ref) {
  // On Photos page menu tapped
  if (router.activeIndex == kPhotoTabIndex && index == kPhotoTabIndex) {
    EventStream.shared.emit(const ScrollToTopEvent());
  }

  if (index == kPhotoTabIndex) {
    ref.invalidate(driftMemoryFutureProvider);
    EventStream.shared.emit(const PrivateGalleryOpenedEvent());
  }
  if (index == kFamilyTabIndex) {
    EventStream.shared.emit(const FamilyGalleryOpenedEvent());
  }

  if (router.activeIndex != kSearchTabIndex && index == kSearchTabIndex) {
    ref.read(searchPreFilterProvider.notifier).clear();
  }

  // On Search page tapped
  if (router.activeIndex == kSearchTabIndex && index == kSearchTabIndex) {
    ref.read(searchInputFocusProvider).requestFocus();
  }

  // Album page
  if (index == kAlbumTabIndex) {
    ref.read(remoteAlbumProvider.notifier).refresh();
  }

  // Library page
  if (index == kLibraryTabIndex) {
    ref.invalidate(localAlbumProvider);
    ref.invalidate(driftGetAllPeopleProvider);
  }

  ref.read(hapticFeedbackProvider.notifier).selectionClick();
  router.setActiveIndex(index);
  ref.read(tabProvider.notifier).state = TabEnum.values[index];
}

class _BottomNavigationBar extends ConsumerStatefulWidget {
  const _BottomNavigationBar({required this.tabsRouter, required this.destinations});

  final List<NavigationDestination> destinations;
  final TabsRouter tabsRouter;

  @override
  ConsumerState createState() => _BottomNavigationBarState();
}

class _BottomNavigationBarState extends ConsumerState<_BottomNavigationBar> {
  bool hideNavigationBar = false;
  StreamSubscription? _eventSubscription;

  @override
  void initState() {
    super.initState();
    _eventSubscription = EventStream.shared.listen<MultiSelectToggleEvent>(_onEvent);
  }

  void _onEvent(MultiSelectToggleEvent event) {
    setState(() {
      hideNavigationBar = event.isEnabled;
    });
  }

  @override
  void dispose() {
    _eventSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isScreenLandscape = context.orientation == Orientation.landscape;

    if (isScreenLandscape || hideNavigationBar) {
      return const SizedBox.shrink();
    }

    return NavigationBar(
      selectedIndex: widget.tabsRouter.activeIndex,
      onDestinationSelected: (index) => _onNavigationSelected(widget.tabsRouter, index, ref),
      destinations: [
        for (var i = 0; i < widget.destinations.length; i++)
          NavigationDestination(
            label: widget.destinations[i].label,
            enabled: widget.destinations[i].enabled,
            icon: SafeFotoIcon(
              symbol: SafeFotoSymbol.values[i],
              style: (widget.destinations[i].icon as SafeFotoIcon).style,
              active: widget.tabsRouter.activeIndex == i,
            ),
          ),
      ],
    );
  }
}
