"""
Google Maps Lead Scraper (built on Scrapling)
-----------------------------------------------
Phase 1: Search Google Maps for a query + location, scroll the results feed,
         collect each listing's place URL + a quick snapshot (name, rating, category).
Phase 2: Visit each place URL individually and pull phone / website / address / hours
         from the detail panel using data-item-id attributes (stable across Google's
         markup churn, unlike their obfuscated CSS classes).

Install:
    pip install "scrapling[fetchers]"
    scrapling install

Usage:
    python maps_lead_scraper.py --query "dentists" --location "Jaipur, India" --max-results 40
"""

import argparse
import csv
import re
import time
from urllib.parse import quote_plus

from scrapling.fetchers import StealthyFetcher
from playwright.sync_api import Page


# ---------- Phase 1: search + scroll ----------

def build_search_url(query: str, location: str) -> str:
    full_query = f"{query} in {location}"
    return f"https://www.google.com/maps/search/{quote_plus(full_query)}"


def make_scroll_action(max_results: int, max_scrolls: int = 25, pause_ms: int = 1200):
    """Returns a page_action callback that scrolls the results feed until
    we've loaded enough listings or the feed stops growing."""

    def scroll_feed(page: Page):
        page.wait_for_selector('div[role="feed"]', timeout=15000)
        feed = page.locator('div[role="feed"]')

        last_count = 0
        stagnant_rounds = 0

        for _ in range(max_scrolls):
            count = page.locator('div[role="feed"] a[href*="/maps/place/"]').count()
            if count >= max_results:
                break
            if count == last_count:
                stagnant_rounds += 1
                if stagnant_rounds >= 3:  # feed stopped loading new results (end of list)
                    break
            else:
                stagnant_rounds = 0
            last_count = count

            feed.evaluate("el => el.scrollBy(0, el.scrollHeight)")
            page.wait_for_timeout(pause_ms)

    return scroll_feed


def collect_listings(query: str, location: str, max_results: int) -> list[dict]:
    url = build_search_url(query, location)
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        page_action=make_scroll_action(max_results),
    )

    cards = page.css('div[role="feed"] > div > div[jsaction]')
    results = []
    seen_urls = set()

    for card in cards:
        link = card.css('a[href*="/maps/place/"]::attr(href)').get()
        if not link or link in seen_urls:
            continue
        seen_urls.add(link)

        name = card.css('a[href*="/maps/place/"]::attr(aria-label)').get()
        rating = card.css('span[role="img"]::attr(aria-label)').get()  # e.g. "4.5 stars"

        results.append({
            "name": name or "",
            "rating_raw": rating or "",
            "place_url": link,
        })

        if len(results) >= max_results:
            break

    return results


# ---------- Phase 2: enrich each listing ----------

def extract_detail_text(page_selector, item_id_prefix: str) -> str:
    el = page_selector.css(f'button[data-item-id^="{item_id_prefix}"]::attr(aria-label)').get()
    return el or ""


def clean_website_url(url: str) -> str:
    if not url:
        return ""
    url = url.strip()
    if "google.com/url?" in url and "q=" in url:
        match = re.search(r"[?&]q=([^&]+)", url)
        if match:
            from urllib.parse import unquote
            url = unquote(match.group(1))
    return url.strip()


def extract_website(page) -> str:
    """Multi-stage detection for business website URL on Google Maps detail page."""
    # Stage 1: Google primary authority link
    website = page.css('a[data-item-id="authority"]::attr(href)').get()
    if website:
        return clean_website_url(website)

    # Stage 2: aria-label or tooltip containing 'website' or 'Website'
    website = page.css('a[aria-label*="website"]::attr(href)').get() or \
              page.css('a[aria-label*="Website"]::attr(href)').get() or \
              page.css('a[data-tooltip*="website"]::attr(href)').get() or \
              page.css('a[data-tooltip*="Website"]::attr(href)').get()
    if website:
        return clean_website_url(website)

    # Stage 3: External anchor links in main panel
    all_links = page.css('a::attr(href)').getall()
    for link in all_links:
        if link and ("http://" in link or "https://" in link):
            link_lower = link.lower()
            if not any(domain in link_lower for domain in ["google.com", "google.co", "ggpht.com", "gstatic.com", "schema.org", "w3.org", "facebook.com", "instagram.com"]):
                return clean_website_url(link)

    return ""


