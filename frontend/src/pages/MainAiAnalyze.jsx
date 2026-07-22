import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";


import {
  clearAuthSession,
  createJob,
  downloadJobOutput,
  getCurrentUser,
  getJob,
  getJobResults,
  getJobResumes,
  getJobs,
  startJob,
  uploadResumeBatch,
} from "../api/api";
import config from "../config";
import "./MainAiAnalyze.css";

const parseBackendUTCDate = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Backend stores UTC but may send without Z. Force UTC before displaying IST.
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(raw);
  const normalized = hasTimezone ? raw : `${raw}Z`;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date;
};

const formatISTTime = (value) => {
  const date = parseBackendUTCDate(value);
  if (!date) return "-";

  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const formatISTDateTime = (value) => {
  const date = parseBackendUTCDate(value);
  if (!date) return "-";

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};


const getJobTimeText = (job) => {
  if (!job) return "-";

  if (job.processing_time_text) {
    return job.processing_time_text;
  }

  if (job.processing_time_seconds !== undefined && job.processing_time_seconds !== null) {
    const seconds = Number(job.processing_time_seconds || 0);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
  }

  return "-";
};

const getAverageResumeTime = (job) => {
  if (!job) return "-";

  if (job.average_seconds_per_resume !== undefined && job.average_seconds_per_resume !== null) {
    return `${Number(job.average_seconds_per_resume).toFixed(2)}s`;
  }

  return "-";
};


const POLL_MS = 5000;
const UPLOAD_BATCH_SIZE = 25;
const MAX_RESUMES_PER_JOB = 2000;
const MAX_UPLOAD_RETRIES = 3;

const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];

