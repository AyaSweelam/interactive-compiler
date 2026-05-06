// =======================
// WEBSOCKET
// =======================
const ws = new WebSocket("ws://" + location.host);

// =======================
// ELEMENTS
// =======================
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const sendBtn = document.getElementById("sendBtn");
const saveBtn = document.getElementById("saveBtn");
const createProjectBtn = document.getElementById("createProjectBtn");

const codeBox = document.getElementById("code");
const inputBox = document.getElementById("input");
const closeStdinBox = document.getElementById("closeStdin");
const outputBox = document.getElementById("output");
const languageSelect = document.getElementById("language");
const projectsList = document.getElementById("projectsList");

const authBox = document.getElementById("authBox");
const appEl = document.getElementById("app");

const showLoginBtn = document.getElementById("showLogin");
const showSignupBtn = document.getElementById("showSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginErrorEl = document.getElementById("loginError");
const signupErrorEl = document.getElementById("signupError");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");

const signupUsername = document.getElementById("signupUsername");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupBtn = document.getElementById("signupBtn");

const logoutBtn = document.getElementById("logoutBtn");
const userInfoEl = document.getElementById("userInfo");
const authTriggerBtn = document.getElementById("authTriggerBtn");
const skipAuthBtn = document.getElementById("skipAuthBtn");
const currentTitleEl = document.getElementById("currentProjectTitle");

// =======================
// STATE
// =======================
let currentProjectId = null;
let currentProjectName = null;

// =======================
// AUTH STORAGE
// =======================
function getToken() {
  return localStorage.getItem("token");
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}
function isLoggedIn() {
  return !!getToken();
}

function saveAuth(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

// =======================
// SHOW / HIDE APP
// =======================
function showApp() {
  authBox.classList.add("hidden");
  appEl.classList.remove("hidden");
  updateUserUI();
  loadProjects();
}

function showAuthOverlay() {
  authBox.classList.remove("hidden");
  appEl.classList.add("hidden");
}

function updateUserUI() {
  const user = getUser();
  if (isLoggedIn() && user) {
    userInfoEl.textContent = "👤 " + user.username;
    logoutBtn.classList.remove("hidden");
    authTriggerBtn.classList.add("hidden");
  } else {
    userInfoEl.textContent = "";
    logoutBtn.classList.add("hidden");
    authTriggerBtn.classList.remove("hidden");
  }
}

function updateProjectTitle() {
  currentTitleEl.textContent = currentProjectName || "No project selected";
}

// =======================
// AUTH TABS
// =======================
showLoginBtn.onclick = () => {
  showLoginBtn.classList.add("active");
  showSignupBtn.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  loginErrorEl.textContent = "";
};

showSignupBtn.onclick = () => {
  showSignupBtn.classList.add("active");
  showLoginBtn.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  signupErrorEl.textContent = "";
};

// =======================
// LOGIN
// =======================
loginBtn.onclick = async () => {
  loginErrorEl.textContent = "";
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  if (!email || !password) {
    loginErrorEl.textContent = "All fields are required";
    return;
  }

  loginBtn.textContent = "Loading...";
  loginBtn.disabled = true;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginErrorEl.textContent = data.message || "Login failed";
      return;
    }
    saveAuth(data.token, data.user);
    showApp();
  } catch {
    loginErrorEl.textContent = "Server error. Try again.";
  } finally {
    loginBtn.textContent = "Login";
    loginBtn.disabled = false;
  }
};

// =======================
// SIGNUP
// =======================
signupBtn.onclick = async () => {
  signupErrorEl.textContent = "";
  const username = signupUsername.value.trim();
  const email = signupEmail.value.trim();
  const password = signupPassword.value.trim();
  if (!username || !email || !password) {
    signupErrorEl.textContent = "All fields are required";
    return;
  }

  signupBtn.textContent = "Loading...";
  signupBtn.disabled = true;

  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      signupErrorEl.textContent = data.message || "Signup failed";
      return;
    }
    saveAuth(data.token, data.user);
    showApp();
  } catch {
    signupErrorEl.textContent = "Server error. Try again.";
  } finally {
    signupBtn.textContent = "Create Account";
    signupBtn.disabled = false;
  }
};

// =======================
// SKIP / LOGOUT / AUTH TRIGGER
// =======================
skipAuthBtn.onclick = () => showApp();
authTriggerBtn.onclick = () => showAuthOverlay();

logoutBtn.onclick = () => {
  clearAuth();
  currentProjectId = null;
  currentProjectName = null;
  updateProjectTitle();
  updateUserUI();
  loadProjects();
};

