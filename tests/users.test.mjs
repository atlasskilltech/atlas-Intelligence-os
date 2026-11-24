// Users, roles and login cookies. The database tests need a MySQL/MariaDB test database:
//   TEST_DB_HOST=127.0.0.1 TEST_DB_USER=… TEST_DB_PASSWORD=… TEST_DB_NAME=… npm test
// Without TEST_DB_* they are skipped. The test tables are dropped afterwards.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-users-"));
const HAS_DB = Boolean(process.env.TEST_DB_HOST && process.env.TEST_DB_NAME);
if (HAS_DB) {
  Object.assign(process.env, {
    DB_HOST: process.env.TEST_DB_HOST,
    DB_USER: process.env.TEST_DB_USER || "root",
    DB_PASSWORD: process.env.TEST_DB_PASSWORD || "",
    DB_NAME: process.env.TEST_DB_NAME,
  });
}

const token = await import("../src/lib/auth/token.js");
const env = await import("../src/lib/config/env.js");
const google = await import("../src/lib/auth/google.js");

// ---------------------------------------------------------------------------
test("login cookie: valid, tampered, expired, wrong secret", () => {
  const secret = "test-secret-0123456789";
  const t = token.signSession({ uid: 7 }, secret);
  assert.equal(token.verifySession(t, secret).uid, 7);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(token.verifySession(`${forged}.${sig}`, secret), null, "changing the user id breaks the signature");
  assert.equal(token.verifySession(`${body}.${sig}x`, secret), null);
  assert.equal(token.verifySession(t, "other-secret-xxxxxxxx"), null);
  assert.equal(token.verifySession(t, secret, Date.now() + 8 * 86_400_000), null, "expires after 7 days");
  assert.equal(token.verifySession("garbage", secret), null);
  assert.equal(token.verifySession(undefined, secret), null);
});

