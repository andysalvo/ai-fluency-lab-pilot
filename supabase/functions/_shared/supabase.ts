import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PILOT_SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("PILOT_SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing Supabase env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "applied-ai-labs-warehouse-v1" } },
  });
}

