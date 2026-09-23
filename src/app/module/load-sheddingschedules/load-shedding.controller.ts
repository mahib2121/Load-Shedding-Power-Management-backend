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

export const LoadSheddingController = {
  createSchedule,
};
