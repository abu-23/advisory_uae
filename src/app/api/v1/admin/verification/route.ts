import { setVerification } from "@/server/api/admin";
import { respond } from "@/server/api/http";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => respond(req, async ({ actor, body }) => setVerification(actor, await body()));
