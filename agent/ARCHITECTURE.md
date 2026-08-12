# Architecture

## Why two phases instead of one pass

Google Maps' search results feed only shows a preview (name, rating, category snippet) — phone, website, and full address only render once you open a listing's own page. Trying to get everything in one scrape means constant clicking within a single browser tab, which is slow and fragile (one bad click desyncs the whole run).

Splitting into two independent phases is more robust:

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Phase 1: SEARCH    │  URLs  │   Phase 2: ENRICH         │
│  scroll results feed │ ─────► │  visit each place_url     │
│  collect place URLs  │        │  independently, in a      │
│  + name/rating        │        │  fresh page each time     │
└─────────────────────┘        └──────────────────────────┘
```

Each place URL in Phase 2 is fetched on its own — if one listing's page fails to load or has weird markup, it's caught and skipped without breaking the run.

## Phase 1 — Search & collect (`collect_listings`)

1. `build_search_url()` turns `query + location` into a Maps search URL:
   `https://www.google.com/maps/search/<query>+in+<location>`
2. `StealthyFetcher.fetch()` loads it with a `page_action` callback (`scroll_feed`).
3. **Scrolling logic:** Maps lazy-loads listings as you scroll the `div[role="feed"]` container. The callback:
   - Waits for the feed to appear.
   - Loops up to `max_scrolls` times, scrolling the feed by its own height each round.
   - Tracks how many listing links exist after each scroll. If the count doesn't grow for 3 consecutive rounds, it assumes it's hit the end of the results and stops early — this avoids scrolling 25 times on a search that only has 8 results.
4. Once scrolling finishes, Scrapling's `page.css()` extracts each listing card and pulls:
   - `place_url` — from the `<a href="...maps/place/...">` tag
   - `name` — from that same link's `aria-label`
   - `rating_raw` — from the nearby `span[role="img"]` aria-label

**Why `aria-label` instead of visible text:** Google's actual text nodes and CSS classes are obfuscated and change across builds, but ARIA attributes are there for accessibility/screen-readers and are far more stable. This is the same trick used for Phase 2's detail extraction.

## Phase 2 — Enrich (`enrich_listing`)

Each `place_url` collected in Phase 1 gets fetched fresh (no shared browser state, so one failure can't cascade). On the detail page:

- `phone` — pulled from `button[data-item-id^="phone:"]`, then regex-stripped of the label prefix Google adds to the aria-label.
- `website` — pulled from `a[data-item-id="authority"]`'s `href`.
- `address` — pulled from `button[data-item-id^="address"]`.

**Why `data-item-id`:** these are Google's own internal identifiers for each action button in the detail panel (call, website, directions, etc.). They're semantic and far more durable across redesigns than positional CSS selectors like `.fontBodyMedium > div:nth-child(3)`, which is what you'd otherwise be reduced to.

## Fragility points & how to fix them if Google changes something

| Symptom | Likely cause | Fix |
|---|---|---|
| Phase 1 returns 0 listings | `div[role="feed"]` or the card selector `div[jsaction]` changed | Open a search in a real browser, inspect the feed container, update the selector in `collect_listings()` |
| Phase 1 finds listings but names are blank | The `aria-label` moved to a different element | Inspect one listing card's HTML, find where the label now lives |
| Phase 2 phone/website are blank but page loads fine | `data-item-id` prefix changed, or panel now lazy-loads | Inspect a place page's action buttons for the current `data-item-id` values |
| Getting blocked / CAPTCHA'd | Too many requests too fast | Increase `--delay`, lower `--max-results`, or add proxy rotation (see below) |

## Extension points

- **Proxy rotation:** Scrapling ships a `ProxyRotator`. For higher volume, wrap both fetch calls with a rotator instance passed via the `proxy` argument.
- **Dedup across runs:** currently each run is independent. To avoid re-scraping the same businesses across campaigns, load a previous CSV's `place_url` column into a set and skip matches before Phase 2.
- **Email discovery:** Phase 2 could optionally follow the `website` field and scrape the site's contact/about page for an email address — same `StealthyFetcher.fetch()` pattern, just pointed at the business's own domain instead of Maps.
- **Adaptive selectors:** Scrapling supports `auto_save=True` / `adaptive=True` on `.css()` calls, which lets it relocate elements after minor markup changes using similarity matching. Worth wiring in once you're running this regularly, so small Google redesigns don't silently break Phase 1/2.
