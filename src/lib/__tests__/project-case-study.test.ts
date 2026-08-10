import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject, updateProject } from "@/lib/content/admin";
import {
  getPublishedProjectBySlug,
  listAdminProjects,
} from "@/lib/content/queries";
import { getSqlite, initializeDatabase } from "@/lib/db";
import { ensureSchema } from "@/lib/db/migrate";
import { projectSchema } from "@/lib/validators";

let tempDirectory = "";
const originalDatabasePath = process.env.ISME_DATABASE_PATH;

function closeAppDatabase(): void {
  global.__ismeSqlite?.close();
  global.__ismeSqlite = undefined;
  global.__ismeDb = undefined;
}

function useTemporaryAppDatabase(): string {
  closeAppDatabase();
  tempDirectory = mkdtempSync(join(tmpdir(), "isme-case-study-"));
  const databasePath = join(tempDirectory, "isme.db");
  process.env.ISME_DATABASE_PATH = databasePath;
  initializeDatabase();
  return databasePath;
}

afterEach(() => {
  closeAppDatabase();
  if (originalDatabasePath === undefined) delete process.env.ISME_DATABASE_PATH;
  else process.env.ISME_DATABASE_PATH = originalDatabasePath;
  if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  tempDirectory = "";
});

describe("project case-study persistence", () => {
  it("adds safe defaults when migrating a pre-evidence projects table", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "isme-case-migration-"));
    const sqlite = new Database(join(tempDirectory, "legacy.db"));
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL DEFAULT '',
        summary_en TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        content_format TEXT NOT NULL DEFAULT 'markdown',
        cover_url TEXT NOT NULL DEFAULT '',
        repository_url TEXT NOT NULL DEFAULT '',
        demo_url TEXT NOT NULL DEFAULT '',
        tech_stack TEXT NOT NULL DEFAULT '[]',
        featured INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft'
      );
      INSERT INTO projects (id, name, slug) VALUES ('proj_legacy', 'Legacy', 'legacy');
    `);

    ensureSchema(sqlite);

    const row = sqlite
      .prepare(
        `SELECT role, role_en, team_size, duration, duration_en, metrics, decisions, gallery
         FROM projects WHERE id = ?`,
      )
      .get("proj_legacy") as Record<string, string | number>;
    expect(row).toEqual({
      role: "",
      role_en: "",
      team_size: 0,
      duration: "",
      duration_en: "",
      metrics: "[]",
      decisions: "[]",
      gallery: "[]",
    });
    sqlite.close();
  });

  it("repairs invalid JSON and filters wrong-shape elements in an old database", async () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "isme-case-corrupt-"));
    const databasePath = join(tempDirectory, "corrupt.db");
    const sqlite = new Database(databasePath);
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT NOT NULL DEFAULT '',
        slug TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL DEFAULT '',
        summary_en TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        description_en TEXT NOT NULL DEFAULT '',
        content_format TEXT NOT NULL DEFAULT 'markdown',
        cover_url TEXT NOT NULL DEFAULT '',
        repository_url TEXT NOT NULL DEFAULT '',
        demo_url TEXT NOT NULL DEFAULT '',
        tech_stack TEXT NOT NULL DEFAULT '[]',
        role TEXT NOT NULL DEFAULT '',
        role_en TEXT NOT NULL DEFAULT '',
        team_size INTEGER NOT NULL DEFAULT 0,
        duration TEXT NOT NULL DEFAULT '',
        duration_en TEXT NOT NULL DEFAULT '',
        metrics TEXT,
        decisions TEXT,
        gallery TEXT,
        featured INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft'
      );
      INSERT INTO projects (
        id, name, slug, metrics, decisions, gallery
      ) VALUES (
        'proj_corrupt', 'Corrupt', 'corrupt', '{broken', '{"title":"object"}', NULL
      );
    `);
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, slug, metrics, decisions, gallery, status)
         VALUES (?, ?, ?, ?, ?, ?, 'published')`,
      )
      .run(
        "proj_wrong_shapes",
        "Wrong shapes",
        "wrong-shapes",
        JSON.stringify([
          { label: 7, value: "bad" },
          { label: "Kept metric", value: "12" },
        ]),
        JSON.stringify([null, { title: "Kept decision", tradeoff: "Explicit cost" }]),
        JSON.stringify([
          { src: "javascript:alert(1)", alt: "unsafe" },
          { src: "/uploads/kept.png", alt: "Kept image" },
        ]),
      );

    ensureSchema(sqlite);

    const row = sqlite
      .prepare("SELECT metrics, decisions, gallery FROM projects WHERE id = 'proj_corrupt'")
      .get() as { metrics: string; decisions: string; gallery: string };
    expect(row).toEqual({ metrics: "[]", decisions: "[]", gallery: "[]" });
    expect(sqlite.inTransaction).toBe(false);
    sqlite.close();

    process.env.ISME_DATABASE_PATH = databasePath;
    initializeDatabase();
    const project = await getPublishedProjectBySlug("wrong-shapes");
    expect(project?.metrics.map((item) => item.label)).toEqual(["Kept metric"]);
    expect(project?.decisions.map((item) => item.title)).toEqual(["Kept decision"]);
    expect(project?.gallery.map((item) => item.src)).toEqual(["/uploads/kept.png"]);
  });

  it("round-trips parsed, strongly typed evidence through admin and public queries", async () => {
    useTemporaryAppDatabase();
    const payload = projectSchema.parse({
      name: "Evidence system",
      nameEn: "Evidence system",
      slug: "evidence-system",
      summary: "Structured proof",
      description: "Case study",
      coverUrl: "",
      repositoryUrl: "",
      demoUrl: "",
      techStack: ["TypeScript", "SQLite"],
      role: "负责人",
      roleEn: "Lead engineer",
      teamSize: 4,
      duration: "6 周",
      durationEn: "6 weeks",
      metrics: [
        {
          label: "响应时间",
          labelEn: "Latency",
          value: "-42%",
          valueEn: "-42%",
          context: "p95",
          contextEn: "p95",
        },
      ],
      decisions: [
        {
          title: "使用 SQLite",
          titleEn: "Use SQLite",
          tradeoff: "以单机边界换取部署简单",
          tradeoffEn: "Trade horizontal scale for simple deployment",
        },
      ],
      gallery: [
        {
          src: "/uploads/evidence.png",
          alt: "案例证据面板",
          altEn: "Case evidence panel",
          caption: "成果与取舍",
          captionEn: "Outcomes and trade-offs",
        },
      ],
      featured: true,
      sortOrder: 1,
      status: "published",
    });

    const id = createProject(payload);
    const [adminProject] = await listAdminProjects();
    expect(adminProject).toMatchObject({ id, teamSize: 4, role: "负责人" });
    expect(adminProject.metrics[0]).toMatchObject({ label: "响应时间", value: "-42%" });
    expect(adminProject.decisions[0].tradeoffEn).toContain("simple deployment");
    expect(adminProject.gallery[0].src).toBe("/uploads/evidence.png");

    updateProject(id, projectSchema.parse({ ...payload, teamSize: 5, duration: "7 周" }));
    const publicProject = await getPublishedProjectBySlug("evidence-system");
    expect(publicProject?.teamSize).toBe(5);
    expect(publicProject?.duration).toBe("7 周");
    expect(publicProject?.metrics).toEqual(payload.metrics);
  });

  it("filters wrong-shape elements and survives corruption introduced after startup", async () => {
    useTemporaryAppDatabase();
    const payload = projectSchema.parse({
      name: "Defensive reads",
      slug: "defensive-reads",
      summary: "",
      description: "",
      coverUrl: "",
      repositoryUrl: "",
      demoUrl: "",
      techStack: [],
      featured: false,
      status: "published",
    });
    createProject(payload);

    getSqlite()
      .prepare(
        `UPDATE projects
         SET metrics = ?, decisions = ?, gallery = ?
         WHERE slug = 'defensive-reads'`,
      )
      .run(
        JSON.stringify([
          { label: 7, value: "bad", context: "wrong label type" },
          { label: "Valid metric", value: "2" },
        ]),
        "{malformed",
        JSON.stringify([
          null,
          { src: "javascript:alert(1)", alt: "unsafe" },
          { src: "/uploads/valid.png", alt: "Valid image" },
        ]),
      );

    const project = await getPublishedProjectBySlug("defensive-reads");
    expect(project?.metrics).toEqual([
      {
        label: "Valid metric",
        value: "2",
        context: "",
        labelEn: "",
        valueEn: "",
        contextEn: "",
      },
    ]);
    expect(project?.decisions).toEqual([]);
    expect(project?.gallery).toEqual([
      {
        src: "/uploads/valid.png",
        alt: "Valid image",
        caption: "",
        altEn: "",
        captionEn: "",
      },
    ]);
  });
});
