import { z } from "zod";

/**
 * The customer's choices travel in the URL. They are never personal data.
 * Everything is validated on the server; anything invalid falls back or is rejected.
 */

export const SERVICES = ["TRADE_LICENSE", "EJARI", "VISA"] as const;
export const LOCATIONS = ["DUBAI_MAINLAND", "DUBAI_FREE_ZONE", "ABU_DHABI", "OTHER_EMIRATE"] as const;
export const TIMINGS = ["WEEK", "WEEKS_2_4", "FLEXIBLE"] as const;
export const MAX_VISAS = 20;

export type Service = (typeof SERVICES)[number];
export type LocationCode = (typeof LOCATIONS)[number];
export type Timing = (typeof TIMINGS)[number];

type RawParams = Record<string, string | string[] | undefined>;

const asArray = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Selected services, deduplicated, in a fixed order. Unknown values are dropped. */
export function parseServices(params: RawParams): Service[] {
  const picked = new Set(asArray(params.s).slice(0, SERVICES.length));
  return SERVICES.filter((s) => picked.has(s));
}

export const answersSchema = z
  .object({
    services: z.array(z.enum(SERVICES)).min(1).max(SERVICES.length),
    location: z.enum(LOCATIONS),
    visas: z.coerce.number().int().min(0).max(MAX_VISAS),
    timing: z.enum(TIMINGS),
  })
  .strict();

export type Answers = z.infer<typeof answersSchema>;

/** Full answers from the URL, or null if anything is missing or invalid. */
export function parseAnswers(params: RawParams): Answers | null {
  const services = parseServices(params);
  const result = answersSchema.safeParse({
    services,
    location: first(params.loc),
    visas: services.includes("VISA") ? (first(params.visas) ?? "1") : "0",
    timing: first(params.time),
  });
  return result.success ? result.data : null;
}

export function answersToQuery(a: Answers, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const s of a.services) q.append("s", s);
  q.set("loc", a.location);
  q.set("visas", String(a.visas));
  q.set("time", a.timing);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}
