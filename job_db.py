import os
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from db import (
    jobs_col,
    job_resumes_col,
    job_results_col,
    download_logs_col,
    audit_logs_col,
    utc_now,
)


# =========================================================
# STORAGE HELPERS
# =========================================================

def generate_job_id(prefix: str = "JOB") -> str:
    return f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"


def get_storage_base_dir() -> str:
    return os.getenv(
        "STORAGE_BASE_DIR",
        "/root/Desktop/Siro_Resume_DEV/storage",
    )


def get_job_storage_dir(base_dir: str, user_id: str, job_id: str) -> str:
    return os.path.join(base_dir, "users", str(user_id), "jobs", str(job_id))


def create_job_storage_folders(base_dir: str, user_id: str, job_id: str) -> dict:
    job_dir = get_job_storage_dir(base_dir, user_id, job_id)

    requirement_dir = os.path.join(job_dir, "requirement")
    resumes_dir = os.path.join(job_dir, "resumes")
    outputs_dir = os.path.join(job_dir, "outputs")
    temp_dir = os.path.join(job_dir, "temp")

    os.makedirs(requirement_dir, exist_ok=True)
    os.makedirs(resumes_dir, exist_ok=True)
    os.makedirs(outputs_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True)

    return {
        "job_dir": job_dir,
        "requirement_dir": requirement_dir,
        "resumes_dir": resumes_dir,
        "outputs_dir": outputs_dir,
        "temp_dir": temp_dir,
    }


def safe_filename(filename: str, fallback: str = "file") -> str:
    filename = os.path.basename(filename or fallback)
    filename = filename.replace(" ", "_")
    filename = "".join(c for c in filename if c.isalnum() or c in "._-")
    return filename or fallback


# =========================================================
# JOB HELPERS
# =========================================================

async def create_job(
    user_id: str,
    mode: str,
    total_resumes: int,
    requirement_filename: Optional[str] = "",
    storage_base_dir: Optional[str] = None,
) -> str:
    job_id = generate_job_id()
    now = utc_now()

    base_dir = storage_base_dir or get_storage_base_dir()
    folders = create_job_storage_folders(base_dir, user_id, job_id)

    doc = {
        "job_id": job_id,
        "user_id": str(user_id),
        "mode": mode,  # main_ai / hybrid / lowcost
        "status": "queued",

        "requirement_filename": requirement_filename or "",

        # storage paths
        "storage_base_dir": base_dir,
        "storage_dir": folders["job_dir"],
        "requirement_dir": folders["requirement_dir"],
        "resumes_dir": folders["resumes_dir"],
        "outputs_dir": folders["outputs_dir"],
        "temp_dir": folders["temp_dir"],

        "total_resumes": int(total_resumes or 0),
        "expected_resumes": int(total_resumes or 0),
        "uploaded_resumes": 0,
        "upload_status": "uploading",
        "uploaded_batch_ids": [],
        "processed": 0,
        "successful": 0,
        "failed": 0,
        "skipped": 0,

        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_inr": 0,

        "output_file_path": "",
        "error_message": "",
        "current_file": "",
        "message": "Job queued",

        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }

    await jobs_col.insert_one(doc)
    return job_id


async def update_job_upload_state(
    job_id: str,
    uploaded_delta: int = 0,
    expected_resumes: Optional[int] = None,
    upload_status: Optional[str] = None,
    message: Optional[str] = None,
):
    set_data = {
        "updated_at": utc_now(),
    }

    inc_data = {}

    if uploaded_delta:
        inc_data["uploaded_resumes"] = int(uploaded_delta)
        inc_data["total_resumes"] = int(uploaded_delta)

    if expected_resumes is not None:
        set_data["expected_resumes"] = int(expected_resumes)

    if upload_status is not None:
        set_data["upload_status"] = upload_status

    if message is not None:
        set_data["message"] = message

    update_query = {
        "$set": set_data,
    }

    if inc_data:
        update_query["$inc"] = inc_data

    await jobs_col.update_one(
        {"job_id": job_id},
        update_query,
    )


