import { env } from "../config/env.js";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

/**
 * Tiny JSON-lines logger (one JSON object per line, easy for log tools to parse).
 * Never log passwords, tokens, cookies or request bodies.
 */
function write(level: Level, message: string, fields: Fields = {}): void {
  if (env.NODE_ENV === "test" && level === "info") return; // keep test output clean
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    // Errors serialize to {} in JSON, so pull out the useful parts.
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...out }) + "\n";
  (level === "info" ? process.stdout : process.stderr).write(line);
}

export const logger = {
  info: (message: string, fields?: Fields): void => {
    write("info", message, fields);
  },
  warn: (message: string, fields?: Fields): void => {
    write("warn", message, fields);
  },
  error: (message: string, fields?: Fields): void => {
    write("error", message, fields);
  },
};
