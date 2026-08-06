/**
 * markdown.ts — markdown rendering with marked + image/link rewriting.
 *
 * Uses marked for full markdown support (tables, task lists, nested lists,
 * footnotes). Rewrites relative image/link URLs to waggle file routes.
 */

import { marked } from "marked";
import { findOwnerToken } from "../tree.ts";
import { escapeHtml } from "../util.ts";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export interface MarkdownContext {
  token?: string;
  treeMap?: Map<string, string>;
}

/** Render markdown to HTML, rewriting relative URLs to waggle file routes. */
export async function renderMarkdown(md: string, ctx?: MarkdownContext): Promise<string> {
  // Pre-process: rewrite image and link URLs before marked parses them
  const processed = ctx?.token ? rewriteUrls(md, ctx) : md;

  const html = await marked.parse(processed);
  return `<div class="md">${html}</div>`;
}

/** Rewrite relative image/link URLs in markdown to waggle file routes. */
function rewriteUrls(md: string, ctx: MarkdownContext): string {
  const { token, treeMap } = ctx;
  if (!token) return md;

  // Images: ![alt](url)
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const resolved = resolveUrl(url, token, treeMap);
    return `![${alt}](${resolved})`;
  });

  // Links: [text](url) — but not images (already handled)
  md = md.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const resolved = resolveUrl(url, token, treeMap);
    return `[${text}](${resolved})`;
  });

  return md;
}

/** Resolve a relative URL to a waggle file route. */
function resolveUrl(url: string, token: string, treeMap?: Map<string, string>): string {
  // Skip absolute URLs, data URIs, anchors, and already-resolved waggle routes
  if (/^(https?:|\/\/|data:|mailto:|#|\/[A-Za-z0-9]{6,12})/.test(url)) return url;

  const cleanUrl = url.split("?")[0].split("#")[0];

  // If we have a tree map, try to find the owning subdir token
  if (treeMap) {
    const owner = findOwnerToken(cleanUrl, treeMap);
    if (owner) {
      const fileName = cleanUrl.includes("/")
        ? cleanUrl.slice(cleanUrl.lastIndexOf("/") + 1)
        : cleanUrl;
      return `/${owner}/file/${encodeURIComponent(fileName)}/raw`;
    }
  }

  // Fallback: assume file is in the same directory as the markdown
  return `/${token}/file/${encodeURIComponent(cleanUrl)}/raw`;
}

/** Extract headings from markdown for outline (used when waggle overview has no outline). */
export function extractOutline(md: string): { heading: string; level: number; line: number }[] {
  const lines = md.split("\n");
  const outline: { heading: string; level: number; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      outline.push({ heading: h[2], level: h[1].length, line: i + 1 });
    }
  }
  return outline;
}
