import { AppError } from "../../utils/AppError";
import { prisma } from "../../lib/prisma";
import type { ICreateSchedulePayload } from "./load-shedding.interface";
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
export const LoadSheddingService = {
  createSchedule,
};
