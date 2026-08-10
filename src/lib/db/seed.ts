import { count } from "drizzle-orm";
import { demoSeed } from "@/data/demo-seed";
import { getDb, getSqlite } from "./index";
import {
  blogPosts,
  experiences,
  focusAreas,
  knowledgeBaseModules,
  projects,
  siteProfiles,
  socialLinks,
  type ProjectDecision,
  type ProjectGalleryItem,
  type ProjectMetric,
} from "./schema";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function now(): string {
  return new Date().toISOString();
}

export async function seedDemoIfEmpty(force = false): Promise<boolean> {
  const db = getDb();
  const seed = getSqlite().transaction(() => {
    const [{ value: profileCount }] = db
      .select({ value: count() })
      .from(siteProfiles)
      .all();

    if (profileCount > 0 && !force) return false;

    if (force) {
      db.delete(knowledgeBaseModules).run();
      db.delete(blogPosts).run();
      db.delete(projects).run();
      db.delete(experiences).run();
      db.delete(focusAreas).run();
      db.delete(socialLinks).run();
      db.delete(siteProfiles).run();
    }

    const timestamp = now();
    const profileId = id("profile");

    db.insert(siteProfiles)
      .values({
        id: profileId,
        ...demoSeed.profile,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    for (const link of demoSeed.socialLinks) {
      db.insert(socialLinks)
        .values({ id: id("link"), ...link })
        .run();
    }

    for (const area of demoSeed.focusAreas) {
      db.insert(focusAreas)
        .values({ id: id("focus"), ...area, tags: [...area.tags] })
        .run();
    }

    for (const exp of demoSeed.experiences) {
      db.insert(experiences)
        .values({ id: id("exp"), ...exp, skills: [...exp.skills] })
        .run();
    }

    for (const project of demoSeed.projects) {
      const evidence = project as typeof project & {
        metrics?: ProjectMetric[];
        decisions?: ProjectDecision[];
        gallery?: ProjectGalleryItem[];
      };
      db.insert(projects)
        .values({
          id: id("proj"),
          ...project,
          techStack: [...project.techStack],
          metrics: [...(evidence.metrics ?? [])],
          decisions: [...(evidence.decisions ?? [])],
          gallery: [...(evidence.gallery ?? [])],
        })
        .run();
    }

    for (const post of demoSeed.posts) {
      db.insert(blogPosts)
        .values({
          id: id("post"),
          ...post,
          tags: [...post.tags],
          publishedAt: post.status === "published" ? timestamp : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    }

    for (const kb of demoSeed.knowledgeBases) {
      db.insert(knowledgeBaseModules)
        .values({
          id: id("kb"),
          ...kb,
          suggestedQuestions: [...kb.suggestedQuestions],
          suggestedQuestionsEn: [...(kb.suggestedQuestionsEn ?? [])],
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    }

    return true;
  });

  // BEGIN IMMEDIATE serializes first-run seeding across Next.js build workers.
  const applied = seed.immediate();
  console.log(applied ? "Demo seed applied." : "Database already has content; skip seed.");
  return applied;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isDirectRun) {
  const force = process.argv.includes("--force");
  void seedDemoIfEmpty(force);
}
