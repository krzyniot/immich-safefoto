import 'dart:convert';

import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/family_sync_cache.service.dart';
import 'package:immich_mobile/domain/services/family_private_visibility.service.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/presentation/widgets/bottom_sheet/family_bulk_action.widget.dart';
import 'package:immich_mobile/providers/timeline/multiselect.provider.dart';
import 'package:immich_mobile/providers/infrastructure/family_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/store.provider.dart';

import '../fixtures/user.stub.dart';

class _Cache implements FamilySyncCacheStore {
  String? data = 'old family snapshot';
  @override
  Future<String?> read() async => data;
  @override
  Future<void> write(String json) async => data = json;
  @override
  Future<void> clear() async => data = null;
}

RemoteAsset photo(String owner) => RemoteAsset(
  id: 'a9c96a77-2254-4d30-bfc9-0a7a69bc8a10',
  ownerId: owner,
  name: 'rodzina.jpg',
  checksum: null,
  type: AssetType.image,
  createdAt: DateTime.utc(2026, 9, 28),
  updatedAt: DateTime.utc(2026, 9, 28),
  isEdited: false,
);

void main() {
  late Drift db;
  late StoreService store;
  late _Cache cache;
  late int requests;
  late String? lastMode;
  late int responseCode;
  late http.Client client;

  setUp(() async {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    store = await StoreService.init(storeRepository: DriftStoreRepository(db), listenUpdates: false);
    await store.put(StoreKey.currentUser, UserStub.admin);
    await store.put(StoreKey.serverEndpoint, 'https://test.safefoto.pl/api');
    await store.put(StoreKey.accessToken, 'test-token');
    cache = _Cache();
    requests = 0;
    lastMode = null;
    responseCode = 204;
    client = MockClient((request) async {
      requests++;
      lastMode = (jsonDecode(request.body) as Map<String, dynamic>)['mode'] as String;
      return http.Response('', responseCode);
    });
  });

  tearDown(() async {
    client.close();
    await store.dispose();
    await db.close();
  });

  Future<void> showButton(WidgetTester tester, String owner, String mode) async {
    final service = FamilySyncCacheService(
      cache: cache,
      identity: () => currentFamilySyncIdentity(store),
      fetchManifest: () async => FamilySyncManifest.fromJson({
        'version': 1,
        'householdId': 'household-1',
        'generatedAt': '2026-09-28T10:00:00Z',
        'assets': [],
        'albums': [],
        'albumAssets': [],
      }),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          storeServiceProvider.overrideWithValue(store),
          familyPrivateVisibilityProvider.overrideWithValue(FamilyPrivateVisibilityService(store, db: db)),
          familySyncCacheServiceProvider.overrideWithValue(service),
          familySyncApiRepositoryProvider.overrideWithValue(
            FamilySyncApiRepository(apiBasePath: 'http://test/api', client: client),
          ),
        ],
        child: MaterialApp(
          home: Scaffold(body: FamilyBulkAction(mode: mode)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    ProviderScope.containerOf(
      tester.element(find.byType(FamilyBulkAction)),
    ).read(multiSelectProvider.notifier).selectAsset(photo(owner));
    await tester.pumpAndSettle();
  }

  testWidgets('bulk move publishes only owned remote images and hides personal timeline', (tester) async {
    await showButton(tester, UserStub.admin.id, 'move');
    await tester.tap(find.text('Przenieś do rodziny'));
    await tester.pumpAndSettle();
    expect(find.text('Wybierz tylko własne zdjęcia zapisane w SafeFoto.'), findsNothing);
    expect(find.text('Błąd połączenia. Sprawdź galerię przed ponowną próbą.'), findsNothing);
    expect(requests, 1);
    expect(lastMode, 'move');
    expect(cache.data, isNull);
    expect(store.tryGet(StoreKey.familyPrivateHiddenJson), contains(photo(UserStub.admin.id).id));
  });

  testWidgets('bulk share retains personal timeline', (tester) async {
    await showButton(tester, UserStub.admin.id, 'share');
    await tester.tap(find.text('Udostępnij rodzinie'));
    await tester.pumpAndSettle();
    expect(find.text('Wybierz tylko własne zdjęcia zapisane w SafeFoto.'), findsNothing);
    expect(find.text('Błąd połączenia. Sprawdź galerię przed ponowną próbą.'), findsNothing);
    expect(requests, 1);
    expect(lastMode, 'share');
    expect(store.tryGet(StoreKey.familyPrivateHiddenJson) ?? '', isNot(contains(photo(UserStub.admin.id).id)));
  });

  testWidgets('bulk action refuses images owned by someone else', (tester) async {
    await showButton(tester, 'different-owner', 'move');
    await tester.tap(find.text('Przenieś do rodziny'));
    await tester.pumpAndSettle();
    expect(requests, 0);
    expect(cache.data, isNotNull);
  });
}
