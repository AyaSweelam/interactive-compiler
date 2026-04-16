const express = require("express");
const http = require("http");
const path = require("path");
const WS = require("ws");
const { v4: uuidv4 } = require("uuid");
const {
  createSession,
  getSession,
  removeSession
} = require("./sessions");

const app = express();
const server = http.createServer(app);
const wss = new WS.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

let runnerSocket = null;

function connectToRunner() {
  runnerSocket = new WS("ws://localhost:5000");

  runnerSocket.on("open", () => {
    console.log("Connected to runner service");
  });

  runnerSocket.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      const clientSocket = getSession(data.sessionId);

      if (clientSocket && clientSocket.readyState === WS.OPEN) {
        clientSocket.send(data.data);
      } else {
        console.log("Session not found or socket closed:", data.sessionId);
      }
    } catch (err) {
      console.log("Error handling runner message:", err.message);
    }
  });

  runnerSocket.on("close", () => {
    console.log("Runner disconnected. Reconnecting in 3 seconds...");
    setTimeout(connectToRunner, 3000);
  });

  runnerSocket.on("error", (err) => {
    console.log("Runner connection error:", err.message);
  });
}

connectToRunner();

wss.on("connection", (ws) => {
  console.log("Frontend client connected");

  const sessionId = uuidv4();
  createSession(sessionId, ws);

  console.log("Session created:", sessionId);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (!data.type) {
        ws.send("Invalid message: missing type\n");
        return;
      }

      const payload = {
        ...data,
        sessionId
      };

      if (runnerSocket && runnerSocket.readyState === WS.OPEN) {
        runnerSocket.send(JSON.stringify(payload));
      } else {
        ws.send("Runner service is not connected.\n");
      }
    } catch (err) {
      ws.send("App Server Error: " + err.message + "\n");
    }
  });

  ws.on("close", () => {
    console.log("Frontend client disconnected:", sessionId);
    removeSession(sessionId);
  });

  ws.on("error", (err) => {
    console.log("Frontend socket error:", err.message);
    removeSession(sessionId);
  });
});

server.listen(3000, () => {
  console.log("App server running on http://localhost:3000");
});