import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";

import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();
router.post(
  "/register",
  validateRequest(UserValidation.RegisterUserZodSchema),
  AuthController.registerUser,
);
// validateRequest(UserValidation.LoginZodSchema),
router.post("/login", AuthController.loginUser);

router.get(
  "/me",
  auth(
    UserRole.CUSTOMER,
    UserRole.FIELD_OPERATOR,
    UserRole.ZONE_MANAGER,
    UserRole.SUPER_ADMIN,
  ),
  AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logoutUser);
router.post(
  "/google",
  validateRequest(UserValidation.GoogleLoginZodSchema),
  AuthController.googleLogin,
);
router.post(
  "/forgot-password",

  AuthController.forgotPassword,
);
router.post("/reset-password", AuthController.resetPassword);

export const AuthRoutes = router;
