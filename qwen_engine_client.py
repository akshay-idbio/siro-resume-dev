import os
import time
import zipfile
from typing import Dict, Any, Optional

import httpx


QWEN_API_BASE_URL = os.getenv(
    "QWEN_API_BASE_URL",
    "http://203.112.158.84",
).rstrip("/")

QWEN_SUBMIT_URL = f"{QWEN_API_BASE_URL}/resume-api/jobs"


def create_resumes_zip(resumes_dir: str, zip_path: str) -> str:
    """
    Create zip from uploaded resumes folder.
    Keeps only files, no folder nesting inside zip.
    """
    if not os.path.isdir(resumes_dir):
        raise FileNotFoundError(f"Resumes folder not found: {resumes_dir}")

    resume_files = []

    for root, _, files in os.walk(resumes_dir):
        for filename in files:
            file_path = os.path.join(root, filename)

            if os.path.isfile(file_path):
                resume_files.append(file_path)

    if not resume_files:
        raise ValueError(f"No resume files found in: {resumes_dir}")

    os.makedirs(os.path.dirname(zip_path), exist_ok=True)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_path in resume_files:
            arcname = os.path.basename(file_path)
            zipf.write(file_path, arcname=arcname)

    return zip_path


async def submit_qwen_job(
    requirement_path: str,
    resumes_zip_path: str,
    concurrency: int = 12,
    timeout_seconds: int = 120,
) -> Dict[str, Any]:
    if not os.path.exists(requirement_path):
        raise FileNotFoundError(f"Requirement file not found: {requirement_path}")

    if not os.path.exists(resumes_zip_path):
        raise FileNotFoundError(f"Resumes zip not found: {resumes_zip_path}")

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        with open(requirement_path, "rb") as req_file, open(resumes_zip_path, "rb") as zip_file:
            files = {
                "requirements_file": (
                    os.path.basename(requirement_path),
                    req_file,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
                "resumes_zip": (
                    os.path.basename(resumes_zip_path),
                    zip_file,
                    "application/zip",
                ),
            }

            data = {
                "concurrency": str(int(concurrency or 12)),
            }

            response = await client.post(
                QWEN_SUBMIT_URL,
                files=files,
                data=data,
            )

    response.raise_for_status()
    return response.json()


async def get_qwen_job_status(
    remote_job_id: str,
    timeout_seconds: int = 60,
) -> Dict[str, Any]:
    url = f"{QWEN_API_BASE_URL}/resume-api/jobs/{remote_job_id}"

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.get(url)

    response.raise_for_status()
    return response.json()


async def download_qwen_result(
    remote_job_id: str,
    output_path: str,
    timeout_seconds: int = 300,
) -> str:
    url = f"{QWEN_API_BASE_URL}/resume-api/jobs/{remote_job_id}/download"

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.get(url)

    response.raise_for_status()

    with open(output_path, "wb") as f:
        f.write(response.content)

    return output_path


async def get_qwen_job_log(
    remote_job_id: str,
    timeout_seconds: int = 60,
) -> str:
    url = f"{QWEN_API_BASE_URL}/resume-api/jobs/{remote_job_id}/log"

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.get(url)

    response.raise_for_status()
    return response.text
