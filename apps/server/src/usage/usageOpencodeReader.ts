// @effect-diagnostics nodeBuiltinImport:off
/**
 * Raw filesystem + SQLite access for OpenCode usage.
 *
 * Current OpenCode keeps `opencode.db` (SQLite) as the source of truth for
 * sessions; per-message token usage lives in the `message` table's `data`
 * column. Older installs wrote JSON under `storage/message/` instead, which
 * this reader deliberately does not cover: those versions predate the
 * `message` table this was verified against.
 *
 * Isolated here so the rest of the usage code stays on Effect's `FileSystem`.
 * SQLite itself comes from `node:sqlite`, which ships with the Node runtimes
 * this server runs on (Node 24+, and the Node Electron bundles). The import is
 * resolved lazily so a runtime without it degrades to a failed source rather
 * than breaking the module load.
 *
 * @module usageOpencodeReader
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expandHomePath } from "../pathExpansion.ts";

import { parseOpencodeMessage, type UsageRecord } from "./usageTranscripts.ts";

export const OPENCODE_DB_FILENAME = "opencode.db" as const;

/**
 * Locates OpenCode's data directory.
 *
 * OpenCode resolves storage through `xdg-basedir`, which honours
 * `XDG_DATA_HOME` and otherwise falls back to `~/.local/share` on every
 * platform (macOS included). Mirrors that exactly.
 */
export function resolveOpencodeDataDir(env: { readonly [key: string]: string | undefined }) {
  const xdgDataHome = env["XDG_DATA_HOME"]?.trim() ?? "";
  if (xdgDataHome.length > 0) return NodePath.resolve(expandHomePath(xdgDataHome));
  return NodePath.join(NodeOS.homedir(), ".local", "share", "opencode");
}

export interface OpencodeDbFingerprint {
  /** Summed size of the database and its WAL sidecars. */
  readonly size: number;
  /** Newest mtime across the database and its WAL sidecars. */
  readonly mtimeMs: number;
}

/**
 * Change key for the OpenCode database.
 *
 * SQLite in WAL mode commits into `-wal` first, so the main file's own
 * `(size, mtime)` cannot detect new usage. All three files feed the key;
 * a missing database reads as `null` (no OpenCode usage here), while missing
 * sidecars simply contribute nothing.
 */
export async function readOpencodeDbFingerprint(
  dbPath: string,
): Promise<OpencodeDbFingerprint | null> {
  const stat = async (target: string) => {
    try {
      return await NodeFSP.stat(target);
    } catch {
      return null;
    }
  };
  const main = await stat(dbPath);
  if (main === null) return null;
  let size = main.size;
  let mtimeMs = main.mtimeMs;
  for (const suffix of ["-wal", "-shm"] as const) {
    const sidecar = await stat(`${dbPath}${suffix}`);
    if (sidecar !== null) {
      size += sidecar.size;
      mtimeMs = Math.max(mtimeMs, sidecar.mtimeMs);
    }
  }
  return { size, mtimeMs };
}

type NodeSqlite = typeof import("node:sqlite");

let sqliteModule: NodeSqlite | null | undefined;
/** Whether this runtime can open SQLite databases (always true on Node 24+). */
export function isOpencodeSqliteAvailable(): boolean {
  if (sqliteModule !== undefined) return sqliteModule !== null;
  try {
    sqliteModule = NodeModule.createRequire(import.meta.url)("node:sqlite") as NodeSqlite;
  } catch {
    sqliteModule = null;
  }
  return sqliteModule !== null;
}

export interface OpencodeMessageRow {
  readonly id: string;
  readonly sessionId: string;
  readonly timeCreatedMs: number | null;
  readonly data: unknown;
}

interface OpencodeMessageColumns {
  readonly id: unknown;
  readonly sessionId: unknown;
  readonly timeCreatedMs: unknown;
  readonly data: unknown;
}

function toMessageRow(columns: OpencodeMessageColumns): OpencodeMessageRow | null {
  if (typeof columns.id !== "string" || columns.id.length === 0) return null;
  return {
    id: columns.id,
    sessionId: typeof columns.sessionId === "string" ? columns.sessionId : "",
    timeCreatedMs:
      typeof columns.timeCreatedMs === "number" && Number.isFinite(columns.timeCreatedMs)
        ? Math.trunc(columns.timeCreatedMs)
        : null,
    data: columns.data,
  };
}

/**
 * Reads every assistant message row from the OpenCode database and returns the
 * parsed usage records, or `null` when the database could not be read.
 *
 * Rows are selected whole (no time predicate): message rows are completed in
 * place after creation, so an incremental "rows since X" filter would miss
 * completions. The caller memoises the parsed records under the database
 * fingerprint and the aggregator applies the reporting window, exactly like
 * the transcript-file path. A read failure is not an empty database and must
 * not be cached as one.
 */
export async function readOpencodeMessageRecords(
  dbPath: string,
): Promise<readonly UsageRecord[] | null> {
  if (!isOpencodeSqliteAvailable() || sqliteModule === null || sqliteModule === undefined) {
    return null;
  }
  let database: InstanceType<NodeSqlite["DatabaseSync"]>;
  try {
    database = new sqliteModule.DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    try {
      database.exec("PRAGMA query_only = ON;");
    } catch {
      // Best effort; a database that rejects the pragma may still read.
    }
    try {
      database.exec("PRAGMA busy_timeout = 2000;");
    } catch {
      // Best effort; WAL readers rarely block anyway.
    }
    const rows = database
      .prepare(
        "SELECT id, session_id AS sessionId, time_created AS timeCreatedMs, data FROM message ORDER BY time_created ASC, id ASC",
      )
      .all() as unknown as readonly OpencodeMessageColumns[];
    const records: UsageRecord[] = [];
    for (const columns of rows) {
      const row = toMessageRow(columns);
      if (row === null) continue;
      let data: unknown;
      try {
        data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      } catch {
        continue;
      }
      const record = parseOpencodeMessage({ ...row, data });
      if (record !== null) records.push(record);
    }
    return records;
  } catch {
    return null;
  } finally {
    try {
      database.close();
    } catch {
      // The read already finished; a close failure changes nothing.
    }
  }
}
