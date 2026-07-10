import os
import uuid
import shutil
import asyncio
import threading
from datetime import datetime
from typing import List

from fastapi import Depends, File, HTTPException, UploadFile

# Import existing hybrid engine without modifying it
import hybrid_main as old

app = old.app

ALLOWED_REQUIREMENT_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_RESUME_EXTENSIONS = {".pdf", ".docx", ".doc"}


def get_ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def safe_basename(filename: str, fallback: str) -> str:
    name = os.path.basename(filename or fallback).strip()
    return name or fallback


@app.post("/hybrid-start-bulk-analyze-v2", response_model=old.HybridStartResponse)
async def hybrid_start_bulk_analyze_v2(
    requirement_file: UploadFile = File(...),
    files: List[UploadFile] = File(...),
    cfg: old.Settings = Depends(old.get_settings),
):
    old.debug("=" * 100)
    old.debug("Hybrid V2 start request received")
    old.debug(f"Requirement file: {requirement_file.filename}")
    old.debug(f"Total resume files received: {len(files)}")

    if old.is_active_job_running():
        raise HTTPException(
            status_code=409,
            detail="A hybrid resume analysis job is already running. Please wait until it completes.",
        )

    req_name = safe_basename(requirement_file.filename, "requirement.xlsx")
    req_ext = get_ext(req_name)

    if req_ext not in ALLOWED_REQUIREMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid Requirement Excel. Supported formats: XLSX, XLS.",
        )

    if not files:
        raise HTTPException(status_code=400, detail="No resume files uploaded.")

    # Reset old hybrid upload/status storage but keep engine unchanged
    old.reset_hybrid_job_storage()

    # Save requirement Excel to the exact path expected by existing hybrid_main.py
    req_content = await requirement_file.read()
    if not req_content:
        raise HTTPException(status_code=400, detail="Requirement Excel is empty.")

    req_dir = os.path.dirname(old.UPLOADED_REQUIREMENT_PATH)
    if req_dir:
        os.makedirs(req_dir, exist_ok=True)

    with open(old.UPLOADED_REQUIREMENT_PATH, "wb") as f:
        f.write(req_content)

    old.debug(f"Saved requirement Excel to: {old.UPLOADED_REQUIREMENT_PATH}")

    os.makedirs(old.HYBRID_UPLOAD_DIR, exist_ok=True)

    job_id = f"HYBRID_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

    saved_files = []
    skipped_files = []

    for index, file in enumerate(files, start=1):
        original_name = safe_basename(file.filename, f"resume_{index}.pdf")
        ext = get_ext(original_name)

        if ext not in ALLOWED_RESUME_EXTENSIONS:
            skipped_files.append(original_name)
            continue

        content = await file.read()
        if not content:
            skipped_files.append(original_name)
            continue

        save_path = os.path.join(old.HYBRID_UPLOAD_DIR, original_name)

        # Avoid overwrite if same filename appears twice
        if os.path.exists(save_path):
            base, ext2 = os.path.splitext(original_name)
            original_name = f"{base}_{index}{ext2}"
            save_path = os.path.join(old.HYBRID_UPLOAD_DIR, original_name)

        with open(save_path, "wb") as f:
            f.write(content)

        saved_files.append(
            {
                "filename": original_name,
                "content_type": file.content_type or "application/pdf",
                "path": save_path,
            }
        )

    if not saved_files:
        raise HTTPException(
            status_code=400,
            detail="No supported resume files found. Supported: PDF, DOCX, DOC.",
        )

    status = old.get_default_status()
    status.update(
        {
            "job_id": job_id,
            "pipeline": "hybrid",
            "status": "queued",
            "message": "Hybrid resume analysis job queued",
            "total": len(saved_files),
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "skipped": len(skipped_files),
            "skipped_files": skipped_files,
            "current_file": "",
            "current_batch": f"0/{len(saved_files)}",
            "started_at": datetime.now().isoformat(),
            "requirement_filename": req_name,
        }
    )

    old.write_status(status)

    threading.Thread(
        target=lambda: asyncio.run(
            old.run_hybrid_background_job(job_id, saved_files, cfg)
        ),
        daemon=True,
    ).start()

    return {
        "job_id": job_id,
        "status": "queued",
        "total": len(saved_files),
        "message": "Hybrid resume analysis started",
    }
