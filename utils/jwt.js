const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET);
}

module.exports = { generateToken };