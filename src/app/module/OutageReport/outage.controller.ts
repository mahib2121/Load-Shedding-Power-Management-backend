import type { Request, Response } from "express";

import httpStatus from "http-status";

import { catchAsync } from "../../utils/catchAsync";

import { OutageService } from "./outage.service";

const createOutageReport = catchAsync(async (req: Request, res: Response) => {
  const result = await OutageService.createOutageReport(
    req.user!.userId,
    req.body,
  );

  res.status(httpStatus.CREATED).json({
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Outage report created. Payment is pending.",
    data: result,
  });
});

const verifyOutage = catchAsync(async (req: Request, res: Response) => {
  const result = await OutageService.verifyOutage(
    req.params.outageId as string,
    req.user!,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Outage verified successfully",
    data: result,
  });
});

const assignTechnician = catchAsync(async (req: Request, res: Response) => {
  const result = await OutageService.assignTechnician(
    req.params.outageId as string,
    req.body.technicianId,
    req.body.notes,
    req.user!,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Technician assigned successfully",
    data: result,
  });
});

const startRepair = catchAsync(async (req: Request, res: Response) => {
  const result = await OutageService.startRepair(
    req.params.outageId as string,
    req.user!,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Outage repair started successfully",
    data: result,
  });
});

const restoreOutage = catchAsync(async (req: Request, res: Response) => {
  const result = await OutageService.restoreOutage(
    req.params.outageId as string,
    req.user!,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Power restored successfully",
    data: result,
  });
});

export const OutageController = {
  createOutageReport,
  verifyOutage,
  assignTechnician,
  startRepair,
  restoreOutage,
};
