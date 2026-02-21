import type { IncomingMessage } from "node:http";
import { handleRequest } from "../runtime/http/edge-entry.js";

function remapPathname(pathname: string): string {
  if (pathname === "/api") {
    return "/";
  }

  if (pathname === "/api/health") {
    return "/health";
  }

  return pathname;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: IncomingMessage, res: any): Promise<void> {
  try {
    const method = req.method ?? "GET";
    const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
    const protocol = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
    const incomingUrl = new URL(req.url ?? "/", `${protocol}://${host}`);
    incomingUrl.pathname = remapPathname(incomingUrl.pathname);

    const body = await readBody(req);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          headers.append(key, entry);
        }
      } else if (typeof value === "string") {
        headers.set(key, value);
      }
    }

    const request = new Request(incomingUrl.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body.byteLength > 0 ? new Uint8Array(body) : undefined,
    });

    const response = await handleRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = Buffer.from(await response.arrayBuffer());
    res.end(responseBody);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "unknown server error",
      }),
    );
  }
}
