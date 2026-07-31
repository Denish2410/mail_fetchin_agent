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

// Upload endpoint matching all path variations
router.post(["/upload", "/jobs/upload", "/api/jobs/upload"], upload.single("file"), uploadJob);

// Progress endpoint matching all path variations
router.get(["/:id/progress", "/jobs/:id/progress", "/api/jobs/:id/progress"], getJobProgress);

// Download endpoint matching all path variations
router.get(["/:id/download", "/jobs/:id/download", "/api/jobs/:id/download"], downloadJobResults);

// Job details matching all path variations
router.get(["/:id", "/jobs/:id", "/api/jobs/:id"], getJobById);

// Job list matching all path variations
router.get(["/", "/jobs", "/api/jobs"], getAllJobs);

module.exports = router;
