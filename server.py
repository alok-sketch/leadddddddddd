import asyncio
import csv
import json
import os
import re
import subprocess
import sys
import threading
import time
from typing import List, Dict, Any, Optional
from urllib.parse import quote_plus

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="LeadForge Google Maps Lead Scraper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State for Scraping Job
scrape_state = {
    "is_running": False,
    "query": "",
    "location": "",
    "max_results": 30,
    "enrich": True,
    "delay": 1.5,
    "phase": "idle",  # idle, searching, enriching, completed, failed
    "progress": 0,
    "total": 0,
    "current_status": "Ready to scrape",
    "logs": [],
    "results": [],
    "error": None,
    "completed_at": None
}

state_lock = threading.Lock()

PRESET_CATEGORIES = [
    {
        "id": "healthcare",
        "category": "Healthcare & Medical",
        "icon": "fa-user-doctor",
        "targets": [
            {
                "title": "Dentists & Dental Clinics",
                "query": "Dentists",
                "sample_location": "Jaipur, India",
                "lead_value": "$$$ High",
                "desc": "Dental practices seeking patient management software, SEO, or medical equipment.",
                "badge": "High Conversion"
            },
            {
                "title": "Dermatologists & Skin Clinics",
                "query": "Dermatologists",
                "sample_location": "Mumbai, India",
                "lead_value": "$$$ High",
                "desc": "Cosmetic and skin clinics high in customer LTV looking for aesthetic tech.",
                "badge": "High LTV"
            },
            {
                "title": "Physiotherapy & Rehab",
                "query": "Physiotherapy clinics",
                "sample_location": "Delhi, India",
                "lead_value": "$$ Medium",
                "desc": "Physical therapy centers seeking local lead generation & appointment booking tools.",
                "badge": "Popular"
            }
        ]
    },
    {
        "id": "home_services",
        "category": "Home & Trade Services",
        "icon": "fa-house-chimney-crack",
        "targets": [
            {
                "title": "HVAC & Air Conditioning",
                "query": "HVAC contractor",
                "sample_location": "Austin, TX",
                "lead_value": "$$$$ Premium",
                "desc": "High ticket service businesses needing Google Ads management & CRM automation.",
                "badge": "High Ticket"
            },
            {
                "title": "Plumbers & Plumbing Services",
                "query": "Plumbers",
                "sample_location": "Chicago, IL",
                "lead_value": "$$$ High",
                "desc": "Emergency trade contractors requiring immediate dispatch and call tracking software.",
                "badge": "Urgent Need"
            },
            {
                "title": "Roofing Contractors",
                "query": "Roofing contractor",
                "sample_location": "Dallas, TX",
                "lead_value": "$$$$ Premium",
                "desc": "Top-tier contractor leads with high job values looking for storm response marketing.",
                "badge": "Top Value"
            }
        ]
    },
    {
        "id": "real_estate",
        "category": "Real Estate & Construction",
        "icon": "fa-building",
        "targets": [
            {
                "title": "Real Estate Agencies & Brokers",
                "query": "Real Estate Agency",
                "sample_location": "Miami, FL",
                "lead_value": "$$$$ Premium",
                "desc": "Property brokers and agents needing social media management, virtual tour tools, and leads.",
                "badge": "High Volume"
            },
            {
                "title": "Interior Designers & Decorators",
                "query": "Interior Designer",
                "sample_location": "Bengaluru, India",
                "lead_value": "$$$ High",
                "desc": "Luxury home styling studios open to B2B vendor partnerships & material suppliers.",
                "badge": "Creative B2B"
            },
            {
                "title": "Architectural Firms",
                "query": "Architects",
                "sample_location": "London, UK",
                "lead_value": "$$$$ Premium",
                "desc": "Architectural consultants looking for 3D rendering services and CAD software solutions.",
                "badge": "B2B Professional"
            }
        ]
    },
    {
        "id": "fitness_beauty",
        "category": "Fitness & Wellness",
        "icon": "fa-dumbbell",
        "targets": [
            {
                "title": "Gyms & Crossfit Studios",
                "query": "Gyms",
                "sample_location": "Los Angeles, CA",
                "lead_value": "$$ Medium",
                "desc": "Fitness centers looking for member retention apps, supplement B2B deals, and local ads.",
                "badge": "High Demand"
            },
            {
                "title": "Spas & Luxury Salons",
                "query": "Luxury Spa and Salon",
                "sample_location": "Dubai, UAE",
                "lead_value": "$$$ High",
                "desc": "High end wellness spas seeking premium product suppliers and online booking tech.",
                "badge": "Premium Segment"
            }
        ]
    },
    {
        "id": "professional",
        "category": "Professional & Legal Services",
        "icon": "fa-briefcase",
        "targets": [
            {
                "title": "Corporate Law Firms",
                "query": "Law firm",
                "sample_location": "New York, NY",
                "lead_value": "$$$$ Premium",
                "desc": "Attorneys and legal practices in need of document automation, cybersecurity, and PPC.",
                "badge": "High Budget"
            },
            {
                "title": "Accounting & CPA Firms",
                "query": "Accountants CPA",
                "sample_location": "Toronto, Canada",
                "lead_value": "$$$ High",
                "desc": "Tax consultants and auditors needing workflow automation & client portal software.",
                "badge": "B2B Saas Target"
            }
        ]
    }
]

