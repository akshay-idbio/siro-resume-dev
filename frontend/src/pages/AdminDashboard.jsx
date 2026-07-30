import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  approveUser,
  clearAuthSession,
  downloadAdminJobOutput,
  getAdminJobResults,
  getAdminJobResumes,
  getAdminJobs,
  getAdminUsers,
  getCurrentUser,
  getPendingUsers,
  rejectUser,
} from "../api/api";
import "./AdminDashboard.css";

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  } catch {
    return value;
  }
};

const getTimeText = (job) => {
  if (!job) return "-";
  if (job.processing_time_text) return job.processing_time_text;
  if (job.processing_time_seconds !== undefined && job.processing_time_seconds !== null) {
    const seconds = Number(job.processing_time_seconds || 0);
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
  }
  return "-";
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [resumeLogs, setResumeLogs] = useState([]);
  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const runningJobs = jobs.filter((j) => j.status === "processing" || j.status === "queued").length;
    const completedJobs = jobs.filter((j) => j.status === "completed").length;
    const failedJobs = jobs.filter((j) => j.status === "failed").length;

    return {
      users: users.length,
      pending: pendingUsers.length,
      totalJobs,
      runningJobs,
      completedJobs,
      failedJobs,
    };
  }, [users, pendingUsers, jobs]);

  const loadAdminData = async () => {
    setLoading(true);
    setError("");

    try {
      const [usersRes, pendingRes, jobsRes] = await Promise.all([
        getAdminUsers(),
        getPendingUsers(),
        getAdminJobs(200),
      ]);

      setUsers(usersRes.users || usersRes.data || []);
      setPendingUsers(pendingRes.users || pendingRes.data || []);
      setJobs(jobsRes.jobs || jobsRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  };

  const openJob = async (job) => {
    setSelectedJob(job);
    setJobLoading(true);
    setError("");

    try {
      const [resumeRes, resultRes] = await Promise.all([
        getAdminJobResumes(job.job_id),
        getAdminJobResults(job.job_id),
      ]);

      setResumeLogs(resumeRes.resumes || resumeRes.data || []);
      setResults(resultRes.results || resultRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to open job");
    } finally {
      setJobLoading(false);
    }
  };

  const handleApprove = async (targetUserId) => {
    setNotice("");
    setError("");

    try {
      await approveUser(targetUserId);
      setNotice("User approved successfully.");
      await loadAdminData();
    } catch (err) {
      setError(err.message || "Failed to approve user");
    }
  };

  const handleReject = async (targetUserId) => {
    const ok = window.confirm("Reject this user?");
    if (!ok) return;

    setNotice("");
    setError("");

    try {
      await rejectUser(targetUserId);
      setNotice("User rejected successfully.");
      await loadAdminData();
    } catch (err) {
      setError(err.message || "Failed to reject user");
    }
  };

  const handleDownload = async (jobId) => {
    setError("");
    try {
      await downloadAdminJobOutput(jobId);
    } catch (err) {
      setError(err.message || "Failed to download output");
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login");
  };

  useEffect(() => {
    if (!user || user.role !== "admin") {
      navigate("/", { replace: true });
      return;
    }

    loadAdminData();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <div className="admin-eyebrow">SIROai admin</div>
          <h1>Admin Dashboard</h1>
          <p>Manage users, monitor jobs, review resume processing, and download outputs.</p>
        </div>

        <div className="admin-actions">
          <button onClick={() => navigate("/main-ai")}>Main AI</button>
          <button onClick={loadAdminData} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="danger" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {notice && <div className="admin-alert success">{notice}</div>}
      {error && <div className="admin-alert error">{error}</div>}

      <section className="admin-stats">
        <div> <span>Total users</span><strong>{stats.users}</strong></div>
        <div><span>Pending users</span><strong>{stats.pending}</strong></div>
        <div><span>Total jobs</span><strong>{stats.totalJobs}</strong></div>
        <div><span>Running jobs</span><strong>{stats.runningJobs}</strong></div>
        <div><span>Completed</span><strong>{stats.completedJobs}</strong></div>
        <div><span>Failed</span><strong>{stats.failedJobs}</strong></div>

       



      </section>

      <section className="admin-grid">
        <div className="admin-card">
          <div className="card-head">
            <h2>Pending Users</h2>
            <span>{pendingUsers.length} pending</span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.length === 0 ? (
                  <tr><td colSpan="5" className="empty-cell">No pending users.</td></tr>
                ) : (
                  pendingUsers.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name || "-"}</td>
                      <td>{u.email}</td>
                      <td>{u.company || "-"}</td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button onClick={() => handleApprove(u._id)}>Approve</button>
                          <button className="danger-soft" onClick={() => handleReject(u._id)}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-card">
          <div className="card-head">
            <h2>All Users</h2>
            <span>{users.length} users</span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="5" className="empty-cell">No users found.</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u._id}>
                      <td>{u.name || "-"}</td>
                      <td>{u.email}</td>
                      <td>{u.role || "user"}</td>
                      <td><span className={`pill ${u.status || "approved"}`}>{u.status || "approved"}</span></td>
                      <td>{formatDate(u.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="card-head">
          <h2>All Jobs</h2>
          <span>{jobs.length} latest jobs</span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Total</th>
                <th>Processed</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Time</th>
                <th>Avg</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan="10" className="empty-cell">No jobs found.</td></tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td className="mono">{job.job_id}</td>
                    <td><span className={`pill ${job.status}`}>{job.status}</span></td>
                    <td>{job.total_resumes || 0}</td>
                    <td>{job.processed || 0}</td>
                    <td>{job.successful || 0}</td>
                    <td>{job.failed || 0}</td>
                    <td>{getTimeText(job)}</td>
                    <td>{job.average_seconds_per_resume ? `${job.average_seconds_per_resume}s` : "-"}</td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => openJob(job)}>Open</button>
                        {job.status === "completed" && (
                          <button onClick={() => handleDownload(job.job_id)}>Download</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedJob && (
        <section className="admin-grid bottom-grid">
          <div className="admin-card">
            <div className="card-head">
              <h2>Job Detail</h2>
              <span>{selectedJob.job_id}</span>
            </div>

            <div className="detail-grid">
              <div><span>Status</span><strong>{selectedJob.status}</strong></div>
              <div><span>Total</span><strong>{selectedJob.total_resumes || 0}</strong></div>
              <div><span>Processed</span><strong>{selectedJob.processed || 0}</strong></div>
              <div><span>Success</span><strong>{selectedJob.successful || 0}</strong></div>
              <div><span>Failed</span><strong>{selectedJob.failed || 0}</strong></div>
              <div><span>Skipped</span><strong>{selectedJob.skipped || 0}</strong></div>
              <div><span>Total Time</span><strong>{getTimeText(selectedJob)}</strong></div>
              <div><span>Total Tokens</span><strong>{selectedJob.total_tokens || 0}</strong></div>
            </div>

            {jobLoading && <p className="muted">Loading job details...</p>}
          </div>

          <div className="admin-card">
            <div className="card-head">
              <h2>Resume Logs</h2>
              <span>{resumeLogs.length} records</span>
            </div>

            <div className="admin-table-wrap small">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Matches</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {resumeLogs.slice(0, 50).map((r, idx) => (
                    <tr key={`${r.filename}-${idx}`}>
                      <td>{r.filename}</td>
                      <td><span className={`pill ${r.status}`}>{r.status}</span></td>
                      <td>{r.duration_seconds ? `${r.duration_seconds}s` : "-"}</td>
                      <td>{r.matched_requirements_count ?? "-"}</td>
                      <td>{r.error_message || "-"}</td>
                    </tr>
                  ))}
                  {resumeLogs.length === 0 && (
                    <tr><td colSpan="5" className="empty-cell">No resume logs.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-card result-card">
            <div className="card-head">
              <h2>Result Preview</h2>
              <span>{results.length} rows</span>
            </div>

            <div className="result-list">
              {results.slice(0, 20).map((row, idx) => (
                <div className="result-item" key={idx}>
                  <strong>{row.resume_filename || row["Resume File"] || row["File Name"] || `Row ${idx + 1}`}</strong>
                  <span>ATS {row.ats_score || row["ATS Score"] || row.ATS || "-"}</span>
                  <p>{row.job_title || row["Job Title"] || row.final_remark || row["Final Remark"] || "-"}</p>
                </div>
              ))}
              {results.length === 0 && <p className="muted">No result rows.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
