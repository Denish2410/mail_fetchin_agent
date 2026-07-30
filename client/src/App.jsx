import { useState, useCallback } from "react";
import FileUpload from "./components/FileUpload";
import JobProgress from "./components/JobProgress";
import ResultsTable from "./components/ResultsTable";
import JobHistory from "./components/JobHistory";
import "./index.css";

export default function App() {
  const [view, setView] = useState("upload"); // upload | progress | results | history
  const [currentJobId, setCurrentJobId] = useState(null);

  const handleJobStarted = useCallback((jobId) => {
    setCurrentJobId(jobId);
    setView("progress");
  }, []);

  const handleComplete = useCallback((jobId) => {
    setCurrentJobId(jobId);
    setView("results");
  }, []);

  const handleNewUpload = useCallback(() => {
    setCurrentJobId(null);
    setView("upload");
  }, []);

  const handleSelectJob = useCallback((jobId, targetView) => {
    setCurrentJobId(jobId);
    setView(targetView);
  }, []);

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand" onClick={handleNewUpload}>
          <div className="logo-icon">📧</div>
          <span>EmailFinder</span>
        </div>
        <div className="navbar-nav">
          <button
            className={`nav-btn ${view === "upload" ? "active" : ""}`}
            onClick={handleNewUpload}
          >
            Upload
          </button>
          <button
            className={`nav-btn ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
          >
            History
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {view === "upload" && <FileUpload onJobStarted={handleJobStarted} />}
        {view === "progress" && currentJobId && (
          <JobProgress jobId={currentJobId} onComplete={handleComplete} />
        )}
        {view === "results" && currentJobId && (
          <ResultsTable jobId={currentJobId} onNewUpload={handleNewUpload} />
        )}
        {view === "history" && <JobHistory onSelectJob={handleSelectJob} />}
      </main>
    </div>
  );
}
