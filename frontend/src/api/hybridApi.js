import axios from "axios";
import config from "../config";

const HYBRID_API_BASE_URL =
  config.HYBRID_API_BASE_URL || "http://localhost:8007";

export async function startHybridAnalyze({ files }) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await axios.post(
    `${HYBRID_API_BASE_URL}/hybrid-start-bulk-analyze`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000,
    }
  );

  return response.data;
}

export async function getHybridStatus() {
  const response = await axios.get(`${HYBRID_API_BASE_URL}/hybrid-status`, {
    timeout: 30000,
  });

  return response.data;
}

export async function resetHybridStatus() {
  const response = await axios.post(
    `${HYBRID_API_BASE_URL}/hybrid-reset-status`,
    {},
    {
      timeout: 30000,
    }
  );

  return response.data;
}

export function getHybridDownloadUrl(downloadUrl) {
  if (!downloadUrl) return "";

  if (downloadUrl.startsWith("http")) {
    return downloadUrl;
  }

  return `${HYBRID_API_BASE_URL}${downloadUrl}`;
}