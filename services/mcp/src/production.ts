import path from "node:path";
import { app } from "./index.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

export interface ProductionFetchOptions {
  readonly webRoot?: string;
  readonly backendFetch?: FetchHandler;
}

const defaultWebRoot = path.resolve(import.meta.dir, "../../../apps/web/dist");

function isBackendPath(pathname: string) {
  return pathname === "/mcp" || pathname === "/api" || pathname.startsWith("/api/");
}

function staticHeaders(file: Bun.BunFile, immutable: boolean) {
  return {
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "content-type": file.type || "application/octet-stream",
    "x-content-type-options": "nosniff",
  };
}

export function createProductionFetch(options: ProductionFetchOptions = {}): FetchHandler {
  const webRoot = path.resolve(options.webRoot ?? defaultWebRoot);
  const backendFetch = options.backendFetch ?? app.fetch;
  const indexFile = Bun.file(path.join(webRoot, "index.html"));

  return async (request) => {
    const url = new URL(request.url);
    if (isBackendPath(url.pathname)) return backendFetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let relativePath: string;
    try {
      relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    } catch {
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    const filePath = path.resolve(webRoot, relativePath);
    const insideWebRoot = filePath === webRoot || filePath.startsWith(`${webRoot}${path.sep}`);
    if (!insideWebRoot) return Response.json({ error: "Forbidden" }, { status: 403 });

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(request.method === "HEAD" ? null : file, {
        headers: staticHeaders(file, relativePath.startsWith("static/")),
      });
    }

    if (!request.headers.get("accept")?.includes("text/html") || !(await indexFile.exists())) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return new Response(request.method === "HEAD" ? null : indexFile, {
      headers: staticHeaders(indexFile, false),
    });
  };
}

if (import.meta.main) {
  const hostname = Bun.env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(Bun.env.PORT ?? "3000", 10);
  Bun.serve({ hostname, port, fetch: createProductionFetch() });
}
