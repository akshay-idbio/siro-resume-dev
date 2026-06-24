import os
import re
import time
import uuid
import shutil
import threading
from pathlib import Path
from typing import List

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# =========================================================
# IMPORT CEO ORIGINAL LOGIC
# =========================================================
# Keep CEO original code in ceo_original_app.py
# Do not change its logic.
from ceo_original_app import (
    run_match_job,
    job_state,
    _state_snapshot,
    OUTPUT_DIR,
    WORK_DIR,
    token_tracker,
)

# =========================================================
# CEO API WRAPPER APP
# =========================================================

app = Flask(__name__)
CORS(app)

PORT = 8008

CEO_API_WORK_DIR = WORK_DIR / "api_mode"
CEO_API_WORK_DIR.mkdir(exist_ok=True)

CEO_API_RESUME_DIR = CEO_API_WORK_DIR / "resumes"
CEO_API_RESUME_DIR.mkdir(exist_ok=True)

CEO_API_EXCEL_PATH = CEO_API_WORK_DIR / "openings.xlsx"


# =========================================================
# HELPERS
# =========================================================

def reset_ceo_api_storage():
    if CEO_API_RESUME_DIR.exists():
        shutil.rmtree(CEO_API_RESUME_DIR)

    CEO_API_RESUME_DIR.mkdir(parents=True, exist_ok=True)

    if CEO_API_EXCEL_PATH.exists():
        CEO_API_EXCEL_PATH.unlink()


def reset_ceo_job_state():
    job_state.update({
        "status": "idle",
        "stage": "",
        "progress": 0,
        "total": 0,
        "message": "",
        "log": [],
        "outputs": {},
        "results_summary": None,
        "start_time": None,
    })

    try:
        token_tracker.reset()
    except Exception:
        pass


def safe_filename(filename: str) -> str:
    filename = os.path.basename(filename or "")
    filename = re.sub(r"[^a-zA-Z0-9_. -]", "_", filename)
    return filename.strip() or f"file_{uuid.uuid4().hex[:8]}"


# =========================================================
# API ROUTES
# =========================================================

@app.get("/ceo-health")
def ceo_health():
    return jsonify({
        "ok": True,
        "pipeline": "ceo_original",
        "message": "CEO original API wrapper is running",
        "port": PORT,
    })


@app.post("/ceo-start")
def ceo_start():
    """
    Frontend should send multipart/form-data:

    api_key: Anthropic API key
    excel: Requirement Excel file
    files: multiple resumes
    """

    if job_state.get("status") == "running":
        return jsonify({
            "ok": False,
            "error": "CEO original job is already running",
        }), 409

    api_key = request.form.get("api_key", "").strip()
    excel_file = request.files.get("excel")
    resume_files = request.files.getlist("files")

    if not api_key.startswith("sk-ant"):
        return jsonify({
            "ok": False,
            "error": "Invalid or missing Anthropic API key",
        }), 400

    if not excel_file:
        return jsonify({
            "ok": False,
            "error": "Requirement Excel file is missing",
        }), 400

    if not resume_files:
        return jsonify({
            "ok": False,
            "error": "Resume files are missing",
        }), 400

    reset_ceo_api_storage()
    reset_ceo_job_state()

    # Save requirement excel
    excel_file.save(CEO_API_EXCEL_PATH)

    saved_count = 0
    skipped_files = []

    allowed_ext = {".pdf", ".docx", ".doc"}

    for file in resume_files:
        filename = safe_filename(file.filename)
        ext = Path(filename).suffix.lower()

        if ext not in allowed_ext:
            skipped_files.append(filename)
            continue

        save_path = CEO_API_RESUME_DIR / filename
        file.save(save_path)
        saved_count += 1

    if saved_count == 0:
        return jsonify({
            "ok": False,
            "error": "No supported resume files found. Supported: PDF, DOCX, DOC",
            "skipped_files": skipped_files,
        }), 400

    job_id = f"CEO_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    job_state.update({
        "status": "running",
        "stage": "",
        "progress": 0,
        "total": saved_count,
        "message": "CEO original pipeline started",
        "log": [],
        "outputs": {},
        "results_summary": None,
        "start_time": time.time(),
        "job_id": job_id,
    })

    try:
        token_tracker.reset()
    except Exception:
        pass

    # IMPORTANT:
    # This calls CEO original function directly.
    # So output remains same as CEO app.
    threading.Thread(
        target=run_match_job,
        args=(api_key, str(CEO_API_EXCEL_PATH), str(CEO_API_RESUME_DIR)),
        daemon=True,
    ).start()

    return jsonify({
        "ok": True,
        "job_id": job_id,
        "pipeline": "ceo_original",
        "total_files_received": len(resume_files),
        "total_files_saved": saved_count,
        "skipped_files": skipped_files,
        "message": "CEO original pipeline started",
    })


@app.get("/ceo-status")
def ceo_status():
    snapshot = _state_snapshot()

    # Add friendly download URLs
    outputs = snapshot.get("outputs", {}) or {}

    if outputs.get("excel"):
        outputs["excel_download_url"] = f"/ceo-download/{outputs['excel']}"

    if outputs.get("pdf"):
        outputs["pdf_download_url"] = f"/ceo-download/{outputs['pdf']}"

    snapshot["outputs"] = outputs
    snapshot["pipeline"] = "ceo_original"

    return jsonify(snapshot)


@app.get("/ceo-dashboard-data")
def ceo_dashboard_data():
    return jsonify(job_state.get("outputs", {}).get("dashboard_data", []))


@app.get("/ceo-token-cost")
def ceo_token_cost():
    return jsonify(token_tracker.snapshot())


@app.post("/ceo-reset")
def ceo_reset():
    if job_state.get("status") == "running":
        return jsonify({
            "ok": False,
            "error": "Cannot reset while CEO original job is running",
        }), 409

    reset_ceo_api_storage()
    reset_ceo_job_state()

    return jsonify({
        "ok": True,
        "message": "CEO original API state reset successfully",
    })


@app.get("/ceo-download/<filename>")
def ceo_download(filename):
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "", filename)

    file_path = Path(OUTPUT_DIR) / safe

    if not file_path.exists():
        return jsonify({
            "ok": False,
            "error": "File not found",
        }), 404

    return send_from_directory(OUTPUT_DIR, safe, as_attachment=True)


# =========================================================
# START
# =========================================================

if __name__ == "__main__":
    print(f"\nCEO Original API running on http://localhost:{PORT}")
    print("Routes:")
    print("GET  /ceo-health")
    print("POST /ceo-start")
    print("GET  /ceo-status")
    print("GET  /ceo-token-cost")
    print("GET  /ceo-download/<filename>\n")

    app.run(host="0.0.0.0", port=PORT, debug=False)