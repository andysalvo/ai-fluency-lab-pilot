import type { RuntimeConfig } from "../adapters/env.js";
import type { TriggerType } from "./types.js";

export function mapEventTypeToTriggerType(eventType: string, config: RuntimeConfig): TriggerType {
  const normalized = eventType.trim().toLowerCase();

  if (config.allowed_event_types.map((value) => value.toLowerCase()).includes(normalized)) {
    return "local_commit";
  }

  return "unsupported";
}
