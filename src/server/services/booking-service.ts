import { and, asc, eq, sql } from "drizzle-orm";
import { bookings, classes, memberships, checkins } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { activeMembershipFor } from "@/server/db/queries/memberships";
import { getClassBookedCount } from "@/server/db/queries/bookings";
import { hoursUntil } from "@/lib/date";
import { FREE_CANCELLATION_HOURS, UNLIMITED_CREDITS } from "@/lib/constants/policies";

export async function bookClass(
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
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, classId),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on the list for this class.",
    });
  }

  const membership = await activeMembershipFor(db, userId);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "An active membership is required to book classes.",
    });
  }

  const unlimited = membership.creditsRemaining >= UNLIMITED_CREDITS;
  if (!unlimited && membership.creditsRemaining < cls.creditCost) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not enough class credits remaining.",
    });
  }

  const bookedCount = await getClassBookedCount(db, cls.id);
  const isFull = bookedCount >= cls.capacity;

  return db.transaction(async (tx: any) => {
    const created = await tx
      .insert(bookings)
      .values({
        classId: cls.id,
        userId: userId,
        membershipId: membership.id,
        status: isFull ? "waitlisted" : "booked",
        creditsUsed: isFull ? 0 : cls.creditCost,
      })
      .returning()
      .get();

    if (!isFull && !unlimited) {
      await tx
        .update(memberships)
        .set({ creditsRemaining: membership.creditsRemaining - cls.creditCost })
        .where(eq(memberships.id, membership.id));
    }

    return created;
  });
}

export async function cancelBooking(
  db: any,
  userId: number,
  role: string,
  bookingId: number,
) {
  const row = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, bookingId))
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
    hoursUntil(row.cls.startsAt) >= FREE_CANCELLATION_HOURS &&
    row.booking.creditsUsed > 0;

  await db.transaction(async (tx: any) => {
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date().toISOString() })
      .where(eq(bookings.id, row.booking.id));

    if (refundable && row.booking.membershipId) {
      const ms = await tx
        .select()
        .from(memberships)
        .where(eq(memberships.id, row.booking.membershipId))
        .get();

      if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
        await tx
          .update(memberships)
          .set({ creditsRemaining: ms.creditsRemaining + row.booking.creditsUsed })
          .where(eq(memberships.id, ms.id));
      }
    }

    // Freeing a confirmed spot promotes the member who has waited longest.
    if (row.booking.status === "booked") {
      const next = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.classId, row.cls.id),
            eq(bookings.status, "waitlisted"),
          ),
        )
        .orderBy(asc(bookings.bookedAt))
        .get();

      if (next) {
        await tx
          .update(bookings)
          .set({ status: "booked", creditsUsed: row.cls.creditCost })
          .where(eq(bookings.id, next.id));

        if (next.membershipId) {
          const ms = await tx
            .select()
            .from(memberships)
            .where(eq(memberships.id, next.membershipId))
            .get();

          if (ms && ms.creditsRemaining < UNLIMITED_CREDITS) {
            await tx
              .update(memberships)
              .set({
                creditsRemaining: Math.max(
                  0,
                  ms.creditsRemaining - row.cls.creditCost,
                ),
              })
              .where(eq(memberships.id, ms.id));
          }
        }
      }
    }
  });

  return { ok: true, refunded: refundable };
}

export async function markBookingAttended(
  db: any,
  bookingId: number,
  source: "front_desk" | "kiosk" | "app" = "front_desk",
) {
  const booking = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
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
      .update(bookings)
      .set({ status: "attended" })
      .where(eq(bookings.id, booking.id));

    await tx.insert(checkins).values({
      userId: booking.userId,
      bookingId: booking.id,
      source,
    });
  });

  return { ok: true };
}
