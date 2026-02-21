import type { RuntimeConfig } from "../adapters/env.js";
import type { ProgramContext } from "./types.js";

interface PartialProgramContext {
  organization_id?: string;
  cycle_id?: string;
  root_problem_version_id?: string;
}

function clean(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveProgramContext(input: PartialProgramContext | undefined, config: RuntimeConfig): ProgramContext {
  return {
    organization_id: clean(input?.organization_id) ?? config.organization_id,
    cycle_id: clean(input?.cycle_id) ?? "",
    root_problem_version_id: clean(input?.root_problem_version_id) ?? config.root_problem_version_id,
  };
}
