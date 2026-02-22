interface SessionClaims {
  actor_email: string;
  cycle_id: string;
  organization_id: string;
  participant_id?: string;
  exp: number;
}

interface OAuthStateClaims {
  cycle_id: string;
  organization_id: string;
  next_path: string;
  nonce: string;
  exp: number;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(raw: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64url");
  }

  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(encoded: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(encoded, "base64url").toString("utf8");
  }

  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
    return toHex(new Uint8Array(signature));
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHmac("sha256", secret).update(value).digest("hex");
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const chunk of cookieHeader.split(";")) {
    const [key, ...rest] = chunk.trim().split("=");
    if (!key || rest.length === 0) {
      continue;
    }
    out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

async function createSignedToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoded = b64urlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Hex(secret, encoded);
  return `${encoded}.${signature}`;
}

async function verifySignedToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts;
  const expected = await hmacSha256Hex(secret, encoded);
  if (expected !== signature) {
    return null;
  }

  try {
    const decoded = JSON.parse(b64urlDecode(encoded));
    if (!decoded || typeof decoded !== "object") {
      return null;
    }
    return decoded as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createSessionCookie(
  input: {
    actor_email: string;
    cycle_id: string;
    organization_id: string;
    participant_id?: string;
  },
  secret: string,
  maxAgeSeconds = 60 * 60 * 12,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const token = await createSignedToken(
    {
      actor_email: input.actor_email,
      cycle_id: input.cycle_id,
      organization_id: input.organization_id,
      participant_id: input.participant_id,
      exp,
    },
    secret,
  );

  return `pilot_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function readSessionClaims(request: Request, secret: string): Promise<SessionClaims | null> {
  const cookies = parseCookies(request);
  const token = cookies.pilot_session;
  if (!token) {
    return null;
  }

  const decoded = await verifySignedToken(token, secret);
  if (!decoded) {
    return null;
  }

  const actorEmail = typeof decoded.actor_email === "string" ? decoded.actor_email.trim().toLowerCase() : "";
  const cycleId = typeof decoded.cycle_id === "string" ? decoded.cycle_id.trim() : "";
  const organizationId = typeof decoded.organization_id === "string" ? decoded.organization_id.trim() : "";
  const exp = typeof decoded.exp === "number" ? decoded.exp : 0;
  const participantId = typeof decoded.participant_id === "string" ? decoded.participant_id : undefined;

  if (!actorEmail || !cycleId || !organizationId || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    actor_email: actorEmail,
    cycle_id: cycleId,
    organization_id: organizationId,
    participant_id: participantId,
    exp,
  };
}

export function clearSessionCookie(): string {
  return "pilot_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function normalizeNextPath(path: string | undefined): string {
  if (!path) {
    return "/submit";
  }
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return "/submit";
  }
  return trimmed;
}

export async function createOAuthStateToken(
  input: {
    cycle_id: string;
    organization_id: string;
    next_path?: string;
  },
  secret: string,
  maxAgeSeconds = 10 * 60,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `nonce-${Math.random().toString(16).slice(2)}`;

  return createSignedToken(
    {
      cycle_id: input.cycle_id,
      organization_id: input.organization_id,
      next_path: normalizeNextPath(input.next_path),
      nonce,
      exp,
    },
    secret,
  );
}

export async function readOAuthStateToken(token: string | undefined, secret: string): Promise<OAuthStateClaims | null> {
  if (!token || token.trim().length === 0) {
    return null;
  }

  const decoded = await verifySignedToken(token, secret);
  if (!decoded) {
    return null;
  }

  const cycleId = typeof decoded.cycle_id === "string" ? decoded.cycle_id.trim() : "";
  const organizationId = typeof decoded.organization_id === "string" ? decoded.organization_id.trim() : "";
  const nextPath = normalizeNextPath(typeof decoded.next_path === "string" ? decoded.next_path : undefined);
  const nonce = typeof decoded.nonce === "string" ? decoded.nonce : "";
  const exp = typeof decoded.exp === "number" ? decoded.exp : 0;
  if (!cycleId || !organizationId || !nonce || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    cycle_id: cycleId,
    organization_id: organizationId,
    next_path: nextPath,
    nonce,
    exp,
  };
}
