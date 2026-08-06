#!/usr/bin/env bun
/**
 * edge-server.ts — a self-hosted waggle edge that replicates INTO the
 * local ~/.waggle store.
 *
 * The waggle CLI's `waggle edge push` replicates records + snapshot blobs
 * to a deployed edge over HTTPS (normally a Cloudflare Worker). This
 * server implements the same `/store` + `/health` + `/mcp` wire contract
 * but writes into the LOCAL sqlite store + blob CAS that `waggle-viewer`
 * already reads from — so tokens minted on another machine (the laptop)
 * resolve and render on this one (the mini) with zero viewer changes,
 * even when the source machine is offline.
 *
 * Why not TCP federation? Federation is pull-based (the peer forwards
 * reads to the owner), so it needs the owner online. The mini is the
 * always-on machine; the laptop comes and goes. Push replication into a
 * local copy is the shape that fits.
 *
 * Usage:
 *   bun src/edge-server.ts [--port 7412] [--host 0.0.0.0]
 *
 * Environment:
 *   WAGGLE_EDGE_PORT   Port (default 7412)
 *   WAGGLE_EDGE_HOST   Host (default 0.0.0.0 — bind the tailnet)
 *   WAGGLE_EDGE_BEARER Bearer secret (>=16 chars; REQUIRED, fail-closed)
 *   WAGGLE_STORE       sqlite path (default ~/.waggle/waggle.db; blobs
 *                      live under <parent>/blobs, matching the waggle CLI)
 *
 * From the laptop:
 *   waggle edge push --url http://mac-mini.tailc3138.ts.net:7412 --bearer <same>
 */

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// --- config ---
const HOME = process.env.HOME ?? "/tmp";
const DB_PATH = process.env.WAGGLE_STORE ?? join(HOME, ".waggle", "waggle.db");
// The blob CAS root MUST match the waggle CLI's derivation
// (run.rs: <parent of WAGGLE_STORE>/blobs) or replicated blobs land where
// `waggle read`/`search` can't find them.
const BLOB_ROOT = join(DB_PATH.replace(/\/[^/]*$/, ""), "blobs");

const args = process.argv.slice(2);
let port = Number(process.env.WAGGLE_EDGE_PORT ?? 7412);
let host = process.env.WAGGLE_EDGE_HOST ?? "0.0.0.0";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) { port = Number(args[i + 1]); i++; }
  if (args[i] === "--host" && args[i + 1]) { host = args[i + 1]; i++; }
  if (args[i] === "--help" || args[i] === "-h") {
    console.log(`waggle edge-server — self-hosted edge replicating into the local store

Usage:
  bun src/edge-server.ts [--port 7412] [--host 0.0.0.0]

Environment:
  WAGGLE_EDGE_PORT    Port (default 7412)
  WAGGLE_EDGE_HOST    Host (default 0.0.0.0)
  WAGGLE_EDGE_BEARER  Bearer secret, >=16 chars (REQUIRED)
  WAGGLE_STORE        sqlite path (default ~/.waggle/waggle.db)
  WAGGLE_DIR          waggle root (default ~/.waggle)`);
    process.exit(0);
  }
}

const BEARER = process.env.WAGGLE_EDGE_BEARER ?? "";
if (BEARER.length < 16) {
  console.error("edge-server: WAGGLE_EDGE_BEARER must be set and >=16 chars (fail-closed)");
  process.exit(1);
}

