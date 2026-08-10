import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { guestbookMessages, type GuestbookMessage } from "@/lib/db/schema";

function now(): string {
  return new Date().toISOString();
}

export function listApprovedGuestbook(limit = 100): GuestbookMessage[] {
  return getDb()
    .select()
    .from(guestbookMessages)
    .where(eq(guestbookMessages.status, "approved"))
    .orderBy(desc(guestbookMessages.createdAt))
    .limit(limit)
    .all();
}

export function listAdminGuestbook(limit = 200): GuestbookMessage[] {
  const rows = getDb()
    .select()
    .from(guestbookMessages)
    .orderBy(desc(guestbookMessages.createdAt))
    .limit(limit)
    .all();

  const rank = (status: string) =>
    status === "pending" ? 0 : status === "approved" ? 1 : 2;

  return [...rows].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function countGuestbookByStatus(): {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
} {
  const rows = getDb()
    .select({ status: guestbookMessages.status })
    .from(guestbookMessages)
    .all();
  const counts = { pending: 0, approved: 0, rejected: 0, total: rows.length };
  for (const row of rows) {
    if (row.status === "pending") counts.pending += 1;
    else if (row.status === "approved") counts.approved += 1;
    else if (row.status === "rejected") counts.rejected += 1;
  }
  return counts;
}

export function createGuestbookMessage(input: {
  name: string;
  email: string;
  body: string;
  ipHash: string;
}): GuestbookMessage {
  const row: GuestbookMessage = {
    id: nanoid(),
    name: input.name.trim().slice(0, 80),
    email: input.email.trim().slice(0, 200),
    body: input.body.trim().slice(0, 2000),
    status: "pending",
    ipHash: input.ipHash.slice(0, 64),
    createdAt: now(),
  };
  getDb().insert(guestbookMessages).values(row).run();
  return row;
}

export function setGuestbookStatus(
  id: string,
  status: "pending" | "approved" | "rejected",
): boolean {
  const result = getDb()
    .update(guestbookMessages)
    .set({ status })
    .where(eq(guestbookMessages.id, id))
    .run();
  return (result.changes ?? 0) > 0;
}

export function deleteGuestbookMessage(id: string): boolean {
  const result = getDb()
    .delete(guestbookMessages)
    .where(eq(guestbookMessages.id, id))
    .run();
  return (result.changes ?? 0) > 0;
}
