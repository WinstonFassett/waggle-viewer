/**
 * layout.ts — page shell, CSS, persistent sidebar, breadcrumbs.
 *
 * UX principles:
 * - Sidebar is a persistent file tree (stays visible when viewing files)
 * - Folder view shows README/index in main content, NOT a duplicate file list
 * - Breadcrumbs for path context
 * - Mobile responsive (collapsible sidebar)
 */

import { escapeHtml } from "./util.ts";
import type { WaggleOverview, WaggleTreeChild, WaggleTreeDir } from "./waggle.ts";

export function page(title: string, body: string, sidebar = "", breadcrumbs = ""): string {
  const layoutClass = sidebar ? "has-sidebar" : "no-sidebar";
  const sidebarHtml = sidebar
    ? `<nav class="sidebar" id="sidebar">${sidebar}</nav>`
    : "";
  const breadcrumbHtml = breadcrumbs ? `<nav class="breadcrumbs">${breadcrumbs}</nav>` : "";
  const toggleBtn = sidebar
    ? `<button class="sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg:#1a1b26; --fg:#c0caf5; --dim:#565f89; --accent:#7aa2f7;
    --err:#f7768e; --code:#9ece6a; --str:#e0af68; --kw:#bb9af7;
    --num:#ff9e64; --border:#2a2b3d; --bg-alt:#16161e;
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:0; background:var(--bg); color:var(--fg);
         font-family:ui-monospace,SFMono-Regular,Menlo,monospace; line-height:1.6; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  h1 { font-size:1.1rem; font-weight:600; }
  h2 { font-size:1rem; font-weight:600; margin-top:1.5rem; }
  h3 { font-size:0.95rem; font-weight:600; margin-top:1.2rem; color:var(--dim); }
  .dim { color:var(--dim); }
  pre { background:var(--bg-alt); padding:1rem; border-radius:6px; overflow:auto;
        white-space:pre-wrap; word-break:break-word; font-size:0.85rem; }
  code { color:var(--code); font-size:0.9em; }
  pre code { color:var(--fg); }
  table { border-collapse:collapse; width:100%; }
  th, td { padding:0.4rem 0.6rem; text-align:left; border-bottom:1px solid var(--border); }
  th { color:var(--dim); font-weight:500; font-size:0.85rem; }
  .meta { color:var(--dim); font-size:0.85rem; margin:0.5rem 0 1rem; }
  .md p { margin:0.6rem 0; }
  .md ul, .md ol { padding-left:1.4rem; }
  .md li { margin:0.2rem 0; }
  .md hr { border:none; border-top:1px solid var(--border); margin:1.2rem 0; }
  .md blockquote { border-left:3px solid var(--dim); padding-left:1rem; color:var(--dim); margin:0.8rem 0; }
  .md img { max-width:100%; border-radius:6px; }
  .md table { margin:1rem 0; }
  .md th, .md td { padding:0.3rem 0.6rem; }

  /* Layout */
  .layout { display:flex; min-height:100vh; }
  .sidebar {
    width:260px; min-width:260px; border-right:1px solid var(--border);
    padding:1rem; overflow-y:auto; max-height:100vh; position:sticky; top:0;
  }
  .sidebar h3 { margin-top:1rem; margin-bottom:0.3rem; font-size:0.75rem;
    text-transform:uppercase; letter-spacing:0.05em; color:var(--dim); }
  .sidebar ul { list-style:none; padding-left:0; margin:0; }
  .sidebar li { padding:0.2rem 0; font-size:0.82rem; }
  .sidebar li a { color:var(--fg); display:block; padding:0.15rem 0.3rem; border-radius:3px; }
  .sidebar li a:hover { background:var(--bg-alt); text-decoration:none; }
  .sidebar li.active > a { background:var(--accent); color:var(--bg); }
  .sidebar li.h2 { padding-left:0.5rem; }
  .sidebar li.h3 { padding-left:1rem; }
  .sidebar li.h4 { padding-left:1.5rem; }
  .sidebar .dir-item { font-weight:500; }
  .sidebar .dir-item a::before { content:"📁 "; }
  .sidebar .file-item a::before { content:"📄 "; }
  .content { flex:1; padding:2rem; max-width:960px; min-width:0; }

  /* Breadcrumbs */
  .breadcrumbs { font-size:0.8rem; color:var(--dim); margin-bottom:1rem;
    padding-bottom:0.5rem; border-bottom:1px solid var(--border); }
  .breadcrumbs a { color:var(--accent); }
  .breadcrumbs .sep { margin:0 0.3rem; }

  /* Sidebar toggle (mobile) */
  .sidebar-toggle { display:none; position:fixed; top:0.5rem; right:0.5rem;
    z-index:100; background:var(--bg-alt); border:1px solid var(--border);
    color:var(--fg); padding:0.3rem 0.6rem; border-radius:4px; cursor:pointer;
    font-size:1rem; }

  /* File list (folder view summary) */
  .folder-summary { margin:1rem 0; }
  .folder-summary .stat { display:inline-block; margin-right:1rem; color:var(--dim); font-size:0.85rem; }

  /* Badges */
  .badge { display:inline-block; padding:0.1rem 0.4rem; border-radius:3px;
    font-size:0.72rem; background:var(--bg-alt); color:var(--dim); margin-right:0.3rem; }

  /* Evidence blocks */
  .evidence { margin:0.8rem 0; padding:0.6rem 0.8rem; background:var(--bg-alt); border-radius:6px; }

  /* Single-pane folder view */
  .file-section { margin-bottom:3rem; padding-bottom:2rem; border-bottom:1px solid var(--border); }
  .file-section:last-child { border-bottom:none; }
  .file-heading { font-size:1rem; font-weight:600; margin-top:0; padding-top:1rem;
    border-top:1px solid var(--border); scroll-margin-top:1rem; }
  .file-heading:first-child { border-top:none; }
  .scroll-nav { list-style:none; padding-left:0; }
  .scroll-nav li { padding:0.15rem 0; font-size:0.8rem; }
  .scroll-nav .nav-link { color:var(--fg); display:block; padding:0.15rem 0.3rem; border-radius:3px; }
  .scroll-nav .nav-link:hover { background:var(--bg-alt); text-decoration:none; }
  .scroll-nav .nav-link.active { background:var(--accent); color:var(--bg); }
  .html-inline { margin:0.5rem 0; }
  .html-controls { margin:0.3rem 0; font-size:0.85rem; }
  .html-controls a { margin-right:1rem; }

  /* JSON highlighting */
  .json-key { color:var(--accent); }
  .json-str { color:var(--str); }
  .json-num { color:var(--num); }
  .json-bool { color:var(--kw); }
  .json-null { color:var(--dim); }

  /* Search */
  .search-bar { margin:0.5rem 0 1rem; }
  .search-bar input { background:var(--bg-alt); border:1px solid var(--border);
    color:var(--fg); padding:0.3rem 0.6rem; border-radius:4px; font-family:inherit; width:200px; }
  .search-bar button { background:var(--accent); color:var(--bg); border:none;
    padding:0.3rem 0.8rem; border-radius:4px; cursor:pointer; font-family:inherit; }
  .search-result { padding:0.4rem; border-bottom:1px solid var(--border); font-size:0.85rem; }
  .search-result .line { color:var(--dim); margin-right:0.5rem; }

  /* Preview button */
  .preview-btn { display:inline-block; padding:0.4rem 0.8rem; background:var(--accent);
    color:var(--bg); border-radius:4px; text-decoration:none; font-weight:500; margin:0.5rem 0; }
  .preview-btn:hover { text-decoration:none; opacity:0.9; }

  /* Shiki code blocks */
  .shiki { background:var(--bg-alt) !important; padding:1rem; border-radius:6px; overflow:auto; }
  .shiki code { font-size:0.85rem; }

  /* Mobile */
  @media (max-width: 768px) {
    .sidebar { position:fixed; left:-260px; top:0; bottom:0; z-index:50;
      transition:left 0.2s; width:260px; }
    .sidebar.open { left:0; }
    .sidebar-toggle { display:block; }
    .content { padding:1rem; max-width:100%; }
  }
</style>
</head>
<body>
${toggleBtn}
<div class="layout ${layoutClass}">
${sidebarHtml}
<main class="content">
${breadcrumbHtml}
${body}
</main>
</div>
<script>
  // Scroll spy: highlight current section in nav
  (function() {
    var links = document.querySelectorAll('.scroll-nav .nav-link');
    if (!links.length) return;
    var sections = [];
    links.forEach(function(link) {
      var target = document.getElementById(link.dataset.target);
      if (target) sections.push({ el: target, link: link });
    });
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          links.forEach(function(l) { l.classList.remove('active'); });
          var match = sections.find(function(s) { return s.el === entry.target; });
          if (match) match.link.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(function(s) { observer.observe(s.el); });
  })();
  // Auto-grow iframes to fit content
  function autoGrowIframe(iframe) {
    try {
      var doc = iframe.contentDocument || iframe.contentWindow.document;
      iframe.style.height = doc.body.scrollHeight + 'px';
    } catch(e) {}
  }
  window.autoGrowIframe = autoGrowIframe;
</script>
</body>
</html>`;
}

