import { Router } from "express";

import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { PaymentController } from "./pay.controller";

const router = Router();

router.post(
  "/:paymentId/initialize",
  auth(UserRole.CUSTOMER),
  PaymentController.initialPayment,
);

export const PaymentRoutes = router;