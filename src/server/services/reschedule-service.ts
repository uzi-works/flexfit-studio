import { and, eq, sql } from "drizzle-orm";
import { bookings, classes, reschedules } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { getClassBookedCount } from "@/server/db/queries/bookings";
import { hoursUntil } from "@/lib/date";
import { FREE_RESCHEDULE_HOURS } from "@/lib/constants/policies";

export async function performRescheduleChecks(
  db: any,
  userId: number,
  fromBookingId: number,
  toClassId: number,
  shouldThrow = false,
) {
  const originalRow = await db
    .select({ booking: bookings, cls: classes })
    .from(bookings)
    .innerJoin(classes, eq(bookings.classId, classes.id))
    .where(eq(bookings.id, fromBookingId))
    .get();

  if (!originalRow) {
    if (shouldThrow) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
    return { valid: false, reason: "Booking not found." };
  }

  const originalBooking = originalRow.booking;
  const originalClass = originalRow.cls;

  if (originalBooking.userId !== userId) {
    if (shouldThrow) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot reschedule this booking." });
    return { valid: false, reason: "You cannot reschedule this booking." };
  }

  if (originalBooking.status !== "booked" && originalBooking.status !== "waitlisted") {
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is no longer active." });
    return { valid: false, reason: "This booking is no longer active." };
  }

  const hoursBeforeOriginal = hoursUntil(originalClass.startsAt);
  if (hoursBeforeOriginal < FREE_RESCHEDULE_HOURS) {
    const msg = `You can only reschedule up to ${FREE_RESCHEDULE_HOURS} hours before the class starts.`;
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    return { valid: false, reason: msg };
  }

  const targetClass = await db
    .select()
    .from(classes)
    .where(eq(classes.id, toClassId))
    .get();

  if (!targetClass) {
    if (shouldThrow) throw new TRPCError({ code: "NOT_FOUND", message: "Target class not found." });
    return { valid: false, reason: "Target class not found." };
  }

  if (targetClass.name !== originalClass.name) {
    const msg = "You can only reschedule to a class with the same name.";
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    return { valid: false, reason: msg };
  }

  if (targetClass.id === originalClass.id) {
    const msg = "You are already booked for this class.";
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    return { valid: false, reason: msg };
  }

  if (hoursUntil(targetClass.startsAt) <= 0) {
    const msg = "This class has already started.";
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    return { valid: false, reason: msg };
  }

  if (targetClass.cancelled) {
    const msg = "This class has been cancelled.";
    if (shouldThrow) throw new TRPCError({ code: "BAD_REQUEST", message: msg });
    return { valid: false, reason: msg };
  }

  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.classId, targetClass.id),
        eq(bookings.userId, userId),
        sql`${bookings.status} in ('booked', 'waitlisted')`,
      ),
    )
    .get();

  if (existingBooking) {
    const msg = "You already have an active booking for this class.";
    if (shouldThrow) throw new TRPCError({ code: "CONFLICT", message: msg });
    return { valid: false, reason: msg };
  }

  const bookedCount = await getClassBookedCount(db, targetClass.id);
  const targetIsFull = bookedCount >= targetClass.capacity;

  return {
    valid: true,
    targetIsFull,
    originalBooking,
    originalClass,
    targetClass,
  };
}

export async function rescheduleBooking(
  db: any,
  userId: number,
  fromBookingId: number,
  toClassId: number,
) {
  const result = await performRescheduleChecks(db, userId, fromBookingId, toClassId, true);
  const { originalBooking, originalClass, targetClass, targetIsFull } = result as any;

  return db.transaction(async (tx: any) => {
    const newBooking = await tx
      .insert(bookings)
      .values({
        classId: targetClass.id,
        userId: userId,
        membershipId: originalBooking.membershipId,
        status: targetIsFull ? "waitlisted" : "booked",
        creditsUsed: originalBooking.creditsUsed,
      })
      .returning()
      .get();

    await tx
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      })
      .where(eq(bookings.id, originalBooking.id));

    await tx.insert(reschedules).values({
      userId: userId,
      fromBookingId: originalBooking.id,
      toBookingId: newBooking.id,
      fromClassId: originalClass.id,
      toClassId: targetClass.id,
    });

    return {
      ok: true,
      newBooking,
      newStatus: targetIsFull ? "waitlisted" : "booked",
    };
  });
}
