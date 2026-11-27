import { listOwnQuotes } from "@/server/api/company";
import { respond } from "@/server/api/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => respond(req, ({ actor }) => listOwnQuotes(actor));
