import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { hasExactKeys } from "./contracts.ts";
import { runReplay } from "./replay.ts";

const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/style.css", { file: "style.css", type: "text/css; charset=utf-8" }],
]);

const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

function json(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function replay(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    json(response, 415, { error: "JSON_REQUIRED" });
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 1024) {
      response.setHeader("Connection", "close");
      json(response, 413, { error: "REQUEST_TOO_LARGE" });
      return;
    }
    chunks.push(chunk);
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    json(response, 400, { error: "INVALID_JSON" });
    return;
  }
  if (!hasExactKeys(body, "scenarioId") || (body.scenarioId !== "benign" && body.scenarioId !== "suspicious")) {
    json(response, 400, { error: "INVALID_SCENARIO" });
    return;
  }
  json(response, 200, await runReplay(body.scenarioId));
}

export function createLocalServer() {
  return createServer(async (request, response) => {
    try {
      if (request.url === "/api/replays") {
        await replay(request, response);
        return;
      }
      if (request.url === "/favicon.ico" && request.method === "GET") {
        response.writeHead(204, headers).end();
        return;
      }
      const asset = request.url && assets.get(request.url);
      if (!asset || request.method !== "GET") {
        json(response, 404, { error: "NOT_FOUND" });
        return;
      }
      const body = await readFile(new URL(`../web/${asset.file}`, import.meta.url));
      response.writeHead(200, { ...headers, "Content-Type": asset.type });
      response.end(body);
    } catch {
      if (!response.headersSent) json(response, 500, { error: "REPLAY_UNAVAILABLE" });
      else response.destroy();
    }
  });
}

if (import.meta.main) {
  const port = 3000;
  createLocalServer().listen(port, "127.0.0.1", () => {
    console.log(`Agent Firewall is running at http://127.0.0.1:${port}`);
  });
}
