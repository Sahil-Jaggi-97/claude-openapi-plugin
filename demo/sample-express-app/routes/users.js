const express = require("express");
const multer = require("multer");
const { jwtAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const users = [{ id: "1", name: "Ada Lovelace", email: "ada@example.com" }];

// GET /api/users — list users, supports ?limit= and ?offset= query params.
router.get("/", (req, res) => {
  const limit = req.query.limit;
  const offset = req.query.offset;
  res.json(users);
});

// GET /api/users/:id — fetch one user by id.
router.get("/:id", (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// POST /api/users — create a user. Requires a bearer token.
router.post("/", jwtAuth, (req, res) => {
  const { name, email } = req.body;
  const created = { id: String(users.length + 1), name, email };
  users.push(created);
  res.status(201).json(created);
});

// PATCH /api/users/:id — partial update. Requires a bearer token.
router.patch("/:id", jwtAuth, (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { name, email } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  res.json(user);
});

// DELETE /api/users/:id — remove a user. Requires a bearer token.
router.delete("/:id", jwtAuth, (req, res) => {
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  users.splice(idx, 1);
  res.status(204).send();
});

// POST /api/users/:id/avatar — single file upload. Requires a bearer token.
router.post("/:id/avatar", jwtAuth, upload.single("avatar"), (req, res) => {
  res.status(201).json({ avatarUrl: `/uploads/${req.file.filename}` });
});

module.exports = router;
