import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/categories.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import publicRoutes from "./routes/public.routes.js";
import hookRoutes from "./routes/hooks.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import exportRoutes from "./routes/exports.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import maintenanceRoutes from "./routes/maintenance.routes.js";

export const app = express();

app.set("trust proxy", 1); // so req.ip is the real client behind the deployment proxy
app.use(cors({ origin: env.corsOrigin }));

// Webhooks are signed over the raw request body, so they are mounted before the
// JSON parser replaces it with an object.
app.use("/api/hooks", hookRoutes);

app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/maintenance", maintenanceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
