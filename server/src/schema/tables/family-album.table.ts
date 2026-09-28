import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { FamilyPhotoPublicationMode } from 'src/dtos/family-photo.dto';
import { AlbumTable } from 'src/schema/tables/album.table';
import { HouseholdTable } from 'src/schema/tables/household.table';

@Table('family_album')
export class FamilyAlbumTable {
  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, primary: true })
  albumId!: string;

  @ForeignKeyColumn(() => HouseholdTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, index: true })
  householdId!: string;

  @Column({ type: 'character varying', length: 8 })
  defaultMode!: FamilyPhotoPublicationMode.Share | FamilyPhotoPublicationMode.Move;

  @CreateDateColumn()
  publishedAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
