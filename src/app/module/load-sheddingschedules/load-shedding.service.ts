import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import type {
  ICreateSchedulePayload,
  ICreateScheduleSlotPayload,
} from "./load-shedding.interface";
import { ScheduleStatus, UserRole } from "../../../generated/prisma/browser";
import httpStatus from "http-status";

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

const getSchedules = async (
  userId: string,
  userRole: UserRole,
  filters?: {
    zoneId?: string;
    status?: ScheduleStatus;
    date?: Date;
  },
) => {
  const where: {
    deletedAt: null;
    zoneId?: string;
    status?: ScheduleStatus;
    date?: Date;
  } = {
    deletedAt: null,
  };

  // Zone Manager can only see schedules from their own zone
  if (userRole === UserRole.ZONE_MANAGER) {
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ZONE_MANAGER,
        isActive: true,
        deletedAt: null,
      },
      select: {
        zoneId: true,
      },
    });

    if (!manager) {
      throw new AppError(403, "Zone manager not found");
    }

    if (!manager.zoneId) {
      throw new AppError(400, "Zone manager is not assigned to a zone");
    }

    where.zoneId = manager.zoneId;
  }

  // SUPER_ADMIN can optionally filter by zone
  if (userRole === UserRole.SUPER_ADMIN && filters?.zoneId) {
    where.zoneId = filters.zoneId;
  }

  // Optional status filter
  if (filters?.status) {
    where.status = filters.status;
  }

  // Optional date filter
  if (filters?.date) {
    where.date = filters.date;
  }

  const schedules = await prisma.loadSheddingSchedule.findMany({
    where,
    orderBy: [
      {
        date: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    include: {
      zone: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      _count: {
        select: {
          slots: true,
        },
      },
    },
  });

  return schedules;
};

const getScheduleById = async (
  scheduleId: string,
  userId: string,
  userRole: UserRole,
) => {
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
    include: {
      zone: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      slots: {
        orderBy: {
          startTime: "asc",
        },
        include: {
          feeder: {
            select: {
              id: true,
              name: true,
              code: true,
              capacityMW: true,
              currentLoadMW: true,
              priority: true,
            },
          },
        },
      },
    },
  });

  if (!schedule) {
    throw new AppError(404, "Load shedding schedule not found");
  }

  // Zone Manager can only view schedules from their own zone
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
      throw new AppError(403, "You are not allowed to view this schedule");
    }
  }

  return schedule;
};

const getScheduleSlots = async (
  scheduleId: string,
  userId: string,
  userRole: UserRole,
) => {
  // 1. Check schedule exists
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
  });

  if (!schedule) {
    throw new AppError(404, "Load shedding schedule not found");
  }

  // 2. Zone Manager can only view slots
  //    from schedules in their own zone
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
      throw new AppError(403, "You are not allowed to view this schedule");
    }
  }

  // 3. Get schedule slots
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      scheduleId,
    },
    orderBy: {
      startTime: "asc",
    },
    include: {
      feeder: {
        select: {
          id: true,
          name: true,
          code: true,
          capacityMW: true,
          currentLoadMW: true,
          priority: true,
        },
      },
    },
  });

  return slots;
};

