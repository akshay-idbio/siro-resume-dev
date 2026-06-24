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
      return "No supported resume files found. Low-cost supports PDF, DOCX and DOC.";
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
      setError("Low-cost analysis is already running. Please wait until it completes.");
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
      message: data.message || "Processing resumes with low-cost pipeline...",
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
          setError(data.error || data.message || "Low-cost resume analysis failed.");
        }
      } catch (err) {
        console.error(err);
        setError("Unable to fetch low-cost processing status.");
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
        message: "Uploading resumes and starting low-cost analysis...",
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
        message: result.message || "Low-cost analysis started.",
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
          "Low-cost analysis failed. Make sure Requirement Excel is already uploaded in the main app and low-cost backend is running on port 8008."
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
      <header className="lowcost-header">
        <div>
          <button className="lowcost-back-btn" onClick={() => navigate("/")}>
            � Back
          </button>

          <div className="lowcost-badge">Lowest Cost Pipeline</div>

          <h1>Low Cost Resume Screening</h1>

          <p>
            Uses Python resume parsing, aggressive requirement prefiltering, compact
            prompts, and one Claude Haiku call per resume. This mode is for direct
            cost comparison against Main, Hybrid, and CEO pipelines.
          </p>
        </div>
      </header>

      <main className="lowcost-container">
        <section className="lowcost-info-grid">
          <div className="lowcost-info-card">
            <span>Mode</span>
            <strong>Low Cost</strong>
            <p>Lowest AI spend target</p>
          </div>

          <div className="lowcost-info-card">
            <span>Backend</span>
            <strong>Port 8008</strong>
            <p>Separate pipeline API</p>
          </div>

          <div className="lowcost-info-card">
            <span>AI Calls</span>
            <strong>1 / CV</strong>
            <p>Claude only for final judgment</p>
          </div>

          <div className="lowcost-info-card">
            <span>Input</span>
            <strong>{selectedFiles.length}</strong>
            <p>Resume files selected</p>
          </div>
        </section>

        <section className="lowcost-card">
          <div className="lowcost-card-head">
            <div>
              <h2>Upload Resume Folder for Low Cost Screening</h2>
              <p>
                First upload Requirement Excel from the main page. Then upload the
                same resumes here to run the low-cost pipeline and compare cost/output.
              </p>
            </div>

            <button className="lowcost-secondary-btn" onClick={() => navigate("/")}>
              Upload / Change Requirement Excel
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
                <div className="lowcost-upload-icon">�</div>

                <strong>
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} resume files selected`
                    : "Click to select resume folder"}
                </strong>

                <span>Low-cost supports PDF, DOCX and DOC resumes</span>
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
                  <h3>Low Cost Analysis Running</h3>
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

              <h2>Low Cost Processing Completed</h2>

              <p>
                Low-cost output Excel has been generated successfully. Compare this
                sheet and cost against Main, Hybrid, and CEO outputs.
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
                    Download Low Cost Excel
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

        {(uploading || processed) && (
          <section className="lowcost-cost-card">
            <h3>Low Cost Token Usage & Estimated Cost</h3>

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
                <h4>�{Number(status.token_usage?.cost_inr || 0).toFixed(2)}</h4>
                <p>Estimated INR</p>
              </div>

              <div>
                <h4>
                  �
                  {Number(
                    status.token_usage?.cost_per_resume_inr || 0
                  ).toFixed(2)}
                </h4>
                <p>Cost / Resume</p>
              </div>
            </div>

            <p className="lowcost-note">
              Cost is reduced because Python extracts resume details locally, Python
              prefilters requirements, and Claude receives only compact top matches.
            </p>
          </section>
        )}

        {Array.isArray(status.recent_logs) && status.recent_logs.length > 0 && (
          <section className="lowcost-log-card">
            <h3>Low Cost Processing Logs</h3>

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
      </main>
    </div>
  );
}