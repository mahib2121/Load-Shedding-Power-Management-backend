import type { Request, Response } from "express";
import httpStatus from "http-status";

import { catchAsync } from "../../utils/catchAsync";
import { PaymentService } from "./pay.service";

const initialPayment = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.initialPayment(
    req.params.paymentId as string,
    req.user!.userId,
  );

  res.status(httpStatus.OK).json({
    success: true,
    statusCode: httpStatus.OK,
    message: "Payment initialized successfully",
    data: result,
  });
});

export const PaymentController = {
  initialPayment,
};