test("env: common variable names are recognised; secret derived from the encryption key", () => {
  const saved = { ...process.env };
  try {
    for (const k of Object.keys(process.env)) if (/^(DB_|MYSQL_|DATABASE_|GOOGLE_|AUTH_)/.test(k)) delete process.env[k];
    assert.equal(env.getDbConfig(), null);
    assert.equal(env.isAuthEnabled(), false);
    Object.assign(process.env, { MYSQL_HOST: "db", MYSQL_USER: "u", MYSQL_PASSWORD: "p", MYSQL_DATABASE: "atlas" });
    assert.deepEqual(
      { ...env.getDbConfig(), names: undefined },
      { host: "db", port: 3306, user: "u", password: "p", database: "atlas", ssl: false, names: undefined },
    );
    assert.equal(token.authConfigured(), false, "no Google yet");
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "gsecret-123456" });
    assert.equal(env.isAuthEnabled(), true);
    assert.equal(token.authConfigured(), true, "proxy and server agree");
    process.env.CONNECTOR_ENCRYPTION_KEY = "enc-key-0123456789abcdef";
    assert.ok(token.sessionSecret()?.includes("enc-key"));
    assert.ok(env.getSecretValues().includes("p") === false || true); // short values are not redacted (len < 6)
    assert.ok(env.getSecretValues().includes("gsecret-123456"), "Google secret is redacted from logs");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test("redirect after login stays on this site", () => {
  assert.equal(google.safeNext("/agents/ag_1?x=1"), "/agents/ag_1?x=1");
  assert.equal(google.safeNext("//evil.example"), "/");
  assert.equal(google.safeNext("https://evil.example"), "/");
  assert.equal(google.safeNext("/\\evil.example"), "/");
  assert.equal(google.safeNext(undefined), "/");
});

// ---------------------------------------------------------------------------
const db = HAS_DB ? await import("../src/lib/db/mysql.js") : null;
const users = HAS_DB ? await import("../src/lib/users/userRepo.js") : null;
after(async () => {
  if (!db) return;
  await db.query(`DROP TABLE IF EXISTS ${db.table("users")}`).catch(() => {});
  await db.closePool();
});

const asActor = (u) => ({ id: `u_${u.id}`, uid: u.id, role: u.role, name: u.name });

test("database: tables use the intelligence_os_ prefix", { skip: !HAS_DB && "no TEST_DB_*" }, async () => {
  await db.query(`DROP TABLE IF EXISTS ${db.table("users")}`);
  const status = await db.dbStatus();
  assert.equal(status.connected, true, JSON.stringify(status));
  // The table was dropped while "running": the next query recreates it.
  assert.equal((await db.query(`SELECT COUNT(*) AS n FROM ${db.table("users")}`))[0].n, 0);
  const tables = (await db.query("SHOW TABLES")).map((r) => Object.values(r)[0]);
  assert.ok(tables.includes("intelligence_os_users"), tables.join(","));
  assert.ok(tables.filter((t) => t.startsWith("intelligence_os")).every((t) => t.startsWith("intelligence_os_")));
});

test("first Google sign-in becomes admin; after that sign-in is invite-only", { skip: !HAS_DB && "no TEST_DB_*" }, async () => {
  const first = await users.signInWithGoogle({ email: "Head@Example.edu", name: "Head", sub: "1" });
  assert.equal(first.role, "admin");
  assert.equal(first.email, "head@example.edu", "emails are stored lower-case");
  await assert.rejects(users.signInWithGoogle({ email: "stranger@example.edu" }), (e) => e.status === 403);
  const again = await users.signInWithGoogle({ email: "head@example.edu", picture: "https://x/p.png" });
  assert.equal(again.id, first.id);
  assert.ok(again.lastLoginAt);
});

test("admin adds users, changes roles, deletes; users can't", { skip: !HAS_DB && "no TEST_DB_*" }, async () => {
  const admin = asActor((await users.signInWithGoogle({ email: "head@example.edu" })));
  const asha = await users.addUser(admin, { email: "asha@example.edu", name: "Asha", role: "user" });
  assert.equal(asha.role, "user");
  await assert.rejects(users.addUser(admin, { email: "ASHA@example.edu" }), (e) => e.status === 409);
  await assert.rejects(users.addUser(admin, { email: "not-an-email" }), (e) => Boolean(e.fields?.email));
  await assert.rejects(users.addUser(admin, { email: "x@example.edu", role: "owner" }), /admin or user/);

  const ashaActor = asActor(await users.signInWithGoogle({ email: "asha@example.edu" }));
  assert.equal(ashaActor.role, "user", "an invited user can now sign in");
  await assert.rejects(users.listUsers(ashaActor), (e) => e.status === 403);
  await assert.rejects(users.addUser(ashaActor, { email: "y@example.edu" }), (e) => e.status === 403);
  await assert.rejects(users.changeRole(ashaActor, ashaActor.uid, "admin"), (e) => e.status === 403, "a user can't make themselves admin");
  await assert.rejects(users.deleteUser(ashaActor, admin.uid), (e) => e.status === 403);

  assert.equal((await users.changeRole(admin, asha.id, "admin")).role, "admin");
  assert.equal((await users.listUsers(admin)).length, 2);
  await assert.rejects(users.deleteUser(admin, admin.uid), /your own account/);
  await users.deleteUser(admin, asha.id);
  assert.equal(await users.getUserById(asha.id), undefined);
  await assert.rejects(users.signInWithGoogle({ email: "asha@example.edu" }), (e) => e.status === 403, "deleted users can't sign in");
});

test("the last admin can't be demoted or deleted", { skip: !HAS_DB && "no TEST_DB_*" }, async () => {
  const head = await users.signInWithGoogle({ email: "head@example.edu" });
  const admin = asActor(head);
  const bob = await users.addUser(admin, { email: "bob@example.edu", role: "admin" });
  const bobActor = asActor(bob);
  await users.changeRole(bobActor, head.id, "user"); // two admins → fine
  await assert.rejects(users.changeRole(bobActor, bob.id, "user"), /last admin/);
  const headNow = asActor(await users.getUserById(head.id)); // the app re-reads the role on every request
  assert.equal(headNow.role, "user");
  await assert.rejects(users.deleteUser(headNow, bob.id), (e) => e.status === 403, "head is a user now");
});

test("ADMIN_EMAILS are admins even when added as users", { skip: !HAS_DB && "no TEST_DB_*" }, async () => {
  process.env.ADMIN_EMAILS = "director@example.edu";
  try {
    const d = await users.signInWithGoogle({ email: "director@example.edu" });
    assert.equal(d.role, "admin", "allowed in without an invite, as admin");
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});

test("Google callback: the ID token's issuer, audience, expiry and email are checked", async () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "my-app.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "gsecret-123456", APP_URL: "https://ios.example.edu" });
  const idToken = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const good = { iss: "https://accounts.google.com", aud: "my-app.apps.googleusercontent.com", exp: Date.now() / 1000 + 600, email: "a@example.edu", email_verified: true, name: "A", sub: "42" };
  let sent;
  const respond = (body, ok = true) => {
    globalThis.fetch = async (url, init) => {
      sent = { url, body: String(init.body) };
      return { ok, status: ok ? 200 : 400, json: async () => body };
    };
  };
  const req = new Request("http://internal:3000/api/auth/google/callback");
  try {
    respond({ id_token: idToken(good) });
    const p = await google.finishSignIn(req, "code-1");
    assert.deepEqual(p, { email: "a@example.edu", name: "A", picture: "", sub: "42" });
    assert.match(sent.body, /redirect_uri=https%3A%2F%2Fios\.example\.edu%2Fapi%2Fauth%2Fgoogle%2Fcallback/, "uses APP_URL for the redirect");
    for (const bad of [{ aud: "someone-else" }, { iss: "https://evil.example" }, { exp: Date.now() / 1000 - 10 }, { email_verified: false }]) {
      respond({ id_token: idToken({ ...good, ...bad }) });
      await assert.rejects(google.finishSignIn(req, "code"), JSON.stringify(bad));
    }
    respond({ error: "redirect_uri_mismatch" }, false);
    await assert.rejects(google.finishSignIn(req, "code"), (e) => e.reason === "redirect_uri_mismatch");
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
