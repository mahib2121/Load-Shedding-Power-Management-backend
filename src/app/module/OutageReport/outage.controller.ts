import type { Request, Response } from "express";
import httpStatus from "http-status";

import { catchAsync } from "../../utils/catchAsync";
import { OutageService } from "./outage.service";

const createOutageReport = catchAsync(
  async (req: Request, res: Response) => {
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
  },
);

export const OutageController = {
  createOutageReport,
};