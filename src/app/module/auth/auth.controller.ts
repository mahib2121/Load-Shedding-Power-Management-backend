import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import type { IRequestUser } from "./auth.interface";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
};

const accessTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 1000 * 60 * 60 * 24, // 1 day
};

const refreshTokenCookieOptions = {
  ...cookieOptions,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

const registerUser = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;

  const result = await AuthService.registerUser(payload);

  const { accessToken, refreshToken, user } = result;

  res.cookie("accessToken", accessToken, accessTokenCookieOptions);

  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Customer registered successfully",
    data: {
      user,
      accessToken,
      refreshToken,
    },
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;

  const result = await AuthService.loginUser(payload);

  const { accessToken, refreshToken } = result;

  res.cookie("accessToken", accessToken, accessTokenCookieOptions);

  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: {
      accessToken,
      refreshToken,
    },
  });
});

/**
 * Get current authenticated user
 */
const getMe = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as IRequestUser | undefined;

  if (!user) {
    throw new Error("User information is missing in the request");
  }

  const result = await AuthService.getMe(user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User profile fetched successfully",
    data: result,
  });
});

/**
 * Refresh access token
 */
const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    throw new Error("Refresh token is missing");
  }

  const result = await AuthService.refreshToken(token);

  const { accessToken, refreshToken: newRefreshToken } = result;

  res.cookie("accessToken", accessToken, accessTokenCookieOptions);

  res.cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "New tokens generated successfully",
    data: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  });
});

/**
 * Logout
 */
const logoutUser = catchAsync(async (_req: Request, res: Response) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  await AuthService.logoutUser();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged out successfully",
    data: null,
  });
});
const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;

  const result = await AuthService.googleLogin(payload);

  const { accessToken, refreshToken } = result;

  res.cookie("accessToken", accessToken, accessTokenCookieOptions);

  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Google login successful",
    data: {
      accessToken,
      refreshToken,
    },
  });
});

export const AuthController = {
  registerUser,
  loginUser,
  getMe,
  refreshToken,
  logoutUser,
  googleLogin,
};
