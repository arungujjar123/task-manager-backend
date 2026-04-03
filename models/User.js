import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    googleCalendarIntegration: {
      enabled: { type: Boolean, default: false },
      accessToken: { type: String },
      refreshToken: { type: String },
      tokenExpiry: { type: Date },
    },
    settings: {},
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

export default User;
