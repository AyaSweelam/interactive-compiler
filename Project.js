const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    language: {
      type: String,
      required: true,
      enum: ["python", "javascript", "cpp", "java", "go"],
    },

    code: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

projectSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model("Project", projectSchema);