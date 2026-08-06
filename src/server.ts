/**
 * server.ts — HTTP server for waggle tokens.
 *
 * Routes:
 *   GET /                        — dashboard
 *   GET /<token>                 — rendered token (type-aware)
 *   GET /<token>/raw             — raw content
 *   GET /<token>/file/<f>        — file from folder token
 *   GET /<token>/file/<f>/raw    — raw file bytes
 *   GET /<token>/symbol/<s>      — code symbol
 *   GET /<token>/path/<p>        — JSON path
 *   GET /<token>/search?q=       — search within token
 *   GET /<token>/preview[/<f>]   — live HTML preview
 *   GET /health                  — JSON status
 */

import {
  readAll, resolve, find, overview,
  readFile as waggleReadFile, readSymbol, readPath, search,
  type WaggleOverview,
} from "./waggle.ts";
import { buildTreeMap } from "./tree.ts";
import { rawContentType, isImageExt, badgeLabel } from "./contenttype.ts";
import { page, errorPage, breadcrumbs, treeSidebar, outlineSidebar, symbolSidebar, formatBytes, setCurrentToken, setBasePath, bp } from "./layout.ts";
import { ext, escapeHtml } from "./util.ts";
import { renderMarkdown } from "./render/markdown.ts";
import { renderCode, renderCodeBlock, langFromExt } from "./render/code.ts";
import { renderJson, renderJsonPath } from "./render/json.ts";
import { isCsv, renderCsv } from "./render/csv.ts";
import { serveTokenImage, serveFolderImage } from "./render/image.ts";
import { renderPreview } from "./render/preview.ts";
import { renderFolder } from "./render/folder.ts";

let currentToken = "";

export function setBasePathConfig(path: string): void {
  setBasePath(path);
}

export function createServer(port: number, host: string) {
  return Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const t = new Date().toISOString();
      console.log(`${t} ${req.method} ${path}`);

      if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
      // Note: reverse proxies (e.g. Tailscale Serve --set-path) strip the path
      // prefix before forwarding. So we match on the stripped path, but generate
      // links with the basePath prefix (via bp()).
      if (path === "/" || path === "") return dashboard();
      if (path === "/health") return health();

      const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);
      if (segments.length >= 1 && /^[A-Za-z0-9]{6,12}$/.test(segments[0])) {
        const token = segments[0];
        currentToken = token;
        setCurrentToken(token);
        const sub = segments[1];

        if (sub === "raw" && segments.length === 2) return serveToken(token, true);
        if (sub === "file" && segments.length >= 3) {
          const fileParts = segments.slice(2);
          const isRaw = fileParts[fileParts.length - 1] === "raw";
          const fileName = isRaw ? fileParts.slice(0, -1).join("/") : fileParts.join("/");
          return serveFile(token, decodeURIComponent(fileName), isRaw);
        }
        if (sub === "symbol" && segments.length >= 3) {
          return serveSymbol(token, decodeURIComponent(segments.slice(2).join("/")));
        }
        if (sub === "path" && segments.length >= 3) {
          return servePath(token, "/" + segments.slice(2).join("/"));
        }
        if (sub === "search") {
          return serveSearch(token, url.searchParams.get("q") ?? "");
        }
        if (sub === "preview") {
          if (segments.length >= 3) {
            return servePreviewRoute(token, decodeURIComponent(segments.slice(2).join("/")));
          }
          return servePreviewRoute(token, "index.html");
        }
        if (segments.length === 1) return serveToken(token, false);
      }

      return new Response(errorPage("not found"), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
}

// --- Dashboard ---

