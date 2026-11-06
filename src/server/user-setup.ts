/**
 * Default data and the v1 -> v2 data upgrade for one user.
 * No "server-only" import, so scripts/migrate-v2.ts can use it too.
 * Every function is idempotent: running it again changes nothing.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "../lib/category-icons";
import { PAYMENT_METHOD_WALLET, WALLET_TYPE_META } from "../lib/wallets";

type Client = PrismaClient;

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Creates the default categories when the user has none. Returns v1 category key -> category id. */
export async function seedDefaultCategories(client: Client, userId: string) {
  const count = await client.category.count({ where: { userId } });
  if (count === 0) {
    try {
      await client.category.createMany({
        data: DEFAULT_CATEGORIES.map((c, i) => ({
          userId,
          name: c.name,
          nameKey: c.name.toLowerCase(),
          icon: c.icon,
          color: c.color,
          sortOrder: i,
        })),
      });
    } catch (e) {
      // Two requests seeding at once: the other one won.
      if (!isUniqueClash(e)) throw e;
    }
  }
  const all = await client.category.findMany({ where: { userId }, select: { id: true, nameKey: true } });
  const byKey = new Map(all.map((c) => [c.nameKey, c.id]));
  const legacy = new Map<string, string>();
  for (const c of DEFAULT_CATEGORIES) {
    const id = byKey.get(c.name.toLowerCase());
    if (id) legacy.set(c.legacy, id);
  }
  return legacy;
}

async function ensureWallet(client: Client, userId: string, name: string, type: keyof typeof WALLET_TYPE_META) {
  const nameKey = name.toLowerCase();
  const found = await client.wallet.findUnique({ where: { userId_nameKey: { userId, nameKey } } });
  if (found) return found.id;
  try {
    const created = await client.wallet.create({
      data: { userId, name, nameKey, type, color: WALLET_TYPE_META[type].color },
    });
    return created.id;
  } catch (e) {
    if (!isUniqueClash(e)) throw e;
    return (await client.wallet.findUniqueOrThrow({ where: { userId_nameKey: { userId, nameKey } } })).id;
  }
}

/**
 * Upgrades a user's v1 data: fixed categories become their own categories and
 * payment methods become wallets. Only touches expenses that weren't upgraded yet.
 */
export async function upgradeUserData(client: Client, userId: string) {
  const legacy = await seedDefaultCategories(client, userId);
  const walletCount = await client.wallet.count({ where: { userId } });
  if (walletCount === 0) await ensureWallet(client, userId, "Cash", "CASH");

  let categorized = 0;
  for (const [legacyKey, categoryId] of legacy) {
    const res = await client.expense.updateMany({
      where: {
        userId,
        legacyCategory: legacyKey as never,
        OR: [{ categoryId: { isSet: false } }, { categoryId: null }],
      },
      data: { categoryId },
    });
    categorized += res.count;
  }

  let walleted = 0;
  for (const [method, wallet] of Object.entries(PAYMENT_METHOD_WALLET)) {
    const pending = await client.expense.count({
      where: { userId, paymentMethod: method as never, OR: [{ walletId: { isSet: false } }, { walletId: null }] },
    });
    if (pending === 0) continue;
    const walletId = await ensureWallet(client, userId, wallet.name, wallet.type);
    const res = await client.expense.updateMany({
      where: { userId, paymentMethod: method as never, OR: [{ walletId: { isSet: false } }, { walletId: null }] },
      data: { walletId },
    });
    walleted += res.count;
  }
  return { categorized, walleted };
}
