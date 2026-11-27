/** Runs once when the server starts. Stops start-up if configuration is invalid. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("@/server/env");
    loadEnv();
  }
}
