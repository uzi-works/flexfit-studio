"use client";

import { formatDateTime } from "@/lib/format";

interface TrainerClassCardProps {
  classId: number;
  className: string;
  startsAt: string;
  room: string;
  durationMin: number;
  cancelled: boolean;
  bookedCount: number;
  checkinsCount: number;
}

export function TrainerClassCard({
  classId,
  className,
  startsAt,
  room,
  durationMin,
  cancelled,
  bookedCount,
  checkinsCount,
}: TrainerClassCardProps) {
  return (
    <div className="p-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{className}</div>
          <div className="muted mt-1 text-xs">
            {formatDateTime(startsAt)} · {room} · {durationMin} min
          </div>
          <div className="muted mt-2 text-xs">
            📊 {bookedCount} booked · ✓ {checkinsCount} checked in
          </div>
          {cancelled && (
            <div className="mt-1 rounded px-2 py-1 text-xs" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
              Cancelled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
