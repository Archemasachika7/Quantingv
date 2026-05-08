#!/bin/bash
# Start QuantingV — backend + frontend in parallel

echo "Starting QuantingV..."

# Backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID)"

# Frontend
cd ../frontend
npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID $FRONTEND_PID)"

echo ""
echo "QuantingV running:"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped'" INT
wait
