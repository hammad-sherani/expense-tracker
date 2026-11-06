import "server-only";
import { db } from "@/lib/db";
import { upgradeUserData } from "@/server/user-setup";

/** Default categories and a Cash wallet for a newly verified account. */
export async function seedUserDefaults(userId: string) {
  await upgradeUserData(db, userId);
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Upgrades a v1 account the first time it's used after the update, so the
 * migration script is optional. Cheap when already done (one count query).
 */
export async function ensureUserUpgraded(userId: string) {
  // Parallel requests (page + layout + prefetches) share one upgrade instead of racing,
  // and wait for it to finish (categories exist before expenses are mapped to them).
  const running = inFlight.get(userId);
  if (running) return void (await running);
  const hasCategories = await db.category.count({ where: { userId }, take: 1 });
  if (hasCategories > 0) return;
  let job = inFlight.get(userId);
  if (!job) {
    job = upgradeUserData(db, userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, job);
  }
  await job;
}
