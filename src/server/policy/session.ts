import { auth } from "@/server/auth/auth";
import { actorFromSession, type Actor, type SessionInfo } from "./actor";

/** The actor for this request's cookies. Anything unexpected means visitor. */
export async function getActor(headers: Headers): Promise<Actor> {
  try {
    const info = await auth().api.getSession({ headers });
    return actorFromSession(info as SessionInfo | null);
  } catch {
    return { kind: "visitor" };
  }
}
