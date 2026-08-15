import { and, asc, eq, sql } from "drizzle-orm";
import { corporateBookings, classes, companies, companyMembers, checkins } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { getCorporateClassBookedCount } from "@/server/db/queries/bookings";
import { hoursUntil } from "@/lib/date";
import { CORPORATE_FREE_CANCELLATION_HOURS } from "@/lib/constants/policies";

export async function getCompanyForMember(
  db: any,
  userId: number,
) {
  return db
    .select()
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companies.active, true),
      ),
    )
    .get();
}

export async function bookCorporateClass(
  db: any,
  userId: number,
  classId: number,
) {
  const cls = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .get();

  if (!cls) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Class not found.",
    });
  }

  if (cls.cancelled) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This class has been cancelled.",
    });
  }

  if (hoursUntil(cls.startsAt) <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This class has already started.",
    });
  }

  const existing = await db
    .select()
    .from(corporateBookings)
    .where(
      and(
        eq(corporateBookings.classId, classId),
        eq(corporateBookings.userId, userId),
        sql`${corporateBookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on the list for this class.",
    });
  }

  const companyRow = await getCompanyForMember(db, userId);
  if (!companyRow) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not linked to an active company.",
    });
  }

  const company = companyRow.companies;
  if (company.creditPoolBalance < cls.creditCost) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your company does not have enough credits.",
    });
  }

  const bookedCount = await getCorporateClassBookedCount(db, cls.id);
  const isFull = bookedCount >= cls.capacity;

  return db.transaction(async (tx: any) => {
    const created = await tx
      .insert(corporateBookings)
      .values({
        classId: cls.id,
        userId: userId,
        companyId: company.id,
        status: isFull ? "waitlisted" : "booked",
        creditsUsed: isFull ? 0 : cls.creditCost,
      })
      .returning()
      .get();

    if (!isFull) {
      await tx
        .update(companies)
        .set({
          creditPoolBalance: company.creditPoolBalance - cls.creditCost,
        })
        .where(eq(companies.id, company.id));
    }

    return created;
  });
}

export async function cancelCorporateBooking(
  db: any,
  userId: number,
  role: string,
  bookingId: number,
) {
  const row = await db
    .select({ booking: corporateBookings, cls: classes })
    .from(corporateBookings)
    .innerJoin(classes, eq(corporateBookings.classId, classes.id))
    .where(eq(corporateBookings.id, bookingId))
    .get();

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  }

  const isOwner = row.booking.userId === userId;
  const isStaff = role === "admin" || role === "trainer";
  if (!isOwner && !isStaff) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot cancel this booking.",
    });
  }

  if (row.booking.status !== "booked" && row.booking.status !== "waitlisted") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This booking is no longer active.",
    });
  }

  const refundable =
    hoursUntil(row.cls.startsAt) >= CORPORATE_FREE_CANCELLATION_HOURS &&
    row.booking.creditsUsed > 0;

  await db.transaction(async (tx: any) => {
    await tx
      .update(corporateBookings)
      .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
      .where(eq(corporateBookings.id, row.booking.id));

    if (refundable) {
      const company = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, row.booking.companyId))
        .get();

      if (company) {
        await tx
          .update(companies)
          .set({
            creditPoolBalance: company.creditPoolBalance + row.booking.creditsUsed,
          })
          .where(eq(companies.id, company.id));
      }
    }

    if (row.booking.status === "booked") {
      const next = await tx
        .select()
        .from(corporateBookings)
        .where(
          and(
            eq(corporateBookings.classId, row.cls.id),
            eq(corporateBookings.status, "waitlisted"),
          ),
        )
        .orderBy(asc(corporateBookings.bookedAt))
        .get();

      if (next) {
        await tx
          .update(corporateBookings)
          .set({ status: "booked", creditsUsed: row.cls.creditCost })
          .where(eq(corporateBookings.id, next.id));

        const company = await tx
          .select()
          .from(companies)
          .where(eq(companies.id, next.companyId))
          .get();

        if (company && company.creditPoolBalance >= row.cls.creditCost) {
          await tx
            .update(companies)
            .set({
              creditPoolBalance: Math.max(
                0,
                company.creditPoolBalance - row.cls.creditCost,
              ),
            })
            .where(eq(companies.id, company.id));
        }
      }
    }
  });

  return { ok: true, refunded: refundable };
}

export async function markCorporateBookingAttended(
  db: any,
  bookingId: number,
) {
  const booking = await db
    .select()
    .from(corporateBookings)
    .where(eq(corporateBookings.id, bookingId))
    .get();

  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  }
  if (booking.status !== "booked") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only confirmed bookings can be checked in.",
    });
  }

  await db.transaction(async (tx: any) => {
    await tx
      .update(corporateBookings)
      .set({ status: "attended" })
      .where(eq(corporateBookings.id, booking.id));

    await tx.insert(checkins).values({
      userId: booking.userId,
      bookingId: null,
    });
  });

  return { ok: true };
}
