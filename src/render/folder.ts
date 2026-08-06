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

  // HTML — show source + preview button
  if (fileExt === "html" || fileExt === "htm") {
    const previewBtn = `<p><a href="/${token}/preview/${encodeURIComponent(child.name)}" target="_blank" class="preview-btn">Live preview →</a></p>`;
    const codeHtml = await renderCode(text, "html");
    return previewBtn + codeHtml;
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
