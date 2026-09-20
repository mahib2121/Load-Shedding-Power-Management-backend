import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";

export const validateRequest = (schema: ZodType) => {
	return catchAsync((req: Request, _res: Response, next: NextFunction) => {
		const payload = req.body ?? {};

		const result = schema.safeParse(payload);

		if (!result.success) {
			const message = result.error.issues
				.map((issue) => issue.message)
				.join(", ");

			throw new AppError(400, message);
		}

		req.body = result.data;

		next();
	});
};
