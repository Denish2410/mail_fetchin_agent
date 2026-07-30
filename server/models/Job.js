const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    company_url: String,
    emails: [String],
    pages_checked: [String],
    error: String,
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
  fileName: String,
  totalUrls: { type: Number, default: 0 },
  processedUrls: { type: Number, default: 0 },
  results: [resultSchema],
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

module.exports = mongoose.model("Job", jobSchema);
