import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";

import type { JobType, UserRole } from "../../generated/prisma/enums";

import config from "../config";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

declare global {
	namespace Express {
		interface Request {
			user?: {
				email: string;
				name: string;
				userId: string;
				role: UserRole;
				jobType?: JobType | null;
				zoneId?: string | null;
				areaId?: string | null;
			};
		}
	}
}

/**
 * Authentication + Role Based Authorization
 *
 * Example:
 *
 * auth(UserRole.SUPER_ADMIN)
 *
 * auth(
 *   UserRole.SUPER_ADMIN,
 *   UserRole.ZONE_MANAGER
 * )
 *
 * auth(
 *   UserRole.CUSTOMER,
 *   UserRole.FIELD_OPERATOR,
 *   UserRole.ZONE_MANAGER,
 *   UserRole.SUPER_ADMIN
 * )
 */
export const auth = (...requiredRoles: UserRole[]) => {
	return catchAsync(
		async (req: Request, _res: Response, next: NextFunction) => {
			/* =====================================================
			   Get token
			===================================================== */

			const token = req.cookies?.accessToken
				? req.cookies.accessToken
				: req.headers.authorization?.startsWith("Bearer ")
					? req.headers.authorization.split(" ")[1]
					: req.headers.authorization;

			if (!token) {
				throw new Error(
					"You are not logged in. Please log in to access this resource.",
				);
			}

			/* =====================================================
			   Verify JWT
			===================================================== */

			const verifiedToken = jwtUtils.verifyToken(
				token,
				config.jwt_access_secret,
			);

			if (!verifiedToken.success || !verifiedToken.data) {
				throw new Error(
					verifiedToken.error || "Invalid or expired access token",
				);
			}

			const payload = verifiedToken.data as JwtPayload;

			const userId = payload.userId as string | undefined;
			const email = payload.email as string | undefined;
			const name = payload.name as string | undefined;
			const role = payload.role as UserRole | undefined;
			const jobType = payload.jobType as JobType | null | undefined;
			const zoneId = payload.zoneId as string | null | undefined;
			const areaId = payload.areaId as string | null | undefined;

			if (!userId || !email || !name || !role) {
				throw new Error("Invalid authentication token");
			}

			/* =====================================================
			   Check role from JWT
			===================================================== */

			if (requiredRoles.length > 0 && !requiredRoles.includes(role)) {
				throw new Error(
					"Forbidden. You don't have permission to access this resource.",
				);
			}

			/* =====================================================
			   Get current user from database
			===================================================== */

			const user = await prisma.user.findFirst({
				where: {
					id: userId,
					deletedAt: null,
				},
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					jobType: true,
					zoneId: true,
					areaId: true,
					isActive: true,
				},
			});

			if (!user) {
				throw new Error("User not found. Please log in again.");
			}

			/* =====================================================
			   Check account status
			===================================================== */

			if (!user.isActive) {
				throw new Error("Your account is inactive. Please contact support.");
			}

			/* =====================================================
			   Verify current database role
			===================================================== */

			if (user.role !== role) {
				throw new Error("Your role has changed. Please log in again.");
			}

			/* =====================================================
			   Verify JWT user information
			===================================================== */

			if (user.email !== email) {
				throw new Error(
					"Authentication information is outdated. Please log in again.",
				);
			}

			/* =====================================================
			   Attach current user to request
			===================================================== */

			req.user = {
				userId: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				jobType: user.jobType,
				zoneId: user.zoneId,
				areaId: user.areaId,
			};

			next();
		},
	);
};
