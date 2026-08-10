/** Resolve a safe object key / filename; reject path traversal. */
export function resolveUploadName(name: string): string | null {
  const normalized = name.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }

  if (normalized.includes("/")) {
    if (!/^media\/[a-zA-Z0-9._-]+$/.test(normalized)) return null;
    return normalized;
  }

  if (normalized.startsWith(".")) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) return null;
  return normalized;
}

export function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

export function makeUploadFileName(contentType: string): string {
  const ext = extensionForContentType(contentType);
  return `${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/** Local disk uses bare filename; S3 uses media/ prefix. */
export function objectKeyForStorage(
  fileName: string,
  storage: "local" | "s3",
): string {
  const safe = resolveUploadName(fileName);
  if (!safe) throw new Error("Invalid upload name");
  if (storage === "s3") {
    return safe.startsWith("media/") ? safe : `media/${safe}`;
  }
  return safe.startsWith("media/") ? safe.slice("media/".length) : safe;
}

export function displayNameFromKey(key: string): string {
  return key.startsWith("media/") ? key.slice("media/".length) : key;
}
