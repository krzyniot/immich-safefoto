import { Kysely } from 'kysely';
import { AlbumUserRole } from 'src/enum';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

describe('SafeFoto household invitations - Stage 3B', () => {
  let database: Kysely<DB>;
  let ctx: SyncTestContext;
  let users: UserRepository;
  const GiB = 1024 ** 3;

  beforeAll(async () => {
    database = await getKyselyDB();
    ctx = new SyncTestContext(database);
    users = ctx.get(UserRepository);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it('allows only the household admin to invite active outsiders once', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: outsider } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    await expect(users.createHouseholdInvitation(member.id, outsider.id)).rejects.toThrow('Household admin required');
    await expect(users.createHouseholdInvitation(admin.id, member.id)).rejects.toThrow('outside the household');
    await expect(users.createHouseholdInvitation(admin.id, '00000000-0000-0000-0000-000000000000'))
      .rejects.toThrow('active user');
    const invitation = await users.createHouseholdInvitation(admin.id, outsider.id);
    expect(invitation.status).toBe('PENDING');
    expect(invitation.adminId).toBe(admin.id);
    expect(invitation.inviteeId).toBe(outsider.id);
    expect((await users.listHouseholdInvitations(outsider.id)).map(({ id }) => id)).toContain(invitation.id);
    await expect(users.createHouseholdInvitation(admin.id, outsider.id)).rejects.toThrow('already pending');
  });

  it('lists pending invitations for both household admin and invitee', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: invitee } = await ctx.newUser();
    const invitation = await users.createHouseholdInvitation(admin.id, invitee.id);
    const outgoing = await users.listOutgoingHouseholdInvitations(admin.id);
    const incoming = await users.listIncomingHouseholdInvitations(invitee.id);
    expect(outgoing).toHaveLength(1);
    expect(incoming).toHaveLength(1);
    expect(outgoing[0]).toMatchObject({ id: invitation.id, inviteeId: invitee.id, adminId: admin.id });
    expect(incoming[0]).toMatchObject({ id: invitation.id, inviteeId: invitee.id, adminId: admin.id });
    await users.cancelHouseholdInvitation(admin.id, invitation.id);
    await expect(users.listOutgoingHouseholdInvitations(admin.id)).resolves.toHaveLength(0);
    await expect(users.listIncomingHouseholdInvitations(invitee.id)).resolves.toHaveLength(0);
  });

  it('rechecks capacity at acceptance and rolls back membership and invitation on failure', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: invitee } = await ctx.newUser();
    const invitation = await users.createHouseholdInvitation(admin.id, invitee.id);
    const before = await users.getHouseholdId(invitee.id);
    for (let index = 0; index < 5; index++) {
      const { user } = await ctx.newUser();
      await users.moveToHouseholdOf(user.id, admin.id);
    }
    await expect(users.acceptHouseholdInvitation(invitee.id, invitation.id)).rejects.toThrow('Household is full');
    await expect(users.getHouseholdId(invitee.id)).resolves.toEqual(before);
    await expect(database.selectFrom('household_invitation').select('status').where('id', '=', invitation.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ status: 'PENDING' });
    await expect(users.createHouseholdInvitation(admin.id, invitee.id)).rejects.toThrow('Household is full');
  });

  it('preserves owned assets and removes only old shared album membership and partner relations', async () => {
    const { user: oldAdmin } = await ctx.newUser();
    const { user: invitee } = await ctx.newUser();
    const { user: newAdmin } = await ctx.newUser();
    await users.moveToHouseholdOf(invitee.id, oldAdmin.id);
    const oldHousehold = await users.getHouseholdId(oldAdmin.id);
    const owned = await ctx.newAsset({ ownerId: invitee.id });
    const shared = await ctx.newAsset({ ownerId: oldAdmin.id });
    const { album } = await ctx.newAlbum({ ownerId: oldAdmin.id }, [shared.asset.id]);
    await ctx.newAlbumUser({ albumId: album.id, userId: invitee.id, role: AlbumUserRole.Viewer });
    await ctx.newPartner({ sharedById: oldAdmin.id, sharedWithId: invitee.id });
    const invitation = await users.createHouseholdInvitation(newAdmin.id, invitee.id);
    const preview = await users.getHouseholdInvitationPreview(invitee.id, invitation.id);
    expect(preview).toEqual({ currentHouseholdId: oldHousehold!.householdId,
      targetHouseholdId: (await users.getHouseholdId(newAdmin.id))!.householdId, requiresAdminTransfer: false });
    await expect(users.acceptHouseholdInvitation(oldAdmin.id, invitation.id)).rejects.toThrow('unavailable');
    await users.acceptHouseholdInvitation(invitee.id, invitation.id);
    await expect(users.getHouseholdId(invitee.id)).resolves.toEqual(await users.getHouseholdId(newAdmin.id));
    await expect(users.getHouseholdId(oldAdmin.id)).resolves.toEqual(oldHousehold);
    expect(await database.selectFrom('asset').select('id').where('id', 'in', [owned.asset.id, shared.asset.id])
      .execute()).toHaveLength(2);
    await expect(database.selectFrom('album_user').select('userId').where('albumId', '=', album.id)
      .where('userId', '=', invitee.id).executeTakeFirst()).resolves.toBeUndefined();
    await expect(database.selectFrom('partner').select('sharedWithId').where('sharedWithId', '=', invitee.id)
      .executeTakeFirst()).resolves.toBeUndefined();
    await expect(users.acceptHouseholdInvitation(invitee.id, invitation.id)).rejects.toThrow('unavailable');
  });

  it('deletes an empty former household after a sole admin accepts', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: invitee } = await ctx.newUser();
    const oldHousehold = await users.getHouseholdId(invitee.id);
    const invitation = await users.createHouseholdInvitation(admin.id, invitee.id);
    await users.acceptHouseholdInvitation(invitee.id, invitation.id);
    await expect(database.selectFrom('household').select('id').where('id', '=', oldHousehold!.householdId)
      .executeTakeFirst()).resolves.toBeUndefined();
    await expect(database.selectFrom('household_invitation').select('status').where('id', '=', invitation.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ status: 'ACCEPTED' });
  });

  it('requires the old admin to transfer administration before accepting', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { user: targetAdmin } = await ctx.newUser();
    await users.moveToHouseholdOf(member.id, admin.id);
    const invitation = await users.createHouseholdInvitation(targetAdmin.id, admin.id);
    expect((await users.getHouseholdInvitationPreview(admin.id, invitation.id)).requiresAdminTransfer).toBe(true);
    await expect(users.acceptHouseholdInvitation(admin.id, invitation.id))
      .rejects.toThrow('must transfer administration');
    await users.transferHouseholdAdmin(admin.id, member.id);
    await users.acceptHouseholdInvitation(admin.id, invitation.id);
    await expect(users.getHouseholdId(admin.id)).resolves.toEqual(await users.getHouseholdId(targetAdmin.id));
    await expect(database.selectFrom('user').select('isHouseholdAdmin').where('id', '=', member.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ isHouseholdAdmin: true });
  });

  it('rejects quota failures without resolving the invitation', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: invitee } = await ctx.newUser();
    const invitation = await users.createHouseholdInvitation(admin.id, invitee.id);
    await users.setHouseholdQuota(admin.id, GiB, { mode: 'manual', limits: { [admin.id]: GiB } });
    await expect(users.acceptHouseholdInvitation(invitee.id, invitation.id)).rejects.toThrow('Free household quota');
    await expect(database.selectFrom('household_invitation').select('status').where('id', '=', invitation.id)
      .executeTakeFirstOrThrow()).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('does not accept rejected or cancelled invitations', async () => {
    const { user: admin } = await ctx.newUser();
    const { user: first } = await ctx.newUser();
    const { user: second } = await ctx.newUser();
    const rejected = await users.createHouseholdInvitation(admin.id, first.id);
    await users.rejectHouseholdInvitation(first.id, rejected.id);
    await expect(users.acceptHouseholdInvitation(first.id, rejected.id)).rejects.toThrow('unavailable');
    const cancelled = await users.createHouseholdInvitation(admin.id, second.id);
    await users.cancelHouseholdInvitation(admin.id, cancelled.id);
    await expect(users.acceptHouseholdInvitation(second.id, cancelled.id)).rejects.toThrow('unavailable');
  });
});
