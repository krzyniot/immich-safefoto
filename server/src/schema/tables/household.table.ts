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

  @Column({ type: 'character varying', length: 80, nullable: true })
  name!: string | null;

  @Column({ type: 'bigint', nullable: true })
  quotaSizeInBytes!: ColumnType<number> | null;

  @Column({ type: 'boolean', default: true })
  isQuotaAutoBalanced!: Generated<boolean>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;
}
