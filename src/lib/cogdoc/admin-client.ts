import { getEnv, isCogDocConfigured } from "@/lib/env";
import {
  cogdocRequest,
  CogDocRequestError,
  sanitizeCogDocData,
} from "@/lib/cogdoc/request";

export type CogDocKb = {
  kb_id: string;
  created_at: string;
  document_count: number;
};

export type CogDocDocument = {
  name: string;
  sha256: string;
};

export type CogDocIndexJob = {
  job_id: string;
  kb_id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  created_at: string;
  finished_at: string | null;
  document_count: number | null;
  chunk_count: number | null;
  message: string | null;
  error_code?: string | null;
};

export class CogDocAdminError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, _message?: string) {
    void _message;
    const safe = safeAdminError(code);
    super(safe.message);
    this.name = "CogDocAdminError";
    this.status = status;
    this.code = safe.code;
  }
}

function safeAdminError(code: string): { code: string; message: string } {
  switch (code) {
    case "COGDOC_NOT_CONFIGURED":
      return { code, message: "CogDoc is not configured" };
    case "COGDOC_REDIRECT_BLOCKED":
      return { code, message: "CogDoc redirect was blocked" };
    case "COGDOC_TIMEOUT":
      return { code, message: "CogDoc request timed out" };
    case "COGDOC_UNAVAILABLE":
      return { code, message: "CogDoc service is unavailable" };
    case "COGDOC_UPSTREAM_ERROR":
      return { code, message: "CogDoc request failed" };
    default:
      return { code: "COGDOC_ERROR", message: "CogDoc request failed" };
  }
}

function rethrowAdminRequestError(error: unknown): never {
  if (error instanceof CogDocRequestError) {
    throw new CogDocAdminError(error.status, error.code);
  }
  throw new CogDocAdminError(502, "COGDOC_UNAVAILABLE");
}

async function parseError(res: Response): Promise<CogDocAdminError> {
  return new CogDocAdminError(res.status, "COGDOC_UPSTREAM_ERROR");
}

function normalizeIndexJob(job: CogDocIndexJob): CogDocIndexJob {
  return {
    ...job,
    message: job.message
      ? (job.status === "failed" ? "CogDoc job failed" : "CogDoc job status updated")
      : null,
    error_code: job.error_code ? "COGDOC_JOB_ERROR" : job.error_code,
  };
}

export async function checkCogDocHealth(signal?: AbortSignal): Promise<{
  ok: boolean;
  demo: boolean;
  status?: number;
  detail?: string;
}> {
  if (!isCogDocConfigured()) {
    return { ok: false, demo: true, detail: "COGDOC_API_URL not configured" };
  }
  try {
    const res = await cogdocRequest("/healthz", { signal })
      .catch(rethrowAdminRequestError);
    if (!res.ok) {
      return {
        ok: false,
        demo: false,
        status: res.status,
        detail: "CogDoc health check failed",
      };
    }
    return { ok: true, demo: false, status: res.status };
  } catch (error) {
    return {
      ok: false,
      demo: false,
      status: error instanceof CogDocAdminError ? error.status : undefined,
      detail: error instanceof CogDocAdminError
        ? error.message
        : "CogDoc service is unavailable",
    };
  }
}

export async function getKnowledgeBase(
  kbId: string,
  signal?: AbortSignal,
): Promise<CogDocKb | null> {
  const res = await cogdocRequest(`/v1/knowledge-bases/${encodeURIComponent(kbId)}`, {
    signal,
  }).catch(rethrowAdminRequestError);
  if (res.status === 404) return null;
  if (!res.ok) throw await parseError(res);
  return sanitizeCogDocData((await res.json()) as CogDocKb);
}

export async function createKnowledgeBase(kbId: string): Promise<CogDocKb> {
  const res = await cogdocRequest("/v1/knowledge-bases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId }),
  }).catch(rethrowAdminRequestError);
  if (res.status === 409) {
    const existing = await getKnowledgeBase(kbId);
    if (existing) return existing;
  }
  if (!res.ok) throw await parseError(res);
  return sanitizeCogDocData((await res.json()) as CogDocKb);
}

/** Ensure the CogDoc KB exists; create when missing. */
export async function ensureKnowledgeBase(kbId: string): Promise<{
  kb: CogDocKb;
  created: boolean;
}> {
  const existing = await getKnowledgeBase(kbId);
  if (existing) return { kb: existing, created: false };
  const kb = await createKnowledgeBase(kbId);
  return { kb, created: true };
}

export async function listDocuments(kbId: string): Promise<CogDocDocument[]> {
  const res = await cogdocRequest(
    `/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents`,
  ).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  return sanitizeCogDocData((await res.json()) as CogDocDocument[]);
}

export async function uploadDocument(
  kbId: string,
  file: Blob,
  filename: string,
): Promise<CogDocIndexJob> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await cogdocRequest(
    `/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents`,
    {
      method: "POST",
      body: form,
    },
  ).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  return normalizeIndexJob(
    sanitizeCogDocData((await res.json()) as CogDocIndexJob),
  );
}

export async function deleteDocument(kbId: string, name: string): Promise<CogDocIndexJob> {
  const res = await cogdocRequest(
    `/v1/knowledge-bases/${encodeURIComponent(kbId)}/documents/${encodeURIComponent(name)}`,
    {
      method: "DELETE",
    },
  ).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  return normalizeIndexJob(
    sanitizeCogDocData((await res.json()) as CogDocIndexJob),
  );
}

