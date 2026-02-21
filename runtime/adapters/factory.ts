import type { RuntimeConfig } from "./env.js";
import { InMemoryPersistenceAdapter } from "./inmemory.js";
import type { PersistenceAdapter } from "./persistence.js";
import { SupabasePersistenceAdapter } from "./supabase.js";

export function createPersistenceAdapter(config: RuntimeConfig): PersistenceAdapter {
  if (config.persistence_backend === "supabase") {
    if (config.supabase_url && config.supabase_service_role_key) {
      return new SupabasePersistenceAdapter({
        url: config.supabase_url,
        serviceRoleKey: config.supabase_service_role_key,
      });
    }

    console.warn("[slice2] PILOT_PERSISTENCE_BACKEND=supabase but Supabase env vars are missing. Falling back to in-memory adapter.");
  }

  return new InMemoryPersistenceAdapter();
}
