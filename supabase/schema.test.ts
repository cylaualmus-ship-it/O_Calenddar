import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const outsider = "10000000-0000-4000-8000-000000000003";
const pending = "10000000-0000-4000-8000-000000000004";
const sharedId = "20000000-0000-4000-8000-000000000001";
const privateId = "20000000-0000-4000-8000-000000000002";
let db: PGlite;

async function asUser(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}

describe("Supabase database access policies", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values
        ('${owner}', 'owner@example.test', now()),
        ('${member}', 'member@example.test', now()),
        ('${outsider}', 'outsider@example.test', now()),
        ('${pending}', 'pending@example.test', null);
    `);
    await db.exec(await readFile("supabase/schema.sql", "utf8"));
    await db.exec("set role authenticated");
  }, 30000);

  afterAll(async () => { await db?.close(); });

  it("isolates private records, enforces group membership, and claims only verified invitations", async () => {
    await asUser(owner);
    const created = await db.query<{ id: string }>("select public.create_competition_group('Finals') as id");
    const group = created.rows[0].id;
    await db.query("select public.invite_group_member($1, $2)", [group, "member@example.test"]);
    await db.query("select public.invite_group_member($1, $2)", [group, "pending@example.test"]);
    await db.query("insert into public.operations (id, owner_id, group_id, payload) values ($1, $2, $3, $4)", [sharedId, owner, group, { id: sharedId }]);
    await db.query("insert into public.operations (id, owner_id, payload) values ($1, $2, $3)", [privateId, owner, { id: privateId }]);

    await asUser(outsider);
    expect((await db.query("select id from public.operations")).rows).toHaveLength(0);
    expect((await db.query("select id from public.competition_groups")).rows).toHaveLength(0);
    await expect(db.query("select public.invite_group_member($1, $2)", [group, "other@example.test"])).rejects.toThrow();
    await expect(db.query("insert into public.operations (id, owner_id, group_id, payload) values ($1, $2, $3, $4)", ["20000000-0000-4000-8000-000000000003", outsider, group, { id: "20000000-0000-4000-8000-000000000003" }])).rejects.toThrow();

    await asUser(pending);
    await db.query("select public.claim_group_invites()");
    expect((await db.query("select id from public.operations")).rows).toHaveLength(0);
    await db.exec("reset role");
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [pending]);
    await db.exec("set role authenticated");
    await asUser(pending);
    await db.query("select public.claim_group_invites()");
    expect((await db.query("select id from public.operations")).rows).toEqual([{ id: sharedId }]);

    await asUser(member);
    expect((await db.query("select id from public.operations")).rows).toEqual([{ id: sharedId }]);
    await db.query("update public.operations set payload = $1 where id = $2", [{ id: sharedId, title: "Edited" }, sharedId]);
    await expect(db.query("update public.operations set group_id = null where id = $1", [sharedId])).rejects.toThrow();
    expect((await db.query("select email from public.group_roster($1)", [group])).rows).toHaveLength(3);

    await asUser(owner);
    expect((await db.query("select payload from public.operations where id = $1", [sharedId])).rows[0]).toEqual({ payload: { id: sharedId, title: "Edited" } });
    expect((await db.query("select id from public.operations")).rows).toHaveLength(2);
  });
});
