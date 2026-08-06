#!/usr/bin/env bun
/**
 * waggle-viewer — web viewer for waggle tokens.
 *
 * Usage:
 *   waggle-viewer [--port <port>] [--host <host>]
 *   bunx waggle-viewer
 *   bun src/index.ts
 *
 * Environment:
 *   PORT  — port number (default 4242)
 *   HOST  — host to bind (default 127.0.0.1)
 *   WAGGLE_BIN — path to waggle binary (auto-detected if not set)
 */

import { createServer, setPort, setBasePathConfig } from "./server.ts";

const args = process.argv.slice(2);
let port = Number(process.env.PORT ?? 4242);
let host = process.env.HOST ?? "127.0.0.1";
let basePath = process.env.BASE_PATH ?? "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) { port = Number(args[i + 1]); i++; }
  if (args[i] === "--host" && args[i + 1]) { host = args[i + 1]; i++; }
  if (args[i] === "--base-path" && args[i + 1]) { basePath = args[i + 1]; i++; }
  if (args[i] === "--help" || args[i] === "-h") {
    console.log(`waggle-viewer — web viewer for waggle tokens

Usage:
  waggle-viewer [--port <port>] [--host <host>] [--base-path <path>]

Options:
  --port <port>       Port to listen on (default: 4242, or PORT env)
  --host <host>       Host to bind to (default: 127.0.0.1, or HOST env)
  --base-path <path>  Base path for URLs (e.g. /waggle-viewer for reverse proxy)
  --help, -h          Show this help

Environment:
  PORT          Port number
  HOST          Host to bind
  BASE_PATH     Base path for URLs (same as --base-path)
  WAGGLE_BIN    Path to waggle binary (auto-detected if not set)`);
    process.exit(0);
  }
}

if (basePath) setBasePathConfig(basePath);
setPort(port);
const server = createServer(port, host);
console.log(`waggle-viewer listening on http://${host}:${port}`);
console.log(`Dashboard: http://${host}:${port}/${basePath ? basePath + "/" : ""}`);
