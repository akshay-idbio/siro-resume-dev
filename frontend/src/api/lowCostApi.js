import axios from "axios";
import config from "../config";

const lowCostApi = axios.create({
  baseURL: config.LOWCOST_API_BASE_URL,
  timeout: 900000, // 15 minutes for bulk processing
});

export const startLowCostAnalyze = async ({ files }) => {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await lowCostApi.post("/lowcost/bulk-analyze", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

export const getLowCostStatus = async (jobId) => {
  if (!jobId) {
    throw new Error("Low-cost job ID is missing.");
  }

  const response = await lowCostApi.get(`/lowcost/status/${jobId}`);
  return response.data;
};

export const getLowCostDownloadUrl = (downloadUrl) => {
  return `${config.LOWCOST_API_BASE_URL}${downloadUrl}`;
};

export const resetLowCostStatus = async () => {
  const response = await lowCostApi.post("/lowcost/reset");
  return response.data;
};