import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { buildCsp, generateNonce, staticSecurityHeaders } from "@/server/security-headers";

const intl = createIntlMiddleware(routing);
const REQ_PREFIX = "x-middleware-request-";
const OVERRIDE = "x-middleware-override-headers";

/**
 * 1. Picks the language (/en or /ar) and redirects bare paths.
 * 2. Adds a per-request CSP nonce. Next.js reads it from the request headers
 *    and puts it on its own scripts, so no other script can run.
 * 3. Sets security headers on every page response.
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = generateNonce();
  const csp = buildCsp(nonce, isDev);

  const response = intl(request);

  // Merge any request headers next-intl set with the nonce and CSP, then pass them on.
  const forwarded = new Headers(request.headers);
  response.headers.forEach((value, key) => {
    if (key.startsWith(REQ_PREFIX)) forwarded.set(key.slice(REQ_PREFIX.length), value);
  });
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", csp);
  const carrier = NextResponse.next({ request: { headers: forwarded } });
  carrier.headers.forEach((value, key) => {
    if (key === OVERRIDE || key.startsWith(REQ_PREFIX)) response.headers.set(key, value);
  });

  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(staticSecurityHeaders(isDev))) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
