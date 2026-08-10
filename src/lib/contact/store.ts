import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { contactMessages, type ContactMessage } from "@/lib/db/schema";

function now(): string {
  return new Date().toISOString();
}

export function createContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  body: string;
  ipHash: string;
}): ContactMessage {
  const row: ContactMessage = {
    id: nanoid(),
    name: input.name.trim().slice(0, 80),
    email: input.email.trim().slice(0, 200),
    subject: input.subject.trim().slice(0, 200),
    body: input.body.trim().slice(0, 5000),
    status: "unread",
    ipHash: input.ipHash.slice(0, 64),
    createdAt: now(),
  };
  getDb().insert(contactMessages).values(row).run();
  return row;
}

export function listAdminContacts(limit = 200): ContactMessage[] {
  return getDb()
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.createdAt))
    .limit(limit)
    .all();
}

export function countUnreadContacts(): number {
  return getDb()
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.status, "unread"))
    .all().length;
}

export function setContactStatus(
  id: string,
  status: "unread" | "read" | "archived",
): boolean {
  const result = getDb()
    .update(contactMessages)
    .set({ status })
    .where(eq(contactMessages.id, id))
    .run();
  return (result.changes ?? 0) > 0;
}

export function deleteContactMessage(id: string): boolean {
  const result = getDb()
    .delete(contactMessages)
    .where(eq(contactMessages.id, id))
    .run();
  return (result.changes ?? 0) > 0;
}
