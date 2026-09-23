import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import type {
  ICreateSchedulePayload,
  ICreateScheduleSlotPayload,
} from "./load-shedding.interface";
import { ScheduleStatus, UserRole } from "../../../generated/prisma/browser";

const createSchedule = async (
  payload: ICreateSchedulePayload,
  userId: string,
  userRole: UserRole,
) => {
  const { name, date, expectedDemandMW, availableSupplyMW, zoneId } = payload;

  // 1. Check zone exists
  const zone = await prisma.zone.findFirst({
    where: {
      id: zoneId,
      deletedAt: null,
    },
  });

  if (!zone) {
    throw new AppError(404, "Zone not found");
  }

  // 2. Zone Manager can only create schedules for own zone
  if (userRole === UserRole.ZONE_MANAGER) {
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ZONE_MANAGER,
        zoneId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!manager) {
      throw new AppError(
        403,
        "You are not allowed to create a schedule for this zone",
      );
    }
  }

  // 3. Calculate required reduction
  const requiredReductionMW = Math.max(expectedDemandMW - availableSupplyMW, 0);

  // 4. Create schedule
  const schedule = await prisma.loadSheddingSchedule.create({
    data: {
      name,
      date,
      expectedDemandMW,
      availableSupplyMW,
      requiredReductionMW,
      zoneId,
      status: ScheduleStatus.DRAFT,
    },
  });

  return schedule;
};

const createScheduleSlot = async (
  scheduleId: string,
  payload: ICreateScheduleSlotPayload,
  userId: string,
  userRole: UserRole,
) => {
  const {
    feederId,
    startTime,
    endTime,
    durationHours,
    plannedLoadReductionMW,
  } = payload;

  // 1. Find schedule
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
  });

  if (!schedule) {
    throw new AppError(404, "Load shedding schedule not found");
  }

  // 2. Only DRAFT schedules can receive slots
  if (schedule.status !== ScheduleStatus.DRAFT) {
    throw new AppError(
      400,
      "Schedule slots can only be added to a DRAFT schedule",
    );
  }

  // 3. Zone Manager can only modify schedules in their own zone
  if (userRole === UserRole.ZONE_MANAGER) {
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ZONE_MANAGER,
        zoneId: schedule.zoneId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!manager) {
      throw new AppError(403, "You are not allowed to modify this schedule");
    }
  }

  // 4. Validate time
  if (startTime >= endTime) {
    throw new AppError(400, "Start time must be before end time");
  }

  // 5. Calculate actual duration
  const durationInHours =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  // 6. Only 1 or 2 hour slots
  if (durationInHours !== 1 && durationInHours !== 2) {
    throw new AppError(
      400,
      "Schedule slot duration must be exactly 1 or 2 hours",
    );
  }

  // 7. Make sure requested duration matches actual duration
  if (durationHours !== durationInHours) {
    throw new AppError(
      400,
      "durationHours does not match startTime and endTime",
    );
  }

  // 8. Find feeder
  const feeder = await prisma.feeder.findFirst({
    where: {
      id: feederId,
      isActive: true,
      deletedAt: null,
    },
    include: {
      substation: true,
    },
  });

  if (!feeder) {
    throw new AppError(404, "Feeder not found");
  }

  // 9. Verify feeder belongs to schedule's zone
  if (feeder.substation.zoneId !== schedule.zoneId) {
    throw new AppError(400, "Feeder does not belong to the schedule zone");
  }

  // 10. Validate load reduction
  if (plannedLoadReductionMW > feeder.currentLoadMW) {
    throw new AppError(
      400,
      "Planned load reduction cannot exceed feeder current load",
    );
  }

  // 11. Conflict detection
  const conflictingSlot = await prisma.scheduleSlot.findFirst({
    where: {
      feederId,

      startTime: {
        lt: endTime,
      },

      endTime: {
        gt: startTime,
      },
    },
  });

  if (conflictingSlot) {
    throw new AppError(
      409,
      `Feeder already has a load shedding slot between ${conflictingSlot.startTime.toISOString()} and ${conflictingSlot.endTime.toISOString()}`,
    );
  }

  // 12. Create slot
  const slot = await prisma.scheduleSlot.create({
    data: {
      scheduleId,
      feederId,
      startTime,
      endTime,
      durationHours,
      plannedLoadReductionMW,
    },
    include: {
      feeder: true,
    },
  });

  return slot;
};

export const LoadSheddingService = {
  createSchedule,
  createScheduleSlot,
};
