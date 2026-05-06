require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const WS = require("ws");
const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const connectDB = require("./db");
const Execution = require("./Execution");
const User = require("./User");
const Project = require("./Project");
const auth = require("./middleware/auth");

const {
  createSession,
  getSession,
  removeSession,
  setExecutionId,
} = require("./sessions");

const app = express();
const server = http.createServer(app);
const wss = new WS.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =======================
// DB
// =======================
connectDB();

// =======================
// JWT CONFIG
// =======================
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set in environment variables");
  process.exit(1);
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

// =======================
// VALIDATION HELPERS
// =======================
const SUPPORTED_LANGUAGES = ["python", "javascript", "cpp", "java", "go"];

function validateLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

// =======================
// OUTPUT LIMIT
// =======================
const MAX_OUTPUT_CHARS = 100_000; // 100 KB-ish per execution

const outputState = new Map();

function resetOutputLimit(sessionId) {
  outputState.set(sessionId, {
    chars: 0,
    truncated: false,
  });
}

function cleanupOutputLimit(sessionId) {
  outputState.delete(sessionId);
}

function isProcessStatusMessage(text) {
  return (
    text.includes("[Process finished]") ||
    text.includes("[Process stopped]") ||
    text.includes("[Process timed out]") ||
    text.includes("Runner spawn error")
  );
}

function limitOutput(sessionId, rawText) {
  const text = String(rawText ?? "");

  // Always allow runner status messages
  if (isProcessStatusMessage(text)) {
    return {
      text,
      truncatedNow: false,
      shouldStore: true,
    };
  }

  let state = outputState.get(sessionId);

  if (!state) {
    state = {
      chars: 0,
      truncated: false,
    };
    outputState.set(sessionId, state);
  }

  // Already reached limit: ignore more user output
  if (state.truncated) {
    return {
      text: "",
      truncatedNow: false,
      shouldStore: false,
    };
  }

  const remaining = MAX_OUTPUT_CHARS - state.chars;

  if (remaining <= 0) {
    state.truncated = true;

    return {
      text: "\n[Output truncated: output limit reached]\n",
      truncatedNow: true,
      shouldStore: true,
    };
  }

  if (text.length <= remaining) {
    state.chars += text.length;

    return {
      text,
      truncatedNow: false,
      shouldStore: true,
    };
  }

  const kept = text.slice(0, remaining);
  state.chars = MAX_OUTPUT_CHARS;
  state.truncated = true;

  return {
    text: kept + "\n[Output truncated: output limit reached]\n",
    truncatedNow: true,
    shouldStore: true,
  };
}

// =======================
// HOME
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =======================
// AUTH - SIGNUP
// =======================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (username.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.trim() }],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      message: "Signup successful",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// AUTH - LOGIN
// =======================
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// EXECUTIONS HISTORY (protected — own executions only)
// =======================
app.get("/api/executions", auth, async (req, res) => {
  try {
    const executions = await Execution.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(executions);
  } catch (err) {
    console.error("Executions error:", err.message);
    res.status(500).json({ error: "Failed to fetch executions" });
  }
});

// =======================
// PROJECTS API
// =======================

// Create Project
app.post("/api/projects", auth, async (req, res) => {
  try {
    const { name, language, code } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Project name is required" });
    }

    if (name.trim().length > 100) {
      return res
        .status(400)
        .json({ message: "Project name too long (max 100 characters)" });
    }

    if (!language || !validateLanguage(language)) {
      return res.status(400).json({ message: "Invalid language" });
    }

    const project = await Project.create({
      userId: req.userId,
      name: name.trim(),
      language,
      code: code || "",
    });

    res.status(201).json({ message: "Project created successfully", project });
  } catch (err) {
    console.error("Create project error:", err.message);
    res.status(500).json({ message: "Error creating project" });
  }
});

