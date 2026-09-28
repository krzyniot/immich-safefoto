import 'package:immich_mobile/domain/utils/event_stream.dart';

// Timeline Events
class TimelineReloadEvent extends Event {
  const TimelineReloadEvent();
}

class ScrollToTopEvent extends Event {
  const ScrollToTopEvent();
}

class ScrollToDateEvent extends Event {
  final DateTime date;

  const ScrollToDateEvent(this.date);
}

/// Refresh the family gallery after a successful owner publication change.
class FamilyPublicationChangedEvent extends Event {
  const FamilyPublicationChangedEvent();
}

/// Reconcile visibility whenever the user switches between the two galleries.
class PrivateGalleryOpenedEvent extends Event {
  const PrivateGalleryOpenedEvent();
}

class FamilyGalleryOpenedEvent extends Event {
  const FamilyGalleryOpenedEvent();
}

// Asset Viewer Events
class ViewerShowDetailsEvent extends Event {
  const ViewerShowDetailsEvent();
}

class ViewerReloadAssetEvent extends Event {
  const ViewerReloadAssetEvent();
}

// Multi-Select Events
class MultiSelectToggleEvent extends Event {
  final bool isEnabled;
  const MultiSelectToggleEvent(this.isEnabled);
}

// Map Events
class MapMarkerReloadEvent extends Event {
  const MapMarkerReloadEvent();
}