class ScrapeRequest(BaseModel):
    query: str
    location: str
    max_results: int = 30
    enrich: bool = True
    delay: float = 1.5

def add_log(message: str):
    timestamp = time.strftime("%H:%M:%S")
    formatted = f"[{timestamp}] {message}"
    print(formatted)
    with state_lock:
        scrape_state["logs"].append(formatted)
        if len(scrape_state["logs"]) > 200:
            scrape_state["logs"].pop(0)

def run_scraper_task(query: str, location: str, max_results: int, enrich: bool, delay: float):
    with state_lock:
        scrape_state["is_running"] = True
        scrape_state["query"] = query
        scrape_state["location"] = location
        scrape_state["max_results"] = max_results
        scrape_state["enrich"] = enrich
        scrape_state["delay"] = delay
        scrape_state["phase"] = "searching"
        scrape_state["progress"] = 0
        scrape_state["total"] = max_results
        scrape_state["current_status"] = f"Phase 1: Searching for '{query}' in '{location}'..."
        scrape_state["logs"] = []
        scrape_state["results"] = []
        scrape_state["error"] = None
        scrape_state["completed_at"] = None

    add_log(f"🚀 Initializing Lead Scraper for '{query}' near '{location}' (Target: {max_results})")

    try:
        # Import scrapling fetcher directly to report progress accurately
        from scrapling.fetchers import StealthyFetcher
        from maps_lead_scraper import build_search_url, make_scroll_action, extract_detail_text

        search_url = build_search_url(query, location)
        add_log(f"Phase 1: Loading search feed {search_url}...")
        
        page = StealthyFetcher.fetch(
            search_url,
            headless=True,
            network_idle=True,
            page_action=make_scroll_action(max_results),
        )

        cards = page.css('div[role="feed"] > div > div[jsaction]')
        listings = []
        seen_urls = set()

        for card in cards:
            link = card.css('a[href*="/maps/place/"]::attr(href)').get()
            if not link or link in seen_urls:
                continue
            seen_urls.add(link)

            name = card.css('a[href*="/maps/place/"]::attr(aria-label)').get()
            rating = card.css('span[role="img"]::attr(aria-label)').get()

            listings.append({
                "name": name or "Unknown Place",
                "rating_raw": rating or "N/A",
                "place_url": link,
            })

            if len(listings) >= max_results:
                break

        add_log(f"✅ Phase 1 complete! Collected {len(listings)} business listings.")

        with state_lock:
            scrape_state["total"] = len(listings)
            scrape_state["phase"] = "enriching" if enrich else "completed"

        final_rows = []
        if enrich and listings:
            add_log(f"Phase 2: Enriching {len(listings)} listings with phone, website & address details...")
            for idx, item in enumerate(listings, 1):
                with state_lock:
                    scrape_state["progress"] = idx
                    scrape_state["current_status"] = f"Phase 2: Enriching item {idx}/{len(listings)}: {item['name']}"

                try:
                    p_page = StealthyFetcher.fetch(item["place_url"], headless=True, network_idle=True)
                    e_name = p_page.css('h1::text').get() or item["name"]
                    phone_raw = extract_detail_text(p_page, "phone:")
                    website = p_page.css('a[data-item-id="authority"]::attr(href)').get() or ""
                    address_raw = extract_detail_text(p_page, "address")

                    phone = re.sub(r"^[^\d+]*", "", phone_raw)
                    address = address_raw.replace("Address: ", "")

                    detail = {
                        "name": e_name,
                        "phone": phone,
                        "website": website,
                        "address": address,
                        "place_url": item["place_url"],
                        "rating_raw": item.get("rating_raw", "")
                    }
                    final_rows.append(detail)
                    add_log(f"  [{idx}/{len(listings)}] Extracted: {e_name} | Phone: {phone or 'N/A'}")
                except Exception as ex:
                    add_log(f"  [{idx}/{len(listings)}] ⚠️ Failed enriching {item['name']}: {ex}")
                    final_rows.append(item)

                time.sleep(delay)
        else:
            final_rows = listings

        # Save to CSV
        output_file = "leads.csv"
        if final_rows:
            fieldnames = list(final_rows[0].keys())
            with open(output_file, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(final_rows)

        with state_lock:
            scrape_state["results"] = final_rows
            scrape_state["phase"] = "completed"
            scrape_state["current_status"] = f"Done! Scraped & saved {len(final_rows)} leads to {output_file}"
            scrape_state["completed_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            scrape_state["is_running"] = False

        add_log(f"🎉 Scraping Job Completed Successfully! {len(final_rows)} leads saved.")

    except Exception as e:
        err_msg = str(e)
        add_log(f"❌ Error during scraping: {err_msg}")
        with state_lock:
            scrape_state["is_running"] = False
            scrape_state["phase"] = "failed"
            scrape_state["error"] = err_msg
            scrape_state["current_status"] = f"Failed: {err_msg}"

@app.post("/api/scrape")
def start_scrape(req: ScrapeRequest, background_tasks: BackgroundTasks):
    with state_lock:
        if scrape_state["is_running"]:
            raise HTTPException(status_code=400, detail="A scraping job is already running.")

    background_tasks.add_task(
        run_scraper_task,
        query=req.query,
        location=req.location,
        max_results=req.max_results,
        enrich=req.enrich,
        delay=req.delay
    )
    return {"status": "started", "message": "Lead generation job started in background."}

@app.get("/api/status")
def get_status():
    with state_lock:
        return {
            "is_running": scrape_state["is_running"],
            "query": scrape_state["query"],
            "location": scrape_state["location"],
            "max_results": scrape_state["max_results"],
            "phase": scrape_state["phase"],
            "progress": scrape_state["progress"],
            "total": scrape_state["total"],
            "current_status": scrape_state["current_status"],
            "logs": scrape_state["logs"][-30:],  # Last 30 logs
            "results_count": len(scrape_state["results"]),
            "error": scrape_state["error"],
            "completed_at": scrape_state["completed_at"]
        }

@app.get("/api/results")
def get_results():
    with state_lock:
        if scrape_state["results"]:
            return {"results": scrape_state["results"]}
    
    # Try reading from leads.csv if state is empty
    if os.path.exists("leads.csv"):
        try:
            results = []
            with open("leads.csv", mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    results.append(row)
            return {"results": results}
        except Exception as e:
            return {"results": [], "error": str(e)}
    
    return {"results": []}

@app.get("/api/download")
def download_csv():
    if os.path.exists("leads.csv"):
        return FileResponse(
            path="leads.csv",
            filename="leads.csv",
            media_type="text/csv"
        )
    raise HTTPException(status_code=404, detail="No leads.csv file found yet.")

@app.get("/api/preset-categories")
def get_preset_categories():
    return {"categories": PRESET_CATEGORIES}

# Serve static frontend files
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
