import { NextResponse } from "next/server";

export type ParseJsonBodyOptions = {
  /** Enforce the decoded request-body byte length without buffering past it. */
  maxBytes?: number;
  /** Require an explicit application/json media type. */
  requireJsonContentType?: boolean;
};

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function readBoundedUtf8(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; tooLarge: boolean }> {
  const length = declaredLength(request);
  if (length !== null && length > maxBytes) return { ok: false, tooLarge: true };

  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

export async function parseJsonBody(request: Request): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse<{ error: string }> }
>;
export async function parseJsonBody(
  request: Request,
  options: ParseJsonBodyOptions,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse<{ error: string }> }
>;
export async function parseJsonBody(
  request: Request,
  options: ParseJsonBodyOptions = {},
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse<{ error: string }> }
> {
  if (options.requireJsonContentType) {
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return {
        ok: false,
        response: errorResponse("Content-Type must be application/json", 415),
      };
    }
  }

  try {
    if (options.maxBytes === undefined) {
      return { ok: true, data: await request.json() };
    }

    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
      throw new Error("Invalid JSON body limit");
    }
    const body = await readBoundedUtf8(request, options.maxBytes);
    if (!body.ok) {
      return {
        ok: false,
        response: errorResponse(
          body.tooLarge ? "Request body is too large" : "Malformed JSON body",
          body.tooLarge ? 413 : 400,
        ),
      };
    }
    return { ok: true, data: JSON.parse(body.text) as unknown };
  } catch {
    return {
      ok: false,
      response: errorResponse("Malformed JSON body", 400),
    };
  }
}
