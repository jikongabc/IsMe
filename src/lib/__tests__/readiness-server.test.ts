import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminProfile: vi.fn(),
  listAdminSocialLinks: vi.fn(),
  listAdminFocusAreas: vi.fn(),
  listAdminExperiences: vi.fn(),
  listAdminProjects: vi.fn(),
  listAdminPosts: vi.fn(),
  listAdminKnowledgeBases: vi.fn(),
  getEnv: vi.fn(),
  isS3Configured: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/content/queries", () => ({
  getAdminProfile: mocks.getAdminProfile,
  listAdminSocialLinks: mocks.listAdminSocialLinks,
  listAdminFocusAreas: mocks.listAdminFocusAreas,
  listAdminExperiences: mocks.listAdminExperiences,
  listAdminProjects: mocks.listAdminProjects,
  listAdminPosts: mocks.listAdminPosts,
  listAdminKnowledgeBases: mocks.listAdminKnowledgeBases,
}));
vi.mock("@/lib/env", () => ({
  getEnv: mocks.getEnv,
  isS3Configured: mocks.isS3Configured,
}));

import { loadReadinessInput } from "@/lib/readiness/server";

function profile(adminPasswordHash: string) {
  return {
    siteName: "Lin Portfolio",
    displayName: "林知远",
    englishName: "Zhiyuan Lin",
    role: "产品工程师",
    roleEn: "Product engineer",
    headline: "可信交付",
    headlineEn: "Reliable delivery",
    introduction: "完整交付真实产品。",
    introductionEn: "I ship real products.",
    avatarUrl: "/portrait.png",
    location: "Shanghai",
    publicEmail: "hello@portfolio.dev",
    availability: "可联系",
    availabilityEn: "Available",
    defaultLocale: "zh",
    adminPasswordHash,
  };
}

describe("loadReadinessInput credential projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_PASSWORD", "a-unique-admin-password");
    vi.stubEnv("SESSION_SECRET", "a-unique-session-secret-that-is-long-enough");
    vi.stubEnv("NODE_ENV", "production");
    mocks.getEnv.mockReturnValue({
      SITE_URL: "https://portfolio.dev",
      COGDOC_API_URL: "",
      COGDOC_API_KEY: "",
    });
    mocks.isS3Configured.mockReturnValue(false);
    mocks.listAdminSocialLinks.mockResolvedValue([]);
    mocks.listAdminFocusAreas.mockResolvedValue([]);
    mocks.listAdminExperiences.mockResolvedValue([]);
    mocks.listAdminProjects.mockResolvedValue([]);
    mocks.listAdminPosts.mockResolvedValue([]);
    mocks.listAdminKnowledgeBases.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not let a strong environment password endorse a legacy DB override", async () => {
    const legacyHash = `scrypt$${"a".repeat(32)}$${"b".repeat(128)}`;
    mocks.getAdminProfile.mockResolvedValue(profile(legacyHash));

    const input = await loadReadinessInput();

    expect(input.env).toMatchObject({
      adminEnvironmentReady: true,
      adminCredentialReady: false,
      adminCredentialSource: "database",
      sessionSecretReady: true,
    });
    expect(JSON.stringify(input)).not.toContain(legacyHash);
    expect(JSON.stringify(input)).not.toContain("adminPasswordHash");
  });

  it("recognizes a well-formed DB hash created under the current strong policy", async () => {
    const currentHash = `scrypt-v2$${"a".repeat(32)}$${"b".repeat(128)}`;
    mocks.getAdminProfile.mockResolvedValue(profile(currentHash));

    const input = await loadReadinessInput();

    expect(input.env).toMatchObject({
      adminEnvironmentReady: true,
      adminCredentialReady: true,
      adminCredentialSource: "database",
      sessionSecretReady: true,
    });
  });

  it("projects the stored RichContent format for projects and posts", async () => {
    mocks.getAdminProfile.mockResolvedValue(profile(""));
    mocks.listAdminProjects.mockResolvedValue([
      {
        id: "project_html",
        slug: "html-project",
        description: '<a href="/project">Project</a>',
        descriptionEn: "",
        contentFormat: "html",
        metrics: [],
        decisions: [],
        gallery: [],
      },
    ]);
    mocks.listAdminPosts.mockResolvedValue([
      {
        id: "post_markdown",
        slug: "markdown-post",
        contentMarkdown: "[Post](/post)",
        contentEn: "",
        contentFormat: "markdown",
        tags: [],
      },
    ]);

    const input = await loadReadinessInput();

    expect(input.projects[0]).toMatchObject({
      id: "project_html",
      contentFormat: "html",
    });
    expect(input.posts[0]).toMatchObject({
      id: "post_markdown",
      contentFormat: "markdown",
    });
  });
});
