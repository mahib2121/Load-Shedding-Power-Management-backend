import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "./prisma";
import { ScheduleStatus } from "../../generated/prisma/browser";

/**
 * Runs every minute.
 *
 * Responsibilities:
 *  1. Promote APPROVED schedules whose earliest slot has started → ACTIVE.
 *  2. Mark ACTIVE schedules whose latest slot has ended → COMPLETED.
 *
 * This removes the need for a human to manually call /activate, and
 * ensures that customers calling GET /my-schedule always see current data.
 */
const runScheduleLifecycle = async (): Promise<void> => {
  const now = new Date();

  try {
    // 1. APPROVED -> ACTIVE
    //    A schedule becomes ACTIVE once the date has started and
    //    at least one slot has begun.
    const approvedSchedules = await prisma.loadSheddingSchedule.findMany({
      where: {
        status: ScheduleStatus.APPROVED,
        deletedAt: null,
      },
      include: {
        slots: {
          orderBy: { startTime: "asc" },
          select: { startTime: true, endTime: true },
        },
      },
    });

    for (const schedule of approvedSchedules) {
      const firstSlot = schedule.slots[0];
      if (!firstSlot) continue;

      if (firstSlot.startTime <= now) {
        await prisma.loadSheddingSchedule.update({
          where: { id: schedule.id },
          data: { status: ScheduleStatus.ACTIVE },
        });
        console.log(
          `[scheduler] Promoted schedule ${schedule.id} (${schedule.name}) APPROVED -> ACTIVE`,
        );
      }
    }

    // 2. ACTIVE -> COMPLETED
    //    A schedule is COMPLETED once every slot has ended.
    const activeSchedules = await prisma.loadSheddingSchedule.findMany({
      where: {
        status: ScheduleStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        slots: {
          orderBy: { endTime: "desc" },
          select: { endTime: true },
        },
      },
    });

    for (const schedule of activeSchedules) {
      if (schedule.slots.length === 0) {
        // Defensive: an ACTIVE schedule with no slots is treated as completed.
        await prisma.loadSheddingSchedule.update({
          where: { id: schedule.id },
          data: { status: ScheduleStatus.COMPLETED },
        });
        console.log(
          `[scheduler] Completed schedule ${schedule.id} (${schedule.name}) (no slots)`,
        );
        continue;
      }

      const lastSlot = schedule.slots[0]; // ordered desc by endTime
      if (lastSlot.endTime <= now) {
        await prisma.loadSheddingSchedule.update({
          where: { id: schedule.id },
          data: { status: ScheduleStatus.COMPLETED },
        });
        console.log(
          `[scheduler] Completed schedule ${schedule.id} (${schedule.name}) ACTIVE -> COMPLETED`,
        );
      }
    }

    // 3. Compute which ACTIVE schedules are "currently shedding"
    //    (i.e. at least one slot is in progress right now).
    //    Exposed via a static helper for the controller; here we just
    //    verify the query used by GET /my-schedule would match.
    const currentlyShedding = await prisma.loadSheddingSchedule.count({
      where: {
        status: ScheduleStatus.ACTIVE,
        deletedAt: null,
        slots: {
          some: {
            startTime: { lte: now },
            endTime: { gte: now },
          },
        },
      },
    });

    if (currentlyShedding > 0) {
      console.log(
        `[scheduler] ${currentlyShedding} schedule(s) currently shedding`,
      );
    }
  } catch (error) {
    console.error("[scheduler] Error running schedule lifecycle:", error);
  }
};

/**
 * Returns ACTIVE schedules whose slots overlap "now" — i.e. the
 * schedules customers should see as currently shedding.
 */
export const getCurrentlySheddingSchedules = async () => {
  const now = new Date();
  return prisma.loadSheddingSchedule.findMany({
    where: {
      status: ScheduleStatus.ACTIVE,
      deletedAt: null,
      slots: {
        some: {
          startTime: { lte: now },
          endTime: { gte: now },
        },
      },
    },
    include: {
      slots: {
        orderBy: { startTime: "asc" },
      },
    },
  });
};

let scheduledTask: ScheduledTask | null = null;

/**
 * Starts the lifecycle scheduler. Runs every minute.
 *
 * Safe to call once at boot. Returns the underlying task so callers
 * can stop it (e.g. in tests or graceful shutdown).
 */
export const startScheduler = (): ScheduledTask => {
  if (scheduledTask) {
    console.log("[scheduler] Already running, skipping re-start");
    return scheduledTask;
  }

  console.log("[scheduler] Starting load-shedding schedule lifecycle cron");

  // Run once on boot, then every minute.
  void runScheduleLifecycle();

  scheduledTask = cron.schedule("* * * * *", () => {
    void runScheduleLifecycle();
  });

  return scheduledTask;
};

export const stopScheduler = (): void => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[scheduler] Stopped");
  }
};