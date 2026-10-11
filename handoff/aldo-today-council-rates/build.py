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


def tier_discount(cv, rate, tiers):
    # Salisbury-style high-value adjustment: a % off the rates on each slice of value inside a band.
    off = 0
    for lo, hi, pct in tiers or []:
        slice_ = max(0, min(cv, hi or cv) - lo)
        off += slice_ * rate * pct
    return off


def rates_for(cv, c, rate=None):
    residential = rate is None
    rate = c["residential_rate"] if rate is None else rate
    general = max(cv * rate, c["minimum_rate"] or 0) + (c["fixed_charge"] or 0)
    if residential:
        general -= tier_discount(cv, rate, c.get("value_tiers"))
    lv = c["landscape_levy"]
    levy = cv * lv["rate"] if lv.get("rate") else lv.get("fixed") or 0
    # A service charge (e.g. Gawler's waste charge) sits on the notice but isn't a general rate.
    return general, levy, general + levy + (c.get("service_charge") or 0)


def levy_text(lv):
    if lv.get("rate"):
        return f"{cents(lv['rate'])} cents in the dollar ({money(1_000_000 * lv['rate'])} per $1m of value)"
    return f"a flat {money(lv.get('fixed') or 0)}"


def floor_text(c):
    # The part of the bill that doesn't depend on value: a minimum or a fixed charge.
    if c["minimum_rate"]:
        return f"{money(c['minimum_rate'])} minimum"
    if c["fixed_charge"]:
        return f"{money(c['fixed_charge'])} fixed charge"
    return "no minimum"


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


CSS = '''.ratescalc { max-width: 30rem; }
.ratescalc input, .ratescalc select { width: 100%; font: inherit; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); }
.ratescalc__out { display: block; margin-top: 12px; padding: 14px 16px; border: 1px solid var(--rule); border-radius: 6px; }
.ratescalc__out .big { font-size: 1.6rem; font-weight: 600; }
.ratescalc__out dl { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; margin: 10px 0 0; }
.ratescalc__out dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
'''


def head_for(slug, c, title, desc, faq):
    page_url = f"{SITE}/councils/{slug}/rates"
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "@id": page_url, "url": page_url, "name": title, "description": desc,
             "inLanguage": "en-AU", "isPartOf": {"@type": "WebSite", "name": "aldo.today", "url": SITE + "/"},
             "publisher": {"@id": SITE + "/#org"}, "dateModified": c["checked"],
             "breadcrumb": {"@type": "BreadcrumbList", "itemListElement": [
                 {"@type": "ListItem", "position": 1, "name": "Councils", "item": SITE + "/councils"},
                 {"@type": "ListItem", "position": 2, "name": c["name"], "item": f"{SITE}/councils/{slug}"},
                 {"@type": "ListItem", "position": 3, "name": "Council rates", "item": page_url}]}},
            {"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
        ],
    }
    return f'''<title>{escape(title)}</title>
<meta name="description" content="{escape(desc)}">
<link rel="canonical" href="{page_url}">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{escape(desc)}">
<meta property="og:url" content="{page_url}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
'''


def write_out(slug, body, head, block):
    out = HERE / "out" / slug
    out.mkdir(parents=True, exist_ok=True)
    (out / "rates-page.html").write_text(body)
    (out / "rates-head.html").write_text(head)
    (out / "council-page-block.html").write_text(block)
    (out / "rates.css").write_text(CSS)
    (out / "preview.html").write_text(f'''<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
{head}<link rel="stylesheet" href="{SITE}/assets/journal.css?v=3.39.0">
<style>{CSS}</style></head>
<body><main>
{body}</main></body></html>
''')


