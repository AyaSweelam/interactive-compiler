const ws = new WebSocket("ws://localhost:3000");

const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const sendBtn = document.getElementById("sendBtn");

const codeBox = document.getElementById("code");
const inputBox = document.getElementById("input");
const outputBox = document.getElementById("output");
const languageSelect = document.getElementById("language");

function isSocketOpen() {
  return ws.readyState === WebSocket.OPEN;
}

function appendOutput(text) {
  outputBox.textContent += text;
  outputBox.scrollTop = outputBox.scrollHeight;
}

function setButtonsDisabled(disabled) {
  runBtn.disabled = disabled;
  stopBtn.disabled = disabled;
  sendBtn.disabled = disabled;
}

setButtonsDisabled(true);

ws.onopen = () => {
  outputBox.textContent = "";
  setButtonsDisabled(false);
  appendOutput("[Connected to server]\n");
};

ws.onmessage = (event) => {
  appendOutput(event.data);
};

ws.onerror = () => {
  appendOutput("\n[WebSocket error]\n");
};

ws.onclose = () => {
  setButtonsDisabled(true);
  appendOutput("\n[Connection closed]\n");
};

runBtn.onclick = () => {
  if (!isSocketOpen()) {
    appendOutput("\n[Server is not connected yet]\n");
    return;
  }

  if (!codeBox.value.trim()) {
    outputBox.textContent = "[Please write some code first]\n";
    return;
  }

  outputBox.textContent = "";

  ws.send(
    JSON.stringify({
      type: "run",
      code: codeBox.value,
      language: languageSelect.value
    })
  );
};

sendBtn.onclick = () => {
  if (!isSocketOpen()) {
    appendOutput("\n[Server is not connected yet]\n");
    return;
  }

  ws.send(
    JSON.stringify({
      type: "input",
      input: inputBox.value
    })
  );

  inputBox.value = "";
  inputBox.focus();
};

stopBtn.onclick = () => {
  if (!isSocketOpen()) {
    appendOutput("\n[Server is not connected yet]\n");
    return;
  }

  ws.send(
    JSON.stringify({
      type: "stop"
    })
  );
};

inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendBtn.click();
  }
});