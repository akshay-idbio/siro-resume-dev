import axios from "axios";
import config from "../config";

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 900000, // 15 minutes for bulk processing
});

// export const getJobs = async () => {
//   const response = await api.get("/jobs");
//   return response.data;
// };



export async function getJobs() {
  const response = await fetch(`${config.API_BASE_URL}/jobs`);

  if (!response.ok) {
    throw new Error("Failed to fetch jobs");
  }

  return response.json();
}

export const getJobByRequestId = async (requestId) => {
  const response = await api.get(`/jobs/${requestId}`);
  return response.data;
};

export const bulkAnalyzeResumes = async ({ files }) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await api.post("/bulk-analyze", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getDownloadUrl = (downloadUrl) => {
  return `${config.API_BASE_URL}${downloadUrl}`;
};