const EMPTY_SELECTION_SUMMARY = {
  source: "",
  selectedTotal: 0,
  validCount: 0,
  unsupportedCounts: {},
  nestedFileCount: 0,
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function getProgress(job) {
  const total = Number(job?.total_resumes || 0);
  const processed = Number(job?.processed || 0);

  if (!total) return 0;

  return Math.min(100, Math.round((processed / total) * 100));
}

export default function MainAiAnalyze() {
  const navigate = useNavigate();

  const requirementRef = useRef(null);
  const resumesRef = useRef(null);
  const folderRef = useRef(null);
  const pollRef = useRef(null);
  const warningTimerRef = useRef(null);

  const [user] = useState(getCurrentUser());

  const [requirementFile, setRequirementFile] = useState(null);
  const [resumeFiles, setResumeFiles] = useState([]);

  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState("");
  const [activeJob, setActiveJob] = useState(null);
  const [resumeLogs, setResumeLogs] = useState([]);
  const [results, setResults] = useState([]);

  const [loadingJobs, setLoadingJobs] = useState(false);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const progressPercent = getProgress(activeJob);
  const [selectionSummary, setSelectionSummary] = useState(
    EMPTY_SELECTION_SUMMARY
  );

  const [temporaryWarning, setTemporaryWarning] = useState("");

  useEffect(() => {
    loadJobs();



    return () => {
      stopPolling();

      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const loadJobs = async () => {
    try {
      setLoadingJobs(true);
      const data = await getJobs(30);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message || "Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  };

  const refreshJob = async (jobId = activeJobId) => {
    if (!jobId) return null;

    const [jobData, resumeData, resultData] = await Promise.all([
      getJob(jobId),
      getJobResumes(jobId),
      getJobResults(jobId),
    ]);

    const job = jobData.job;

    setActiveJob(job);
    setResumeLogs(resumeData.resumes || []);
    setResults(resultData.results || []);

    return job;
  };

  const startPolling = (jobId) => {
    stopPolling();

    pollRef.current = setInterval(async () => {
      try {
        const job = await refreshJob(jobId);

        if (["completed", "failed"].includes(job?.status)) {
          stopPolling();
          await loadJobs();
        }
      } catch (err) {
        setError(err.message || "Failed to refresh job status");
      }
    }, POLL_MS);
  };

  const handleLogout = () => {
    stopPolling();
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  const handleRequirementSelect = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setRequirementFile(file);
    setNotice(`Requirement selected: ${file.name}`);
    setError("");
  };

  const handleResumeSelect = (event, source = "files") => {
    const selectedFiles = Array.from(
      event.target.files || []
    );

    if (!selectedFiles.length) {
      setResumeFiles([]);
      setSelectionSummary({
        ...EMPTY_SELECTION_SUMMARY,
        source,
      });

      event.target.value = "";
      return;
    }

    const validFiles = [];
    const unsupportedCounts = {};
    let nestedFileCount = 0;

    selectedFiles.forEach((file) => {


      const extension = getFileExtension(file.name);

      if (
        ALLOWED_RESUME_EXTENSIONS.includes(extension)
      ) {
        validFiles.push(file);
        return;
      }

      unsupportedCounts[extension] =
        (unsupportedCounts[extension] || 0) + 1;
    });

    setResumeFiles(validFiles);

    setSelectionSummary({
      source,
      selectedTotal: selectedFiles.length,
      validCount: validFiles.length,
      unsupportedCounts,
      nestedFileCount: 0,
    });

    setTemporaryWarning("");
    setError("");

    if (validFiles.length > 0) {
      setNotice(
        `${validFiles.length} supported resume file(s) ready`
      );
    } else {
      setNotice("");
    }

    // Allows selecting the same folder/files again.
    event.target.value = "";
  };

  const getFileExtension = (filename) => {
    const name = String(filename || "").trim().toLowerCase();
    const lastDotIndex = name.lastIndexOf(".");

    if (lastDotIndex <= 0 || lastDotIndex === name.length - 1) {
      return "no extension";
    }

    return name.slice(lastDotIndex);
  };

  const formatUnsupportedCounts = (counts = {}) => {
    return Object.entries(counts)
      .map(([extension, count]) => {
        const label =
          extension === "no extension"
            ? "file(s) without extension"
            : extension.replace(".", "").toUpperCase();

        return `${count} ${label}`;
      })
      .join(", ");
  };

  const buildSelectionWarning = () => {
    const messages = [];

    const unsupportedText = formatUnsupportedCounts(
      selectionSummary.unsupportedCounts
    );

    if (unsupportedText) {
      messages.push(
        `${unsupportedText} file(s) skipped. ` +
        `Currently only PDF, DOC and DOCX resumes are supported.`
      );
    }

    

    return messages.join(" ");
  };

  const showTemporaryWarning = (message) => {
    if (!message) return;

    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }

    setTemporaryWarning(message);

    warningTimerRef.current = setTimeout(() => {
      setTemporaryWarning("");
      warningTimerRef.current = null;
    }, 7000);
  };

  const uploadBatchWithRetry = async ({
    jobId,
    batchFiles,
    batchNumber,
    totalBatchCount,
  }) => {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt += 1) {
      try {
        setNotice(
          `Uploading batch ${batchNumber} of ${totalBatchCount} ` +
          `(attempt ${attempt})...`
        );

        const batchId = `${jobId}_batch_${batchNumber}`;

        return await uploadResumeBatch({
          jobId,
          batchId,
          resumes: batchFiles,
          onUploadProgress: ({ percentage }) => {
            const completedBeforeBatch =
              (batchNumber - 1) * UPLOAD_BATCH_SIZE;

            const currentBatchEquivalent =
              (percentage / 100) * batchFiles.length;

            const estimatedUploaded =
              completedBeforeBatch + currentBatchEquivalent;

            const overallPercent = Math.min(
              100,
              Math.round(
                (estimatedUploaded / resumeFiles.length) * 100
              )
            );

            setUploadPercent(overallPercent);
          },
        });
      } catch (error) {
        lastError = error;

        if (attempt < MAX_UPLOAD_RETRIES) {
          await new Promise((resolve) => {
            setTimeout(resolve, attempt * 2000);
          });
        }
      }
    }

    throw lastError || new Error("Resume batch upload failed");
  };

  const handleCreateAndStart = async () => {


    const selectionWarning =
      buildSelectionWarning();

    if (selectionWarning) {
      showTemporaryWarning(selectionWarning);
    }

    if (!requirementFile) {
      setError("Please select requirement Excel first.");
      return;
    }

    if (!resumeFiles.length) {
      if (selectionSummary.selectedTotal > 0) {
        showTemporaryWarning(
          selectionWarning ||
          "No supported resume files were found. " +
          "Please select PDF, DOC or DOCX resumes."
        );
      } else {
        showTemporaryWarning(
          "Please select resume files or a resume folder."
        );
      }

      setError("");
      return;
    }

    if (resumeFiles.length > MAX_RESUMES_PER_JOB) {
      setError(
        `Maximum ${MAX_RESUMES_PER_JOB} resumes are allowed in one job.`
      );
      return;
    }

    const batches = [];

    for (
      let index = 0;
      index < resumeFiles.length;
      index += UPLOAD_BATCH_SIZE
    ) {
      batches.push(
        resumeFiles.slice(index, index + UPLOAD_BATCH_SIZE)
      );
    }

    try {
      setCreating(true);
      setUploading(true);
      setStarting(false);

      setError("");
      setUploadedCount(0);
      setUploadPercent(0);
      setCurrentBatch(0);
      setTotalBatches(batches.length);

      setNotice("Creating job and uploading requirement Excel...");

      const created = await createJob({
        mode: "main_ai",
        requirementFile,
        expectedResumes: resumeFiles.length,
      });

      const jobId = created.job_id;

      setActiveJobId(jobId);
      setNotice(`Job created: ${jobId}`);

      for (
        let batchIndex = 0;
        batchIndex < batches.length;
        batchIndex += 1
      ) {
        const batchNumber = batchIndex + 1;
        const batchFiles = batches[batchIndex];

        setCurrentBatch(batchNumber);

        const uploadResult = await uploadBatchWithRetry({
          jobId,
          batchFiles,
          batchNumber,
          totalBatchCount: batches.length,
        });

        const uploaded =
          Number(uploadResult.uploaded_resumes) || 0;

        setUploadedCount(uploaded);

        setUploadPercent(
          Math.min(
            100,
            Math.round(
              (uploaded / resumeFiles.length) * 100
            )
          )
        );

        setNotice(
          `${uploaded} of ${resumeFiles.length} resumes uploaded`
        );
      }

      setUploading(false);
      setCreating(false);
      setStarting(true);

      setNotice("All resumes uploaded. Starting AI processing...");

      await startJob(jobId);

      setNotice(
        "Processing started in background. You can watch progress below."
      );

      await refreshJob(jobId);
      await loadJobs();
      startPolling(jobId);
    } catch (err) {
      setNotice("");
      setError(
        err.message ||
        "Failed while creating, uploading or starting job"
      );
    } finally {
      setCreating(false);
      setUploading(false);
      setStarting(false);
    }
  };

  const openJob = async (jobId) => {
    try {
      setError("");
      setNotice("");
      setActiveJobId(jobId);

      const job = await refreshJob(jobId);

      if (job?.status === "processing" || job?.status === "queued") {
        startPolling(jobId);
      } else {
        stopPolling();
      }
    } catch (err) {
      setError(err.message || "Failed to open job");
    }
  };

  const handleDownload = async () => {
    if (!activeJobId) return;

    try {
      setDownloading(true);
      setError("");

      await downloadJobOutput(activeJobId);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="main-ai-page">
      <div className="main-ai-bg block-one" />
      <div className="main-ai-bg block-two" />

      <header className="main-ai-header">
        <div className="main-ai-brand">
          <div className="main-ai-logo">AI</div>
          <div>
            <h1>{config.COMPANY_NAME}</h1>
            <p>{config.COMPANY_SUBTITLE}</p>
          </div>
        </div>

        <div className="main-ai-user">
          <span>{user?.name || user?.email || "User"}</span>
          {user?.role === "admin" && (
            <button onClick={() => navigate("/admin")}>Admin Dashboard</button>
          )}
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="main-ai-shell">
        <section className="main-ai-hero">
          <div>
            <span className="main-ai-eyebrow">MAIN AI ANALYZE</span>
            <h2>Upload requirement, process resumes, and download recruiter-ready Excel.</h2>
            <p>
              This page uses MongoDB-backed jobs, background processing, status polling,
              and user-wise secure output folders.
            </p>
          </div>

          <div className="main-ai-stats">
            <div>
              <strong>{formatNumber(activeJob?.total_resumes || 0)}</strong>
              <span>Total</span>
            </div>
            <div>
              <strong>{formatNumber(activeJob?.processed || 0)}</strong>
              <span>Processed</span>
            </div>
            <div>
              <strong>{formatNumber(activeJob?.successful || 0)}</strong>
              <span>Success</span>
            </div>
            <div>
              <strong>{formatNumber(activeJob?.failed || 0)}</strong>
              <span>Failed</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="main-ai-alert error">
            {error}
          </div>
        )}

        {temporaryWarning && (
          <div className="main-ai-alert warning">
            {temporaryWarning}
          </div>
        )}

        {notice && (
          <div className="main-ai-alert success">
            {notice}
          </div>
        )}

        <section className="main-ai-grid">
          <div className="main-ai-card upload-card">
            <div className="card-title-row">
              <div>

                <div className="mode-switch-row">
                  <button className="mode-switch-btn active" type="button">
                    High Accuracy Mode
                  </button>
                  <button
                    className="mode-switch-btn"
                    type="button"
                    onClick={() => navigate("/hybrid-ai")}
                  >
                    Run Hybrid Mode
                  </button>
                  <button
                    className="mode-switch-btn"
                    type="button"
                    onClick={() => navigate("/lowcost-ai")}
                  >
                    Run Low Cost Mode
                  </button>
                </div>
                <h3>Create Main AI Job</h3>
                <p>Select one requirement Excel and one or more resumes.</p>
              </div>
              <span className="mode-pill">main_ai</span>
            </div>

            <input
              ref={requirementRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={handleRequirementSelect}
            />

            <input
              ref={resumesRef}
              type="file"
              accept=".pdf,.doc,.docx"
              multiple
              hidden
              onChange={(event) =>
                handleResumeSelect(event, "files")
              }
            />

            <input
              ref={folderRef}
              type="file"
              multiple
              hidden
              webkitdirectory=""
              directory=""
              onChange={(event) =>
                handleResumeSelect(event, "folder")
              }
            />

            <div className="upload-actions">
              <button onClick={() => requirementRef.current?.click()}>
                Select Requirement Excel
              </button>

              <button onClick={() => resumesRef.current?.click()}>
                Select Resume Files
              </button>

              <button onClick={() => folderRef.current?.click()}>
                Select Resume Folder
              </button>
            </div>

            <div className="selected-box">
              <p>
                <b>Requirement:</b>{" "}
                {requirementFile?.name || "Not selected"}
              </p>
              <p>
                <b>Resumes:</b>{" "}
                {resumeFiles.length ? `${resumeFiles.length} selected` : "Not selected"}
              </p>
            </div>
            {(creating || uploading || starting) && (
              <div className="upload-progress-box">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>

                <div className="progress-meta">
                  <span>
                    Upload: {uploadedCount}/{resumeFiles.length}
                  </span>

                  <span>
                    Batch {currentBatch}/{totalBatches}
                  </span>

                  <span>{uploadPercent}%</span>
                </div>
              </div>
            )}

            <button
              className="primary-action"
              disabled={creating || uploading || starting}
              onClick={handleCreateAndStart}
            >
              {uploading
                ? `Uploading ${uploadedCount}/${resumeFiles.length}...`
                : creating
                  ? "Creating Job..."
                  : starting
                    ? "Starting..."
                    : "Create Job & Start Processing"}
            </button>
          </div>

          <div className="main-ai-card status-card">
            <div className="card-title-row">
              <div>
                <h3>Current Job Status</h3>
                <p>{activeJobId || "No active job selected"}</p>
              </div>
              <span className={`status-pill ${activeJob?.status || "idle"}`}>
                {activeJob?.status || "idle"}
              </span>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="progress-meta">
              <span>{progressPercent}% complete</span>
              <span>{activeJob?.message || "Waiting for job"}</span>
            </div>


            <div className="token-grid timing-grid">
              <div>
                <span>Total Time</span>
                <strong>{getJobTimeText(activeJob)}</strong>
              </div>
              <div>
                <span>Avg / Resume</span>
                <strong>{getAverageResumeTime(activeJob)}</strong>
              </div>
              <div>
                <span>Started</span>
                <strong>{formatISTTime(activeJob?.started_at)}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>{formatISTTime(activeJob?.completed_at)}</strong>
              </div>
            </div>

            <div className="token-grid">
              <div>
                <strong>{formatNumber(activeJob?.input_tokens || 0)}</strong>
                <span>Input Tokens</span>
              </div>
              <div>
                <strong>{formatNumber(activeJob?.output_tokens || 0)}</strong>
                <span>Output Tokens</span>
              </div>
              <div>
                <strong>{formatNumber(activeJob?.total_tokens || 0)}</strong>
                <span>Total Tokens</span>
              </div>
            </div>


            <div className="token-grid cost-grid">
              <div>
                <span>Estimated Cost</span>
                <strong>₹{activeJob?.estimated_cost_inr ?? 0}</strong>
              </div>
              <div>
                <span>Cost / Resume</span>
                <strong>₹{activeJob?.cost_per_resume_inr ?? 0}</strong>
              </div>
              <div>
                <span>Cost USD</span>
                <strong>${activeJob?.estimated_cost_usd ?? 0}</strong>
              </div>
            </div>

            <div className="status-actions">
              <button disabled={!activeJobId} onClick={() => refreshJob(activeJobId)}>
                Refresh
              </button>

              <button
                disabled={activeJob?.status !== "completed" || downloading}
                onClick={handleDownload}
              >
                {downloading ? "Downloading..." : "Download Excel"}
              </button>
            </div>
          </div>
        </section>

        <section className="main-ai-card">
          <div className="card-title-row">
            <div>
              <h3>Recent Jobs</h3>
              <p>{loadingJobs ? "Loading..." : `${jobs.length} job(s) found`}</p>
            </div>
            <button onClick={loadJobs}>Reload</button>
          </div>

          <div className="jobs-table-wrap">
            <table className="main-ai-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Processed</th>
                  <th>Success</th>
                  <th>Created</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td>{job.job_id}</td>
                    <td>
                      <span className={`status-pill ${job.status}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>{job.total_resumes}</td>
                    <td>{job.processed}</td>
                    <td>{job.successful}</td>
                    <td>{formatISTDateTime(job.created_at)}</td>
                    <td>
                      <button onClick={() => openJob(job.job_id)}>Open</button>
                    </td>
                  </tr>
                ))}

                {!jobs.length && (
                  <tr>
                    <td colSpan="7">No jobs yet. Create your first Main AI job.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="main-ai-grid">
          <div className="main-ai-card">
            <div className="card-title-row">
              <div>
                <h3>Resume Logs</h3>
                <p>{resumeLogs.length} resume record(s)</p>
              </div>
            </div>

            <div className="jobs-table-wrap small">
              <table className="main-ai-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Matches</th>
                  </tr>
                </thead>
                <tbody>
                  {resumeLogs.map((item) => (
                    <tr key={item._id || item.filename}>
                      <td>{item.filename}</td>
                      <td>
                        <span className={`status-pill ${item.status}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>{item.duration_seconds || 0}s</td>
                      <td>{item.matched_requirements_count || 0}</td>
                    </tr>
                  ))}

                  {!resumeLogs.length && (
                    <tr>
                      <td colSpan="4">No resume logs yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="main-ai-card">
            <div className="card-title-row">
              <div>
                <h3>Result Preview</h3>
                <p>Showing first 20 rows only to keep UI fast.</p>
              </div>
            </div>

            <div className="result-list">
              {results.slice(0, 20).map((row, index) => (
                <div className="result-item" key={`${row["Request-ID"]}-${index}`}>
                  <div>
                    <strong>{row["Candidate Name"] || "Candidate"}</strong>
                    <span>{row["Job Title"] || "Job Title"}</span>
                  </div>
                  <div>
                    <b>ATS {row.ATS || "-"}</b>
                    <span>{row["Request-ID"] || "-"}</span>
                  </div>
                </div>
              ))}

              {!results.length && <p className="empty-text">No results yet.</p>}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}