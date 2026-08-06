/**
 * code.ts — syntax highlighting with shiki.
 *
 * Highlights code in 90+ languages. Falls back to plain <pre> if shiki
 * fails or the language is unknown.
 */

import { codeToHtml } from "shiki";

// Cache highlighter theme for reuse
const THEME = "tokyo-night";

// Map common extensions to shiki language ids
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx",
  js: "javascript", jsx: "jsx", mjs: "javascript",
  go: "go",
  py: "python",
  rs: "rust",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", cc: "cpp",
  cs: "csharp",
  php: "php",
  html: "html", htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  sh: "bash", bash: "bash",
  zsh: "bash",
  md: "markdown",
  dockerfile: "dockerfile",
  graphql: "graphql",
  proto: "proto",
  lua: "lua",
  r: "r",
  dart: "dart",
  elixir: "elixir",
  ex: "elixir",
  exs: "elixir",
  zig: "zig",
  nim: "nim",
  vim: "vim",
  diff: "diff",
  patch: "diff",
};

export function langFromExt(fileExt: string): string | undefined {
  return EXT_TO_LANG[fileExt.toLowerCase()];
}

export async function renderCode(code: string, fileExt: string): Promise<string> {
  const lang = langFromExt(fileExt);
  if (!lang) {
    // No language mapping — plain pre/code
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
  try {
    const html = await codeToHtml(code, { lang, theme: THEME });
    return html;
  } catch {
    // shiki failed — fall back to plain
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

export async function renderCodeBlock(code: string, lang: string): Promise<string> {
  try {
    const html = await codeToHtml(code, { lang: lang || "text", theme: THEME });
    return html;
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
