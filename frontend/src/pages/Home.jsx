import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJobs } from "../api/api";
import config from "../config";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  const requirementInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [uploadingRequirement, setUploadingRequirement] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [requirementUploaded, setRequirementUploaded] = useState(false);
  const [requirementFileName, setRequirementFileName] = useState("");

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processed, setProcessed] = useState(false);

  const [outputFile, setOutputFile] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [processedCount, setProcessedCount] = useState(0);
  const [skippedFiles, setSkippedFiles] = useState([]);

  const [tokenUsage, setTokenUsage] = useState({
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  });

  const [bulkStatus, setBulkStatus] = useState({
    job_id: "",
    status: "idle",
    message: "",
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    current_file: "",
    current_batch: "",
  });

  const [costInfo, setCostInfo] = useState({
    model_name: "",
    input_cost_usd: 0,
    output_cost_usd: 0,
    total_cost_usd: 0,
    total_cost_inr: 0,
    cost_per_resume_usd: 0,
    cost_per_resume_inr: 0,
  });

  const [runtimeInfo, setRuntimeInfo] = useState({
    started_at: "",
    completed_at: "",
    total_seconds: 0,
    total_time_text: "",
    average_seconds_per_resume: 0,
  });

  const [resumeLogs, setResumeLogs] = useState([]);

  useEffect(() => {
    // Fresh login/open should NOT auto-load old backend requirement.
    // Requirement should appear only after user uploads in this browser session.
    const requirementReady = sessionStorage.getItem("siro_requirement_ready") === "true";
    const savedRequirementFile = sessionStorage.getItem("siro_requirement_file_name") || "";

    if (requirementReady) {
      setRequirementFileName(savedRequirementFile);
      loadJobs();
    } else {
      setJobs([]);
      setRequirementUploaded(false);
      setRequirementFileName("");
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getJobs();
      const loadedJobs = data.jobs || [];

      setJobs(loadedJobs);

      if (data.requirement_uploaded && loadedJobs.length > 0) {
        setRequirementUploaded(true);
      } else {
        setRequirementUploaded(false);
      }
    } catch (err) {
      console.error(err);
      setJobs([]);
      setRequirementUploaded(false);
      setError("Please upload a valid Requirement Excel.");
    } finally {
      setLoading(false);
    }
  };

  const resetAnalysisState = () => {
    setSelectedFiles([]);
    setProcessed(false);
    setOutputFile("");
    setDownloadUrl("");
    setProcessedCount(0);
    setSkippedFiles([]);
    setError("");

    setTokenUsage({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });

    setCostInfo({
      model_name: "",
      input_cost_usd: 0,
      output_cost_usd: 0,
      total_cost_usd: 0,
      total_cost_inr: 0,
      cost_per_resume_usd: 0,
      cost_per_resume_inr: 0,
    });

    setRuntimeInfo({
      started_at: "",
      completed_at: "",
      total_seconds: 0,
      total_time_text: "",
      average_seconds_per_resume: 0,
    });

    setResumeLogs([]);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${config.API_BASE_URL}/reset-requirement`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Requirement reset failed:", err);
    }

    localStorage.removeItem("siro_logged_in");
    localStorage.removeItem("siro_requirement_file_name");

    sessionStorage.removeItem("siro_requirement_ready");
    sessionStorage.removeItem("siro_requirement_file_name");

    localStorage.removeItem("uploadedRequirement");
    localStorage.removeItem("requirementUploaded");
    localStorage.removeItem("requirementFileName");
    localStorage.removeItem("jobs");
    localStorage.removeItem("selectedJob");
    localStorage.removeItem("analysisState");

    setJobs([]);
    setRequirementUploaded(false);
    setRequirementFileName("");
    resetAnalysisState();

    navigate("/login");
  };

  const openRequirementPicker = () => {
    if (requirementInputRef.current) {
      requirementInputRef.current.value = "";
      requirementInputRef.current.click();
    }
  };

  const handleRequirementUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingRequirement(true);
      setError("");
      resetAnalysisState();

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${config.API_BASE_URL}/upload-requirement`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        let message = "Requirement upload failed.";

        if (typeof errorData?.detail === "string") {
          message = errorData.detail;
        } else if (errorData?.detail?.message) {
          message = errorData.detail.message;

          if (errorData.detail.missing_columns?.length) {
            message += ` Missing columns: ${errorData.detail.missing_columns.join(", ")}`;
          }
        }

        throw new Error(message);
      }

      setRequirementUploaded(true);
      setRequirementFileName(file.name);

      localStorage.setItem("siro_requirement_file_name", file.name);

      await loadJobs();
    } catch (err) {
      console.error(err);
      setRequirementUploaded(false);
      setError(err.message || "Requirement upload failed.");
    } finally {
      setUploadingRequirement(false);
    }
  };

  const openFolderPicker = () => {
    if (!requirementUploaded || jobs.length === 0) {
      setError("Please upload Requirement Excel first.");
      return;
    }

    if (uploading) {
      setError("Resume analysis is already running. Please wait until it completes.");
      return;
    }

    if (processed) {
      resetAnalysisState();
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
      folderInputRef.current.click();
    }
  };

  const handleFolderChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setSelectedFiles(files);
    setProcessed(false);
    setOutputFile("");
    setDownloadUrl("");
    setProcessedCount(0);
    setSkippedFiles([]);
    setError("");

    setTokenUsage({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });

    await startMatching(files);
  };

  const pollBulkStatus = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${config.API_BASE_URL}/bulk-status`);

        if (!response.ok) {
          throw new Error("Unable to fetch processing status.");
        }

        const data = await response.json();

        setBulkStatus(data);
        setProcessedCount(data.processed || 0);
        setSkippedFiles(data.skipped_files || []);

        setTokenUsage({
          input_tokens: data.token_usage?.input_tokens || 0,
          output_tokens: data.token_usage?.output_tokens || 0,
          total_tokens: data.token_usage?.total_tokens || 0,
        });

        if (data.cost_info) {
          setCostInfo({
            model_name: data.cost_info.model_name || "",
            input_cost_usd: data.cost_info.input_cost_usd || 0,
            output_cost_usd: data.cost_info.output_cost_usd || 0,
            total_cost_usd: data.cost_info.total_cost_usd || 0,
            total_cost_inr: data.cost_info.total_cost_inr || 0,
            cost_per_resume_usd: data.cost_info.cost_per_resume_usd || 0,
            cost_per_resume_inr: data.cost_info.cost_per_resume_inr || 0,
          });
        }

        if (data.runtime_info) {
          setRuntimeInfo({
            started_at: data.runtime_info.started_at || "",
            completed_at: data.runtime_info.completed_at || "",
            total_seconds: data.runtime_info.total_seconds || 0,
            total_time_text: data.runtime_info.total_time_text || "",
            average_seconds_per_resume:
              data.runtime_info.average_seconds_per_resume || 0,
          });
        }

        if (Array.isArray(data.resume_logs)) {
          setResumeLogs(data.resume_logs);
        }

        if (data.status === "completed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;

          setUploading(false);
          setProcessed(true);
          setOutputFile(data.output_filename || "");

          if (data.download_url) {
            setDownloadUrl(`${config.API_BASE_URL}${data.download_url}`);
          }

          await loadJobs();
        }

        if (data.status === "failed") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;

          setUploading(false);
          setProcessed(false);
          setError(data.message || "Resume analysis failed.");
        }
      } catch (err) {
        console.error(err);
        setError(err.message || "Unable to fetch processing status.");
      }
    }, 5000);
  };

  const startMatching = async (filesToUpload = selectedFiles) => {
    if (!filesToUpload.length) {
      setError("Please upload a resume folder first.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setProcessed(false);
      setOutputFile("");
      setDownloadUrl("");
      setProcessedCount(0);
      setSkippedFiles([]);

      setBulkStatus({
        job_id: "",
        status: "queued",
        message: "Uploading resumes and starting analysis...",
        total: filesToUpload.length,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        current_file: "",
        current_batch: `0/${filesToUpload.length}`,
      });

      const formData = new FormData();

      filesToUpload.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${config.API_BASE_URL}/start-bulk-analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        if (response.status === 409) {
          throw new Error(
            errorData?.detail ||
            "Another resume analysis batch is already running. Please wait until it completes."
          );
        }

        throw new Error(errorData?.detail || "Resume matching failed.");
      }

      const result = await response.json();

      setBulkStatus({
        job_id: result.job_id || "",
        status: result.status || "queued",
        message: result.message || "Resume analysis started.",
        total: result.total || filesToUpload.length,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        current_file: "",
        current_batch: `0/${result.total || filesToUpload.length}`,
      });

      pollBulkStatus();
    } catch (err) {
      console.error(err);
      setUploading(false);
      setError(err.message || "Resume matching failed. Please check backend server.");
    }
  };

  const totalRequirements = jobs.length;

  const openPositions = jobs.filter((job) =>
    String(job.Status || job.status || "").toLowerCase().includes("open")
  ).length;

  const progressPercent =
    bulkStatus.total > 0
      ? Math.min(100, Math.round(((bulkStatus.processed || 0) / bulkStatus.total) * 100))
      : 0;

  return (
    <div className="home-page">
      <div className="home-bg-block block-one" />
      <div className="home-bg-block block-two" />
      <div className="home-bg-block block-three" />

      <header className="top-header">
        <div className="brand-area">
          <div className="brand-logo">AI</div>

          <div>
            <span className="app-badge">Recruitment Intelligence</span>
            <h1>{config.COMPANY_NAME}</h1>
            <p>{config.COMPANY_SUBTITLE}</p>
          </div>
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="main-container">
        <section className="home-shell">
          <div className="hero-zone">
            <div className="hero-copy">
              <span className="hero-kicker">CLIENT SCREENING WORKSPACE</span>

              <h2>
                Upload requirements.
                <br />
                Choose an AI engine.
                <br />
                Get the shortlist.
              </h2>

              <p>
                A clean recruiter workspace to validate client requirements, run
                resume screening through different AI engines, compare cost, and
                generate final Excel output.
              </p>

              <div className="hero-actions">
                <input
                  ref={requirementInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden-input"
                  onChange={handleRequirementUpload}
                />

                <button
                  className="primary-btn"
                  onClick={openRequirementPicker}
                  disabled={uploadingRequirement || uploading}
                >
                  {uploadingRequirement
                    ? "Uploading requirement..."
                    : requirementUploaded
                      ? "Change requirement Excel"
                      : "Upload requirement Excel"}
                </button>


              </div>

              {requirementFileName && (
                <p className="file-note">
                  Requirement loaded: <strong>{requirementFileName}</strong>
                </p>
              )}
            </div>

            <div className="hero-status-card">
              <div className="status-card-top">
                <span>Screening Setup</span>
                <b>{requirementUploaded ? "Ready" : "Waiting"}</b>
              </div>

              <div className="setup-list">
                <div className={requirementUploaded ? "setup-item done" : "setup-item"}>
                  <span>01</span>
                  <div>
                    <strong>Requirement Excel</strong>
                    <p>{requirementUploaded ? "Uploaded and validated" : "Upload first"}</p>
                  </div>
                </div>

                <div className={selectedFiles.length ? "setup-item done" : "setup-item"}>
                  <span>02</span>
                  <div>
                    <strong>AI Engine</strong>
                    <p>Main, Hybrid, or Low Cost</p>
                  </div>
                </div>

                <div className={processed ? "setup-item done" : "setup-item"}>
                  <span>03</span>
                  <div>
                    <strong>Excel Output</strong>
                    <p>{processed ? "Report generated" : "Ready after screening"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Total Requirements</span>
              <h3>{totalRequirements}</h3>
              <p>Loaded from client Excel</p>
            </div>

            <div className="stat-card">
              <span>Open Positions</span>
              <h3>{openPositions}</h3>
              <p>Ready for matching</p>
            </div>

            <div className="stat-card">
              <span>Resumes Selected</span>
              <h3>{selectedFiles.length}</h3>
              <p>Current screening batch</p>
            </div>

            <div className="stat-card">
              <span>Estimated Cost</span>
              <h3>{Number(costInfo.total_cost_inr || 0).toFixed(0)}</h3>
              <p>Updated after processing</p>
            </div>
          </section>

          <section className="section-card">
            <div className="section-header">
              <div>
                <span className="section-label">STEP 1</span>
                <h2>Requirement Sheet</h2>
                <p>
                  Upload the client requirement Excel. Once loaded, choose which AI
                  engine should process the resumes.
                </p>
              </div>

              <div className="section-actions">
                <button
                  className="primary-btn"
                  onClick={openRequirementPicker}
                  disabled={uploadingRequirement || uploading}
                >
                  {uploadingRequirement
                    ? "Uploading..."
                    : requirementUploaded
                      ? "Change Excel"
                      : "Upload Excel"}
                </button>
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            {!requirementUploaded && !loading && (
              <div className="empty-box">
                <h3>No requirement sheet uploaded yet</h3>
                <p>
                  Upload the client Requirement Excel to enable AI engine selection
                  and resume screening.
                </p>
              </div>
            )}

            {loading && (
              <div className="empty-box">
                <h3>Loading requirements...</h3>
                <p>Please wait while the requirement sheet is being validated.</p>
              </div>
            )}

            {requirementUploaded && jobs.length > 0 && (
              <>
                <div className="engine-section">
                  <div className="engine-heading">
                    <span className="section-label">STEP 2</span>
                    <h2>Choose AI Screening Engine</h2>
                    <p>
                      Run the same requirements through the engine that fits your
                      review goal: deep matching, faster review, or cost control.
                    </p>
                  </div>

                  <div className="engine-grid">
                    <button
                      className="engine-card main-engine"
                      onClick={openFolderPicker}
                      disabled={uploading}
                    >
                      <span className="engine-tag">Recommended</span>
                      <h3>Main AI Screening</h3>
                      <p>
                        Full resume matching workflow with detailed output, ATS score,
                        candidate fitment, and final Excel report.
                      </p>
                      <b>Upload resume folder </b>
                    </button>

                    <button
                      className="engine-card hybrid-engine"
                      onClick={() => navigate("/hybrid-analyze")}
                      disabled={uploadingRequirement || uploading}
                    >
                      <span className="engine-tag">Balanced</span>
                      <h3>Hybrid Review</h3>
                      <p>
                        Python pre-filtering plus AI review for faster screening and
                        controlled processing cost.
                      </p>
                      <b>Open hybrid engine </b>
                    </button>

                    <button
                      className="engine-card lowcost-engine"
                      onClick={() => navigate("/lowcost-analyze")}
                      disabled={uploadingRequirement || uploading}
                    >
                      <span className="engine-tag">Cost Control</span>
                      <h3>Low Cost Review</h3>
                      <p>
                        Lightweight AI matching designed to reduce token usage while
                        still producing recruiter-ready output.
                      </p>
                      <b>Open low cost engine </b>
                    </button>
                  </div>
                </div>

                <div className="preview-header">
                  <div>
                    <h3>Requirement Preview</h3>
                    <p>Candidate resumes will be matched against these Request-IDs.</p>
                  </div>
                </div>

                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Request-ID</th>
                        <th>Job Title</th>
                        <th>Skills</th>
                        <th>Experience</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Rate Card</th>
                        <th>Annual Rate</th>
                      </tr>
                    </thead>

                    <tbody>
                      {jobs.map((job, index) => (
                        <tr key={index}>
                          <td>{job["Request-ID"] || job.request_id || "-"}</td>

                          <td>{job["Job Title"] || job.job_title || "-"}</td>

                          <td className="skill-cell">
                            {job["Skills - Name"] || job.skills_name || job.skills || "-"}
                          </td>

                          <td>
                            {job["Skills - Experience"] ||
                              job.skills_experience ||
                              job.experience ||
                              job["Experience"] ||
                              "-"}
                          </td>

                          <td>
                            {job["Work Location CDF"] ||
                              job.work_location_cdf ||
                              job["Work Location City"] ||
                              job.location ||
                              "-"}
                          </td>

                          <td>
                            <span
                              className={
                                String(job.Status || job.status || "")
                                  .toLowerCase()
                                  .includes("open")
                                  ? "status-pill open"
                                  : "status-pill closed"
                              }
                            >
                              {job.Status || job.status || "-"}
                            </span>
                          </td>

                          <td>{job["Rate Card"] || job.rate_card || "-"}</td>

                          <td>
                            {job["Yearly Rate"] || job.Annually || job.annually || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            webkitdirectory="true"
            directory="true"
            className="hidden-input"
            onChange={handleFolderChange}
          />

          {uploading && (
            <section className="section-card running-card">
              <div className="running-top">
                <div>
                  <span className="section-label">RUNNING</span>
                  <h2>Resume screening in progress</h2>
                  <p>{bulkStatus.message || "Processing resumes..."}</p>
                </div>

                <strong>{progressPercent}%</strong>
              </div>

              <div className="progress-track">
                <div style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="running-grid">
                <span>
                  Processed <b>{bulkStatus.processed || 0}</b> /{" "}
                  <b>{bulkStatus.total || selectedFiles.length}</b>
                </span>
                <span>
                  Successful <b>{bulkStatus.successful || 0}</b>
                </span>
                <span>
                  Failed <b>{bulkStatus.failed || 0}</b>
                </span>
                <span>
                  Skipped <b>{bulkStatus.skipped || 0}</b>
                </span>
              </div>

              {bulkStatus.current_file && (
                <p className="file-note">
                  Current file: <strong>{bulkStatus.current_file}</strong>
                </p>
              )}
            </section>
          )}

          {processed && (
            <section className="section-card output-card">
              <div>
                <span className="section-label">FINAL OUTPUT</span>
                <h2>Recruiter Excel generated</h2>

                <p>
                  Final Excel has been generated successfully.
                  {processedCount > 0 && (
                    <>
                      {" "}
                      Processed resumes: <strong>{processedCount}</strong>.
                    </>
                  )}
                </p>

                {outputFile && (
                  <p>
                    Output file: <strong>{outputFile}</strong>
                  </p>
                )}

                {skippedFiles.length > 0 && (
                  <p>
                    Skipped files: <strong>{skippedFiles.length}</strong>
                  </p>
                )}
              </div>

              <div className="download-actions">
                {downloadUrl && (
                  <a
                    className="primary-btn"
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download Final Excel
                  </a>
                )}
              </div>
            </section>
          )}

          {processed && (
            <section className="section-card">
              <span className="section-label">COST SUMMARY</span>
              <h2>AI usage and estimated cost</h2>

              <div className="token-grid">
                <div>
                  <h4>{tokenUsage.input_tokens.toLocaleString()}</h4>
                  <p>Input Tokens</p>
                </div>

                <div>
                  <h4>{tokenUsage.output_tokens.toLocaleString()}</h4>
                  <p>Output Tokens</p>
                </div>

                <div>
                  <h4>{tokenUsage.total_tokens.toLocaleString()}</h4>
                  <p>Total Tokens</p>
                </div>

                <div>
                  <h4>${Number(costInfo.total_cost_usd || 0).toFixed(2)}</h4>
                  <p>Cost USD</p>
                </div>

                <div>
                  <h4>{Number(costInfo.total_cost_inr || 0).toFixed(0)}</h4>
                  <p>Cost INR</p>
                </div>

                <div>
                  <h4>{Number(costInfo.cost_per_resume_inr || 0).toFixed(2)}</h4>
                  <p>Cost / Resume</p>
                </div>
              </div>

              <p className="file-note">
                Model used: <strong>{costInfo.model_name || "Claude"}</strong>.
                Cost is estimated from token usage and configured model pricing.
              </p>
            </section>
          )}

          {processed && (
            <section className="section-card">
              <span className="section-label">RUNTIME SUMMARY</span>
              <h2>Processing performance</h2>

              <div className="token-grid">
                <div>
                  <h4>{bulkStatus.total || selectedFiles.length}</h4>
                  <p>Total Files</p>
                </div>

                <div>
                  <h4>{bulkStatus.successful || processedCount}</h4>
                  <p>Successful</p>
                </div>

                <div>
                  <h4>{bulkStatus.skipped || skippedFiles.length}</h4>
                  <p>Skipped</p>
                </div>

                <div>
                  <h4>{bulkStatus.failed || 0}</h4>
                  <p>Failed</p>
                </div>

                <div>
                  <h4>{runtimeInfo.total_time_text || "-"}</h4>
                  <p>Total Time</p>
                </div>

                <div>
                  <h4>
                    {Number(runtimeInfo.average_seconds_per_resume || 0).toFixed(2)} sec
                  </h4>
                  <p>Avg / Resume</p>
                </div>
              </div>
            </section>
          )}

          {processed && resumeLogs.length > 0 && (
            <section className="section-card">
              <div className="section-header">
                <div>
                  <span className="section-label">PROCESSING LOGS</span>
                  <h2>Resume processing logs</h2>
                  <p>Latest per-resume runtime and token usage details.</p>
                </div>
              </div>

              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>File Name</th>
                      <th>Status</th>
                      <th>Time Taken</th>
                      <th>Input Tokens</th>
                      <th>Output Tokens</th>
                      <th>Total Tokens</th>
                    </tr>
                  </thead>

                  <tbody>
                    {resumeLogs.map((log, index) => (
                      <tr key={index}>
                        <td>{log.index || index + 1}</td>
                        <td>{log.filename || "-"}</td>
                        <td>
                          <span
                            className={
                              String(log.status || "").toLowerCase().includes("skip")
                                ? "status-pill closed"
                                : "status-pill open"
                            }
                          >
                            {log.status || "-"}
                          </span>
                        </td>
                        <td>{log.duration_text || `${log.duration_seconds || 0} sec`}</td>
                        <td>{Number(log.input_tokens || 0).toLocaleString()}</td>
                        <td>{Number(log.output_tokens || 0).toLocaleString()}</td>
                        <td>{Number(log.total_tokens || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}