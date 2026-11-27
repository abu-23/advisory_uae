import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler((req: Request) => auth().handler(req));
