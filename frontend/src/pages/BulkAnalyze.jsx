import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { bulkAnalyzeResumes, getDownloadUrl } from "../api/api";
import config from "../config";
import AiLoader from "../components/AiLoader";
import "./BulkAnalyze.css";

export default function BulkAnalyze() {
  const navigate = useNavigate();

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [pageError, setPageError] = useState("");
  const [processingTime, setProcessingTime] = useState(null);

  const validateFiles = (files) => {
    if (!files || files.length === 0) {
      return "Please select at least one PDF resume.";
    }

    const pdfFiles = Array.from(files).filter((file) =>
      file.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfFiles.length === 0) {
      return "No PDF files found. Please select a folder containing PDF resumes.";
    }

    for (const file of pdfFiles) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > config.MAX_PDF_SIZE_MB) {
        return `${file.name} exceeds ${config.MAX_PDF_SIZE_MB} MB limit.`;
      }
    }

    return "";
  };

  const handleFilesChange = (event) => {
    const files = Array.from(event.target.files || []);
    const pdfFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf")
    );

    const error = validateFiles(files);

    setFileError(error);
    setSelectedFiles(error ? [] : pdfFiles);
    setResult(null);
    setPageError("");
    setProcessingTime(null);
  };

  const handleProcess = async () => {
    const error = validateFiles(selectedFiles);
    if (error) {
      setFileError(error);
      return;
    }

    const startTime = performance.now();

    try {
      setProcessing(true);
      setPageError("");
      setResult(null);
      setProcessingTime(null);

      const data = await bulkAnalyzeResumes({
        files: selectedFiles,
      });

      const endTime = performance.now();
      const seconds = ((endTime - startTime) / 1000).toFixed(2);

      setProcessingTime(seconds);
      setResult(data);
    } catch (err) {
      const endTime = performance.now();
      const seconds = ((endTime - startTime) / 1000).toFixed(2);

      setProcessingTime(seconds);

      console.error(err);
      setPageError(
        err?.response?.data?.detail ||
          "Bulk processing failed. Please check backend logs."
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setFileError("");
    setPageError("");
    setResult(null);
    setProcessingTime(null);

    const input = document.querySelector(".bulk-upload-box input");
    if (input) input.value = "";
  };

  return (
    <div className="page-shell">
      {processing && <AiLoader />}

      <header className="bulk-header">
        <div className="container bulk-header-inner">
          <div>
            <button className="back-button" onClick={() => navigate("/")}>
              ← Back
            </button>
            <h1>Bulk Resume Requirement Matching</h1>
            <p>
              Upload multiple candidate resumes. System will match each resume
              against the Requirement Sheet and generate final Excel output.
            </p>
          </div>
        </div>
      </header>

      <main className="container bulk-main">
        <section className="bulk-card">
          <div className="bulk-title-row">
            <div>
              <h2>Upload Resume Folder</h2>
              <p>
                Select a folder or multiple PDF resumes. The system will process
                all PDF files and generate Output Sheet, Tracker, and Pivot.
              </p>
            </div>
          </div>

          {!result && (
            <>
              <label className="bulk-upload-box">
                <input
                  type="file"
                  multiple
                  webkitdirectory="true"
                  directory="true"
                  accept="application/pdf"
                  onChange={handleFilesChange}
                />

                <div className="upload-icon">📁</div>
                <strong>
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} PDF resumes selected`
                    : "Click to select resume folder"}
                </strong>
                <span>Only PDF resumes will be processed</span>
              </label>

              {fileError && <div className="error-box">{fileError}</div>}

              {selectedFiles.length > 0 && (
                <div className="selected-files-box">
                  <h3>Selected PDF Files</h3>

                  <div className="file-count-pill">
                    {selectedFiles.length} PDF files ready
                  </div>

                  <div className="file-list">
                    {selectedFiles.slice(0, 20).map((file, index) => (
                      <div key={`${file.name}-${index}`}>
                        <span>{file.webkitRelativePath || file.name}</span>
                        <small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small>
                      </div>
                    ))}

                    {selectedFiles.length > 20 && (
                      <div>
                        <span>+ {selectedFiles.length - 20} more files</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                className="primary-button bulk-process-button"
                onClick={handleProcess}
                disabled={selectedFiles.length === 0 || processing}
              >
                {processing ? "Processing..." : "Process Resumes & Generate Excel"}
              </button>
            </>
          )}

          {pageError && <div className="error-box">{pageError}</div>}

          {result && (
            <div className="bulk-result-card">
              <div className="complete-icon">✓</div>
              <h2>Bulk Processing Completed</h2>

              <p>
                Final Excel generated successfully with Output Sheet, Tracker,
                and Pivot.
              </p>

              <div className="bulk-result-grid">
                <div>
                  <span>Total Files Received</span>
                  <strong>{result.total_files_received}</strong>
                </div>

                <div>
                  <span>PDF Processed</span>
                  <strong>{result.total_pdf_processed}</strong>
                </div>

                <div>
                  <span>Output Rows</span>
                  <strong>{result.total_output_rows}</strong>
                </div>

                <div>
                  <span>Processing Time</span>
                  <strong>{processingTime || result.processing_time_seconds}s</strong>
                </div>
              </div>

              {result.skipped_files && result.skipped_files.length > 0 && (
                <div className="skipped-box">
                  <h3>Skipped Files</h3>
                  {result.skipped_files.map((file, index) => (
                    <span key={`${file}-${index}`}>{file}</span>
                  ))}
                </div>
              )}

              <div className="bulk-actions">
                <a
                  className="download-button"
                  href={getDownloadUrl(result.download_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Final Excel
                </a>

                <button className="secondary-button" onClick={handleReset}>
                  Process Another Folder
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}