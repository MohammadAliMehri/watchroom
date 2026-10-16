import { once } from "node:events";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchroom-smoke-"));
const portProbe = net.createServer();
await new Promise((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolve);
});
const port = portProbe.address().port;
await new Promise((resolve, reject) =>
  portProbe.close((error) => (error ? reject(error) : resolve())),
);

const server = spawn(process.execPath, ["server.js"], {
  cwd: projectDir,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    MEDIA_DIR: path.join(tempDir, "media"),
    DATA_DIR: path.join(tempDir, "data"),
  },
  stdio: ["ignore", "ignore", "pipe"],
});

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError = (serverError + chunk.toString()).slice(-8192);
});

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  let healthResponse;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Server exited during startup. ${serverError}`);
    try {
      healthResponse = await fetch(`${baseUrl}/healthz`);
      if (healthResponse.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  if (!healthResponse?.ok)
    throw new Error(`Server did not become healthy. ${serverError}`);
  const health = await healthResponse.json();
  if (health.status !== "ok")
    throw new Error("Health endpoint returned an unexpected response.");

  for (const endpoint of [
    "/api/__missing__",
    "/media/__missing__/index.m3u8",
  ]) {
    const missing = await fetch(`${baseUrl}${endpoint}`);
    if (
      missing.status !== 404 ||
      !missing.headers.get("content-type")?.includes("application/json")
    ) {
      throw new Error(
        `Missing API/media resource returned SPA HTML instead of JSON 404: ${endpoint}`,
      );
    }
  }

  const pageResponse = await fetch(baseUrl);
  if (!pageResponse.ok)
    throw new Error(`Frontend returned HTTP ${pageResponse.status}.`);
  const html = await pageResponse.text();
  const scriptPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!scriptPath)
    throw new Error(
      "Frontend HTML does not reference a built JavaScript bundle.",
    );

  const assetResponse = await fetch(new URL(scriptPath, baseUrl));
  if (!assetResponse.ok)
    throw new Error(`Frontend bundle returned HTTP ${assetResponse.status}.`);
  console.log(
    "Smoke test passed: database health, frontend assets, and API/media JSON 404 responses.",
  );
} finally {
  if (server.exitCode === null) {
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
