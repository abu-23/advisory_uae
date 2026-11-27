import { getQuoteContact } from "@/server/api/company";
import { respond } from "@/server/api/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  respond(req, async ({ actor, requestId }) => getQuoteContact(actor, (await params).id, requestId));
