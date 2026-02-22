const NOTE_MAX_CHARS = 500;

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capWords(value: string, maxWords: number): string {
  const normalized = compact(value);
  if (!normalized) {
    return "";
  }
  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return normalized;
  }
  return words.slice(0, maxWords).join(" ");
}

export function cleanStudentNote(raw: string): { cleaned: string; flags: string[] } {
  const flags: string[] = [];
  let normalized = compact(raw);

  const prefixRules: Array<{ name: string; pattern: RegExp }> = [
    {
      name: "model_attribution",
      pattern: /^(?:gemini|chatgpt|claude|kimi|gpt-?\d+(?:\.\d+)?)\s+(?:said|says|wrote|generated)\s*[:\-–—]?\s*/i,
    },
    {
      name: "article_preamble",
      pattern:
        /^based on (?:the )?(?:article|source)[^:]{0,180}(?:here(?:'s| is)|below is|you can use)[^:]{0,180}:\s*/i,
    },
    {
      name: "summary_preamble",
      pattern:
        /^(?:here(?:'s| is)|this is)\s+(?:a\s+)?(?:2\s*-\s*3|two\s+to\s+three|short)\s*(?:sentence|sentences)?\s*(?:response|summary)?[^:]{0,120}:\s*/i,
    },
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of prefixRules) {
      const replaced = normalized.replace(rule.pattern, "");
      if (replaced !== normalized) {
        normalized = compact(replaced);
        if (!flags.includes(rule.name)) {
          flags.push(rule.name);
        }
        changed = true;
      }
    }
  }

  if (normalized.length > NOTE_MAX_CHARS) {
    normalized = normalized.slice(0, NOTE_MAX_CHARS).trim();
    flags.push("trimmed");
  }

  if (!normalized || !/[a-z0-9]/i.test(normalized)) {
    const fallback = compact(raw).slice(0, NOTE_MAX_CHARS).trim();
    return { cleaned: fallback, flags };
  }

  return { cleaned: normalized, flags };
}

export function stripLeadingSemanticPrefix(text: string): string {
  let normalized = compact(text);
  if (!normalized) {
    return "";
  }

  const prefixes = [
    "core idea",
    "student pattern",
    "key tension",
    "key tension and implication",
    "strategic implication",
    "cohort question",
  ];

  let changed = true;
  while (changed && normalized) {
    changed = false;
    for (const prefix of prefixes) {
      const pattern = new RegExp(`^${prefix.replace(/ /g, "\\s+")}\\s*:\\s*`, "i");
      const replaced = normalized.replace(pattern, "");
      if (replaced !== normalized) {
        normalized = compact(replaced);
        changed = true;
      }
    }
  }

  return normalized;
}

export function cleanSourceExcerpt(text: string, maxChars = 6000): string {
  let normalized = compact(text);
  if (!normalized) {
    return "";
  }

  const junkPatterns: RegExp[] = [
    /skip to content/gi,
    /open site navigation/gi,
    /open navigation menu/gi,
    /menu search/gi,
    /open menu/gi,
    /site navigation/gi,
  ];

  for (const pattern of junkPatterns) {
    normalized = normalized.replace(pattern, " ");
  }

  normalized = normalized
    .replace(/\b(home|about|contact|search)\b\s*(?=\b(home|about|contact|search)\b)/gi, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length > maxChars) {
    normalized = normalized.slice(0, maxChars).trim();
  }

  return normalized;
}

export function toSentenceCap(text: string, maxWords = 22): string {
  const stripped = stripLeadingSemanticPrefix(text);
  const candidate = stripped || compact(text);
  if (!candidate) {
    return "";
  }
  const first = candidate.split(/(?<=[.!?])\s+/)[0] ?? candidate;
  const capped = capWords(first, maxWords);
  if (!capped) {
    return "";
  }
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

export function toOptionCap(text: string, maxWords = 14): string {
  const stripped = stripLeadingSemanticPrefix(text);
  const candidate = stripped || compact(text);
  return capWords(candidate, maxWords);
}
