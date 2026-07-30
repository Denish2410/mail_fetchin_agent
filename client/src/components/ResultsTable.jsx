import { useState, useEffect } from "react";

const API_URL = "/api";

export default function ResultsTable({ jobId, onNewUpload }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/jobs/${jobId}`)
      .then((res) => res.json())
      .then((data) => {
        setJob(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [jobId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/jobs/${jobId}/download`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(job?.fileName || "results").replace(/\.[^.]+$/, "")}_emails.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
        <span>Loading results…</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="empty-state">
        <div className="empty-icon">❌</div>
        <h3>Job not found</h3>
      </div>
    );
  }

  const results = job.results || [];
  const filtered = results.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.company_url.toLowerCase().includes(q) ||
      r.emails.some((e) => e.toLowerCase().includes(q))
    );
  });

  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
  const sitesWithEmails = results.filter((r) => r.emails.length > 0).length;
  const errorCount = results.filter((r) => r.error).length;

  return (
    <>
      <div className="page-header">
        <h1>
          <span className="gradient-text">Extraction</span> Results
        </h1>
        <p>
          Found {totalEmails} emails across {sitesWithEmails} websites
        </p>
      </div>

      {/* Stats */}
      <div className="results-stats">
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent-cyan)" }}>
            {results.length}
          </div>
          <div className="stat-label">Sites Scanned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--success)" }}>
            {totalEmails}
          </div>
          <div className="stat-label">Emails Found</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--accent-violet)" }}>
            {sitesWithEmails}
          </div>
          <div className="stat-label">With Emails</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--error)" }}>
            {errorCount}
          </div>
          <div className="stat-label">Errors</div>
        </div>
      </div>

      {/* Actions */}
      <div className="btn-group" style={{ marginBottom: 24 }}>
        <button
          className="btn btn-success"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <>
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
              Generating…
            </>
          ) : (
            <>📥 Download Excel</>
          )}
        </button>
        <button className="btn btn-secondary" onClick={onNewUpload}>
          📎 New Upload
        </button>
      </div>

      {/* Search */}
      <div className="search-bar">
        <span>🔍</span>
        <input
          type="text"
          placeholder="Search by website or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <span
            style={{ cursor: "pointer", color: "var(--text-muted)" }}
            onClick={() => setSearch("")}
          >
            ✕
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Website</th>
              <th>Emails Found</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td style={{ color: "var(--text-dim)", fontWeight: 600 }}>
                  {i + 1}
                </td>
                <td>
                  <a
                    href={r.company_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent-cyan)", textDecoration: "none" }}
                  >
                    {r.company_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </td>
                <td>
                  {r.emails.length > 0 ? (
                    r.emails.map((email, j) => (
                      <span className="email-tag" key={j}>
                        {email}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                      —
                    </span>
                  )}
                </td>
                <td>
                  {r.error ? (
                    <span className="badge badge-failed">Error</span>
                  ) : r.emails.length > 0 ? (
                    <span className="badge badge-completed">Found</span>
                  ) : (
                    <span className="badge badge-pending">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && search && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No matches for "{search}"</h3>
          <p style={{ color: "var(--text-muted)" }}>Try a different search term</p>
        </div>
      )}
    </>
  );
}
