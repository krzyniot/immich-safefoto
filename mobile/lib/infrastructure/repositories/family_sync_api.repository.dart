import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/infrastructure/repositories/network.repository.dart';
import 'package:immich_mobile/services/api.service.dart';

class FamilySyncFetchException implements Exception {
  const FamilySyncFetchException(this.statusCode);
  final int statusCode;

  @override
  String toString() => 'SafeFoto family manifest request failed: HTTP $statusCode';
}

/// The native HTTP client already carries the session authentication configured
/// by ApiService. Tests may inject an isolated mock HTTP client.
class FamilySyncApiRepository {
  const FamilySyncApiRepository({required this.apiBasePath, required this.client, this.headers = const {}});

  factory FamilySyncApiRepository.fromApiService(ApiService api) => FamilySyncApiRepository(
    apiBasePath: api.apiClient.basePath,
    client: NetworkRepository.client,
    headers: ApiService.getRequestHeaders(),
  );

  final String apiBasePath;
  final http.Client client;
  final Map<String, String> headers;

  Future<FamilySyncManifest> fetchManifest() async {
    final basePath = apiBasePath.replaceFirst(RegExp(r'/$'), '');
    final response = await client
        .get(Uri.parse('$basePath/family/sync/manifest'), headers: {'Accept': 'application/json', ...headers})
        .timeout(const Duration(seconds: 60));

    if (response.statusCode != 200) {
      throw FamilySyncFetchException(response.statusCode);
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid family manifest response');
    }
    // A malformed or failed response must NEVER trigger shared-cache eviction.
    return FamilySyncManifest.fromJson(decoded);
  }
}
