import { expect, request as playwrightRequest, test } from "@playwright/test";
import { e2eAdminPassword } from "./test-env";

test.describe("IsMe smoke", () => {
  test("home navigation, locale, and theme controls work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /résumé|简历/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /ask my work|向我提问/i }).first()).toBeVisible();
    await expect(page.locator(".project-proof").first()).toContainText(/3 个阶段|4 类|3 stages|4 types/i);

    await page.getByRole("button", { name: "EN" }).first().click();
    await expect(page.getByRole("link", { name: "Résumé", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "中文" }).first().click();
    await expect(page.getByRole("link", { name: "简历", exact: true }).first()).toBeVisible();

    const theme = page.getByLabel(/主题|theme/i).first();
    await theme.selectOption("day");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    await theme.selectOption("ember");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
    await theme.selectOption("terminal");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "terminal");
  });

  test("resume page is printable", async ({ page }) => {
    await page.goto("/resume");
    await expect(page.getByRole("button", { name: /save as pdf|另存为 PDF/i })).toBeVisible();
    await expect(page.locator(".resume-sheet")).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".resume-sheet > header")).toHaveCSS("display", "block");
    await expect(page.locator(".resume-sheet > footer")).toHaveCSS("display", "block");
  });

  test("mobile header and page stay within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/");
    await expect(page.locator(".menu-trigger")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      header: document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.header).toBeLessThanOrEqual(72);
  });

  test("draft blog posts are not public", async ({ page }) => {
    const res = await page.goto("/blog/draft-hidden-note");
    expect(res?.status()).toBe(404);
  });

  test("published project renders as an interview case study", async ({ page }) => {
    await page.goto("/projects/cogdoc");
    await expect(page.getByRole("heading", { level: 1, name: "CogDoc" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: /案例正文|case study/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /快速了解|at a glance/i }))
      .toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /量化结果|measured outcomes/i }))
      .toBeVisible();
    await expect(page.getByText(/3 个阶段|3 stages/i).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: /技术决策与取舍|technical decisions/i }),
    ).toBeVisible();
    await expect(page.locator("article h1")).toHaveCount(1);
  });

  test("blog feeds and guestbook are public", async ({ page, request }) => {
    const rss = await request.get("/feed.xml");
    expect(rss.ok()).toBeTruthy();
    expect(await rss.text()).toContain("<rss");

    const atom = await request.get("/atom.xml");
    expect(atom.ok()).toBeTruthy();
    const atomXml = await atom.text();
    expect(atomXml).toContain("<feed");
    expect(atomXml).toContain("<author>");

    const sitemap = await request.get("/sitemap.xml");
    const sitemapXml = await sitemap.text();
    expect(sitemapXml).not.toContain("http://localhost:3000");

    await page.goto("/guestbook");
    await expect(page.getByRole("heading", { name: /leave a note|留下几句话/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /submit for review|提交审核/i })).toBeVisible();
  });

  test("knowledge demo chat streams an answer", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.locator("#knowledge-conversation-title")).toHaveText(/关于我|About Me/i);

    const suggested = page.locator("button").filter({ hasText: /\?/ }).first();
    if (await suggested.count()) {
      await suggested.click();
    } else {
      await page.getByPlaceholder(/ask |提问/i).fill("Who is this demo profile?");
      await page.getByRole("button", { name: /send|发送/i }).click();
    }

    await expect(page.getByText(/演示模式|isme-rag|Demo mode/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("knowledge modules keep separate chat sessions", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.locator("#knowledge-conversation-title")).toHaveText(/关于我|About Me/i);

    const marker = `about-marker-${Date.now()}`;
    await page.getByPlaceholder(/ask |提问/i).fill(marker);
    await page.getByRole("button", { name: /send|发送/i }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /helpful|有帮助/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.locator("aside").getByRole("button", { name: /项目.*projects|Projects.*projects/i }).click();
    await expect(page.locator("#knowledge-conversation-title")).toHaveText(/项目|Projects/i);
    await expect(page.getByText(marker, { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/suggested questions|推荐问题|ask about project/i).first(),
    ).toBeVisible();

    await page.locator("aside").getByRole("button", { name: /关于我.*about|About Me.*about/i }).click();
    await expect(page.locator("#knowledge-conversation-title")).toHaveText(/关于我|About Me/i);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
  });

  test("admin routes are protected", async ({ page, request }) => {
    await page.goto("/admin/profile");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: /管理后台登录|admin login/i })).toBeVisible();

    const readinessApi = await request.get("/api/admin/readiness");
    expect(readinessApi.status()).toBe(401);
    expect(readinessApi.headers()["cache-control"]).toContain("private");
    expect(readinessApi.headers()["cache-control"]).toContain("no-store");
  });

  test("admin can login with env password", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: /admin overview/i })).toBeVisible();
    await expect(page.getByText(/system health/i)).toBeVisible();
    await expect(page.getByText(/status ok|status degraded/i)).toBeVisible();
    await page.goto("/admin/insights");
    await expect(page.getByRole("heading", { name: /^insights$/i })).toBeVisible();
    await expect(page.getByText(/hot questions/i)).toBeVisible();
    await expect(page.getByText(/top pages/i)).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /^audit$/i })).toBeVisible();
    await expect(page.getByText(/auth\.login/i).first()).toBeVisible();
    await page.goto("/admin/appearance");
    await expect(page.getByRole("heading", { name: /^appearance$/i })).toBeVisible();
    await expect(page.getByText(/theme\/terminal/i)).toBeVisible();
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: /^media$/i })).toBeVisible();
    await page.goto("/admin/guestbook");
    await expect(page.getByRole("heading", { name: /^guestbook$/i })).toBeVisible();
    await page.goto("/admin/projects");
    await expect(page.getByRole("heading", { level: 1, name: "项目案例" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "面试展示完整度" })).toBeVisible();
    await expect(page.getByLabel(/发布状态/)).toHaveValue("draft");
    const firstDelete = page.getByRole("button", { name: "删除", exact: true }).first();
    await firstDelete.click();
    const confirmDelete = page.getByRole("button", { name: "确认删除", exact: true }).first();
    await expect(confirmDelete).toBeFocused();
    await page.getByRole("button", { name: "取消", exact: true }).first().click();
    await expect(firstDelete).toBeFocused();
    await page.getByLabel(/项目名称（中文）/).fill("未保存的案例");
    const dialogPromise = page.waitForEvent("dialog");
    const navigationPromise = page.getByRole("link", { name: "概览", exact: true }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain("未保存");
    await dialog.dismiss();
    await navigationPromise;
    await expect(page).toHaveURL(/\/admin\/projects$/);
  });

  test("admin mutations reject untrusted origins without changing storage", async ({ page }) => {
    await page.goto("/admin/login");
    const baseURL = new URL(page.url()).origin;
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const session = (await page.context().cookies()).find(
      (cookie) => cookie.name === "isme_admin_session",
    );
    expect(session?.value).toBeTruthy();
    const authenticatedApi = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${session!.name}=${session!.value}` },
    });
    try {
      const beforeResponse = await authenticatedApi.get("/api/admin/profile");
      expect(beforeResponse.status()).toBe(200);
      const before = await beforeResponse.json();
      const attemptedProfile = {
        ...before.profile,
        displayName: `cross-origin-write-${Date.now()}`,
      };
      const attempts: Array<{ label: string; headers?: Record<string, string> }> = [
        { label: "missing Origin" },
        { label: "opaque Origin", headers: { origin: "null" } },
        { label: "cross-origin", headers: { origin: "https://attacker.example" } },
        {
          label: "forged forwarded host",
          headers: {
            origin: "https://attacker.example",
            "x-forwarded-host": "attacker.example",
          },
        },
      ];

      for (const attempt of attempts) {
        const response = await authenticatedApi.put("/api/admin/profile", {
          data: attemptedProfile,
          headers: attempt.headers,
        });
        expect(response.status(), attempt.label).toBe(403);
        expect(response.headers()["cache-control"], attempt.label).toContain("private");
        expect(response.headers()["cache-control"], attempt.label).toContain("no-store");
      }

      const afterResponse = await authenticatedApi.get("/api/admin/profile");
      expect(afterResponse.status()).toBe(200);
      expect(await afterResponse.json()).toEqual(before);
    } finally {
      await authenticatedApi.dispose();
    }
  });

  test("admin readiness gate catches demo content and exports a report", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/readiness");

    const verdict = page.locator("#readiness-title");
    await expect(verdict).toContainText("HOLD");
    await expect(page.getByText(/Alex River/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /阻塞 \d+/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /编辑资料.*替换模板身份/ }).first()).toBeVisible();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/readiness") && response.request().method() === "GET",
    );
    await page.getByRole("button", { name: "重新检查" }).click();
    expect((await responsePromise).ok()).toBeTruthy();
    await expect(page.getByRole("status")).toContainText("已更新");

    const report = await page.evaluate(async () => {
      const response = await fetch("/api/admin/readiness", { cache: "no-store" });
      return response.json();
    });
    expect(report.readyToShare).toBe(false);
    expect(report.counts.blocker).toBeGreaterThan(0);
    expect(report.items.some((item: { id?: string }) => item.id === "identity-originality"))
      .toBe(true);
    expect(JSON.stringify(report)).not.toContain(e2eAdminPassword());

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^isme-readiness-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(page.getByRole("status")).toContainText("已导出");

    await page.getByRole("button", { name: /阻塞 \d+/ }).click();
    await expect(page.locator("li").filter({ hasText: "阻塞" }).first()).toBeVisible();

    let releaseFailure: (() => void) | undefined;
    const holdFailure = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route("**/api/admin/readiness", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await holdFailure;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced readiness failure" }),
      });
    });

    await page.getByRole("button", { name: "重新检查" }).click();
    await expect(verdict).toContainText("VERIFY");
    await expect(verdict).toContainText("CHECKING");
    await expect(page.getByRole("button", { name: "导出已暂停" })).toBeDisabled();

    releaseFailure?.();
    await expect(verdict).toContainText("CHECK FAILED");
    await expect(verdict).toContainText("HOLD");
    await expect(verdict).not.toContainText("READY");
    await expect(page.locator('p[role="alert"]')).toContainText("forced readiness failure");
    await expect(page.getByRole("button", { name: "导出已暂停" })).toBeDisabled();
  });

  test("Launch Studio exports a safe pack and produces server-bound previews", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/setup");

    await expect(
      page.getByRole("heading", { level: 1, name: "把内容带进来，先演算，再投产。" }),
    ).toBeVisible();
    await expect(page.getByText(/SQLite 原子提交|一次事务应用/).first()).toBeVisible();

    const result = await page.evaluate(async () => {
      const exported = await fetch("/api/admin/portfolio-pack", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const pack = await exported.json();
      const bundled = await fetch("/api/admin/portfolio-bundle", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const bundle = await bundled.json();
      const preview = await fetch("/api/admin/portfolio-pack/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pack, sections: ["appearance"] }),
      });
      const previewBody = await preview.json();
      const bundlePreview = await fetch("/api/admin/portfolio-bundle/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ bundle, sections: ["appearance"] }),
      });
      const bundlePreviewBody = await bundlePreview.json();
      const cleanupPreview = await fetch("/api/admin/setup/demo-preview", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const cleanupBody = await cleanupPreview.json();
      return {
        exportStatus: exported.status,
        disposition: exported.headers.get("content-disposition"),
        cacheControl: exported.headers.get("cache-control"),
        bundleStatus: bundled.status,
        bundleDisposition: bundled.headers.get("content-disposition"),
        bundleVersion: bundle.version,
        bundleAssetCount: bundle.assets?.length,
        serializedBundle: JSON.stringify(bundle),
        serializedPack: JSON.stringify(pack),
        kb: pack.sections?.knowledgeBases?.[0] ?? null,
        previewStatus: preview.status,
        previewBody,
        bundlePreviewStatus: bundlePreview.status,
        bundlePreviewBody,
        cleanupStatus: cleanupPreview.status,
        cleanupBody,
      };
    });

    expect(result.exportStatus).toBe(200);
    expect(result.disposition).toMatch(/portfolio-pack-\d{4}-\d{2}-\d{2}\.json/);
    expect(result.cacheControl).toContain("no-store");
    expect(result.bundleStatus).toBe(200);
    expect(result.bundleDisposition).toMatch(/portfolio-bundle-\d{4}-\d{2}-\d{2}\.isme\.json/);
    expect(result.bundleVersion).toBe("portfolio-bundle.v1");
    expect(result.bundleAssetCount).toBeGreaterThanOrEqual(0);
    expect(result.serializedBundle).not.toContain("adminPasswordHash");
    expect(result.serializedBundle).not.toContain("cogdocKbId");
    expect(result.serializedPack).not.toContain("adminPasswordHash");
    expect(result.kb).not.toHaveProperty("cogdocKbId");
    expect(result.kb).not.toHaveProperty("enabled");
    expect(result.previewStatus).toBe(200);
    expect(result.previewBody.plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.previewBody.plan.selectedSections).toEqual(["appearance"]);
    expect(result.bundlePreviewStatus).toBe(200);
    expect(result.bundlePreviewBody.plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.bundlePreviewBody.plan.bundle.assetCount).toBeGreaterThanOrEqual(0);
    expect(result.cleanupStatus).toBe(200);
    expect(result.cleanupBody.plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  test("admin can publish bilingual case-study evidence", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/projects");

    await page.getByLabel(/项目名称（中文）/).fill("证据链案例");
    await page.getByLabel(/Project name \(EN\)/).fill("Evidence Trail");
    await page.getByLabel(/公开路径/).fill("e2e-evidence-trail");
    await page.getByLabel(/发布状态/).selectOption("published");
    await page.getByLabel(/项目摘要（中文）/).fill("验证结构化项目证据能够从后台安全发布到公开页面。");
    await page.getByLabel(/Project summary \(EN\)/).fill(
      "Verifies structured project evidence from the admin editor to the public page.",
    );
    await page.getByLabel(/你的职责（中文）/).fill("端到端实现");
    await page.getByLabel(/Your role \(EN\)/).fill("End-to-end implementation");
    await page.getByLabel(/项目周期（中文）/).fill("6 周");
    await page.getByLabel(/Duration \(EN\)/).fill("6 weeks");
    await page.getByLabel(/团队人数/).fill("2");
    await page.getByLabel(/技术栈/).fill("Next.js, SQLite");

    await page.getByRole("button", { name: "添加结果" }).click();
    let metricRows = page.locator("fieldset.evidence-row").filter({ hasText: "成果指标" });
    const latencyMetric = metricRows.first();
    await latencyMetric.getByLabel(/指标名称/).fill("核心接口 P95");
    await latencyMetric.getByLabel(/结果值/).fill("780ms → 210ms");
    await latencyMetric.getByLabel(/口径与背景/).fill("同一测试数据集，连续运行三轮。");
    await latencyMetric.getByText("补充英文版本（可选）").click();
    await latencyMetric.getByLabel(/Metric label/).fill("Core API P95");
    await latencyMetric.getByLabel(/Metric value/).fill("780ms → 210ms");
    await latencyMetric.getByLabel(/Context \(EN\)/).fill("Same dataset across three consecutive runs.");

    await page.getByRole("button", { name: "添加结果" }).click();
    metricRows = page.locator("fieldset.evidence-row").filter({ hasText: "成果指标" });
    const rehearsalMetric = metricRows.nth(1);
    await rehearsalMetric.getByLabel(/指标名称/).fill("回滚演练");
    await rehearsalMetric.getByLabel(/结果值/).fill("1 次");
    await rehearsalMetric.getByText("补充英文版本（可选）").click();
    await rehearsalMetric.getByLabel(/Metric label/).fill("Rollback rehearsal");
    await rehearsalMetric.getByLabel(/Metric value/).fill("1 run");
    await page.getByRole("button", { name: "上移成果指标 2" }).click();
    await page.getByRole("button", { name: "添加结果" }).click();
    await page.getByRole("button", { name: "删除成果指标 3" }).click();

    await page.getByRole("button", { name: "添加取舍" }).click();
    const decisionRow = page.locator("fieldset.evidence-row").filter({ hasText: "技术取舍" }).first();
    await decisionRow.getByLabel(/^选择/).fill("选择结构化证据而不是自由文本");
    await decisionRow.getByLabel(/收益与代价/).fill(
      "后台字段更多，但公开展示、双语回退和问答同步都可验证。",
    );
    await decisionRow.getByText("补充英文版本（可选）").click();
    await decisionRow.getByLabel(/Decision \(EN\)/).fill(
      "Choose structured evidence over free-form prose",
    );
    await decisionRow.getByLabel(/Trade-off \(EN\)/).fill(
      "The editor has more fields, but rendering, locale fallback, and knowledge sync become verifiable.",
    );

    await page.getByRole("button", { name: "添加图片" }).click();
    const galleryRow = page.locator("fieldset.evidence-row").filter({ hasText: "证据图片" }).first();
    await galleryRow.locator('input[placeholder="/uploads/..."]').fill("/window.svg");
    await galleryRow.getByLabel(/替代文本/).fill("用于验证成果画廊的示例界面图");
    await galleryRow.getByLabel(/图片说明/).fill("画廊发布链路验证");
    await galleryRow.getByText("补充英文版本（可选）").click();
    await galleryRow.getByLabel(/Alt text \(EN\)/).fill(
      "Example interface used to verify the outcome gallery",
    );
    await galleryRow.getByLabel(/Caption \(EN\)/).fill("Gallery publishing-path verification");

    await page.getByRole("textbox", { name: "案例正文（中文）" }).fill(
      "## 背景\n\n这是端到端验证项目。",
    );
    await page.getByRole("textbox", { name: "Case study (EN)" }).fill(
      "## Context\n\nThis project is created by the browser test.",
    );
    await expect(page.getByText("5/5 已完成")).toBeVisible();
    await page.getByRole("button", { name: "创建项目案例" }).click();
    await expect(page.getByRole("status")).toContainText("证据链案例");

    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name: "用于验证成果画廊的示例界面图" })).toBeVisible();

    await page.goto("/projects/e2e-evidence-trail");
    await expect(page.getByRole("heading", { level: 1, name: "证据链案例" })).toBeVisible();
    await expect(page.getByText("端到端实现", { exact: true })).toBeVisible();
    await expect(page.locator(".case-metric strong").first()).toHaveText("1 次");
    await expect(page.getByText("780ms → 210ms", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "选择结构化证据而不是自由文本" })).toBeVisible();
    await expect(page.getByRole("img", { name: "用于验证成果画廊的示例界面图" })).toBeVisible();

    await page.getByRole("button", { name: "EN" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Evidence Trail" })).toBeVisible();
    await expect(page.getByText("End-to-end implementation", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose structured evidence over free-form prose" }))
      .toBeVisible();
    await expect(
      page.getByRole("img", { name: "Example interface used to verify the outcome gallery" }),
    ).toBeVisible();
  });

  test("admin project editor stays usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/admin/login");
    await page.locator('input[type="password"]').fill(e2eAdminPassword());
    await page.getByRole("button", { name: /登录后台|sudo/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/projects");

    await expect(page.locator(".admin-mobile-menu > summary")).toBeVisible();
    const layout = await page.evaluate(() => {
      const saveBar = document.querySelector(".project-evidence-editor > div:last-child");
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        headerHeight: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
        saveBarPosition: saveBar ? getComputedStyle(saveBar).position : "missing",
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.headerHeight).toBeLessThanOrEqual(72);
    expect(layout.saveBarPosition).toBe("static");
    await expect(page.getByText(/预览内容 · markdown/).first()).toBeVisible();

    await page.goto("/admin/readiness");
    await expect(page.locator("#readiness-title")).toContainText("HOLD");
    const readinessLayout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      gateWidth: Math.round(
        document.querySelector(".readiness-gate")?.getBoundingClientRect().width ?? 0,
      ),
    }));
    expect(readinessLayout.documentWidth).toBeLessThanOrEqual(readinessLayout.viewport);
    expect(readinessLayout.gateWidth).toBeLessThanOrEqual(readinessLayout.viewport);
  });

  test("blog related posts and 404 shell", async ({ page }) => {
    await page.goto("/blog/why-personal-knowledge-base");
    await expect(
      page.getByRole("heading", { level: 1, name: /why personal|个人站为什么/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /related\//i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /shipping a portable personal site|做一个可搬运的个人站/i }),
    ).toBeVisible();

    const missing = await page.goto("/this-path-does-not-exist-xyz");
    expect(missing?.status()).toBe(404);
    await expect(page.getByText(/404/i)).toBeVisible();
  });

  test("changing the admin password revokes every previously issued session", async ({
    browser,
    page,
  }) => {
    const newPassword = "e2e rotated password with 2026 entropy";
    await page.goto("/admin/login");
    const baseURL = new URL(page.url()).origin;

    const login = await page.request.post("/api/admin/login", {
      data: { password: e2eAdminPassword() },
      headers: { origin: baseURL },
    });
    expect(login.status()).toBe(200);
    const oldSession = (await page.context().cookies()).find(
      (cookie) => cookie.name === "isme_admin_session",
    );
    expect(oldSession?.value).toBeTruthy();
    const oldCookieHeader = `${oldSession!.name}=${oldSession!.value}`;
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    const changed = await page.evaluate(
      async (payload) => {
        const response = await fetch("/api/admin/password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return { status: response.status, body: await response.text() };
      },
      {
        currentPassword: e2eAdminPassword(),
        newPassword,
        confirmPassword: newPassword,
      },
    );
    expect(changed.status, changed.body).toBe(200);
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "isme_admin_session",
      ),
    ).toBe(false);

    const oldApi = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: oldCookieHeader },
    });
    const oldBrowser = await browser.newContext({
      extraHTTPHeaders: { Cookie: oldCookieHeader },
    });
    try {
      expect((await oldApi.get("/api/admin/readiness")).status()).toBe(401);
      const oldPage = await oldBrowser.newPage();
      await oldPage.goto(`${baseURL}/admin/profile`);
      await expect(oldPage).toHaveURL(/\/admin\/login/);
    } finally {
      await oldApi.dispose();
      await oldBrowser.close();
    }

    const loginFromBrowser = (password: string) =>
      page.evaluate(async (candidate) => {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: candidate }),
        });
        return response.status;
      }, password);
    const rejectedOldPassword = await page.evaluate(async (password) => {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return { status: response.status, cacheControl: response.headers.get("cache-control") };
    }, e2eAdminPassword());
    expect(rejectedOldPassword.status).toBe(401);
    expect(rejectedOldPassword.cacheControl).toContain("private");
    expect(rejectedOldPassword.cacheControl).toContain("no-store");
    expect(await loginFromBrowser(newPassword)).toBe(200);
    const newSession = (await page.context().cookies()).find(
      (cookie) => cookie.name === "isme_admin_session",
    );
    expect(newSession?.value).toBeTruthy();
    expect(newSession?.value).not.toBe(oldSession?.value);
    expect(
      await page.evaluate(() => fetch("/api/admin/readiness").then((res) => res.status)),
    ).toBe(200);
  });

  test("health endpoint reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.storage?.ok).toBe(true);
  });
});
