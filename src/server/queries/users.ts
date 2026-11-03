import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PAGE_SIZE } from "@/lib/constants";
import { currentYearMonth, monthRange } from "@/lib/dates";

export type UserStatusFilter = "all" | "verified" | "pending";

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  createdAt: string;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Paginated list of regular (non-admin) user accounts for the admin console. */
export async function listUsers(params: { q: string; status: UserStatusFilter; page: number }) {
  const base: Prisma.UserWhereInput = { role: "USER" };
  const q = escapeRegex(params.q);
  const where: Prisma.UserWhereInput = {
    ...base,
    ...(params.status === "verified" ? { emailVerified: { not: null } } : {}),
    ...(params.status === "pending" ? { emailVerified: null } : {}),
    ...(q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { year, month } = currentYearMonth();
  const thisMonth = monthRange(year, month);

  const [total, totalUsers, verifiedUsers, newThisMonth] = await Promise.all([
    db.user.count({ where }),
    db.user.count({ where: base }),
    db.user.count({ where: { ...base, emailVerified: { not: null } } }),
    db.user.count({ where: { ...base, createdAt: { gte: thisMonth.start, lt: thisMonth.end } } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pageCount);

  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, username: true, email: true, emailVerified: true, createdAt: true },
  });

  return {
    items: rows.map<AdminUserRow>((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      verified: Boolean(u.emailVerified),
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount,
    stats: { totalUsers, verifiedUsers, pendingUsers: totalUsers - verifiedUsers, newThisMonth },
  };
}
