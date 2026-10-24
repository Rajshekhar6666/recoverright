#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " RecoverRight Clinical Recovery Platform Launch Assistant "
echo "=========================================================="

if [ "$1" = "--docker" ]; then
    echo "Starting RecoverRight via Docker Compose..."
    if [ ! -f ".env" ]; then
        echo "Creating default .env from .env.example..."
        cp .env.example .env
    fi
    docker-compose up --build
    exit 0
fi

if [ ! -f ".env" ]; then
    echo "Notice: Creating default .env from .env.example"
    cp .env.example .env
fi

echo "[1/2] Launching FastAPI backend on http://localhost:8000..."
(cd api && python -m uvicorn app.main:app --reload --port 8000) &
API_PID=$!

echo "[2/2] Launching Next.js frontend on http://localhost:3000..."
(cd web && npm run dev) &
WEB_PID=$!

trap "kill $API_PID $WEB_PID 2>/dev/null || true" EXIT INT TERM

echo ""
echo "RecoverRight is active!"
echo "  - Backend API: http://localhost:8000"
echo "  - Frontend:    http://localhost:3000"
echo "Press Ctrl+C to terminate both servers."

wait
