/**
 * folder.ts — single-pane folder rendering.
 *
 * Renders ALL files in a folder token inline on one scrollable page,
 * in the spirit of Magic Wormhole / document-style viewing. No clicking
 * through files one at a time — everything is visible by scrolling.
 *
 * Each file becomes a <section> with an anchor ID. A scroll spy nav
 * (sticky, left side) highlights the current section as you scroll.
 */

import { readAll, resolve, overview, readFile as waggleReadFile, type WaggleOverview, type WaggleTreeChild, type WaggleTreeDir } from "../waggle.ts";
import { buildTreeMap } from "../tree.ts";
import { ext, escapeHtml } from "../util.ts";
import { isImageExt, badgeLabel } from "../contenttype.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderCode } from "./code.ts";
import { renderJson } from "./json.ts";
import { isCsv, renderCsv } from "./csv.ts";
import { serveFolderImage } from "./image.ts";
import { formatBytes } from "../layout.ts";

export interface FolderRenderResult {
  html: string;
  nav: string;
}

/** Render a folder token as a single scrollable page with all files inline. */
export async function renderFolder(
  token: string,
  ov: WaggleOverview,
): Promise<FolderRenderResult> {
  const treeMap = new Map<string, string>();
  try { await buildTreeMap(token, "", treeMap); } catch {}

  const children = ov.children ?? [];
  const dirs = ov.dirs ?? [];

  // Build nav items (file names for scroll spy)
  const navItems: string[] = [];
  const sections: string[] = [];

  // Render each file as an inline section
  for (const child of children) {
    const id = `file-${slugify(child.name)}`;
    navItems.push(`<li><a href="#${id}" class="nav-link" data-target="${id}">${escapeHtml(child.name)}</a></li>`);

    let content = "";
    try {
      content = await renderFileInline(token, child, treeMap);
    } catch (e) {
      content = `<p class="dim">error rendering ${escapeHtml(child.name)}: ${escapeHtml((e as Error).message)}</p>`;
    }

    sections.push(`<section id="${id}" class="file-section">
<h2 class="file-heading">${escapeHtml(child.name)} <span class="badge">${badgeLabel(child.content_type)}</span> <span class="dim">${formatBytes(child.bytes)}</span></h2>
${content}
</section>`);
  }

  // Add subdirectory links
  for (const dir of dirs) {
    const id = `dir-${slugify(dir.name)}`;
    navItems.push(`<li><a href="#${id}" class="nav-link" data-target="${id}">📁 ${escapeHtml(dir.name)}/</a></li>`);
    sections.push(`<section id="${id}" class="file-section">
<h2 class="file-heading">📁 ${escapeHtml(dir.name)}/ <span class="dim">${dir.files} files</span></h2>
<p><a href="/${dir.token}" class="preview-btn">Browse ${escapeHtml(dir.name)} →</a></p>
</section>`);
  }

  const nav = `<h3>contents</h3><ul class="scroll-nav">${navItems.join("")}</ul>`;
  const html = sections.join("\n");

  return { html, nav };
}

/** Render a single file inline (not behind a click). */
async function renderFileInline(
  token: string,
  child: WaggleTreeChild,
  treeMap: Map<string, string>,
): Promise<string> {
  const fileExt = ext(child.name);
  const ct = child.content_type;

  // Images — render inline from blob store
  if (ct.startsWith("image/") || isImageExt(fileExt)) {
    const img = await serveFolderImage(token, child.name);
    if (img) {
      return `<img src="data:${img.contentType};base64,${base64(img.bytes)}" alt="${escapeHtml(child.name)}" style="max-width:100%;border-radius:6px">`;
    }
    return `<p class="dim">[image not available]</p>`;
  }

  // Read text content
  const text = await waggleReadFile(token, child.name);

  // Markdown — render as HTML
  if (fileExt === "md" || ct === "text/markdown") {
    return await renderMarkdown(text, { token, treeMap });
  }

  // JSON — syntax highlighted
  if (fileExt === "json" || ct === "application/json") {
    return renderJson(text);
  }

  // CSV — table
  if (isCsv(text)) {
    return renderCsv(text);
  }

  // HTML — render in sandboxed iframe with auto-height
  if (fileExt === "html" || fileExt === "htm") {
    return renderHtmlInline(token, child.name, text, treeMap);
  }

  // YAML — highlighted
  if (fileExt === "yaml" || fileExt === "yml") {
    return await renderCode(text, "yaml");
  }

  // Code / text — highlighted
  return await renderCode(text, fileExt);
}

/** Convert ArrayBuffer to base64 string. */
function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Slugify a filename for use as an anchor ID. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Render an HTML file inline in a sandboxed iframe with auto-height.
 *
 *  - Rewrites relative URLs to waggle file routes (CSS/JS/images load)
 *  - Uses srcdoc + sandbox so the HTML can't break the viewer's CSS/JS
 *  - Auto-grows the iframe to fit content
 *  - "View source" toggle shows the raw HTML as code
 *  - "Open as page" link opens the full preview in a new tab
 */
async function renderHtmlInline(
  token: string,
  fileName: string,
  html: string,
  treeMap: Map<string, string>,
): Promise<string> {
  // Rewrite relative URLs (same logic as preview.ts)
  const basePath = fileName.includes("/")
    ? fileName.slice(0, fileName.lastIndexOf("/") + 1)
    : "";
  const rewritten = rewriteHtmlUrls(html, basePath, treeMap);

  // Escape for srcdoc attribute (escape quotes and ampersands)
  const srcdoc = rewritten
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");

  const iframeId = `iframe-${slugify(fileName)}`;
  const sourceId = `source-${slugify(fileName)}`;

  return `<div class="html-inline">
<iframe id="${iframeId}" srcdoc="${srcdoc}" sandbox="allow-scripts allow-same-origin"
  style="width:100%;border:1px solid var(--border);border-radius:6px;min-height:300px"
  onload="autoGrowIframe(this)"></iframe>
<p class="html-controls">
  <a href="/${token}/preview/${encodeURIComponent(fileName)}" target="_blank" class="preview-btn">Open as page →</a>
  <a href="javascript:void(0)" onclick="var s=document.getElementById('${sourceId}');s.style.display=s.style.display==='none'?'block':'none'">View source</a>
</p>
<pre id="${sourceId}" style="display:none"><code>${escapeHtml(html)}</code></pre>
</div>`;
}

/** Rewrite relative URLs in HTML to waggle file routes. */
function rewriteHtmlUrls(
  html: string,
  basePath: string,
  treeMap: Map<string, string>,
): string {
  return html.replace(/(href|src)=["']([^"']+)["']/g, (match, attr, url) => {
    if (/^(https?:|\/\/|data:|mailto:|#)/.test(url)) return match;
    const cleanUrl = url.split("?")[0].split("#")[0];
    // Find owning token in tree map
    let ownerToken: string | undefined;
    const fileName = cleanUrl.includes("/")
      ? cleanUrl.slice(cleanUrl.lastIndexOf("/") + 1)
      : cleanUrl;
    ownerToken = treeMap.get(cleanUrl);
    if (!ownerToken) {
      for (const [path, t] of treeMap) {
        if (path === cleanUrl || path.endsWith("/" + cleanUrl)) { ownerToken = t; break; }
        if (path === fileName) { ownerToken = t; break; }
      }
    }
    if (ownerToken) {
      return `${attr}="/${ownerToken}/file/${encodeURIComponent(fileName)}/raw"`;
    }
    return match;
  });
}

