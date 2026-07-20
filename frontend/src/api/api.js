import axios from "axios";
import config from "../config";

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
});

export function getToken() {
  return localStorage.getItem("siro_token") || "";
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("siro_user") || "null");
  } catch {
    return null;
  }
}

export function setAuthSession(data) {
  localStorage.setItem("siro_token", data.access_token);
  localStorage.setItem("siro_user", JSON.stringify(data.user || {}));
  localStorage.setItem("siro_logged_in", "true");
}

export function clearAuthSession() {
  localStorage.removeItem("siro_token");
  localStorage.removeItem("siro_user");
  localStorage.removeItem("siro_logged_in");
}

api.interceptors.request.use((request) => {
  const token = getToken();

  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }

  return request;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthSession();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

function getApiError(error, fallback = "Something went wrong") {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (detail?.message) {
    let message = detail.message;

    if (Array.isArray(detail.missing_columns) && detail.missing_columns.length > 0) {
      message += ` Missing columns: ${detail.missing_columns.join(", ")}.`;
    }

    if (Array.isArray(detail.expected_columns) && detail.expected_columns.length > 0) {
      message += ` Expected columns: ${detail.expected_columns.join(", ")}.`;
    }

    if (detail.active_job_id) {
      message += ` Active job: ${detail.active_job_id}.`;
    }

    return message;
  }

  return error?.message || fallback;
}

export async function loginUser({ email, password }) {
  try {
    const response = await api.post("/auth/login", { email, password });
    setAuthSession(response.data);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Login failed"));
  }
}

export async function registerUser({ name, email, password, company, phone }) {
  try {
    const response = await api.post("/auth/register", {
      name,
      email,
      password,
      company,
      phone,
    });

    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Registration failed"));
  }
}

export async function getJobs(limit = 50) {
  try {
    const response = await api.get(`/jobs?limit=${limit}`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load jobs"));
  }
}

export async function createJob({
  mode = "main_ai",
  requirementFile,
  expectedResumes,
}) {
  try {
    const formData = new FormData();

    formData.append("mode", mode);
    formData.append("requirement_file", requirementFile);
    formData.append(
      "expected_resumes",
      String(expectedResumes)
    );

    const response = await api.post(
      "/jobs/create",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 0,
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(
      getApiError(error, "Job creation failed")
    );
  }
}


export async function uploadResumeBatch({
  jobId,
  batchId,
  resumes,
  onUploadProgress,
}) {
  try {
    const formData = new FormData();
    formData.append("batch_id", batchId);

    Array.from(resumes || []).forEach((file) => {
      formData.append("resumes", file);
    });

    const response = await api.post(
      `/jobs/${jobId}/resumes/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 0,

        onUploadProgress: (progressEvent) => {
          if (typeof onUploadProgress !== "function") {
            return;
          }

          const total = progressEvent.total || 0;
          const loaded = progressEvent.loaded || 0;

          const percentage =
            total > 0
              ? Math.round((loaded * 100) / total)
              : 0;

          onUploadProgress({
            loaded,
            total,
            percentage,
          });
        },
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(
      getApiError(error, "Resume batch upload failed")
    );
  }
}

export async function startJob(jobId) {
  try {
    const response = await api.post(`/jobs/${jobId}/start`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to start job"));
  }
}

export async function getJob(jobId) {
  try {
    const response = await api.get(`/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load job"));
  }
}

export async function getJobResumes(jobId) {
  try {
    const response = await api.get(`/jobs/${jobId}/resumes`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load resume status"));
  }
}

export async function getJobResults(jobId) {
  try {
    const response = await api.get(`/jobs/${jobId}/results`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load results"));
  }
}

export async function downloadJobOutput(jobId) {
  try {
    const response = await api.get(`/jobs/${jobId}/download`, {
      responseType: "blob",
      timeout: 120000,
    });

    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");

    link.href = blobUrl;
    link.setAttribute("download", `resume_requirement_output_${jobId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    throw new Error(getApiError(error, "Download failed"));
  }
}

export default api;


// =========================================================
// Backward compatibility for old pages
// Kept so BulkAnalyze / old routes do not break imports.
// Main AI page does not use these now.
// =========================================================

export const bulkAnalyzeResumes = async ({ files }) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await api.post("/bulk-analyze", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    timeout: 900000,
  });

  return response.data;
};

export const getDownloadUrl = (downloadUrl) => {
  return `${config.API_BASE_URL}${downloadUrl}`;
};

export const getJobByRequestId = async (requestId) => {
  const response = await api.get(`/jobs/${requestId}`);
  return response.data;
};


// =========================================================
// Admin APIs
// =========================================================

export async function getAdminUsers() {
  try {
    const response = await api.get("/admin/users");
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load users"));
  }
}

export async function getPendingUsers() {
  try {
    const response = await api.get("/admin/users/pending");
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load pending users"));
  }
}

export async function approveUser(userId) {
  try {
    const response = await api.post(`/admin/users/${userId}/approve`, {});
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to approve user"));
  }
}

export async function rejectUser(userId) {
  try {
    const response = await api.post(`/admin/users/${userId}/reject`, {});
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to reject user"));
  }
}

export async function getAdminJobs(limit = 100) {
  try {
    const response = await api.get(`/admin/jobs?limit=${limit}`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load admin jobs"));
  }
}

export async function getAdminJob(jobId) {
  try {
    const response = await api.get(`/admin/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load admin job"));
  }
}

export async function getAdminJobResumes(jobId) {
  try {
    const response = await api.get(`/admin/jobs/${jobId}/resumes`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load admin job resumes"));
  }
}

export async function getAdminJobResults(jobId) {
  try {
    const response = await api.get(`/admin/jobs/${jobId}/results`);
    return response.data;
  } catch (error) {
    throw new Error(getApiError(error, "Failed to load admin job results"));
  }
}

export async function downloadAdminJobOutput(jobId) {
  try {
    const response = await api.get(`/admin/jobs/${jobId}/download`, {
      responseType: "blob",
      timeout: 120000,
    });

    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");

    link.href = blobUrl;
    link.setAttribute("download", `admin_job_output_${jobId}.xlsx`);

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    throw new Error(getApiError(error, "Failed to download admin job output"));
  }
}
