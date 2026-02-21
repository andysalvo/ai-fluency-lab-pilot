function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function computePilotIdempotencyKey(input: {
  source_table: string;
  source_record_or_event_id: string;
  cycle_id: string;
}): Promise<string> {
  const canonical = `${input.source_table}:${input.source_record_or_event_id}:${input.cycle_id}`;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return toHex(new Uint8Array(digest));
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(canonical).digest("hex");
}

export async function computeProtectedActionIdempotencyKey(input: {
  cycle_id: string;
  thread_id: string;
  participant_id: string;
  action_type: string;
  client_request_id: string;
}): Promise<string> {
  const canonical = `${input.cycle_id}:${input.thread_id}:${input.participant_id}:${input.action_type}:${input.client_request_id}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return toHex(new Uint8Array(digest));
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(canonical).digest("hex");
}

export async function sha256Hex(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return toHex(new Uint8Array(digest));
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(value).digest("hex");
}

export function normalizeCanonicalUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();

  const trackingKeys = [...parsed.searchParams.keys()].filter((key) => key.toLowerCase().startsWith("utm_"));
  for (const key of trackingKeys) {
    parsed.searchParams.delete(key);
  }
  parsed.searchParams.delete("fbclid");
  parsed.searchParams.delete("gclid");

  if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  parsed.searchParams.sort();
  return parsed.toString();
}
