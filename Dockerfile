# Multi-stage build for Nanosheet

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Set build-time environment variables for production
ARG VITE_API_URL=https://nanosheet.fly.dev
ARG VITE_YWS=wss://nanosheet.fly.dev/yjs
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_YWS=${VITE_YWS}

# Build frontend (outputs to frontend/dist)
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./

# Copy GCP service account key
COPY gcp-service-account-key.json .

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/dist ./static

# Expose port
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV ENVIRONMENT=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application using uvicorn
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
