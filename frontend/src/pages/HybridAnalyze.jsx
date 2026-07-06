import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startHybridAnalyze,
  getHybridStatus,
  getHybridDownloadUrl,
  resetHybridStatus,
} from "../api/hybridApi";
import config from "../config";
import "./HybridAnalyze.css";

export default function HybridAnalyze() {
  const navigate = useNavigate();
  const folderInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState({
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
    token_usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
      cost_inr: 0,
      cost_per_resume_inr: 0,
    },
    recent_logs: [],
  });

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const validateFiles = (files) => {
    if (!files || files.length === 0) {
      return "Please select at least one resume file.";
    }

    const allowedFiles = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith(".pdf") || name.endsWith(".docx");
    });

    if (allowedFiles.length === 0) {
      return "No supported resume files found. Hybrid review supports PDF and DOCX files.";
    }

    for (const file of allowedFiles) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > config.MAX_PDF_SIZE_MB) {
        return `${file.name} exceeds ${config.MAX_PDF_SIZE_MB} MB limit.`;
      }
    }

    return "";
  };

  const getValidResumeFiles = (files) => {
    return Array.from(files || []).filter((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith(".pdf") || name.endsWith(".docx");
    });
  };

  const openFolderPicker = () => {
    if (uploading) {
      setError("Hybrid review is already running. Please wait until it completes.");
      return;
    }

    if (processed) {
      handleReset(false);
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
      folderInputRef.current.click();
    }
  };

  const handleFolderChange = async (event) => {
    const files = getValidResumeFiles(event.target.files);
    const errorMessage = validateFiles(files);

    if (errorMessage) {
      setError(errorMessage);
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles(files);
    setError("");
    setProcessed(false);

    await startHybrid(files);
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

  const startHybrid = async (filesToUpload = selectedFiles) => {
    if (!filesToUpload.length) {
      setError("Please select resume files first.");
      return;
    }

    try {
      setUploading(true);
      setProcessed(false);
      setError("");

      setStatus({
        job_id: "",
        pipeline: "hybrid",
        status: "queued",
        message: "Uploading resumes and starting hybrid review...",
        total: filesToUpload.length,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        current_file: "",
        output_filename: "",
        download_url: "",
        processing_time_seconds: 0,
        token_usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost_usd: 0,
          cost_inr: 0,
          cost_per_resume_inr: 0,
        },
        recent_logs: [],
      });

      const result = await startHybridAnalyze({
        files: filesToUpload,
      });

      setStatus((prev) => ({
        ...prev,
        job_id: result.job_id || "",
        status: result.status || "queued",
        total: result.total || filesToUpload.length,
        message: result.message || "Hybrid review started.",
      }));

      pollStatus();
    } catch (err) {
      console.error(err);
      setUploading(false);

      const detail = err?.response?.data?.detail;

      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError(
          "Hybrid review failed. Make sure Requirement Excel is uploaded from the main dashboard and hybrid backend is running on port 8007."
        );
      }
    }
  };

  const handleReset = async (callBackend = true) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setSelectedFiles([]);
    setUploading(false);
    setProcessed(false);
    setError("");

    setStatus({
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
      token_usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        cost_inr: 0,
        cost_per_resume_inr: 0,
      },
      recent_logs: [],
    });

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }

    if (callBackend) {
      try {
        await resetHybridStatus();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const progressPercent =
    status.total > 0
      ? Math.round(((status.processed || 0) / status.total) * 100)
      : 0;

  const downloadUrl = status.download_url
    ? getHybridDownloadUrl(status.download_url)
    : "";

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
            <p>
              A cost-aware screening flow that combines local resume parsing,
              requirement pre-filtering, and focused AI review for final matching.
            </p>
          </div>
        </div>

        <button className="hybrid-back-btn" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </header>

      <main className="hybrid-container">
        <section className="hybrid-shell">
          <div className="hybrid-hero">
            <div className="hybrid-hero-copy">
              <span className="hybrid-section-label">HYBRID ENGINE</span>

              <h2>
                Review resumes with
                <br />
                balanced cost and accuracy.
              </h2>

              <p>
                Use this engine when you want a cleaner balance between deep
                screening quality and controlled AI usage. Requirement Excel should
                already be uploaded from the main dashboard.
              </p>

              <div className="hybrid-hero-actions">
                <button
                  className="hybrid-primary-btn"
                  onClick={openFolderPicker}
                  disabled={uploading}
                >
                  {selectedFiles.length > 0
                    ? "Change resume folder"
                    : "Select resume folder"}
                </button>

                <button
                  className="hybrid-secondary-btn"
                  onClick={() => navigate("/")}
                >
                  Change requirement Excel
                </button>
              </div>
            </div>

            <div className="hybrid-status-panel">
              <div className="hybrid-status-top">
                <span>Review Setup</span>
                <b>{uploading ? "Running" : processed ? "Completed" : "Ready"}</b>
              </div>

              <div className="hybrid-flow-list">
                <div className="hybrid-flow-item done">
                  <span>01</span>
                  <div>
                    <strong>Requirement Sheet</strong>
                    <p>Loaded from main dashboard</p>
                  </div>
                </div>

                <div className={selectedFiles.length ? "hybrid-flow-item done" : "hybrid-flow-item"}>
                  <span>02</span>
                  <div>
                    <strong>Resume Folder</strong>
                    <p>
                      {selectedFiles.length
                        ? `${selectedFiles.length} files selected`
                        : "Waiting for resumes"}
                    </p>
                  </div>
                </div>

                <div className={processed ? "hybrid-flow-item done" : "hybrid-flow-item"}>
                  <span>03</span>
                  <div>
                    <strong>Hybrid Excel</strong>
                    <p>{processed ? "Report generated" : "Generated after review"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="hybrid-info-grid">
            <div className="hybrid-info-card">
              <span>Engine Type</span>
              <strong>Hybrid</strong>
              <p>Balanced review mode</p>
            </div>

           

            <div className="hybrid-info-card">
              <span>Selected Files</span>
              <strong>{selectedFiles.length}</strong>
              <p>PDF / DOCX resumes</p>
            </div>
          </section>

          <section className="hybrid-card">
            <div className="hybrid-card-head">
              <div>
                <span className="hybrid-section-label">UPLOAD RESUMES</span>
                <h2>Start hybrid resume review</h2>
                <p>
                  Upload the same resume folder here to process it through the
                  hybrid engine. This produces a separate output for comparison.
                </p>
              </div>

              <button className="hybrid-secondary-btn" onClick={() => navigate("/")}>
                Main Dashboard
              </button>
            </div>

            {!processed && (
              <>
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  webkitdirectory="true"
                  directory="true"
                  accept=".pdf,.docx"
                  className="hybrid-hidden-input"
                  onChange={handleFolderChange}
                />

                <button
                  className="hybrid-upload-box"
                  onClick={openFolderPicker}
                  disabled={uploading}
                >
                  <div className="hybrid-upload-icon">AI</div>

                  <strong>
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} resume files selected`
                      : "Select resume folder"}
                  </strong>

                  <span>Supports PDF and DOCX resumes</span>
                </button>

                {selectedFiles.length > 0 && (
                  <div className="hybrid-file-list">
                    <h3>Selected Files</h3>

                    {selectedFiles.slice(0, 15).map((file, index) => (
                      <div key={`${file.name}-${index}`}>
                        <span>{file.webkitRelativePath || file.name}</span>
                        <small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small>
                      </div>
                    ))}

                    {selectedFiles.length > 15 && (
                      <div>
                        <span>+ {selectedFiles.length - 15} more files</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {error && <div className="hybrid-error">{error}</div>}

            {uploading && (
              <section className="hybrid-running-card">
                <div className="hybrid-running-top">
                  <div>
                    <span className="hybrid-section-label">RUNNING</span>
                    <h3>Hybrid review in progress</h3>
                    <p>{status.message || "Processing resumes..."}</p>
                  </div>

                  <strong>{progressPercent}%</strong>
                </div>

                <div className="hybrid-progress-bar">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="hybrid-runtime-grid">
                  <div>
                    <span>Progress</span>
                    <strong>
                      {status.processed || 0} / {status.total || selectedFiles.length}
                    </strong>
                  </div>

                  <div>
                    <span>Successful</span>
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
                <div className="hybrid-complete-icon"></div>

                <h2>Hybrid review completed</h2>

                <p>
                  Hybrid output Excel has been generated successfully for comparison
                  with the main screening output.
                </p>

                <div className="hybrid-result-grid">
                  <div>
                    <span>Total Files</span>
                    <strong>{status.total || selectedFiles.length}</strong>
                  </div>

                  <div>
                    <span>Processed</span>
                    <strong>{status.processed || 0}</strong>
                  </div>

                  <div>
                    <span>Successful</span>
                    <strong>{status.successful || 0}</strong>
                  </div>

                  <div>
                    <span>Time</span>
                    <strong>{status.processing_time_seconds || 0}s</strong>
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
                    Process Another Folder
                  </button>
                </div>
              </section>
            )}
          </section>

          { processed && (
            <section className="hybrid-cost-card">
              <span className="hybrid-section-label">COST SUMMARY</span>
              <h3>Token usage and estimated cost</h3>

              <div className="hybrid-cost-grid">
                <div>
                  <h4>{Number(status.token_usage?.input_tokens || 0).toLocaleString()}</h4>
                  <p>Input Tokens</p>
                </div>

                <div>
                  <h4>{Number(status.token_usage?.output_tokens || 0).toLocaleString()}</h4>
                  <p>Output Tokens</p>
                </div>

                <div>
                  <h4>{Number(status.token_usage?.total_tokens || 0).toLocaleString()}</h4>
                  <p>Total Tokens</p>
                </div>

                <div>
                  <h4>${Number(status.token_usage?.cost_usd || 0).toFixed(4)}</h4>
                  <p>Estimated USD</p>
                </div>

                <div>
                  <h4>INR {Number(status.token_usage?.cost_inr || 0).toFixed(2)}</h4>
                  <p>Estimated INR</p>
                </div>

                <div>
                  <h4>INR {Number(status.token_usage?.cost_per_resume_inr || 0).toFixed(2)}</h4>
                  <p>Cost / Resume</p>
                </div>
              </div>

              <p className="hybrid-note">
                Hybrid review reduces AI usage by doing resume extraction and
                requirement pre-filtering before the final AI matching step.
              </p>
            </section>
          )}

          {Array.isArray(status.recent_logs) && status.recent_logs.length > 0 && (
            <section className="hybrid-log-card">
              <span className="hybrid-section-label">PROCESSING LOGS</span>
              <h3>Hybrid processing logs</h3>

              <div className="hybrid-log-list">
                {status.recent_logs.map((log, index) => (
                  <div key={index}>
                    <span>{log.time || log.ts || "-"}</span>
                    <p>{log.message || log.msg || "-"}</p>
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