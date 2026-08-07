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

export async function getLineage(token: string): Promise<TokenLineage> {
  const [parentResult, mintedResult, funnelResult, mapResult] = await Promise.all([
    queryPath(token, "/manifest/parent"),
    queryPath(token, "/manifest/minted_at"),
    funnel(token),
    map(token),
  ]);

  return {
    token,
    parent: typeof parentResult === "string" ? parentResult : undefined,
    minted_at: typeof mintedResult === "number" ? mintedResult : undefined,
    funnel: funnelResult,
    disposition: mapResult.disposition,
    replacement: mapResult.replacement,
  };
}

export async function getLineageChain(token: string, maxDepth = 10): Promise<TokenLineage[]> {
  const chain: TokenLineage[] = [];
  let current = token;
  let depth = 0;

  while (current && depth < maxDepth) {
    const lineage = await getLineage(current);
    chain.push(lineage);
    if (!lineage.parent) break;
    current = lineage.parent;
    depth++;
  }

  return chain;
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

export async function renderLineageBreadcrumb(token: string, maxLength = 5): Promise<string> {
  const chain = await getLineageChain(token, maxLength);
  if (chain.length <= 1) return "";

  const parts = chain.reverse().map((lineage) => {
    return `<a href="${bp(`/${lineage.token}`)}">${escapeHtml(lineage.token)}</a>`;
  }).join(`<span class="sep">←</span>`);

  return `<div class="lineage-breadcrumb" style="margin:1rem 0; padding:0.5rem; background:var(--bg-alt); border-radius:4px;"><strong>lineage:</strong> ${parts}</div>`;
}
