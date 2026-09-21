import { Column, CreateDateColumn, ForeignKeyColumn, Generated, PrimaryGeneratedColumn, Table, Timestamp } from '@immich/sql-tools';
import { HouseholdTable } from 'src/schema/tables/household.table';
import { UserTable } from 'src/schema/tables/user.table';

export type HouseholdInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

@Table('household_invitation')
export class HouseholdInvitationTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => HouseholdTable, { onDelete: 'CASCADE' })
  householdId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE' })
  adminId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'CASCADE' })
  inviteeId!: string;

  @Column({ type: 'character varying', length: 16 })
  status!: HouseholdInvitationStatus;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt!: Timestamp | null;
}
