import os
import shutil
import pandas as pd
from io import BytesIO
from typing import List

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException

from auth import get_current_user
from job_db import (
    create_job,
    get_job_by_id,
    create_job_resume,
    safe_filename,
    get_active_user_job,
)


job_upload_router = APIRouter(prefix="/jobs", tags=["Job Upload"])


ALLOWED_MODES = {"main_ai", "hybrid", "lowcost"}
ALLOWED_REQUIREMENT_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}

REQUIRED_REQUIREMENT_COLUMNS = [
    "Request-ID",
    "MSP Owner",
    "Job Title",
    "Skills - Name",
    "Skills - Experience",
    "Additional Skills",
    "Job Description",
    "Status",
    "Work Location CDF",
]

REQUIREMENT_COLUMN_ALIASES = {
    "Rate Card": [
        "Rate Card",
        "Monthly Company Pay Rate",
        "Monthly Company Pay Rate ",
    ],
    "Yearly Rate": [
        "Yearly Rate",
        "Annually Company Pay Rate",
        "Anually Company Pay Rate",
        "Annually Company Pay Rate ",
        "Anually Company Pay Rate ",
    ],
}

EXPECTED_REQUIREMENT_COLUMNS = REQUIRED_REQUIREMENT_COLUMNS + [
    "Rate Card",
    "Yearly Rate",
]


def normalize_col_name(value: str) -> str:
    return str(value or "").strip()


def has_any_column(detected_columns, possible_columns):
    detected_normalized = {normalize_col_name(col) for col in detected_columns}
    possible_normalized = {normalize_col_name(col) for col in possible_columns}
    return bool(detected_normalized.intersection(possible_normalized))


def get_missing_requirement_columns(detected_columns):
    missing = []

    detected_normalized = {normalize_col_name(col) for col in detected_columns}

    for col in REQUIRED_REQUIREMENT_COLUMNS:
        if normalize_col_name(col) not in detected_normalized:
            missing.append(col)

    for canonical_col, aliases in REQUIREMENT_COLUMN_ALIASES.items():
        if not has_any_column(detected_columns, aliases):
            missing.append(canonical_col)

    return missing


def validate_requirement_excel_content(requirement_file: UploadFile):
    try:
        requirement_file.file.seek(0)
        file_bytes = requirement_file.file.read()
        requirement_file.file.seek(0)

        if not file_bytes:
            raise ValueError("Uploaded Excel file is empty.")

        sheets = pd.read_excel(BytesIO(file_bytes), sheet_name=None, engine="openpyxl")
    except Exception as e:
        try:
            requirement_file.file.seek(0)
        except Exception:
            pass

        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid Requirement Excel. The file could not be read as Excel.",
                "error": str(e),
            },
        )

    if not sheets:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid Requirement Excel. No sheets found.",
                "expected_columns": EXPECTED_REQUIREMENT_COLUMNS,
            },
        )

    best_sheet_name = ""
    best_missing_columns = EXPECTED_REQUIREMENT_COLUMNS
    best_detected_columns = []

    for sheet_name, df in sheets.items():
        detected_columns = [str(col).strip() for col in df.columns]
        missing_columns = get_missing_requirement_columns(detected_columns)

        if len(missing_columns) < len(best_missing_columns):
            best_sheet_name = sheet_name
            best_missing_columns = missing_columns
            best_detected_columns = detected_columns

        if not missing_columns:
            return True

    raise HTTPException(
        status_code=400,
        detail={
            "message": "Invalid Requirement Excel format.",
            "best_sheet_checked": best_sheet_name,
            "missing_columns": best_missing_columns,
            "expected_columns": EXPECTED_REQUIREMENT_COLUMNS,
            "detected_columns": best_detected_columns,
            "available_sheets": list(sheets.keys()),
        },
    )


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

    active_job = await get_active_user_job(user_id)
    if active_job:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "You already have one job running. Please wait until it completes before starting another job.",
                "active_job_id": active_job.get("job_id"),
                "active_job_status": active_job.get("status"),
            },
        )

    if mode not in ALLOWED_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Allowed modes: {sorted(ALLOWED_MODES)}",
        )

    if not resumes:
        raise HTTPException(status_code=400, detail="At least one resume is required")

    validate_requirement_file(requirement_file)
    validate_requirement_excel_content(requirement_file)

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