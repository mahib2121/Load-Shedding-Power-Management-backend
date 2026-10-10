import { Router } from "express";
import { AreaController } from "./area.controller";

const router = Router();

router.get("/", AreaController.getAreas);

export const AreaRoutes = router;
