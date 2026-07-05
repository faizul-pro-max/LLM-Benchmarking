import db from './connection'

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      config      TEXT NOT NULL,
      description TEXT,
      phase       TEXT NOT NULL DEFAULT 'pending',
      started_at  INTEGER,
      ended_at    INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id            TEXT PRIMARY KEY,
      run_id        TEXT NOT NULL REFERENCES runs(id),
      run_number    INTEGER NOT NULL,
      prompt_id     TEXT NOT NULL,
      category      TEXT NOT NULL,
      phase         TEXT NOT NULL,
      prompt_text   TEXT NOT NULL,
      t0            INTEGER,
      t1            INTEGER,
      t2            INTEGER,
      t3            INTEGER,
      ttft_ms       INTEGER,
      prefill_ms    INTEGER,
      decode_ms     INTEGER,
      total_ms      INTEGER,
      token_count   INTEGER DEFAULT 0,
      tpot_ms       REAL,
      finish_reason TEXT,
      error         TEXT
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id            TEXT REFERENCES runs(id),
      ts                INTEGER NOT NULL,
      transport_ms      INTEGER,
      gpu_util          INTEGER,
      vram_used_mb      INTEGER,
      vram_total_mb     INTEGER,
      power_w           REAL,
      temp_c            INTEGER,
      gpu_name          TEXT,
      kv_cache_pct      REAL,
      requests_running  INTEGER,
      requests_waiting  INTEGER,
      requests_swapped  INTEGER,
      tokens_per_sec    REAL,
      ttft_p50_ms       REAL,
      ttft_p99_ms       REAL,
      vllm_raw          TEXT
    );

    CREATE TABLE IF NOT EXISTS aggregated_results (
      run_id                  TEXT PRIMARY KEY REFERENCES runs(id),
      ttft_p50_ms             REAL,
      ttft_p90_ms             REAL,
      ttft_p99_ms             REAL,
      ttft_stddev_ms          REAL,
      ttft_p50_random         REAL,
      ttft_p50_shared_prefix  REAL,
      ttft_p50_exact_repeat   REAL,
      tpot_p50_ms             REAL,
      tpot_p90_ms             REAL,
      tokens_per_sec_avg      REAL,
      tokens_per_sec_peak     REAL,
      gpu_util_avg            REAL,
      gpu_util_peak           REAL,
      vram_peak_mb            INTEGER,
      kv_cache_avg            REAL,
      kv_cache_peak           REAL,
      total_requests          INTEGER,
      warmup_excluded         INTEGER DEFAULT 1,
      run_count               INTEGER DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id          TEXT PRIMARY KEY,
      title       TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL REFERENCES chat_sessions(id),
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      ttft_ms     REAL,
      total_ms    REAL,
      tokens      INTEGER,
      tps         REAL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);
  `)

  migrateMetricSnapshotsChatSession()
  migrateMetricSnapshotsVllmRaw()
  migrateRunsDescription()
  migrateMetricSnapshotsKvCache()
}

// Idempotent migration: persist a rich-text (HTML) description attached to a run
// at start time. Older DBs lack the column; add it with a guarded ALTER.
function migrateRunsDescription(): void {
  type ColInfo = { name: string }
  const cols = db.prepare(`PRAGMA table_info(runs)`).all() as ColInfo[]
  if (cols.some((c) => c.name === 'description')) return
  try {
    db.exec(`ALTER TABLE runs ADD COLUMN description TEXT`)
  } catch (err) {
    // Column may already exist on a racing/older DB — ignore duplicate errors.
    console.log({ msg: 'runs description add skipped', err: String(err), ts: Date.now() })
  }
}

// Idempotent migration: persist the raw vLLM Prometheus text per snapshot so the
// full parser input can be re-inspected/re-parsed after the fact. Older DBs lack
// the column; add it with a guarded ALTER.
function migrateMetricSnapshotsVllmRaw(): void {
  type ColInfo = { name: string }
  const cols = db.prepare(`PRAGMA table_info(metric_snapshots)`).all() as ColInfo[]
  if (cols.some((c) => c.name === 'vllm_raw')) return
  try {
    db.exec(`ALTER TABLE metric_snapshots ADD COLUMN vllm_raw TEXT`)
  } catch (err) {
    // Column may already exist on a racing/older DB — ignore duplicate errors.
    console.log({ msg: 'metric_snapshots vllm_raw add skipped', err: String(err), ts: Date.now() })
  }
}

// Idempotent migration: capacity-aware KV cache reading from the observer
// agent's GET /kv_cache (see KV_CACHE_API_CONTRACT.md §2). Older DBs lack these
// columns; add each with a guarded ALTER. Values are nullable — the agent can
// return null for any of them (vLLM still starting, unrecognised log format).
function migrateMetricSnapshotsKvCache(): void {
  type ColInfo = { name: string }
  const cols = db.prepare(`PRAGMA table_info(metric_snapshots)`).all() as ColInfo[]
  const existing = new Set(cols.map((c) => c.name))
  const kvColumns: Record<string, string> = {
    kv_total_tokens: 'INTEGER',
    kv_block_size: 'INTEGER',
    kv_total_gb: 'REAL',
    kv_used_tokens: 'INTEGER',
    kv_free_tokens: 'INTEGER',
    kv_used_gb: 'REAL',
    kv_free_gb: 'REAL',
  }
  for (const [name, type] of Object.entries(kvColumns)) {
    if (existing.has(name)) continue
    try {
      db.exec(`ALTER TABLE metric_snapshots ADD COLUMN ${name} ${type}`)
    } catch (err) {
      // Column may already exist on a racing/older DB — ignore duplicate errors.
      console.log({ msg: `metric_snapshots ${name} add skipped`, err: String(err), ts: Date.now() })
    }
  }
}

// Idempotent migration: metric_snapshots originally keyed on run_id (NOT NULL).
// Chat-session metrics need run_id NULL + a new chat_session_id column. We:
//   1. Add chat_session_id if it doesn't already exist (guarded ALTER).
//   2. If the existing run_id column is still NOT NULL, rebuild the table so
//      chat snapshots (run_id NULL) can be inserted. SQLite can't relax NOT NULL
//      in place, so a copy-and-swap rebuild is the standard least-surprising path.
function migrateMetricSnapshotsChatSession(): void {
  type ColInfo = { name: string; notnull: number }
  const cols = db.prepare(`PRAGMA table_info(metric_snapshots)`).all() as ColInfo[]

  const hasChatSessionId = cols.some((c) => c.name === 'chat_session_id')
  if (!hasChatSessionId) {
    try {
      db.exec(`ALTER TABLE metric_snapshots ADD COLUMN chat_session_id TEXT`)
    } catch (err) {
      // Column may already exist on a racing/older DB — ignore duplicate errors.
      console.log({ msg: 'metric_snapshots chat_session_id add skipped', err: String(err), ts: Date.now() })
    }
  }

  const runIdCol = cols.find((c) => c.name === 'run_id')
  const runIdIsNotNull = runIdCol ? runIdCol.notnull === 1 : false
  if (runIdIsNotNull) {
    // Rebuild the table to drop the NOT NULL constraint on run_id, preserving rows.
    db.exec(`
      BEGIN;
      CREATE TABLE metric_snapshots_new (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id            TEXT REFERENCES runs(id),
        chat_session_id   TEXT,
        ts                INTEGER NOT NULL,
        transport_ms      INTEGER,
        gpu_util          INTEGER,
        vram_used_mb      INTEGER,
        vram_total_mb     INTEGER,
        power_w           REAL,
        temp_c            INTEGER,
        gpu_name          TEXT,
        kv_cache_pct      REAL,
        requests_running  INTEGER,
        requests_waiting  INTEGER,
        requests_swapped  INTEGER,
        tokens_per_sec    REAL,
        ttft_p50_ms       REAL,
        ttft_p99_ms       REAL
      );
      INSERT INTO metric_snapshots_new
        (id, run_id, chat_session_id, ts, transport_ms, gpu_util, vram_used_mb,
         vram_total_mb, power_w, temp_c, gpu_name, kv_cache_pct, requests_running,
         requests_waiting, requests_swapped, tokens_per_sec, ttft_p50_ms, ttft_p99_ms)
      SELECT
        id, run_id, chat_session_id, ts, transport_ms, gpu_util, vram_used_mb,
        vram_total_mb, power_w, temp_c, gpu_name, kv_cache_pct, requests_running,
        requests_waiting, requests_swapped, tokens_per_sec, ttft_p50_ms, ttft_p99_ms
      FROM metric_snapshots;
      DROP TABLE metric_snapshots;
      ALTER TABLE metric_snapshots_new RENAME TO metric_snapshots;
      COMMIT;
    `)
  }
}
