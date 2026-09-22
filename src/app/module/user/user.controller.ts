// biome-ignore assist/source/organizeImports: <explanation>
import { catchAsync } from "../../utils/catchAsync";
import type { NextFunction, Request, Response } from "express";
import { sendResponse } from "../../utils/sendResponse";
import HttpStatus from "http-status";

const uploadprofileImage = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    sendResponse(res, {
      statusCode: HttpStatus.OK,
      success: true,
      message: "Profile image uploaded successfully",
      data: null,
    });
  },
);
export const userController = {
  uploadprofileImage,
};


