import type { RuntimeConfig } from "../adapters/env.js";
import type { CardStackViewModel, CardViewModel } from "./types.js";

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

export interface NotionDatabasePayload {
  id: string;
  properties: Record<string, unknown>;
}

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "content-type": "application/json",
  };
}

function normalizeMapKey(key: string): string {
  return normalizeKey(key);
}

function readPropertyType(property: Record<string, unknown>): string | undefined {
  const raw = property.type;
  return typeof raw === "string" ? raw : undefined;
}

function firstMatchingPropertyName(
  properties: Record<string, unknown>,
  candidates: string[],
): { name: string; type: string } | null {
  const wanted = new Set(candidates.map((candidate) => normalizeMapKey(candidate)));
  for (const [name, raw] of Object.entries(properties)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const normalized = normalizeMapKey(name);
    if (!wanted.has(normalized)) {
      continue;
    }

    const type = readPropertyType(raw as Record<string, unknown>);
    if (!type) {
      continue;
    }

    return { name, type };
  }

  return null;
}

function firstTitlePropertyName(properties: Record<string, unknown>): string | null {
  for (const [name, raw] of Object.entries(properties)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    if (readPropertyType(raw as Record<string, unknown>) === "title") {
      return name;
    }
  }

  return null;
}

function propertyValueForType(type: string, value: string | number | boolean): Record<string, unknown> {
  const textValue = String(value ?? "");

  if (type === "url") {
    return { url: textValue };
  }

  if (type === "email") {
    return { email: textValue };
  }

  if (type === "number") {
    const numeric = typeof value === "number" ? value : Number(textValue);
    return { number: Number.isFinite(numeric) ? numeric : null };
  }

  if (type === "checkbox") {
    const checked = value === true || textValue.toLowerCase() === "true" || textValue === "1";
    return { checkbox: checked };
  }

  if (type === "select") {
    return { select: { name: textValue } };
  }

  if (type === "status") {
    return { status: { name: textValue } };
  }

  if (type === "rich_text") {
    return {
      rich_text: [
        {
          type: "text",
          text: {
            content: textValue,
          },
        },
      ],
    };
  }

  if (type === "title") {
    return {
      title: [
        {
          type: "text",
          text: {
            content: textValue,
          },
        },
      ],
    };
  }

  return {
    rich_text: [
      {
        type: "text",
        text: {
          content: textValue,
        },
      },
    ],
  };
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
    headers: notionHeaders(token),
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

export async function fetchNotionDatabasePayload(databaseId: string, config: RuntimeConfig): Promise<NotionDatabasePayload | null> {
  const token = config.notion_integration_token;
  if (!token) {
    return null;
  }

  const cleanDatabaseId = databaseId.trim();
  if (!cleanDatabaseId) {
    return null;
  }

  const baseUrl = config.notion_api_base_url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/databases/${encodeURIComponent(cleanDatabaseId)}`, {
    method: "GET",
    headers: notionHeaders(token),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const database = payload as Record<string, unknown>;
  const properties = database.properties;
  if (!properties || typeof properties !== "object") {
    return null;
  }

  return {
    id: typeof database.id === "string" ? database.id : cleanDatabaseId,
    properties: properties as Record<string, unknown>,
  };
}

function buildEqualsFilter(propertyName: string, propertyType: string, value: string): Record<string, unknown> | null {
  if (propertyType === "title") {
    return { property: propertyName, title: { equals: value } };
  }

  if (propertyType === "rich_text") {
    return { property: propertyName, rich_text: { equals: value } };
  }

  if (propertyType === "url") {
    return { property: propertyName, url: { equals: value } };
  }

  if (propertyType === "email") {
    return { property: propertyName, email: { equals: value } };
  }

  if (propertyType === "select" || propertyType === "status") {
    return { property: propertyName, [propertyType]: { equals: value } };
  }

  return null;
}

async function queryFirstPageByFilter(
  databaseId: string,
  filter: Record<string, unknown>,
  config: RuntimeConfig,
): Promise<{ id: string } | null> {
  const token = config.notion_integration_token;
  if (!token) {
    return null;
  }

  const cleanDatabaseId = databaseId.trim();
  if (!cleanDatabaseId) {
    return null;
  }

  const baseUrl = config.notion_api_base_url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/databases/${encodeURIComponent(cleanDatabaseId)}/query`, {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      page_size: 1,
      filter,
    }),
  });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const results = Array.isArray((payload as Record<string, unknown>).results)
    ? ((payload as Record<string, unknown>).results as Array<Record<string, unknown>>)
    : [];
  const first = results[0];
  if (!first || typeof first.id !== "string") {
    return null;
  }

  return { id: first.id };
}

