import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_URL } from "./test-database-url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const composeFile = path.join(root, "docker-compose.test.yml");
const envFile = path.join(root, ".vitest-test-env.json");

function dockerSocketExists(): boolean {
  try {
    fs.accessSync("/var/run/docker.sock", fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function writeEnv(payload: { databaseUrl?: string; skipDbTests: boolean; startedDocker?: boolean }) {
  fs.writeFileSync(envFile, JSON.stringify(payload, null, 0), "utf8");
}

export default async function globalSetup() {
  const existing = process.env.DATABASE_URL?.trim();

  if (existing) {
    writeEnv({ databaseUrl: existing, skipDbTests: false });
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: existing },
    });
  } else if (dockerSocketExists()) {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    execFileSync("docker", ["compose", "-f", composeFile, "up", "-d", "--wait"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    writeEnv({ databaseUrl: TEST_DATABASE_URL, skipDbTests: false, startedDocker: true });
  } else {
    writeEnv({ skipDbTests: true });
    console.warn(
      "[vitest] 未设置 DATABASE_URL 且无法使用 Docker，已跳过需要数据库的集成测试。本地可运行: docker compose -f docker-compose.test.yml up -d",
    );
  }

  return async function teardown() {
    try {
      const raw = fs.readFileSync(envFile, "utf8");
      const j = JSON.parse(raw) as { startedDocker?: boolean };
      if (j.startedDocker) {
        execFileSync("docker", ["compose", "-f", composeFile, "down", "-v"], {
          cwd: root,
          stdio: "inherit",
        });
      }
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(envFile);
    } catch {
      /* ignore */
    }
  };
}
