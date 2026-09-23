import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { LoadSheddingController } from "./load-shedding.controller";
import { LoadSheddingValidation } from "./load-shedding.validation";

const router = Router();
router.get(
  "/schedules",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  LoadSheddingController.getSchedules,
);
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
router.get(
  "/schedules/:scheduleId",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  LoadSheddingController.getScheduleById,
);
router.get(
  "/schedules/:scheduleId/slots",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  LoadSheddingController.getScheduleSlots,
);

router.delete(
  "/slots/:slotId",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  LoadSheddingController.deleteScheduleSlot,
);
router.post(
  "/schedules/:scheduleId/submit",
  auth(UserRole.SUPER_ADMIN, UserRole.ZONE_MANAGER),
  LoadSheddingController.submitSchedule,
);
export const LoadSheddingRoutes = router;
