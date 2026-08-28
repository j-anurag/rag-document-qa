
// FILE: documents.js
// DESCRIPTION:
// Handles file uploads from the user. It persists files to disk and,
// if appropriate, processes them for RAG (Retrieval Augmented Generation).


const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, optionalVerifyToken } = require('../routers/auth');
const { vectorStore } = require('../state');
const { processUploadedFile } = require('../utils/fileUtils');
const path = require('path');
const fs = require('fs');

const os = require('os');

// SETUP: Storage Configuration
// DESCRIPTION: Configures Multer to save files to the system temp folder.
// This is required for Vercel Serverless Functions (Read-only file system).
const uploadDir = os.tmpdir();
// Ensure it exists (usually does)
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Keep original extension and use a timestamp for uniqueness
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// ==========================================================================
// ROUTE: POST /upload
// DESCRIPTION: Receives a file, saves it, and optionally embeds it for RAG.
// INPUT: Multipart Form Data ('file')
// OUTPUT: JSON { filename, status, file_path, chunks }
// ==========================================================================
router.post('/upload', optionalVerifyToken, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ detail: "No file uploaded" });
        }

        const ext = file.originalname.split('.').pop().toLowerCase();

        // ------------------------------------------------------------------
        // LOGIC: File Type Handling
        // ------------------------------------------------------------------
        // Allowed: DOCX, DOC, PDF
        const allowedExtensions = ['docx', 'doc', 'pdf'];
        if (!allowedExtensions.includes(ext)) {
            // Delete the uploaded file immediately if it's not allowed
            try { fs.unlinkSync(file.path); } catch (e) { }
            return res.status(400).json({ detail: `Unsupported file type: ${ext}. Only PDF and Word (.doc, .docx) files are allowed.` });
        }

        // LOGIC: RAG Processing
        // For PDFs, TXT, etc., we extract text, split it into chunks, and
        // save the embeddings to our Vector Store for search.
        const docs = await processUploadedFile(file);

        if (!docs || docs.length === 0) {
            return res.status(400).json({ detail: "Could not extract text from file." });
        }

        await vectorStore.addDocuments(docs);

        res.json({
            filename: file.originalname,
            status: "processed",
            chunks: docs.length,
            file_path: file.path
        });
    } catch (e) {
        console.error("File upload error", e);
        res.status(500).json({ detail: e.message });
    }
});

module.exports = router;
