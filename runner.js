const WebSocket = require("ws");
const { spawn } = require("child_process");

const wss = new WebSocket.Server({ port: 5000 });

console.log("Runner service running on ws://localhost:5000");

// =======================
// PRE-PULL DOCKER IMAGES
// =======================
const IMAGES = [
  "python:3.10",
  "node:20",
  "gcc:13",
  "eclipse-temurin:17-jdk",
  "golang:1.20-bullseye",
];

async function prePullImages() {
  console.log("Pre-pulling Docker images for faster execution...");

  for (const image of IMAGES) {
    await new Promise((resolve) => {
      console.log(`  Pulling ${image}...`);
      const p = spawn("docker", ["pull", image], { stdio: "ignore" });
      p.on("close", (code) => {
        if (code === 0) {
          console.log(`  ✓ ${image} ready`);
        } else {
          console.warn(`  ✗ Failed to pull ${image}`);
        }
        resolve();
      });
      p.on("error", () => resolve());
    });
  }

  console.log("All images ready — runner is warmed up!");
}

prePullImages();

// =======================
// FORCE KILL
// =======================
function forceKillProcess(entry) {
  if (!entry || !entry.process) return;
  try {
    entry.process.kill();
  } catch (_) {}
}

// =======================
// NOISE FILTER
// =======================
const DOCKER_NOISE = [
  "Unable to find image",
  "Pulling from",
  "Pulling fs layer",
  "Waiting",
  "Verifying Checksum",
  "Download complete",
  "Already exists",
  "Pull complete",
  "Digest:",
  "Status:",
  "Downloaded newer image",
  "See 'docker run --help'",
  "Pulling",
  "Download",
  "extracting",
  "layer",
  "sha256:",
  "library/",
  "docker.io/",
];

function isRealOutput(text) {
  if (!text || !text.trim()) return false;
  return !DOCKER_NOISE.some((item) => text.includes(item));
}

// =======================
// BUFFERED OUTPUT (16ms flush — ~60fps)
// =======================
function createOutputBuffer(ws, sessionId) {
  let buffer = "";
  let flushTimer = null;

  function flush() {
    if (!buffer) return;
    if (isRealOutput(buffer)) {
      ws.send(JSON.stringify({ sessionId, data: buffer }));
    }
    buffer = "";
    flushTimer = null;
  }

  function write(text) {
    buffer += text;
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 16);
    }
  }

  function flushNow() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  }

  return { write, flushNow };
}

// =======================
// COMMON DOCKER FLAGS
// =======================
const COMMON_FLAGS = [
  "-i",
  "--rm",
  "--network",
  "none",
  "--memory",
  "256m",
  "--cpus",
  "1",
  "--pids-limit",
  "128",
  "--stop-timeout",
  "5",
  "--ulimit",
  "cpu=30:30",
  "--read-only",
];

