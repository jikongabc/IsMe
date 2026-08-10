import { getEnv } from "@/lib/env";

/** SESSION_SECRET for non-session hashing (visitor / guestbook). No weak fallback. */
export function getHashSecret(): string {
  return getEnv().SESSION_SECRET;
}
