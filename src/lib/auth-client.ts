import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser side of sign-in. Talks to /api/auth on the same site only. */
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });

/** Turn any failed call into a small, safe code the screens can translate. */
export function errorCode(error: { status?: number } | null | undefined): "tooMany" | "failed" {
  return error?.status === 429 ? "tooMany" : "failed";
}

/** The secret in an otpauth:// link, for people who type it in instead of scanning. */
export function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}
