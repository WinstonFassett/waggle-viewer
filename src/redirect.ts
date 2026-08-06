/**
 * redirect.ts — tiny redirect server for legacy handoff links.
 *
 * Old handoff comments point to https://mac-mini.tailc3138.ts.net/<token>
 * or https://mac-mini.tailc3138.ts.net:4242/<token>.
 * This server redirects those to /waggle-viewer/<token>.
 *
 * Run on port 4242 (the old viewer port) and register at Tailscale Serve /.
 */
const PORT = Number(process.env.PORT ?? 4242);
const PREFIX = process.env.WAGGLE_VIEWER_PREFIX ?? "/waggle-viewer";

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === "/health") return Response.json({ status: "ok", redirect: true });

    // Redirect /<token> → /waggle-viewer/<token>
    // Matches token patterns (6-12 alphanumeric chars) with optional subpaths
    const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length >= 1 && /^[A-Za-z0-9]{6,12}$/.test(segments[0])) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${PREFIX}/${segments.join("/")}` },
      });
    }

    // Everything else → redirect to the viewer dashboard
    return new Response(null, {
      status: 302,
      headers: { Location: `${PREFIX}/` },
    });
  },
});

console.log(`redirect server listening on http://127.0.0.1:${PORT} → ${PREFIX}/`);
