import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";

import { auth } from "../../middleware/checkAuth";

import { OutageController } from "./outage.controller";

const router = Router();

// Customer

router.post(
  "/reports",
  auth(UserRole.CUSTOMER),
  OutageController.createOutageReport,
);

// Field Operator / Zone Manager

router.patch(
  "/:outageId/verify",
  auth(UserRole.FIELD_OPERATOR, UserRole.ZONE_MANAGER),
  OutageController.verifyOutage,
);

router.post(
  "/:outageId/assign",
  auth(UserRole.FIELD_OPERATOR, UserRole.ZONE_MANAGER),
  OutageController.assignTechnician,
);

// Technician
router.patch(
  "/:outageId/start",
  auth(UserRole.FIELD_OPERATOR),
  OutageController.startRepair,
);

router.patch(
  "/:outageId/restore",
  auth(UserRole.FIELD_OPERATOR),
  OutageController.restoreOutage,
);

export const OutageRoutes = router;
