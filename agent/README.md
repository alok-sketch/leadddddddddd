# Google Maps Lead Scraper

A personal lead-gen tool built on [Scrapling](https://github.com/D4Vinci/Scrapling). Give it a business type and a location, and it returns a CSV of leads with name, rating, address, phone, and website.

## Setup

```bash
pip install "scrapling[fetchers]"
scrapling install        # downloads the browser + stealth dependencies
```

## Usage

```bash
python maps_lead_scraper.py --query "dentists" --location "Jaipur, India" --max-results 40
```

| Flag | Default | What it does |
|---|---|---|
| `--query` | *required* | Business type / search term, e.g. `"gyms"`, `"real estate agents"` |
| `--location` | *required* | City/area to search in, e.g. `"Jaipur, India"` |
| `--max-results` | `30` | Stop collecting once you hit this many listings |
| `--output` | `leads.csv` | Path to write the CSV |
| `--no-enrich` | off | Skip Phase 2 (phone/website/address) — just names, ratings, and Maps URLs. Much faster. |
| `--delay` | `1.5` | Seconds to wait between Phase 2 requests |

## Output

`leads.csv` with columns:

- `name`
- `rating_raw` (Google's raw aria-label, e.g. `"4.5 stars 120 reviews"`)
- `place_url`
- `phone` *(enrich mode only)*
- `website` *(enrich mode only)*
- `address` *(enrich mode only)*

## Workflow

1. **Search** — builds a Google Maps search URL from your query + location.
2. **Scroll & collect** — a browser session scrolls the results feed until enough listings have loaded, then grabs each listing's Maps URL, name, and rating.
3. **Enrich** *(optional, on by default)* — visits each listing's own page individually to pull phone, website, and full address from the detail panel.
4. **Export** — writes everything to CSV.

See `ARCHITECTURE.md` for how each stage is implemented and why.

## Known limits

- Scraping Google Maps at volume is against Google's ToS — this is built for personal, low-volume use, not a hosted service hitting Maps thousands of times a day.
- Google's feed markup changes periodically; if Phase 1 stops finding listings, the fix is almost always re-checking the `div[jsaction]` selector in `collect_listings()` against the current page HTML.
- No retry/backoff logic yet — a failed enrichment request is skipped and logged, not retried.
