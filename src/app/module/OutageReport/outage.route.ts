import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { OutageController } from "./outage.controller";

const router = Router();
//  i will use zod before deployment  validateRequest(OutageValidation.CreateOutageReportZodSchema),
router.post(
  "/reports",
  auth(UserRole.CUSTOMER),
  OutageController.createOutageReport,
);

export const OutageRoutes = router;
