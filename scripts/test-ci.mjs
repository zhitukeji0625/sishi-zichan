import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitTcp(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect(port, host, () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
      });
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`Timeout waiting for ${host}:${port}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

let dockerOk = false;
try {
  await run("docker", [
    "compose",
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.test.yml",
    "up",
    "-d",
    "mysql",
  ]);
  dockerOk = true;
} catch (e) {
  console.warn(
    "[test:ci] Docker unavailable; running unit tests only (integration tests skipped).",
  );
  console.warn(String(e?.message ?? e));
}

if (!dockerOk) {
  await run("npx", ["vitest", "run"]);
  process.exit(0);
}

await waitTcp("127.0.0.1", 3307, 120_000);

const testEnv = {
  DATABASE_URL: "mysql://root:root@127.0.0.1:3307/sishi",
};

await run("npx", ["prisma", "db", "push", "--accept-data-loss"], testEnv);
await run("npx", ["vitest", "run"], testEnv);
