import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/exif.model.dart';
import 'package:immich_mobile/extensions/platform_extensions.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';

@RoutePage()
class AssetTroubleshootPage extends ConsumerWidget {
  final BaseAsset asset;

  const AssetTroubleshootPage({super.key, required this.asset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: Text('asset_troubleshoot'.tr())),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: _AssetDetailsView(asset: asset),
        ),
      ),
    );
  }
}

class _AssetDetailsView extends ConsumerWidget {
  final BaseAsset asset;

  const _AssetDetailsView({required this.asset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _AssetPropertiesSection(asset: asset),
        const SizedBox(height: 16),
        Text(
          'matching_assets'.tr(),
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
        ),
        if (asset.checksum != null) ...[
          _LocalAssetsSection(asset: asset),
          const SizedBox(height: 16),
          _RemoteAssetSection(asset: asset),
        ] else ...[
          _PropertySectionCard(
            title: 'Pliki lokalne',
            properties: [_PropertyItem(label: 'Stan', value: 'no_checksum_local'.tr())],
          ),
          const SizedBox(height: 16),
          _PropertySectionCard(
            title: 'Pliki na serwerze',
            properties: [_PropertyItem(label: 'Stan', value: 'no_checksum_remote'.tr())],
          ),
        ],
      ],
    );
  }
}

class _AssetPropertiesSection extends ConsumerStatefulWidget {
  final BaseAsset asset;

  const _AssetPropertiesSection({required this.asset});

  @override
  ConsumerState createState() => _AssetPropertiesSectionState();
}

class _AssetPropertiesSectionState extends ConsumerState<_AssetPropertiesSection> {
  List<_PropertyItem> properties = [];

