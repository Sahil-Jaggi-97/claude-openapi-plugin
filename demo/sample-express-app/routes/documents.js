const express = require("express");
const multer = require("multer");
const { apiKeyAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const documents = [];

// GET /api/documents — list documents. Requires an API key.
router.get("/", apiKeyAuth, (req, res) => {
  res.json(documents);
});

// PUT /api/documents/:id — replace a document's metadata. Requires an API key.
router.put("/:id", apiKeyAuth, (req, res) => {
  const doc = documents.find((d) => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  doc.title = req.body.title;
  res.json(doc);
});

// POST /api/documents/upload — multiple file upload under one field name. Requires an API key.
router.post("/upload", apiKeyAuth, upload.array("files", 10), (req, res) => {
  const uploaded = req.files.map((f) => ({ id: f.filename, name: f.originalname }));
  documents.push(...uploaded);
  res.status(201).json(uploaded);
});

module.exports = router;