async function dashboard(): Promise<Response> {
  let tokens: Awaited<ReturnType<typeof find>> = [];
  try {
    tokens = await find();
  } catch {
    // waggle not available
  }

  // Build a tree from file paths: tokens whose target is a subdirectory
  // of another token's target are children. Tagged tokens (name=foo) are roots.
  const tree = buildTokenTree(tokens.slice(0, 50));
  const items = renderTokenTree(tree);
  return new Response(
    page("waggle viewer", `<h1>waggle viewer</h1><p class="dim">${tokens.length} tokens</p><ul class="token-tree">${items}</ul>`),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

interface TokenNode {
  token: string;
  target: string;
  tags: Record<string, string>;
  minted_at: number;
  children: TokenNode[];
  depth: number;
}

/** Build a tree from flat token list by matching file path prefixes. */
function buildTokenTree(tokens: { token: string; target: string; tags: Record<string, string>; minted_at: number }[]): TokenNode[] {
  // Normalize targets to comparable paths
  const normalized = tokens.map((t) => ({
    ...t,
    path: t.target.replace(/^file:\/\//, "").replace(/\/+$/, ""),
  }));

  // Sort by path length ascending so parents come before children
  normalized.sort((a, b) => a.path.length - b.path.length);

  const nodes: TokenNode[] = [];
  const allNodes: TokenNode[] = [];

  for (const t of normalized) {
    const node: TokenNode = { ...t, children: [], depth: 0 };
    allNodes.push(node);

    // Find parent: the longest path that is a prefix of this path
    let parent: TokenNode | undefined;
    for (const candidate of allNodes) {
      if (candidate === node) continue;
      if (t.path.startsWith(candidate.path + "/")) {
        if (!parent || candidate.path.length > parent.path.length) {
          parent = candidate;
        }
      }
    }
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      nodes.push(node);
    }
  }

  // Sort roots newest first, children alphabetically
  nodes.sort((a, b) => b.minted_at - a.minted_at);
  for (const n of allNodes) {
    n.children.sort((a, b) => a.target.localeCompare(b.target));
  }
  return nodes;
}

/** Render the token tree as nested HTML. */
function renderTokenTree(nodes: TokenNode[]): string {
  return nodes.map((n) => {
    const date = new Date(n.minted_at * 1000).toLocaleDateString();
    const tags = Object.entries(n.tags).map(([k, v]) => `<span class="badge">${escapeHtml(k)}=${escapeHtml(v)}</span>`).join("");
    const name = n.tags.name || n.path.split("/").pop() || n.token;
    const indent = n.depth > 0 ? ` style="padding-left:${n.depth * 1.2}rem"` : "";
    const childHtml = n.children.length ? renderTokenTree(n.children) : "";
    return `<li${indent}><a href="${bp(`/${n.token}`)}">${escapeHtml(name)}</a> <span class="dim">${escapeHtml(n.token)}</span> ${tags} <span class="dim">${date}</span>${childHtml ? `<ul>${childHtml}</ul>` : ""}</li>`;
  }).join("");
}

function health(): Response {
  return Response.json({ status: "ok", port: currentPort, ts: Date.now() });
}

let currentPort = 0;
export function setPort(p: number) { currentPort = p; }

// --- Token view ---

async function serveToken(token: string, raw: boolean): Promise<Response> {
  let ov: WaggleOverview;
  try {
    ov = await overview(token);
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  // Folder/tree token
  if (ov.kind === "tree" || ov.children) {
    return serveFolder(token, ov);
  }

  // Image token
  if (ov.content_type?.startsWith("image/")) {
    const img = await serveTokenImage(token, raw);
    if (img) {
      if (raw) return new Response(img.bytes, { headers: { "content-type": img.contentType } });
      return new Response(
        page(`token ${token}`,
          breadcrumbs(token) +
          `<p class="meta"><span class="badge">${badgeLabel(ov.content_type)}</span> ${formatBytes(ov.total_bytes ?? 0)}</p>` +
          `<img src="${bp(`/${token}/raw`)}" style="max-width:100%;border-radius:6px">`),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  }

  // Text content
  let text: string;
  try {
    text = await readAll(token);
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (raw) {
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const ct = ov.content_type ?? "text/plain";
  const fileExt = ct === "text/markdown" ? "md"
    : ct === "application/json" ? "json"
    : ct === "application/yaml" ? "yaml"
    : ct === "text/csv" ? "csv"
    : "txt";

  const sidebar = outlineSidebar(ov, ov.total_lines) || symbolSidebar(ov);
  const bc = breadcrumbs(token);
  const meta = `<p class="meta"><span class="badge">${badgeLabel(ct)}</span> ${formatBytes(ov.total_bytes ?? 0)}</p>`;

  if (ct === "text/markdown") {
    const html = await renderMarkdown(text, { token });
    return new Response(page(`token ${token}`, bc + meta + html, sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (ct === "application/json") {
    return new Response(page(`token ${token}`, bc + meta + renderJson(text), sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (isCsv(text)) {
    return new Response(page(`token ${token}`, bc + meta + renderCsv(text), sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  // Code / text
  const codeHtml = await renderCode(text, fileExt);
  return new Response(page(`token ${token}`, bc + meta + codeHtml, sidebar),
    { headers: { "content-type": "text/html; charset=utf-8" } });
}

// --- Folder view (single-pane scroll — all files rendered inline) ---

async function serveFolder(token: string, ov: WaggleOverview): Promise<Response> {
  const bc = breadcrumbs(token);
  const meta = `<p class="meta"><span class="badge">folder</span> ${ov.files ?? 0} files, ${ov.subdirs ?? 0} subdirs · ${formatBytes(ov.total_bytes ?? 0)}</p>`;

  // Check for index.html (offer preview)
  const hasIndex = (ov.children ?? []).some((c) => c.name === "index.html");
  const previewBtn = hasIndex
    ? `<a class="preview-btn" href="${bp(`/${token}/preview`)}" target="_blank">Preview site →</a>`
    : "";

  // Render all files inline on one scrollable page
  const { html, nav } = await renderFolder(token, ov);

  return new Response(
    page(`folder ${token}`, bc + meta + previewBtn + html, nav),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// --- File from folder ---

async function serveFile(token: string, fileName: string, raw: boolean): Promise<Response> {
  const fileExt = ext(fileName);

  // Images — read from target path
  const imageType = isImageExt(fileExt);
  if (imageType) {
    const img = await serveFolderImage(token, fileName);
    if (img) {
      if (raw) return new Response(img.bytes, { headers: { "content-type": img.contentType } });
      return new Response(
        page(`${fileName} · ${token}`,
          breadcrumbs(token, fileName) +
          `<p class="meta">${escapeHtml(fileName)}</p>` +
          `<img src="${bp(`/${token}/file/${encodeURIComponent(fileName)}/raw`)}" style="max-width:100%;border-radius:6px">`,
          await getFileSidebar(token, fileName)),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  }

  let text: string;
  try {
    text = await waggleReadFile(token, fileName);
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (raw) {
    return new Response(text, { headers: { "content-type": rawContentType(fileExt) } });
  }

  const bc = breadcrumbs(token, fileName);
  const meta = `<p class="meta">${escapeHtml(fileName)}</p>`;
  const sidebar = await getFileSidebar(token, fileName);

  if (fileExt === "md") {
    const treeMap = new Map<string, string>();
    try { await buildTreeMap(token, "", treeMap); } catch {}
    const html = await renderMarkdown(text, { token, treeMap });
    return new Response(page(`${fileName} · ${token}`, bc + meta + html, sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (fileExt === "json") {
    return new Response(page(`${fileName} · ${token}`, bc + meta + renderJson(text), sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (isCsv(text)) {
    return new Response(page(`${fileName} · ${token}`, bc + meta + renderCsv(text), sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (fileExt === "html" || fileExt === "htm") {
    const previewLink = `<a class="preview-btn" href="${bp(`/${token}/preview/${encodeURIComponent(fileName)}`)}" target="_blank">Live preview →</a>`;
    const codeHtml = await renderCode(text, "html");
    return new Response(page(`${fileName} · ${token}`, bc + meta + previewLink + codeHtml, sidebar),
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  // Code / plain text
  const codeHtml = await renderCode(text, fileExt);
  return new Response(page(`${fileName} · ${token}`, bc + meta + codeHtml, sidebar),
    { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Get the sidebar for a file view — persistent tree + optional outline/symbols. */
async function getFileSidebar(token: string, fileName: string): Promise<string> {
  try {
    const ov = await overview(token);
    const tree = treeSidebar(ov, token, fileName);
    // For markdown files, also add outline if the file has one
    // (But the overview is for the folder, not the file — skip for now)
    return tree;
  } catch {
    return "";
  }
}

// --- Symbol ---

async function serveSymbol(token: string, symbol: string): Promise<Response> {
  let text: string;
  try {
    text = await readSymbol(token, symbol);
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const codeHtml = await renderCodeBlock(text, "typescript");
  return new Response(
    page(`${symbol} · ${token}`,
      breadcrumbs(token, symbol) +
      `<p class="meta">symbol: ${escapeHtml(symbol)}</p>` + codeHtml),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// --- JSON path ---

async function servePath(token: string, path: string): Promise<Response> {
  let text: string;
  try {
    text = await readAll(token);
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response(
    page(`path ${path} · ${token}`,
      breadcrumbs(token, path) +
      `<p class="meta">path: ${escapeHtml(path)}</p>` + renderJsonPath(text, path)),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// --- Search ---

async function serveSearch(token: string, query: string): Promise<Response> {
  let matches: { line: number; text: string }[] = [];
  if (query) {
    try { matches = await search(token, query); } catch {}
  }
  const results = matches.map((m) =>
    `<div class="search-result"><span class="dim">L${m.line}:</span> ${escapeHtml(m.text)}</div>`
  ).join("");
  return new Response(
    page(`search: ${query} · ${token}`,
      breadcrumbs(token, `search: ${query}`) +
      `<div class="search-bar"><form action="${bp(`/${token}/search`)}" method="get"><input name="q" value="${escapeHtml(query)}" placeholder="search..."><button>search</button></form></div>` +
      `<p class="meta">${matches.length} matches</p>${results}`),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// --- Preview ---

async function servePreviewRoute(token: string, htmlPath: string): Promise<Response> {
  try {
    const html = await renderPreview(token, htmlPath);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response(errorPage((e as Error).message), { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}