  @override
  void initState() {
    super.initState();
    _buildAssetProperties(widget.asset).whenComplete(() {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final title = _getAssetTypeTitle(widget.asset);

    return _PropertySectionCard(title: title, properties: properties);
  }

  Future<void> _buildAssetProperties(BaseAsset asset) async {
    _addCommonProperties();

    if (asset is LocalAsset) {
      await _addLocalAssetProperties(asset);
    } else if (asset is RemoteAsset) {
      await _addRemoteAssetProperties(asset);
    }
  }

  void _addCommonProperties() {
    final asset = widget.asset;
    properties.addAll([
      _PropertyItem(label: 'Nazwa', value: asset.name),
      _PropertyItem(label: 'Suma kontrolna', value: asset.checksum),
      _PropertyItem(label: 'Typ', value: asset.type.toString()),
      _PropertyItem(label: 'Data utworzenia', value: asset.createdAt.toString()),
      _PropertyItem(label: 'Data aktualizacji', value: asset.updatedAt.toString()),
      _PropertyItem(label: 'Szerokość', value: asset.width?.toString()),
      _PropertyItem(label: 'Wysokość', value: asset.height?.toString()),
      _PropertyItem(label: 'Czas trwania', value: asset.durationMs != null ? '${asset.durationMs} ms' : null),
      _PropertyItem(label: 'Ulubione', value: asset.isFavorite.toString()),
      _PropertyItem(label: 'ID filmu Live Photo', value: asset.livePhotoVideoId),
      _PropertyItem(label: 'Edytowane', value: asset.isEdited.toString()),
    ]);
  }

  Future<void> _addLocalAssetProperties(LocalAsset asset) async {
    properties.insertAll(0, [
      _PropertyItem(label: 'ID lokalne', value: asset.id),
      _PropertyItem(label: 'ID na serwerze', value: asset.remoteId),
    ]);

    properties.insert(4, _PropertyItem(label: 'Orientacja', value: asset.orientation.toString()));
    final albums = await ref.read(assetServiceProvider).getSourceAlbums(asset.id);
    properties.add(_PropertyItem(label: 'Album', value: albums.map((a) => a.name).join(', ')));
    if (CurrentPlatform.isIOS) {
      properties.add(_PropertyItem(label: 'ID w chmurze', value: asset.cloudId));
      properties.add(_PropertyItem(label: 'Czas korekty', value: asset.adjustmentTime?.toString()));
    }
    properties.add(
      _PropertyItem(
        label: 'Współrzędne GPS',
        value: asset.hasCoordinates ? '${asset.latitude}, ${asset.longitude}' : null,
      ),
    );
  }

  Future<void> _addRemoteAssetProperties(RemoteAsset asset) async {
    properties.insertAll(0, [
      _PropertyItem(label: 'ID na serwerze', value: asset.id),
      _PropertyItem(label: 'ID lokalne', value: asset.localId),
      _PropertyItem(label: 'ID właściciela', value: asset.ownerId),
    ]);

    final additionalProps = <_PropertyItem>[
      _PropertyItem(label: 'Skrót miniatury', value: asset.thumbHash),
      _PropertyItem(label: 'Widoczność', value: asset.visibility.toString()),
      _PropertyItem(label: 'ID stosu', value: asset.stackId),
    ];

    properties.insertAll(4, additionalProps);

    final exif = await ref.read(assetServiceProvider).getExif(asset);
    if (exif != null) {
      _addExifProperties(exif);
    } else {
      properties.add(const _PropertyItem(label: 'EXIF', value: null));
    }
  }

  void _addExifProperties(ExifInfo exif) {
    properties.addAll([
      _PropertyItem(
        label: 'Rozmiar pliku',
        value: exif.fileSize != null ? '${(exif.fileSize! / 1024 / 1024).toStringAsFixed(2)} MB' : null,
      ),
      _PropertyItem(label: 'Opis', value: exif.description),
      _PropertyItem(label: 'Data wykonania', value: exif.dateTimeOriginal?.toString()),
      _PropertyItem(label: 'Strefa czasowa', value: exif.timeZone),
      _PropertyItem(label: 'Producent aparatu', value: exif.make),
      _PropertyItem(label: 'Model aparatu', value: exif.model),
      _PropertyItem(label: 'Obiektyw', value: exif.lens),
      _PropertyItem(label: 'F-Number', value: exif.f != null ? 'f/${exif.fNumber}' : null),
      _PropertyItem(label: 'Ogniskowa', value: exif.mm != null ? '${exif.focalLength}mm' : null),
      _PropertyItem(label: 'ISO', value: exif.iso?.toString()),
      _PropertyItem(label: 'Czas naświetlania', value: exif.exposureTime.isNotEmpty ? exif.exposureTime : null),
      _PropertyItem(
        label: 'Współrzędne GPS',
        value: exif.hasCoordinates ? '${exif.latitude}, ${exif.longitude}' : null,
      ),
      _PropertyItem(
        label: 'Lokalizacja',
        value: [exif.city, exif.state, exif.country].where((e) => e != null && e.isNotEmpty).join(', '),
      ),
    ]);
  }

  String _getAssetTypeTitle(BaseAsset asset) {
    if (asset is LocalAsset) {
      return 'Local Asset';
    }
    if (asset is RemoteAsset) {
      return 'Remote Asset';
    }
    return 'Base Asset';
  }
}

class _LocalAssetsSection extends ConsumerWidget {
  final BaseAsset asset;

  const _LocalAssetsSection({required this.asset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assetService = ref.watch(assetServiceProvider);

    return FutureBuilder<List<LocalAsset?>>(
      future: assetService.getLocalAssetsByChecksum(asset.checksum!),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _PropertySectionCard(
            title: 'Pliki lokalne',
            properties: [_PropertyItem(label: 'Stan', value: 'Ładowanie…')],
          );
        }

        if (snapshot.hasError) {
          return _PropertySectionCard(
            title: 'Pliki lokalne',
            properties: [_PropertyItem(label: 'Błąd', value: snapshot.error.toString())],
          );
        }

        final localAssets = snapshot.data?.cast<LocalAsset>() ?? [];
        if (asset is LocalAsset) {
          localAssets.removeWhere((a) => a.id == (asset as LocalAsset).id);

          if (localAssets.isEmpty) {
            return const SizedBox.shrink();
          }
        }

        if (localAssets.isEmpty) {
          return _PropertySectionCard(
            title: 'Pliki lokalne',
            properties: [_PropertyItem(label: 'Stan', value: 'no_local_assets_found'.tr())],
          );
        }

        return Column(
          children: [
            if (localAssets.length > 1)
              _PropertySectionCard(
                title: 'Podsumowanie plików lokalnych',
                properties: [_PropertyItem(label: 'Łączna liczba', value: localAssets.length.toString())],
              ),
            ...localAssets.map((localAsset) {
              return Padding(
                padding: const EdgeInsets.only(top: 16),
                child: _AssetPropertiesSection(asset: localAsset),
              );
            }),
          ],
        );
      },
    );
  }
}

class _RemoteAssetSection extends ConsumerWidget {
  final BaseAsset asset;

  const _RemoteAssetSection({required this.asset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final assetService = ref.watch(assetServiceProvider);

    if (asset is RemoteAsset) {
      return const SizedBox.shrink();
    }

    return FutureBuilder<RemoteAsset?>(
      future: assetService.getRemoteAssetByChecksum(asset.checksum!),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const _PropertySectionCard(
            title: 'Pliki na serwerze',
            properties: [_PropertyItem(label: 'Stan', value: 'Ładowanie…')],
          );
        }

        if (snapshot.hasError) {
          return _PropertySectionCard(
            title: 'Pliki na serwerze',
            properties: [_PropertyItem(label: 'Błąd', value: snapshot.error.toString())],
          );
        }

        final remoteAsset = snapshot.data;

        if (remoteAsset == null) {
          return _PropertySectionCard(
            title: 'Pliki na serwerze',
            properties: [_PropertyItem(label: 'Stan', value: 'no_remote_assets_found'.tr())],
          );
        }

        return _AssetPropertiesSection(asset: remoteAsset);
      },
    );
  }
}

class _PropertySectionCard extends StatelessWidget {
  final String title;
  final List<_PropertyItem> properties;

  const _PropertySectionCard({required this.title, required this.properties});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ...properties,
          ],
        ),
      ),
    );
  }
}

class _PropertyItem extends StatelessWidget {
  final String label;
  final String? value;

  const _PropertyItem({required this.label, this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text('$label:', style: const TextStyle(fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Text(
              value ?? 'not_available'.tr(),
              style: TextStyle(color: Theme.of(context).colorScheme.secondary),
            ),
          ),
        ],
      ),
    );
  }
}
