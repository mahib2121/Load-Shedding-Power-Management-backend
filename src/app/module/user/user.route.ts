import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { UserController } from "./user.controller";

const router = Router();

/**
 * Upload / replace the authenticated user's profile image.
 * Multipart form-data, field name: "profileImage"
 */
router.patch(
  "/profile-image",
  auth(
    UserRole.CUSTOMER,
    UserRole.FIELD_OPERATOR,
    UserRole.ZONE_MANAGER,
    UserRole.SUPER_ADMIN,
  ),
  upload.single("profileImage"),
  UserController.uploadProfileImage,
);

export const userRoute = router;
