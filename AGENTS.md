# AGENTS.md — waggle-viewer

## What this is

Web viewer for [waggle](https://github.com/WinstonFassett/waggle-cli) tokens. Renders markdown, code, images, CSV, JSON, folder trees, and live HTML previews from a token URL.

## Where it's deployed

The viewer runs on **two machines**:

| Machine | URL | Port | Process |
|---------|-----|------|---------|
| Mac Mini (always-on) | `https://mac-mini.tailc3138.ts.net/waggle-viewer` | 4243 | `bun src/index.ts --port 4243 --base-path /waggle-viewer` |
| MacBook Pro (dev) | `https://macbook-pro.tailc3138.ts.net/waggle-viewer` | 4243 | same |

Both are proxied through Tailscale Serve at `/waggle-viewer`.

The **Mac Mini** is the canonical deployment — it's always on, and the foundry skill links to it (`https://mac-mini.tailc3138.ts.net/waggle-viewer/<token>`).

## How to deploy (after merging a PR)

### On the machine you're on

```bash
cd ~/dev/personal/waggle-viewer
git pull
# kill the old process
pkill -f "bun src/index.ts" || true
# start the new one
nohup bun src/index.ts --port 4243 --base-path /waggle-viewer > /tmp/waggle-viewer.log 2>&1 &
```

### On the Mac Mini (if you're on the MacBook)

The mini is reachable via Tailscale at `mac-mini.tailc3138.ts.net` (SSH: `ssh winston@mac-mini`). You need to SSH in, pull, and restart the process there too.

```bash
ssh winston@mac-mini 'cd ~/dev/personal/waggle-viewer && git pull && pkill -f "bun src/index.ts" && nohup bun src/index.ts --port 4243 --base-path /waggle-viewer > /tmp/waggle-viewer.log 2>&1 &'
```

**If SSH fails** (host key, network, etc.), note it in the ticket. The mini deploy can be done manually by Winston.

## Waggle CLI

The viewer calls the `waggle` CLI binary (installed at `~/.cargo/bin/waggle`). All waggle data lives at `~/.waggle/` (SQLite DB + blob store). The viewer is read-only — it never writes to waggle.

## Project structure

```
src/
  index.ts        — entry point, starts the HTTP server
  server.ts       — routing, serves token pages
  waggle.ts       — thin wrapper around waggle CLI
  lineage.ts      — walks parent chain, builds breadcrumb data
  layout.ts       — page layout, sidebar, outline
  tree.ts         — folder tree building
  render/
    markdown.ts   — GFM rendering
    code.ts       — syntax highlighting (shiki)
    image.ts      — inline image rendering
    csv.ts        — CSV to HTML table
    json.ts       — JSON syntax highlighting + path nav
    folder.ts     — folder tree rendering
    preview.ts    — live HTML preview iframe
```

## Testing

No formal test suite. To verify changes:

```bash
# Start the viewer locally
bun src/index.ts --port 4243

# Check a token renders
curl http://localhost:4243/<token>

# Check the dashboard
curl http://localhost:4243/
```

## Conventions

- TypeScript, run with Bun (no build step)
- No external dependencies beyond Bun and shiki
- All waggle access goes through `src/waggle.ts` — don't call waggle CLI directly from render code
- Pages are server-rendered HTML (no React, no client framework)
- Dark theme, monospace font, minimal CSS inline in each page
