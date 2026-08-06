/** Small utilities. */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ext(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}
