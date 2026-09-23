import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { LoadSheddingRoutes } from "./app/module/load-sheddingschedules/load-shedding.route";

const app: Application = express();
app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);
app.use(cookieParser());
app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/load-shedding", LoadSheddingRoutes);
/*
 * Future modules:
 *
 * app.use("/api/v1/users", UserRoutes);
 * app.use("/api/v1/zones", ZoneRoutes);
 * app.use("/api/v1/substations", SubstationRoutes);
 * app.use("/api/v1/feeders", FeederRoutes);
 * app.use("/api/v1/areas", AreaRoutes);
 * app.use("/api/v1/outages", OutageRoutes);
 * app.use("/api/v1/load-shedding", LoadSheddingRoutes);
 * app.use("/api/v1/assignments", AssignmentRoutes);
 * app.use("/api/v1/notifications", NotificationRoutes);
 * app.use("/api/v1/analytics", AnalyticsRoutes);
 * app.use("/api/v1/admin", AdminRoutes);
 */

app.get("/health", (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Load Shedding & Power Management API is running ⚡ Mahib Alam Khan AIUB",
  });
});

app.get("/", (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to Load Shedding & Power Management ⚡ Mahib Alam Khan AIUB CSE",
  });
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;
