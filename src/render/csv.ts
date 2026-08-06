/**
 * csv.ts — CSV rendering with csv-parse.
 */

import { parse } from "csv-parse/sync";
import { escapeHtml } from "../util.ts";

export function isCsv(text: string): boolean {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return false;
  const firstLine = lines[0];
  const commas = (firstLine.match(/,/g) || []).length;
  return commas >= 1;
}

export function renderCsv(text: string): string {
  try {
    const records: string[][] = parse(text, { delimiter: "," });
    if (records.length === 0) return `<pre>${escapeHtml(text)}</pre>`;
    const [header, ...rows] = records;
    const thead = `<thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map((row) =>
      `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
    ).join("")}</tbody>`;
    return `<table>${thead}${tbody}</table>`;
  } catch {
    return `<pre>${escapeHtml(text)}</pre>`;
  }
}
