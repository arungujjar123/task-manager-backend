// routes/calendarRoutes.js
import express from "express";
import auth from "../middleware/auth.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import googleCalendarService from "../services/googleCalendarService.js";

const router = express.Router();

// Get Google OAuth URL for authorization
router.get("/auth-url", auth, async (req, res) => {
  try {
    const authUrl = googleCalendarService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Handle OAuth callback after user authorizes the app
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const userId = state; // We'll pass the user ID in the state parameter

  if (!code) {
    return res.status(400).json({ message: "Authorization code is required" });
  }

  try {
    // Exchange code for tokens
    const tokens = await googleCalendarService.getTokens(code);

    // Find user and update tokens
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Save tokens to user profile
    user.googleCalendarIntegration = {
      enabled: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expiry_date),
    };

    await user.save();

    // Redirect to frontend settings page
    res.redirect(`${process.env.FRONTEND_URL}/settings?calendar=connected`);
  } catch (error) {
    console.error("Error handling OAuth callback:", error);
    res.status(500).json({ message: "Failed to connect Google Calendar" });
  }
});

// Connect user account to Google Calendar
router.post("/connect", auth, async (req, res) => {
  try {
    // Generate state parameter with user ID for security
    const state = req.user.id;

    // Generate auth URL with state
    const authUrl = googleCalendarService.getAuthUrl(state);

    res.json({ authUrl });
  } catch (error) {
    console.error("Error connecting to Google Calendar:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Disconnect Google Calendar
router.post("/disconnect", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Clear Google Calendar integration data
    user.googleCalendarIntegration = {
      enabled: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
    };

    await user.save();

    // Also clear googleCalendarEventId from all tasks
    await Task.updateMany(
      { user: req.user.id },
      {
        $unset: {
          googleCalendarEventId: "",
          syncedWithCalendar: "",
          lastCalendarSyncTime: "",
        },
      }
    );

    res.json({ message: "Google Calendar disconnected successfully" });
  } catch (error) {
    console.error("Error disconnecting Google Calendar:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Sync a specific task to Google Calendar
router.post("/sync/task/:id", auth, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Get task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check task belongs to user
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Get user with Google Calendar tokens
    const user = await User.findById(req.user.id);
    if (
      !user.googleCalendarIntegration ||
      !user.googleCalendarIntegration.enabled
    ) {
      return res.status(400).json({ message: "Google Calendar not connected" });
    }

    // Check if tokens are expired and need refresh
    const now = new Date();
    const tokenExpiry = user.googleCalendarIntegration.tokenExpiry
      ? new Date(user.googleCalendarIntegration.tokenExpiry)
      : null;
    const isTokenExpired = tokenExpiry && tokenExpiry < now;

    if (isTokenExpired && !user.googleCalendarIntegration.refreshToken) {
      return res
        .status(401)
        .json({
          message:
            "Google Calendar access has expired. Please reconnect your account.",
        });
    }

    const tokens = {
      access_token: user.googleCalendarIntegration.accessToken,
      refresh_token: user.googleCalendarIntegration.refreshToken,
      expiry_date: user.googleCalendarIntegration.tokenExpiry
        ? new Date(user.googleCalendarIntegration.tokenExpiry).getTime()
        : null,
    };

    // Set up token refresh callback to update the database
    const handleTokenRefresh = async (refreshedTokens) => {
      console.log("Refreshing Google Calendar tokens");

      try {
        user.googleCalendarIntegration.accessToken =
          refreshedTokens.access_token;

        if (refreshedTokens.refresh_token) {
          user.googleCalendarIntegration.refreshToken =
            refreshedTokens.refresh_token;
        }

        if (refreshedTokens.expiry_date) {
          user.googleCalendarIntegration.tokenExpiry = new Date(
            refreshedTokens.expiry_date
          );
        }

        await user.save();
        console.log("Updated user with refreshed tokens");
      } catch (error) {
        console.error("Failed to update refreshed tokens:", error);
      }
    };

    let result;

    // If task is already synced, update the event
    if (task.googleCalendarEventId) {
      result = await googleCalendarService.updateCalendarEvent(
        tokens,
        task,
        task.googleCalendarEventId
      );
      task.lastCalendarSyncTime = new Date();
    } else {
      // Create new event
      result = await googleCalendarService.createCalendarEvent(tokens, task);
      task.googleCalendarEventId = result.id;
      task.syncedWithCalendar = true;
      task.lastCalendarSyncTime = new Date();
    }

    await task.save();

    res.json({
      message: "Task synced to Google Calendar",
      eventId: result.id,
      task,
    });
  } catch (error) {
    console.error("Error syncing task to Google Calendar:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Sync all tasks to Google Calendar
router.post("/sync/all", auth, async (req, res) => {
  try {
    // Get user with Google Calendar tokens
    const user = await User.findById(req.user.id);
    if (
      !user.googleCalendarIntegration ||
      !user.googleCalendarIntegration.enabled
    ) {
      return res.status(400).json({ message: "Google Calendar not connected" });
    }

    const tokens = {
      access_token: user.googleCalendarIntegration.accessToken,
      refresh_token: user.googleCalendarIntegration.refreshToken,
    };

    // Get all non-deleted tasks for user
    const tasks = await Task.find({
      user: req.user.id,
      isDeleted: false,
    });

    // Sync tasks to Google Calendar
    const results = await googleCalendarService.syncTasksToCalendar(
      tokens,
      tasks
    );

    // Update tasks with event IDs
    for (const result of results) {
      if (result.action === "created" || result.action === "updated") {
        await Task.findByIdAndUpdate(result.taskId, {
          googleCalendarEventId: result.eventId,
          syncedWithCalendar: true,
          lastCalendarSyncTime: new Date(),
        });
      } else if (result.action === "deleted") {
        await Task.findByIdAndUpdate(result.taskId, {
          googleCalendarEventId: null,
          syncedWithCalendar: false,
          lastCalendarSyncTime: new Date(),
        });
      }
    }

    res.json({
      message: "All tasks synced to Google Calendar",
      syncResults: results,
    });
  } catch (error) {
    console.error("Error syncing all tasks to Google Calendar:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update user Google Calendar settings
router.put("/settings", auth, async (req, res) => {
  try {
    const { syncTasksToCalendar, calendarSyncFrequency } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Initialize settings object if it doesn't exist
    if (!user.settings) {
      user.settings = {};
    }

    // Update settings
    if (syncTasksToCalendar !== undefined) {
      user.settings.syncTasksToCalendar = syncTasksToCalendar;
    }

    if (calendarSyncFrequency) {
      user.settings.calendarSyncFrequency = calendarSyncFrequency;
    }

    await user.save();

    res.json({
      message: "Calendar settings updated",
      settings: user.settings,
    });
  } catch (error) {
    console.error("Error updating calendar settings:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's Google Calendar connection status and settings
router.get("/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if credentials are properly configured
    const envVarsConfigured =
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

    // Check if tokens are valid (not expired)
    let tokensValid = false;
    if (
      user.googleCalendarIntegration &&
      user.googleCalendarIntegration.enabled
    ) {
      tokensValid =
        user.googleCalendarIntegration.tokenExpiry &&
        new Date(user.googleCalendarIntegration.tokenExpiry) > new Date();
    }

    res.json({
      connected:
        user.googleCalendarIntegration &&
        user.googleCalendarIntegration.enabled &&
        tokensValid,
      envConfigured: envVarsConfigured,
      tokenStatus: tokensValid ? "valid" : "invalid",
      settings: user.settings || {
        syncTasksToCalendar: false,
        calendarSyncFrequency: "manual",
      },
    });
  } catch (error) {
    console.error("Error getting calendar status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Remove a task from Google Calendar
router.delete("/sync/task/:id", auth, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Get task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check task belongs to user
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Check if task is synced with calendar
    if (!task.googleCalendarEventId) {
      return res
        .status(400)
        .json({ message: "Task is not synced with Google Calendar" });
    }

    // Get user with Google Calendar tokens
    const user = await User.findById(req.user.id);
    if (
      !user.googleCalendarIntegration ||
      !user.googleCalendarIntegration.enabled
    ) {
      return res.status(400).json({ message: "Google Calendar not connected" });
    }

    const tokens = {
      access_token: user.googleCalendarIntegration.accessToken,
      refresh_token: user.googleCalendarIntegration.refreshToken,
    };

    // Delete event from Google Calendar
    await googleCalendarService.deleteCalendarEvent(
      tokens,
      task.googleCalendarEventId
    );

    // Update task
    task.googleCalendarEventId = null;
    task.syncedWithCalendar = false;
    task.lastCalendarSyncTime = new Date();
    await task.save();

    res.json({
      message: "Task removed from Google Calendar",
      task,
    });
  } catch (error) {
    console.error("Error removing task from Google Calendar:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
