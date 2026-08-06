/**
 * json.ts — JSON viewer with syntax highlighting + path navigation.
 */

import { escapeHtml } from "../util.ts";

export function renderJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
  }
  const pretty = JSON.stringify(parsed, null, 2);
  return `<pre>${jsonHighlight(pretty)}</pre>`;
}

export function renderJsonPath(text: string, path: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
  }
  // Navigate via JSON pointer
  const parts = path.split("/").filter(Boolean);
  let current: unknown = parsed;
  for (const part of parts) {
    if (current == null) { current = null; break; }
    current = (current as Record<string, unknown>)[part];
  }
  const value = current === undefined ? "null" : JSON.stringify(current, null, 2);
  return `<pre>${jsonHighlight(value)}</pre>`;
}

function jsonHighlight(s: string): string {
  let r = escapeHtml(s);
  // Keys: "key":
  r = r.replace(/&quot;([^&]*?)&quot;\s*:/g, '<span class="json-key">"$1"</span>:');
  // String values
  r = r.replace(/&quot;([^&]*?)&quot;/g, '<span class="json-str">"$1"</span>');
  // Booleans, null, numbers — only as JSON values (after : , or [)
  r = r.replace(/(:|,|\[)\s*(true|false)\b/g, '$1 <span class="json-bool">$2</span>');
  r = r.replace(/(:|,|\[)\s*null\b/g, '$1 <span class="json-null">null</span>');
  r = r.replace(/(:|,|\[)\s*(-?\d+\.?\d*)\b/g, '$1 <span class="json-num">$2</span>');
  return r;
}
