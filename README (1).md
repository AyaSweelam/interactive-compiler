# Interactive Compiler

An online interactive compiler that supports multiple programming languages with real-time output streaming, interactive input, user authentication, project saving, execution history, and isolated Docker-based code execution.

## Features

- **Multi-language support**: Python, JavaScript, C++, Java, and Go
- **Real-time output** via WebSocket streaming
- **Interactive input**: send input to a running program
- **Final input mode**: send input once and close stdin for programs that read all input at once
- **User authentication**: JWT-based signup and login
- **Projects**: create, save, open, update, and delete code projects
- **Execution history**: code runs are stored in MongoDB
- **Docker sandboxing**: each run executes inside an isolated Docker container
- **Resource limits**: memory, CPU, PID, network, filesystem, and timeout restrictions

## Tech Stack

| Layer          | Technology            |
| -------------- | --------------------- |
| Frontend       | HTML, CSS, JavaScript |
| Backend        | Node.js + Express     |
| Real-time      | WebSocket (`ws`)      |
| Database       | MongoDB + Mongoose    |
| Auth           | JWT + bcryptjs        |
| Code execution | Docker containers     |
| Infrastructure | Docker Compose        |

## Project Structure

```txt
.
├── server.js             # Main app server: Express + WebSocket bridge
├── runner.js             # Runner service: executes code inside Docker containers
├── db.js                 # MongoDB connection
├── sessions.js           # In-memory WebSocket session management
├── Execution.js          # Mongoose schema for executions
├── User.js               # Mongoose schema for users
├── Project.js            # Mongoose schema for projects
├── middleware/
│   └── auth.js           # JWT authentication middleware
├── utils/
│   └── jwt.js            # JWT helper functions
├── public/
│   ├── index.html        # Frontend UI
│   ├── style.css         # Frontend styles
│   └── app.js            # Frontend logic: WebSocket + REST API
├── docker-compose.yml    # Docker Compose services
├── Dockerfile.app        # Docker image for app server
├── Dockerfile.runner     # Docker image for runner service
├── .dockerignore         # Docker ignore rules
├── .gitignore            # Git ignore rules
├── package.json          # Project dependencies
├── package-lock.json     # Exact dependency versions
└── README.md             # Project documentation
```

> Note: `.env` should exist locally, but it should not be committed to GitHub.

## Getting Started

### Prerequisites

Make sure you have:

- Docker
- Docker Compose
- Git

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
MONGO_URI=mongodb://mongo:27017/interactive_compiler
JWT_SECRET=your_strong_secret_here
```

### Run with Docker Compose

```bash
docker compose up --build
```

Then open:

```txt
http://localhost:3000
```

To stop the project:

```bash
docker compose down
```

## Services

| Service | Port  | Description                     |
| ------- | ----- | ------------------------------- |
| app     | 3000  | Main web server                 |
| runner  | 5000  | Internal code execution service |
| mongo   | 27017 | MongoDB database                |

For safer deployment, expose only the `app` service publicly. The `runner` and `mongo` services should stay internal.

## API Endpoints

### Auth

| Method | Endpoint      | Description               |
| ------ | ------------- | ------------------------- |
| POST   | `/api/signup` | Register a new user       |
| POST   | `/api/login`  | Login and get a JWT token |

### Projects

These routes require authentication.

| Method | Endpoint            | Description           |
| ------ | ------------------- | --------------------- |
| GET    | `/api/projects`     | Get all user projects |
| POST   | `/api/projects`     | Create a new project  |
| GET    | `/api/projects/:id` | Get a single project  |
| PUT    | `/api/projects/:id` | Update/save a project |
| DELETE | `/api/projects/:id` | Delete a project      |

### Executions

| Method | Endpoint          | Description           |
| ------ | ----------------- | --------------------- |
| GET    | `/api/executions` | Get execution history |

## WebSocket Messages

The browser connects to:

```txt
ws://localhost:3000
```

### Run Code

```js
{
  type: "run",
  language: "javascript",
  code: "console.log('hello')"
}
```

### Send Interactive Input

Use this when your program keeps waiting for more input.

```js
{
  type: "input",
  input: "5",
  closeStdin: false
}
```

### Send Final Input

Use this when your program reads all input at once, such as:

- JavaScript: `fs.readFileSync(0, "utf-8")`
- Python: `sys.stdin.read()`
- C++: reading normal input once
- Java: `Scanner`
- Go: `fmt.Scan`

```js
{
  type: "input",
  input: "5",
  closeStdin: true
}
```

### Stop Running Process

```js
{
  type: "stop";
}
```

## Input Modes

The UI includes an option called:

```txt
This is the final input
```

### Leave it unchecked

Use this for interactive programs that can receive input multiple times.

Example JavaScript:

```js
process.stdin.on("data", (data) => {
  const n = Number(data.toString().trim());
  console.log(n * 2);
});
```

You can send:

```txt
5
```

Then send another value later:

```txt
10
```

### Check it

Use this for programs that read all input at once and wait for EOF.

Example JavaScript:

```js
const fs = require("fs");

