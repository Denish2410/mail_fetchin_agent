import { useState, useCallback } from "react";

const API_URL = "/api";

export default function FileUpload({ onJobStarted }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = useCallback((f) => {
    setError("");
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xlsx", "csv", "txt"].includes(ext)) {
      setError("Please upload an .xlsx, .csv, or .txt file");
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/jobs/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      onJobStarted(data.jobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <>
      <div className="page-header">
        <h1>
          <span className="gradient-text">Email Finder</span> Agent
        </h1>
        <p>
          Upload an Excel file with website URLs and extract contact emails
          automatically using AI-powered multi-layer extraction.
        </p>
      </div>

      <div className="glass-card">
        <div
          className={`upload-zone ${dragOver ? "drag-over" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById("file-input").click()}
        >
          <div className="upload-icon">📎</div>
          <h3>Drop your file here or click to browse</h3>
          <p>Supports .xlsx, .csv, and .txt files</p>

          <input
            id="file-input"
            type="file"
            accept=".xlsx,.csv,.txt"
            onChange={(e) => {
              if (e.target.files[0]) handleFile(e.target.files[0]);
            }}
          />

          {file && (
            <div className="file-selected">
              <span>📄</span>
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
            </div>
          )}
        </div>

        {error && (
          <p style={{ color: "var(--error)", marginTop: 16, textAlign: "center" }}>
            ⚠️ {error}
          </p>
        )}

        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></span>
                Uploading…
              </>
            ) : (
              <>🚀 Start Extraction</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
