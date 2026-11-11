import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const newcomer = "10000000-0000-4000-8000-000000000003";
const pending = "10000000-0000-4000-8000-000000000004";
const other = "10000000-0000-4000-8000-000000000005";
const operation = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
let group: string;

async function asUser(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

describe("username and invitation migration", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      insert into auth.users (id, email, email_confirmed_at) values
        ('${owner}', 'owner@example.test', now()),
        ('${member}', 'member@example.test', now()),
        ('${pending}', 'pending@example.test', null),
        ('${other}', 'other@example.test', now());
    `);
    await db.exec(await readFile("supabase/schema.sql", "utf8"));
    await db.exec("set role authenticated");
    await asUser(owner);
    const result = await db.query<{ id: string }>("select public.create_competition_group('Finals') as id");
    group = result.rows[0].id;
    await db.query("select public.invite_group_member($1, $2)", [group, "member@example.test"]);
    await db.query("select public.invite_group_member($1, $2)", [group, "pending@example.test"]);
    await db.query("insert into public.operations (id, owner_id, group_id, payload) values ($1, $2, $3, $4)", [operation, owner, group, { id: operation }]);
    await db.exec("reset role");
    const migration = await readFile("supabase/username-migration.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("set role authenticated");
  }, 30000);

  afterAll(async () => { await db?.close(); });

  it("preserves existing members, operations, and queued email invitations", async () => {
    await asUser(member);
    expect((await db.query("select id from public.operations")).rows).toEqual([{ id: operation }]);
    await asUser(pending);
    expect((await db.query("select public.claim_group_invites() as count")).rows).toEqual([{ count: 0 }]);
    await db.exec("reset role");
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [pending]);
    await db.exec("set role authenticated");
    await asUser(pending);
    await db.query("select public.claim_group_invites()");
    expect((await db.query("select id from public.operations")).rows).toEqual([]);
    const invites = await db.query<{ invite_id: string }>("select invite_id from public.list_my_group_invites()");
    expect(invites.rows).toHaveLength(1);
    await db.query("select public.respond_group_invite($1, true)", [invites.rows[0].invite_id]);
    expect((await db.query("select id from public.operations")).rows).toEqual([{ id: operation }]);
  });

  it("enforces unique normalized usernames on signup and for existing accounts", async () => {
    await asUser(owner);
    expect((await db.query("select public.claim_username('Captain') as name")).rows).toEqual([{ name: "captain" }]);
    await asUser(member);
    await expect(db.query("select public.claim_username('CAPTAIN')")).rejects.toThrow();
    await expect(db.query("select public.claim_username('bad-name')")).rejects.toThrow();
    await db.query("select public.claim_username('member_2')");
    await db.exec("reset role");
    await db.query("insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3)", [newcomer, "new@example.test", { username: "TEAM_42" }]);
    await expect(db.query("insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)", ["10000000-0000-4000-8000-000000000006", "duplicate@example.test", { username: "team_42" }])).rejects.toThrow();
    await expect(db.query("insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)", ["10000000-0000-4000-8000-000000000007", "invalid@example.test", {}])).rejects.toThrow();
    await db.exec("set role authenticated");
    await asUser(newcomer);
    expect((await db.query("select username from public.user_profiles")).rows).toEqual([{ username: "team_42" }]);
    expect((await db.query("select username from public.search_usernames('APT')")).rows).toEqual([{ username: "captain" }]);
    await expect(db.query("select * from public.search_usernames('ca')")).rejects.toThrow();
    await expect(db.query("select * from public.username_invites")).rejects.toThrow();
  });

  it("requires the invited user's acceptance before sharing a calendar", async () => {
    await asUser(owner);
    await expect(db.query("select public.invite_group_member($1, $2)", [group, "other@example.test"])).rejects.toThrow();
    await expect(db.query("select public.invite_group_username($1, 'member_2')", [group])).rejects.toThrow();
    expect((await db.query("select public.invite_group_username($1, 'TEAM_42') as status", [group])).rows).toEqual([{ status: "sent" }]);
    expect((await db.query("select public.invite_group_username($1, 'team_42') as status", [group])).rows).toEqual([{ status: "pending" }]);
    await asUser(newcomer);
    expect((await db.query("select id from public.operations")).rows).toEqual([]);
    const invites = await db.query<{ invite_id: string }>("select invite_id from public.list_my_group_invites()");
    expect(invites.rows).toHaveLength(1);
    await asUser(other);
    await expect(db.query("select public.respond_group_invite($1, true)", [invites.rows[0].invite_id])).rejects.toThrow();
    await expect(db.query("select public.invite_group_username($1, 'team_42')", [group])).rejects.toThrow();
    await asUser(newcomer);
    await db.query("select public.respond_group_invite($1, false)", [invites.rows[0].invite_id]);
    expect((await db.query("select id from public.operations")).rows).toEqual([]);
    await asUser(owner);
    await db.query("select public.invite_group_username($1, 'team_42')", [group]);
    await asUser(newcomer);
    const retry = await db.query<{ invite_id: string }>("select invite_id from public.list_my_group_invites()");
    await db.query("select public.respond_group_invite($1, true)", [retry.rows[0].invite_id]);
    expect((await db.query("select id from public.operations")).rows).toEqual([{ id: operation }]);
    await asUser(owner);
    expect((await db.query("select username from public.group_roster($1)", [group])).rows).toContainEqual({ username: "team_42" });
  });
});
