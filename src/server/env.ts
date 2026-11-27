import { z } from "zod";

/**
 * Server environment, checked once at startup.
 * Values come from the environment (a secrets manager in staging/production).
 * Never log the parsed object: it holds secrets.
 */

const PLACEHOLDER = /^(REPLACE|CHANGE_ME|USER:PASSWORD)|REPLACE_WITH|USER:PASSWORD@HOST/;

const notPlaceholder = (name: string) =>
  z.string().min(1, `${name} is required`).refine((v) => !PLACEHOLDER.test(v), {
    message: `${name} still has the placeholder value from .env.example`,
  });

const base64Key32 = z
  .string()
  .refine((v) => {
    try {
      return Buffer.from(v, "base64").length === 32;
    } catch {
      return false;
    }
  }, "FIELD_ENCRYPTION_KEY must be 32 random bytes, base64 encoded");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: notPlaceholder("DATABASE_URL").pipe(z.url({ protocol: /^postgres(ql)?$/ })),
  REDIS_URL: notPlaceholder("REDIS_URL").pipe(z.url({ protocol: /^rediss?$/ })),
  SESSION_SECRET: notPlaceholder("SESSION_SECRET").pipe(
    z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  ),
  AUTH_URL: z.url(),
  FIELD_ENCRYPTION_KEY: notPlaceholder("FIELD_ENCRYPTION_KEY").pipe(base64Key32),
  // Optional until the features that use them are built.
  BOT_PROTECTION_SITE_KEY: z.string().optional(),
  BOT_PROTECTION_SECRET_KEY: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.email().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Production must use HTTPS for the public URL. */
const productionRules = (env: Env): string[] => {
  const problems: string[] = [];
  if (env.NODE_ENV === "production" && !env.AUTH_URL.startsWith("https://")) {
    problems.push("AUTH_URL must use https in production");
  }
  return problems;
};

/**
 * Parse and check the environment. Throws with the names of the bad
 * variables only, never their values.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `- ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const problems = productionRules(result.data);
  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  }
  return result.data;
}
