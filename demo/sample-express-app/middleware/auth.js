const jwt = require("jsonwebtoken");

// Bearer/JWT auth — reads and verifies an `Authorization: Bearer <token>` header.
function jwtAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// API key auth — reads a custom header, no token decoding, just a lookup.
function apiKeyAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.DOCS_API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

module.exports = { jwtAuth, apiKeyAuth };
