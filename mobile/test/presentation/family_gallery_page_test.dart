import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/config/app_config.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/presentation/pages/family_gallery.page.dart';
import 'package:immich_mobile/presentation/widgets/timeline/timeline.widget.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/infrastructure/user.provider.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:mocktail/mocktail.dart';
// Test harness uses the already-resolved transitive plugin to mock platform preferences.
// ignore: depend_on_referenced_packages
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/service.mock.dart';
import '../fixtures/user.stub.dart';

class _EmptyTranslations extends AssetLoader {
  const _EmptyTranslations();

  @override
  Future<Map<String, dynamic>> load(String path, Locale locale) async => {};
}

class _MemoryCache implements FamilySyncCacheStore {
  String? data;
  @override
  Future<String?> read() async => data;
  @override
  Future<void> write(String json) async => data = json;
  @override
  Future<void> clear() async => data = null;
}

FamilySyncManifest emptyManifest({bool album = false}) => FamilySyncManifest.fromJson({
  'version': 1,
  'householdId': 'household-1',
  'generatedAt': '2026-09-28T10:00:00Z',
  'assets': <Object>[],
  'albums': album
      ? [
          {
            'id': 'album-1',
            'name': 'Wakacje',
            'description': '',
            'defaultMode': 'share',
            'updatedAt': '2026-09-28T10:00:00Z',
          },
        ]
      : <Object>[],
  'albumAssets': <Object>[],
});

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
    await initializeDateFormatting('pl');
  });
  late Drift db;
  late StoreService store;
  late MockUserService users;
  late _MemoryCache cache;
  late FamilySyncManifest response;

  setUp(() async {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    store = await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    await store.put(StoreKey.currentUser, UserStub.admin);
    await store.put(StoreKey.serverEndpoint, 'https://test.safefoto.pl/api');
    await store.put(StoreKey.accessToken, 'test-token');
    users = MockUserService();
    when(() => users.tryGetMyUser()).thenReturn(UserStub.admin);
    when(() => users.watchMyUser()).thenAnswer((_) => Stream.value(UserStub.admin));
    cache = _MemoryCache();
    response = emptyManifest();
  });

  tearDown(() async {
    await store.dispose();
    await db.close();
  });

  Future<void> showPage(WidgetTester tester, {Future<FamilySyncManifest> Function()? fetch}) async {
    final service = FamilySyncCacheService(
      cache: cache,
      identity: () => currentFamilySyncIdentity(store),
      fetchManifest: fetch ?? () async => response,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storeServiceProvider.overrideWithValue(store),
          userServiceProvider.overrideWithValue(users),
          familySyncCacheServiceProvider.overrideWithValue(service),
          appConfigProvider.overrideWithValue(const AppConfig()),
        ],
        child: EasyLocalization(
          supportedLocales: const [Locale('pl')],
          path: 'test',
          assetLoader: const _EmptyTranslations(),
          child: const MaterialApp(home: FamilyGalleryPage()),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows a distinct family gallery and an empty state after fetching', (tester) async {
    await showPage(tester);
    expect(find.text('Zdjęcia rodziny'), findsOneWidget);
    expect(find.textContaining('Nie ma jeszcze zdjęć'), findsOneWidget);
    expect(find.byIcon(Icons.delete), findsNothing);
  });

  testWidgets('displays album filters only for family albums returned by the manifest', (tester) async {
    response = emptyManifest(album: true);
    await showPage(tester);
    expect(find.text('Wszystkie'), findsOneWidget);
    expect(find.text('Wakacje'), findsOneWidget);
    await tester.tap(find.text('Wakacje'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nie ma jeszcze zdjęć'), findsOneWidget);
  });

  testWidgets('uses the same Timeline widget as the private gallery for family photos', (tester) async {
    response = FamilySyncManifest.fromJson({
      ...emptyManifest().toJson(),
      'assets': [
        {
          'id': 'family-photo',
          'ownerId': 'family-owner',
          'fileCreatedAt': '2026-09-28T10:00:00Z',
          'hideFromPersonalTimeline': true,
          'updatedAt': '2026-09-28T10:00:00Z',
        },
      ],
    });
    await showPage(tester);
    expect(find.byType(Timeline), findsOneWidget);
    final timeline = tester.widget<Timeline>(find.byType(Timeline));
    expect(timeline.readOnly, isTrue);
    expect(timeline.withScrubber, isTrue);
    expect(find.byIcon(Icons.delete), findsNothing);
  });

  testWidgets('switching access tokens hides an old family snapshot immediately', (tester) async {
    response = emptyManifest(album: true);
    await showPage(tester);
    expect(find.text('Wakacje'), findsOneWidget);
    await store.put(StoreKey.accessToken, 'another-session');
    await tester.pumpAndSettle();
    expect(find.text('Wakacje'), findsNothing);
  });

  testWidgets('revoked access hides an old cached family album', (tester) async {
    response = emptyManifest(album: true);
    await FamilySyncCacheService(
      cache: cache,
      identity: () => currentFamilySyncIdentity(store),
      fetchManifest: () async => response,
    ).refresh();
    await showPage(tester, fetch: () async => throw const FamilySyncFetchException(403));
    expect(find.textContaining('Brak dostępu'), findsOneWidget);
    expect(find.text('Wakacje'), findsNothing);
  });

  testWidgets('temporary network outage retains a previously verified family cache', (tester) async {
    response = emptyManifest(album: true);
    await FamilySyncCacheService(
      cache: cache,
      identity: () => currentFamilySyncIdentity(store),
      fetchManifest: () async => response,
    ).refresh();
    await showPage(tester, fetch: () async => throw const FamilySyncFetchException(503));
    expect(find.textContaining('Nie udało się odświeżyć'), findsOneWidget);
    expect(find.text('Wakacje'), findsOneWidget);
  });

  testWidgets('logout clears the visible family album even when user provider is stale', (tester) async {
    response = emptyManifest(album: true);
    await showPage(tester);
    expect(find.text('Wakacje'), findsOneWidget);
    await store.delete(StoreKey.accessToken);
    await tester.pumpAndSettle();
    expect(find.text('Wakacje'), findsNothing);
    expect(find.textContaining('Zaloguj się'), findsOneWidget);
  });

  testWidgets('a network failure never invents a successful empty manifest', (tester) async {
    await showPage(tester, fetch: () async => throw StateError('offline'));
    expect(find.textContaining('Nie udało się odświeżyć'), findsOneWidget);
    expect(find.textContaining('Nie ma jeszcze zdjęć'), findsNothing);
  });
}
