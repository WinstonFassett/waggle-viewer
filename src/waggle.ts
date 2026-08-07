/**
 * waggle.ts — thin wrapper around the waggle CLI.
 *
 * Resolves the waggle binary explicitly (agents may not have ~/.cargo/bin
 * in PATH). All commands return parsed JSON.
 */

import { $ } from "bun";
import { existsSync } from "node:fs";

let waggleBin: string | null = null;

function resolveWaggleBin(): string | null {
  if (waggleBin !== null) return waggleBin;
  const home = process.env.HOME ?? "/tmp";
  const candidates = [
    process.env.WAGGLE_BIN,
    `${home}/.cargo/bin/waggle`,
    "/opt/homebrew/bin/waggle",
    "/usr/local/bin/waggle",
    "waggle",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (c === "waggle") { waggleBin = c; return c; }
    if (existsSync(c)) { waggleBin = c; return c; }
  }
  return null;
}

function wagglePath(): string {
  const p = resolveWaggleBin();
  if (!p) throw new Error("waggle binary not found — set WAGGLE_BIN or install waggle-cli");
  return p;
}

// --- Types ---

export interface WaggleCandidate {
  token: string;
  target: string;
  disposition: string;
  minted_at: number;
  sharer: string;
  tags: Record<string, string>;
}

export interface WaggleOutlineEntry {
  heading: string;
  level: number;
  line: number;
}

export interface WaggleSymbol {
  depth: number;
  kind: string;
  lines: string;
  name: string;
}

export interface WaggleTreeChild {
  bytes: number;
  content_type: string;
  name: string;
}

export interface WaggleTreeDir {
  bytes: number;
  files: number;
  name: string;
  token: string;
}

export interface WaggleOverview {
  content_type?: string;
  lenses?: string[];
  outline?: WaggleOutlineEntry[];
  symbols?: { omitted: number; symbols: WaggleSymbol[]; total_symbols: number };
  total_lines?: number;
  total_bytes?: number;
  kind?: string;
  children?: WaggleTreeChild[];
  dirs?: WaggleTreeDir[];
  files?: number;
  subdirs?: number;
}

export interface WaggleSearchMatch {
  line: number;
  text: string;
  context?: string;
}

// --- Commands ---

export async function resolve(token: string): Promise<{
  disposition: string;
  contentType: string;
  data: string;
  target: string;
}> {
  const bin = wagglePath();
  const result = await $`${bin} resolve --token ${token}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  const r = json.result;
  return {
    disposition: r.disposition,
    contentType: r.body?.inline?.content_type ?? "unknown",
    data: r.body?.inline?.data ?? "",
    target: r.target ?? "",
  };
}

export async function readAll(token: string): Promise<string> {
  const bin = wagglePath();
  let text = "";
  let window: string | undefined = "1-500";
  while (window) {
    const result = await $`${bin} read --token ${token} --lines ${window}`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const r = json.result;
    text += r.text ?? "";
    if (r.truncated || r.next_window) {
      window = r.next_window ?? undefined;
    } else {
      window = undefined;
    }
  }
  return text;
}

export async function find(query: string = ""): Promise<WaggleCandidate[]> {
  const bin = wagglePath();
  const result = await $`${bin} find ${query}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  return json.result.candidates ?? [];
}

export async function overview(token: string): Promise<WaggleOverview> {
  const bin = wagglePath();
  const proc = Bun.spawn([bin, "read", "--token", token], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0 && !stdout) {
    throw new Error(`waggle read failed (exit ${exitCode})`);
  }
  try {
    const json = JSON.parse(stdout);
    return json.result ?? {};
  } catch {
    return {};
  }
}

export async function readFile(token: string, fileName: string): Promise<string> {
  const bin = wagglePath();
  const result = await $`${bin} read --token ${token} --file ${fileName}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  return json.result?.text ?? "";
}

export async function readSymbol(token: string, symbol: string): Promise<string> {
  const bin = wagglePath();
  const result = await $`${bin} read --token ${token} --symbol ${symbol}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  return json.result?.text ?? "";
}

export async function readPath(token: string, path: string): Promise<string> {
  const bin = wagglePath();
  const result = await $`${bin} read --token ${token} --path ${path}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  return json.result?.slice ?? json.result?.text ?? JSON.stringify(json.result, null, 2);
}

export async function search(token: string, pattern: string): Promise<WaggleSearchMatch[]> {
  const bin = wagglePath();
  const result = await $`${bin} search --token ${token} --pattern ${pattern}`.quiet();
  const json = JSON.parse(result.stdout.toString());
  return json.result?.matches ?? [];
}

export async function queryPath(token: string, path: string): Promise<unknown> {
  const bin = wagglePath();
  try {
    const result = await $`${bin} query --token ${token} --path ${path}`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const data = json.result;
    if (data && typeof data === "object") {
      return data.slice ?? data;
    }
    return data;
  } catch {
    return null;
  }
}

export interface WaggleFunnel {
  children?: number;
  resolves?: number;
  runs?: number;
  stages?: Record<string, number>;
  outcome?: string;
}

export async function funnel(token: string): Promise<WaggleFunnel> {
  const bin = wagglePath();
  try {
    const result = await $`${bin} funnel --token ${token}`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const data = json.result ?? {};
    return {
      children: Array.isArray(data.children) ? data.children.length : (typeof data.children === "number" ? data.children : undefined),
      stages: data.stages,
      outcome: data.outcome,
    };
  } catch {
    return {};
  }
}

export interface WaggleMap {
  disposition?: string;
  replacement?: string;
  here?: string;
}

export async function map(token: string): Promise<WaggleMap> {
  const bin = wagglePath();
  try {
    const result = await $`${bin} map --token ${token}`.quiet();
    const json = JSON.parse(result.stdout.toString());
    const data = json.result ?? {};
    const here = data.here ?? "";
    const disposition = here.includes("active") ? "active"
      : here.includes("supersede") ? "superseded"
      : here.includes("revoke") ? "revoked"
      : undefined;
    return { disposition, here };
  } catch {
    return {};
  }
}

export function blobPath(sha256: string): string {
  const home = process.env.HOME ?? "/tmp";
  return `${home}/.waggle/blobs/${sha256.slice(0, 2)}/${sha256}`;
}

export function waggleBinary(): string {
  return wagglePath();
}
