import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    category: {
      type: String,
      enum: ["Work", "Personal", "Shopping", "Study", "Other"],
      default: "Other",
    },
    dueDate: {
      type: Date,
      required: false,
    },
    reminder: {
      type: Date,
      required: false,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringType: {
      type: String,
      enum: ["daily", "weekly", "monthly", "none"],
      default: "none",
    },
    recurringDay: {
      type: Number, // Day of week (0-6) for weekly, day of month (1-31) for monthly
      required: false,
    },
    parentTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    position: {
      type: Number,
      default: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    googleCalendarEventId: {
      type: String,
    },
    syncedWithCalendar: {
      type: Boolean,
      default: false,
    },
    lastCalendarSyncTime: {
      type: Date,
    },

    subtasks: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        title: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

const Task = mongoose.model("Task", taskSchema);

export default Task;