function codeToBase64(code) {
  return Buffer.from(String(code ?? ""), "utf8").toString("base64");
}
// =======================
// BUILD DOCKER PROCESS
// =======================
function buildDockerProcess(language, code) {
  if (language === "python") {
    return spawn(
      "docker",
      [
        "run",
        ...COMMON_FLAGS,
        "--tmpfs",
        "/tmp",
        "python:3.10",
        "python",
        "-u",
        "-c",
        code,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }

  if (language === "javascript") {
    return spawn(
      "docker",
      [
        "run",
        ...COMMON_FLAGS,
        "--tmpfs",
        "/tmp:exec",
        "node:20",
        "node",
        "-e",
        code,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }

  if (language === "cpp") {
    const sourceB64 = codeToBase64(code);

    return spawn(
      "docker",
      [
        "run",
        ...COMMON_FLAGS,
        "--tmpfs",
        "/work:exec,mode=1777",
        "gcc:13",
        "sh",
        "-c",
        `cd /work && \
printf '%s' '${sourceB64}' | base64 -d > main.cpp && \
g++ main.cpp -o main && chmod +x main && ./main`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }

  if (language === "java") {
    const sourceB64 = codeToBase64(code);

    return spawn(
      "docker",
      [
        "run",
        ...COMMON_FLAGS,
        "--tmpfs",
        "/work:exec,mode=1777",
        "-e",
        "HOME=/work",
        "eclipse-temurin:17-jdk",
        "sh",
        "-c",
        `cd /work && \
printf '%s' '${sourceB64}' | base64 -d > Main.java && \
javac Main.java && java Main`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }

  if (language === "go") {
    const sourceB64 = codeToBase64(code);

    return spawn(
      "docker",
      [
        "run",
        ...COMMON_FLAGS,
        "--tmpfs",
        "/work:exec,mode=1777",
        "--tmpfs",
        "/tmp:exec,mode=1777",
        "golang:1.20-bullseye",
        "bash",
        "-lc",
        `export PATH=/usr/local/go/bin:$PATH && \
export HOME=/work && \
export TMPDIR=/work && \
export GOCACHE=/work/.cache && \
mkdir -p /work/.cache && \
cd /work && \
printf '%s' '${sourceB64}' | base64 -d > main.go && \
go build -o main main.go && ./main`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  }

  return null;
}

// =======================
// WEBSOCKET SERVER
// =======================
wss.on("connection", (ws) => {
  console.log("App server connected to runner");

  const processes = new Map();

  ws.on("message", (msg) => {
    let sessionId = "unknown";

    try {
      const data = JSON.parse(msg.toString());
      sessionId = data.sessionId;
      const { type, code, language, input, closeStdin = false } = data;

      if (!sessionId) {
        ws.send(
          JSON.stringify({
            sessionId: "unknown",
            data: "Runner Error: Missing sessionId\n",
          }),
        );
        return;
      }

      // =======================
      // RUN
      // =======================
      if (type === "run") {
        if (processes.has(sessionId)) {
          const oldEntry = processes.get(sessionId);
          oldEntry.reason = "replaced";
          oldEntry.outputBuffer.flushNow();
          forceKillProcess(oldEntry);
          processes.delete(sessionId);
        }

        const process = buildDockerProcess(language, code);

        if (!process) {
          ws.send(
            JSON.stringify({ sessionId, data: "Language not supported yet\n" }),
          );
          return;
        }

        const outputBuffer = createOutputBuffer(ws, sessionId);

        const entry = {
          process,
          reason: "running",
          timeoutId: null,
          outputBuffer,
          stdinClosed: false,
        };

        processes.set(sessionId, entry);

        entry.timeoutId = setTimeout(() => {
          const current = processes.get(sessionId);
          if (!current) return;
          current.reason = "timeout";
          current.outputBuffer.flushNow();
          forceKillProcess(current);
          ws.send(
            JSON.stringify({ sessionId, data: "\n[Process timed out]\n" }),
          );
        }, 30000);

        process.stdout.on("data", (chunk) => {
          outputBuffer.write(chunk.toString());
        });

        process.stderr.on("data", (chunk) => {
          outputBuffer.write(chunk.toString());
        });

        process.on("error", (err) => {
          clearTimeout(entry.timeoutId);
          outputBuffer.flushNow();
          ws.send(
            JSON.stringify({
              sessionId,
              data: "Runner spawn error: " + err.message + "\n",
            }),
          );
          processes.delete(sessionId);
        });

        process.on("close", () => {
          clearTimeout(entry.timeoutId);
          outputBuffer.flushNow();

          const current = processes.get(sessionId);
          const reason = current ? current.reason : entry.reason;

          if (reason === "running") {
            ws.send(
              JSON.stringify({ sessionId, data: "\n[Process finished]\n" }),
            );
          } else if (reason === "stop") {
            ws.send(
              JSON.stringify({ sessionId, data: "\n[Process stopped]\n" }),
            );
          }

          processes.delete(sessionId);
        });

        // =======================
        // INPUT
        // =======================
      } else if (type === "input") {
        const entry = processes.get(sessionId);

        if (!entry) {
          ws.send(
            JSON.stringify({
              sessionId,
              data: "[No running process]\n",
            }),
          );
          return;
        }

        if (entry.stdinClosed || entry.process.stdin.destroyed) {
          ws.send(
            JSON.stringify({
              sessionId,
              data: "[stdin already closed]\n",
            }),
          );
          return;
        }

        try {
          entry.process.stdin.write(String(input ?? "") + "\n");

          if (closeStdin) {
            entry.process.stdin.end();
            entry.stdinClosed = true;
          }
        } catch (err) {
          ws.send(
            JSON.stringify({
              sessionId,
              data: "[stdin error] " + err.message + "\n",
            }),
          );
        }
        // =======================
        // EOF
        // =======================
      } else if (type === "eof" || type === "EOF") {
        const entry = processes.get(sessionId);

        if (!entry) {
          ws.send(
            JSON.stringify({
              sessionId,
              data: "[No running process]\n",
            }),
          );
          return;
        }

        if (!entry.stdinClosed && !entry.process.stdin.destroyed) {
          entry.process.stdin.end();
          entry.stdinClosed = true;
        }

        // =======================
        // STOP
        // =======================
      } else if (type === "stop") {
        const entry = processes.get(sessionId);
        if (entry) {
          entry.reason = "stop";
          entry.outputBuffer.flushNow();
          forceKillProcess(entry);
        } else {
          ws.send(
            JSON.stringify({
              sessionId,
              data: "[No running process to stop]\n",
            }),
          );
        }
      } else {
        ws.send(
          JSON.stringify({
            sessionId,
            data: "Runner Error: Unknown message type\n",
          }),
        );
      }
    } catch (err) {
      ws.send(
        JSON.stringify({
          sessionId,
          data: "Runner Error: " + err.message + "\n",
        }),
      );
    }
  });

  ws.on("close", () => {
    console.log("App server disconnected from runner");
    for (const [, entry] of processes) {
      entry.outputBuffer.flushNow();
      forceKillProcess(entry);
      clearTimeout(entry.timeoutId);
    }
    processes.clear();
  });
});