def build(slug, c):
    subs = load_suburbs(c["csv_council"])
    name, short = c["name"], c["csv_council"]
    typical = weighted_median(subs)
    t_general, t_levy, t_total = rates_for(typical, c)
    min_below = (c["minimum_rate"] or 0) / c["residential_rate"]
    cap = c.get("rate_cap_pct")
    prev, avg, inc = c.get("residential_rate_prev"), c.get("average_residential_rate"), c.get("average_residential_increase_pct")
    levy = c["landscape_levy"]
    page_url = f"{SITE}/councils/{slug}/rates"
    cheap, dear = subs[0], subs[-1]

    faq = [
        (f"How much are council rates in {short}?",
         f"For 2026/27, a house valued at {money(typical)} — about the typical house sale in the {name} — "
         f"pays about {money(t_general)} in general rates plus {money(t_levy)} {levy['board']} levy"
         + (f" and a {money(c['service_charge'])} waste service charge" if c.get("service_charge") else "") + ", "
         f"so about {money(t_total)} a year, or {money(t_total / 4)} a quarter."
         + (f" Council’s own average residential rate is {money(avg)}." if avg else "")),
        (f"What is the {short} council rate in the dollar for 2026/27?",
         f"{cents(c['residential_rate'])} cents in the dollar of capital value for residential land"
         + (f", {'down' if prev > c['residential_rate'] else 'up'} from {cents(prev)} in 2025/26" if prev else "") + "."
         + (" Property values rose, so the rate in the dollar fell" if prev and prev > c["residential_rate"] else "")
         + (f"{'; ' if prev and prev > c['residential_rate'] else ' '}the average residential rate rose {inc:.2f}%." if inc
            else ("." if prev and prev > c["residential_rate"] else ""))),
    ]
    if c["minimum_rate"]:
        was = f" (was {money(c['minimum_rate_prev'])})" if c.get("minimum_rate_prev") else ""
        share = f" — {c['share_on_minimum_pct']:.0f}% of rateable properties" if c.get("share_on_minimum_pct") else ""
        faq.append((f"What is the minimum rate in {short}?",
                    f"{money(c['minimum_rate'])} for 2026/27{was}. Any residential property with a capital value "
                    f"under about {money(min_below)} pays the minimum{share}."))
    if c["fixed_charge"]:
        faq.append((f"Is there a fixed charge on {short} rates?",
                    f"Yes: every property pays a {money(c['fixed_charge'])} fixed charge on top of capital value × the rate in the dollar."))
    faq += [
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
         c.get("rate_cap_note") or "Not one we could find in the 2026/27 rating policy — ask council about hardship options."),
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
        "minimum": c["minimum_rate"] or 0,
        "fixed": c["fixed_charge"] or 0,
        "levy": levy.get("rate") or 0,
        "levyFixed": 0 if levy.get("rate") else (levy.get("fixed") or 0),
        "levyName": levy["board"] + " levy",
        "service": c.get("service_charge") or 0,
        "tiers": c.get("value_tiers") or [],
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
{f"""    <p><label for="rc-last">Last year’s general rates <span class="fine">(optional, to check the {cap:g}% cap)</span></label><br>
      <input id="rc-last" name="last" inputmode="decimal" autocomplete="off" placeholder="e.g. 1,800"></p>
""" if cap else ""}    <output class="ratescalc__out" for="rc-cv rc-use rc-last" aria-live="polite"></output>
  </form>
  <script type="application/json" id="rates-cfg">{json.dumps(cfg)}</script>

  <h2 class="hub__h2">How {escape(short)} works out your rates</h2>
  <ol>
    <li><b>Capital value × rate in the dollar.</b> Residential: {cents(c["residential_rate"])} cents per dollar of the
      Valuer-General’s capital value. $1,000,000 × {c["residential_rate"]:.11f} = {money(1_000_000 * c["residential_rate"])}.</li>
{f"""    <li><b>Minimum rate {money(c["minimum_rate"])}.</b> If step 1 comes to less, you pay the minimum. That happens
      below a capital value of about {money(min_below)}.</li>
""" if c["minimum_rate"] else ""}{f"""    <li><b>Plus a fixed charge of {money(c["fixed_charge"])}</b>, the same for every property.</li>
""" if c["fixed_charge"] else ""}{f"""    <li><b>Plus a {money(c["service_charge"])} waste service charge</b> on most properties with a building.</li>
""" if c.get("service_charge") else ""}{f"""    <li><b>Less the high-value adjustment</b> for homes (not commercial use or multiple dwellings): {"; ".join(f"{pct * 100:g}% off the rates on value {money(lo)}–{money(hi)}" if hi else f"{pct * 100:g}% off the rates on value above {money(lo)}" for lo, hi, pct in c["value_tiers"])}.</li>
""" if c.get("value_tiers") else ""}    <li><b>Plus the {escape(levy["board"])} levy</b> — {levy_text(levy)}, collected for the state.{" " + escape(levy["note"]) if levy.get("note") else ""}</li>
  </ol>
  <p>Business and other land pays a different rate in the dollar:
    {"; ".join(f"{escape(k.lower())} {cents(v)}¢" for k, v in c["other_categories"].items() if v)}. Pick it in the calculator.</p>

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
{f"""  <p class="fine">“minimum” = the suburb median is under the minimum-rate threshold, so a typical house there pays {money(c["minimum_rate"])} general rates.</p>
""" if c["minimum_rate"] else ""}
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
            f"{floor_text(c)}, plus {levy['board']} levy. A {money(typical)} house pays about "
            f"{money(t_total)} a year. Working shown.")
    head = head_for(slug, c, title, desc, faq)

    block = f'''<!-- 1. In "Owning a home in the {name}", replace the "Council rates" <li> with: -->
    <li><b>Council rates:</b> about {money(t_total)} a year on a {money(typical)} house in 2026/27 —
      <a href="/councils/{slug}/rates">{escape(short)} rates calculator and rates by suburb</a>
      ({cents(c["residential_rate"])}¢ in the dollar, {floor_text(c)}).</li>

<!-- 2. Replace the answer to "How are council rates worked out in the {name}?" (HTML and FAQPage JSON-LD) with: -->
{escape(faq[0][1])} Residential rates are {cents(c["residential_rate"])} cents per dollar of the Valuer-General’s capital value, with a {floor_text(c)}, plus the {levy["board"]} levy. Work out your own on the {short} rates calculator: {page_url}

<!-- 3. Each Charles Sturt suburb page: one line under its price, e.g. for a suburb with median M:
     "Council rates on a house at this price: about $X a year — /councils/{slug}/rates#by-suburb"
     The per-suburb figures are in the table in rates-page.html. -->
'''

    write_out(slug, body, head, block)
    return name, typical, t_total


