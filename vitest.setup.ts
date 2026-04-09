import "dotenv/config";
import net from "node:net";

// 集成测试需要 MySQL；与 docker-compose 中 app 使用的连接串一致，便于本地 `docker compose up mysql` 后运行 `npm test`
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://root:root@127.0.0.1:3306/sishi";
}

function mysqlHostPort(url: string): { host: string; port: number } {
  const normalized = url.replace(/^mysql:/i, "http:");
  const u = new URL(normalized);
  const port = u.port ? Number(u.port) : 3306;
  return { host: u.hostname, port };
}

function canReachPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const { host, port } = mysqlHostPort(process.env.DATABASE_URL!);
process.env.VITEST_DB_REACHABLE = (await canReachPort(host, port, 1500)) ? "1" : "0";
