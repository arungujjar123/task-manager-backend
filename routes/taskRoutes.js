// routes/taskRoutes.js
import express from "express";
import Task from "../models/Task.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// ✅ Get all tasks for logged-in user (latest first)
router.get("/", auth, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id, isDeleted: false }).sort(
      { createdAt: -1 }
    );
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Create a new task
router.post("/", auth, async (req, res) => {
  try {
    const {
      title,
      description,
      dueDate,
      status,
      priority,
      reminder,
      category,
      isRecurring,
      recurringType,
      recurringDay,
      subtasks,
    } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required" });
    }

    const task = new Task({
      title,
      description,
      status:
        status && ["pending", "in-progress", "completed"].includes(status)
          ? status
          : "pending",
      priority:
        priority && ["Low", "Medium", "High"].includes(priority)
          ? priority
          : "Medium",
      category:
        category &&
        ["Work", "Personal", "Shopping", "Study", "Other"].includes(category)
          ? category
          : "Other",
      dueDate: dueDate ? new Date(dueDate) : null,
      reminder: reminder ? new Date(reminder) : null,
      isRecurring: isRecurring || false,
      recurringType:
        recurringType &&
        ["daily", "weekly", "monthly", "none"].includes(recurringType)
          ? recurringType
          : "none",
      recurringDay: recurringDay || null,
      isDeleted: false,
      subtasks: subtasks || [],
      user: req.user.id,
    });

    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get single task
router.get("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update task (title/description/status/dueDate/priority/reminder/isDeleted/category/recurring)
router.put("/:id", auth, async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      dueDate,
      priority,
      reminder,
      isDeleted,
      category,
      isRecurring,
      recurringType,
      recurringDay,
      subtasks,
    } = req.body;

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (
      status !== undefined &&
      ["pending", "in-progress", "completed"].includes(status)
    ) {
      task.status = status;
    }
    if (dueDate !== undefined) {
      task.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (
      priority !== undefined &&
      ["Low", "Medium", "High"].includes(priority)
    ) {
      task.priority = priority;
    }
    if (
      category !== undefined &&
      ["Work", "Personal", "Shopping", "Study", "Other"].includes(category)
    ) {
      task.category = category;
    }
    if (reminder !== undefined) {
      task.reminder = reminder ? new Date(reminder) : null;
    }
    if (isDeleted !== undefined) {
      task.isDeleted = isDeleted;
    }
    if (isRecurring !== undefined) {
      task.isRecurring = isRecurring;
    }
    if (
      recurringType !== undefined &&
      ["daily", "weekly", "monthly", "none"].includes(recurringType)
    ) {
      task.recurringType = recurringType;
    }
    if (recurringDay !== undefined) {
      task.recurringDay = recurringDay;
    }

    // Update subtasks if provided
    if (subtasks !== undefined) {
      task.subtasks = subtasks;
    }

    const updated = await task.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Delete task (soft delete)
router.delete("/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Soft delete
    task.isDeleted = true;
    await task.save();
    res.json({ message: "Task removed" });
  } catch (error) {
    res.status(500).json({ message: "server error" });
  }
});

// ✅ Permanently delete task
router.delete("/permanent/:id", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Task permanently removed" });
  } catch (error) {
    res.status(500).json({ message: "server error" });
  }
});

// ✅ Complete a recurring task and create the next occurrence
router.post("/:id/complete", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Mark the current task as completed
    task.status = "completed";
    await task.save();

    // If it's a recurring task, create the next occurrence
    if (task.isRecurring && task.recurringType !== "none") {
      let nextDueDate = null;

      if (task.dueDate) {
        const currentDueDate = new Date(task.dueDate);
        nextDueDate = new Date(currentDueDate);

        // Calculate next due date based on recurring type
        if (task.recurringType === "daily") {
          nextDueDate.setDate(nextDueDate.getDate() + 1);
        } else if (task.recurringType === "weekly") {
          nextDueDate.setDate(nextDueDate.getDate() + 7);
        } else if (task.recurringType === "monthly") {
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);

          // Handle edge cases (e.g., January 31 -> February 28)
          const originalDay = currentDueDate.getDate();
          if (nextDueDate.getDate() !== originalDay) {
            // We've gone to the next month and the day doesn't exist
            // (e.g., trying to create March 31 from February 28)
            // Set to last day of month
            nextDueDate.setDate(0);
          }
        }
      }

      // Create a new task as the next occurrence
      const newTask = new Task({
        title: task.title,
        description: task.description,
        status: "pending",
        priority: task.priority,
        category: task.category,
        dueDate: nextDueDate,
        reminder: task.reminder
          ? calculateNextReminder(task.reminder, task.recurringType)
          : null,
        isRecurring: task.isRecurring,
        recurringType: task.recurringType,
        recurringDay: task.recurringDay,
        parentTaskId: task._id,
        isDeleted: false,
        user: task.user,
      });

      await newTask.save();

      // Return both completed task and new task
      res.json({
        completedTask: task,
        nextTask: newTask,
        message: "Task completed and next recurring task created",
      });
    } else {
      // Non-recurring task, just return the completed task
      res.json({
        completedTask: task,
        message: "Task completed",
      });
    }
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Toggle subtask completion status
router.patch("/:taskId/subtasks/:subtaskId/toggle", auth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Find the subtask
    const subtask = task.subtasks.id(req.params.subtaskId);

    if (!subtask) {
      return res.status(404).json({ message: "Subtask not found" });
    }

    // Toggle completion status
    subtask.completed = !subtask.completed;

    await task.save();

    res.json(task);
  } catch (error) {
    console.error("Error toggling subtask:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Helper function to calculate next reminder date
function calculateNextReminder(currentReminder, recurringType) {
  const nextReminder = new Date(currentReminder);

  if (recurringType === "daily") {
    nextReminder.setDate(nextReminder.getDate() + 1);
  } else if (recurringType === "weekly") {
    nextReminder.setDate(nextReminder.getDate() + 7);
  } else if (recurringType === "monthly") {
    nextReminder.setMonth(nextReminder.getMonth() + 1);

    // Handle edge cases for month end dates
    const originalDay = new Date(currentReminder).getDate();
    if (nextReminder.getDate() !== originalDay) {
      nextReminder.setDate(0); // Last day of previous month
    }
  }

  return nextReminder;
}

// Update task positions (for drag and drop reordering)
router.post("/update-positions", auth, async (req, res) => {
  try {
    const { tasks } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ message: "Invalid data format" });
    }

    // Process each task update in parallel
    const updatePromises = tasks.map(async (taskUpdate) => {
      const { id, status, position } = taskUpdate;

      const task = await Task.findById(id);
      if (!task) return null;

      // Verify user has permission to update this task
      if (task.user.toString() !== req.user.id) return null;

      // Update status and position
      if (status) task.status = status;
      if (position !== undefined) task.position = position;

      return task.save();
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    res.json({ message: "Task positions updated successfully" });
  } catch (error) {
    console.error("Error updating task positions:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
