const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect("mongodb://mongo:27017/interactive_compiler");
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
}

module.exports = connectDB;