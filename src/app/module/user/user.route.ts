import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";

import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";
import { userController } from "./user.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.patch("/profile_image",upload.single ("profile_image"), userController.uploadprofileImage);
export const userRoute = router;