export async function getIndexJob(jobId: string): Promise<CogDocIndexJob> {
  const res = await cogdocRequest(`/v1/index-jobs/${encodeURIComponent(jobId)}`)
    .catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  return normalizeIndexJob(
    sanitizeCogDocData((await res.json()) as CogDocIndexJob),
  );
}

export type DerivedKnowledgeCreateResult = {
  knowledgeId: string;
  status: string;
  deduplicated: boolean;
};

export type CogDocDerivedKnowledge = {
  knowledge_id: string;
  kb_id: string;
  text: string;
  source_note?: string | null;
  created_by?: string | null;
  status: string;
};

export async function listDerivedKnowledge(
  kbId: string,
  createdBy?: string,
  signal?: AbortSignal,
): Promise<CogDocDerivedKnowledge[]> {
  const params = new URLSearchParams({ kb_id: kbId });
  if (createdBy) params.set("created_by", createdBy);
  const res = await cogdocRequest(`/v1/knowledge?${params.toString()}`, {
    signal,
  }).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  const data = sanitizeCogDocData(
    (await res.json()) as { knowledge?: CogDocDerivedKnowledge[] },
  );
  return data.knowledge ?? [];
}

export const MAX_COGDOC_READINESS_KBS = 12;

export type CogDocReadinessResult = {
  ok: boolean;
  status?: number;
  missingCount: number;
  emptyCount: number;
  unverifiedCount: number;
};

/**
 * Use one bounded deadline to verify the provider, each configured KB, and at
 * least one retrievable content source (document or approved derived item).
 */
export async function checkCogDocReadiness(
  kbIds: string[],
): Promise<CogDocReadinessResult> {
  const uniqueIds = [...new Set(kbIds.map((id) => id.trim()).filter(Boolean))];
  const signal = AbortSignal.timeout(getEnv().COGDOC_TIMEOUT_MS);
  const health = await checkCogDocHealth(signal);
  if (!health.ok) {
    return {
      ok: false,
      status: health.status,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: uniqueIds.length,
    };
  }

  const checkedIds = uniqueIds.slice(0, MAX_COGDOC_READINESS_KBS);
  const unverifiedCount = uniqueIds.length - checkedIds.length;
  if (unverifiedCount > 0) {
    return { ok: false, missingCount: 0, emptyCount: 0, unverifiedCount };
  }

  try {
    const inspections = await Promise.all(
      checkedIds.map(async (kbId) => {
        const kb = await getKnowledgeBase(kbId, signal);
        if (!kb) return "missing" as const;
        if (kb.document_count > 0) return "ready" as const;
        const derived = await listDerivedKnowledge(kbId, undefined, signal);
        return derived.some((entry) => entry.status.toLowerCase() === "approved")
          ? ("ready" as const)
          : ("empty" as const);
      }),
    );
    const missingCount = inspections.filter((result) => result === "missing").length;
    const emptyCount = inspections.filter((result) => result === "empty").length;
    return {
      ok: missingCount === 0 && emptyCount === 0,
      status: 200,
      missingCount,
      emptyCount,
      unverifiedCount: 0,
    };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof CogDocAdminError ? error.status : undefined,
      missingCount: 0,
      emptyCount: 0,
      unverifiedCount: checkedIds.length,
    };
  }
}

export async function deleteDerivedKnowledge(knowledgeId: string): Promise<void> {
  const res = await cogdocRequest(`/v1/knowledge/${encodeURIComponent(knowledgeId)}`, {
    method: "DELETE",
  }).catch(rethrowAdminRequestError);
  if (!res.ok && res.status !== 404) throw await parseError(res);
}

export async function createDerivedKnowledge(input: {
  kbId: string;
  text: string;
  sourceNote: string;
}): Promise<DerivedKnowledgeCreateResult> {
  const res = await cogdocRequest("/v1/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "v1",
      kb_id: input.kbId,
      text: input.text,
      source_note: input.sourceNote,
      certainty: "high",
      origin: "manual_entry",
      created_by: "isme-sync",
    }),
  }).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
  const data = sanitizeCogDocData(
    (await res.json()) as {
      knowledge?: { knowledge_id?: string; status?: string };
      deduplicated?: boolean;
    },
  );
  return {
    knowledgeId: data.knowledge?.knowledge_id ?? "",
    status: data.knowledge?.status ?? "pending",
    deduplicated: Boolean(data.deduplicated),
  };
}

export async function approveDerivedKnowledge(knowledgeId: string): Promise<void> {
  const res = await cogdocRequest(
    `/v1/knowledge/${encodeURIComponent(knowledgeId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: "v1",
        actor: "isme-sync",
        note: "auto-approved from IsMe content sync",
      }),
    },
  ).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
}

export async function batchApproveDerivedKnowledge(knowledgeIds: string[]): Promise<void> {
  if (knowledgeIds.length === 0) return;
  const res = await cogdocRequest("/v1/knowledge/batch-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schema_version: "v1",
      actor: "isme-sync",
      note: "batch auto-approve from IsMe content sync",
      knowledge_ids: knowledgeIds,
    }),
  }).catch(rethrowAdminRequestError);
  if (!res.ok) throw await parseError(res);
}
