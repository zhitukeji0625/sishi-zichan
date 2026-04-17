import net from "node:net";

/** 与 docker-compose 中 mysql 的 `127.0.0.1:33306:3306` 映射一致，便于本机跑 Vitest */
export const DEFAULT_TEST_DATABASE_URL =
  "mysql://root:root@127.0.0.1:33306/sishi";

export function parseMysqlUrl(
  url: string,
): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "mysql:") return null;
    const port = u.port ? Number(u.port) : 3306;
    if (!u.hostname || Number.isNaN(port)) return null;
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

export function isMysqlReachable(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.on("error", () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}
