import { and, eq, sql } from "drizzle-orm";
import { bookings, corporateBookings } from "@/db/schema";

export async function getClassBookedCount(
  db: typeof import("@/db").db | any,
  classId: number,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(eq(bookings.classId, classId), eq(bookings.status, "booked")),
    );
  return Number(result?.count ?? 0);
}

export async function getCorporateClassBookedCount(
  db: typeof import("@/db").db | any,
  classId: number,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.status, "booked"),
      ),
    );
  return Number(result?.count ?? 0);
}

export function getClassBookedCountSql(
  classIdColumn: any,
  statuses: string[] = ["booked"],
) {
  if (statuses.length === 1) {
    return sql<number>`(
      select count(*) from ${bookings}
      where ${bookings.classId} = ${classIdColumn}
        and ${bookings.status} = ${statuses[0]}
    )`;
  }
  return sql<number>`(
    select count(*) from ${bookings}
    where ${bookings.classId} = ${classIdColumn}
      and ${bookings.status} in (${sql.join(
        statuses.map((s) => sql`${s}`),
        sql`, `,
      )})
  )`;
}

