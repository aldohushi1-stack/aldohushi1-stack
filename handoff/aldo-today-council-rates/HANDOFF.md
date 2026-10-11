# Handoff: council rates pages for aldo.today

**Goal:** win "charles sturt council rates calculator" and "charles sturt council rates", then the same search for all 19 councils. No official Charles Sturt calculator turned up in search. The only competing calculators are generic and don't use real council numbers.

**Status (11 Oct 2026):** 12 of 19 councils are built from adopted 2026/27 budgets and ready to paste. The other 7 have their figures filled in but need a quick browser check, because their sites block automated access. The aldo.today site source isn't on GitHub, so nothing is live yet. Publishing happens on your PC.

| Council | Status | Typical house → rates/yr |
|---|---|---|
| Charles Sturt | ✅ built | $1,196,500 → $2,116 |
| Adelaide (city) | ✅ built: rated on **annual value** (75% of a year's rent); calculator takes annual value or weekly rent | avg home → $2,387 general rates |
| Adelaide Hills | ✅ built ($940 fixed charge, Hills & Fleurieu levy) | $1,060,000 → $3,106 |
| Burnside | ✅ built | $1,970,000 → $3,326 |
| Holdfast Bay | ✅ built | $1,525,000 → $2,848 |
| Marion | ✅ built | $1,002,500 → $2,196 |
| Mitcham | ✅ built | $1,319,000 → $2,841 |
| Norwood Payneham & St Peters | ✅ built | $1,530,000 → $2,890 |
| Onkaparinga | ✅ built ($820 fixed charge, two levy zones) | $870,000 → $2,319 |
| Playford | ✅ built ($1,304.30 fixed charge) | $718,500 → $2,255 |
| Unley | ✅ built | $1,780,000 → $3,047 |
| West Torrens | ✅ built | $1,180,000 → $2,091 |
| Campbelltown | 🔎 check: levy rate missing | — |
| Gawler | 🔎 check: all figures from search snippets; $290 waste charge | — |
| Prospect | 🔎 check: all figures from search snippets | — |
| Salisbury | 🔎 check: how the high-value discount works | — |
| Tea Tree Gully | 🔎 check: levy rate missing | — |
| Port Adelaide Enfield | 🔎 check: minimum $1,190 (unchanged, from the draft plan) and rates from search snippets | — |
| Walkerville | 🔎 check: **draft** figures pre-filled; swap in the adopted ones from the 29 June 2026 minutes | — |

The "To check" notes for each council, with exact links, are in `data/checks-2026-27.json`. To clear a 🔎 council: open its link in a browser, confirm or fix the figures in `data/council-rates-2026-27.json`, delete its `"verified": false` line, and run `python3 build.py`.

## On your PC

```bash
git clone https://github.com/aldohushi1-stack/aldohushi1-stack   # or: git fetch origin
cd aldohushi1-stack && git checkout ccr-a27e7e84-rr0yti
cd handoff/aldo-today-council-rates
python3 build.py                                  # regenerates out/ (stdlib only)
python3 -m http.server -d out 8000  # then open http://localhost:8000/<council>/preview.html
```

## What's here

| File | What it is |
|---|---|
| `data/council-rates-2026-27.json` | Rates figures. Charles Sturt is filled in from the adopted 2026/27 budget; the other 18 are `null`. |
| `data/adelaide.csv` | Copy of aldo.today/adelaide.csv, used for suburb medians. Replace it with the latest file before a rebuild. |
| `build.py` | Generates every page below for each council with data (skips unverified ones). |
| `merge_results.py` | Loads researched figures into the JSON and catches cents-vs-dollars mistakes. |
| `data/checks-2026-27.json` | Confidence and to-check notes for every council. |
| `rates-calc.js` | Calculator (vanilla JS, about 60 lines). `build.py` inlines it into each page. |
| `out/charles-sturt/rates-page.html` | Page body for the new URL **/councils/charles-sturt/rates** |
| `out/charles-sturt/rates-head.html` | `<title>`, meta description, canonical, and WebPage + Breadcrumb + FAQPage JSON-LD |
| `out/charles-sturt/rates.css` | About 6 lines of CSS. Everything else uses existing journal.css classes (`hub__h2`, `plain`, `fine`, `table.suburbs`, `data-sortable`). |
| `out/charles-sturt/council-page-block.html` | The edits to the **existing** /councils/charles-sturt page |
| `out/charles-sturt/preview.html` | Standalone preview using the live journal.css |

## Publishing (Charles Sturt first, then each built council; about 30 min the first time)

1. **New page `/councils/charles-sturt/rates`.** Use your normal page template with the head from `rates-head.html` and the body from `rates-page.html`. Add `rates.css` to journal.css and bump the `?v=`.
   - Better: port `build.py` into the site generator so the page rebuilds whenever adelaide.csv refreshes. Its logic is about 40 lines; the rest is the HTML template.
2. **Existing `/councils/charles-sturt` page.** Apply the two edits in `council-page-block.html`:
   - the "Council rates" bullet now links to the new page;
   - the FAQ answer gets real numbers, in both the HTML and the JSON-LD.
3. **Optional: each Charles Sturt suburb page.** Add one line, "Council rates on a house at this price: about $X a year", linking to `/councils/charles-sturt/rates#by-suburb`.
4. **Sitemap.** Add `https://aldo.today/councils/charles-sturt/rates`.
5. **Check before deploy:**
   - The calculator gives $2,116 for 1,196,500.
   - 700k gives "minimum".
   - The suburb table sorts.
   - Run the [Rich Results Test](https://search.google.com/test/rich-results) on the live URL.
6. **Google Search Console.** Use URL Inspection, then Request indexing, for the new page and for /councils/charles-sturt.

## The numbers (check once a year, after budgets are adopted in June/July)

City of Charles Sturt, Annual Business Plan & Budget 2026/27, adopted 22 June 2026: [PDF](https://hdp-au-prod-app-ccs-yoursay-files.s3.ap-southeast-2.amazonaws.com/3117/8279/8811/Annual_Business_Plan_and_Budget_2026_27.pdf). See Appendix F (Rating Policy) and Table 9.

- **Residential rate:** 0.170947733¢ in the dollar of capital value (2025/26: 0.181141064).
- **Minimum rate:** $1,410 (2025/26: $1,350). It applies below about $824,814 capital value, which covers 34.21% of properties.
- **Green Adelaide levy:** 0.00588¢ in the dollar.
- **Average residential rate:** $1,847.01, up 4.50%.
- **Rate capping:** a rebate on rises over 12.5% (residential only; not when the rise comes from more than $20k of improvements).
- **Instalments:** September, December, March, June.
- **Other land uses (¢ in the dollar):**
  - Commercial: 0.644786739
  - Industrial: 0.653323037
  - Primary production: 0.550338983
  - Vacant land: 0.530469271
  - Other: 0.328777377

In the JSON, rates are stored in **dollars** per dollar, so divide the council's cents figure by 100.

**Honesty notes (already on the page):**
- It's labelled an unofficial estimate.
- It doesn't use the council logo.
- It links to the council's own payment page.
- It explains that a suburb median sale price is not the Valuer-General's capital value. That's why the $2,116 "typical house" figure is above the council's own $1,847 average.

## Finishing the last councils

- **🔎 Browser checks (Campbelltown, Gawler, Port Adelaide Enfield, Prospect, Salisbury, Tea Tree Gully, Walkerville):** follow `data/checks-2026-27.json`. Salisbury also needs its high-value residential discount added to `rates_for()` in `build.py` and to `rates-calc.js`. The discount is 10% / 20% / 35% above $969k / $1.065m / $1.205m; check whether it applies to the whole rate or only the slice of value in each band.
- **Port Adelaide Enfield and Walkerville:** their figures are filled in. PAE only needs a check against its rates page. Walkerville's are the **draft** figures, so replace them with the adopted ones from the 29 June 2026 Special Council Minutes. Links and steps are in `checks-2026-27.json`.
- **New-year refresh (each July):**
  - add a 2027/28 JSON;
  - run `merge_results.py` to load researched figures. It rejects rates that look like cents instead of dollars, so a forgotten ÷100 gets caught.
- **Once all are live:** add a "councils ranked by rates" page next to "councils by house price".

## Other searches worth winning (next)

- **"<council> minimum block size" / "can I subdivide in <council>"** → /subdivide-adelaide and /split-check. This is where your leads come from.
- **"<council> zoning map" / "<council> planning zones"** → /planning-zones, cut by council.
- **"<council> suburbs list" / "<council> map"** → the council pages already answer this; make sure the H2 says "Suburbs in the City of …".
- **Skip:** council phone, contact, login, complaints and payment searches. People want the council itself for those.

## Prompt to paste into Claude Code on your PC

> In the aldo.today site repo: read handoff/aldo-today-council-rates/HANDOFF.md from the aldohushi1-stack repo (branch ccr-a27e7e84-rr0yti). Port build.py into the site generator so /councils/<slug>/rates is generated for every council in council-rates-2026-27.json that is filled in, verified, and rated on capital value (the same rules as build.py). Use the existing page template, add rates.css to journal.css, apply the council-page-block edits to the council page template, and add the new URLs to the sitemap. Build, check /councils/charles-sturt/rates shows $2,116 for a 1,196,500 capital value, then show me the diff before deploying.
