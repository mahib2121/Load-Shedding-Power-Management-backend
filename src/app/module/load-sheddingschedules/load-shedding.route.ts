import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { LoadSheddingController } from "./load-shedding.controller";
import { LoadSheddingValidation } from "./load-shedding.validation";

const router = Router();

router.post(
  "/schedules",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  validateRequest(LoadSheddingValidation.CreateScheduleZodSchema),
  LoadSheddingController.createSchedule,
);
router.post(
  "/schedules/:scheduleId/slots",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  validateRequest(LoadSheddingValidation.CreateScheduleSlotZodSchema),
  LoadSheddingController.createScheduleSlot,
);

export const LoadSheddingRoutes = router;
