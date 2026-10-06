import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SQL } from "bun";
import { z } from "zod";

const target = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://localhost/missing");
assert(["postgres:", "postgresql:"].includes(target.protocol), "Use a PostgreSQL test URL.");
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Use a local disposable database.");
assert(/^\/kamoti_test_[a-z0-9_]+$/.test(target.pathname), "Use a database named kamoti_test_*.");

const clients = Array.from({ length: 3 }, () => new SQL(target.href, {
  max: 1, idleTimeout: 0, connectionTimeout: 5,
}));
const [observer, winner, contender] = clients;
const profileSchema = z.object({
  id: z.uuid(), residency_review_version: z.uuid(), residency_proof_id: z.uuid().nullable(),
  residency_status: z.enum(["pending", "verified", "rejected"]).nullable(), address_line: z.string().nullable(),
});
const resultSchema = z.array(z.object({ result: profileSchema }));

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function current(userId: string) {
  const rows = await observer`select id, residency_review_version, residency_proof_id, residency_status, address_line
    from public.profiles where id = ${userId}::uuid`;
  return z.array(profileSchema).parse(rows)[0];
}

async function prepareProof(userId: string, extension: "pdf" | "png" = "pdf") {
  const id = randomUUID();
  const path = `${userId}/${id}.${extension}`;
  await observer`insert into storage.objects (bucket_id, name) values ('residency-proofs', ${path})`;
  return { id, path, hash: "a".repeat(64) };
}

async function upload(sql: SQL, userId: string, proof: Awaited<ReturnType<typeof prepareProof>>, version: string) {
  const rows = await sql`select public.complete_residency_proof(${userId}::uuid, ${proof.id}::uuid,
    ${proof.path}::text, ${proof.hash}::text, ${version}::uuid, null::inet) as result`;
  return resultSchema.parse(rows)[0].result;
}

async function decide(sql: SQL, adminId: string, userId: string, version: string, decision: "verified" | "rejected") {
  const input = { decision, expected_version: version, note: decision === "rejected" ? "Address does not match." : null };
  const rows = await sql`select public.admin_change_profile(${adminId}::uuid, ${userId}::uuid,
    'residency.reviewed', ${input}::jsonb, null::inet) as result`;
  return resultSchema.parse(rows)[0].result;
}

