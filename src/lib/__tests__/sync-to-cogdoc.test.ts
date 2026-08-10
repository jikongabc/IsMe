import { beforeEach, describe, expect, it, vi } from "vitest";

const cogdoc = vi.hoisted(() => ({
  approveDerivedKnowledge: vi.fn(),
  batchApproveDerivedKnowledge: vi.fn(),
  createDerivedKnowledge: vi.fn(),
  deleteDerivedKnowledge: vi.fn(),
  ensureKnowledgeBase: vi.fn(),
  listDerivedKnowledge: vi.fn(),
}));

vi.mock("@/lib/cogdoc/admin-client", () => cogdoc);
vi.mock("@/lib/env", () => ({ isCogDocConfigured: () => true }));
vi.mock("@/lib/content/sync-cards", () => ({ buildSiteSyncCards: vi.fn() }));
vi.mock("@/lib/content/queries", () => ({ listAdminKnowledgeBases: vi.fn() }));

import { syncCardsToCogDoc } from "@/lib/content/sync-to-cogdoc";

describe("CogDoc content reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cogdoc.ensureKnowledgeBase.mockResolvedValue({ kb: { kb_id: "portfolio" }, created: false });
    cogdoc.deleteDerivedKnowledge.mockResolvedValue(undefined);
    cogdoc.batchApproveDerivedKnowledge.mockResolvedValue(undefined);
    cogdoc.createDerivedKnowledge.mockResolvedValue({
      knowledgeId: "new-id",
      status: "pending",
      deduplicated: false,
    });
  });

  it("replaces changed rows, removes orphaned rows, and leaves non-IsMe knowledge alone", async () => {
    cogdoc.listDerivedKnowledge.mockResolvedValue([
      {
        knowledge_id: "old-project",
        kb_id: "portfolio",
        text: "old text",
        source_note: "isme:project:alpha",
        created_by: "isme-sync",
        status: "approved",
      },
      {
        knowledge_id: "old-post",
        kb_id: "portfolio",
        text: "removed post",
        source_note: "isme:post:gone",
        created_by: "isme-sync",
        status: "approved",
      },
      {
        knowledge_id: "manual",
        kb_id: "portfolio",
        text: "keep me",
        source_note: "reviewed by owner",
        created_by: "owner",
        status: "approved",
      },
    ]);

    const result = await syncCardsToCogDoc(
      "portfolio",
      [{ key: "project:alpha", title: "Alpha", text: "new text" }],
      { reconcileAll: true },
    );

    expect(cogdoc.deleteDerivedKnowledge).toHaveBeenCalledTimes(2);
    expect(cogdoc.deleteDerivedKnowledge).toHaveBeenCalledWith("old-project");
    expect(cogdoc.deleteDerivedKnowledge).toHaveBeenCalledWith("old-post");
    expect(cogdoc.createDerivedKnowledge).toHaveBeenCalledWith({
      kbId: "portfolio",
      text: "new text",
      sourceNote: "isme:project:alpha",
    });
    expect(cogdoc.batchApproveDerivedKnowledge).toHaveBeenCalledWith(["new-id"]);
    expect(result.removed).toBe(2);
    expect(result.approved).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("keeps an identical managed row without creating a duplicate", async () => {
    cogdoc.listDerivedKnowledge.mockResolvedValue([
      {
        knowledge_id: "same-id",
        kb_id: "portfolio",
        text: "same text",
        source_note: "isme:profile",
        created_by: "isme-sync",
        status: "approved",
      },
    ]);

    const result = await syncCardsToCogDoc(
      "portfolio",
      [{ key: "profile", title: "Profile", text: "same text" }],
      { reconcileAll: true },
    );

    expect(cogdoc.deleteDerivedKnowledge).not.toHaveBeenCalled();
    expect(cogdoc.createDerivedKnowledge).not.toHaveBeenCalled();
    expect(result.deduplicated).toBe(1);
    expect(result.removed).toBe(0);
  });
});
