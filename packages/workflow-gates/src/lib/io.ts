import { readFileSync } from "node:fs";

export function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function block(message: string): never {
  console.error(message);
  process.exit(2);
}

