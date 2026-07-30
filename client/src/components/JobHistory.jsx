import { useState, useEffect } from "react";

const API_URL = "/api";

export default function JobHistory({ onSelectJob }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/jobs`)
      .then((res) => res.json())
      .then((data) => {
        setJobs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusBadge = (status) => {
    switch (status) {
      case "completed":
        return <span className="badge badge-completed">✓ Completed</span>;
      case "processing":
        return (
          <span className="badge badge-processing">
            <span className="pulse-dot"></span> Processing
          </span>
        );
      case "failed":
        return <span className="badge badge-failed">✗ Failed</span>;
      default:
        return <span className="badge badge-pending">⏳ Pending</span>;
    }
  };

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
        <span>Loading history…</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>
          <span className="gradient-text">Job</span> History
        </h1>
        <p>View and revisit your previous extraction jobs</p>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No jobs yet</h3>
          <p style={{ color: "var(--text-muted)" }}>
            Upload a file to start your first extraction
          </p>
        </div>
      ) : (
        <div className="job-list">
          {jobs.map((job) => (
            <div
              className="job-item"
              key={job.jobId}
              onClick={() => {
                if (job.status === "completed") {
                  onSelectJob(job.jobId, "results");
                } else if (job.status === "processing") {
                  onSelectJob(job.jobId, "progress");
                }
              }}
            >
              <div style={{ fontSize: "1.8rem" }}>
                {job.status === "completed"
                  ? "✅"
                  : job.status === "processing"
                  ? "⚙️"
                  : job.status === "failed"
                  ? "❌"
                  : "⏳"}
              </div>
              <div className="job-info">
                <div className="job-name">{job.fileName || "Unknown file"}</div>
                <div className="job-meta">
                  {job.processedUrls || 0} / {job.totalUrls || 0} sites •{" "}
                  {formatDate(job.createdAt)}
                </div>
              </div>
              {statusBadge(job.status)}
              <span style={{ color: "var(--text-dim)", fontSize: "1.2rem" }}>›</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
