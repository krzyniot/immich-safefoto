import {
  Column,
  CreateDateColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { ColumnType } from 'kysely';

@Table('household')
export class HouseholdTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @Column({ type: 'bigint', nullable: true })
  quotaSizeInBytes!: ColumnType<number> | null;

  @Column({ type: 'boolean', default: true })
  isQuotaAutoBalanced!: Generated<boolean>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
