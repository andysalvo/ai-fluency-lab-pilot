import type { RuntimeConfig } from "../adapters/env.js";

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readNotionPropertyValue(property: Record<string, unknown>): unknown {
  const type = typeof property.type === "string" ? property.type : "";

  if (type === "title") {
    const arr = Array.isArray(property.title) ? property.title : [];
    return arr.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).plain_text : "")).join("").trim();
  }

  if (type === "rich_text") {
    const arr = Array.isArray(property.rich_text) ? property.rich_text : [];
    return arr.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).plain_text : "")).join("").trim();
  }

  if (type === "email") {
    return typeof property.email === "string" ? property.email : undefined;
  }

  if (type === "url") {
    return typeof property.url === "string" ? property.url : undefined;
  }

  if (type === "number") {
    return typeof property.number === "number" ? property.number : undefined;
  }

  if (type === "checkbox") {
    return property.checkbox === true;
  }

  if (type === "select") {
    const select = property.select;
    return select && typeof select === "object" ? (select as Record<string, unknown>).name : undefined;
  }

  if (type === "status") {
    const status = property.status;
    return status && typeof status === "object" ? (status as Record<string, unknown>).name : undefined;
  }

  if (type === "multi_select") {
    const arr = Array.isArray(property.multi_select) ? property.multi_select : [];
    return arr
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).name : undefined))
      .filter((value) => typeof value === "string");
  }

  if (type === "phone_number") {
    return typeof property.phone_number === "string" ? property.phone_number : undefined;
  }

  return undefined;
}

export interface NotionPagePayload {
  id: string;
  properties: Record<string, unknown>;
}

export async function fetchNotionPagePayload(pageId: string, config: RuntimeConfig): Promise<NotionPagePayload | null> {
  const token = config.notion_integration_token;
  if (!token) {
    return null;
  }

  const cleanPageId = pageId.trim();
  if (!cleanPageId) {
    return null;
  }

  const baseUrl = config.notion_api_base_url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/pages/${encodeURIComponent(cleanPageId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const page = payload as Record<string, unknown>;
  const properties = page.properties;
  if (!properties || typeof properties !== "object") {
    return null;
  }

  return {
    id: typeof page.id === "string" ? page.id : cleanPageId,
    properties: properties as Record<string, unknown>,
  };
}

export function flattenNotionProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const [key, rawProperty] of Object.entries(properties)) {
    if (!rawProperty || typeof rawProperty !== "object") {
      continue;
    }

    const value = readNotionPropertyValue(rawProperty as Record<string, unknown>);
    if (value === undefined || value === null || value === "") {
      continue;
    }

    flattened[key] = value;
    flattened[normalizeKey(key)] = value;
  }

  return flattened;
}
