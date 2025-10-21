#!/bin/bash
set -e

# Activate venv and start backend
source venv/bin/activate
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
