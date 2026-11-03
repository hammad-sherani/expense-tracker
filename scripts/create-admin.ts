/**
 * Creates the admin account, or promotes an existing account to admin.
 *
 *   1. Set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD in .env
 *   2. npm run create-admin
 *
 * The admin's email is marked as verified, so no OTP is needed.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { emailSchema, passwordSchema, usernameSchema } from "../src/lib/validations/auth";

async function main() {
  const username = usernameSchema.parse(process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const emailResult = emailSchema.safeParse(process.env.ADMIN_EMAIL ?? "");
  const passwordResult = passwordSchema.safeParse(process.env.ADMIN_PASSWORD ?? "");

  if (!emailResult.success) throw new Error("ADMIN_EMAIL is missing or invalid in .env");
  if (!passwordResult.success) {
    throw new Error(`ADMIN_PASSWORD is invalid: ${passwordResult.error.issues.map((i) => i.message).join(", ")}`);
  }

  const email = emailResult.data.toLowerCase();
  const passwordHash = await bcrypt.hash(passwordResult.data, 12);
  const db = new PrismaClient();

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: { role: "ADMIN", passwordHash, emailVerified: existing.emailVerified ?? new Date() },
      });
      console.log(`✓ Promoted ${email} to admin and updated its password.`);
    } else {
      const clash = await db.user.findUnique({ where: { username } });
      if (clash) throw new Error(`Username "${username}" is already used by ${clash.email}. Choose another ADMIN_USERNAME.`);
      await db.user.create({
        data: { username, email, passwordHash, role: "ADMIN", emailVerified: new Date() },
      });
      console.log(`✓ Created admin ${username} <${email}>.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
