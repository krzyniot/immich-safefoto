import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/presentation/pages/family_gallery.page.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';
import 'package:immich_mobile/providers/infrastructure/user.provider.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:mocktail/mocktail.dart';

import '../domain/service.mock.dart';
import '../fixtures/user.stub.dart';

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
  late Drift db;
  late StoreService store;
  late MockUserService users;
  late _MemoryCache cache;
  late FamilySyncManifest response;

  setUp(() async {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    store = await StoreService.create(storeRepository: DriftStoreRepository(db), listenUpdates: false);
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
        ],
        child: const MaterialApp(home: FamilyGalleryPage()),
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
