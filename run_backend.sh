#!/bin/bash
set -e

cd /root/Desktop/Siro_Resume_DEV

source "/root/miniconda3/etc/profile.d/conda.sh"
conda activate makedata

set -a
source /root/Desktop/Siro_Resume_DEV/.env
set +a

export MAIN_AI_PARALLEL_RESUMES=25

exec uvicorn main:app --host 0.0.0.0 --port 9000
