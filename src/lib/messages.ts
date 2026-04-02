import { prisma } from "@/lib/prisma";

export async function notifyUser(
  endUserId: string,
  title: string,
  body: string,
  templateCode?: string,
) {
  await prisma.messageLog.create({
    data: {
      endUserId,
      title,
      body,
      channel: "IN_APP",
      templateCode: templateCode ?? null,
      status: "SENT",
    },
  });
}
