/**
 * preview.ts — live HTML preview from folder tokens.
 *
 * Rewrites relative URLs in HTML to point to waggle file routes,
 * so CSS/JS/images load correctly when previewing a static site.
 */

import { readFile } from "../waggle.ts";
import { buildTreeMap, resolveRelativePath } from "../tree.ts";

export async function renderPreview(
  token: string,
  htmlPath: string,
): Promise<string> {
  let html = await readFile(token, htmlPath);

  // Build tree map for resolving relative paths
  const treeMap = new Map<string, string>();
  try {
    await buildTreeMap(token, "", treeMap);
  } catch {
    // ok — will use fallback
  }

  // Rewrite href and src attributes
  const basePath = htmlPath.includes("/")
    ? htmlPath.slice(0, htmlPath.lastIndexOf("/") + 1)
    : "";

  html = html.replace(/(href|src)=["']([^"']+)["']/g, (match, attr, url) => {
    if (/^(https?:|\/\/|data:|mailto:|#)/.test(url)) return match;
    const resolved = resolveRelativePath(basePath, url);
    // Find owning token
    let ownerToken: string | undefined;
    const fileName = resolved.includes("/")
      ? resolved.slice(resolved.lastIndexOf("/") + 1)
      : resolved;
    // Try exact match
    ownerToken = treeMap.get(resolved);
    // Try by filename
    if (!ownerToken) {
      for (const [path, t] of treeMap) {
        if (path === resolved || path.endsWith("/" + resolved)) { ownerToken = t; break; }
        if (path === fileName) { ownerToken = t; break; }
      }
    }
    if (ownerToken) {
      return `${attr}="/${ownerToken}/file/${encodeURIComponent(fileName)}/raw"`;
    }
    return match;
  });

  return html;
}
