import { NextResponse } from "next/server";

export function mutationErrorResponse(
  error: unknown,
  entity: string,
): NextResponse<{ error: string }> {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code.startsWith("SQLITE_CONSTRAINT")) {
    return NextResponse.json(
      { error: `${entity} conflicts with an existing record` },
      { status: 409 },
    );
  }

  console.error(`${entity} mutation failed`, error);
  return NextResponse.json({ error: `${entity} could not be saved` }, { status: 500 });
}
