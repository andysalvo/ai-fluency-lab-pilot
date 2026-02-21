function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function roundToSecond(occurredAtIso: string): string {
  const date = new Date(occurredAtIso);
  date.setMilliseconds(0);
  return date.toISOString();
}

export async function computePilotIdempotencyKey(input: {
  source_table: string;
  source_record_id: string;
  event_type: string;
  occurred_at: string;
}): Promise<string> {
  const canonical = `${input.source_table}:${input.source_record_id}:${input.event_type}:${roundToSecond(input.occurred_at)}`;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return toHex(new Uint8Array(digest));
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(canonical).digest("hex");
}
