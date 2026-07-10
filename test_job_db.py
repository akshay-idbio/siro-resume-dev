import asyncio
import os

from job_db import (
    create_job,
    mark_job_processing,
    create_job_resume,
    mark_resume_processing,
    mark_resume_completed,
    save_job_results,
    update_job_progress,
    mark_job_completed,
    get_job_by_id,
    get_job_results,
    get_job_resumes,
)


async def main():
    user_id = "test_user_123"

    job_id = await create_job(
        user_id=user_id,
        mode="main_ai",
        total_resumes=1,
        requirement_filename="requirements.xlsx",
    )

    print("Created job:", job_id)

    job = await get_job_by_id(job_id)
    print("Job storage dir:", job["storage_dir"])

    print("Folder exists:", os.path.exists(job["storage_dir"]))
    print("Requirement dir exists:", os.path.exists(job["requirement_dir"]))
    print("Resumes dir exists:", os.path.exists(job["resumes_dir"]))
    print("Outputs dir exists:", os.path.exists(job["outputs_dir"]))
    print("Temp dir exists:", os.path.exists(job["temp_dir"]))

    await mark_job_processing(job_id)

    sample_resume_path = os.path.join(job["resumes_dir"], "sample_resume.pdf")

    with open(sample_resume_path, "wb") as f:
        f.write(b"dummy resume bytes")

    await create_job_resume(
        job_id=job_id,
        user_id=user_id,
        filename="sample_resume.pdf",
        file_path=sample_resume_path,
        index=1,
    )

    await mark_resume_processing(job_id, "sample_resume.pdf")

    output_rows = [
        {
            "Request-ID": "REQ-001",
            "Job Title": "Python Developer",
            "Skills - Name": "Python, FastAPI",
            "Work Location CDF": "Mumbai",
            "Candidate Name": "Test Candidate",
            "Candidate Email": "candidate@test.com",
            "Candidate Phone": "9999999999",
            "Candidate Location": "Mumbai",
            "Candidate Total Experience": "5",
            "Candidate Skills": "Python, FastAPI, MongoDB",
            "Experience Mismatch": "No",
            "Skill Mismatch": "No",
            "ATS": "85",
            "Remark": "Good fit for Python role",
        }
    ]

    await save_job_results(
        job_id=job_id,
        user_id=user_id,
        resume_filename="sample_resume.pdf",
        output_rows=output_rows,
    )

    await mark_resume_completed(
        job_id=job_id,
        filename="sample_resume.pdf",
        duration_seconds=12.5,
        input_tokens=1000,
        output_tokens=200,
        total_tokens=1200,
        matched_requirements_count=1,
    )

    await update_job_progress(
        job_id=job_id,
        processed_delta=1,
        successful_delta=1,
        input_tokens_delta=1000,
        output_tokens_delta=200,
        total_tokens_delta=1200,
        current_file="sample_resume.pdf",
        message="Processed sample resume",
    )

    await mark_job_completed(job_id)

    final_job = await get_job_by_id(job_id)
    job_results = await get_job_results(job_id, user_id=user_id)
    job_resumes = await get_job_resumes(job_id, user_id=user_id)

    print("\nFinal job:")
    print(final_job)

    print("\nResume logs:")
    print(job_resumes)

    print("\nResult rows:")
    print(job_results)


asyncio.run(main())