import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";

dotenv.config();
const app = express();

// CORS configuration for Vercel
const allowedOrigins = new Set([
  "https://task-manager-frontend-yxlx.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("/*path", cors(corsOptions));

// Ensure preflight requests always return OK before auth/routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json());

// basic health check
app.get("/", (req, res) => res.send("Task Manager API running..."));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/calendar", calendarRoutes);

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log("Available routes:");
      console.log(`- GET / - Health check`);
      console.log(`- POST /api/auth/login - Login`);
      console.log(`- POST /api/auth/register - Register`);
      console.log(`- GET /api/tasks - Get all tasks`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
