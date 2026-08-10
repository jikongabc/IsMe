import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(() => "proj_test"),
  updateProject: vi.fn(() => true),
  deleteProject: vi.fn(() => true),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => null),
}));
vi.mock("@/lib/content/admin", () => mocks);
vi.mock("@/lib/content/queries", () => ({
  listAdminProjects: vi.fn(async () => []),
}));
vi.mock("@/lib/content/sync-to-cogdoc", () => ({
  tryAutoSyncSiteContent: vi.fn(),
}));
vi.mock("@/lib/audit/log", () => ({
  tryAuditRequest: vi.fn(),
}));

import { DELETE, POST, PUT } from "@/app/api/admin/projects/route";

const validProject = {
  name: "Evidence",
  slug: "evidence",
  summary: "",
  description: "",
  coverUrl: "",
  repositoryUrl: "",
  demoUrl: "",
  techStack: [],
  featured: false,
  status: "draft",
};

describe("admin project route evidence contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and normalizes structured evidence before creating a project", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validProject,
          teamSize: "3",
          metrics: [{ label: "Latency", value: "-42%" }],
          decisions: [{ title: "Use SQLite", tradeoff: "Prefer simple operations" }],
          gallery: [{ src: "/uploads/proof.png", alt: "Proof panel" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        teamSize: 3,
        metrics: [expect.objectContaining({ context: "", labelEn: "" })],
        gallery: [expect.objectContaining({ caption: "", altEn: "" })],
      }),
    );
  });

  it("rejects an unsafe gallery URL without reaching persistence", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validProject,
          gallery: [{ src: "javascript:alert(1)", alt: "unsafe" }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("bounds delete identifiers before querying the database", async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/admin/projects?id=${"x".repeat(101)}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.deleteProject).not.toHaveBeenCalled();
  });

  it("returns 404 when an update targets a missing project", async () => {
    mocks.updateProject.mockReturnValueOnce(false);
    const response = await PUT(
      new Request("http://localhost/api/admin/projects", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validProject, id: "proj_missing" }),
      }),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when delete targets a missing project", async () => {
    mocks.deleteProject.mockReturnValueOnce(false);
    const response = await DELETE(
      new Request("http://localhost/api/admin/projects?id=proj_missing", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(404);
  });
});
