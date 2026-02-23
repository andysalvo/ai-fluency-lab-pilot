import { createServer, type IncomingMessage } from "node:http";
import { handleRequest } from "./edge-entry.js";

const port = Number(process.env.PORT ?? "8787");

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

const server = createServer(async (req, res) => {
  try {
    const method = req.method ?? "GET";
    const host = req.headers.host ?? `localhost:${port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
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

    const request = new Request(url.toString(), {
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
      JSON.stringify(
        {
          ok: false,
          error: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "unknown server error",
        },
        null,
        2,
      ),
    );
  }
});

server.listen(port, () => {
  console.log(`[slice2] local server listening on http://localhost:${port}`);
  console.log("[slice2] health: curl -s http://localhost:8787/health | jq");
});
