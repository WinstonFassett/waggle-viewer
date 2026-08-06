# waggle-viewer

Web viewer for [waggle](https://github.com/WinstonFassett/waggle-cli) tokens. Browse folders, render markdown, preview sites, view code/images/CSV/JSON — all from a token URL.

## Install

```bash
npm install -g waggle-viewer
# or
bunx waggle-viewer
```

## Usage

```bash
waggle-viewer [--port 4242] [--host 127.0.0.1]
```

Then open `http://localhost:4242/<token>` in your browser.

## What it does

| Content type | Rendering |
|---|---|
| Markdown | Full GFM (tables, task lists, nested lists) with inline images |
| Code (Go, TS, Python, 90+ more) | Syntax highlighting via shiki |
| JSON | Syntax-highlighted + path navigation |
| CSV | HTML table |
| YAML | Syntax-highlighted |
| Images (PNG, JPG, GIF, WebP, SVG) | Inline `<img>` from blob store |
| Folders | Browseable file tree with persistent sidebar |
| HTML sites | Live preview with relative URL rewriting |

## Features

- **Persistent sidebar** — file tree stays visible while browsing files
- **Breadcrumbs** — always know where you are
- **Inline images** — `![alt](screenshot.png)` in markdown resolves to waggle file routes
- **Live HTML preview** — preview an entire static site from a folder token
- **Real markdown** — marked.js with GFM tables, task lists, footnotes
- **Real syntax highlighting** — shiki with 90+ languages, tokyo-night theme
- **Mobile responsive** — collapsible sidebar on small screens

## Routes

```
GET /                        Dashboard (recent tokens)
GET /<token>                 Rendered token (type-aware)
GET /<token>/raw             Raw content
GET /<token>/file/<name>     File from folder token
GET /<token>/file/<name>/raw Raw file bytes (correct content-type)
GET /<token>/symbol/<name>   Code symbol
GET /<token>/path/<pointer>  JSON pointer navigation
GET /<token>/search?q=       Search within token
GET /<token>/preview[/<f>]   Live HTML preview
GET /health                  JSON status
```

## Environment

- `PORT` — port number (default 4242)
- `HOST` — host to bind (default 127.0.0.1)
- `WAGGLE_BIN` — path to waggle binary (auto-detected if not set)

## License

MIT
