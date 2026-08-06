/**
 * tree.ts — recursive tree walk for folder tokens.
 *
 * Builds a path→token map so we can resolve relative paths across
 * subdirectories (used by markdown image rewriting and HTML preview).
 */

import { overview, type WaggleOverview } from "./waggle.ts";

/** Recursively walk a tree token, building a map of "dir/subdir/file.ext" → owning token. */
export async function buildTreeMap(
  token: string,
  prefix: string,
  map: Map<string, string>,
): Promise<WaggleOverview | null> {
  let ov: WaggleOverview;
  try {
    ov = await overview(token);
  } catch {
    return null;
  }
  if (ov.kind !== "tree" && !ov.children) return null;

  for (const child of ov.children ?? []) {
    const fullPath = prefix ? `${prefix}${child.name}` : child.name;
    map.set(fullPath, token);
  }

  for (const dir of ov.dirs ?? []) {
    const subPrefix = prefix ? `${prefix}${dir.name}/` : `${dir.name}/`;
    await buildTreeMap(dir.token, subPrefix, map);
  }

  return ov;
}

/** Resolve a relative URL against a base path in the tree. */
export function resolveRelativePath(basePath: string, relativeUrl: string): string {
  const url = relativeUrl.split("?")[0].split("#")[0];
  const parts = (basePath + url).split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") { resolved.pop(); continue; }
    resolved.push(part);
  }
  return resolved.join("/");
}

/** Find the owning token for a file path in the tree map. */
export function findOwnerToken(
  cleanUrl: string,
  treeMap: Map<string, string>,
): string | undefined {
  let owner = treeMap.get(cleanUrl);
  if (!owner) {
    const fileName = cleanUrl.includes("/")
      ? cleanUrl.slice(cleanUrl.lastIndexOf("/") + 1)
      : cleanUrl;
    for (const [path, t] of treeMap) {
      if (path === cleanUrl || path.endsWith("/" + cleanUrl)) { owner = t; break; }
      if (path === fileName) { owner = t; break; }
    }
  }
  return owner;
}
