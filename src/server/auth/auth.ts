import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { createClient } from "@/server/data/db";
import { authRateLimitStorage } from "@/server/ratelimit/ratelimit";
import { hashPassword, verifyPassword } from "./password";

/**
 * Sign-in for company users, admins and superadmins. Visitors never sign in.
 *
 * - No open sign-up: accounts are created by the bootstrap script or by an admin.
 * - Passwords hashed with Argon2id (OWASP minimum: 19 MiB memory, 2 passes).
 * - Two-step sign-in with an authenticator app (TOTP) plus recovery codes.
 *   Until MFA is enrolled, a session can do nothing except finish enrolling
 *   (see policy/actor.ts).
 * - Sessions live in the database, so logout and password change end them at once.
 * - The library uses its own database login (AUTH_DATABASE_URL) that can reach
 *   only the sign-in tables.
 */

export const SESSION_HOURS = 8;
export const ADMIN_IDLE_MINUTES = 30;
export const MFA_ISSUER = "Advisr UAE";

function createAuth() {
  const url = process.env.AUTH_URL;
  const secret = process.env.SESSION_SECRET;
  const dbUrl = process.env.AUTH_DATABASE_URL;
  if (!url || !secret || !dbUrl) throw new Error("AUTH_URL, SESSION_SECRET and AUTH_DATABASE_URL are required");
  const secure = url.startsWith("https://");

  return betterAuth({
    baseURL: url,
    secret,
    trustedOrigins: [url],
    telemetry: { enabled: false },
    database: prismaAdapter(createClient(dbUrl), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: ({ hash: hashed, password }) => verifyPassword(hashed, password),
      },
    },
    user: {
      modelName: "user",
      additionalFields: {
        role: { type: "string", required: true, input: false },
        companyId: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: SESSION_HOURS * 3600,
      // Refresh "last active" at most every 5 minutes, so the admin idle limit works.
      updateAge: 5 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: secure,
      database: { generateId: "uuid" },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    // Per-connection limits. Shared (Redis) in built apps so they hold across servers;
    // in memory for the dev server.
    rateLimit: {
      enabled: true,
      customStorage: authRateLimitStorage(),
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 600, max: 5 },
        "/two-factor/verify-totp": { window: 600, max: 5 },
        "/two-factor/verify-backup-code": { window: 600, max: 5 },
      },
    },
    plugins: [
      twoFactor({
        issuer: MFA_ISSUER,
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10 },
        // 5 wrong codes in a row lock two-step sign-in for that account for 15 minutes.
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
