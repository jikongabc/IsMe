import {
  approveDerivedKnowledge,
  batchApproveDerivedKnowledge,
  createDerivedKnowledge,
  deleteDerivedKnowledge,
  ensureKnowledgeBase,
  listDerivedKnowledge,
} from "@/lib/cogdoc/admin-client";
import { isCogDocConfigured } from "@/lib/env";
import { buildSiteSyncCards, type SyncCard } from "@/lib/content/sync-cards";
import { listAdminKnowledgeBases } from "@/lib/content/queries";

export type SyncItemResult = {
  key: string;
  title: string;
  status: "created" | "approved" | "deduplicated" | "removed" | "demo" | "failed";
  knowledgeId?: string;
  error?: string;
};

export type ContentSyncResult = {
  demo: boolean;
  kbId: string;
  total: number;
  created: number;
  approved: number;
  deduplicated: number;
  removed: number;
  failed: number;
  items: SyncItemResult[];
};

export async function syncCardsToCogDoc(
  kbId: string,
  cards: SyncCard[],
  options: { reconcileAll?: boolean } = {},
): Promise<ContentSyncResult> {
  if (!isCogDocConfigured()) {
    return {
      demo: true,
      kbId,
      total: cards.length,
      created: cards.length,
      approved: cards.length,
      deduplicated: 0,
      removed: 0,
      failed: 0,
      items: cards.map((card) => ({
        key: card.key,
        title: card.title,
        status: "demo",
        knowledgeId: `demo_${card.key}`,
      })),
    };
  }

  await ensureKnowledgeBase(kbId);

  const items: SyncItemResult[] = [];
  const toApprove: string[] = [];
  const desired = new Map(cards.map((card) => [card.key, card]));
  const satisfied = new Set<string>();
  const blocked = new Set<string>();
  let removed = 0;

  // Only reconcile rows created by this integration. Hand-written CogDoc
  // knowledge is deliberately outside IsMe's lifecycle boundary.
  const existing = (await listDerivedKnowledge(kbId, "isme-sync")).filter((row) =>
    row.source_note?.startsWith("isme:"),
  );

  for (const row of existing) {
    const key = row.source_note!.slice("isme:".length);
    const card = desired.get(key);
    if (!options.reconcileAll && !card) continue;

    if (card && row.text === card.text && !satisfied.has(key)) {
      satisfied.add(key);
      items.push({
        key,
        title: card.title,
        status: "deduplicated",
        knowledgeId: row.knowledge_id,
      });
      continue;
    }

    try {
      await deleteDerivedKnowledge(row.knowledge_id);
      removed += 1;
      if (!card) {
        items.push({
          key,
          title: key,
          status: "removed",
          knowledgeId: row.knowledge_id,
        });
      }
    } catch (error) {
      blocked.add(key);
      items.push({
        key,
        title: card?.title ?? key,
        status: "failed",
        knowledgeId: row.knowledge_id,
        error: error instanceof Error ? error.message : "remove stale knowledge failed",
      });
    }
  }

  for (const card of cards) {
    if (satisfied.has(card.key) || blocked.has(card.key)) continue;
    try {
      const created = await createDerivedKnowledge({
        kbId,
        text: card.text,
        sourceNote: `isme:${card.key}`,
      });

      if (!created.knowledgeId) {
        items.push({
          key: card.key,
          title: card.title,
          status: "failed",
          error: "missing knowledge_id",
        });
        continue;
      }

      if (created.deduplicated) {
        items.push({
          key: card.key,
          title: card.title,
          status: "deduplicated",
          knowledgeId: created.knowledgeId,
        });
        continue;
      }

      items.push({
        key: card.key,
        title: card.title,
        status: "created",
        knowledgeId: created.knowledgeId,
      });
      if (created.status !== "approved") {
        toApprove.push(created.knowledgeId);
      }
    } catch (error) {
      items.push({
        key: card.key,
        title: card.title,
        status: "failed",
        error: error instanceof Error ? error.message : "sync failed",
      });
    }
  }

  if (toApprove.length > 0) {
    try {
      await batchApproveDerivedKnowledge(toApprove);
      for (const item of items) {
        if (item.status === "created" && item.knowledgeId && toApprove.includes(item.knowledgeId)) {
          item.status = "approved";
        }
      }
    } catch {
      for (const knowledgeId of toApprove) {
        try {
          await approveDerivedKnowledge(knowledgeId);
          const item = items.find((row) => row.knowledgeId === knowledgeId);
          if (item && item.status === "created") item.status = "approved";
        } catch (error) {
          const item = items.find((row) => row.knowledgeId === knowledgeId);
          if (item) {
            item.status = "failed";
            item.error = error instanceof Error ? error.message : "approve failed";
          }
        }
      }
    }
  }

  return {
    demo: false,
    kbId,
    total: items.length,
    created: items.filter((i) => i.status === "created" || i.status === "approved").length,
    approved: items.filter((i) => i.status === "approved").length,
    deduplicated: items.filter((i) => i.status === "deduplicated").length,
    removed,
    failed: items.filter((i) => i.status === "failed").length,
    items,
  };
}

export async function syncSiteContentToCogDoc(kbId: string): Promise<ContentSyncResult> {
  return syncCardsToCogDoc(kbId, await buildSiteSyncCards(), { reconcileAll: true });
}

/** Sync one published post/project card into every bound, enabled knowledge module. */
export async function autoSyncContentKey(contentKey: string): Promise<{
  key: string;
  synced: number;
  results: ContentSyncResult[];
}> {
  const cards = (await buildSiteSyncCards()).filter(
    (card) => card.key === contentKey || card.key === `${contentKey}:en`,
  );
  if (cards.length === 0) {
    return { key: contentKey, synced: 0, results: [] };
  }

  const modules = (await listAdminKnowledgeBases()).filter(
    (kb) => kb.enabled && kb.cogdocKbId.trim().length > 0,
  );

  const results: ContentSyncResult[] = [];
  for (const kbModule of modules) {
    results.push(await syncCardsToCogDoc(kbModule.cogdocKbId, cards));
  }

  return { key: contentKey, synced: modules.length, results };
}

export function tryAutoSyncContentKey(contentKey: string): void {
  void autoSyncContentKey(contentKey).catch(() => {
    // publish path must stay responsive even if CogDoc is down
  });
}

export async function autoSyncSiteContent(): Promise<ContentSyncResult[]> {
  const modules = (await listAdminKnowledgeBases()).filter(
    (kb) => kb.enabled && kb.cogdocKbId.trim().length > 0,
  );
  const results: ContentSyncResult[] = [];
  for (const kbModule of modules) {
    results.push(await syncSiteContentToCogDoc(kbModule.cogdocKbId));
  }
  return results;
}

let autoSyncQueue: Promise<unknown> = Promise.resolve();

/** Queue a complete reconciliation so edits, unpublishes, slug changes and deletes remove stale rows. */
export function tryAutoSyncSiteContent(): void {
  autoSyncQueue = autoSyncQueue.then(autoSyncSiteContent, autoSyncSiteContent).catch(() => {
    // Content writes must remain available while CogDoc is degraded.
  });
}
