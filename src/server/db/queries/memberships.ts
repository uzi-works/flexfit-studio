import { and, desc, eq, sql } from "drizzle-orm";
import { memberships } from "@/db/schema";

export async function activeMembershipFor(
  db: typeof import("@/db").db | any,
  userId: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        sql`${memberships.endDate} >= ${today}`,
      ),
    )
    .orderBy(desc(memberships.endDate))
    .get();
}
