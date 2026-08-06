/**
 * redirect.ts — tiny redirect server for legacy handoff links.
 *
 * Old handoff comments point to:
 *   https://mac-mini.tailc3138.ts.net/<token>       (port 443, no prefix)
 *   https://mac-mini.tailc3138.ts.net:4242/<token>  (old viewer port)
 * Both redirect to the canonical URL:
 *   https://mac-mini.tailc3138.ts.net/waggle-viewer/<token>
 *
 * Uses the Host header to build an absolute URL on port 443,
 * so redirects from :4242 land on the right port.
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

    // Build absolute redirect URL on port 443 (strip any :4242 etc.)
    const host = (req.headers.get("host") ?? url.host).replace(/:\d+$/, "");
    const base = `https://${host}`;

    // Redirect /<token> → /waggle-viewer/<token>
    const segments = path.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length >= 1 && /^[A-Za-z0-9]{6,12}$/.test(segments[0])) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${base}${PREFIX}/${segments.join("/")}` },
      });
    }

    // Everything else → redirect to the viewer dashboard
    return new Response(null, {
      status: 302,
      headers: { Location: `${base}${PREFIX}/` },
    });
  },
});

console.log(`redirect server listening on http://127.0.0.1:${PORT} → ${PREFIX}/`);
