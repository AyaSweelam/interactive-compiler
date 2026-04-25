const sessions = new Map();

function createSession(sessionId, ws) {
  sessions.set(sessionId, {
    ws,
    executionId: null
  });
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function removeSession(sessionId) {
  sessions.delete(sessionId);
}

function setExecutionId(sessionId, executionId) {
  const session = sessions.get(sessionId);

  if (session) {
    session.executionId = executionId;
  }
}

module.exports = {
  createSession,
  getSession,
  removeSession,
  setExecutionId
};