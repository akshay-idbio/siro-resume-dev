import axios from "axios";
import config from "../config";

const CEO_API_BASE_URL =
  config.CEO_API_BASE_URL || "http://localhost:8008";

const ceoClient = axios.create({
  baseURL: CEO_API_BASE_URL,
  timeout: 15 * 60 * 1000,
});

export async function startCeoAnalyze({ apiKey, requirementExcel, files }) {
  const formData = new FormData();

  formData.append("api_key", apiKey);
  formData.append("excel", requirementExcel);

  Array.from(files || []).forEach((file) => {
    formData.append("files", file);
  });

  const response = await ceoClient.post("/ceo-start", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function getCeoStatus() {
  const response = await ceoClient.get("/ceo-status");
  return response.data;
}

export async function resetCeoStatus() {
  const response = await ceoClient.post("/ceo-reset");
  return response.data;
}

export async function getCeoTokenCost() {
  const response = await ceoClient.get("/ceo-token-cost");
  return response.data;
}

export async function getCeoCostLog() {
  const response = await ceoClient.get("/ceo-cost-log");
  return response.data;
}

export async function getCeoConversionLog() {
  const response = await ceoClient.get("/ceo-conversion-log");
  return response.data;
}

export async function getCeoConvertedTextFiles() {
  const response = await ceoClient.get("/ceo-converted-text-files");
  return response.data;
}

export function getCeoDownloadUrl(pathOrUrl) {
  if (!pathOrUrl) return "";

  if (pathOrUrl.startsWith("http")) {
    return pathOrUrl;
  }

  return `${CEO_API_BASE_URL}${pathOrUrl}`;
}

export function getCeoCostCsvUrl() {
  return `${CEO_API_BASE_URL}/ceo-cost-log-csv`;
}