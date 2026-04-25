const mongoose = require("mongoose");

const executionSchema = new mongoose.Schema(
  {
    language: {
      type: String,
      required: true
    },
    code: {
      type: String,
      required: true
    },
    output: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Execution", executionSchema);