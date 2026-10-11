#!/usr/bin/env python3
"""Build council-rates pages for aldo.today.

Reads data/council-rates-2026-27.json and data/adelaide.csv (the same file
served at aldo.today/adelaide.csv) and writes, for each council that has
rates filled in, under out/<slug>/:

  rates-page.html          body of the new page /councils/<slug>/rates
  rates-head.html          <title>, meta, canonical and JSON-LD for that page
  council-page-block.html  replacements for the existing council page
  preview.html             standalone preview styled with the live site CSS

Standard library only:  python3 build.py
"""
import csv
import json
import pathlib
from html import escape

HERE = pathlib.Path(__file__).parent
SITE = "https://aldo.today"
ESL_URL = "https://www.revenuesa.sa.gov.au/ESL/emergency-services-levy-home-page"
VG_OBJECTION_URL = "https://www.valuergeneral.sa.gov.au/valuation/objecting-to-a-valuation"
CALC_JS = (HERE / "rates-calc.js").read_text()


def money(x):
    return f"${x:,.0f}"


def cents(rate):
    # Stored as dollars per dollar; councils quote cents in the dollar.
    return f"{rate * 100:.9f}".rstrip("0")


def rates_for(cv, c, rate=None):
    rate = c["residential_rate"] if rate is None else rate
    general = max(cv * rate, c["minimum_rate"]) + (c["fixed_charge"] or 0)
    levy = cv * c["landscape_levy"]["rate"]
    return general, levy, general + levy


def weighted_median(rows):
    # Sales-weighted median of suburb medians: a stand-in for the council's
    # typical house, matching how the site builds its 12-month figures.
    pts = sorted((r["median"], r["sales"]) for r in rows)
    half, run = sum(s for _, s in pts) / 2, 0
    for m, s in pts:
        run += s
        if run >= half:
            return m


