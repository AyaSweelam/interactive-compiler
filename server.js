const express = require("express");
const http = require("http");
const path = require("path");
const WS = require("ws");
const { v4: uuidv4 } = require("uuid");
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
  setExecutionId
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
const JWT_SECRET = "super_secret_key_change_this";

function generateToken(userId) {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// =======================
// HOME
// =======================
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// =======================
// AUTH - SIGNUP
// =======================
app.post("/api/signup", async (req, res) => {
  try {
    const {
      username,
      email,
      password
    } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    const existingUser =
      await User.findOne({
        $or: [
          { email },
          { username }
        ]
      });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    const user =
      await User.create({
        username,
        email,
        password: hashedPassword
      });

    const token =
      generateToken(user._id);

    res.json({
      message: "Signup successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    res.status(500).json({
      message: "Server error"
    });
  }
});

// =======================
// AUTH - LOGIN
// =======================
app.post("/api/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    const user =
      await User.findOne({
        email
      }).select("+password");

    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    const isMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    const token =
      generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (err) {
    res.status(500).json({
      message: "Server error"
    });
  }
});

// =======================
// EXECUTIONS HISTORY
// =======================
app.get("/api/executions", async (req, res) => {
  try {
    const executions =
      await Execution.find()
        .sort({ createdAt: -1 });

    res.json(executions);

  } catch (err) {
    res.status(500).json({
      error:
        "Failed to fetch executions"
    });
  }
});

// =======================
// PROJECTS API
// =======================

// Create Project
app.post(
  "/api/projects",
  auth,
  async (req, res) => {
    try {
      const {
        name,
        language,
        code
      } = req.body;

      const project =
        await Project.create({
          userId: req.userId,
          name,
          language,
          code: code || ""
        });

      res.json({
        message:
          "Project created successfully",
        project
      });

    } catch (err) {
      res.status(500).json({
        message:
          "Error creating project"
      });
    }
  }
);

// Get My Projects
app.get(
  "/api/projects",
  auth,
  async (req, res) => {
    try {
      const projects =
        await Project.find({
          userId: req.userId
        }).sort({
          createdAt: -1
        });

      res.json(projects);

    } catch (err) {
      res.status(500).json({
        message:
          "Error fetching projects"
      });
    }
  }
);

// Get Single Project
app.get(
  "/api/projects/:id",
  auth,
  async (req, res) => {
    try {
      const project =
        await Project.findOne({
          _id: req.params.id,
          userId: req.userId
        });

      if (!project) {
        return res.status(404).json({
          message:
            "Project not found"
        });
      }

      res.json(project);

    } catch (err) {
      res.status(500).json({
        message:
          "Error loading project"
      });
    }
  }
);

// Save Project
app.put(
  "/api/projects/:id",
  auth,
  async (req, res) => {
    try {
      const {
        name,
        language,
        code
      } = req.body;

      const project =
        await Project.findOneAndUpdate(
          {
            _id: req.params.id,
            userId: req.userId
          },
          {
            name,
            language,
            code
          },
          {
            new: true
          }
        );

      if (!project) {
        return res.status(404).json({
          message:
            "Project not found"
        });
      }

      res.json({
        message:
          "Project saved successfully",
        project
      });

    } catch (err) {
      res.status(500).json({
        message:
          "Server error"
      });
    }
  }
);

// Delete Project
app.delete(
  "/api/projects/:id",
  auth,
  async (req, res) => {
    try {
      const project =
        await Project.findOneAndDelete({
          _id: req.params.id,
          userId: req.userId
        });

      if (!project) {
        return res.status(404).json({
          message:
            "Project not found"
        });
      }

      res.json({
        message:
          "Project deleted"
      });

    } catch (err) {
      res.status(500).json({
        message:
          "Error deleting project"
      });
    }
  }
);

// =======================
// RUNNER CONNECTION
// =======================
let runnerSocket = null;

function connectToRunner() {
  runnerSocket =
    new WS("ws://runner:5000");

  runnerSocket.on(
    "open",
    () => {
      console.log(
        "Connected to runner service"
      );
    }
  );

  runnerSocket.on(
    "message",
    async (msg) => {
      try {
        const data =
          JSON.parse(
            msg.toString()
          );

        const session =
          getSession(
            data.sessionId
          );

        if (
          session &&
          session.ws.readyState ===
            WS.OPEN
        ) {
          session.ws.send(
            data.data
          );

          if (
            session.executionId
          ) {
            await Execution.findByIdAndUpdate(
              session.executionId,
              {
                $push: {
                  output:
                    data.data
                }
              }
            );
          }
        }

      } catch (err) {
        console.log(
          "Runner error:",
          err.message
        );
      }
    }
  );

  runnerSocket.on(
    "close",
    () => {
      console.log(
        "Runner disconnected. Reconnecting..."
      );

      setTimeout(
        connectToRunner,
        3000
      );
    }
  );

  runnerSocket.on(
    "error",
    (err) => {
      console.log(
        "Runner error:",
        err.message
      );
    }
  );
}

connectToRunner();

// =======================
// WEBSOCKET SERVER
// =======================
wss.on(
  "connection",
  (ws) => {
    const sessionId =
      uuidv4();

    createSession(
      sessionId,
      ws
    );

    ws.on(
      "message",
      async (msg) => {
        try {
          const data =
            JSON.parse(
              msg.toString()
            );

          if (!data.type)
            return;

          if (
            data.type === "run"
          ) {
            const execution =
              await Execution.create({
                language:
                  data.language,
                code:
                  data.code,
                output: []
              });

            setExecutionId(
              sessionId,
              execution._id.toString()
            );
          }

          const payload = {
            ...data,
            sessionId
          };

          if (
            runnerSocket &&
            runnerSocket.readyState ===
              WS.OPEN
          ) {
            runnerSocket.send(
              JSON.stringify(
                payload
              )
            );
          } else {
            ws.send(
              "Runner not connected\n"
            );
          }

        } catch (err) {
          ws.send(
            "Server error: " +
            err.message
          );
        }
      }
    );

    ws.on(
      "close",
      () => {
        removeSession(
          sessionId
        );
      }
    );

    ws.on(
      "error",
      () => {
        removeSession(
          sessionId
        );
      }
    );
  }
);

// =======================
// START SERVER
// =======================
server.listen(
  3000,
  () => {
    console.log(
      "App server running on http://localhost:3000"
    );
  }
);