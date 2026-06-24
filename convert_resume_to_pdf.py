import os
import subprocess
import tempfile
import shutil
from pathlib import Path


# ==========================
# CONFIG
# ==========================

# Linux / Docker command
LIBREOFFICE_CMD = "libreoffice"

# For Windows local testing, use something like:
# LIBREOFFICE_CMD = r"C:\Program Files\LibreOffice\program\soffice.exe"


SUPPORTED_INPUT_EXTENSIONS = [".doc", ".docx", ".pdf"]


def get_file_extension(file_path: str) -> str:
    return Path(file_path).suffix.lower()


def convert_resume_to_pdf(resume_path: str, output_folder: str = None) -> str:
    """
    Convert resume file to PDF.

    Input:
        resume_path: path of .doc / .docx / .pdf resume
        output_folder: optional output folder

    Output:
        returns final PDF path

    Behavior:
        - If input is already PDF, it copies PDF to output folder.
        - If input is DOC/DOCX, it converts using LibreOffice.
        - Output PDF keeps same base filename.
    """

    resume_path = Path(resume_path).resolve()

    if not resume_path.exists():
        raise FileNotFoundError(f"Resume file not found: {resume_path}")

    ext = resume_path.suffix.lower()

    if ext not in SUPPORTED_INPUT_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}. Supported: {SUPPORTED_INPUT_EXTENSIONS}"
        )

    if output_folder is None:
        output_folder = resume_path.parent / "converted_pdf"
    else:
        output_folder = Path(output_folder).resolve()

    output_folder.mkdir(parents=True, exist_ok=True)

    output_pdf_path = output_folder / f"{resume_path.stem}.pdf"

    # If already PDF, just copy with same name
    if ext == ".pdf":
        shutil.copy2(resume_path, output_pdf_path)
        return str(output_pdf_path)

    # For DOC/DOCX conversion
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        temp_input_path = temp_dir / resume_path.name
        shutil.copy2(resume_path, temp_input_path)

        command = [
            LIBREOFFICE_CMD,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--convert-to",
            "pdf",
            "--outdir",
            str(temp_dir),
            str(temp_input_path),
        ]

        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise RuntimeError(
                "LibreOffice conversion failed.\n"
                f"STDOUT:\n{result.stdout}\n"
                f"STDERR:\n{result.stderr}"
            )

        temp_pdf_path = temp_dir / f"{resume_path.stem}.pdf"

        if not temp_pdf_path.exists():
            pdf_files = list(temp_dir.glob("*.pdf"))

            if not pdf_files:
                raise RuntimeError(
                    "PDF conversion failed. No PDF file created.\n"
                    f"STDOUT:\n{result.stdout}\n"
                    f"STDERR:\n{result.stderr}"
                )

            temp_pdf_path = pdf_files[0]

        shutil.copy2(temp_pdf_path, output_pdf_path)

    return str(output_pdf_path)


def convert_folder_resumes_to_pdf(input_folder: str, output_folder: str = None):
    """
    Convert all .pdf/.doc/.docx resumes from a folder into PDFs.
    """

    input_folder = Path(input_folder).resolve()

    if output_folder is None:
        output_folder = input_folder / "converted_pdf"
    else:
        output_folder = Path(output_folder).resolve()

    output_folder.mkdir(parents=True, exist_ok=True)

    converted = []
    failed = []

    files = [
        p for p in input_folder.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_INPUT_EXTENSIONS
    ]

    print(f"Total supported files found: {len(files)}")
    print(f"Output folder: {output_folder}")
    print("-" * 80)

    for index, file_path in enumerate(files, start=1):
        try:
            print(f"[{index}/{len(files)}] Converting: {file_path.name}")

            pdf_path = convert_resume_to_pdf(
                resume_path=str(file_path),
                output_folder=str(output_folder),
            )

            converted.append(
                {
                    "input": str(file_path),
                    "output": pdf_path,
                    "status": "success",
                }
            )

            print(f"SUCCESS: {pdf_path}")

        except Exception as e:
            failed.append(
                {
                    "input": str(file_path),
                    "error": str(e),
                    "status": "failed",
                }
            )

            print(f"FAILED: {file_path.name}")
            print(f"ERROR: {e}")

        print("-" * 80)

    print("\n========== FINAL SUMMARY ==========")
    print(f"Total files     : {len(files)}")
    print(f"Converted       : {len(converted)}")
    print(f"Failed          : {len(failed)}")
    print(f"Output folder   : {output_folder}")

    if failed:
        print("\nFailed files:")
        for item in failed:
            print(f"- {Path(item['input']).name}: {item['error']}")

    return {
        "total": len(files),
        "converted": converted,
        "failed": failed,
        "output_folder": str(output_folder),
    }


# ==========================
# DIRECT RUN EXAMPLES
# ==========================

if __name__ == "__main__":
    # OPTION 1: Convert one resume
    # pdf_path = convert_resume_to_pdf(
    #     resume_path="/path/to/resume.docx",
    #     output_folder="/path/to/output_pdf"
    # )
    # print("Converted PDF:", pdf_path)

    # OPTION 2: Convert full folder
    result = convert_folder_resumes_to_pdf(
        input_folder="/root/Desktop/Siro_Resume/71_resume/doc_resume/",
        output_folder="converted_pdf"
    )