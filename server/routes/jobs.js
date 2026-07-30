const express = require("express");
const router = express.Router();
const {
  upload,
  uploadJob,
  getJobProgress,
  getJobById,
  downloadJobResults,
  getAllJobs,
} = require("../controllers/jobController");

// POST /api/jobs/upload — Upload Excel/CSV file & start Python agent
router.post("/upload", upload.single("file"), uploadJob);

// GET /api/jobs/:id/progress — SSE real-time progress stream
router.get("/:id/progress", getJobProgress);

// GET /api/jobs/:id — Get job metadata and results
router.get("/:id", getJobById);

// GET /api/jobs/:id/download — Export results as .xlsx
router.get("/:id/download", downloadJobResults);

// GET /api/jobs — List recent jobs history
router.get("/", getAllJobs);

module.exports = router;
