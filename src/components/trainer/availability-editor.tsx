"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface Availability {
  id: number;
  trainerId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface TrainerAvailabilityEditorProps {
  availability: Availability[];
}

export function TrainerAvailabilityEditor({ availability }: TrainerAvailabilityEditorProps) {
  const utils = trpc.useUtils();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const setAvailability = trpc.trainers.setAvailability.useMutation({
    onSuccess: async () => {
      await utils.trainers.availability.invalidate();
      setEditingDay(null);
      setStartTime("");
      setEndTime("");
    },
  });

  const removeAvailability = trpc.trainers.removeAvailability.useMutation({
    onSuccess: async () => {
      await utils.trainers.availability.invalidate();
    },
  });

  const handleEditDay = (day: number) => {
    const existing = availability?.find((a) => a.dayOfWeek === day);
    setEditingDay(day);
    setStartTime(existing?.startTime || "");
    setEndTime(existing?.endTime || "");
  };

  const handleSave = () => {
    if (editingDay === null || !startTime || !endTime) return;
    setAvailability.mutate({
      dayOfWeek: editingDay,
      startTime,
      endTime,
    });
  };

  const handleRemove = (day: number) => {
    removeAvailability.mutate({ dayOfWeek: day });
  };

  const availabilityMap = new Map(
    availability?.map((a) => [a.dayOfWeek, a]) || [],
  );

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Weekly Availability</h2>
      <div className="space-y-2">
        {DAYS.map((day, idx) => {
          const avail = availabilityMap.get(idx);
          const isEditing = editingDay === idx;

          return (
            <div key={idx} className="panel p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{day}</div>
                  {avail && !isEditing && (
                    <div className="muted mt-1 text-sm">
                      {avail.startTime} - {avail.endTime}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="ml-4 flex gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="rounded border px-2 py-1 text-sm"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-secondary)",
                        color: "var(--fg)",
                      }}
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="rounded border px-2 py-1 text-sm"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-secondary)",
                        color: "var(--fg)",
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={setAvailability.isPending || !startTime || !endTime}
                      className="btn btn-primary btn-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDay(null)}
                      className="btn btn-sm"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--fg)",
                        borderColor: "var(--border)",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => handleEditDay(idx)}
                      className="btn btn-sm"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--fg)",
                        borderColor: "var(--border)",
                      }}
                    >
                      {avail ? "Edit" : "Add"}
                    </button>
                    {avail && (
                      <button
                        onClick={() => handleRemove(idx)}
                        disabled={removeAvailability.isPending}
                        className="btn btn-sm"
                        style={{
                          background: "var(--bg-secondary)",
                          color: "#ef4444",
                          borderColor: "var(--border)",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
