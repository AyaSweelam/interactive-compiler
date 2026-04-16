const sessions = new Map();

function createSession(sessionId, ws) {
  sessions.set(sessionId, ws);
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function removeSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = {
  createSession,
  getSession,
  removeSession
};