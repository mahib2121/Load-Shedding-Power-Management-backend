import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AreaService } from "./area.service";

const getAreas = async (_req: Request, res: Response) => {
  const areas = await AreaService.getAreas();

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Areas retrieved successfully",
    data: areas,
    meta: null,
  });
};

export const AreaController = {
  getAreas,
};
