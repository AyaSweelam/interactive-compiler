const WebSocket = require("ws");
const { spawn } = require("child_process");

const wss = new WebSocket.Server({ port: 5000 });

console.log("Runner service running on ws://localhost:5000");

function getContainerName(sessionId) {
  return `runner_${sessionId.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
}

function forceRemoveContainer(sessionId) {
  const containerName = getContainerName(sessionId);
  const killer = spawn("docker", ["rm", "-f", containerName]);

  killer.on("error", () => {});
}

function buildDockerProcess(sessionId, language, code) {
  const containerName = getContainerName(sessionId);

  if (language === "python") {
    return spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "python:3.10",
        "python",
        "-u",
        "-c",
        code
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  if (language === "javascript") {
    return spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--read-only",
        "--tmpfs",
        "/tmp:exec",
        "node:20",
        "node",
        "-e",
        code
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  if (language === "cpp") {
    return spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--read-only",
        "--tmpfs",
        "/work:exec,mode=1777",
        "gcc:13",
        "sh",
        "-c",
        `cd /work && cat > main.cpp <<'EOF'
${code}
EOF
g++ main.cpp -o main && chmod +x main && ./main`
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  if (language === "java") {
    return spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--read-only",
        "--tmpfs",
        "/work:exec,mode=1777",
        "-e",
        "HOME=/work",
        "openjdk:17",
        "sh",
        "-c",
        `cd /work && cat > Main.java <<'EOF'
${code}
EOF
javac Main.java && java Main`
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  if (language === "go") {
    return spawn(
      "docker",
      [
        "run",
        "-i",
        "--rm",
        "--name",
        containerName,
        "--network",
        "none",
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--read-only",
        "--tmpfs",
        "/work:exec,mode=1777",
        "golang:1.20",
        "sh",
        "-c",
        `export HOME=/work
export TMPDIR=/work
export GOCACHE=/work/.cache
export GOMODCACHE=/work/pkg/mod
cd /work
cat > main.go <<'EOF'
${code}
EOF
go run main.go`
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
  }

  return null;
}

wss.on("connection", (ws) => {
  console.log("App server connected to runner");

  const processes = new Map();

  ws.on("message", (msg) => {
    let sessionId = "unknown";

    try {
      const data = JSON.parse(msg.toString());
      sessionId = data.sessionId;

      const { type, code, language, input } = data;

      if (!sessionId) {
        ws.send(JSON.stringify({
          sessionId: "unknown",
          data: "Runner Error: Missing sessionId\n"
        }));
        return;
      }

      if (type === "run") {
        if (processes.has(sessionId)) {
          const oldEntry = processes.get(sessionId);
          oldEntry.reason = "replaced";
          oldEntry.process.kill();
          forceRemoveContainer(sessionId);
          processes.delete(sessionId);
        }

        const process = buildDockerProcess(sessionId, language, code);

        if (!process) {
          ws.send(JSON.stringify({
            sessionId,
            data: "Language not supported yet\n"
          }));
          return;
        }

        const entry = {
          process,
          reason: "running",
          timeoutId: null
        };

        processes.set(sessionId, entry);

        entry.timeoutId = setTimeout(() => {
          const current = processes.get(sessionId);
          if (!current) return;

          current.reason = "timeout";
          current.process.kill();
          forceRemoveContainer(sessionId);

          ws.send(JSON.stringify({
            sessionId,
            data: "\n[Process timed out]\n"
          }));
        }, 10000);

        process.stdout.on("data", (chunk) => {
          ws.send(JSON.stringify({
            sessionId,
            data: chunk.toString()
          }));
        });

        process.stderr.on("data", (chunk) => {
          ws.send(JSON.stringify({
            sessionId,
            data: chunk.toString()
          }));
        });

        process.on("error", (err) => {
          clearTimeout(entry.timeoutId);

          ws.send(JSON.stringify({
            sessionId,
            data: "Runner spawn error: " + err.message + "\n"
          }));

          processes.delete(sessionId);
        });

        process.on("close", () => {
          clearTimeout(entry.timeoutId);

          const current = processes.get(sessionId);
          const reason = current ? current.reason : entry.reason;

          if (reason === "running") {
            ws.send(JSON.stringify({
              sessionId,
              data: "\n[Process finished]\n"
            }));
          } else if (reason === "stop") {
            ws.send(JSON.stringify({
              sessionId,
              data: "\n[Process stopped]\n"
            }));
          }

          processes.delete(sessionId);
        });
      }

      else if (type === "input") {
        const entry = processes.get(sessionId);
        if (entry) {
          entry.process.stdin.write((input ?? "") + "\n");
        } else {
          ws.send(JSON.stringify({
            sessionId,
            data: "[No running process]\n"
          }));
        }
      }

      else if (type === "stop") {
        const entry = processes.get(sessionId);

        if (entry) {
          entry.reason = "stop";
          entry.process.kill();
          forceRemoveContainer(sessionId);
        } else {
          ws.send(JSON.stringify({
            sessionId,
            data: "[No running process to stop]\n"
          }));
        }
      }

      else {
        ws.send(JSON.stringify({
          sessionId,
          data: "Runner Error: Unknown message type\n"
        }));
      }
    } catch (err) {
      ws.send(JSON.stringify({
        sessionId,
        data: "Runner Error: " + err.message + "\n"
      }));
    }
  });

  ws.on("close", () => {
    console.log("App server disconnected from runner");

    for (const [sessionId, entry] of processes) {
      entry.process.kill();
      forceRemoveContainer(sessionId);
      clearTimeout(entry.timeoutId);
    }

    processes.clear();
  });
});