export function errorPage(msg: string): string {
  return page("error", `<p style="color:var(--err)">error: ${escapeHtml(msg)}</p>
<p><a href="/">&larr; back to dashboard</a></p>`);
}

/** Build breadcrumbs for a token + optional file path. */
export function breadcrumbs(token: string, fileName?: string, subdirPath?: string): string {
  const parts: string[] = [`<a href="/">dashboard</a>`];
  if (subdirPath) {
    parts.push(`<a href="/${token}">${escapeHtml(subdirPath)}</a>`);
  } else {
    parts.push(`<a href="/${token}">${token}</a>`);
  }
  if (fileName) {
    parts.push(`<span>${escapeHtml(fileName)}</span>`);
  }
  return parts.join(`<span class="sep">/</span>`);
}

/** Build the persistent file tree sidebar for a folder token. */
export function treeSidebar(
  ov: WaggleOverview,
  token: string,
  currentFile?: string,
): string {
  const fileItems = (ov.children ?? []).map((child) => {
    const active = currentFile === child.name ? " active" : "";
    const size = formatBytes(child.bytes);
    return `<li class="file-item${active}"><a href="/${token}/file/${encodeURIComponent(child.name)}" title="${escapeHtml(child.content_type)} · ${size}">${escapeHtml(child.name)}</a></li>`;
  }).join("");

  const dirItems = (ov.dirs ?? []).map((dir) => {
    return `<li class="dir-item"><a href="/${dir.token}">${escapeHtml(dir.name)}/</a></li>`;
  }).join("");

  let html = "";
  if (fileItems) html += `<h3>files</h3><ul>${fileItems}</ul>`;
  if (dirItems) html += `<h3>subdirs</h3><ul>${dirItems}</ul>`;
  return html || `<p class="dim">empty folder</p>`;
}

/** Build an outline sidebar for markdown (TOC). */
export function outlineSidebar(
  ov: WaggleOverview,
  totalLines: number = 0,
): string {
  if (!ov.outline || ov.outline.length < 3) return "";
  if (totalLines > 0 && totalLines < 40) return "";
  const items = ov.outline.map((e) => {
    const cls = `h${Math.min(e.level, 4)}`;
    return `<li class="${cls}"><a href="#line-${e.line}">${escapeHtml(e.heading)}</a></li>`;
  }).join("");
  return `<h3>outline</h3><ul>${items}</ul>`;
}

/** Build a symbol sidebar for code. */
export function symbolSidebar(ov: WaggleOverview): string {
  if (!ov.symbols?.symbols?.length) return "";
  const items = ov.symbols.symbols.map((s) => {
    return `<li class="h${Math.min(s.depth + 1, 4)}"><a href="/${currentToken}/symbol/${encodeURIComponent(s.name)}">${escapeHtml(s.name)}</a></li>`;
  }).join("");
  return `<h3>symbols</h3><ul>${items}</ul>`;
}

// Module-level state for symbol sidebar (set by server before rendering)
let currentToken = "";

export function setCurrentToken(token: string) {
  currentToken = token;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