def parse_rating_value(rating_raw: str) -> float:
    """Extracts floating point star rating from aria-label string (e.g. '4.5 stars' -> 4.5)."""
    if not rating_raw:
        return 0.0
    match = re.search(r"(\d+(?:\.\d+)?)", rating_raw)
    if match:
        try:
            val = float(match.group(1))
            if 0.0 <= val <= 5.0:
                return val
        except ValueError:
            pass
    return 0.0


def enrich_listing(place_url: str) -> dict:
    page = StealthyFetcher.fetch(place_url, headless=True, network_idle=True)

    name = page.css('h1::text').get() or ""
    phone_raw = extract_detail_text(page, "phone:")
    website = extract_website(page)
    address_raw = extract_detail_text(page, "address")

    phone = re.sub(r"^[^\d+]*", "", phone_raw)  # strip leading label text, keep the number

    return {
        "name": name,
        "phone": phone,
        "website": website,
        "address": address_raw.replace("Address: ", ""),
        "place_url": place_url,
    }


# ---------- main ----------

def run(query: str, location: str, max_results: int, output_path: str, enrich: bool, delay: float, only_no_website: bool = False, min_rating: float = 0.0):
    if only_no_website:
        enrich = True  # Website status requires enrichment

    # If filtering, expand candidate pool so we dig enough results to reach target max_results
    candidate_limit = max_results * 4 if (only_no_website or min_rating > 0) else max_results

    print(f"[1/2] Searching '{query}' near '{location}' (Candidate pool: up to {candidate_limit})...")
    listings = collect_listings(query, location, candidate_limit)
    print(f"  found {len(listings)} candidate listings")

    rows = listings
    if enrich:
        print(f"[2/2] Enriching listings & digging for target {max_results} qualified leads...")
        rows = []
        for i, item in enumerate(listings, 1):
            if len(rows) >= max_results:
                print(f"🎯 Reached target quota of {max_results} qualified leads!")
                break

            try:
                detail = enrich_listing(item["place_url"])
                detail["rating_raw"] = item.get("rating_raw", "")
                
                # Check filters
                has_website = bool(detail.get("website", "").strip())
                rating_val = parse_rating_value(detail.get("rating_raw", ""))

                if only_no_website and has_website:
                    print(f"  ({i}/{len(listings)}) ⏭️ Skipped {detail['name']} (Has website: {detail['website']})")
                    continue

                if min_rating > 0 and rating_val < min_rating:
                    print(f"  ({i}/{len(listings)}) ⏭️ Skipped {detail['name']} (Rating {rating_val} < {min_rating})")
                    continue

                rows.append(detail)
                print(f"  ({i}/{len(listings)}) ✅ Kept [{len(rows)}/{max_results}]: {detail['name']} | Rating: {rating_val}⭐ | Web: NONE (NO WEBSITE)")
            except Exception as e:
                print(f"  ({i}/{len(listings)}) failed: {e}")
            time.sleep(delay)

    fieldnames = list(rows[0].keys()) if rows else ["name", "rating_raw", "place_url"]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved {len(rows)} qualified leads to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape Google Maps business leads with Scrapling")
    parser.add_argument("--query", required=True, help='e.g. "dentists", "gyms", "real estate agents"')
    parser.add_argument("--location", required=True, help='e.g. "Jaipur, India"')
    parser.add_argument("--max-results", type=int, default=30)
    parser.add_argument("--output", default="leads.csv")
    parser.add_argument("--no-enrich", action="store_true", help="Skip phase 2 (phone/website/address)")
    parser.add_argument("--delay", type=float, default=1.5, help="Seconds between enrichment requests")
    parser.add_argument("--only-no-website", action="store_true", help="Keep only leads that do NOT have a website")
    parser.add_argument("--min-rating", type=float, default=0.0, help="Minimum Google rating threshold (e.g. 4.0)")
    args = parser.parse_args()

    run(
        query=args.query,
        location=args.location,
        max_results=args.max_results,
        output_path=args.output,
        enrich=not args.no_enrich,
        delay=args.delay,
        only_no_website=args.only_no_website,
        min_rating=args.min_rating,
    )

