import { loadRuntimeConfig } from "../runtime/adapters/env.js";
import { createPersistenceAdapter } from "../runtime/adapters/factory.js";
import { generateIdeaEmbedding } from "../runtime/core/idea-embeddings.js";

function parseLimit(args: string[]): number {
  const raw = args.find((arg) => arg.startsWith("--limit="));
  if (!raw) {
    return 100;
  }

  const value = Number(raw.split("=")[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return 100;
  }

  return Math.floor(value);
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig(process.env as Record<string, string | undefined>);
  const persistence = createPersistenceAdapter(config);
  const limit = parseLimit(process.argv.slice(2));

  const items = await persistence.listIdeaEmbeddingsForBackfill(limit);
  if (items.length === 0) {
    console.log(JSON.stringify({ ok: true, processed: 0, message: "no pending embeddings" }));
    return;
  }

  let ready = 0;
  let failed = 0;
  for (const item of items) {
    const result = await generateIdeaEmbedding({
      text: item.idea_text_norm,
      config,
    });

    if (result.ok && result.vector) {
      await persistence.updateIdeaEmbedding(item.entry_version_id, {
        embedding_status: "ready",
        embedding_vector: result.vector,
        error_code: undefined,
        embedded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      ready += 1;
      continue;
    }

    await persistence.updateIdeaEmbedding(item.entry_version_id, {
      embedding_status: "failed",
      error_code: result.error_code ?? "EMBEDDING_UNKNOWN",
      updated_at: new Date().toISOString(),
    });
    failed += 1;
  }

  console.log(
    JSON.stringify({
      ok: true,
      processed: items.length,
      ready,
      failed,
    }),
  );
}

await main();
