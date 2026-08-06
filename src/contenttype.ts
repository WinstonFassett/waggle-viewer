/** Content-type mapping by file extension. */

export const RAW_CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  yml: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  wasm: "application/wasm",
  map: "application/json; charset=utf-8",
};

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function isImageExt(ext: string): string | undefined {
  return IMAGE_TYPES[ext.toLowerCase()];
}

export function rawContentType(ext: string): string {
  return RAW_CONTENT_TYPES[ext.toLowerCase()] ?? "text/plain; charset=utf-8";
}

/** Map waggle content_type to a short badge label. */
export function badgeLabel(contentType: string): string {
  if (contentType === "text/markdown") return "markdown";
  if (contentType === "application/json") return "json";
  if (contentType === "application/yaml") return "yaml";
  if (contentType === "text/csv") return "csv";
  if (contentType.startsWith("image/")) return contentType.slice(6);
  if (contentType === "text/html") return "html";
  if (contentType === "text/x-script" || contentType === "application/octet-stream") return "code";
  if (contentType === "text/plain") return "text";
  return contentType.split("/").pop() ?? contentType;
}