// --- store ---
// Same schema as waggle-store-sqlite (design doc 07 §4). Opened alongside
// the daemon: WAL lets readers (the daemon) never block our writes, and
// busy_timeout rides out the daemon's own IMMEDIATE transactions.
const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = FULL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS records(
      token   TEXT    NOT NULL,
      seq     INTEGER NOT NULL,
      kind    INTEGER NOT NULL,
      payload TEXT    NOT NULL,
      PRIMARY KEY (token, seq, kind)
  );
  CREATE TABLE IF NOT EXISTS manifests(
      token   TEXT PRIMARY KEY,
      doc     TEXT    NOT NULL,
      version INTEGER NOT NULL,
      target  TEXT    NOT NULL,
      parent  TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      rowid_order INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_manifests_target ON manifests(target);
  CREATE INDEX IF NOT EXISTS idx_manifests_parent ON manifests(parent);
  CREATE TABLE IF NOT EXISTS seqs(
      token TEXT PRIMARY KEY,
      next  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS funnels(
      token TEXT NOT NULL,
      stage TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (token, stage)
  );
`);

// --- reconstruct (the normative replay, per-token) ---
// Mirrors waggle-core::reconstruct for one token: take the Minted
// manifest, apply Mutations in seq order, sum Events into funnels.
// apply_change is six trivial field updates (manifest.rs) — the whole
// of the domain logic we need to duplicate; everything else is SQL.
function applyChange(m: any, change: any, at: number): void {
  switch (change.kind) {
    case "revoked":
      m.revoked_at = at;
      m.version += 1;
      break;
    case "superseded":
      m.superseded_by = change.by;
      m.version += 1;
      break;
    case "expiry-set":
      m.expires_at = change["expires-at"] ?? null;
      m.version += 1;
      break;
    case "campaign-set":
      m.campaign = change.campaign ?? null;
      break;
    case "label-set":
      (m.labels ??= {})[change.key] = change.value;
      break;
    case "label-unset":
      if (m.labels) delete m.labels[change.key];
      break;
  }
}

function seqOf(rec: any): number {
  if (rec.record === "minted") return 0;
  return rec.seq ?? 0;
}

function kindOf(rec: any): number {
  if (rec.record === "minted") return 0;
  if (rec.record === "mutation") return 1;
  return 2;
}

// Rebuild the materialized rows (manifests, seqs, funnels) for one token
// from its records log — the same rebuild_views_tx the sqlite store runs
// after an ingest. Idempotent: safe to run on every ingest.
function rebuildViews(token: string): void {
  const rows = db.query(
    "SELECT payload FROM records WHERE token = ? ORDER BY seq, kind",
  ).all(token) as { payload: string }[];

  let manifest: any = null;
  const funnels: Record<string, number> = {};
  let maxSeq = 0;
  for (const r of rows) {
    const rec = JSON.parse(r.payload);
    const s = seqOf(rec);
    if (s > maxSeq) maxSeq = s;
    if (rec.record === "minted") {
      manifest = rec.manifest;
    } else if (rec.record === "mutation" && manifest) {
      applyChange(manifest, rec.change, rec.at);
    } else if (rec.record === "event") {
      funnels[rec.stage] = (funnels[rec.stage] ?? 0) + 1;
    }
  }
  if (!manifest) return;

  const doc = JSON.stringify(manifest);
  const revoked = manifest.revoked_at ? 1 : 0;
  const parent = manifest.parent ?? null;
  db.run(
    `INSERT INTO manifests(token, doc, version, target, parent, revoked)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET
       doc = excluded.doc, version = excluded.version, revoked = excluded.revoked`,
    [manifest.token, doc, manifest.version, manifest.target, parent, revoked],
  );
  db.run(
    `INSERT INTO seqs(token, next) VALUES (?, ?)
     ON CONFLICT(token) DO UPDATE SET next = MAX(next, excluded.next)`,
    [token, maxSeq + 1],
  );
  db.run("DELETE FROM funnels WHERE token = ?", [token]);
  for (const [stage, count] of Object.entries(funnels)) {
    db.run(
      "INSERT INTO funnels(token, stage, count) VALUES (?, ?, ?)",
      [token, stage, count],
    );
  }
}

// --- blob CAS ---
// Content-addressed, hash-verified, deduped by existence — identical to
// waggle-store-sqlite::BlobStore. Atomic write (tmp -> rename).
function putBlob(b64: string, contentType: string): any {
  const bytes = Buffer.from(b64, "base64");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const dir = join(BLOB_ROOT, sha.slice(0, 2));
  const dest = join(dir, sha);
  if (!existsSync(dest)) {
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.tmp-${sha}`);
    writeFileSync(tmp, bytes);
    renameSync(tmp, dest);
  }
  return {
    uri: `blob://${sha}`,
    content_type: contentType,
    size: bytes.length,
    sha256: sha,
  };
}