// Get My Projects
app.get("/api/projects", auth, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.userId }).sort({
      createdAt: -1,
    });
    res.json(projects);
  } catch (err) {
    console.error("Fetch projects error:", err.message);
    res.status(500).json({ message: "Error fetching projects" });
  }
});

// Get Single Project
app.get("/api/projects/:id", auth, async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (err) {
    console.error("Get project error:", err.message);
    res.status(500).json({ message: "Error loading project" });
  }
});

// Save Project
app.put("/api/projects/:id", auth, async (req, res) => {
  try {
    const { name, language, code } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Project name is required" });
    }

    if (name.trim().length > 100) {
      return res
        .status(400)
        .json({ message: "Project name too long (max 100 characters)" });
    }

    if (!language || !validateLanguage(language)) {
      return res.status(400).json({ message: "Invalid language" });
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { name: name.trim(), language, code },
      { new: true },
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project saved successfully", project });
  } catch (err) {
    console.error("Save project error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Project
app.delete("/api/projects/:id", auth, async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error("Delete project error:", err.message);
    res.status(500).json({ message: "Error deleting project" });
  }
});

// =======================
// RUNNER CONNECTION
// =======================
let runnerSocket = null;

function connectToRunner() {
  runnerSocket = new WS("ws://runner:5000");

  runnerSocket.on("open", () => {
    console.log("Connected to runner service");
  });

  runnerSocket.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      const session = getSession(data.sessionId);

      if (!session || session.ws.readyState !== WS.OPEN) return;

      const limited = limitOutput(data.sessionId, data.data);

      if (!limited.text) return;

      // Send limited output to browser
      session.ws.send(limited.text);

      // Save limited output to MongoDB
      if (session.executionId && limited.shouldStore) {
        await Execution.findByIdAndUpdate(session.executionId, {
          $push: { output: limited.text },
        });
      }

      // Stop the running process if it printed too much
      if (
        limited.truncatedNow &&
        runnerSocket &&
        runnerSocket.readyState === WS.OPEN
      ) {
        runnerSocket.send(
          JSON.stringify({
            type: "stop",
            sessionId: data.sessionId,
          }),
        );
      }
    } catch (err) {
      console.log("Runner message error:", err.message);
    }
  });

  runnerSocket.on("close", () => {
    console.log("Runner disconnected. Reconnecting in 3s...");
    setTimeout(connectToRunner, 3000);
  });

  runnerSocket.on("error", (err) => {
    console.log("Runner error:", err.message);
  });
}

connectToRunner();

// =======================
// WEBSOCKET SERVER
// =======================
wss.on("connection", (ws) => {
  const sessionId = randomUUID();
  createSession(sessionId, ws);

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (!data.type) return;

      function getUserIdFromToken(token) {
        if (!token) return null;

        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          return decoded.userId;
        } catch {
          return null;
        }
      }

      if (data.type === "run") {
        resetOutputLimit(sessionId);
        if (!data.language || !validateLanguage(data.language)) {
          ws.send("Unsupported language\n");
          return;
        }

        if (!data.code || !data.code.trim()) {
          ws.send("No code provided\n");
          return;
        }

        const userId = getUserIdFromToken(data.token);

        const execution = await Execution.create({
          userId,
          language: data.language,
          code: data.code,
          output: [],
        });

        setExecutionId(sessionId, execution._id.toString());
      }

      const payload = { ...data, sessionId };

      if (runnerSocket && runnerSocket.readyState === WS.OPEN) {
        runnerSocket.send(JSON.stringify(payload));
      } else {
        ws.send("Runner not connected\n");
      }
    } catch (err) {
      ws.send("Server error: " + err.message);
    }
  });

  ws.on("close", () => {
    cleanupOutputLimit(sessionId);
    removeSession(sessionId);
  });

  ws.on("error", () => {
    cleanupOutputLimit(sessionId);
    removeSession(sessionId);
  });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`App server running on http://localhost:${PORT}`);
});