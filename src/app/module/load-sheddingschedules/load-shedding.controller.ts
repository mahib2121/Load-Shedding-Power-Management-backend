import { ScheduleStatus } from "../../../generated/prisma/browser";
import { catchAsync } from "../../utils/catchAsync";
import { LoadSheddingService } from "./load-shedding.service";
import type { Request, Response } from "express";
import httpStatus from "http-status";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
  const result = await LoadSheddingService.createSchedule(
    req.body,
    req.user!.userId,
    req.user!.role,
  );

  res.status(httpStatus.CREATED).json({
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Load shedding schedule created successfully",
    data: result,
  });
});

const createScheduleSlot = catchAsync(async (req: Request, res: Response) => {
  const result = await LoadSheddingService.createScheduleSlot(
    req.params.scheduleId as string,
    req.body,
    req.user!.userId,
    req.user!.role,
  );

  res.status(httpStatus.CREATED).json({
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Schedule slot created successfully",
    data: result,
  });
});

const getSchedules = catchAsync(async (req: Request, res: Response) => {
  const result = await LoadSheddingService.getSchedules(
    req.user!.userId,
    req.user!.role,
    {
      zoneId: req.query.zoneId as string | undefined,
      status: req.query.status as ScheduleStatus | undefined,
      date: req.query.date ? new Date(req.query.date as string) : undefined,
    },
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Load shedding schedules retrieved successfully",
    data: result,
  });
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const result = await LoadSheddingService.getScheduleById(
    req.params.scheduleId as string,
    req.user!.userId,
    req.user!.role,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Load shedding schedule retrieved successfully",
    data: result,
  });
});
const getScheduleSlots = catchAsync(async (req: Request, res: Response) => {
  const result = await LoadSheddingService.getScheduleSlots(
    req.params.scheduleId as string,
    req.user!.userId,
    req.user!.role,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Schedule slots retrieved successfully",
    data: result,
  });
});

export const LoadSheddingController = {
  createSchedule,
  createScheduleSlot,
  getScheduleById,
  getSchedules,
  getScheduleSlots,
};