def build_annual(slug, c):
    """City of Adelaide: rates on annual value (75% of a year's rent), not capital value."""
    name, short = c["name"], c["csv_council"]
    levy, cap = c["landscape_levy"], c.get("rate_cap_pct")
    page_url = f"{SITE}/councils/{slug}/rates"
    avg = c["average_residential_rate"]
    avg_av = avg / c["residential_rate"]
    min_below = c["minimum_rate"] / c["residential_rate"]

    def av_from_rent(week):
        return week * 52 * 0.75

    rows, examples = [], []
    with open(HERE / "data" / "adelaide.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["council"] != c["csv_council"]:
                continue
            for kind, col in (("House", "house_rent_week"), ("Unit or apartment", "unit_rent_week")):
                if not r[col]:
                    continue
                week = int(r[col]); av = av_from_rent(week)
                g, l, t = rates_for(av, c)
                examples.append((r["suburb"], kind, week, t))
                rows.append(
                    f'      <tr><th><a href="{escape(r["url"].replace(SITE, ""))}">{escape(r["suburb"])}</a> <small>{kind.lower()}</small></th>'
                    f'<td class="num">${week:,}</td><td class="num">{money(av)}</td><td class="num">{money(g)}</td>'
                    f'<td class="num">{money(l)}</td><td class="num"><b>{money(t)}</b></td></tr>')

    faq = [
        (f"How much are council rates in the City of Adelaide?",
         f"Council’s own figure for the average home in 2026/27 is {money(avg)} in general rates, up {c['average_residential_increase_pct']:g}%. "
         f"That matches an annual value of about {money(avg_av)} — a home that would rent for about {money(avg_av / 0.75 / 52)} a week. "
         f"The {levy['board']} levy adds about {money(avg_av * levy['rate'])}."),
        ("Why are City of Adelaide rates based on rent, not property value?",
         "The City of Adelaide is the only South Australian council that rates on annual value instead of capital value. "
         "Annual value is set by the Valuer-General as 75% of the yearly rent the property could earn, with the landlord paying rates, taxes and insurance — whether or not the owner lives there."),
        ("What is the City of Adelaide rate in the dollar for 2026/27?",
         f"{c['residential_rate'] * 100:.6f} cents per dollar of annual value for residential land (was {c['residential_rate_prev'] * 100:.4f} in 2025/26), "
         f"so a home with an annual value of $20,000 pays {money(20000 * c['residential_rate'])}. "
         f"Non-residential land pays {c['other_categories']['Non-residential (commercial, industrial, primary production, other)'] * 100:.6f} cents and vacant land "
         f"{c['other_categories']['Vacant land'] * 100:.6f} cents."),
        ("What is the minimum rate in the City of Adelaide?",
         f"{money(c['minimum_rate'])} for 2026/27 (was {money(c['minimum_rate_prev'])}), paid by any property with an annual value under about {money(min_below)}."),
        ("Is there a cap on City of Adelaide rate rises?", c["rate_cap_note"]),
        ("When are City of Adelaide rates due?",
         "In four instalments: 1 September 2026, 1 December 2026, 1 March 2027 and 1 June 2027."),
        ("Does my rates notice include the Emergency Services Levy?",
         f"No. The ESL is billed separately by RevenueSA. The {levy['board']} levy is on your council notice, but council only collects it for the state."),
        ("What if I think my annual value is too high?",
         "Object to the Valuer-General in writing within 60 days of receiving your first rates notice for the year — there is no fee. Keep paying while it is reviewed."),
    ]

    cfg = {
        "council": name, "residential": c["residential_rate"], "categories": c["other_categories"],
        "minimum": c["minimum_rate"], "fixed": 0, "levy": levy["rate"], "levyFixed": 0,
        "levyName": levy["board"] + " levy", "service": 0, "cap": cap, "example": "20,000",
    }
    start = round(avg_av, -2)

    body = f'''<article class="rates">
  <h1 class="title" id="r-h">City of Adelaide council rates 2026/27</h1>
  <p class="lede">The City of Adelaide charges rates on <b>annual value</b> — what your property could rent for — not on what it’s worth.
    The average home pays about <b>{money(avg)} a year</b> in general rates. Put in your annual value, or a weekly rent, below.</p>
  <p class="fine">Unofficial estimate by aldo.today, not the City of Adelaide. Your rates notice is the bill. Figures from the
    council’s rates declaration of {escape(c["adopted"])}, checked {escape(c["checked"])}.</p>

  <h2 class="hub__h2" id="calc">Rates calculator</h2>
  <form class="ratescalc" data-rates-calc onsubmit="return false">
    <p><label for="rc-cv">Annual value <span class="fine">(on your rates notice)</span></label><br>
      <input id="rc-cv" name="cv" inputmode="decimal" autocomplete="off" placeholder="{start:,.0f}" value="{start:,.0f}"></p>
    <p><label for="rc-rent">Don’t know it? Weekly rent <span class="fine">(we use 75% of a year’s rent)</span></label><br>
      <input id="rc-rent" name="rent" inputmode="decimal" autocomplete="off" placeholder="e.g. 600"></p>
    <p><label for="rc-use">Land use</label><br>
      <select id="rc-use" name="use"></select></p>
    <p><label for="rc-last">Last year’s general rates <span class="fine">(optional, to check the {cap:g}% cap)</span></label><br>
      <input id="rc-last" name="last" inputmode="decimal" autocomplete="off" placeholder="e.g. 2,200"></p>
    <output class="ratescalc__out" for="rc-cv rc-rent rc-use rc-last" aria-live="polite"></output>
  </form>
  <script type="application/json" id="rates-cfg">{json.dumps(cfg)}</script>

  <h2 class="hub__h2">How the City of Adelaide works out your rates</h2>
  <ol>
    <li><b>Annual value.</b> The Valuer-General sets it at 75% of the yearly rent your property could earn (landlord paying
      rates, taxes and insurance), whether you rent it out or live in it. A home that would rent for $600 a week has an annual value of about {money(av_from_rent(600))}.</li>
    <li><b>Annual value × rate in the dollar.</b> Residential: {c["residential_rate"] * 100:.6f} cents per dollar.
      $20,000 × {c["residential_rate"]:.8f} = {money(20000 * c["residential_rate"])}.</li>
    <li><b>Minimum rate {money(c["minimum_rate"])}</b> — paid if step 2 comes to less (an annual value under about {money(min_below)}).</li>
    <li><b>Plus the {escape(levy["board"])} levy</b> — {levy["rate"] * 100:.6f} cents per dollar of annual value, collected for the state.</li>
    <li><b>Less any rebate:</b> the automatic {cap:g}% cap on rises, and $100 off for eligible pensioners.</li>
  </ol>
  <p>Business land pays {c["other_categories"]["Non-residential (commercial, industrial, primary production, other)"] * 100:.6f}¢ and vacant land
    {c["other_categories"]["Vacant land"] * 100:.6f}¢ per dollar of annual value. Shops in the Rundle Mall precinct also pay the Rundle Mall separate rate.
    Short-stay rentals are rated as business.</p>

  <h2 class="hub__h2" id="by-suburb">Rates on a typical rental, by suburb</h2>
  <p>Using each suburb’s median weekly rent from new bonds lodged, turned into an annual value the way the Valuer-General does.
    Your actual annual value is on your notice and may differ.</p>
  <div class="tablewrap">
    <table class="suburbs" data-sortable>
      <thead><tr><th><button type="button" data-sort="text">Suburb</button></th>
        <th class="num"><button type="button" data-sort="num">Rent a week</button></th>
        <th class="num"><button type="button" data-sort="num">Annual value</button></th>
        <th class="num"><button type="button" data-sort="num">General rates</button></th>
        <th class="num"><button type="button" data-sort="num">Levy</button></th>
        <th class="num"><button type="button" data-sort="num">Total a year</button></th></tr></thead>
      <tbody>
{chr(10).join(rows)}
      </tbody>
    </table>
  </div>
  <p class="fine">Before any cap or pensioner rebate. Rents: Private Rent Report, SA Housing Trust, via Data.SA.</p>

  <h2 class="hub__h2">Paying and getting help</h2>
  <ul class="plain">
    <li><b>Pay or check your notice:</b> <a href="{escape(c["council_rates_url"])}" rel="noopener">City of Adelaide rates page</a> or call {escape(c["council_phone"])}.</li>
    <li><b>Pensioners:</b> a $100 rebate per household, plus the state Cost of Living Concession (ConcessionsSA 1800 307 758).</li>
    <li><b>Valuation looks wrong:</b> <a href="{VG_OBJECTION_URL}" rel="noopener">object to the Valuer-General</a> within 60 days.</li>
    <li><b>Emergency Services Levy:</b> billed separately — <a href="{ESL_URL}" rel="noopener">how the ESL works</a>.</li>
  </ul>

  <h2 id="rqa-h">Questions about City of Adelaide council rates</h2>
{chr(10).join(f"  <h3>{escape(q)}</h3>{chr(10)}  <p>{escape(a)}</p>" for q, a in faq)}

  <h2 class="hub__h2">Thinking of selling or renting out?</h2>
  <p><a href="/councils/{slug}">House prices in the City of Adelaide</a>, or ask for a free appraisal.</p>

  <p class="fine">Source: <a href="{escape(c["source_pdf"])}" rel="noopener">{escape(c["source_title"])}</a>. Annual value: Valuation of Land Act 1971 (SA), s 5.
    Not a rates notice, valuation or financial advice.</p>
</article>
<script>
{CALC_JS}</script>
'''

    title = "City of Adelaide council rates 2026/27 — calculator by annual value or rent"
    desc = (f"Estimate your City of Adelaide council rates for 2026/27. Rates are on annual value (75% of a year’s rent): "
            f"{c['residential_rate'] * 100:.4f}¢ in the dollar, {money(c['minimum_rate'])} minimum. The average home pays about {money(avg)}.")
    head = head_for(slug, c, title, desc, faq)
    block = f'''<!-- 1. In "Owning a home in the {name}", replace the "Council rates" <li> with: -->
    <li><b>Council rates:</b> the City of Adelaide rates on annual value (75% of a year’s rent), not capital value. The average home pays about {money(avg)} a year —
      <a href="/councils/{slug}/rates">City of Adelaide rates calculator</a>.</li>

<!-- 2. Replace the answer to "How are council rates worked out in the {name}?" (HTML and FAQPage JSON-LD) with: -->
{escape(faq[1][1])} {escape(faq[0][1])} Work out your own on the City of Adelaide rates calculator: {page_url}
'''
    write_out(slug, body, head, block)
    return name, avg_av, rates_for(avg_av, c)[2]


def main():
    data = json.loads((HERE / "data" / "council-rates-2026-27.json").read_text())
    todo, unverified = [], []
    for slug, c in data["councils"].items():
        if c is None:
            todo.append(slug)
            continue
        if c.get("verified") is False:
            # Figures came from search snippets, not a document we read: check in a browser, then delete "verified".
            unverified.append(slug)
            continue
        if c.get("basis", "capital value") == "annual value":
            name, av, total = build_annual(slug, c)
            print(f"built {slug}: {name}, average annual value {money(av)} -> {money(total)}/yr")
            continue
        if c.get("basis", "capital value") != "capital value":
            print(f"skipped {slug}: rated on {c['basis']}, needs its own page")
            continue
        name, typical, total = build(slug, c)
        print(f"built {slug}: {name}, typical {money(typical)} -> {money(total)}/yr")
    print(f"needs a browser check ({len(unverified)}): {', '.join(unverified) or 'none'}")
    print(f"still to fill in ({len(todo)}): {', '.join(todo) or 'none'}")


if __name__ == "__main__":
    main()
