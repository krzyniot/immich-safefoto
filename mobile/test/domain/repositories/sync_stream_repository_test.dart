import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/album/album.model.dart';
import 'package:immich_mobile/domain/models/album/local_album.model.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart' as domain;
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/infrastructure/entities/asset_face.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/local_album.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/local_album_asset.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/local_asset.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/partner.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/person.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/remote_album.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/remote_album_asset.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/remote_album_user.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/settings.entity.drift.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/sync_stream.repository.dart';
import 'package:openapi/api.dart';

SyncUserV1 _createUser({String id = 'user-1'}) {
  return SyncUserV1(
    id: id,
    name: 'Test User',
    email: 'test@test.com',
    deletedAt: null,
    avatarColor: const Optional.absent(),
    hasProfileImage: false,
    profileChangedAt: DateTime(2024, 1, 1),
  );
}

SyncAssetV1 _createAsset({
  required String id,
  required String checksum,
  required String fileName,
  String ownerId = 'user-1',
  int? width,
  int? height,
}) {
  return SyncAssetV1(
    id: id,
    checksum: checksum,
    originalFileName: fileName,
    type: AssetTypeEnum.IMAGE,
    ownerId: ownerId,
    isFavorite: false,
    fileCreatedAt: DateTime(2024, 1, 1),
    fileModifiedAt: DateTime(2024, 1, 1),
    createdAt: DateTime(2024, 1, 1),
    localDateTime: DateTime(2024, 1, 1),
    visibility: AssetVisibility.timeline,
    width: width,
    height: height,
    deletedAt: null,
    duration: null,
    libraryId: null,
    livePhotoVideoId: null,
    stackId: null,
    thumbhash: null,
    isEdited: false,
  );
}

SyncAssetExifV1 _createExif({
  required String assetId,
  required int width,
  required int height,
  required String orientation,
}) {
  return SyncAssetExifV1(
    assetId: assetId,
    exifImageWidth: width,
    exifImageHeight: height,
    orientation: orientation,
    city: null,
    country: null,
    dateTimeOriginal: null,
    description: null,
    exposureTime: null,
    fNumber: null,
    fileSizeInByte: null,
    focalLength: null,
    fps: null,
    iso: null,
    latitude: null,
    lensModel: null,
    longitude: null,
    make: null,
    model: null,
    modifyDate: null,
    profileDescription: null,
    projectionType: null,
    rating: null,
    state: null,
    timeZone: null,
  );
}

