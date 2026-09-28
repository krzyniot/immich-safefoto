import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';

Map<String, dynamic> payload() => {
  'version': 1,
  'householdId': 'household-1',
  'generatedAt': '2026-09-28T10:00:00Z',
  'assets': <Object>[],
  'albums': <Object>[],
  'albumAssets': <Object>[],
};

void main() {
  test('fetches a complete authenticated manifest using the configured API base URL', () async {
    final client = MockClient((request) async {
      expect(request.url.toString(), 'http://test.local/api/family/sync/manifest');
      expect(request.headers['Accept'], 'application/json');
      expect(request.headers['X-Test-Auth'], 'session');
      return http.Response(jsonEncode(payload()), 200);
    });
    final repository = FamilySyncApiRepository(
      apiBasePath: 'http://test.local/api/',
      client: client,
      headers: {'X-Test-Auth': 'session'},
    );
    final manifest = await repository.fetchManifest();
    expect(manifest.householdId, 'household-1');
    expect(manifest.assets, isEmpty);
    client.close();
  });

  test('failed HTTP request throws and cannot produce an empty eviction manifest', () async {
    final client = MockClient((_) async => http.Response('Unavailable', 503));
    final repository = FamilySyncApiRepository(apiBasePath: 'http://test.local/api', client: client);
    await expectLater(repository.fetchManifest(), throwsA(isA<FamilySyncFetchException>()));
    client.close();
  });

  test('invalid or partial JSON throws instead of returning a manifest', () async {
    final client = MockClient((_) async => http.Response(jsonEncode({...payload(), 'assets': null}), 200));
    final repository = FamilySyncApiRepository(apiBasePath: 'http://test.local/api', client: client);
    await expectLater(repository.fetchManifest(), throwsFormatException);
    client.close();
  });

  test('unknown schema version throws instead of reconciling incompatible data', () async {
    final client = MockClient((_) async => http.Response(jsonEncode({...payload(), 'version': 2}), 200));
    final repository = FamilySyncApiRepository(apiBasePath: 'http://test.local/api', client: client);
    await expectLater(repository.fetchManifest(), throwsFormatException);
    client.close();
  });
}