const deleteScheduleSlot = async (
  slotId: string,
  userId: string,
  userRole: UserRole,
) => {
  // 1. Find slot with its schedule
  const slot = await prisma.scheduleSlot.findFirst({
    where: {
      id: slotId,
    },
    include: {
      schedule: true,
    },
  });

  if (!slot) {
    throw new AppError(404, "Schedule slot not found");
  }

  // 2. Slot can only be deleted from a DRAFT schedule
  if (slot.schedule.status !== ScheduleStatus.DRAFT) {
    throw new AppError(
      400,
      "Schedule slots can only be deleted from a DRAFT schedule",
    );
  }

  // 3. Zone Manager can only modify schedules
  //    belonging to their own zone
  if (userRole === UserRole.ZONE_MANAGER) {
    const manager = await prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.ZONE_MANAGER,
        zoneId: slot.schedule.zoneId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!manager) {
      throw new AppError(
        403,
        "You are not allowed to delete this schedule slot",
      );
    }
  }

  // 4. Delete slot
  await prisma.scheduleSlot.delete({
    where: {
      id: slotId,
    },
  });
};
const submitSchedule = async (
  scheduleId: string,
  userId: string,
  userRole: UserRole,
) => {
  // 1. Find schedule with slots
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
    include: {
      slots: true,
    },
  });

  if (!schedule) {
    throw new AppError(404, "Load shedding schedule not found");
  }

  // 2. Only DRAFT schedules can be submitted
  if (schedule.status !== ScheduleStatus.DRAFT) {
    throw new AppError(
      400,
      "Only DRAFT schedules can be submitted for approval",
    );
  }

  // 3. Zone Manager can only submit schedules
  //    belonging to their own zone
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
      throw new AppError(403, "You are not allowed to submit this schedule");
    }
  }

  // 4. Schedule must have at least one slot
  if (schedule.slots.length === 0) {
    throw new AppError(
      400,
      "Schedule must contain at least one slot before submission",
    );
  }

  // 5. Calculate total planned reduction
  const totalPlannedReductionMW = schedule.slots.reduce(
    (total, slot) => total + slot.plannedLoadReductionMW,
    0,
  );

  // 6. Make sure required reduction is satisfied
  if (totalPlannedReductionMW < schedule.requiredReductionMW) {
    const remainingReductionMW =
      schedule.requiredReductionMW - totalPlannedReductionMW;

    throw new AppError(
      400,
      `Schedule does not satisfy required load reduction. ` +
        `Required: ${schedule.requiredReductionMW} MW, ` +
        `Planned: ${totalPlannedReductionMW} MW, ` +
        `Remaining: ${remainingReductionMW} MW`,
    );
  }

  // 7. Submit schedule
  const updatedSchedule = await prisma.loadSheddingSchedule.update({
    where: {
      id: scheduleId,
    },
    data: {
      status: ScheduleStatus.PENDING_APPROVAL,
    },
  });

  return updatedSchedule;
};
const approveSchedule = async (scheduleId: string) => {
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
  });

  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (schedule.status !== ScheduleStatus.PENDING_APPROVAL) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only schedules pending approval can be approved",
    );
  }

  const updatedSchedule = await prisma.loadSheddingSchedule.update({
    where: {
      id: scheduleId,
    },
    data: {
      status: ScheduleStatus.APPROVED,
    },
    include: {
      zone: true,
      slots: {
        include: {
          feeder: true,
        },
      },
    },
  });

  return updatedSchedule;
};
const rejectSchedule = async (scheduleId: string) => {
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
  });

  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (schedule.status !== ScheduleStatus.PENDING_APPROVAL) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only schedules pending approval can be rejected",
    );
  }

  const updatedSchedule = await prisma.loadSheddingSchedule.update({
    where: {
      id: scheduleId,
    },
    data: {
      status: ScheduleStatus.DRAFT,
    },
    include: {
      zone: true,
      slots: {
        include: {
          feeder: true,
        },
      },
    },
  });

  return updatedSchedule;
};
const activateSchedule = async (scheduleId: string) => {
  const schedule = await prisma.loadSheddingSchedule.findFirst({
    where: {
      id: scheduleId,
      deletedAt: null,
    },
  });

  if (!schedule) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (schedule.status !== ScheduleStatus.APPROVED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only approved schedules can be activated",
    );
  }

  const updatedSchedule = await prisma.loadSheddingSchedule.update({
    where: {
      id: scheduleId,
    },
    data: {
      status: ScheduleStatus.ACTIVE,
    },
    include: {
      zone: true,
      slots: {
        include: {
          feeder: true,
        },
      },
    },
  });

  return updatedSchedule;
};
export const LoadSheddingService = {
  createSchedule,
  createScheduleSlot,
  getSchedules,
  getScheduleById,
  getScheduleSlots,
  deleteScheduleSlot,
  submitSchedule,
  approveSchedule,
  rejectSchedule,
  activateSchedule,
};
