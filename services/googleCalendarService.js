// services/googleCalendarService.js
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

// Check for required environment variables
const requiredEnvVars = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "REDIRECT_URI",
  "FRONTEND_URL",
];

// Verify environment variables are set
const envConfigured = requiredEnvVars.every(
  (varName) => !!process.env[varName]
);

// Create OAuth2 client
const oauth2Client = envConfigured
  ? new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    )
  : null;

// Scope for Google Calendar
const SCOPES = ["https://www.googleapis.com/auth/calendar"];

const googleCalendarService = {
  // Check if the environment is properly configured
  isConfigured: () => {
    return envConfigured;
  },

  // Generate OAuth authorization URL
  getAuthUrl: (state = "") => {
    if (!oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      state: state,
      prompt: "consent", // Force to get refresh token
    });
  },

  // Exchange authorization code for tokens
  getTokens: async (code) => {
    if (!oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  },

  // Set credentials for OAuth client
  setCredentials: (tokens) => {
    if (!oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    oauth2Client.setCredentials(tokens);
    return oauth2Client;
  },

  // Verify token validity and refresh if needed
  refreshTokens: async (tokens) => {
    if (!oauth2Client) {
      throw new Error("Google OAuth client not configured");
    }

    // Set the credentials to verify and possibly refresh
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.tokenExpiry
        ? new Date(tokens.tokenExpiry).getTime()
        : 0,
    });

    // Check if token needs refreshing
    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || tokens.refreshToken, // Keep old refresh token if not provided
        tokenExpiry: new Date(Date.now() + credentials.expiry_date),
      };
    }

    return tokens;
  },

  // Create a calendar event for a task
  createCalendarEvent: async (tokens, task) => {
    // Set up auth with user's tokens
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: tokens.access_token || tokens.accessToken,
      refresh_token: tokens.refresh_token || tokens.refreshToken,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth });

    // Determine end time (1 hour after start by default)
    const startTime = task.dueDate ? new Date(task.dueDate) : new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Add 1 hour

    const event = {
      summary: task.title,
      description: task.description || "",
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "UTC",
      },
      reminders: {
        useDefault: true,
      },
      colorId: getColorIdByPriority(task.priority),
    };

    try {
      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });
      return result.data;
    } catch (error) {
      console.error("Error creating calendar event:", error);
      throw error;
    }
  },

  // Update an existing calendar event
  updateCalendarEvent: async (tokens, task, eventId) => {
    // Set up auth with user's tokens
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: tokens.access_token || tokens.accessToken,
      refresh_token: tokens.refresh_token || tokens.refreshToken,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth });

    // Determine end time (1 hour after start by default)
    const startTime = task.dueDate ? new Date(task.dueDate) : new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Add 1 hour

    const event = {
      summary: task.title,
      description: task.description || "",
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "UTC",
      },
      colorId: getColorIdByPriority(task.priority),
    };

    try {
      const result = await calendar.events.update({
        calendarId: "primary",
        eventId: eventId,
        resource: event,
      });
      return result.data;
    } catch (error) {
      console.error("Error updating calendar event:", error);
      throw error;
    }
  },

  // Delete a calendar event
  deleteCalendarEvent: async (tokens, eventId) => {
    // Set up auth with user's tokens
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: tokens.access_token || tokens.accessToken,
      refresh_token: tokens.refresh_token || tokens.refreshToken,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth });

    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
      });
      return true;
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      throw error;
    }
  },

  // List upcoming events from the user's calendar
  listEvents: async (tokens, maxResults = 10) => {
    // Set up auth with user's tokens
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: tokens.access_token || tokens.accessToken,
      refresh_token: tokens.refresh_token || tokens.refreshToken,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth });

    try {
      const result = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });
      return result.data.items;
    } catch (error) {
      console.error("Error listing calendar events:", error);
      throw error;
    }
  },

  // Sync multiple tasks to Google Calendar
  syncTasksToCalendar: async (tokens, tasks) => {
    // Set up auth with user's tokens
    const auth = oauth2Client;
    auth.setCredentials({
      access_token: tokens.access_token || tokens.accessToken,
      refresh_token: tokens.refresh_token || tokens.refreshToken,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth });
    const results = [];

    for (const task of tasks) {
      try {
        // Skip tasks without due dates
        if (!task.dueDate) {
          results.push({
            taskId: task._id,
            action: "skipped",
            reason: "No due date",
          });
          continue;
        }

        // If task already has a calendar event
        if (task.googleCalendarEventId) {
          // Try to update the event
          try {
            const result = await googleCalendarService.updateCalendarEvent(
              tokens,
              task,
              task.googleCalendarEventId
            );

            results.push({
              taskId: task._id,
              action: "updated",
              eventId: result.id,
            });
          } catch (error) {
            // If event doesn't exist anymore, create a new one
            if (error.code === 404) {
              const result = await googleCalendarService.createCalendarEvent(
                tokens,
                task
              );

              results.push({
                taskId: task._id,
                action: "created",
                eventId: result.id,
                note: "Original event not found, created new one",
              });
            } else {
              throw error;
            }
          }
        } else {
          // Create a new event
          const result = await googleCalendarService.createCalendarEvent(
            tokens,
            task
          );

          results.push({
            taskId: task._id,
            action: "created",
            eventId: result.id,
          });
        }
      } catch (error) {
        console.error(
          `Error syncing task ${task._id} to Google Calendar:`,
          error
        );
        results.push({
          taskId: task._id,
          action: "error",
          error: error.message,
        });
      }
    }

    return results;
  },
};

// Helper function to map task priority to Google Calendar color IDs
function getColorIdByPriority(priority) {
  switch (priority) {
    case "high":
      return "11"; // Red
    case "medium":
      return "5"; // Yellow
    case "low":
      return "7"; // Blue
    default:
      return "1"; // Default blue
  }
}

export default googleCalendarService;