export async function ensureResearchInboxSchema(databaseId: string, config: RuntimeConfig): Promise<{
  ok: boolean;
  database?: NotionDatabasePayload;
  created_properties: string[];
  reason?: string;
}> {
  const token = config.notion_integration_token;
  if (!token) {
    return { ok: false, created_properties: [], reason: "NOTION_TOKEN_MISSING" };
  }

  const database = await fetchNotionDatabasePayload(databaseId, config);
  if (!database) {
    return { ok: false, created_properties: [], reason: "NOTION_DATABASE_UNAVAILABLE" };
  }

  const propertySpecs: Array<{ name: string; definition: Record<string, unknown>; aliases: string[] }> = [
    { name: "url", definition: { url: {} }, aliases: ["url", "source_url"] },
    { name: "relevance_note", definition: { rich_text: {} }, aliases: ["relevance_note", "note", "relevance"] },
    { name: "submitted_by", definition: { rich_text: {} }, aliases: ["submitted_by", "email", "actor_email"] },
  ];

  const missing: Record<string, unknown> = {};
  for (const spec of propertySpecs) {
    if (!firstMatchingPropertyName(database.properties, spec.aliases)) {
      missing[spec.name] = spec.definition;
    }
  }

  const createdProperties = Object.keys(missing);
  if (createdProperties.length === 0) {
    return { ok: true, database, created_properties: [] };
  }

  const baseUrl = config.notion_api_base_url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/databases/${encodeURIComponent(databaseId.trim())}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify({
      properties: missing,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      created_properties: [],
      reason: "NOTION_SCHEMA_PATCH_FAILED",
    };
  }

  const refreshed = await fetchNotionDatabasePayload(databaseId, config);
  return { ok: true, database: refreshed ?? database, created_properties: createdProperties };
}

export function buildResearchInboxPageProperties(
  database: NotionDatabasePayload,
  input: {
    url: string;
    relevance_note: string;
    submitted_by: string;
    title?: string;
  },
): Record<string, unknown> | null {
  const titleName = firstTitlePropertyName(database.properties);
  if (!titleName) {
    return null;
  }

  const urlProperty = firstMatchingPropertyName(database.properties, ["url", "source_url"]);
  const relevanceProperty = firstMatchingPropertyName(database.properties, ["relevance_note", "note", "relevance"]);
  const submittedByProperty = firstMatchingPropertyName(database.properties, ["submitted_by", "email", "actor_email"]);

  if (!urlProperty || !relevanceProperty || !submittedByProperty) {
    return null;
  }

  const title = input.title ?? `Source ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

  return {
    [titleName]: propertyValueForType("title", title),
    [urlProperty.name]: propertyValueForType(urlProperty.type, input.url),
    [relevanceProperty.name]: propertyValueForType(relevanceProperty.type, input.relevance_note),
    [submittedByProperty.name]: propertyValueForType(submittedByProperty.type, input.submitted_by),
  };
}

export async function createNotionDatabasePage(
  databaseId: string,
  properties: Record<string, unknown>,
  config: RuntimeConfig,
  children?: Array<Record<string, unknown>>,
): Promise<{ id: string } | null> {
  const token = config.notion_integration_token;
  if (!token) {
    return null;
  }

  const cleanDatabaseId = databaseId.trim();
  if (!cleanDatabaseId) {
    return null;
  }

  const baseUrl = config.notion_api_base_url.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/pages`, {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: {
        database_id: cleanDatabaseId,
      },
      properties,
      children,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const page = payload as Record<string, unknown>;
  const id = page.id;
  return typeof id === "string" ? { id } : null;
}

function notionRichText(content: string): Array<Record<string, unknown>> {
  return [
    {
      type: "text",
      text: {
        content,
      },
    },
  ];
}

function emojiForStatus(status: CardStackViewModel["status_chip"]): string {
  if (status === "ready") {
    return "✅";
  }
  if (status === "blocked") {
    return "⛔";
  }
  if (status === "needs_refinement") {
    return "⚠️";
  }
  return "ℹ️";
}

function isUiPlaceholderLine(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("not yet available") ||
    normalized === "no source submission found for this thread yet." ||
    normalized === "no guided rounds started yet." ||
    normalized === "no lab brief proposal yet." ||
    normalized === "no lab brief fields available yet. generate a proposal from this thread."
  );
}

