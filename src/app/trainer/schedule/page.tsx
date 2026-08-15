"use client";

import { trpc } from "@/lib/trpc";
import { TrainerClassCard } from "@/components/trainer/trainer-class-card";
import { TrainerAvailabilityEditor } from "@/components/trainer/availability-editor";

export default function TrainerSchedulePage() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: classes, isLoading: classesLoading } =
    trpc.trainers.upcomingClasses.useQuery(undefined, {
      enabled: user?.role === "trainer",
    });
  const { data: availability, isLoading: availLoading } =
    trpc.trainers.availability.useQuery(undefined, {
      enabled: user?.role === "trainer",
    });

  if (user?.role !== "trainer") {
    return <p className="muted">Access denied. Trainers only.</p>;
  }

  const isLoading = classesLoading || availLoading;

  if (isLoading) return <p className="muted">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trainer Schedule</h1>
        <p className="muted mt-1 text-sm">Manage your availability and upcoming classes</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Upcoming Classes</h2>
        {classes && classes.length > 0 ? (
          <div className="panel divide-y" style={{ borderColor: "var(--border)" }}>
            {classes.map((cls) => (
              <TrainerClassCard
                key={cls.id}
                classId={cls.id}
                className={cls.name}
                startsAt={cls.startsAt}
                room={cls.room}
                durationMin={cls.durationMin}
                cancelled={cls.cancelled}
                bookedCount={cls.bookedCount}
                checkinsCount={cls.checkinsCount}
              />
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No upcoming classes.</p>
        )}
      </section>

      <TrainerAvailabilityEditor availability={availability || []} />
    </div>
  );
}
