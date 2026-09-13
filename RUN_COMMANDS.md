# Google Maps Lead Scraper — Run Commands Guide

This document contains all the necessary setup, CLI, Web Server, Docker, and API commands for running and deploying the **Google Maps Lead Scraper** (`LeadForge`).

---

## Table of Contents
1. [Prerequisites & Environment Setup](#1-prerequisites--environment-setup)
2. [CLI Scraper Commands](#2-cli-scraper-commands)
3. [Web Server Commands (FastAPI + Uvicorn)](#3-web-server-commands-fastapi--uvicorn)
4. [Docker Commands](#4-docker-commands)
5. [API Curl Commands](#5-api-curl-commands)

---

## 1. Prerequisites & Environment Setup

### Create and Activate Virtual Environment (Recommended)
```bash
# Create virtual environment
python3 -m venv venv

# Activate on macOS/Linux
source venv/bin/activate

# Activate on Windows (CMD / PowerShell)
# venv\Scripts\activate
```

### Install Python Dependencies
```bash
pip install -r requirements.txt
```

### Install Headless Browsers (Patchright / Playwright)
```bash
python3 -m patchright install
```

---

## 2. CLI Scraper Commands

The CLI tool is located in [`maps_lead_scraper.py`](file:///Users/alokvishwakarma/leadddddddddd/maps_lead_scraper.py).

### Basic Search & Enrich
Runs Phase 1 (search) and Phase 2 (enrichment) with default settings (30 results, saves to `leads.csv`).
```bash
python maps_lead_scraper.py --query "dentists" --location "Jaipur, India"
```

### Custom Output File & Max Results
```bash
python maps_lead_scraper.py --query "real estate agents" --location "Miami, FL" --max-results 50 --output "miami_real_estate.csv"
```

### Fast Mode (Skip Detail Enrichment)
Skips Phase 2 detail lookup (phone, website, address) for faster collection of listing URLs and names.
```bash
python maps_lead_scraper.py --query "gyms" --location "Austin, TX" --max-results 40 --no-enrich --output "gyms_raw.csv"
```

### Custom Delay Between Requests
Set delay (in seconds) between individual place page fetches during Phase 2 enrichment.
```bash
python maps_lead_scraper.py --query "plumbers" --location "Chicago, IL" --max-results 30 --delay 2.5 --output "chicago_plumbers.csv"
```

### High-Rating & No-Website Filtered Scrape (Prime Agency Leads)
Filters and exports **ONLY** leads with no website URL and Google rating >= 4.0 stars:
```bash
python maps_lead_scraper.py --query "dentists" --location "Jaipur, India" --max-results 40 --only-no-website --min-rating 4.0 --output "no_website_dentists.csv"
```

---

## 3. Web Server Commands (FastAPI + Uvicorn)

The API server and frontend application entrypoint is [`server.py`](file:///Users/alokvishwakarma/leadddddddddd/server.py).

### Run Server in Development Mode (With Auto-Reload)
```bash
python server.py
```
*App will start at:* `http://localhost:8000`

### Run via Uvicorn Directly
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Run Server in Production Mode
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1
```

---

## 4. Docker Commands

### Build Docker Image
```bash
docker build -t leadforge-maps-scraper .
```

### Run Docker Container Locally
```bash
docker run -d -p 8000:8000 --name leadforge-scraper leadforge-maps-scraper
```

### Run Docker Container with Custom Port
```bash
docker run -d -p 8080:8080 -e PORT=8080 --name leadforge-scraper leadforge-maps-scraper
```

### View Container Logs
```bash
docker logs -f leadforge-scraper
```

### Stop and Remove Container
```bash
docker stop leadforge-scraper && docker rm leadforge-scraper
```

---

## 5. API Curl Commands

### Check Server Status
```bash
curl -X GET http://localhost:8000/api/status
```

### Start Scraping Job (With No-Website & Rating Filter)
```bash
curl -X POST http://localhost:8000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Dentists",
    "location": "Jaipur, India",
    "max_results": 30,
    "enrich": true,
    "delay": 1.5,
    "only_no_website": true,
    "min_rating": 4.0
  }'
```

### Get Scrape Results (JSON)
```bash
curl -X GET http://localhost:8000/api/results
```

### Download Generated CSV File
```bash
curl -O http://localhost:8000/api/download
```

### Get Preset Business Categories
```bash
curl -X GET http://localhost:8000/api/preset-categories
```