def load_suburbs(csv_council):
    rows = []
    with open(HERE / "data" / "adelaide.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["council"] != csv_council or not r["median_house_price_12m"]:
                continue
            rows.append({
                "name": r["suburb"],
                "url": r["url"].replace(SITE, ""),
                "median": int(r["median_house_price_12m"]),
                "sales": int(r["house_sales_12m"] or 0),
            })
    return sorted(rows, key=lambda r: r["median"])


def build(slug, c):
    subs = load_suburbs(c["csv_council"])
    name, short = c["name"], c["csv_council"]
    typical = weighted_median(subs)
    t_general, t_levy, t_total = rates_for(typical, c)
    min_below = c["minimum_rate"] / c["residential_rate"]
    levy = c["landscape_levy"]
    page_url = f"{SITE}/councils/{slug}/rates"
    cheap, dear = subs[0], subs[-1]

    faq = [
        (f"How much are council rates in {short}?",
         f"For 2026/27, a house valued at {money(typical)} — about the typical house sale in the {name} — "
         f"pays about {money(t_general)} in general rates plus {money(t_levy)} {levy['board']} levy, "
         f"so about {money(t_total)} a year, or {money(t_total / 4)} a quarter. "
         f"Council’s own average residential rate is {money(c['average_residential_rate'])}."),
        (f"What is the {short} council rate in the dollar for 2026/27?",
         f"{cents(c['residential_rate'])} cents in the dollar of capital value for residential land, "
         f"down from {cents(c['residential_rate_prev'])} in 2025/26. Property values rose, so the rate in the dollar fell; "
         f"the average residential rate still rose {c['average_residential_increase_pct']:.2f}%."),
        (f"What is the minimum rate in {short}?",
         f"{money(c['minimum_rate'])} for 2026/27 (was {money(c['minimum_rate_prev'])}). "
         f"Any residential property with a capital value under about {money(min_below)} pays the minimum — "
         f"{c['share_on_minimum_pct']:.0f}% of rateable properties."),
        (f"When are {short} council rates due?",
         f"In four instalments, in {', '.join(c['instalments'][:-1])} and {c['instalments'][-1]}. "
         f"The exact dates are on your rates notice; you can also pay the year in one go."),
        ("Does my rates notice include the Emergency Services Levy?",
         "No. The ESL is a state levy billed separately by RevenueSA. "
         f"The {levy['board']} landscape levy is on your council notice, but council only collects it for the state."),
        ("What if I think my valuation is too high?",
         "Object to the Valuer-General in writing within 60 days of receiving your first rates notice for the year — there is no fee. "
         "Objecting does not change the due date — keep paying while it is reviewed."),
        (f"Is there a cap on {short} rate rises?",
         c["rate_cap_note"]),
    ]

    rows_html = []
    for s in subs:
        g, l, t = rates_for(s["median"], c)
        on_min = s["median"] < min_below
        rows_html.append(
            f'      <tr><th><a href="{escape(s["url"])}">{escape(s["name"])}</a>'
            f'{" <small>minimum</small>" if on_min else ""}</th>'
            f'<td class="num">{money(s["median"])}</td><td class="num">{money(g)}</td>'
            f'<td class="num">{money(l)}</td><td class="num"><b>{money(t)}</b></td></tr>')

    cfg = {
        "council": name,
        "residential": c["residential_rate"],
        "categories": c["other_categories"],
        "minimum": c["minimum_rate"],
        "fixed": c["fixed_charge"] or 0,
        "levy": levy["rate"],
        "levyName": levy["board"] + " levy",
        "cap": c["rate_cap_pct"],
        "typical": typical,
    }

    body = f'''<article class="rates">
  <h1 class="title" id="r-h">{escape(short)} council rates 2026/27</h1>
  <p class="lede">A house valued at {money(typical)} — about the typical house sale in the {escape(name)} — pays about
    <b>{money(t_total)} a year</b> in council rates ({money(t_total / 4)} a quarter). Put in your own capital value below.</p>
  <p class="fine">Unofficial estimate by aldo.today, not the {escape(name)}. Your rates notice is the bill. Figures from the
    council’s adopted 2026/27 budget, checked {escape(c["checked"])}.</p>

  <h2 class="hub__h2" id="calc">Rates calculator</h2>
  <form class="ratescalc" data-rates-calc onsubmit="return false">
    <p><label for="rc-cv">Capital value <span class="fine">(on your rates notice or Valuer-General notice)</span></label><br>
      <input id="rc-cv" name="cv" inputmode="decimal" autocomplete="off" placeholder="{typical:,}" value="{typical:,}"></p>
    <p><label for="rc-use">Land use</label><br>
      <select id="rc-use" name="use"></select></p>
    <p><label for="rc-last">Last year’s general rates <span class="fine">(optional, to check the {c["rate_cap_pct"]:g}% cap)</span></label><br>
      <input id="rc-last" name="last" inputmode="decimal" autocomplete="off" placeholder="e.g. 1,800"></p>
    <output class="ratescalc__out" for="rc-cv rc-use rc-last" aria-live="polite"></output>
  </form>
  <script type="application/json" id="rates-cfg">{json.dumps(cfg)}</script>

  <h2 class="hub__h2">How {escape(short)} works out your rates</h2>
  <ol>
    <li><b>Capital value × rate in the dollar.</b> Residential: {cents(c["residential_rate"])} cents per dollar of the
      Valuer-General’s capital value. $1,000,000 × {c["residential_rate"]:.11f} = {money(1_000_000 * c["residential_rate"])}.</li>
    <li><b>Minimum rate {money(c["minimum_rate"])}.</b> If step 1 comes to less, you pay the minimum. That happens
      below a capital value of about {money(min_below)}.</li>
    <li><b>Plus the {escape(levy["board"])} levy</b> — {cents(levy["rate"])} cents in the dollar, collected for the state
      ({money(1_000_000 * levy["rate"])} per $1m of value).</li>
  </ol>
  <p>Business and other land pays a different rate in the dollar: commercial {cents(c["other_categories"]["Commercial (shop, office and other)"])}¢,
    vacant land {cents(c["other_categories"]["Vacant land"])}¢. Pick it in the calculator.</p>

  <h2 class="hub__h2" id="by-suburb">Rates on a typical house, by suburb</h2>
  <p>Using each suburb’s 12-month median house price as the capital value. Your capital value is set by the
    Valuer-General and may differ from a sale price — use the calculator for your own house.
    Cheapest: {escape(cheap["name"])} (about {money(rates_for(cheap["median"], c)[2])}); dearest:
    {escape(dear["name"])} (about {money(rates_for(dear["median"], c)[2])}).</p>
  <div class="tablewrap">
    <table class="suburbs" data-sortable>
      <thead><tr><th><button type="button" data-sort="text">Suburb</button></th>
        <th class="num"><button type="button" data-sort="num">Median house</button></th>
        <th class="num"><button type="button" data-sort="num">General rates</button></th>
        <th class="num"><button type="button" data-sort="num">Levy</button></th>
        <th class="num"><button type="button" data-sort="num">Total a year</button></th></tr></thead>
      <tbody>
{chr(10).join(rows_html)}
      </tbody>
    </table>
  </div>
  <p class="fine">“minimum” = the suburb median is under the minimum-rate threshold, so a typical house there pays {money(c["minimum_rate"])} general rates.</p>

  <h2 class="hub__h2">Paying and getting help</h2>
  <ul class="plain">
    <li><b>Pay or check your notice:</b> <a href="{escape(c["council_rates_url"])}" rel="noopener">{escape(name)} rates page</a> (BPAY, online, direct debit, in person) or call {escape(c["council_phone"])}.</li>
    <li><b>Struggling to pay:</b> council offers hardship arrangements, and seniors can postpone rates above $500.</li>
    <li><b>Concessions:</b> the state Cost of Living Concession (ConcessionsSA 1800 307 758) can go toward rates.</li>
    <li><b>Valuation looks wrong:</b> <a href="{VG_OBJECTION_URL}" rel="noopener">object to the Valuer-General</a> within 60 days.</li>
    <li><b>Emergency Services Levy:</b> billed separately — <a href="{ESL_URL}" rel="noopener">how the ESL works</a>.</li>
  </ul>

  <h2 id="rqa-h">Questions about {escape(short)} council rates</h2>
{chr(10).join(f"  <h3>{escape(q)}</h3>{chr(10)}  <p>{escape(a)}</p>" for q, a in faq)}

  <h2 class="hub__h2">Thinking of selling or splitting?</h2>
  <p>Rates follow value. <a href="/councils/{slug}">House prices across the {escape(name)}</a>,
    <a href="/split-check">check if your block can be split</a>, or ask for a free appraisal.</p>

  <p class="fine">Source: <a href="{escape(c["source_url"])}" rel="noopener">{escape(c["source_title"])}</a>, adopted
    {escape(c["adopted"])}. Suburb medians: SA Valuer-General via Data.SA. Not a rates notice, valuation or financial advice.</p>
</article>
<script>
{CALC_JS}</script>
'''

    title = f"{short} council rates 2026/27 — calculator and rates by suburb"
    desc = (f"Estimate your {name} council rates for 2026/27: {cents(c['residential_rate'])}¢ in the dollar, "
            f"{money(c['minimum_rate'])} minimum, plus {levy['board']} levy. A {money(typical)} house pays about "
            f"{money(t_total)} a year. Working shown.")
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": page_url, "url": page_url, "name": title, "description": desc,
             "inLanguage": "en-AU", "isPartOf": {"@type": "WebSite", "name": "aldo.today", "url": SITE + "/"},
             "publisher": {"@id": SITE + "/#org"}, "dateModified": c["checked"],
             "breadcrumb": {"@type": "BreadcrumbList", "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "Councils", "item": SITE + "/councils"},
                 {"@type": "ListItem", "position": 2, "name": name, "item": f"{SITE}/councils/{slug}"},
                 {"@type": "ListItem", "position": 3, "name": "Council rates", "item": page_url}]}},
            {"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
        ],
    }
    head = f'''<title>{escape(title)}</title>
<meta name="description" content="{escape(desc)}">
<link rel="canonical" href="{page_url}">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(desc)}">
<meta property="og:url" content="{page_url}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
'''

    block = f'''<!-- 1. In "Owning a home in the {name}", replace the "Council rates" <li> with: -->
    <li><b>Council rates:</b> about {money(t_total)} a year on a {money(typical)} house in 2026/27 —
      <a href="/councils/{slug}/rates">{escape(short)} rates calculator and rates by suburb</a>
      ({cents(c["residential_rate"])}¢ in the dollar, {money(c["minimum_rate"])} minimum).</li>

<!-- 2. Replace the answer to "How are council rates worked out in the {name}?" (HTML and FAQPage JSON-LD) with: -->
{escape(faq[0][1])} Residential rates are {cents(c["residential_rate"])} cents per dollar of the Valuer-General’s capital value, with a {money(c["minimum_rate"])} minimum, plus the {levy["board"]} levy. Work out your own on the {short} rates calculator: {page_url}

<!-- 3. Each Charles Sturt suburb page: one line under its price, e.g. for a suburb with median M:
     "Council rates on a house at this price: about $X a year — /councils/{slug}/rates#by-suburb"
     The per-suburb figures are in the table in rates-page.html. -->
'''

    css = '''.ratescalc { max-width: 30rem; }
.ratescalc input, .ratescalc select { width: 100%; font: inherit; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); }
.ratescalc__out { display: block; margin-top: 12px; padding: 14px 16px; border: 1px solid var(--rule); border-radius: 6px; }
.ratescalc__out .big { font-size: 1.6rem; font-weight: 600; }
.ratescalc__out dl { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; margin: 10px 0 0; }
.ratescalc__out dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
'''
    out = HERE / "out" / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "rates-page.html").write_text(body)
    (out / "rates-head.html").write_text(head)
    (out / "council-page-block.html").write_text(block)
    (out / "rates.css").write_text(css)
    (out / "preview.html").write_text(f'''<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
{head}<link rel="stylesheet" href="{SITE}/assets/journal.css?v=3.39.0">
<style>{css}</style></head>
<body><main>
{body}</main></body></html>
''')
    return name, typical, t_total


def main():
    data = json.loads((HERE / "data" / "council-rates-2026-27.json").read_text())
    todo = []
    for slug, c in data["councils"].items():
        if c is None:
            todo.append(slug)
            continue
        name, typical, total = build(slug, c)
        print(f"built {slug}: {name}, typical {money(typical)} -> {money(total)}/yr")
    print(f"still to fill in ({len(todo)}): {', '.join(todo)}")


if __name__ == "__main__":
    main()