async def mark_upload_batch_completed(
    job_id: str,
    batch_id: str,
    uploaded_count: int,
    upload_complete: bool = False,
    message: Optional[str] = None,
):
    set_data = {
        "updated_at": utc_now(),
        "upload_status": "completed" if upload_complete else "uploading",
    }

    if message is not None:
        set_data["message"] = message

    result = await jobs_col.update_one(
        {
            "job_id": job_id,
            "uploaded_batch_ids": {"$ne": batch_id},
        },
        {
            "$addToSet": {
                "uploaded_batch_ids": batch_id,
            },
            "$inc": {
                "uploaded_resumes": int(uploaded_count),
                "total_resumes": int(uploaded_count),
            },
            "$set": set_data,
        },
    )

    return result.modified_count == 1

async def mark_job_processing(job_id: str):
    await jobs_col.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "processing",
                "started_at": utc_now(),
                "updated_at": utc_now(),
                "message": "Job processing started",
            }
        },
    )


async def update_job_progress(
    job_id: str,
    processed_delta: int = 0,
    successful_delta: int = 0,
    failed_delta: int = 0,
    skipped_delta: int = 0,
    input_tokens_delta: int = 0,
    output_tokens_delta: int = 0,
    total_tokens_delta: int = 0,
    estimated_cost_inr_delta: float = 0,
    current_file: Optional[str] = None,
    message: Optional[str] = None,
):
    inc_data = {}

    if processed_delta:
        inc_data["processed"] = int(processed_delta)
    if successful_delta:
        inc_data["successful"] = int(successful_delta)
    if failed_delta:
        inc_data["failed"] = int(failed_delta)
    if skipped_delta:
        inc_data["skipped"] = int(skipped_delta)
    if input_tokens_delta:
        inc_data["input_tokens"] = int(input_tokens_delta)
    if output_tokens_delta:
        inc_data["output_tokens"] = int(output_tokens_delta)
    if total_tokens_delta:
        inc_data["total_tokens"] = int(total_tokens_delta)
    if estimated_cost_inr_delta:
        inc_data["estimated_cost_inr"] = float(estimated_cost_inr_delta)

    set_data = {
        "updated_at": utc_now(),
    }

    if current_file is not None:
        set_data["current_file"] = current_file

    if message is not None:
        set_data["message"] = message

    update_query = {"$set": set_data}

    if inc_data:
        update_query["$inc"] = inc_data

    await jobs_col.update_one({"job_id": job_id}, update_query)


async def mark_job_completed(
    job_id: str,
    output_file_path: Optional[str] = "",
    processing_time_seconds: Optional[float] = None,
    average_seconds_per_resume: Optional[float] = None,
):
    set_data = {
        "status": "completed",
        "completed_at": utc_now(),
        "updated_at": utc_now(),
        "output_file_path": output_file_path or "",
        "message": "Job completed successfully",
    }

    if processing_time_seconds is not None:
        processing_time_seconds = round(float(processing_time_seconds or 0), 2)
        set_data["processing_time_seconds"] = processing_time_seconds

        minutes = int(processing_time_seconds // 60)
        seconds = int(processing_time_seconds % 60)

        if minutes > 0:
            set_data["processing_time_text"] = f"{minutes}m {seconds}s"
        else:
            set_data["processing_time_text"] = f"{seconds}s"

    if average_seconds_per_resume is not None:
        set_data["average_seconds_per_resume"] = round(
            float(average_seconds_per_resume or 0),
            2,
        )

    await jobs_col.update_one(
        {"job_id": job_id},
        {
            "$set": set_data
        },
    )

async def mark_job_failed(job_id: str, error_message: str):
    await jobs_col.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "failed",
                "completed_at": utc_now(),
                "updated_at": utc_now(),
                "error_message": error_message,
                "message": "Job failed",
            }
        },
    )