// =======================
// PROJECTS — LOAD
// =======================
async function loadProjects() {
  if (!isLoggedIn()) {
    projectsList.innerHTML =
      '<p class="empty-text">Login to see your projects</p>';
    return;
  }

  try {
    const res = await fetch("/api/projects", {
      headers: { Authorization: "Bearer " + getToken() },
    });
    const data = await res.json();

    projectsList.innerHTML = "";

    if (!res.ok || !data.length) {
      projectsList.innerHTML = '<p class="empty-text">No projects yet</p>';
      return;
    }

    data.forEach((project) => {
      const div = document.createElement("div");
      div.className =
        "project-item" + (project._id === currentProjectId ? " active" : "");

      div.innerHTML = `
        <div class="project-item-info">
          <span class="project-name">${escHtml(project.name)}</span>
          <span class="project-lang">${project.language}</span>
        </div>
        <button class="delete-btn" title="Delete project">🗑</button>
      `;

      div.querySelector(".project-item-info").onclick = () => {
        currentProjectId = project._id;
        currentProjectName = project.name;
        codeBox.value = project.code;
        languageSelect.value = project.language;
        updateProjectTitle();
        document
          .querySelectorAll(".project-item")
          .forEach((el) => el.classList.remove("active"));
        div.classList.add("active");
      };

      div.querySelector(".delete-btn").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${project.name}"?`)) return;
        await deleteProject(project._id);
      };

      projectsList.appendChild(div);
    });
  } catch {
    projectsList.innerHTML = '<p class="empty-text">Error loading projects</p>';
  }
}

// =======================
// PROJECTS — CREATE
// =======================
createProjectBtn.onclick = async () => {
  if (!isLoggedIn()) {
    alert("Please login to create projects");
    return;
  }

  const name = prompt("Project name?");
  if (!name?.trim()) return;

  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
      },
      body: JSON.stringify({
        name: name.trim(),
        language: languageSelect.value,
        code: codeBox.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message);
      return;
    }
    currentProjectId = data.project._id;
    currentProjectName = data.project.name;
    updateProjectTitle();
    loadProjects();
  } catch {
    alert("Server error");
  }
};

// =======================
// PROJECTS — SAVE
// =======================
saveBtn.onclick = async () => {
  if (!isLoggedIn()) {
    alert("Login to save projects");
    return;
  }
  if (!currentProjectId) {
    alert("Open a project first");
    return;
  }

  try {
    const res = await fetch(`/api/projects/${currentProjectId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken(),
      },
      body: JSON.stringify({
        name: currentProjectName,
        language: languageSelect.value,
        code: codeBox.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message);
      return;
    }

    const orig = saveBtn.textContent;
    saveBtn.textContent = "Saved ✓";
    setTimeout(() => (saveBtn.textContent = orig), 2000);
    loadProjects();
  } catch {
    alert("Server error");
  }
};

// =======================
// PROJECTS — DELETE
// =======================
async function deleteProject(id) {
  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + getToken() },
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.message);
      return;
    }
    if (currentProjectId === id) {
      currentProjectId = currentProjectName = null;
      codeBox.value = "";
      updateProjectTitle();
    }
    loadProjects();
  } catch {
    alert("Server error");
  }
}

// =======================
// WEBSOCKET EVENTS
// =======================
ws.onopen = () => {
  outputBox.textContent = "[Connected]\n";
};

ws.onmessage = (e) => {
  outputBox.textContent += e.data;
  outputBox.scrollTop = outputBox.scrollHeight;
};

ws.onclose = () => {
  outputBox.textContent += "\n[Disconnected]\n";
};

ws.onerror = () => {
  outputBox.textContent += "\n[WebSocket error]\n";
};

// =======================
// RUN / STOP / INPUT
// =======================
// =======================
// RUN / STOP / INPUT
// =======================
const SESSION_ID = "main";

runBtn.onclick = () => {
  if (!codeBox.value.trim()) return;

  outputBox.textContent = "";

  ws.send(
    JSON.stringify({
      type: "run",
      sessionId: SESSION_ID,
      code: codeBox.value,
      language: languageSelect.value,
      token: getToken(),
    }),
  );
};

stopBtn.onclick = () => {
  ws.send(
    JSON.stringify({
      type: "stop",
      sessionId: SESSION_ID,
    }),
  );
};

sendBtn.onclick = () => {
  const val = inputBox.value;

  ws.send(
    JSON.stringify({
      type: "input",
      sessionId: SESSION_ID,
      input: val,
      closeStdin: Boolean(closeStdinBox?.checked),
    }),
  );

  inputBox.value = "";
};

inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendBtn.click();
  }
});

// =======================
// UTILS
// =======================
function escHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// =======================
// INIT — auto-login if token exists
// =======================
if (isLoggedIn()) {
  showApp();
}