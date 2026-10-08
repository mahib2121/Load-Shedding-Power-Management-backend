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
router.post("/ipn", PaymentController.ipn);

router.get(
  "/my-payments",
  auth(UserRole.CUSTOMER),
  PaymentController.getMyPayments,
);

export const PaymentRoutes = router;