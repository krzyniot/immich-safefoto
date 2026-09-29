import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:immich_mobile/domain/models/family_sync_manifest.model.dart';
import 'package:immich_mobile/infrastructure/repositories/network.repository.dart';
import 'package:immich_mobile/services/api.service.dart';

class FamilySyncFetchException implements Exception {
  const FamilySyncFetchException(this.statusCode);
  final int statusCode;

  @override
  String toString() =>
      'SafeFoto family manifest request failed: HTTP $statusCode';
}

/// The native HTTP client already carries the session authentication configured
/// by ApiService. Tests may inject an isolated mock HTTP client.
class FamilySyncApiRepository {
  const FamilySyncApiRepository({
    required this.apiBasePath,
    required this.client,
    this.headers = const {},
    this.headersProvider,
    this.apiBasePathProvider,
  });

  factory FamilySyncApiRepository.fromApiService(ApiService api) =>
      FamilySyncApiRepository(
        apiBasePath: api.apiClient.basePath,
        client: NetworkRepository.client,
        headersProvider: ApiService.getRequestHeaders,
        apiBasePathProvider: () => api.apiClient.basePath,
      );

  final String apiBasePath;
  final http.Client client;
  final Map<String, String> headers;
  final Map<String, String> Function()? headersProvider;
  final String Function()? apiBasePathProvider;

  /// The server re-checks ownership and family membership. No local originals
  /// or phone gallery are modified by this operation.
  Future<void> updatePublication({
    required List<String> assetIds,
    required String mode,
  }) async {
    if (assetIds.isEmpty ||
        assetIds.length > 1000 ||
        !{'share', 'move', 'private'}.contains(mode)) {
      throw ArgumentError('Invalid family publication request');
    }
    final basePath = (apiBasePathProvider?.call() ?? apiBasePath).replaceFirst(
      RegExp(r'/$'),
      '',
    );
    final response = await client
        .put(
          Uri.parse('$basePath/family/photos/publication'),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...headers,
            ...?headersProvider?.call(),
          },
          body: jsonEncode({'assetIds': assetIds, 'mode': mode}),
        )
        .timeout(const Duration(seconds: 60));
    if (response.statusCode != 204) {
      throw FamilySyncFetchException(response.statusCode);
    }
  }

  Future<void> addPhotosToFamilyAlbum({
    required String albumId,
    required List<String> assetIds,
  }) async {
    if (assetIds.isEmpty || assetIds.length > 1000)
      throw ArgumentError('Invalid album request');
    final basePath = (apiBasePathProvider?.call() ?? apiBasePath).replaceFirst(
      RegExp(r'/$'),
      '',
    );
    final response = await client
        .put(
          Uri.parse('$basePath/family/albums/$albumId/photos'),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...headers,
            ...?headersProvider?.call(),
          },
          body: jsonEncode({'assetIds': assetIds, 'mode': 'share'}),
        )
        .timeout(const Duration(seconds: 60));
    if (response.statusCode != 204)
      throw FamilySyncFetchException(response.statusCode);
  }

  Future<FamilySyncManifest> fetchManifest() async {
    final basePath = (apiBasePathProvider?.call() ?? apiBasePath).replaceFirst(
      RegExp(r'/$'),
      '',
    );
    final response = await client
        .get(
          Uri.parse('$basePath/family/sync/manifest'),
          headers: {
            'Accept': 'application/json',
            ...headers,
            ...?headersProvider?.call(),
          },
        )
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
