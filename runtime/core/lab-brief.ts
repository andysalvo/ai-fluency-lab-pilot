import type { LabBriefContent, LabBriefGenerationContent } from "./types.js";

const REQUIRED_LAB_BRIEF_FIELDS = ["what_it_is", "why_it_matters", "evidence", "next_step"] as const;

type RequiredLabBriefField = (typeof REQUIRED_LAB_BRIEF_FIELDS)[number];

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function readAnyString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(source, key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function normalizeLabBriefContent(source: Record<string, unknown>): LabBriefContent {
  const content = asObject(source.content);
  const whatItIs = readAnyString(content, "what_it_is", "whatItIs") ?? readString(source, "what_it_is");
  const whyItMatters = readAnyString(content, "why_it_matters", "whyItMatters") ?? readString(source, "why_it_matters");
  const evidence = readAnyString(content, "evidence", "supporting_point") ?? readString(source, "evidence");
  const nextStep = readAnyString(content, "next_step", "nextStep", "nextTest", "next_test") ?? readString(source, "next_step");
  const confidence = readAnyString(content, "confidence", "confidence_band") ?? readString(source, "confidence");

  const brief: LabBriefContent = {
    what_it_is: truncate(whatItIs ?? "", 320),
    why_it_matters: truncate(whyItMatters ?? "", 320),
    evidence: truncate(evidence ?? "", 360),
    next_step: truncate(nextStep ?? "", 280),
  };

  if (confidence) {
    brief.confidence = truncate(confidence, 80);
  }

  return brief;
}

export function validateLabBriefContent(payload: Record<string, unknown>): {
  ok: boolean;
  missing_fields: RequiredLabBriefField[];
} {
  const missing_fields: RequiredLabBriefField[] = [];

  for (const key of REQUIRED_LAB_BRIEF_FIELDS) {
    const value = payload[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing_fields.push(key);
    }
  }

  return {
    ok: missing_fields.length === 0,
    missing_fields,
  };
}

export function withGenerationMetadata(
  content: LabBriefContent,
  metadata: { golden_example_id: string; prompt_contract_version: string; model_name: string },
): LabBriefGenerationContent {
  return {
    ...content,
    golden_example_id: metadata.golden_example_id,
    prompt_contract_version: metadata.prompt_contract_version,
    model_name: metadata.model_name,
  };
}
