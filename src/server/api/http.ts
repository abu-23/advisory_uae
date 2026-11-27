import { NextResponse } from "next/server";
import { HttpError, type Actor } from "@/server/policy/actor";
import { getActor } from "@/server/policy/session";
import type { ApiResult } from "./company";

const MAX_BODY_BYTES = 10_000;

/** Cookies are SameSite=Lax. On top of that, writes must come from our own site and be JSON. */
export function assertSameOrigin(request: Request, appUrl: string | undefined = process.env.AUTH_URL): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!appUrl || !origin || origin !== new URL(appUrl).origin) throw new HttpError(403, "Not allowed");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(400, "Invalid request");
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(400, "Invalid request");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request");
  }
}

type Handler = (ctx: { actor: Actor; body: () => Promise<unknown>; requestId: string }) => Promise<ApiResult>;

/** Wraps a route: same-origin check, actor lookup, uniform errors, no caching, no stack traces. */
export async function respond(request: Request, handler: Handler): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  try {
    assertSameOrigin(request);
    const actor = await getActor(request.headers);
    const result = await handler({ actor, body: () => readJson(request), requestId });
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    console.error("api error", requestId, e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500, headers });
  }
}
