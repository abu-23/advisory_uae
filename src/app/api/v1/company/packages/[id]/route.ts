import { updateOwnPackage } from "@/server/api/company";
import { respond } from "@/server/api/http";

export const dynamic = "force-dynamic";
export const PATCH = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  respond(req, async ({ actor, body }) => updateOwnPackage(actor, (await params).id, await body()));
