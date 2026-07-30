import { useState, useEffect, useRef } from "react";

const API_URL = "/api";

export default function JobProgress({ jobId, onComplete }) {
  const [status, setStatus] = useState("pending");
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [feed, setFeed] = useState([]);
  const feedRef = useRef(null);

  useEffect(() => {
    const eventSource = new EventSource(`${API_URL}/jobs/${jobId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "init") {
          setStatus(data.status);
          setTotal(data.totalUrls || 0);
          setProcessed(data.processedUrls || 0);
          // Pre-populate feed with existing results
          if (data.results && data.results.length > 0) {
            setFeed(
              data.results.map((r, i) => ({
                index: i + 1,
                company_url: r.company_url,
                emails: r.emails,
                error: r.error,
              }))
            );
          }
        } else if (data.type === "start") {
          setStatus("processing");
          setTotal(data.total);
        } else if (data.type === "result") {
          setProcessed((prev) => prev + 1);
          setTotal(data.total);
          setFeed((prev) => [
            ...prev,
            {
              index: data.index,
              company_url: data.company_url,
              emails: data.emails || [],
              error: data.error,
            },
          ]);
        } else if (data.type === "done") {
          setStatus("completed");
          setTimeout(() => onComplete(jobId), 1500);
          eventSource.close();
        } else if (data.type === "error") {
          setStatus("failed");
          eventSource.close();
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    eventSource.onerror = () => {
      // Check if job is actually done
      fetch(`${API_URL}/jobs/${jobId}`)
        .then((res) => res.json())
        .then((job) => {
          if (job.status === "completed") {
            setStatus("completed");
            onComplete(jobId);
          }
        })
        .catch(() => {});
      eventSource.close();
    };

    return () => eventSource.close();
  }, [jobId, onComplete]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <>
      <div className="page-header">
        <h1>
          <span className="gradient-text">Processing</span> Websites
        </h1>
        <p>Extracting emails from contact pages using multi-layer analysis…</p>
      </div>

      <div className="glass-card">
        {/* Status badge */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {status === "processing" && (
            <span className="badge badge-processing">
              <span className="pulse-dot"></span> Processing
            </span>
          )}
          {status === "completed" && (
            <span className="badge badge-completed">✓ Completed</span>
          )}
          {status === "failed" && (
            <span className="badge badge-failed">✗ Failed</span>
          )}
          {status === "pending" && (
            <span className="badge badge-pending">⏳ Pending</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">
              {status === "completed" ? "All sites processed" : "Scanning websites…"}
            </span>
            <span className="progress-count">
              {processed} / {total} sites ({pct}%)
            </span>
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${pct}%` }}
            ></div>
          </div>
        </div>

        {/* Live feed */}
        <div className="live-feed" ref={feedRef}>
          {feed.length === 0 ? (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <span>Waiting for results…</span>
            </div>
          ) : (
            feed.map((item, i) => (
              <div className="feed-item" key={i}>
                <span className="feed-index">[{item.index}]</span>
                <span className="feed-url">{item.company_url}</span>
                {item.error ? (
                  <span className="feed-error">Error</span>
                ) : item.emails && item.emails.length > 0 ? (
                  <span className="feed-emails">
                    {item.emails.slice(0, 3).join(", ")}
                    {item.emails.length > 3 && ` +${item.emails.length - 3}`}
                  </span>
                ) : (
                  <span className="feed-none">No emails</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