export function buildNotionCardBlocks(cardStack: CardStackViewModel): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];

  blocks.push({
    object: "block",
    type: "callout",
    callout: {
      rich_text: notionRichText(`${cardStack.status_label} ${cardStack.next_best_action}`),
      icon: { emoji: emojiForStatus(cardStack.status_chip) },
      color: "gray_background",
    },
  });

  for (const card of cardStack.cards) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: notionRichText(card.title),
      },
    });

    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        rich_text: notionRichText(`Status: ${card.status_chip}`),
        icon: { emoji: emojiForStatus(card.status_chip) },
        color: "default",
      },
    });

    for (const paragraph of card.body_blocks) {
      if (isUiPlaceholderLine(paragraph)) {
        continue;
      }
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: notionRichText(paragraph),
        },
      });
    }

    for (const bullet of card.bullets ?? []) {
      if (isUiPlaceholderLine(bullet)) {
        continue;
      }
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: notionRichText(bullet),
        },
      });
    }

    if ((card.details ?? []).length > 0) {
      blocks.push({
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: notionRichText("Details"),
          children: (card.details ?? []).map((detail) => ({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: notionRichText(`${detail.key}: ${detail.value}`),
            },
          })),
        },
      });
    }
  }

  return blocks;
}

export function buildBestEffortNotionPageProperties(
  database: NotionDatabasePayload,
  input: {
    title: string;
    fields: Record<string, string | number | boolean | undefined>;
    aliases?: Record<string, string[]>;
  },
): Record<string, unknown> | null {
  const titleName = firstTitlePropertyName(database.properties);
  if (!titleName) {
    return null;
  }

  const properties: Record<string, unknown> = {
    [titleName]: propertyValueForType("title", input.title),
  };

  for (const [fieldName, rawValue] of Object.entries(input.fields)) {
    if (rawValue === undefined || rawValue === null || String(rawValue).length === 0) {
      continue;
    }

    const property = firstMatchingPropertyName(database.properties, input.aliases?.[fieldName] ?? [fieldName]);
    if (!property) {
      continue;
    }

    properties[property.name] = propertyValueForType(property.type, rawValue);
  }

  return properties;
}

export async function createNotionCardPage(
  databaseId: string,
  input: {
    title: string;
    fields: Record<string, string | number | boolean | undefined>;
    aliases?: Record<string, string[]>;
    cardStack: CardStackViewModel;
    idempotency_key?: string;
  },
  config: RuntimeConfig,
): Promise<{ id: string } | null> {
  const database = await fetchNotionDatabasePayload(databaseId, config);
  if (!database) {
    return null;
  }

  const properties = buildBestEffortNotionPageProperties(database, {
    title: input.title,
    fields: input.fields,
    aliases: input.aliases,
  });
  if (!properties) {
    return null;
  }

  if (input.idempotency_key) {
    const dedupeProperty = firstMatchingPropertyName(database.properties, [
      "idempotency_key",
      "linked_idempotency_key",
      "record_key",
      "external_id",
      "client_request_id",
    ]);
    if (dedupeProperty) {
      properties[dedupeProperty.name] = propertyValueForType(dedupeProperty.type, input.idempotency_key);
      const dedupeFilter = buildEqualsFilter(dedupeProperty.name, dedupeProperty.type, input.idempotency_key);
      if (dedupeFilter) {
        const existing = await queryFirstPageByFilter(databaseId, dedupeFilter, config);
        if (existing) {
          return existing;
        }
      }
    }
  }

  const titleProperty = firstTitlePropertyName(database.properties);
  if (titleProperty) {
    const existingByTitle = await queryFirstPageByFilter(
      databaseId,
      {
        property: titleProperty,
        title: { equals: input.title },
      },
      config,
    );
    if (existingByTitle) {
      return existingByTitle;
    }
  }

  return createNotionDatabasePage(databaseId, properties, config, buildNotionCardBlocks(input.cardStack));
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
