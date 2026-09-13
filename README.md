# Google Maps Lead Scraper (LeadForge)

A robust B2B lead generation tool built with Python, Scrapling, Patchright, and FastAPI to extract business leads (name, phone, website, address, ratings) from Google Maps.

## Quick Links
- [RUN_COMMANDS.md](file:///Users/alokvishwakarma/leadddddddddd/RUN_COMMANDS.md) — Complete cheat sheet of setup, CLI, server, Docker, and API commands.
- [ARCHITECTURE.md](file:///Users/alokvishwakarma/leadddddddddd/agent/ARCHITECTURE.md) — Two-phase scraping architecture breakdown and selector strategy.

---

## Quick Start Commands

```bash
# 1. Install dependencies
pip install -r requirements.txt
python3 -m patchright install

# 2. Run CLI scraper
python maps_lead_scraper.py --query "dentists" --location "Jaipur, India" --max-results 30

# 3. Or launch web server
python server.py
```

Refer to [`RUN_COMMANDS.md`](file:///Users/alokvishwakarma/leadddddddddd/RUN_COMMANDS.md) for full usage instructions.
