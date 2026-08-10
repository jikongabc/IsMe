/** Build a publicly reachable URL for an S3 object key. */
export function buildS3PublicUrl(options: {
  key: string;
  publicBaseUrl: string;
  endpoint: string;
  bucket: string;
  region: string;
}): string {
  const key = options.key.replace(/^\/+/, "");
  const base = options.publicBaseUrl.trim().replace(/\/+$/, "");
  if (base) return `${base}/${key}`;

  const endpoint = options.endpoint.trim().replace(/\/+$/, "");
  if (endpoint) return `${endpoint}/${options.bucket}/${key}`;

  const region = options.region.trim() || "us-east-1";
  return `https://${options.bucket}.s3.${region}.amazonaws.com/${key}`;
}
