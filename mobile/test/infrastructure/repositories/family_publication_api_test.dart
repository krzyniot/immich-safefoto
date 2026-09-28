import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/infrastructure/repositories/family_sync_api.repository.dart';

void main() {
  test('share and move and private send exact owner-publication API requests', () async {
    final modes = <String>[];
    final client = MockClient((request) async {
      expect(request.method, 'PUT');
      expect(request.url.toString(), 'https://test.safefoto.pl/api/family/photos/publication');
      expect(request.headers['Authorization'], 'Bearer session');
      expect(request.headers['Content-Type'], contains('application/json'));
      final data = jsonDecode(request.body) as Map<String, dynamic>;
      expect(data['assetIds'], ['a9c96a77-2254-4d30-bfc9-0a7a69bc8a10']);
      modes.add(data['mode'] as String);
      return http.Response('', 204);
    });
    final api = FamilySyncApiRepository(
      apiBasePath: 'https://test.safefoto.pl/api/',
      client: client,
      headersProvider: () => {'Authorization': 'Bearer session'},
    );
    for (final mode in ['share', 'move', 'private']) {
      await api.updatePublication(assetIds: ['a9c96a77-2254-4d30-bfc9-0a7a69bc8a10'], mode: mode);
    }
    expect(modes, ['share', 'move', 'private']);
    client.close();
  });

  test('invalid requests never reach the server', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return http.Response('', 204);
    });
    final api = FamilySyncApiRepository(apiBasePath: 'http://test/api', client: client);
    await expectLater(api.updatePublication(assetIds: [], mode: 'share'), throwsArgumentError);
    await expectLater(api.updatePublication(assetIds: ['id'], mode: 'delete'), throwsArgumentError);
    expect(requests, 0);
    client.close();
  });

  test('403 and server errors do not masquerade as successful publication', () async {
    for (final code in [401, 403, 500]) {
      final client = MockClient((_) async => http.Response('', code));
      final api = FamilySyncApiRepository(apiBasePath: 'http://test/api', client: client);
      await expectLater(
        api.updatePublication(assetIds: ['id'], mode: 'private'),
        throwsA(isA<FamilySyncFetchException>().having((error) => error.statusCode, 'status', code)),
      );
      client.close();
    }
  });

  test('unexpected 200 is not treated as the documented 204 mutation', () async {
    final client = MockClient((_) async => http.Response('{}', 200));
    final api = FamilySyncApiRepository(apiBasePath: 'http://test/api', client: client);
    await expectLater(api.updatePublication(assetIds: ['id'], mode: 'share'), throwsA(isA<FamilySyncFetchException>()));
    client.close();
  });
}
