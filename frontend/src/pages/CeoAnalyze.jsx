import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  startCeoAnalyze,
  getCeoStatus,
  resetCeoStatus,
  getCeoDownloadUrl,
  getCeoCostLog,
  getCeoConversionLog,
  getCeoCostCsvUrl,
} from "../api/ceoApi";
import config from "../config";
import "./CeoAnalyze.css";

export default function CeoAnalyze() {
  const navigate = useNavigate();

  const excelInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const [apiKey, setApiKey] = useState("");
  const [requirementExcel, setRequirementExcel] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [error, setError] = useState("");

  const [costRows, setCostRows] = useState([]);
  const [costSummary, setCostSummary] = useState({});
  const [conversionRows, setConversionRows] = useState([]);

  const [status, setStatus] = useState({
    status: "idle",
    stage: "",
    progress: 0,
    total: 0,
    message: "",
    outputs: {},
    results_summary: null,
    token_based_costing: null,
    recent_log: [],
    text_mode_summary: {},
  });

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const isCompletedStatus = (value) => {
    return ["done", "completed", "success", "finished"].includes(
      String(value || "").toLowerCase()
    );
  };

  const isFailedStatus = (value) => {
    return ["error", "failed", "failure"].includes(
      String(value || "").toLowerCase()
    );
  };

  const validResumeFiles = (files) => {
    return Array.from(files || []).filter((file) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith(".pdf") ||
        name.endsWith(".docx") ||
        name.endsWith(".doc") ||
        name.endsWith(".txt")
      );
    });
  };

  const validateBeforeStart = () => {
    if (!apiKey.trim()) {
      return "Please enter Anthropic API key.";
    }

    if (!apiKey.trim().startsWith("sk-ant")) {
      return "Invalid Anthropic API key. It should start with sk-ant.";
    }

    if (!requirementExcel) {
      return "Please upload Requirement Excel.";
    }

    if (!selectedFiles.length) {
      return "Please select resume files/folder.";
    }

    return "";
  };

  const handleExcelChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const name = file.name.toLowerCase();

    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setError("Please upload valid Excel file only.");
      setRequirementExcel(null);
      return;
    }

    setRequirementExcel(file);
    setError("");
    setProcessed(false);
  };

  const handleFolderChange = (event) => {
    const files = validResumeFiles(event.target.files);

    if (!files.length) {
      setError("No supported resume files found. Supported: PDF, DOCX, DOC, TXT.");
      setSelectedFiles([]);
      return;
    }

    for (const file of files) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > config.MAX_PDF_SIZE_MB) {
        setError(`${file.name} exceeds ${config.MAX_PDF_SIZE_MB} MB limit.`);
        setSelectedFiles([]);
        return;
      }
    }

    setSelectedFiles(files);
    setError("");
    setProcessed(false);
  };

  const fetchCostAndConversionLogs = async () => {
    try {
      const costData = await getCeoCostLog();
      setCostRows(costData.rows || []);
      setCostSummary(costData.summary || {});
    } catch (err) {
      console.error("Cost log error:", err);
    }

    try {
      const conversionData = await getCeoConversionLog();
      setConversionRows(conversionData.rows || []);
    } catch (err) {
      console.error("Conversion log error:", err);
    }
  };

  const pollStatus = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const data = await getCeoStatus();
        setStatus(data);

        await fetchCostAndConversionLogs();

        if (isCompletedStatus(data.status)) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setProcessing(false);
          setProcessed(true);
          await fetchCostAndConversionLogs();
        }

        if (isFailedStatus(data.status)) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setProcessing(false);
          setProcessed(false);
          setError(data.message || "CEO Text Optimized pipeline failed.");
          await fetchCostAndConversionLogs();
        }
      } catch (err) {
        console.error(err);
        setError("Unable to fetch CEO pipeline status.");
      }
    }, 3000);
  };

  const handleStart = async () => {
    const validationError = validateBeforeStart();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setProcessing(true);
      setProcessed(false);
      setError("");
      setCostRows([]);
      setCostSummary({});
      setConversionRows([]);

      setStatus({
        status: "running",
        stage: "uploading",
        progress: 0,
        total: selectedFiles.length,
        message: "Uploading files, converting resumes to TXT, and starting CEO pipeline...",
        outputs: {},
        results_summary: null,
        token_based_costing: null,
        recent_log: [],
        text_mode_summary: {},
      });

      const result = await startCeoAnalyze({
        apiKey,
        requirementExcel,
        files: selectedFiles,
      });

      setStatus((prev) => ({
        ...prev,
        status: "running",
        message: result.message || "CEO Text Optimized pipeline started.",
        total: result.total_text_converted || selectedFiles.length,
      }));

      await fetchCostAndConversionLogs();
      pollStatus();
    } catch (err) {
      console.error(err);
      setProcessing(false);

      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        "CEO Text Optimized pipeline failed. Please check backend logs.";

      setError(errorMsg);
    }
  };

  const handleReset = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    setRequirementExcel(null);
    setSelectedFiles([]);
    setProcessing(false);
    setProcessed(false);
    setError("");
    setCostRows([]);
    setCostSummary({});
    setConversionRows([]);

    setStatus({
      status: "idle",
      stage: "",
      progress: 0,
      total: 0,
      message: "",
      outputs: {},
      results_summary: null,
      token_based_costing: null,
      recent_log: [],
      text_mode_summary: {},
    });

    if (excelInputRef.current) excelInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";

    try {
      await resetCeoStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const outputs = status.outputs || {};
  const summary = status.results_summary || {};
  const textSummary = status.text_mode_summary || {};
  const tokenCost =
    status.token_based_costing ||
    summary.token_based_costing ||
    textSummary.actual_token_tracker_snapshot_from_ceo_original ||
    {};

  const excelDownloadUrl = outputs.excel_download_url
    ? getCeoDownloadUrl(outputs.excel_download_url)
    : "";

  const pdfDownloadUrl = outputs.pdf_download_url
    ? getCeoDownloadUrl(outputs.pdf_download_url)
    : "";

  const progressPercent =
    status.total > 0
      ? Math.min(100, Math.round(((status.progress || 0) / status.total) * 100))
      : processing
      ? 8
      : 0;

  const totalEstimatedTextCost =
    costSummary.total_estimated_input_cost_inr_from_text_files ||
    textSummary.total_estimated_input_cost_inr_from_text_files ||
    0;

  const totalEstimatedTextTokens =
    costSummary.total_estimated_input_tokens_from_text_files ||
    textSummary.total_estimated_input_tokens_from_text_files ||
    0;

  return (
    <div className="ceo-page">
      <header className="ceo-header">
        <button className="ceo-back-btn" onClick={() => navigate("/")}>
          � Back
        </button>

        <div className="ceo-badge">CEO Text Optimized Pipeline</div>

        <h1>CEO Text Optimized Resume Screening</h1>

        <p>
          Upload PDF/DOCX resumes. Backend converts them into exact line-by-line TXT,
          then runs CEO original matching logic. Output Excel format remains exactly
          same as the original CEO/main app.
        </p>
      </header>

      <main className="ceo-container">
        <section className="ceo-info-grid">
          <div className="ceo-info-card">
            <span>Mode</span>
            <strong>Text Optimized</strong>
            <p>PDF/DOCX � TXT � Claude</p>
          </div>

          <div className="ceo-info-card">
            <span>Backend</span>
            <strong>Port 8008</strong>
            <p>Flask wrapper API</p>
          </div>

          <div className="ceo-info-card">
            <span>Output Format</span>
            <strong>Same as CEO App</strong>
            <p>Excel generated by original code</p>
          </div>

          <div className="ceo-info-card">
            <span>Selected CVs</span>
            <strong>{selectedFiles.length}</strong>
            <p>PDF / DOCX / DOC / TXT</p>
          </div>
        </section>

        <section className="ceo-card">
          <div className="ceo-card-head">
            <div>
              <h2>Run Text Optimized CEO Pipeline</h2>
              <p>
                This keeps CEO output sheet format same, but reduces cost by sending
                extracted TXT resumes instead of raw documents.
              </p>
            </div>
          </div>

          <div className="ceo-form-grid">
            <label className="ceo-field">
              <span>Anthropic API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={processing}
              />
            </label>

            <div className="ceo-upload-small">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelChange}
                className="ceo-hidden-input"
              />

              <button
                className="ceo-secondary-btn"
                onClick={() => excelInputRef.current?.click()}
                disabled={processing}
              >
                Upload Requirement Excel
              </button>

              <p>
                {requirementExcel
                  ? requirementExcel.name
                  : "No Excel selected yet"}
              </p>
            </div>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            webkitdirectory="true"
            directory="true"
            accept=".pdf,.docx,.doc,.txt"
            className="ceo-hidden-input"
            onChange={handleFolderChange}
          />

          <button
            className="ceo-upload-box"
            onClick={() => folderInputRef.current?.click()}
            disabled={processing}
          >
            <div className="ceo-upload-icon">TXT</div>

            <strong>
              {selectedFiles.length > 0
                ? `${selectedFiles.length} resume files selected`
                : "Click to select resume folder"}
            </strong>

            <span>
              Backend will convert PDF/DOCX to exact line-by-line TXT before Claude.
            </span>
          </button>

          {selectedFiles.length > 0 && !processed && (
            <div className="ceo-file-list">
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

          {error && <div className="ceo-error">{error}</div>}

          {!processed && (
            <button
              className="ceo-primary-btn"
              onClick={handleStart}
              disabled={processing}
            >
              {processing
                ? "Text Optimized Pipeline Running..."
                : "Start Text Optimized Screening"}
            </button>
          )}

          {processing && (
            <section className="ceo-running-card">
              <div className="ceo-running-top">
                <div>
                  <h3>Pipeline Running</h3>
                  <p>{status.message || "Processing..."}</p>
                </div>

                <strong>{progressPercent}%</strong>
              </div>

              <div className="ceo-progress-bar">
                <span style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="ceo-runtime-grid">
                <div>
                  <span>Stage</span>
                  <strong>{status.stage || "-"}</strong>
                </div>

                <div>
                  <span>Progress</span>
                  <strong>
                    {status.progress || 0} / {status.total || selectedFiles.length}
                  </strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong>{status.status || "-"}</strong>
                </div>

                <div>
                  <span>TXT Converted</span>
                  <strong>{status.text_converted_count || conversionRows.length || 0}</strong>
                </div>
              </div>
            </section>
          )}

          {processed && (
            <section className="ceo-success-card">
              <div className="ceo-complete-icon"></div>

              <h2>Processing Completed</h2>

              <p>
                CEO original output generated successfully with text optimized input.
                Output Excel format remains same as original CEO/main app.
              </p>

              <div className="ceo-result-grid">
                <div>
                  <span>Openings</span>
                  <strong>{summary.openings || 0}</strong>
                </div>

                <div>
                  <span>CVs Parsed</span>
                  <strong>{summary.cvs_parsed || status.text_converted_count || 0}</strong>
                </div>

                <div>
                  <span>Pairs Scored</span>
                  <strong>{summary.pairs_scored || 0}</strong>
                </div>

                <div>
                  <span>Duration</span>
                  <strong>{summary.duration_s || textSummary.elapsed_seconds || 0}s</strong>
                </div>
              </div>

              <div className="ceo-actions">
                {excelDownloadUrl && (
                  <a
                    className="ceo-download-btn"
                    href={excelDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download CEO Excel
                  </a>
                )}

                {pdfDownloadUrl && (
                  <a
                    className="ceo-secondary-btn"
                    href={pdfDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download CEO PDF
                  </a>
                )}

                <a
                  className="ceo-secondary-btn"
                  href={getCeoCostCsvUrl()}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Cost CSV
                </a>

                <button className="ceo-secondary-btn" onClick={handleReset}>
                  Process Another Batch
                </button>
              </div>
            </section>
          )}
        </section>

        {(processing || processed || costRows.length > 0) && (
          <section className="ceo-cost-card">
            <h3>Text Conversion Cost Estimate</h3>

            <div className="ceo-cost-grid">
              <div>
                <h4>{Number(totalEstimatedTextTokens || 0).toLocaleString()}</h4>
                <p>Estimated TXT Input Tokens</p>
              </div>

              <div>
                <h4>�{Number(totalEstimatedTextCost || 0).toFixed(4)}</h4>
                <p>Estimated TXT Input Cost</p>
              </div>

              <div>
                <h4>{costRows.length}</h4>
                <p>Cost Rows</p>
              </div>

              <div>
                <h4>
                  {
                    costRows.filter((row) => row.over_budget_estimate).length
                  }
                </h4>
                <p>Over �0.30 Estimate</p>
              </div>
            </div>

            {costRows.length > 0 && (
              <div className="ceo-table-wrap">
                <table className="ceo-table">
                  <thead>
                    <tr>
                      <th>Resume</th>
                      <th>TXT File</th>
                      <th>Tokens</th>
                      <th>Cost INR</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costRows.slice(0, 12).map((row, index) => (
                      <tr key={`${row.original_filename}-${index}`}>
                        <td>{row.original_filename}</td>
                        <td>{row.text_filename || "-"}</td>
                        <td>{Number(row.estimated_input_tokens || 0).toLocaleString()}</td>
                        <td>�{Number(row.estimated_input_cost_inr || 0).toFixed(4)}</td>
                        <td>
                          {row.over_budget_estimate ? (
                            <span className="ceo-pill danger">Over Budget</span>
                          ) : (
                            <span className="ceo-pill ok">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {costRows.length > 12 && (
                  <p className="ceo-table-note">
                    Showing 12 of {costRows.length} rows. Download CSV for full details.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {(processing || processed) && (
          <section className="ceo-cost-card">
            <h3>Actual Token Usage From CEO Original</h3>

            <div className="ceo-cost-grid">
              <div>
                <h4>{Number(tokenCost.input_tokens || 0).toLocaleString()}</h4>
                <p>Input Tokens</p>
              </div>

              <div>
                <h4>{Number(tokenCost.output_tokens || 0).toLocaleString()}</h4>
                <p>Output Tokens</p>
              </div>

              <div>
                <h4>{Number(tokenCost.total_tokens || 0).toLocaleString()}</h4>
                <p>Total Tokens</p>
              </div>

              <div>
                <h4>
                  ${Number(tokenCost.cost_usd || tokenCost.total_cost_usd || 0).toFixed(4)}
                </h4>
                <p>Estimated USD</p>
              </div>

              <div>
                <h4>
                  �{Number(tokenCost.cost_inr || tokenCost.total_cost_inr || 0).toFixed(2)}
                </h4>
                <p>Estimated INR</p>
              </div>

              <div>
                <h4>
                  �{Number(tokenCost.cost_per_resume_inr || 0).toFixed(2)}
                </h4>
                <p>Cost / Resume</p>
              </div>
            </div>
          </section>
        )}

        {conversionRows.length > 0 && (
          <section className="ceo-log-card">
            <h3>Conversion Logs</h3>

            <div className="ceo-log-list">
              {conversionRows.slice(0, 10).map((row, index) => (
                <div key={`${row.original_filename}-${index}`}>
                  <span>{row.status}</span>
                  <p>
                    {row.original_filename} � {row.text_filename || row.error || "-"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {Array.isArray(status.recent_log) && status.recent_log.length > 0 && (
          <section className="ceo-log-card">
            <h3>Processing Logs</h3>

            <div className="ceo-log-list">
              {status.recent_log.map((log, index) => (
                <div key={index}>
                  <span>{log.ts || log.time || "-"}</span>
                  <p>{log.msg || log.message || "-"}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}