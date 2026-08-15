"use client";

import { formatDateTime } from "@/lib/format";

interface Booking {
  id: number;
  status: "booked" | "cancelled" | "attended" | "no_show" | "waitlisted";
  creditsUsed: number;
  bookedAt: string;
  classId: number;
  className: string;
  room: string;
  startsAt: string;
  durationMin: number;
  cancelled: boolean;
}

interface BookingListItemProps {
  booking: Booking;
  isCancelPending: boolean;
  onCancel: (bookingId: number) => void;
  onReschedule: (booking: Booking) => void;
}

export function BookingListItem({
  booking,
  isCancelPending,
  onCancel,
  onReschedule,
}: BookingListItemProps) {
  return (
    <div className="panel flex items-center gap-2 p-4 flex-wrap sm:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{booking.className}</h3>
          <span className="muted text-xs uppercase tracking-wide">
            {booking.status}
          </span>
        </div>
        <p className="muted mt-0.5 text-sm">
          {formatDateTime(booking.startsAt)} &middot; {booking.room}
        </p>
      </div>

      {(booking.status === "booked" || booking.status === "waitlisted") && (
        <div className="flex gap-2 w-full sm:w-auto">
          {booking.status === "booked" && (
            <button
              className="btn text-sm flex-1 sm:flex-none"
              disabled={isCancelPending}
              onClick={() => onReschedule(booking)}
            >
              Reschedule
            </button>
          )}
          <button
            className="btn text-sm flex-1 sm:flex-none"
            disabled={isCancelPending}
            onClick={() => onCancel(booking.id)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
