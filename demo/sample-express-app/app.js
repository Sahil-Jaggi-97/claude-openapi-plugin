const express = require("express");
const usersRouter = require("./routes/users");
const documentsRouter = require("./routes/documents");

const app = express();
app.use(express.json());

// GET/HEAD /api/health — plain, unauthenticated health check.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
app.head("/api/health", (req, res) => {
  res.status(200).end();
});

app.use("/api/users", usersRouter);
app.use("/api/documents", documentsRouter);

module.exports = app;
