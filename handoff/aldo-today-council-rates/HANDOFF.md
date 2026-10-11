# Handoff: council rates pages for aldo.today

**Goal:** win "charles sturt council rates calculator" and "charles sturt council rates", then the same search for all 19 councils. No official Charles Sturt calculator turned up in search. The only competing calculators are generic and don't use real council numbers.

**Status (11 Oct 2026):** Charles Sturt is built, tested, and ready to paste. The other 18 councils need their 2026/27 numbers (about 10 min each). The aldo.today site source isn't on GitHub, so nothing is live yet. Publishing happens on your PC.

## On your PC

```bash
git clone https://github.com/aldohushi1-stack/aldohushi1-stack   # or: git fetch origin
cd aldohushi1-stack && git checkout ccr-a27e7e84-rr0yti
cd handoff/aldo-today-council-rates
python3 build.py                                  # regenerates out/ (stdlib only)
python3 -m http.server -d out/charles-sturt 8000  # then open http://localhost:8000/preview.html
```

## What's here

| File | What it is |
|---|---|
| `data/council-rates-2026-27.json` | Rates figures. Charles Sturt is filled in from the adopted 2026/27 budget; the other 18 are `null`. |
| `data/adelaide.csv` | Copy of aldo.today/adelaide.csv, used for suburb medians. Replace it with the latest file before a rebuild. |
| `build.py` | Generates every page below for each council with data. |
| `rates-calc.js` | Calculator (vanilla JS, about 60 lines). `build.py` inlines it into each page. |
| `out/charles-sturt/rates-page.html` | Page body for the new URL **/councils/charles-sturt/rates** |
| `out/charles-sturt/rates-head.html` | `<title>`, meta description, canonical, and WebPage + Breadcrumb + FAQPage JSON-LD |
| `out/charles-sturt/rates.css` | About 6 lines of CSS. Everything else uses existing journal.css classes (`hub__h2`, `plain`, `fine`, `table.suburbs`, `data-sortable`). |
| `out/charles-sturt/council-page-block.html` | The edits to the **existing** /councils/charles-sturt page |
| `out/charles-sturt/preview.html` | Standalone preview using the live journal.css |

## Publishing Charles Sturt (about 30 min)

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

## Rolling out the other 18 councils

For each council, search for "<council> annual business plan 2026/27 rating policy" and open the **adopted** version, not the draft. Then copy the `charles-sturt` block in the JSON and change every field. Watch for these differences:
- **Fixed charge instead of a minimum rate.** Some councils use one. Set `fixed_charge` and set `minimum_rate` to 0.
- **Rate cap.** It differs per council, or there may be none. Set `rate_cap_pct` and `rate_cap_note`, and edit the cap wording in `build.py` if there's no cap.
- **Separate rates.** Some councils add these, e.g. for a precinct or a waste service. Note them on the page.
- **Landscape levy.** Councils outside the Green Adelaide area pay a different board's levy, e.g. Adelaide Hills pays Hills and Fleurieu. Set `landscape_levy.board`.

Then run `python3 build.py`.

**Suggested order (biggest councils first):** Port Adelaide Enfield, Onkaparinga, Salisbury, West Torrens, Marion, Playford, Tea Tree Gully, then the rest. Once all 19 are done, add a "/councils ranked by rates" page next to "councils by house price".

## Other searches worth winning (next)

- **"<council> minimum block size" / "can I subdivide in <council>"** → /subdivide-adelaide and /split-check. This is where your leads come from.
- **"<council> zoning map" / "<council> planning zones"** → /planning-zones, cut by council.
- **"<council> suburbs list" / "<council> map"** → the council pages already answer this; make sure the H2 says "Suburbs in the City of …".
- **Skip:** council phone, contact, login, complaints and payment searches. People want the council itself for those.

## Prompt to paste into Claude Code on your PC

> In the aldo.today site repo: read handoff/aldo-today-council-rates/HANDOFF.md from the aldohushi1-stack repo (branch ccr-a27e7e84-rr0yti). Port build.py into the site generator so /councils/<slug>/rates is generated for every council in council-rates-2026-27.json that isn't null. Use the existing page template, add rates.css to journal.css, apply the council-page-block edits to the council page template, and add the new URLs to the sitemap. Build, check /councils/charles-sturt/rates shows $2,116 for a 1,196,500 capital value, then show me the diff before deploying.
