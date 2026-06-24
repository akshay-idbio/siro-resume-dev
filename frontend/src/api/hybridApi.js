import axios from "axios";
import config from "../config";

const hybridApi = axios.create({
  baseURL: config.HYBRID_API_BASE_URL,
  timeout: 900000,
});

export const startHybridAnalyze = async ({ files }) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await hybridApi.post("/hybrid-start-bulk-analyze", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getHybridStatus = async () => {
  const response = await hybridApi.get("/hybrid-status");
  return response.data;
};

export const resetHybridStatus = async () => {
  const response = await hybridApi.post("/hybrid-reset-status");
  return response.data;
};

export const getHybridDownloadUrl = (downloadUrl) => {
  return `${config.HYBRID_API_BASE_URL}${downloadUrl}`;
};

export const checkHybridHealth = async () => {
  const response = await hybridApi.get("/hybrid-health");
  return response.data;
};