import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJobs } from "../api/api";
import config from "../config";
import AiLoader from "../components/AiLoader";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  const requirementInputRef = useRef(null);
  const folderInputRef = useRef(null);

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

  const pollIntervalRef = useRef(null);

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

  useEffect(() => {
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

  // useEffect(() => {
  //   loadJobs();
  // }, []);

  useEffect(() => {
    // Do not auto-load old/backend requirement file on page start.
    // User must upload Requirement Excel manually every time.
    setJobs([]);
    setRequirementUploaded(false);
    setRequirementFileName("");
  }, []);

  const resetAnalysisState = () => {
    setSelectedFiles([]);
    setProcessed(false);
    setOutputFile("");
    setDownloadUrl("");
    setProcessedCount(0);
    setSkippedFiles([]);
    setTokenUsage({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    });
    setError("");
  };

  const handleLogout = () => {
    localStorage.removeItem("siro_logged_in");
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

      const result = await response.json();
      console.log("Requirement upload result:", result);

      setRequirementUploaded(true);
      setRequirementFileName(file.name);

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
        console.log("Bulk status:", data);

        setBulkStatus(data);
        setProcessedCount(data.processed || 0);
        setSkippedFiles(data.skipped_files || []);

        setTokenUsage({
          input_tokens: data.token_usage?.input_tokens || 0,
          output_tokens: data.token_usage?.output_tokens || 0,
          total_tokens: data.token_usage?.total_tokens || 0,
        });

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
      console.log("Bulk job started:", result);

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

  const actionButtonText = uploading
    ? "Analyzing Resumes..."
    : processed
      ? "Analyze More Resumes"
      : "Upload Resume Folder & Start Matching";

  return (
    <div className="page-shell">
      {/* {uploading && <AiLoader />} */}

      <header className="top-header">
        <div>
          <div className="app-badge">AI Recruitment Platform</div>
          <h1>{config.COMPANY_NAME}</h1>
          <p>{config.COMPANY_SUBTITLE}</p>
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="main-container">
        <section className="stats-grid">
          <div className="stat-card">
            <h2>{totalRequirements}</h2>
            <p>Total Requirements</p>
          </div>

          <div className="stat-card">
            <h2>{openPositions}</h2>
            <p>Open Positions</p>
          </div>

          <div className="stat-card">
            <h2>{selectedFiles.length}</h2>
            <p>Resumes Uploaded</p>
          </div>
        </section>

        <section className="requirements-section top-requirements">
          <div className="section-header">
            <div>
              <h2>Requirement Sheet</h2>
              <p>
                Upload the latest client Requirement Excel first. Resume folder upload
                will be enabled only after valid requirements are loaded.
              </p>

              {requirementFileName && (
                <p className="upload-note">
                  Requirement file uploaded: <strong>{requirementFileName}</strong>
                </p>
              )}
            </div>

            <div className="requirement-actions">
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
                  ? "Uploading Requirement..."
                  : requirementUploaded
                    ? "Change Requirement Excel"
                    : "Upload Requirement Excel"}
              </button>

              {/* {requirementUploaded && (
                <button className="refresh-btn" onClick={loadJobs}>
                  Refresh
                </button>
              )} */}
            </div>
          </div>

          {!requirementUploaded && !loading && (
            <div className="empty-box">
              No Requirement Excel uploaded yet. Please upload the client Requirement
              Excel to continue.
            </div>
          )}

          {loading ? (
            <div className="empty-box">Loading requirements...</div>
          ) : requirementUploaded && jobs.length > 0 ? (
            <>
              <div className="section-header compact-section-header">
                <div>
                  <h2>Requirement Sheet Preview</h2>
                  <p>
                    These requirements are loaded from the uploaded client Excel.
                    Candidate resumes will be matched against these Request-IDs.
                  </p>
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
                          {job["Yearly Rate"] ||
                            job.Annually ||
                            job.annually ||
                            "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : requirementUploaded && jobs.length === 0 ? (
            <div className="empty-box">
              Uploaded Requirement Excel has no valid requirement rows.
            </div>
          ) : null}
        </section>

        {!requirementUploaded && (
          <section className="empty-box upload-first-box">
            Upload a valid Requirement Excel first. Resume folder upload will be enabled
            only after requirements are loaded successfully.
          </section>
        )}

        {requirementUploaded && jobs.length > 0 && (
          <section className="workflow-card">
            <div className="workflow-content">
              <span className="step-label">
                {processed ? "Completed" : "Step 2"}
              </span>

              <h2>
                {processed ? "Resume Screening Completed" : "Start Resume Screening"}
              </h2>

              <p>
                Upload candidate resumes and automatically match them against the
                Requirement Sheet. The system extracts candidate details, checks skill,
                experience, location, CTC, and notice period fitment, then generates
                the final Excel output.
              </p>

              <div className="workflow-steps">
                <div className="workflow-step active">
                  <span>1</span>
                  <p>Requirement Excel Uploaded</p>
                </div>

                <div className={`workflow-step ${selectedFiles.length ? "active" : ""}`}>
                  <span>2</span>
                  <p>Resume Folder Uploaded</p>
                </div>

                <div className={`workflow-step ${processed ? "active" : ""}`}>
                  <span>3</span>
                  <p>Output Generated</p>
                </div>
              </div>

              <input
                ref={folderInputRef}
                type="file"
                multiple
                webkitdirectory="true"
                directory="true"
                className="hidden-input"
                onChange={handleFolderChange}
              />

              <button
                className={processed ? "primary-btn success-action-btn" : "primary-btn"}
                onClick={openFolderPicker}
                disabled={uploading}
              >
                {actionButtonText}
              </button>

              {selectedFiles.length > 0 && !processed && (
                <p className="upload-note">
                  {selectedFiles.length} resume file(s) selected.
                </p>
              )}

              {uploading && (
                <section className="output-card">
                  <div>
                    <h3>Resume Analysis Running</h3>

                    <p>
                      Status: <strong>{bulkStatus.message || "Processing resumes..."}</strong>
                    </p>

                    <p>
                      Progress:{" "}
                      <strong>
                        {bulkStatus.processed || 0} / {bulkStatus.total || selectedFiles.length}
                      </strong>
                    </p>

                    <p>
                      Successful: <strong>{bulkStatus.successful || 0}</strong>{" "}
                      Failed: <strong>{bulkStatus.failed || 0}</strong>{" "}
                      Skipped: <strong>{bulkStatus.skipped || 0}</strong>
                    </p>

                    {bulkStatus.current_file && (
                      <p>
                        Current file: <strong>{bulkStatus.current_file}</strong>
                      </p>
                    )}

                    {bulkStatus.current_batch && (
                      <p>
                        Current batch: <strong>{bulkStatus.current_batch}</strong>
                      </p>
                    )}

                    <p className="upload-note">
                      Please keep this tab open. New resume upload is disabled until this batch completes.
                    </p>
                  </div>
                </section>
              )}



              {processed && (
                <p className="upload-note">
                  Analysis completed. Download the output or analyze another resume folder.
                </p>
              )}

              {error && <p className="error-text">{error}</p>}
            </div>
          </section>
        )}

        {processed && (
          <section className="output-card">
            <div>
              <h3>Processing Completed</h3>

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
                  className="secondary-btn"
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
          <section className="token-card">
            <h3>AI Token Usage</h3>

            <div className="token-grid">
              <div>
                <h4>{tokenUsage.input_tokens}</h4>
                <p>Input Tokens</p>
              </div>

              <div>
                <h4>{tokenUsage.output_tokens}</h4>
                <p>Output Tokens</p>
              </div>

              <div>
                <h4>{tokenUsage.total_tokens}</h4>
                <p>Total Tokens Used</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}