void main() {
  late Drift db;
  late SyncStreamRepository sut;

  setUp(() async {
    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    sut = SyncStreamRepository(db);
  });

  tearDown(() async {
    await db.close();
  });

  group('SyncStreamRepository - Dimension swapping based on orientation', () {
    test('swaps dimensions for asset with rotated orientation', () async {
      final flippedOrientations = ['5', '6', '7', '8', '90', '-90'];

      for (final orientation in flippedOrientations) {
        final assetId = 'asset-$orientation-degrees';

        await sut.updateUsersV1([_createUser()]);

        final asset = _createAsset(
          id: assetId,
          checksum: 'checksum-$orientation',
          fileName: 'rotated_$orientation.jpg',
        );
        await sut.updateAssetsV1([asset]);

        final exif = _createExif(
          assetId: assetId,
          width: 1920,
          height: 1080,
          orientation: orientation, // EXIF orientation value for 90 degrees CW
        );
        await sut.updateAssetsExifV1([exif]);

        final query = db.remoteAssetEntity.select()..where((tbl) => tbl.id.equals(assetId));
        final result = await query.getSingle();

        expect(result.width, equals(1080));
        expect(result.height, equals(1920));
      }
    });

    test('does not swap dimensions for asset with normal orientation', () async {
      final nonFlippedOrientations = ['1', '2', '3', '4'];
      for (final orientation in nonFlippedOrientations) {
        final assetId = 'asset-$orientation-degrees';

        await sut.updateUsersV1([_createUser()]);

        final asset = _createAsset(id: assetId, checksum: 'checksum-$orientation', fileName: 'normal_$orientation.jpg');
        await sut.updateAssetsV1([asset]);

        final exif = _createExif(
          assetId: assetId,
          width: 1920,
          height: 1080,
          orientation: orientation, // EXIF orientation value for normal
        );
        await sut.updateAssetsExifV1([exif]);

        final query = db.remoteAssetEntity.select()..where((tbl) => tbl.id.equals(assetId));
        final result = await query.getSingle();

        expect(result.width, equals(1920));
        expect(result.height, equals(1080));
      }
    });

    test('does not update dimensions if asset already has width and height', () async {
      const assetId = 'asset-with-dimensions';
      const existingWidth = 1920;
      const existingHeight = 1080;
      const exifWidth = 3840;
      const exifHeight = 2160;

      await sut.updateUsersV1([_createUser()]);

      final asset = _createAsset(
        id: assetId,
        checksum: 'checksum-with-dims',
        fileName: 'with_dimensions.jpg',
        width: existingWidth,
        height: existingHeight,
      );
      await sut.updateAssetsV1([asset]);

      final exif = _createExif(assetId: assetId, width: exifWidth, height: exifHeight, orientation: '6');
      await sut.updateAssetsExifV1([exif]);

      // Verify the asset still has original dimensions (not updated from EXIF)
      final query = db.remoteAssetEntity.select()..where((tbl) => tbl.id.equals(assetId));
      final result = await query.getSingle();

      expect(result.width, equals(existingWidth), reason: 'Width should remain as originally set');
      expect(result.height, equals(existingHeight), reason: 'Height should remain as originally set');
    });
  });

  group('SyncStreamRepository - reset()', () {
    test('SF-FAM-MOB-001 removes remote projections but preserves device assets', () async {
      await sut.updateUsersV1([_createUser(id: 'foreign-user')]);
      await sut.updateAssetsV1([
        _createAsset(
          id: 'foreign-asset',
          checksum: 'foreign-checksum',
          fileName: 'foreign.jpg',
          ownerId: 'foreign-user',
        ),
      ]);
      await sut.updateAssetsExifV1([
        _createExif(assetId: 'foreign-asset', width: 100, height: 100, orientation: '1'),
      ]);
      await db.remoteAlbumEntity.insertOne(
        RemoteAlbumEntityCompanion.insert(id: 'foreign-album', name: 'Foreign', order: AlbumAssetOrder.desc),
      );
      await db.remoteAlbumAssetEntity.insertOne(
        RemoteAlbumAssetEntityCompanion.insert(assetId: 'foreign-asset', albumId: 'foreign-album'),
      );
      await db.remoteAlbumUserEntity.insertOne(
        RemoteAlbumUserEntityCompanion.insert(
          albumId: 'foreign-album',
          userId: 'foreign-user',
          role: AlbumUserRole.owner,
        ),
      );
      await db.localAssetEntity.insertOne(
        LocalAssetEntityCompanion.insert(
          id: 'device-asset',
          name: 'device.jpg',
          type: domain.AssetType.image,
          checksum: const drift.Value('device-checksum'),
        ),
      );

      await sut.reset();

      expect(await db.userEntity.select().get(), isEmpty);
      expect(await db.remoteAlbumEntity.select().get(), isEmpty);
      expect(await db.remoteAssetEntity.select().get(), isEmpty);
      expect(await db.remoteExifEntity.select().get(), isEmpty);
      expect(await db.remoteAlbumAssetEntity.select().get(), isEmpty);
      expect(await db.remoteAlbumUserEntity.select().get(), isEmpty);
      expect(await db.localAssetEntity.select().get(), hasLength(1));
      expect((await db.localAssetEntity.select().getSingle()).id, 'device-asset');
    });

    test('SF-FAM-MOB-003 reset then resync cannot retain foreign user, album, or asset rows', () async {
      await sut.updateUsersV1([_createUser(id: 'foreign-user')]);
      await sut.updateAssetsV1([
        _createAsset(
          id: 'foreign-asset',
          checksum: 'foreign-checksum',
          fileName: 'foreign.jpg',
          ownerId: 'foreign-user',
        ),
      ]);
      await db.remoteAlbumEntity.insertOne(
        RemoteAlbumEntityCompanion.insert(id: 'foreign-album', name: 'Foreign', order: AlbumAssetOrder.desc),
      );

      await sut.reset();
      await sut.updateUsersV1([_createUser(id: 'allowed-user')]);
      await sut.updateAssetsV1([
        _createAsset(
          id: 'allowed-asset',
          checksum: 'allowed-checksum',
          fileName: 'allowed.jpg',
          ownerId: 'allowed-user',
        ),
      ]);
      await db.remoteAlbumEntity.insertOne(
        RemoteAlbumEntityCompanion.insert(id: 'allowed-album', name: 'Allowed', order: AlbumAssetOrder.desc),
      );

      expect((await db.userEntity.select().get()).map((row) => row.id), ['allowed-user']);
      expect((await db.remoteAlbumEntity.select().get()).map((row) => row.id), ['allowed-album']);
      expect((await db.remoteAssetEntity.select().get()).map((row) => row.id), ['allowed-asset']);
    });

    test('SF-FAM-MOB-004 reset removes stale partner projections', () async {
      await sut.updateUsersV1([_createUser(id: 'current-user'), _createUser(id: 'foreign-user')]);
      await db.partnerEntity.insertOne(
        PartnerEntityCompanion.insert(sharedById: 'foreign-user', sharedWithId: 'current-user'),
      );

      await sut.reset();

      expect(await db.partnerEntity.select().get(), isEmpty);
    });

    test('SF-FAM-MOB-005 reset removes stale people and face projections', () async {
      await sut.updateUsersV1([_createUser(id: 'foreign-user')]);
      await sut.updateAssetsV1([
        _createAsset(
          id: 'foreign-asset',
          checksum: 'foreign-checksum',
          fileName: 'foreign.jpg',
          ownerId: 'foreign-user',
        ),
      ]);
      await db.personEntity.insertOne(
        PersonEntityCompanion.insert(
          id: 'foreign-person',
          ownerId: 'foreign-user',
          name: 'Foreign Person',
          isFavorite: false,
          isHidden: false,
        ),
      );
      await db.assetFaceEntity.insertOne(
        AssetFaceEntityCompanion.insert(
          id: 'foreign-face',
          assetId: 'foreign-asset',
          personId: const drift.Value('foreign-person'),
          imageWidth: 100,
          imageHeight: 100,
          boundingBoxX1: 1,
          boundingBoxY1: 1,
          boundingBoxX2: 50,
          boundingBoxY2: 50,
          sourceType: 'machine-learning',
        ),
      );

      await sut.reset();

      expect(await db.personEntity.select().get(), isEmpty);
      expect(await db.assetFaceEntity.select().get(), isEmpty);
    });

    test('SF-FAM-MOB-007 reset preserves backup selection and settings', () async {
      await db.localAlbumEntity.insertOne(
        LocalAlbumEntityCompanion.insert(id: 'camera', name: 'Camera', backupSelection: BackupSelection.selected),
      );
      await db.localAssetEntity.insertOne(
        LocalAssetEntityCompanion.insert(id: 'device-asset', name: 'device.jpg', type: domain.AssetType.image),
      );
      await db.localAlbumAssetEntity.insertOne(
        LocalAlbumAssetEntityCompanion.insert(assetId: 'device-asset', albumId: 'camera'),
      );
      await db.settingsEntity.insertOne(
        SettingsEntityCompanion.insert(key: SettingsKey.backupEnabled.name, value: const drift.Value('true')),
      );

      await sut.reset();

      expect((await db.localAlbumEntity.select().getSingle()).backupSelection, BackupSelection.selected);
      expect(await db.localAlbumAssetEntity.select().get(), hasLength(1));
      expect((await db.settingsEntity.select().getSingle()).value, 'true');
    });

    test('nulls linkedRemoteAlbumId on localAlbumEntity so FK refs do not dangle', () async {
      const localAlbumId = 'local-1';
      const remoteAlbumId = 'remote-1';

      await db.remoteAlbumEntity.insertOne(
        RemoteAlbumEntityCompanion.insert(id: remoteAlbumId, name: 'Movies', order: AlbumAssetOrder.desc),
      );
      await db.localAlbumEntity.insertOne(
        LocalAlbumEntityCompanion.insert(
          id: localAlbumId,
          name: 'Movies',
          backupSelection: BackupSelection.selected,
          linkedRemoteAlbumId: const drift.Value(remoteAlbumId),
        ),
      );

      // sanity: link is set before reset
      final before = await (db.localAlbumEntity.select()..where((t) => t.id.equals(localAlbumId))).getSingle();
      expect(before.linkedRemoteAlbumId, equals(remoteAlbumId));

      await sut.reset();

      final after = await (db.localAlbumEntity.select()..where((t) => t.id.equals(localAlbumId))).getSingle();
      expect(
        after.linkedRemoteAlbumId,
        isNull,
        reason:
            'reset() runs with PRAGMA foreign_keys = OFF so the ON DELETE SET NULL cascade does not fire — the link must be nulled manually',
      );
      expect(after.name, equals('Movies'), reason: 'local album row itself must be preserved');
      expect(after.backupSelection, equals(BackupSelection.selected));

      final remoteRows = await db.remoteAlbumEntity.select().get();
      expect(remoteRows, isEmpty, reason: 'reset() still wipes remoteAlbumEntity');
    });

    test('preserves localAlbumEntity rows that have no linkedRemoteAlbumId', () async {
      const localAlbumId = 'local-unlinked';
      await db.localAlbumEntity.insertOne(
        LocalAlbumEntityCompanion.insert(id: localAlbumId, name: 'Camera', backupSelection: BackupSelection.none),
      );

      await sut.reset();

      final after = await (db.localAlbumEntity.select()..where((t) => t.id.equals(localAlbumId))).getSingle();
      expect(after.linkedRemoteAlbumId, isNull);
      expect(after.name, equals('Camera'));
      expect(after.backupSelection, equals(BackupSelection.none));
    });
  });
}
