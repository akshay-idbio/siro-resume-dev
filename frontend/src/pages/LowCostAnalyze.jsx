import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startLowCostAnalyze,
  getLowCostStatus,
  getLowCostDownloadUrl,
  resetLowCostStatus,
} from "../api/lowCostApi";
import config from "../config";
import "./LowCostAnalyze.css";

export default function LowCostAnalyze() {
  const navigate = useNavigate();
  const folderInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [error, setError] = useState("");
  

  const emptyStatus = {
    job_id: "",
    pipeline: "lowcost",
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
    config: {},
  };

  const [status, setStatus] = useState(emptyStatus);

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
      return (
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        name.endsWith(".doc")
      );
    });

    if (allowedFiles.length === 0) {
      return "No supported resume files found. Cost Control Review supports PDF, DOCX, and DOC resumes.";
    }

    for (const file of allowedFiles) {
      const sizeMb = file.size / (1024 * 1024);

      if (config.MAX_PDF_SIZE_MB && sizeMb > config.MAX_PDF_SIZE_MB) {
        return `${file.name} exceeds ${config.MAX_PDF_SIZE_MB} MB limit.`;
      }
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

  const openFolderPicker = () => {
    if (uploading) {
      setError("Cost Control Review is already running. Please wait until it completes.");
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

    await startLowCost(files);
  };

  const normalizeBackendStatus = (data, jobId) => {
    const summary = data.summary || {};
    const configObj = summary.config || {};

    const progress = Number(data.progress || 0);
    const total = Number(
      data.total || summary.total_files || selectedFiles.length || 0
    );

    const totalCostInr = Number(summary.total_cost_inr || 0);
    const totalCostUsd = Number(summary.total_cost_usd || 0);
    const totalFiles = Number(
      summary.total_files || total || selectedFiles.length || 0
    );

    return {
      job_id: data.job_id || jobId || "",
      pipeline: "lowcost",
      status: data.status || "running",
      message: data.message || "Processing resumes with Cost Control Review...",
      total,
      processed: progress,
      successful: Number(summary.success_resumes || 0),
      failed: Number(summary.error_resumes || 0),
      skipped: Array.isArray(data.skipped_files) ? data.skipped_files.length : 0,
      current_file: data.current_file || "",
      output_filename: summary.output_filename || data.output_filename || "",
      download_url: summary.download_url || data.download_url || "",
      processing_time_seconds: Number(summary.duration_seconds || 0),
      token_usage: {
        input_tokens: Number(summary.input_tokens || 0),
        output_tokens: Number(summary.output_tokens || 0),
        total_tokens: Number(summary.total_tokens || 0),
        cost_usd: totalCostUsd,
        cost_inr: totalCostInr,
        cost_per_resume_inr:
          Number(summary.avg_cost_inr_per_resume || 0) ||
          (totalFiles > 0 ? totalCostInr / totalFiles : 0),
      },
      recent_logs: data.log || data.recent_logs || [],
      config: configObj,
    };
  };

  const pollStatus = (jobId) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const data = await getLowCostStatus(jobId);
        const normalized = normalizeBackendStatus(data, jobId);

        setStatus(normalized);

        if (data.status === "done") {
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
          setError(data.error || data.message || "Cost Control Review failed.");
        }
      } catch (err) {
        console.error(err);
        setError("Unable to fetch Cost Control Review status.");
      }
    }, 3000);
  };

  const startLowCost = async (filesToUpload = selectedFiles) => {
    if (!filesToUpload.length) {
      setError("Please select resume files first.");
      return;
    }

    try {
      setUploading(true);
      setProcessed(false);
      setError("");

      setStatus({
        ...emptyStatus,
        status: "queued",
        message: "Uploading resumes and starting Cost Control Review...",
        total: filesToUpload.length,
      });

      const result = await startLowCostAnalyze({
        files: filesToUpload,
      });

      const jobId = result.job_id || "";

      setStatus((prev) => ({
        ...prev,
        job_id: jobId,
        status: result.status || "queued",
        total: result.total || filesToUpload.length,
        message: result.message || "Cost Control Review started.",
      }));

      pollStatus(jobId);
    } catch (err) {
      console.error(err);
      setUploading(false);

      const detail = err?.response?.data?.detail;

      if (typeof detail === "string") {
        setError(detail);
      } else if (detail?.message) {
        setError(detail.message);
      } else {
        setError(
          "Cost Control Review failed. Please make sure the Requirement Excel is already uploaded from the main dashboard."
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
    setStatus(emptyStatus);

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }

    if (callBackend) {
      try {
        await resetLowCostStatus();
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
    ? getLowCostDownloadUrl(status.download_url)
    : "";

  return (
    <div className="lowcost-page">
      <div className="lowcost-bg-block lowcost-block-one" />
      <div className="lowcost-bg-block lowcost-block-two" />
      <div className="lowcost-bg-block lowcost-block-three" />

      <header className="lowcost-topbar">
        <div className="lowcost-brand">
          <div className="lowcost-logo">AI</div>

          <div>
            <span className="lowcost-small-badge">Cost Control Engine</span>
            <h1>Cost Control Review</h1>
            <p>
              A lightweight screening flow for cost-aware resume matching, useful
              when you need fast comparison output with controlled AI usage.
            </p>
          </div>
        </div>

        <button className="lowcost-back-btn" onClick={() => navigate("/")}>
          Back to Dashboard
        </button>
      </header>

      <main className="lowcost-container">
        <section className="lowcost-shell">
          <div className="lowcost-hero">
            <div className="lowcost-hero-copy">
              <span className="lowcost-section-label">COST CONTROL ENGINE</span>

              <h2>
                Screen resumes with
                <br />
                cleaner cost visibility.
              </h2>

              <p>
                Use this review when you want a leaner screening run for comparison.
                Requirement Excel should already be uploaded from the main dashboard.
              </p>

              <div className="lowcost-hero-actions">
                <button
                  className="lowcost-primary-btn"
                  onClick={openFolderPicker}
                  disabled={uploading}
                >
                  {selectedFiles.length > 0
                    ? "Change resume folder"
                    : "Select resume folder"}
                </button>

                <button
                  className="lowcost-secondary-btn"
                  onClick={() => navigate("/")}
                >
                  Change requirement Excel
                </button>
              </div>
            </div>

            <div className="lowcost-status-panel">
              <div className="lowcost-status-top">
                <span>Review Setup</span>
                <b>{uploading ? "Running" : processed ? "Completed" : "Ready"}</b>
              </div>

              <div className="lowcost-flow-list">
                <div className="lowcost-flow-item done">
                  <span>01</span>
                  <div>
                    <strong>Requirement Sheet</strong>
                    <p>Loaded from main dashboard</p>
                  </div>
                </div>

                <div className={selectedFiles.length ? "lowcost-flow-item done" : "lowcost-flow-item"}>
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

                <div className={processed ? "lowcost-flow-item done" : "lowcost-flow-item"}>
                  <span>03</span>
                  <div>
                    <strong>Cost Review Excel</strong>
                    <p>{processed ? "Report generated" : "Generated after review"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="lowcost-info-grid">
            <div className="lowcost-info-card">
              <span>Review Type</span>
              <strong>Cost Control</strong>
              <p>Lean screening mode</p>
            </div>

            <div className="lowcost-info-card">
              <span>AI Usage</span>
              <strong>Optimized</strong>
              <p>Designed for lower spend</p>
            </div>

            <div className="lowcost-info-card">
              <span>Output</span>
              <strong>Excel</strong>
              <p>Recruiter-ready report</p>
            </div>

            <div className="lowcost-info-card">
              <span>Selected Files</span>
              <strong>{selectedFiles.length}</strong>
              <p>PDF / DOCX / DOC resumes</p>
            </div>
          </section>

          <section className="lowcost-card">
            <div className="lowcost-card-head">
              <div>
                <span className="lowcost-section-label">UPLOAD RESUMES</span>
                <h2>Start Cost Control Review</h2>
                <p>
                  Upload the same resume folder here to generate a separate
                  cost-focused screening output for comparison.
                </p>
              </div>

              <button className="lowcost-secondary-btn" onClick={() => navigate("/")}>
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
                  accept=".pdf,.docx,.doc"
                  className="lowcost-hidden-input"
                  onChange={handleFolderChange}
                />

                <button
                  className="lowcost-upload-box"
                  onClick={openFolderPicker}
                  disabled={uploading}
                >
                  <div className="lowcost-upload-icon">AI</div>

                  <strong>
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} resume files selected`
                      : "Select resume folder"}
                  </strong>

                  <span>Supports PDF, DOCX, and DOC resumes</span>
                </button>

                {selectedFiles.length > 0 && (
                  <div className="lowcost-file-list">
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

            {error && <div className="lowcost-error">{error}</div>}

            {uploading && (
              <section className="lowcost-running-card">
                <div className="lowcost-running-top">
                  <div>
                    <span className="lowcost-section-label">RUNNING</span>
                    <h3>Cost Control Review in progress</h3>
                    <p>{status.message || "Processing resumes..."}</p>
                  </div>

                  <strong>{progressPercent}%</strong>
                </div>

                <div className="lowcost-progress-bar">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="lowcost-runtime-grid">
                  <div>
                    <span>Progress</span>
                    <strong>
                      {status.processed || 0} /{" "}
                      {status.total || selectedFiles.length}
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
                  <p className="lowcost-note">
                    Current file: <strong>{status.current_file}</strong>
                  </p>
                )}
              </section>
            )}

            {processed && (
              <section className="lowcost-success-card">
                <div className="lowcost-complete-icon"></div>

                <h2>Cost Control Review completed</h2>

                <p>
                  Cost-focused output Excel has been generated successfully for
                  comparison with the other screening engines.
                </p>

                <div className="lowcost-result-grid">
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

                <div className="lowcost-actions">
                  {downloadUrl && (
                    <a
                      className="lowcost-download-btn"
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download Cost Review Excel
                    </a>
                  )}

                  <button
                    className="lowcost-secondary-btn"
                    onClick={() => handleReset(true)}
                  >
                    Process Another Folder
                  </button>
                </div>
              </section>
            )}
          </section>

          {processed && (
            <section className="lowcost-cost-card">
              <span className="lowcost-section-label">COST SUMMARY</span>
              <h3>Token usage and estimated cost</h3>

              <div className="lowcost-cost-grid">
                <div>
                  <h4>
                    {Number(status.token_usage?.input_tokens || 0).toLocaleString()}
                  </h4>
                  <p>Input Tokens</p>
                </div>

                <div>
                  <h4>
                    {Number(status.token_usage?.output_tokens || 0).toLocaleString()}
                  </h4>
                  <p>Output Tokens</p>
                </div>

                <div>
                  <h4>
                    {Number(status.token_usage?.total_tokens || 0).toLocaleString()}
                  </h4>
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
                  <h4>
                    INR{" "}
                    {Number(status.token_usage?.cost_per_resume_inr || 0).toFixed(2)}
                  </h4>
                  <p>Cost / Resume</p>
                </div>
              </div>

              <p className="lowcost-note">
                This review is designed for lower-cost comparison by sending a
                smaller, more focused resume-matching request for each candidate.
              </p>
            </section>
          )}

          {Array.isArray(status.recent_logs) && status.recent_logs.length > 0 && (
            <section className="lowcost-log-card">
              <span className="lowcost-section-label">PROCESSING LOGS</span>
              <h3>Cost Control processing logs</h3>

              <div className="lowcost-log-list">
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