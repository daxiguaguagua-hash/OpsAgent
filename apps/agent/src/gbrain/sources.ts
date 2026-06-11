import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { resolve } from "node:path";
import type { GBrainSource, SyncMode } from "./types.js";

const VALID_SYNC_MODES: readonly SyncMode[] = [
  "on_demand",
  "weekly",
  "excluded",
] as const;

export function loadSources(
  ymlPath: string = resolve(process.cwd(), "gbrain/sources.yml"),
): GBrainSource[] {
  const raw = readFileSync(ymlPath, "utf8");
  const parsed = parseYaml(raw) as { sources?: unknown };
  if (!parsed || !Array.isArray(parsed.sources)) {
    throw new Error(`GBrain sources.yml at ${ymlPath} is missing "sources" list`);
  }
  return parsed.sources.map((entry, index) => validateSource(entry, index));
}

export function findSource(
  sources: GBrainSource[],
  id: string,
): GBrainSource | undefined {
  return sources.find((s) => s.id === id);
}

export function listSyncable(sources: GBrainSource[]): GBrainSource[] {
  return sources.filter((s) => s.syncMode !== "excluded");
}

function validateSource(entry: unknown, index: number): GBrainSource {
  if (!entry || typeof entry !== "object") {
    throw new Error(`source[${index}] must be an object`);
  }
  const obj = entry as Record<string, unknown>;
  const id = obj.id;
  const path = obj.path;
  const description = obj.description;
  const searchWeight = obj.searchWeight;
  const syncMode = obj.syncMode;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`source[${index}].id must be a non-empty string`);
  }
  if (typeof path !== "string" || !path.endsWith("/")) {
    throw new Error(`source[${index}].path must be a directory path ending with "/"`);
  }
  if (typeof description !== "string") {
    throw new Error(`source[${index}].description must be a string`);
  }
  if (typeof searchWeight !== "number" || searchWeight < 0 || searchWeight > 1) {
    throw new Error(
      `source[${index}].searchWeight must be a number between 0 and 1`,
    );
  }
  if (
    typeof syncMode !== "string" ||
    !VALID_SYNC_MODES.includes(syncMode as SyncMode)
  ) {
    throw new Error(
      `source[${index}].syncMode must be one of: ${VALID_SYNC_MODES.join(", ")}`,
    );
  }

  return {
    id,
    path,
    description,
    searchWeight,
    syncMode: syncMode as SyncMode,
  };
}
