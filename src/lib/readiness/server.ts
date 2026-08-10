import "server-only";

import {
  getAdminProfile,
  listAdminExperiences,
  listAdminFocusAreas,
  listAdminKnowledgeBases,
  listAdminPosts,
  listAdminProjects,
  listAdminSocialLinks,
} from "@/lib/content/queries";
import {
  isStrongAdminPassword,
  isStrongSessionSecret,
} from "@/lib/auth/credential-policy";
import { isCurrentAdminPasswordHash } from "@/lib/auth/password";
import { getEnv, isS3Configured } from "@/lib/env";
import { buildReadinessReport } from "./report";
import type { ReadinessInput, ReadinessProfile, ReadinessReport } from "./types";

const UNSAFE_CREDENTIAL_VALUES = new Set([
  "replace-with-a-strong-password",
  "replace-with-at-least-32-random-characters",
]);

function toReadinessProfile(
  profile: Awaited<ReturnType<typeof getAdminProfile>>,
): ReadinessProfile | null {
  if (!profile) return null;
  return {
    siteName: profile.siteName,
    displayName: profile.displayName,
    englishName: profile.englishName,
    role: profile.role,
    roleEn: profile.roleEn,
    headline: profile.headline,
    headlineEn: profile.headlineEn,
    introduction: profile.introduction,
    introductionEn: profile.introductionEn,
    avatarUrl: profile.avatarUrl,
    location: profile.location,
    publicEmail: profile.publicEmail,
    availability: profile.availability,
    availabilityEn: profile.availabilityEn,
    defaultLocale: profile.defaultLocale,
  };
}

/**
 * Loads one server-side snapshot for both the local report and outbound-link
 * audit. It deliberately projects the profile so password hashes cannot cross
 * the readiness data boundary.
 */
export async function loadReadinessInput(): Promise<ReadinessInput> {
  const [profile, socialLinks, focusAreas, experiences, projects, posts, knowledgeBases] =
    await Promise.all([
      getAdminProfile(),
      listAdminSocialLinks(),
      listAdminFocusAreas(),
      listAdminExperiences(),
      listAdminProjects(),
      listAdminPosts(),
      listAdminKnowledgeBases(),
    ]);
  const env = getEnv();
  const adminEnvironmentReady = isStrongAdminPassword(process.env.ADMIN_PASSWORD);
  const storedAdminPasswordHash = profile?.adminPasswordHash?.trim() ?? "";
  const hasDatabasePassword = Boolean(storedAdminPasswordHash);

  return {
    profile: toReadinessProfile(profile),
    socialLinks: socialLinks.map((link) => ({
      id: link.id,
      platform: link.platform,
      label: link.label,
      url: link.url,
      visible: link.visible,
    })),
    focusAreas: focusAreas.map((area) => ({
      id: area.id,
      title: area.title,
      titleEn: area.titleEn,
      description: area.description,
      descriptionEn: area.descriptionEn,
      tags: area.tags,
      visible: area.visible,
    })),
    experiences: experiences.map((experience) => ({
      id: experience.id,
      type: experience.type,
      organization: experience.organization,
      organizationEn: experience.organizationEn,
      role: experience.role,
      roleEn: experience.roleEn,
      startDate: experience.startDate,
      endDate: experience.endDate,
      description: experience.description,
      descriptionEn: experience.descriptionEn,
      skills: experience.skills,
      visible: experience.visible,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      nameEn: project.nameEn,
      slug: project.slug,
      summary: project.summary,
      summaryEn: project.summaryEn,
      description: project.description,
      descriptionEn: project.descriptionEn,
      coverUrl: project.coverUrl,
      repositoryUrl: project.repositoryUrl,
      demoUrl: project.demoUrl,
      techStack: project.techStack,
      role: project.role,
      roleEn: project.roleEn,
      teamSize: project.teamSize,
      duration: project.duration,
      durationEn: project.durationEn,
      metrics: project.metrics,
      decisions: project.decisions,
      gallery: project.gallery,
      featured: project.featured,
      status: project.status,
    })),
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      titleEn: post.titleEn,
      slug: post.slug,
      excerpt: post.excerpt,
      excerptEn: post.excerptEn,
      contentMarkdown: post.contentMarkdown,
      contentEn: post.contentEn,
      coverUrl: post.coverUrl,
      category: post.category,
      tags: post.tags,
      status: post.status,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
    })),
    knowledgeBases: knowledgeBases.map((kb) => ({
      id: kb.id,
      name: kb.name,
      nameEn: kb.nameEn,
      slug: kb.slug,
      description: kb.description,
      descriptionEn: kb.descriptionEn,
      cogdocKbId: kb.cogdocKbId,
      welcomeMessage: kb.welcomeMessage,
      welcomeMessageEn: kb.welcomeMessageEn,
      suggestedQuestions: kb.suggestedQuestions,
      suggestedQuestionsEn: kb.suggestedQuestionsEn,
      enabled: kb.enabled,
    })),
    env: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      siteUrl: env.SITE_URL,
      // The environment must remain safe enough to boot, while the active
      // source is checked separately because a DB override supersedes it.
      adminEnvironmentReady,
      adminCredentialReady: hasDatabasePassword
        ? isCurrentAdminPasswordHash(storedAdminPasswordHash)
        : adminEnvironmentReady,
      adminCredentialSource: hasDatabasePassword ? "database" : "environment",
      sessionSecretReady: isStrongSessionSecret(process.env.SESSION_SECRET),
      cogdocApiUrlConfigured: Boolean(env.COGDOC_API_URL.trim()),
      cogdocApiKeyConfigured:
        Boolean(env.COGDOC_API_KEY.trim()) &&
        !UNSAFE_CREDENTIAL_VALUES.has(env.COGDOC_API_KEY.trim()),
      storageMode: isS3Configured() ? "s3" : "local",
    },
  };
}

export async function getReadinessReport(): Promise<ReadinessReport> {
  return buildReadinessReport(await loadReadinessInput());
}
