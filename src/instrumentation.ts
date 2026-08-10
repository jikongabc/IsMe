export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Keep Node-only APIs behind a conditional import so this hook remains valid
  // when Next also analyzes it for the Edge runtime.
  const { prepareNodeServer } = await import("@/lib/startup/prepare-node-server");
  prepareNodeServer();
}
