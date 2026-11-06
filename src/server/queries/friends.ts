import "server-only";
import { db } from "@/lib/db";
import type { FriendDTO } from "@/types";

export async function listFriends(userId: string): Promise<FriendDTO[]> {
  return db.friend.findMany({
    where: { userId },
    orderBy: { nameKey: "asc" },
    select: { id: true, name: true },
  });
}