// --- store RPC ops ---
function storeOp(body: any): { ok: any } | { err: string } {
  const op = body?.op;
  try {
    if (op === "ingest") {
      const rec = body.record;
      if (!rec) return { err: "ingest: missing record" };
      const token = rec.record === "minted" ? rec.manifest?.token
        : (rec.token ?? null);
      if (!token) return { err: "ingest: no token in record" };
      const kind = kindOf(rec);
      const seq = seqOf(rec);
      const payload = JSON.stringify(rec);
      const tx = db.transaction(() => {
        const ins = db.run(
          "INSERT OR IGNORE INTO records(token, seq, kind, payload) VALUES (?, ?, ?, ?)",
          [token, seq, kind, payload],
        );
        const fresh = ins.changes > 0;
        // Rebuild on every ingest (idempotent, robust to partial failure).
        rebuildViews(token);
        return fresh;
      });
      const fresh = tx();
      return { ok: { fresh } };
    }
    if (op === "put-blob") {
      const b64 = body.b64;
      if (typeof b64 !== "string") return { err: "put-blob: missing b64" };
      const ct = body.content_type ?? "application/octet-stream";
      const media = putBlob(b64, ct);
      return { ok: media };
    }
    if (op === "scan") {
      const rows = db.query("SELECT payload FROM records ORDER BY token, seq, kind").all() as { payload: string }[];
      return { ok: rows.map((r) => JSON.parse(r.payload)) };
    }
    if (op === "scan-token") {
      const token = body.token;
      const from = body.from_seq ?? 0;
      const rows = db.query(
        "SELECT payload FROM records WHERE token = ? AND seq >= ? ORDER BY seq, kind",
      ).all(token, from) as { payload: string }[];
      return { ok: rows.map((r) => JSON.parse(r.payload)) };
    }
    return { err: `store: unknown op \`${op}\`` };
  } catch (e) {
    return { err: String(e instanceof Error ? e.message : e) };
  }
}

// --- HTTP ---
// Constant-time-ish bearer compare (same discipline as the daemon/worker gate).
function authorized(req: Request): boolean {
  const presented = req.headers.get("authorization")?.startsWith("Bearer ")
    ? req.headers.get("authorization")!.slice(7)
    : "";
  if (presented.length !== BEARER.length) return false;
  let diff = 0;
  for (let i = 0; i < BEARER.length; i++) diff |= presented.charCodeAt(i) ^ BEARER.charCodeAt(i);
  return diff === 0;
}

const TOOLS = [
  "mint", "resolve", "record", "mutate", "funnel", "read",
  "search", "query", "find", "coverage", "map",
].map((name) => ({ name, description: "edge-local passthrough" }));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const server = Bun.serve({
  port,
  hostname: host,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health") {
      return new Response("waggle-edge", { status: 200 });
    }

    // Bearer gate on everything else.
    if (!authorized(req)) {
      return new Response("unauthorized", { status: 401 });
    }

    // List every blob sha256 in the CAS — lets the laptop diff and push
    // only what's missing. `waggle edge push` replicates records + the
    // `manifest.content` snapshot blobs, but NOT folder tree/trigram blobs
    // or child-file blobs (a known gap in edge push itself). The laptop's
    // sync script calls this, then put-blob for each absent sha.
    if (path === "/blobs" && req.method === "GET") {
      const shas: string[] = [];
      if (existsSync(BLOB_ROOT)) {
        for (const dirName of readdirSync(BLOB_ROOT)) {
          const dirPath = join(BLOB_ROOT, dirName);
          // only descend 2-char shard dirs (skip stray files at root)
          if (!statSync(dirPath).isDirectory()) continue;
          for (const fName of readdirSync(dirPath)) {
            if (!fName.startsWith(".tmp-")) shas.push(fName);
          }
        }
      }
      return json(shas);
    }

    if (path === "/store" && req.method === "POST") {
      const body = await req.json();
      const res = storeOp(body);
      if ("err" in res) return json(res);
      return json(res);
    }

    if (path === "/mcp" && req.method === "POST") {
      const frame = await req.json();
      // tools/list — `waggle edge status` counts the tool surface.
      if (frame.method === "tools/list") {
        return json({ jsonrpc: "2.0", id: frame.id ?? 1, result: { tools: TOOLS } });
      }
      // tools/call — not supported (this edge is a replication target,
      // not a compute surface; mint/resolve happen against the local
      // store via the CLI/daemon, not over /mcp).
      if (frame.method === "tools/call") {
        return json({
          jsonrpc: "2.0", id: frame.id ?? 1,
          error: { code: -32601, message: "this edge is replication-only — use the local CLI/daemon for tool calls" },
        });
      }
      return json({ jsonrpc: "2.0", id: frame.id ?? 1, error: { code: -32601, message: "unknown method" } });
    }

    return new Response("not found — routes: /health /store /mcp", { status: 404 });
  },
});

console.log(`waggle edge-server listening on http://${host}:${port} (pid ${process.pid})`);
console.log(`  store:  ${DB_PATH}`);
console.log(`  blobs:  ${BLOB_ROOT}`);
console.log(`  from the laptop: waggle edge push --url http://<this-host>:${port} --bearer <WAGGLE_EDGE_BEARER>`);
