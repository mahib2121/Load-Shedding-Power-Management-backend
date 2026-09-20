import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError";

export const globalErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  let statusCode = 500;
  let message = "Something went wrong!";

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    name: error.name,
    message,
  });
};
