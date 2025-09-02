import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";

dotenv.config();
const app = express();

// CORS - Allow all origins during development
app.use(cors());
app.use(express.json());

// basic health check
app.get("/", (req, res) => res.send("Task Manager API running..."));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);

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
