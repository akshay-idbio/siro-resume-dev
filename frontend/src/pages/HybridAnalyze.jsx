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
      return "No supported resume files found. Hybrid supports PDF and DOCX.";
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
      setError("Hybrid analysis is already running. Please wait until it completes.");
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
          setError(data.message || "Hybrid resume analysis failed.");
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
        message: "Uploading resumes and starting hybrid analysis...",
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
        message: result.message || "Hybrid analysis started.",
      }));

      pollStatus();
    } catch (err) {
      console.error(err);
      setUploading(false);

      const detail = err?.response?.data?.detail;

      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Hybrid analysis failed. Make sure requirement Excel is already uploaded in the main app and hybrid backend is running on port 8007.");
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
    status.total > 0 ? Math.round(((status.processed || 0) / status.total) * 100) : 0;

  const downloadUrl = status.download_url
    ? getHybridDownloadUrl(status.download_url)
    : "";

  return (
    <div className="hybrid-page">
      <header className="hybrid-header">
        <div>
          <button className="hybrid-back-btn" onClick={() => navigate("/")}>
            ← Back
          </button>

          <div className="hybrid-badge">Hybrid Cost-Optimized Pipeline</div>

          <h1>Hybrid Resume Screening</h1>

          <p>
            Uses local parsing, rule-based prefiltering, and AI only for final
            shortlisted matching to reduce cost while keeping recruiter-ready output.
          </p>
        </div>
      </header>

      <main className="hybrid-container">
        <section className="hybrid-info-grid">
          <div className="hybrid-info-card">
            <span>Mode</span>
            <strong>Hybrid</strong>
            <p>Balanced accuracy + lower cost</p>
          </div>

          <div className="hybrid-info-card">
            <span>Backend</span>
            <strong>Port 8007</strong>
            <p>Separate from latest app</p>
          </div>

          <div className="hybrid-info-card">
            <span>Input</span>
            <strong>{selectedFiles.length}</strong>
            <p>Resume files selected</p>
          </div>
        </section>

        <section className="hybrid-card">
          <div className="hybrid-card-head">
            <div>
              <h2>Upload Resume Folder for Hybrid Screening</h2>
              <p>
                First upload Requirement Excel from the main page. Then upload the
                same resumes here to run the hybrid pipeline.
              </p>
            </div>

            <button className="hybrid-secondary-btn" onClick={() => navigate("/")}>
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
                accept=".pdf,.docx"
                className="hybrid-hidden-input"
                onChange={handleFolderChange}
              />

              <button
                className="hybrid-upload-box"
                onClick={openFolderPicker}
                disabled={uploading}
              >
                <div className="hybrid-upload-icon">⚡</div>

                <strong>
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} resume files selected`
                    : "Click to select resume folder"}
                </strong>

                <span>Hybrid supports PDF and DOCX resumes</span>
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
                  <h3>Hybrid Analysis Running</h3>
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
              <div className="hybrid-complete-icon">✓</div>

              <h2>Hybrid Processing Completed</h2>

              <p>
                Hybrid output Excel has been generated successfully with reduced
                AI usage.
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

        {(uploading || processed) && (
          <section className="hybrid-cost-card">
            <h3>Hybrid Token Usage & Estimated Cost</h3>

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
                <h4>₹{Number(status.token_usage?.cost_inr || 0).toFixed(2)}</h4>
                <p>Estimated INR</p>
              </div>

              <div>
                <h4>₹{Number(status.token_usage?.cost_per_resume_inr || 0).toFixed(2)}</h4>
                <p>Cost / Resume</p>
              </div>
            </div>

            <p className="hybrid-note">
              Hybrid cost is lower because resume text extraction and prefiltering are
              handled locally before AI matching.
            </p>
          </section>
        )}

        {Array.isArray(status.recent_logs) && status.recent_logs.length > 0 && (
          <section className="hybrid-log-card">
            <h3>Hybrid Processing Logs</h3>

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
      </main>
    </div>
  );
}