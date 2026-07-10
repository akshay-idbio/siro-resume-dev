import os
import shutil
from typing import List

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException

from auth import get_current_user
from job_db import (
    create_job,
    get_job_by_id,
    create_job_resume,
    safe_filename,
)


job_upload_router = APIRouter(prefix="/jobs", tags=["Job Upload"])


ALLOWED_MODES = {"main_ai", "hybrid", "lowcost"}
ALLOWED_REQUIREMENT_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}


def get_file_ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def validate_requirement_file(file: UploadFile):
    ext = get_file_ext(file.filename)

    if ext not in ALLOWED_REQUIREMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Requirement file must be .xlsx or .xls",
        )


def validate_resume_file(file: UploadFile):
    ext = get_file_ext(file.filename)

    if ext not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported resume file type: {file.filename}",
        )


async def save_upload_file(upload_file: UploadFile, destination_path: str):
    with open(destination_path, "wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)


@job_upload_router.post("/create")
async def create_upload_job(
    mode: str = Form("main_ai"),
    requirement_file: UploadFile = File(...),
    resumes: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    mode = (mode or "main_ai").strip().lower()

    if mode not in ALLOWED_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Allowed modes: {sorted(ALLOWED_MODES)}",
        )

    if not resumes:
        raise HTTPException(status_code=400, detail="At least one resume is required")

    validate_requirement_file(requirement_file)

    for resume in resumes:
        validate_resume_file(resume)

    safe_req_name = safe_filename(
        requirement_file.filename,
        fallback="uploaded_requirement.xlsx",
    )

    # 1. Create DB job + storage folders
    job_id = await create_job(
        user_id=user_id,
        mode=mode,
        total_resumes=len(resumes),
        requirement_filename=safe_req_name,
    )

    job = await get_job_by_id(job_id)

    if not job:
        raise HTTPException(status_code=500, detail="Job creation failed")

    requirement_path = os.path.join(job["requirement_dir"], safe_req_name)

    # 2. Save requirement file into this user/job folder
    await save_upload_file(requirement_file, requirement_path)

    # 3. Save resumes into this user/job folder and create DB records
    saved_resumes = []

    for index, resume in enumerate(resumes, start=1):
        original_resume_name = os.path.basename(resume.filename or f"resume_{index}.pdf")

        safe_resume_name = safe_filename(
            original_resume_name,
            fallback=f"resume_{index}.pdf",
        )

        resume_path = os.path.join(job["resumes_dir"], safe_resume_name)

        await save_upload_file(resume, resume_path)

        await create_job_resume(
            job_id=job_id,
            user_id=user_id,
            filename=original_resume_name,
            stored_filename=safe_resume_name,
            file_path=resume_path,
            index=index,
        )

        saved_resumes.append(
            {
                "index": index,
                "filename": original_resume_name,
                "stored_filename": safe_resume_name,
                "file_path": resume_path,
            }
        )

    return {
        "success": True,
        "message": "Job created and files uploaded successfully",
        "job_id": job_id,
        "mode": mode,
        "user_id": user_id,
        "total_resumes": len(saved_resumes),
        "requirement_file": {
            "filename": safe_req_name,
            "file_path": requirement_path,
        },
        "storage": {
            "storage_dir": job["storage_dir"],
            "requirement_dir": job["requirement_dir"],
            "resumes_dir": job["resumes_dir"],
            "outputs_dir": job["outputs_dir"],
            "temp_dir": job["temp_dir"],
        },
        "resumes": saved_resumes,
    }