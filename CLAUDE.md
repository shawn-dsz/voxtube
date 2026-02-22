---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Deployment (Nginx Subpath Proxy)

VoxTube is deployed behind nginx at `/voxtube/` subpath. **NEVER use absolute paths - always use relative paths for assets and APIs.**

### ⚠️ CRITICAL: Never use absolute paths

Absolute paths bypass the `/voxtube/` proxy and break the app. When proxied via `https://example.com/voxtube/`:

```javascript
// ❌ WRONG - Browser requests https://example.com/api/voices (404!)
fetch('/api/voices')

// ✅ CORRECT - Browser requests https://example.com/voxtube/api/voices
fetch('api/voices')
```

### Path Rules Table

| Type | Wrong ❌ | Right ✅ |
|------|---------|----------|
| CSS files | `/style.css` | `style.css` |
| JS files | `/app.js` | `app.js` |
| Images | `/favicon.svg` | `favicon.svg` |
| API calls | `/api/voices` | `api/voices` |
| Links/anchors | `href="/"` | `href="./"` or `href=""` |
| Fetch URLs | `fetch('/api/x')` | `fetch('api/x')` |

### Why This Matters

- **Absolute paths** (`/api/*`) resolve to `https://example.com/api/*` → nginx routes to the wrong application (OpenClaw at root)
- **Relative paths** (`api/*`) resolve relative to current URL `https://example.com/voxtube/` → nginx correctly routes to VoxTube

### API_BASE Pattern

Use the `API_BASE` constant for all API calls (see `public/app.js`):

```javascript
// At top of app.js - no leading slash!
const API_BASE = 'api';

// Usage
fetch(`${API_BASE}/voices`)
fetch(`${API_BASE}/history/${id}`, { method: 'DELETE' })
```

This makes the pattern explicit and grep-able.

### Testing Proxy Compatibility

1. **Local test**: `curl http://localhost:3001/` - should work
2. **Via nginx**: Access via `https://shawnpersonalassistant.xyz/voxtube/`
3. **Check Network tab**: All requests should go to `/voxtube/*` paths, never root `/`
