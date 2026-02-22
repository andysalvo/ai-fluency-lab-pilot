import type { RuntimeConfig } from "../adapters/env.js";

export interface GoogleIdentity {
  email: string;
  email_verified: boolean;
  aud?: string;
  sub?: string;
  hd?: string;
}

export interface GoogleCodeExchangeResult {
  ok: boolean;
  identity?: GoogleIdentity;
  reason_code?: string;
  message?: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function parseIdentity(payload: unknown): GoogleIdentity | null {
  const row = asObject(payload);
  const email = asString(row.email)?.toLowerCase();
  if (!email) {
    return null;
  }

  return {
    email,
    email_verified: asBoolean(row.email_verified),
    aud: asString(row.aud),
    sub: asString(row.sub),
    hd: asString(row.hd),
  };
}

function assertGoogleConfig(config: RuntimeConfig): { ok: true } | { ok: false; reason_code: string; message: string } {
  if (!config.oauth_google_client_id || !config.oauth_google_client_secret || !config.oauth_google_redirect_uri) {
    return {
      ok: false,
      reason_code: "GOOGLE_OAUTH_NOT_CONFIGURED",
      message: "Google OAuth client config is incomplete.",
    };
  }

  return { ok: true };
}

async function postForm(url: string, form: URLSearchParams): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return asObject(payload);
}

async function fetchTokenInfo(url: string, idToken: string): Promise<Record<string, unknown> | null> {
  const tokenInfoUrl = new URL(url);
  tokenInfoUrl.searchParams.set("id_token", idToken);
  const response = await fetch(tokenInfoUrl.toString(), {
    method: "GET",
  });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return asObject(payload);
}

export async function exchangeGoogleCodeForIdentity(code: string, config: RuntimeConfig): Promise<GoogleCodeExchangeResult> {
  const check = assertGoogleConfig(config);
  if (!check.ok) {
    return check;
  }

  const form = new URLSearchParams();
  form.set("code", code);
  form.set("client_id", config.oauth_google_client_id!);
  form.set("client_secret", config.oauth_google_client_secret!);
  form.set("redirect_uri", config.oauth_google_redirect_uri!);
  form.set("grant_type", "authorization_code");

  const tokenPayload = await postForm(config.oauth_google_token_url, form);
  if (!tokenPayload) {
    return {
      ok: false,
      reason_code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
      message: "Could not exchange Google auth code for tokens.",
    };
  }

  const idToken = asString(tokenPayload.id_token);
  const accessToken = asString(tokenPayload.access_token);
  if (!idToken && !accessToken) {
    return {
      ok: false,
      reason_code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
      message: "Google token response did not include id_token or access_token.",
    };
  }

  let identity = idToken ? parseIdentity(await fetchTokenInfo(config.oauth_google_tokeninfo_url, idToken)) : null;
  if (!identity && accessToken) {
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (userInfoResponse.ok) {
      identity = parseIdentity(await userInfoResponse.json());
    }
  }

  if (!identity) {
    return {
      ok: false,
      reason_code: "GOOGLE_IDENTITY_MISSING",
      message: "Google identity payload did not contain a verified email.",
    };
  }

  if (!identity.email_verified) {
    return {
      ok: false,
      reason_code: "GOOGLE_EMAIL_NOT_VERIFIED",
      message: "Google account email is not verified.",
    };
  }

  if (identity.aud && identity.aud !== config.oauth_google_client_id) {
    return {
      ok: false,
      reason_code: "GOOGLE_AUDIENCE_MISMATCH",
      message: "Google token audience does not match configured client id.",
    };
  }

  return {
    ok: true,
    identity,
  };
}

export function buildGoogleAuthUrl(
  config: RuntimeConfig,
  input: {
    state: string;
  },
): { ok: boolean; url?: string; reason_code?: string; message?: string } {
  const check = assertGoogleConfig(config);
  if (!check.ok) {
    return check;
  }

  const authUrl = new URL(config.oauth_google_auth_url);
  authUrl.searchParams.set("client_id", config.oauth_google_client_id!);
  authUrl.searchParams.set("redirect_uri", config.oauth_google_redirect_uri!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.oauth_google_scopes.join(" "));
  authUrl.searchParams.set("state", input.state);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt", "select_account");

  return {
    ok: true,
    url: authUrl.toString(),
  };
}