# =========================================================
# RESUME HELPERS
# =========================================================

async def create_job_resume(
    job_id: str,
    user_id: str,
    filename: str,
    file_path: str,
    index: int,
    stored_filename: str = "",
):
    doc = {
        "job_id": job_id,
        "user_id": str(user_id),
        "filename": filename,
        "original_filename": filename,
        "stored_filename": stored_filename or filename,
        "file_path": file_path,
        "index": int(index or 0),

        "status": "queued",
        "started_at": None,
        "completed_at": None,
        "duration_seconds": 0,

        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,

        "matched_requirements_count": 0,
        "error_message": "",

        "created_at": utc_now(),
        "updated_at": utc_now(),
    }

    await job_resumes_col.insert_one(doc)


async def mark_resume_processing(job_id: str, filename: str):
    await job_resumes_col.update_one(
        {"job_id": job_id, "filename": filename},
        {
            "$set": {
                "status": "processing",
                "started_at": utc_now(),
                "updated_at": utc_now(),
            }
        },
    )


async def mark_resume_completed(
    job_id: str,
    filename: str,
    duration_seconds: float,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    matched_requirements_count: int = 0,
):
    await job_resumes_col.update_one(
        {"job_id": job_id, "filename": filename},
        {
            "$set": {
                "status": "completed",
                "completed_at": utc_now(),
                "updated_at": utc_now(),
                "duration_seconds": float(duration_seconds or 0),
                "input_tokens": int(input_tokens or 0),
                "output_tokens": int(output_tokens or 0),
                "total_tokens": int(total_tokens or 0),
                "matched_requirements_count": int(matched_requirements_count or 0),
            }
        },
    )


async def mark_resume_failed(
    job_id: str,
    filename: str,
    duration_seconds: float,
    error_message: str,
):
    await job_resumes_col.update_one(
        {"job_id": job_id, "filename": filename},
        {
            "$set": {
                "status": "failed",
                "completed_at": utc_now(),
                "updated_at": utc_now(),
                "duration_seconds": float(duration_seconds or 0),
                "error_message": error_message,
            }
        },
    )


# =========================================================
# RESULT HELPERS
# =========================================================

async def save_job_results(
    job_id: str,
    user_id: str,
    resume_filename: str,
    output_rows: List[Dict[str, Any]],
):
    if not output_rows:
        return 0

    docs = []

    for row in output_rows:
        docs.append(
            {
                "job_id": job_id,
                "user_id": str(user_id),
                "resume_filename": resume_filename,

                "request_id": row.get("Request-ID", ""),
                "candidate_name": row.get("Candidate Name", ""),
                "candidate_email": row.get("Candidate Email", ""),
                "candidate_phone": row.get("Candidate Phone", ""),
                "candidate_location": row.get("Candidate Location", ""),
                "candidate_total_experience": row.get("Candidate Total Experience", ""),
                "candidate_skills": row.get("Candidate Skills", ""),

                "job_title": row.get("Job Title", ""),
                "skills_name": row.get("Skills - Name", ""),
                "work_location_cdf": row.get("Work Location CDF", ""),

                "experience_mismatch": row.get("Experience Mismatch", ""),
                "skill_mismatch": row.get("Skill Mismatch", ""),
                "ats": row.get("ATS", ""),
                "remark": row.get("Remark", ""),

                "raw_row": row,

                "created_at": utc_now(),
                "updated_at": utc_now(),
            }
        )

    result = await job_results_col.insert_many(docs)
    return len(result.inserted_ids)


# =========================================================
# READ HELPERS
# =========================================================

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc

    doc = dict(doc)

    if "_id" in doc:
        doc["_id"] = str(doc["_id"])

    return doc


async def get_job_by_id(job_id: str):
    doc = await jobs_col.find_one({"job_id": job_id})
    return serialize_doc(doc)


