import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { AssetTable } from 'src/schema/tables/asset.table';
import { HouseholdTable } from 'src/schema/tables/household.table';

@Table('family_asset')
export class FamilyAssetTable {
  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, primary: true })
  assetId!: string;

  @ForeignKeyColumn(() => HouseholdTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, index: true })
  householdId!: string;

  @Column({ type: 'boolean', default: false })
  hideFromPersonalTimeline!: Generated<boolean>;

  @CreateDateColumn()
  publishedAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
