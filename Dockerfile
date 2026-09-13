# Use Python 3.11 slim image
FROM python:3.11-slim

# Base OS-level tools (Chromium's own deps are installed later via --with-deps)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install patchright browser executables + all required OS-level dependencies
RUN python3 -m patchright install --with-deps chromium

# Copy application files
COPY . .

# Expose default port
EXPOSE 8000

# Start FastAPI server (supports PORT env var from Render/Railway/Fly.io)
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]