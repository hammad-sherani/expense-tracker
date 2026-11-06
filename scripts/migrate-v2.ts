/**
 * Upgrades every account's v1 data to v2 (safe to run more than once):
 *   - the fixed categories become each user's own categories,
 *   - payment methods become wallets (plus a Cash wallet for everyone).
 *
 *   npx prisma db push      # add the new collections and indexes first
 *   npm run migrate:v2
 *
 * Accounts are also upgraded automatically the first time they open the app,
 * so running this script is optional.
 */
import { PrismaClient } from "@prisma/client";
import { upgradeUserData } from "../src/server/user-setup";

async function main() {
  const db = new PrismaClient();
  try {
    const users = await db.user.findMany({ where: { role: "USER" }, select: { id: true, username: true } });
    console.log(`Upgrading ${users.length} account(s)…`);
    for (const u of users) {
      const r = await upgradeUserData(db, u.id);
      console.log(`  ${u.username}: ${r.categorized} expense(s) categorised, ${r.walleted} linked to a wallet`);
    }
    console.log("Done.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
