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
    get_user_job_by_id,
    create_job_resume,
    safe_filename,
    get_active_user_job,
    update_job_upload_state,
    mark_upload_batch_completed,
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
    engine: str = Form("engine_1"),
    requirement_file: UploadFile = File(...),
    expected_resumes: int = Form(...),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    mode = (mode or "main_ai").strip().lower()
    engine = (engine or "engine_1").strip().lower()

    active_job = await get_active_user_job(user_id)

    if active_job:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "You already have one job running. "
                    "Please wait until it completes before starting another job."
                ),
                "active_job_id": active_job.get("job_id"),
                "active_job_status": active_job.get("status"),
            },
        )

    if mode not in ALLOWED_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Allowed modes: {sorted(ALLOWED_MODES)}",
        )

    ALLOWED_ENGINES = {"engine_1", "engine_2"}

    if engine not in ALLOWED_ENGINES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid engine. Allowed engines: {sorted(ALLOWED_ENGINES)}",
        )

    expected_resumes = int(expected_resumes or 0)

    if expected_resumes <= 0:
        raise HTTPException(
            status_code=400,
            detail="At least one resume is required",
        )

    if expected_resumes > 2000:
        raise HTTPException(
            status_code=400,
            detail="Maximum 2000 resumes are allowed in one job",
        )

    validate_requirement_file(requirement_file)
    validate_requirement_excel_content(requirement_file)

    safe_req_name = safe_filename(
        requirement_file.filename,
        fallback="uploaded_requirement.xlsx",
    )

    # Create empty job first.
    job_id = await create_job(
        user_id=user_id,
        mode=mode,
        engine=engine,
        total_resumes=0,
        requirement_filename=safe_req_name,
    )

    await update_job_upload_state(
        job_id=job_id,
        expected_resumes=expected_resumes,
        upload_status="uploading",
        message="Job created. Resume upload is in progress.",
    )

    job = await get_job_by_id(job_id)

    if not job:
        raise HTTPException(
            status_code=500,
            detail="Job creation failed",
        )

    requirement_path = os.path.join(
        job["requirement_dir"],
        safe_req_name,
    )

    await save_upload_file(
        requirement_file,
        requirement_path,
    )

    return {
        "success": True,
        "message": "Job created. Upload resumes in batches.",
        "job_id": job_id,
        "mode": mode,
        "engine": engine,
        "expected_resumes": expected_resumes,
        "uploaded_resumes": 0,
        "upload_status": "uploading",
        "requirement_file": {
            "filename": safe_req_name,
            "file_path": requirement_path,
        },
    }



@job_upload_router.post("/{job_id}/resumes/upload")
async def upload_resume_batch(
    job_id: str,
    batch_id: str = Form(...),
    resumes: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    batch_id = str(batch_id or "").strip()

    if not batch_id:
        raise HTTPException(
            status_code=400,
            detail="batch_id is required",
        )

    job = await get_user_job_by_id(
        user_id=user_id,
        job_id=job_id,
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )
    

    uploaded_batch_ids = set(
        job.get("uploaded_batch_ids") or []
    )

    if batch_id in uploaded_batch_ids:
        return {
            "success": True,
            "job_id": job_id,
            "batch_id": batch_id,
            "already_uploaded": True,
            "batch_uploaded": 0,
            "uploaded_resumes": int(
                job.get("uploaded_resumes") or 0
            ),
            "expected_resumes": int(
                job.get("expected_resumes") or 0
            ),
            "upload_complete": (
                int(job.get("uploaded_resumes") or 0)
                == int(job.get("expected_resumes") or 0)
            ),
            "message": "This batch was already uploaded successfully.",
        }

    if job.get("status") not in {"queued"}:
        raise HTTPException(
            status_code=409,
            detail="Resume upload is not allowed after processing has started",
        )

    if not resumes:
        raise HTTPException(
            status_code=400,
            detail="No resumes received",
        )

    if len(resumes) > 25:
        raise HTTPException(
            status_code=400,
            detail="Maximum 25 resumes are allowed per upload batch",
        )

    expected_resumes = int(
        job.get("expected_resumes") or 0
    )

    uploaded_resumes = int(
        job.get("uploaded_resumes") or 0
    )

    if uploaded_resumes + len(resumes) > expected_resumes:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Uploaded resumes exceed the expected resume count.",
                "expected_resumes": expected_resumes,
                "already_uploaded": uploaded_resumes,
                "current_batch": len(resumes),
            },
        )

    for resume in resumes:
        validate_resume_file(resume)

    saved_resumes = []

    for offset, resume in enumerate(resumes, start=1):
        index = uploaded_resumes + offset

        original_resume_name = os.path.basename(
            resume.filename or f"resume_{index}.pdf"
        )

        safe_resume_name = safe_filename(
            original_resume_name,
            fallback=f"resume_{index}.pdf",
        )

        # Avoid overwriting files having the same name.
        stored_resume_name = (
            f"{index:05d}_{safe_resume_name}"
        )

        resume_path = os.path.join(
            job["resumes_dir"],
            stored_resume_name,
        )

        await save_upload_file(
            resume,
            resume_path,
        )

        await create_job_resume(
            job_id=job_id,
            user_id=user_id,
            filename=original_resume_name,
            stored_filename=stored_resume_name,
            file_path=resume_path,
            index=index,
        )

        saved_resumes.append(
            {
                "index": index,
                "filename": original_resume_name,
                "stored_filename": stored_resume_name,
            }
        )

    newly_uploaded = len(saved_resumes)
    final_uploaded_count = uploaded_resumes + newly_uploaded

    upload_complete = (
        final_uploaded_count == expected_resumes
    )

    batch_marked = await mark_upload_batch_completed(
        job_id=job_id,
        batch_id=batch_id,
        uploaded_count=newly_uploaded,
        upload_complete=upload_complete,
        message=(
            "All resumes uploaded successfully."
            if upload_complete
            else (
                f"{final_uploaded_count} of "
                f"{expected_resumes} resumes uploaded."
            )
        ),
    )

    # Another request may already have completed this same batch.
    # Read the latest MongoDB counters before sending the response.
    if not batch_marked:
        latest_job = await get_user_job_by_id(
            user_id=user_id,
            job_id=job_id,
        )

        if latest_job:
            final_uploaded_count = int(
                latest_job.get("uploaded_resumes") or 0
            )

            upload_complete = (
                final_uploaded_count == expected_resumes
            )

    return {
        "success": True,
        "job_id": job_id,
        "batch_id": batch_id,
        "already_uploaded": not batch_marked,
        "batch_uploaded": (
            newly_uploaded if batch_marked else 0
        ),
        "uploaded_resumes": final_uploaded_count,
        "expected_resumes": expected_resumes,
        "upload_complete": upload_complete,
        "resumes": (
            saved_resumes if batch_marked else []
        ),
    }