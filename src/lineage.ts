import { queryPath, funnel, map, type WaggleFunnel, type WaggleMap } from "./waggle.ts";
import { escapeHtml } from "./util.ts";
import { bp } from "./layout.ts";

export interface TokenLineage {
  token: string;
  parent?: string;
  minted_at?: number;
  funnel: WaggleFunnel;
  disposition?: string;
  replacement?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const lineageCache = new Map<string, { lineage: TokenLineage; expires: number }>();

async function getParent(token: string): Promise<string | undefined> {
  const parent = await queryPath(token, "/manifest/parent");
  return typeof parent === "string" ? parent : undefined;
}

export async function getLineage(token: string): Promise<TokenLineage> {
  const cached = lineageCache.get(token);
  if (cached && cached.expires > Date.now()) {
    console.log(`[lineage] cache hit for ${token}`);
    return cached.lineage;
  }

  console.log(`[lineage] cache miss for ${token}`);
  const [mintedResult, funnelResult, mapResult] = await Promise.all([
    queryPath(token, "/manifest/minted_at"),
    funnel(token),
    map(token),
  ]);

  const lineage: TokenLineage = {
    token,
    minted_at: typeof mintedResult === "number" ? mintedResult : undefined,
    funnel: funnelResult,
    disposition: mapResult.disposition,
    replacement: mapResult.replacement,
  };

  lineageCache.set(token, { lineage, expires: Date.now() + CACHE_TTL_MS });
  return lineage;
}

export async function getLineageChain(token: string, maxDepth = 10): Promise<TokenLineage[]> {
  console.log(`[lineage] building chain for ${token}`);

  // Priority 2: collect parent tokens first (one sequential query per level).
  const tokens: string[] = [];
  let current: string | undefined = token;
  while (current && tokens.length < maxDepth) {
    tokens.push(current);
    current = await getParent(current);
  }

  // Then fetch all lineage data in parallel.
  const lineages = await Promise.all(tokens.map((t) => getLineage(t)));

  // Restore parent pointers using the known chain order.
  for (let i = 0; i < lineages.length; i++) {
    lineages[i].parent = tokens[i + 1];
  }

  return lineages;
}

export function formatTimestamp(ms: number): string {
  if (!ms || ms <= 0) return "";
  const date = new Date(ms);
  return date.toISOString();
}

export function renderLineageInfo(lineage: TokenLineage): string {
  let html = "";

  if (lineage.minted_at) {
    html += `<div class="meta"><strong>minted:</strong> ${escapeHtml(formatTimestamp(lineage.minted_at))}</div>`;
  }

  if (lineage.disposition && lineage.disposition !== "active") {
    html += `<div class="meta"><strong>disposition:</strong> ${escapeHtml(lineage.disposition)}</div>`;
  }

  const telemetryParts: string[] = [];
  if (lineage.funnel.children !== undefined && typeof lineage.funnel.children === "number") {
    telemetryParts.push(`${lineage.funnel.children} children`);
  }
  if (lineage.funnel.stages) {
    const stages = lineage.funnel.stages;
    const stageCounts = Object.entries(stages)
      .map(([stage, count]) => `${count} ${stage}`)
      .join(", ");
    if (stageCounts) telemetryParts.push(stageCounts);
  }
  if (telemetryParts.length > 0) {
    html += `<div class="meta"><strong>telemetry:</strong> ${telemetryParts.join(", ")}</div>`;
  }

  return html;
}

export async function renderLineageBreadcrumb(token: string, maxLength = 20): Promise<string> {
  const chain = await getLineageChain(token, maxLength);
  if (chain.length <= 1) return "";

  const parts = chain.reverse().map((lineage) => {
    const label = lineage.token;
    const shortLabel = label.length > 60 ? label.slice(0, 57) + "..." : label;
    return `<a href="${bp(`/${lineage.token}`)}" title="${escapeHtml(lineage.token)}">${escapeHtml(shortLabel)}</a>`;
  }).join(`<span class="sep"> ← </span>`);

  return `<div class="lineage-breadcrumb" style="margin:1rem 0; padding:0.5rem; background:var(--bg-alt); border-radius:4px;"><strong>lineage:</strong> ${parts}</div>`;
}