async def get_user_job_by_id(user_id: str, job_id: str):
    doc = await jobs_col.find_one(
        {
            "job_id": job_id,
            "user_id": str(user_id),
        }
    )
    return serialize_doc(doc)


async def get_user_jobs(user_id: str, limit: int = 50):
    cursor = (
        jobs_col.find({"user_id": str(user_id)})
        .sort("created_at", -1)
        .limit(limit)
    )

    jobs = []

    async for doc in cursor:
        jobs.append(serialize_doc(doc))

    return jobs


async def get_all_jobs(limit: int = 100):
    cursor = jobs_col.find({}).sort("created_at", -1).limit(limit)

    jobs = []

    async for doc in cursor:
        jobs.append(serialize_doc(doc))

    return jobs


async def get_job_results(job_id: str, user_id: Optional[str] = None):
    query = {"job_id": job_id}

    if user_id is not None:
        query["user_id"] = str(user_id)

    cursor = job_results_col.find(query).sort("created_at", 1)

    rows = []

    async for doc in cursor:
        rows.append(doc.get("raw_row", {}))

    return rows


async def get_job_resumes(job_id: str, user_id: Optional[str] = None):
    query = {"job_id": job_id}

    if user_id is not None:
        query["user_id"] = str(user_id)

    cursor = job_resumes_col.find(query).sort("index", 1)

    resumes = []

    async for doc in cursor:
        resumes.append(serialize_doc(doc))

    return resumes


# =========================================================
# DOWNLOAD LOGS
# =========================================================

async def create_download_log(
    job_id: str,
    user_id: str,
    file_path: str,
):
    await download_logs_col.insert_one(
        {
            "job_id": job_id,
            "user_id": str(user_id),
            "file_path": file_path,
            "created_at": utc_now(),
        }
    )

async def get_active_user_job(user_id: str):
    return await jobs_col.find_one(
        {
            "user_id": str(user_id),
            "status": {"$in": ["queued", "processing"]},
        },
        sort=[("created_at", -1)],
    )


def calculate_claude_cost(
    input_tokens: int = 0,
    output_tokens: int = 0,
    usd_to_inr: float = 95.0,
):
    input_tokens = int(input_tokens or 0)
    output_tokens = int(output_tokens or 0)

    input_cost_usd = (input_tokens / 1_000_000) * 3.0
    output_cost_usd = (output_tokens / 1_000_000) * 15.0
    total_cost_usd = input_cost_usd + output_cost_usd

    return {
        "input_cost_usd": round(input_cost_usd, 4),
        "output_cost_usd": round(output_cost_usd, 4),
        "total_cost_usd": round(total_cost_usd, 4),
        "total_cost_inr": round(total_cost_usd * usd_to_inr, 2),
        "usd_to_inr": usd_to_inr,
    }


async def update_job_cost(job_id: str, usd_to_inr: float = 95.0):
    job = await jobs_col.find_one({"job_id": job_id})

    if not job:
        return None

    input_tokens = int(job.get("input_tokens") or 0)
    output_tokens = int(job.get("output_tokens") or 0)
    total_resumes = int(job.get("total_resumes") or 0)

    cost = calculate_claude_cost(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usd_to_inr=usd_to_inr,
    )

    cost_per_resume_inr = 0
    cost_per_resume_usd = 0

    if total_resumes > 0:
        cost_per_resume_inr = round(cost["total_cost_inr"] / total_resumes, 2)
        cost_per_resume_usd = round(cost["total_cost_usd"] / total_resumes, 4)

    await jobs_col.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "cost_info": cost,
                "estimated_cost_usd": cost["total_cost_usd"],
                "estimated_cost_inr": cost["total_cost_inr"],
                "cost_per_resume_inr": cost_per_resume_inr,
                "cost_per_resume_usd": cost_per_resume_usd,
                "updated_at": utc_now(),
            }
        },
    )

    return cost
