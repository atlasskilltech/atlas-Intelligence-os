import "server-only";
import mysql from "mysql2/promise";
import { getDbConfig } from "../config/env.js";

/**
 * MySQL access. Every table this app creates starts with TABLE_PREFIX so it
 * can share a database with other ATLAS apps safely. Tables are created on
 * first use (CREATE TABLE IF NOT EXISTS) — no manual migration step.
 */

export const TABLE_PREFIX = "intelligence_os_";
export const table = (name) => `${TABLE_PREFIX}${name}`;

export class DbError extends Error {
  constructor(message, cause) {
    super(message);
    this.publicMessage = message;
    this.status = 503;
    this.type = "database";
    this.code = cause?.code;
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ${table("users")} (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    name VARCHAR(120) NOT NULL DEFAULT '',
    picture VARCHAR(500) NOT NULL DEFAULT '',
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
    google_sub VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL,
    created_by INT UNSIGNED NULL,
    UNIQUE KEY ${table("users_email")} (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS ${table("email_senders")} (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    from_email VARCHAR(254) NOT NULL,
    from_name VARCHAR(100) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

let pool = null;
let poolKey = null;
let schemaReady = null;

function getPool() {
  const cfg = getDbConfig();
  if (!cfg) throw new DbError("The database is not configured on the server.");
  const key = JSON.stringify([cfg.uri, cfg.host, cfg.port, cfg.user, cfg.database]);
  if (!pool || poolKey !== key) {
    const base = { waitForConnections: true, connectionLimit: 5, connectTimeout: 10_000, ...(cfg.ssl ? { ssl: { rejectUnauthorized: true } } : {}) };
    pool = cfg.uri
      ? mysql.createPool({ uri: cfg.uri, ...base })
      : mysql.createPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ...base });
    poolKey = key;
    schemaReady = null;
  }
  return pool;
}

const friendly = (err) => {
  const map = {
    ER_ACCESS_DENIED_ERROR: "the database rejected the user name or password",
    ER_BAD_DB_ERROR: "the database name does not exist",
    ECONNREFUSED: "the database server refused the connection (check host and port)",
    ENOTFOUND: "the database host name could not be found",
    ETIMEDOUT: "the database server did not answer in time",
    ER_TABLEACCESS_DENIED_ERROR: "the database user may not create or use tables",
    ER_DBACCESS_DENIED_ERROR: "the database user has no access to this database",
  };
  return map[err?.code] || err?.code || err?.message || "unknown error";
};

/** Creates the tables once per process. */
async function ensureSchema() {
  schemaReady ??= (async () => {
    for (const sql of SCHEMA) await getPool().query(sql);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Runs a parameterised query and returns rows (or the result header for writes). */
export async function query(sql, params = []) {
  try {
    await ensureSchema();
    try {
      const [rows] = await getPool().execute(sql, params);
      return rows;
    } catch (err) {
      if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
      // A table was dropped while the app was running: recreate and retry once.
      schemaReady = null;
      await ensureSchema();
      const [rows] = await getPool().execute(sql, params);
      return rows;
    }
  } catch (err) {
    if (err instanceof DbError) throw err;
    console.error("[db] query failed:", err?.code || err?.message);
    throw new DbError(`Database error: ${friendly(err)}.`, err);
  }
}

/** For status pages: { configured, connected, version?, error?, names } — never secrets. */
export async function dbStatus() {
  const cfg = getDbConfig();
  if (!cfg) return { configured: false, connected: false, names: [] };
  try {
    await ensureSchema();
    const [rows] = await getPool().query("SELECT VERSION() AS v");
    return { configured: true, connected: true, version: rows[0]?.v, names: cfg.names };
  } catch (err) {
    return { configured: true, connected: false, error: friendly(err) || "unknown error", names: cfg.names };
  }
}

/** Tests only. */
export async function closePool() {
  if (pool) await pool.end();
  pool = null;
  schemaReady = null;
}
