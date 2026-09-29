import 'package:easy_localization/easy_localization.dart';
import "package:immich_mobile/providers/infrastructure/settings.provider.dart";
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
    final rounded = iconStyle == 1;
    final bold = iconStyle == 2;

    final navigationDestinations = [
      NavigationDestination(
        label: 'my_photos'.tr(),
        icon: Icon(
          bold
              ? Icons.collections_rounded
              : rounded
              ? Icons.photo_library_rounded
              : Icons.photo_library_outlined,
        ),
        selectedIcon: Icon(Icons.photo_library, color: context.primaryColor),
      ),
      NavigationDestination(
        label: 'family_photos'.tr(),
        icon: Icon(
          bold
              ? Icons.groups_rounded
              : rounded
              ? Icons.people_rounded
              : Icons.people_outline,
        ),
        selectedIcon: Icon(Icons.people, color: context.primaryColor),
      ),
      NavigationDestination(
        label: 'search'.tr(),
        icon: Icon(
          bold
              ? Icons.manage_search_rounded
              : rounded
              ? Icons.search_rounded
              : Icons.search_outlined,
        ),
        selectedIcon: Icon(Icons.search, color: context.primaryColor),
        enabled: !isReadonlyModeEnabled,
      ),
      NavigationDestination(
        label: 'albums'.tr(),
        icon: Icon(
          bold
              ? Icons.collections_bookmark_rounded
              : rounded
              ? Icons.photo_album_rounded
              : Icons.photo_album_outlined,
        ),
        selectedIcon: Icon(Icons.photo_album_rounded, color: context.primaryColor),
        enabled: !isReadonlyModeEnabled,
      ),
      NavigationDestination(
        label: 'Więcej',
        icon: Icon(
          bold
              ? Icons.apps_rounded
              : rounded
              ? Icons.grid_view_rounded
              : Icons.more_horiz_outlined,
        ),
        selectedIcon: Icon(Icons.space_dashboard_rounded, color: context.primaryColor),
        enabled: !isReadonlyModeEnabled,
      ),
    ];

    Widget navigationRail(TabsRouter tabsRouter) {
      return NavigationRail(
        extended: _railExpanded,
        minWidth: 64,
        minExtendedWidth: 210,
        leading: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 280),
              curve: Curves.easeInOutCubic,
              width: _railExpanded ? 190 : 54,
              height: 46,
              alignment: Alignment.center,
              child: _railExpanded
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset('assets/safefoto-logo.png', width: 30, height: 30),
                        const SizedBox(width: 8),
                        Text(
                          'SafeFoto',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ],
                    )
                  : Image.asset('assets/safefoto-logo.png', width: 32, height: 32),
            ),
            IconButton(
              key: const ValueKey('safefoto_navigation_toggle'),
              tooltip: _railExpanded ? 'Zwiń menu' : 'Rozwiń menu',
              icon: Icon(_railExpanded ? Icons.menu_open_rounded : Icons.menu_rounded),
              onPressed: () => setState(() => _railExpanded = !_railExpanded),
            ),
          ],
        ),
        destinations: navigationDestinations
            .map(
              (e) => NavigationRailDestination(
                icon: _AnimatedNavIcon(icon: e.icon, selected: false),
                label: Text(e.label),
                selectedIcon: _AnimatedNavIcon(icon: e.selectedIcon ?? e.icon, selected: true),
                disabled: !e.enabled,
              ),
            )
            .toList(),
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
      duration: const Duration(milliseconds: 600),
      transitionBuilder: (context, child, animation) => FadeTransition(opacity: animation, child: child),
      builder: (context, child) {
        final tabsRouter = AutoTabsRouter.of(context);
        return PopScope(
          canPop: tabsRouter.activeIndex == kPhotoTabIndex,
          onPopInvokedWithResult: (didPop, _) => !didPop ? tabsRouter.setActiveIndex(kPhotoTabIndex) : null,
          child: Scaffold(
            resizeToAvoidBottomInset: false,
            body: isScreenLandscape
                ? Row(
                    children: [
                      AnimatedSize(
                        duration: const Duration(milliseconds: 280),
                        curve: Curves.easeInOutCubic,
                        alignment: Alignment.centerLeft,
                        child: navigationRail(tabsRouter),
                      ),
                      const VerticalDivider(width: 1),
                      Expanded(child: child),
                    ],
                  )
                : child,
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
      destinations: widget.destinations.map((destination) {
        return NavigationDestination(
          label: destination.label,
          enabled: destination.enabled,
          icon: _AnimatedNavIcon(icon: destination.icon, selected: false),
          selectedIcon: _AnimatedNavIcon(icon: destination.selectedIcon ?? destination.icon, selected: true),
        );
      }).toList(),
    );
  }
}

/// Gentle motion on selection without moving the surrounding navigation layout.
class _AnimatedNavIcon extends StatelessWidget {
  const _AnimatedNavIcon({required this.icon, required this.selected});

  final Widget icon;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: selected ? 1.12 : 1,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(opacity: selected ? 1 : 0.82, duration: const Duration(milliseconds: 240), child: icon),
    );
  }
}
