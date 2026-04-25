# Interactive Compiler

An online interactive compiler that supports multiple programming languages with real-time output via WebSocket and isolated Docker execution.

## Features

- **Multi-language support**: Python, JavaScript, C++, Java, Go
- **Real-time output** via WebSocket (streaming, not batch)
- **Interactive input** — send stdin to running processes step by step
- **User authentication** — JWT-based signup/login
- **Projects** — create, save, and delete your code projects
- **Execution history** — all runs saved to MongoDB
- **Isolated execution** — each run is sandboxed in a Docker container (no network, memory/CPU limits)

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Real-time | WebSocket (ws) |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Code execution | Docker (spawn) |
| Infrastructure | Docker Compose |

## Project Structure

```
.
├── server.js             # Main app server (Express + WebSocket)
├── runner.js             # Runner service (executes code in Docker)
├── db.js                 # MongoDB connection
├── sessions.js           # In-memory WebSocket session management
├── middleware/
│   └── auth.js           # JWT authentication middleware
├── models/
│   ├── User.js
│   ├── Project.js
│   └── Execution.js
├── public/
│   ├── index.html        # Frontend UI
│   ├── style.css
│   └── app.js            # Frontend logic (WebSocket + REST API)
├── Dockerfile.app        # Docker image for app server
├── Dockerfile.runner     # Docker image for runner service
└── docker-compose.yml    # Orchestration
```

## Getting Started

### Prerequisites

- Docker & Docker Compose installed

### Run

```bash
docker compose up --build
```

Then open: [http://localhost:3000](http://localhost:3000)

### Services

| Service | Port | Description |
|---|---|---|
| app | 3000 | Main web server |
| runner | 5000 | Code execution service |
| mongo | 27017 | MongoDB |

## API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/signup` | Register a new user |
| POST | `/api/login` | Login and get JWT token |

### Projects (requires auth)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | Get all user projects |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/:id` | Get a single project |
| PUT | `/api/projects/:id` | Update/save a project |
| DELETE | `/api/projects/:id` | Delete a project |

### Executions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/executions` | Get execution history |

## WebSocket Messages

Connect to `ws://localhost:3000` then send JSON messages:

```js
// Run code
{ type: "run", language: "python", code: "print('hello')" }

// Send stdin input
{ type: "input", input: "42" }

// Stop running process
{ type: "stop" }
```

## Supported Languages

| Language | Docker Image |
|---|---|
| Python | python:3.10 |
| JavaScript | node:20 |
| C++ | gcc:13 |
| Java | eclipse-temurin:17-jdk |
| Go | golang:1.20-bullseye |

## Security

- Each code execution runs in an isolated Docker container
- No network access inside containers (`--network none`)
- Memory limited to 256MB per run
- CPU limited to 1 core
- Process limit of 128 PIDs
- Read-only filesystem (with `/tmp` tmpfs only)
- 30-second execution timeout