async function fixture() {
  const adminId = randomUUID();
  const secondAdminId = randomUUID();
  const userId = randomUUID();
  for (const [id, role] of [[adminId, "admin"], [secondAdminId, "admin"], [userId, "citizen"]]) {
    await observer`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@kamoti.invalid`})`;
    await observer`insert into public.profiles (id, name, email, role, barangay, address_line, residency_status)
      values (${id}::uuid, 'Concurrency Test Person', ${`${id}@kamoti.invalid`}, ${role}::public.user_role,
      'Poblacion', '1 Synthetic Street', ${role === "citizen" ? "pending" : null})`;
  }
  const proof = await prepareProof(userId);
  const before = await current(userId);
  const profile = await upload(observer, userId, proof, before.residency_review_version);
  return { adminId, secondAdminId, userId, proof, version: profile.residency_review_version };
}

async function effects(userId: string) {
  const rows = await observer`select
    (select count(*)::int from public.activity_logs where entity_id = ${userId} and action = 'residency.reviewed') as decisions,
    (select count(*)::int from public.activity_logs where entity_id = ${userId} and action = 'residency.uploaded') as uploads,
    (select count(*)::int from public.notifications where user_id = ${userId}::uuid) as notifications`;
  return z.array(z.object({ decisions: z.number(), uploads: z.number(), notifications: z.number() })).parse(rows)[0];
}

async function race(
  firstWrite: (sql: SQL) => Promise<unknown>,
  secondWrite: (sql: SQL) => Promise<unknown>,
  secondOutcome: "conflict" | "same_submission",
) {
  const entered = gate();
  const commit = gate();
  const [{ pid: contenderPid }] = z.array(z.object({ pid: z.number() })).parse(await contender`select pg_backend_pid() as pid`);
  const first = winner.begin(async (sql) => {
    await sql`set local statement_timeout = '10s'`;
    await sql`set local role service_role`;
    const result = await firstWrite(sql);
    entered.release();
    await commit.promise;
    return result;
  });
  const firstResult = first.then((value) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }));
  const ready = await Promise.race([entered.promise.then(() => true), firstResult.then(() => false)]);
  if (!ready) {
    const failure = await firstResult;
    if ("error" in failure) throw failure.error;
  }
  assert(ready, "The first write must complete before the competing write starts.");

  const second = contender.begin(async (sql) => {
    await sql`set local statement_timeout = '10s'`;
    await sql`set local role service_role`;
    return secondWrite(sql);
  }).then((value) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }));

  let blocked = false;
  try {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [{ waiting }] = z.array(z.object({ waiting: z.boolean() })).parse(
        await observer`select cardinality(pg_blocking_pids(${contenderPid})) > 0 as waiting`,
      );
      if (waiting) { blocked = true; break; }
      await Bun.sleep(20);
    }
    assert(blocked, "The competing write must wait for the same profile lock.");
  } finally {
    commit.release();
  }
  const [accepted, competing] = await Promise.all([firstResult, second]);
  assert(accepted.ok, "The first transaction must commit.");
  if (secondOutcome === "conflict") {
    assert(!competing.ok && "error" in competing && competing.error instanceof SQL.PostgresError,
      "The stale transaction must return a PostgreSQL conflict.");
    assert.equal(competing.error.errno, "PT409");
    assert.match(competing.error.message, /refresh/i);
  } else {
    assert(competing.ok, "An exact submission retry must succeed without another write.");
  }
}

try {
  const [{ disposable }] = z.array(z.object({ disposable: z.string().nullable() })).parse(
    await observer`select current_setting('kamoti.test_database', true) as disposable`,
  );
  assert.equal(disposable, "disposable", "Set the marker only on the approved disposable database.");

  {
    const f = await fixture();
    await race((sql) => decide(sql, f.adminId, f.userId, f.version, "verified"),
      (sql) => decide(sql, f.secondAdminId, f.userId, f.version, "rejected"), "conflict");
    assert.equal((await current(f.userId)).residency_status, "verified");
    assert.deepEqual(await effects(f.userId), { decisions: 1, uploads: 1, notifications: 1 });
    console.log("PASS simultaneous reviewers save one decision, audit, and notification.");
  }

  for (const extension of ["pdf", "png"] as const) {
    const f = await fixture();
    const replacement = await prepareProof(f.userId, extension);
    await race((sql) => upload(sql, f.userId, replacement, f.version),
      (sql) => decide(sql, f.adminId, f.userId, f.version, "verified"), "conflict");
    const profile = await current(f.userId);
    assert.equal(profile.residency_proof_id, replacement.id);
    assert.equal(profile.residency_status, "pending");
    assert.deepEqual(await effects(f.userId), { decisions: 0, uploads: 2, notifications: 0 });
    console.log(`PASS ${extension} replacement invalidates a concurrent old-proof approval.`);
  }

  for (const decision of ["verified", "rejected"] as const) {
    const f = await fixture();
    const replacement = await prepareProof(f.userId);
    await race((sql) => decide(sql, f.adminId, f.userId, f.version, decision),
      (sql) => upload(sql, f.userId, replacement, f.version), "conflict");
    const profile = await current(f.userId);
    assert.equal(profile.residency_proof_id, f.proof.id);
    assert.equal(profile.residency_status, decision);
    assert.deepEqual(await effects(f.userId), { decisions: 1, uploads: 1, notifications: 1 });
    console.log(`PASS a concurrent upload cannot clear a newer ${decision} decision.`);
  }

  {
    const f = await fixture();
    const input = { first_name: "Concurrency", last_name: "Person", name: "Concurrency Person",
      middle_name: null, suffix: null, contact_number: null, barangay: "Poblacion", address_line: "2 Synthetic Street" };
    await race((sql) => sql`select public.update_own_profile(${f.userId}::uuid, ${input}::jsonb, null::inet)`,
      (sql) => decide(sql, f.adminId, f.userId, f.version, "verified"), "conflict");
    const profile = await current(f.userId);
    assert.equal(profile.address_line, "2 Synthetic Street");
    assert.equal(profile.residency_status, "pending");
    assert.deepEqual(await effects(f.userId), { decisions: 0, uploads: 1, notifications: 0 });
    console.log("PASS a concurrent address change invalidates an old-address decision.");
  }

  {
    const f = await fixture();
    const replacement = await prepareProof(f.userId);
    const other = await prepareProof(f.userId, "png");
    await race((sql) => upload(sql, f.userId, replacement, f.version),
      (sql) => upload(sql, f.userId, other, f.version), "conflict");
    assert.equal((await current(f.userId)).residency_proof_id, replacement.id);
    assert.deepEqual(await effects(f.userId), { decisions: 0, uploads: 2, notifications: 0 });
    console.log("PASS simultaneous replacements attach one new proof and add one upload audit.");
  }

  {
    const f = await fixture();
    const replacement = await prepareProof(f.userId);
    await race((sql) => upload(sql, f.userId, replacement, f.version),
      (sql) => upload(sql, f.userId, replacement, f.version), "same_submission");
    assert.equal((await current(f.userId)).residency_proof_id, replacement.id);
    assert.deepEqual(await effects(f.userId), { decisions: 0, uploads: 2, notifications: 0 });
    const reviewed = await current(f.userId);
    await decide(observer, f.adminId, f.userId, reviewed.residency_review_version, "verified");
    await upload(observer, f.userId, replacement, f.version);
    assert.equal((await current(f.userId)).residency_status, "verified");
    assert.deepEqual(await effects(f.userId), { decisions: 1, uploads: 2, notifications: 1 });
    console.log("PASS concurrent and later submission retries preserve the newer decision and add no effects.");
  }
} finally {
  await Promise.all(clients.map((sql) => sql.close()));
}
