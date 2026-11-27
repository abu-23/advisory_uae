import { listAudit } from "@/server/api/admin";
import { respond } from "@/server/api/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => respond(req, ({ actor }) => listAudit(actor));
