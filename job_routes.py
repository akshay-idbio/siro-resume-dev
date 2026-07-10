from typing import Optional

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from auth import get_current_user, get_current_admin
from job_db import (
    get_job_by_id,
    get_user_job_by_id,
    get_user_jobs,
    get_all_jobs,
    get_job_results,
    get_job_resumes,
    create_download_log,
)


jobs_router = APIRouter(prefix="/jobs", tags=["Jobs"])
admin_jobs_router = APIRouter(prefix="/admin/jobs", tags=["Admin Jobs"])


# =========================================================
# USER JOB ROUTES
# =========================================================

@jobs_router.get("")
async def list_my_jobs(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    jobs = await get_user_jobs(user_id=user_id, limit=limit)

    return {
        "success": True,
        "total": len(jobs),
        "jobs": jobs,
    }


@jobs_router.get("/{job_id}")
async def get_my_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    job = await get_user_job_by_id(user_id=user_id, job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "success": True,
        "job": job,
    }


@jobs_router.get("/{job_id}/resumes")
async def get_my_job_resumes(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    job = await get_user_job_by_id(user_id=user_id, job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resumes = await get_job_resumes(job_id=job_id, user_id=user_id)

    return {
        "success": True,
        "job_id": job_id,
        "total": len(resumes),
        "resumes": resumes,
    }


@jobs_router.get("/{job_id}/results")
async def get_my_job_results(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    job = await get_user_job_by_id(user_id=user_id, job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows = await get_job_results(job_id=job_id, user_id=user_id)

    return {
        "success": True,
        "job_id": job_id,
        "total": len(rows),
        "results": rows,
    }


# =========================================================
# ADMIN JOB ROUTES
# =========================================================

@admin_jobs_router.get("")
async def list_all_jobs_admin(
    limit: int = 100,
    admin_user: dict = Depends(get_current_admin),
):
    jobs = await get_all_jobs(limit=limit)

    return {
        "success": True,
        "total": len(jobs),
        "jobs": jobs,
    }


@admin_jobs_router.get("/{job_id}")
async def get_any_job_admin(
    job_id: str,
    admin_user: dict = Depends(get_current_admin),
):
    job = await get_job_by_id(job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "success": True,
        "job": job,
    }


@admin_jobs_router.get("/{job_id}/resumes")
async def get_any_job_resumes_admin(
    job_id: str,
    admin_user: dict = Depends(get_current_admin),
):
    job = await get_job_by_id(job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resumes = await get_job_resumes(job_id=job_id)

    return {
        "success": True,
        "job_id": job_id,
        "total": len(resumes),
        "resumes": resumes,
    }


@admin_jobs_router.get("/{job_id}/results")
async def get_any_job_results_admin(
    job_id: str,
    admin_user: dict = Depends(get_current_admin),
):
    job = await get_job_by_id(job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rows = await get_job_results(job_id=job_id)

    return {
        "success": True,
        "job_id": job_id,
        "total": len(rows),
        "results": rows,
    }



@jobs_router.get("/{job_id}/download")
async def download_my_job_output(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])

    job = await get_user_job_by_id(user_id=user_id, job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Job is not completed yet",
        )

    output_file_path = job.get("output_file_path", "")

    if not output_file_path:
        raise HTTPException(
            status_code=404,
            detail="Output file path not found",
        )

    if not os.path.exists(output_file_path):
        raise HTTPException(
            status_code=404,
            detail="Output file missing on server",
        )

    await create_download_log(
        job_id=job_id,
        user_id=user_id,
        file_path=output_file_path,
    )

    filename = os.path.basename(output_file_path)

    return FileResponse(
        path=output_file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )



@admin_jobs_router.get("/{job_id}/download")
async def download_any_job_output_admin(
    job_id: str,
    admin_user: dict = Depends(get_current_admin),
):
    job = await get_job_by_id(job_id=job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("status") != "completed":
        raise HTTPException(
            status_code=400,
            detail="Job is not completed yet",
        )

    output_file_path = job.get("output_file_path", "")

    if not output_file_path:
        raise HTTPException(
            status_code=404,
            detail="Output file path not found",
        )

    if not os.path.exists(output_file_path):
        raise HTTPException(
            status_code=404,
            detail="Output file missing on server",
        )

    await create_download_log(
        job_id=job_id,
        user_id=str(admin_user["_id"]),
        file_path=output_file_path,
    )

    filename = os.path.basename(output_file_path)

    return FileResponse(
        path=output_file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )