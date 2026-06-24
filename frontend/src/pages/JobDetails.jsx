import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { analyzeResume, getJobByRequestId } from "../api/api";
import config from "../config";
import AiLoader from "../components/AiLoader";
import ResultTabs from "../components/ResultTabs";
import "./JobDetails.css";

export default function JobDetails() {
    const { requestId } = useParams();
    const navigate = useNavigate();
    const resultRef = useRef(null);

    const [jobData, setJobData] = useState(null);
    const [resumeFile, setResumeFile] = useState(null);
    const [fileError, setFileError] = useState("");
    const [pageError, setPageError] = useState("");
    const [loadingJob, setLoadingJob] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [processingTime, setProcessingTime] = useState(null);

    const loadJobDetails = async () => {
        try {
            setLoadingJob(true);
            setPageError("");

            const data = await getJobByRequestId(requestId);
            setJobData(data.requirement);
        } catch (err) {
            console.error(err);
            setPageError("Unable to load selected job details.");
        } finally {
            setLoadingJob(false);
        }
    };

    useEffect(() => {
        loadJobDetails();
    }, [requestId]);

    useEffect(() => {
        if (analysisResult && resultRef.current) {
            setTimeout(() => {
                resultRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }, 300);
        }
    }, [analysisResult]);

    const validateFile = (file) => {
        if (!file) {
            return "Please select a PDF resume.";
        }

        if (file.type !== "application/pdf") {
            return "Only PDF resume files are allowed.";
        }

        const sizeMb = file.size / (1024 * 1024);
        if (sizeMb > config.MAX_PDF_SIZE_MB) {
            return `PDF size should be less than ${config.MAX_PDF_SIZE_MB} MB.`;
        }

        return "";
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        const error = validateFile(file);

        setFileError(error);
        setResumeFile(error ? null : file);
        setAnalysisResult(null);
    };

    const handleAnalyze = async () => {
        const error = validateFile(resumeFile);
        if (error) {
            setFileError(error);
            return;
        }

        const startTime = performance.now();

        try {
            setAnalyzing(true);
            setPageError("");
            setAnalysisResult(null);
            setProcessingTime(null);

            const data = await analyzeResume({
                requestId,
                file: resumeFile,
            });

            const endTime = performance.now();
            const seconds = ((endTime - startTime) / 1000).toFixed(2);

            setProcessingTime(seconds);
            setAnalysisResult(data);
        } catch (err) {
            const endTime = performance.now();
            const seconds = ((endTime - startTime) / 1000).toFixed(2);

            setProcessingTime(seconds);

            console.error(err);
            setPageError(
                err?.response?.data?.detail ||
                "Failed to analyze resume. Please check backend logs."
            );
        } finally {
            setAnalyzing(false);
        }
    };

    const handleNewAnalysis = () => {
        setAnalysisResult(null);
        setResumeFile(null);
        setFileError("");
        setPageError("");
        setProcessingTime(null);

        const fileInput = document.querySelector(".upload-box input");
        if (fileInput) {
            fileInput.value = "";
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const cleanValue = (value) => {
        if (value === null || value === undefined || value === "") return "-";
        return String(value).replaceAll("_x000D_", "\n");
    };

    if (loadingJob) {
        return (
            <div className="page-shell">
                <div className="container job-details-loading">
                    Loading selected job...
                </div>
            </div>
        );
    }

    return (
        <div className="page-shell">
            {analyzing && <AiLoader />}

            <header className="job-header">
                <div className="container job-header-inner">
                    <div>
                        <button className="back-button" onClick={() => navigate("/")}>
                            ← Back to Jobs
                        </button>
                        <h1>{jobData?.["Job Title"] || "Selected Job"}</h1>
                        <p>Request-ID: {requestId}</p>
                    </div>

                    <button className="secondary-button" onClick={() => navigate("/")}>
                        Change Position
                    </button>
                </div>
            </header>

            <main className="container job-details-main">
                {pageError && <div className="error-box">{pageError}</div>}

                <section className="job-detail-grid">
                    <div className="job-info-card">
                        <div className="card-title-row">
                            <h2>Reference Job Requirement</h2>
                            <span
                                className={
                                    jobData?.Status?.toLowerCase() === "open"
                                        ? "status-pill open"
                                        : "status-pill closed"
                                }
                            >
                                {jobData?.Status || "Unknown"}
                            </span>
                        </div>

                        <div className="job-fields-grid">
                            <div>
                                <span>MSP Owner</span>
                                <strong>{cleanValue(jobData?.["MSP Owner"])}</strong>
                            </div>

                            <div>
                                <span>Skills Name</span>
                                <strong>{cleanValue(jobData?.["Skills - Name"])}</strong>
                            </div>

                            <div>
                                <span>Experience</span>
                                <strong>{cleanValue(jobData?.["Skills - Experience"])}</strong>
                            </div>

                            <div>
                                <span>Location</span>
                                <strong>{cleanValue(jobData?.["Work Location CDF"])}</strong>
                            </div>

                            <div>
                                <span>Rate Card</span>
                                <strong>{cleanValue(jobData?.["Rate Card"])}</strong>
                            </div>

                            <div>
                                <span>Annually</span>
                                <strong>{cleanValue(jobData?.["Yearly Rate"])}</strong>
                            </div>
                        </div>

                        <div className="long-field">
                            <span>Additional Skills</span>
                            <p>{cleanValue(jobData?.["Additional Skills"])}</p>
                        </div>

                        <div className="long-field">
                            <span>Job Description</span>
                            <p>{cleanValue(jobData?.["Job Description"])}</p>
                        </div>
                    </div>

                    <div className="upload-card">
                        {!analysisResult ? (
                            <>
                                <h2>Upload Candidate Resume</h2>
                                <p>
                                    Upload a PDF resume. The system will process it using two AI
                                    engines and return a side-by-side comparison.
                                </p>

                                <label className="upload-box">
                                    {/* <input
                                        type="file"
                                        accept="application/pdf"
                                        onChange={handleFileChange}
                                    /> */}

                                    <input
                                    type="file"
                                    multiple
                                    webkitdirectory="true"
                                    accept=".pdf,.doc,.docx"
                                    onChange={handleFileChange}
                                    />
                                    <div className="upload-icon">📄</div>
                                    <strong>
                                        {resumeFile ? resumeFile.name : "Click to upload PDF resume"}
                                    </strong>
                                    <span>Max size: {config.MAX_PDF_SIZE_MB} MB</span>
                                </label>

                                {fileError && <div className="error-box">{fileError}</div>}

                                {resumeFile && !fileError && (
                                    <div className="selected-file-box">
                                        <strong>Selected file:</strong>
                                        <span>{resumeFile.name}</span>
                                        <small>
                                            {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
                                        </small>
                                    </div>
                                )}

                                <button
                                    className="primary-button analyze-button"
                                    onClick={handleAnalyze}
                                    disabled={!resumeFile || analyzing}
                                >
                                    {analyzing ? "Analyzing..." : "Analyze Resume"}
                                </button>
                            </>
                        ) : (
                            <div className="analysis-complete-card">
                                <div className="complete-icon">✓</div>
                                <h2>Analysis Completed</h2>
                                <p>
                                    The resume has been analyzed successfully. Results are shown
                                    below with AI Engine 1, AI Engine 2, and comparison tabs.
                                </p>

                                <button
                                    className="secondary-button new-analysis-button"
                                    onClick={handleNewAnalysis}
                                >
                                    Analyze Another Resume
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                <div ref={resultRef}>
                    <ResultTabs result={analysisResult} processingTime={processingTime} />
                </div>
            </main>
        </div>
    );
}