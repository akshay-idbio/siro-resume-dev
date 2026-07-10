import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getHybridDownloadUrl,
  getHybridStatus,
  resetHybridStatus,
  startHybridAnalyze,
} from "../api/hybridApi";
import config from "../config";
import "./HybridAnalyze.css";

const initialStatus = {
  job_id: "",
  pipeline: "hybrid",
  status: "idle",
  message: "",
  total: 0,
  processed: 0,
  successful: 0,
  failed: 0,
  skipped: 0,
  current_file: "",
  output_filename: "",
  download_url: "",
  processing_time_seconds: 0,
  processing_time_text: "",
  token_usage: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
    cost_inr: 0,
    cost_per_resume_inr: 0,
  },
  recent_logs: [],
};

export default function HybridAnalyze() {
  const navigate = useNavigate();
  const requirementInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [requirementFile, setRequirementFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const loadExistingStatus = async () => {
      try {
        const data = await getHybridStatus();

        if (data && data.status && data.status !== "idle") {
          setStatus(data);

          if (data.status === "processing" || data.status === "queued") {
            setUploading(true);
            setProcessed(false);
            pollStatus();
          }

          if (data.status === "completed") {
            setUploading(false);
            setProcessed(true);
          }

          if (data.status === "failed" || data.status === "error") {
            setUploading(false);
            setProcessed(false);
            setError(data.message || "Hybrid resume review failed.");
          }
        }
      } catch (err) {
        console.error("Unable to load existing hybrid status", err);
      }
    };

    loadExistingStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const resetLocalStatus = () => {
    setStatus(initialStatus);
    setProcessed(false);
    setUploading(false);
  };

  const validateRequirementFile = (file) => {
    if (!file) return "Please select Requirement Excel first.";

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return "Invalid Requirement Excel. Supported formats: XLSX, XLS.";
    }

    return "";
  };

  const getValidResumeFiles = (files) => {
    return Array.from(files || []).filter((file) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        name.endsWith(".doc")
      );
    });
  };

  const validateResumeFiles = (files) => {
    if (!files || files.length === 0) {
      return "Please select at least one resume file.";
    }

    const allowedFiles = getValidResumeFiles(files);

    if (allowedFiles.length === 0) {
      return "No supported resume files found. Hybrid supports PDF, DOCX and DOC files.";
    }

    for (const file of allowedFiles) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > config.MAX_PDF_SIZE_MB) {
        return `${file.name} exceeds ${config.MAX_PDF_SIZE_MB} MB limit.`;
      }
    }

    return "";
  };

  const handleRequirementChange = (event) => {
    const file = event.target.files?.[0] || null;
    const err = validateRequirementFile(file);

    if (err) {
      setRequirementFile(null);
      setError(err);
      return;
    }

    setRequirementFile(file);
    setError("");
    resetLocalStatus();
  };

  const handleFolderChange = (event) => {
    const files = getValidResumeFiles(event.target.files);
    const err = validateResumeFiles(files);

    if (err) {
      setSelectedFiles([]);
      setError(err);
      return;
    }

    setSelectedFiles(files);
    setError("");
    resetLocalStatus();
  };

  const openRequirementPicker = () => {
    if (uploading) return;
    if (requirementInputRef.current) {
      requirementInputRef.current.value = "";
      requirementInputRef.current.click();
    }
  };

  const openFolderPicker = () => {
    if (uploading) {
      setError("Hybrid review is already running. Please wait until it completes.");
      return;
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
      folderInputRef.current.click();
    }
  };

  const pollStatus = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const data = await getHybridStatus();
        setStatus(data);

        if (data.status === "completed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setUploading(false);
          setProcessed(true);
        }

        if (data.status === "error" || data.status === "failed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setUploading(false);
          setProcessed(false);
          setError(data.message || "Hybrid resume review failed.");
        }
      } catch (err) {
        console.error(err);
        setError("Unable to fetch hybrid processing status.");
      }
    }, 3000);
  };

  const startHybrid = async () => {
    const reqErr = validateRequirementFile(requirementFile);
    if (reqErr) {
      setError(reqErr);
      return;
    }

    const resumeErr = validateResumeFiles(selectedFiles);
    if (resumeErr) {
      setError(resumeErr);
      return;
    }

    try {
      setUploading(true);
      setProcessed(false);
      setError("");

      setStatus({
        ...initialStatus,
        status: "queued",
        message: "Uploading requirement and resumes for hybrid review...",
        total: selectedFiles.length,
      });

      const result = await startHybridAnalyze({
        requirementFile,
        files: selectedFiles,
      });

      setStatus((prev) => ({
        ...prev,
        job_id: result.job_id || "",
        status: result.status || "queued",
        total: result.total || selectedFiles.length,
        message: result.message || "Hybrid review started.",
      }));

      pollStatus();
    } catch (err) {
      console.error(err);
      setUploading(false);

      const detail = err?.response?.data?.detail;
      if (typeof detail === "string") {
        setError(detail);
      } else if (detail?.message) {
        setError(detail.message);
      } else {
        setError("Hybrid review failed. Please check backend logs.");
      }
    }
  };

  const handleReset = async (callBackend = true) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setRequirementFile(null);
    setSelectedFiles([]);
    setUploading(false);
    setProcessed(false);
    setError("");
    setStatus(initialStatus);

    if (requirementInputRef.current) requirementInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";

    if (callBackend) {
      try {
        await resetHybridStatus();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const progress =
    status.total > 0
      ? Math.round(((status.processed || 0) / status.total) * 100)
      : 0;

  const downloadUrl = status.download_url
    ? getHybridDownloadUrl(status.download_url)
    : "";

  const tokenUsage = status.token_usage || {};

  return (
    <div className="hybrid-page">
      <div className="hybrid-bg-block hybrid-block-one" />
      <div className="hybrid-bg-block hybrid-block-two" />
      <div className="hybrid-bg-block hybrid-block-three" />

      <header className="hybrid-topbar">
        <div className="hybrid-brand">
          <div className="hybrid-logo">AI</div>
          <div>
            <span className="hybrid-small-badge">Balanced Screening Engine</span>
            <h1>Hybrid Resume Review</h1>
            <p>Requirement Excel + resumes, separate from High Accuracy mode.</p>
          </div>
        </div>

        <button className="hybrid-back-btn" onClick={() => navigate("/main-ai")}>
          Back to Main
        </button>
      </header>

      <main className="hybrid-container">
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "18px",
          }}
        >
          <button
            className="hybrid-secondary-btn"
            type="button"
            onClick={() => navigate("/main-ai")}
          >
            High Accuracy Mode
          </button>

          <button className="hybrid-primary-btn" type="button">
            Hybrid Mode
          </button>

          <button
            className="hybrid-secondary-btn"
            type="button"
            onClick={() => navigate("/lowcost-ai")}
          >
            Run Low Cost Mode
          </button>
        </div>

        <section className="hybrid-shell">
          <div className="hybrid-hero">
            <div className="hybrid-hero-copy">
              <span className="hybrid-section-label">HYBRID ENGINE</span>
              <h2>Run Hybrid Resume Matching</h2>
              <p>
                Upload Requirement Excel and resume folder here. Hybrid uses
                local text extraction and shortlist logic before AI matching.
              </p>

              <div className="hybrid-hero-actions">
                <button
                  className="hybrid-secondary-btn"
                  onClick={openRequirementPicker}
                  disabled={uploading}
                >
                  Select Requirement Excel
                </button>

                <button
                  className="hybrid-secondary-btn"
                  onClick={openFolderPicker}
                  disabled={uploading}
                >
                  Select Resume Folder
                </button>

                <button
                  className="hybrid-primary-btn"
                  onClick={startHybrid}
                  disabled={uploading || !requirementFile || !selectedFiles.length}
                >
                  {uploading ? "Running..." : "Start Hybrid Review"}
                </button>
              </div>

              <input
                ref={requirementInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hybrid-hidden-input"
                onChange={handleRequirementChange}
              />

              <input
                ref={folderInputRef}
                type="file"
                className="hybrid-hidden-input"
                webkitdirectory="true"
                directory="true"
                multiple
                onChange={handleFolderChange}
              />
            </div>

            <div className="hybrid-status-panel">
              <div className="hybrid-status-top">
                <span>Status</span>
                <b>{uploading ? "Running" : processed ? "Completed" : "Ready"}</b>
              </div>

              <div className="hybrid-flow-list">
                <div className={requirementFile ? "hybrid-flow-item done" : "hybrid-flow-item"}>
                  <span>01</span>
                  <div>
                    <strong>Requirement Excel</strong>
                    <p>{requirementFile ? requirementFile.name : "Not selected"}</p>
                  </div>
                </div>

                <div className={selectedFiles.length ? "hybrid-flow-item done" : "hybrid-flow-item"}>
                  <span>02</span>
                  <div>
                    <strong>Resume Files</strong>
                    <p>{selectedFiles.length ? `${selectedFiles.length} files selected` : "Not selected"}</p>
                  </div>
                </div>

                <div className={processed ? "hybrid-flow-item done" : "hybrid-flow-item"}>
                  <span>03</span>
                  <div>
                    <strong>Hybrid Excel</strong>
                    <p>{processed ? "Output ready" : "Waiting"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="hybrid-info-grid">
            <div className="hybrid-info-card">
              <span>Mode</span>
              <strong>Hybrid</strong>
              <p>Balanced cost and accuracy.</p>
            </div>
            <div className="hybrid-info-card">
              <span>Input</span>
              <strong>XLSX + Resumes</strong>
              <p>PDF, DOCX and DOC supported.</p>
            </div>
          </section>

          {error && <div className="hybrid-error">{error}</div>}

          {(uploading || status.status === "queued" || status.status === "processing") && (
            <section className="hybrid-running-card">
              <div className="hybrid-running-top">
                <div>
                  <span className="hybrid-section-label">RUNNING</span>
                  <h3>Hybrid review in progress</h3>
                  <p>{status.message || "Processing resumes..."}</p>
                </div>
                <strong>{progress}%</strong>
              </div>

              <div className="hybrid-progress-bar">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="hybrid-runtime-grid">
                <div>
                  <span>Processed</span>
                  <strong>{status.processed || 0} / {status.total || selectedFiles.length}</strong>
                </div>
                <div>
                  <span>Success</span>
                  <strong>{status.successful || 0}</strong>
                </div>
                <div>
                  <span>Skipped</span>
                  <strong>{status.skipped || 0}</strong>
                </div>
                <div>
                  <span>Failed</span>
                  <strong>{status.failed || 0}</strong>
                </div>
              </div>

              {status.current_file && (
                <p className="hybrid-note">
                  Current file: <strong>{status.current_file}</strong>
                </p>
              )}
            </section>
          )}

          {processed && (
            <section className="hybrid-success-card">
              <div className="hybrid-complete-icon"></div>
              <h2>Hybrid review completed</h2>
              <p>Hybrid output Excel has been generated successfully.</p>

              <div className="hybrid-result-grid">
                <div>
                  <span>Total</span>
                  <strong>{status.total || selectedFiles.length}</strong>
                </div>
                <div>
                  <span>Processed</span>
                  <strong>{status.processed || 0}</strong>
                </div>
                <div>
                  <span>Success</span>
                  <strong>{status.successful || 0}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>{status.processing_time_text || `${status.processing_time_seconds || 0}s`}</strong>
                </div>
              </div>

              <div className="hybrid-actions">
                {downloadUrl && (
                  <a
                    className="hybrid-download-btn"
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Hybrid Excel
                  </a>
                )}

                <button
                  className="hybrid-secondary-btn"
                  onClick={() => handleReset(true)}
                >
                  Run Another Hybrid Batch
                </button>
              </div>
            </section>
          )}

          <section className="hybrid-cost-card">
            <span className="hybrid-section-label">COST SUMMARY</span>
            <h3>Hybrid token and cost usage</h3>

            <div className="hybrid-cost-grid">
              <div>
                <span>Input Tokens</span>
                <h4>{Number(tokenUsage.input_tokens || 0).toLocaleString("en-IN")}</h4>
              </div>
              <div>
                <span>Output Tokens</span>
                <h4>{Number(tokenUsage.output_tokens || 0).toLocaleString("en-IN")}</h4>
              </div>
              <div>
                <span>Total Tokens</span>
                <h4>{Number(tokenUsage.total_tokens || 0).toLocaleString("en-IN")}</h4>
              </div>
              <div>
                <span>Cost USD</span>
                <h4>${Number(tokenUsage.cost_usd || 0).toFixed(4)}</h4>
              </div>
              <div>
                <span>Cost INR</span>
                <h4>�{Number(tokenUsage.cost_inr || 0).toFixed(2)}</h4>
              </div>
              <div>
                <span>Cost / Resume</span>
                <h4>�{Number(tokenUsage.cost_per_resume_inr || 0).toFixed(2)}</h4>
              </div>
            </div>
          </section>

          {Array.isArray(status.recent_logs) && status.recent_logs.length > 0 && (
            <section className="hybrid-log-card">
              <span className="hybrid-section-label">PROCESSING LOGS</span>
              <h3>Hybrid processing logs</h3>

              <div className="hybrid-log-list">
                {status.recent_logs.map((log, index) => (
                  <div className="hybrid-log-item" key={`${log.time || index}-${index}`}>
                    <span>{log.time || "-"}</span>
                    <p>{log.message || String(log)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
