const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { spawn } = require("child_process");
const ExcelJS = require("exceljs");
const Job = require("../models/Job");

// ---------------------------------------------------------------------------
// File upload config
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = [".xlsx", ".csv", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .csv, and .txt files are allowed"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ---------------------------------------------------------------------------
// SSE client management
// ---------------------------------------------------------------------------
const sseClients = new Map(); // jobId -> Set<res>

function broadcastProgress(jobId, data) {
  const clients = sseClients.get(jobId);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/jobs/upload — Upload file and start processing
// ---------------------------------------------------------------------------
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const jobId = uuidv4();
    const uploadedPath = req.file.path;
    const outputPath = path.join(__dirname, "..", "results", `${jobId}.csv`);

    // Create job in DB
    const job = await Job.create({
      jobId,
      status: "pending",
      fileName: req.file.originalname,
    });

    res.json({ jobId, status: "pending", fileName: req.file.originalname });

    // Spawn the Python agent
    const pythonScript = path.join(__dirname, "..", "..", "version1.py");
    const proc = spawn("python3", [
      pythonScript,
      "--file", uploadedPath,
      "--out", outputPath,
      "--threads", "10",
      "--json",
    ]);

    let started = false;

    proc.stdout.on("data", async (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.type === "start") {
            started = true;
            await Job.updateOne(
              { jobId },
              { status: "processing", totalUrls: data.total }
            );
            broadcastProgress(jobId, {
              type: "start",
              total: data.total,
              status: "processing",
            });
          } else if (data.type === "result") {
            await Job.updateOne(
              { jobId },
              {
                $inc: { processedUrls: 1 },
                $push: {
                  results: {
                    company_url: data.company_url,
                    emails: data.emails,
                    pages_checked: data.pages_checked,
                    error: data.error || "",
                  },
                },
              }
            );
            broadcastProgress(jobId, {
              type: "result",
              index: data.index,
              total: data.total,
              company_url: data.company_url,
              emails: data.emails,
              error: data.error || "",
            });
          } else if (data.type === "done") {
            await Job.updateOne(
              { jobId },
              { status: "completed", completedAt: new Date() }
            );
            broadcastProgress(jobId, { type: "done", total: data.total });
          }
        } catch (e) {
          // Not JSON, skip
        }
      }
    });

    proc.stderr.on("data", (data) => {
      console.error(`[Job ${jobId}] stderr:`, data.toString());
    });

    proc.on("close", async (code) => {
      const job = await Job.findOne({ jobId });
      if (job && job.status !== "completed") {
        await Job.updateOne(
          { jobId },
          {
            status: code === 0 ? "completed" : "failed",
            completedAt: new Date(),
          }
        );
        broadcastProgress(jobId, {
          type: code === 0 ? "done" : "error",
          message: code === 0 ? "Processing complete" : `Process exited with code ${code}`,
        });
      }
      // Clean up SSE clients
      setTimeout(() => sseClients.delete(jobId), 60000);
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/progress — SSE stream
// ---------------------------------------------------------------------------
router.get("/:id/progress", async (req, res) => {
  const jobId = req.params.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send current state first
  const job = await Job.findOne({ jobId });
  if (job) {
    res.write(
      `data: ${JSON.stringify({
        type: "init",
        status: job.status,
        totalUrls: job.totalUrls,
        processedUrls: job.processedUrls,
        results: job.results,
      })}\n\n`
    );
  }

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId).add(res);

  req.on("close", () => {
    sseClients.get(jobId)?.delete(res);
  });
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id — Get job details
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/download — Download results as .xlsx
// ---------------------------------------------------------------------------
router.get("/:id/download", async (req, res) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Job is not yet completed" });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Emails Found");

    // Header styling
    sheet.columns = [
      { header: "Website", key: "website", width: 45 },
      { header: "Emails Found", key: "emails", width: 60 },
      { header: "Pages Checked", key: "pages", width: 50 },
      { header: "Status", key: "status", width: 18 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6C3AED" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Data rows
    for (const result of job.results) {
      const row = sheet.addRow({
        website: result.company_url,
        emails: result.emails.join("; "),
        pages: result.pages_checked.join("; "),
        status: result.error ? `Error: ${result.error}` : result.emails.length > 0 ? "Found" : "No emails",
      });

      if (result.error) {
        row.getCell("status").font = { color: { argb: "FFEF4444" } };
      } else if (result.emails.length > 0) {
        row.getCell("status").font = { color: { argb: "FF10B981" } };
      }
    }

    // Auto-filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: job.results.length + 1, column: 4 },
    };

    const safeName = (job.fileName || "results").replace(/\.[^.]+$/, "");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}_emails.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/jobs — List recent jobs
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const jobs = await Job.find()
      .select("jobId status fileName totalUrls processedUrls createdAt completedAt")
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
