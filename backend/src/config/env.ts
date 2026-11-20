import { z } from "zod";

// The ONLY place that reads process.env. Everywhere else imports `env` (typed, validated).
const envSchema = z.object({
  DATABASE_URL: z.url(),
  // A short signing key can be brute-forced to forge login tokens, so require 32+ characters.
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables at startup so a bad config fails fast with a clear message. */
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:\n" + z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
