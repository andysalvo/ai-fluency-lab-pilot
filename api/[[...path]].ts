import { handleRequest } from "../runtime/http/edge-entry.js";

export const config = {
  runtime: "edge",
};

async function remapRequestIfNeeded(request: Request): Promise<Request> {
  const url = new URL(request.url);

  if (url.pathname === "/api") {
    url.pathname = "/";
  } else if (url.pathname === "/api/health") {
    url.pathname = "/health";
  } else {
    return request;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
    });
  }

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: await request.arrayBuffer(),
  });
}

export default async function handler(request: Request): Promise<Response> {
  const remapped = await remapRequestIfNeeded(request);
  return handleRequest(remapped);
}