const input = fs.readFileSync(0, "utf-8").trim();
const n = Number(input);

console.log(n * 2);
```

Input:

```txt
5
```

Expected output:

```txt
10
```

## Supported Languages

| Language   | Docker Image             |
| ---------- | ------------------------ |
| Python     | `python:3.10`            |
| JavaScript | `node:20`                |
| C++        | `gcc:13`                 |
| Java       | `eclipse-temurin:17-jdk` |
| Go         | `golang:1.20-bullseye`   |

## Code Examples

### JavaScript

```js
const fs = require("fs");

const n = Number(fs.readFileSync(0, "utf-8").trim());

console.log(n * 2);
```

Input:

```txt
5
```

Output:

```txt
10
```

### Python

```python
import sys

n = int(sys.stdin.read().strip())

print(n * 2)
```

Input:

```txt
5
```

Output:

```txt
10
```

### C++

```cpp
#include <iostream>
using namespace std;

int main() {
  int n;
  cin >> n;

  cout << n * 2 << endl;

  return 0;
}
```

Input:

```txt
5
```

Output:

```txt
10
```

### Java

```java
import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);

    int n = sc.nextInt();

    System.out.println(n * 2);
  }
}
```

Input:

```txt
5
```

Output:

```txt
10
```

### Go

```go
package main

import "fmt"

func main() {
  var n int
  fmt.Scan(&n)

  fmt.Println(n * 2)
}
```

Input:

```txt
5
```

Output:

```txt
10
```

## Docker Execution Model

The app does not execute user code directly.

Instead:

```txt
Browser
  -> App Server
    -> Runner Service
      -> Docker Container
```

The runner starts a new Docker container for each code execution.

## Security Notes

This project is designed for local development and portfolio demonstration.

Each execution container uses several restrictions:

- Network disabled using `--network none`
- Memory limited to `256MB`
- CPU limited to `1`
- PID limit set to `128`
- Read-only filesystem enabled
- Temporary writable directories using `tmpfs`
- Execution timeout set to 30 seconds

The runner requires access to Docker through:

```txt
/var/run/docker.sock
```

This is useful for local development, but it should not be exposed publicly without additional isolation.

For production-like deployment, consider:

- Keeping the runner service internal
- Keeping MongoDB internal
- Using a separate worker machine or VM
- Using rootless Docker or stronger sandboxing
- Adding rate limits
- Adding output size limits
- Adding authentication to WebSocket execution requests

## Common Issues

### `JWT_SECRET is not set`

Add `JWT_SECRET` to your `.env` file:

```env
JWT_SECRET=your_strong_secret_here
```

### `spawn docker ENOENT`

The runner container cannot find the Docker CLI.

Make sure `Dockerfile.runner` includes Docker CLI and `docker-compose.yml` mounts the Docker socket:

```yml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

### `readFileSync(0)` times out

This means your program is waiting for EOF.

Check:

```txt
This is the final input
```

before pressing Send.

### Go takes longer than JavaScript or Python

Go code needs compilation before execution. The first run may also take longer if the Docker image is still being pulled or warmed up.

## Development Commands

Install dependencies locally:

```bash
npm install
```

Run with Docker:

```bash
docker compose up --build
```

Stop containers:

```bash
docker compose down
```

Check logs:

```bash
docker compose logs
```

Rebuild only runner:

```bash
docker compose build --no-cache runner
```

## GitHub Notes

Do not commit:

```txt
node_modules
.env
```

If `node_modules` was already committed, remove it from Git tracking:

```bash
git rm -r --cached node_modules
git commit -m "Remove node_modules from repository"
git push
```

## Project Summary

Interactive Compiler is a Dockerized online code runner supporting Python, JavaScript, C++, Java, and Go. It uses Node.js, Express, WebSockets, MongoDB, JWT authentication, and Docker Compose to provide real-time output streaming, project saving, execution history, and isolated code execution with resource limits.
