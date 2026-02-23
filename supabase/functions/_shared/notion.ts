export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readPropertyText(property: Record<string, unknown>): string | undefined {
  const type = typeof property.type === "string" ? property.type : "";
  if (type === "title") {
    const arr = Array.isArray(property.title) ? property.title : [];
    const out = arr.map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>).plain_text : "")).join("").trim();
    return out.length > 0 ? out : undefined;
  }
  if (type === "rich_text") {
    const arr = Array.isArray(property.rich_text) ? property.rich_text : [];
    const out = arr.map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>).plain_text : "")).join("").trim();
    return out.length > 0 ? out : undefined;
  }
  if (type === "email") {
    const v = property.email;
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  }
  if (type === "created_time" || type === "last_edited_time") {
    const v = property[type];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  }
  if (type === "created_by" || type === "last_edited_by") {
    const actor = property[type];
    const actorObj = asObject(actor);
    const id = typeof actorObj.id === "string" && actorObj.id.trim().length > 0 ? actorObj.id.trim() : undefined;
    const person = asObject(actorObj.person);
    const email = typeof person.email === "string" && person.email.trim().length > 0 ? person.email.trim().toLowerCase() : undefined;
    return email ?? id;
  }
  return undefined;
}

export async function fetchNotionPage(pageId: string, token: string, baseUrl = "https://api.notion.com/v1"): Promise<NotionPage> {
  const url = `${baseUrl.replace(/\/$/, "")}/pages/${encodeURIComponent(pageId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Notion page fetch failed: ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = text.slice(0, 500);
    throw err;
  }

  const payload = asObject(await res.json());
  const properties = asObject(payload.properties);
  return { id: typeof payload.id === "string" ? payload.id : pageId, properties };
}

export function flattenNotionProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(properties)) {
    const obj = asObject(raw);
    const value = readPropertyText(obj);
    if (value === undefined || value === null || value === "") continue;
    const k = normalizeKey(key);
    flat[key] = value;
    flat[k] = value;
    if (typeof obj.type === "string" && (obj.type === "created_by" || obj.type === "last_edited_by")) {
      const actor = asObject(obj[obj.type]);
      if (typeof actor.id === "string" && actor.id.trim().length > 0) flat[`${k}_id`] = actor.id.trim();
      const person = asObject(actor.person);
      if (typeof person.email === "string" && person.email.trim().length > 0) flat[`${k}_email`] = person.email.trim().toLowerCase();
    }
  }
  return flat;
}

