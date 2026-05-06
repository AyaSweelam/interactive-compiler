const mongoose = require("mongoose");

const executionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    language: {
      type: String,
      required: true,
      enum: ["python", "javascript", "cpp", "java", "go"],
    },

    code: {
      type: String,
      required: true,
    },

    output: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

executionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Execution", executionSchema);