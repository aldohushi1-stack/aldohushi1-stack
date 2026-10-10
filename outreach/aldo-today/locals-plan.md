# The Locals: one of each kind, per suburb

**Plan for aldo.today.** One café, one pub, one barber, one plumber, and so on, per suburb, each on that suburb's page and **on its miniature, at its own building**.
That turns the site from "Adelaide prices" into "your suburb, and who's in it".

Status: plan only. Nothing here is built, priced or promised to anyone yet. The decisions for Aldo are marked **Decide:**.

---

## 1. The idea in one breath

Every suburb gets **8 spots, one per kind of business**. The kind list is the same in every suburb.
A **place** (café, pub, shop, salon) gets its real building lit up on the 3D miniature, with its name on a little sign.
A **trade** gets a ute parked on the suburb's main road with its name on the door.
Both get a tile on the suburb page, under the miniature. Each spot is exclusive, marked paid, and only for businesses that are actually *from there*.

**What they're buying (the ache):** they don't want an ad. They want to be *the* café the new people find first,
the plumber the street already knows. That's belonging, and the miniature makes it something you can see:
"there's my shop, on my street."

Line options:
1. *One of each. All from here.*
2. *Your shop, on your street, in miniature.*
3. *The locals, by name.*

---

## 2. The 8 kinds

Fixed order and the same everywhere, so a page never gets reshuffled for whoever pays.

| # | Kind | Type | Why it's on a property page | BlueprintAU match |
|---|---|---|---|---|
| 1 | Café | place | First thing a buyer does at an open home is grab a coffee nearby | Brass Register |
| 2 | Pub / bar | place | "What's the local like?" is a buyer question | Brass Register |
| 3 | Food shop (bakery, butcher, grocer, deli) | place | Daily-life test of a suburb | Brass Register / $2k tool |
| 4 | Hair & beauty (barber, salon) | place | The most "local" shop there is | $2k booking tool |
| 5 | Plumber | trade | Every sale and every reno needs one | Foreman, Takeoff / Ledger |
| 6 | Electrician | trade | Same | Foreman, Takeoff / Ledger |
| 7 | Handyman / maintenance | trade | Pre-sale fix-ups and new owners | Foreman |
| 8 | Garden & yard | trade | Pre-sale tidy-ups, and big blocks | Foreman |

These are deliberately **not** on the list, because they already have their own spot: agents (suburb and council spots), brokers, conveyancers, surveyors and builders (council partner spots).
"Handyman" is small jobs; "builder" stays the council partner. Write that line into the terms so the two never overlap.

**Decide:** whether these are the 8. Swap one if a pilot walk shows a kind that's everywhere and keen (dog grooming, physio, bottle-o).

---

## 3. The "truly local" rules

These are what make it different from a directory, and every one of them gets checked before a sign goes up.

1. **Places must be inside the suburb's boundary.** Geocode the shop and run it through the same point-in-polygon test the miniature already uses (`pip` against `D_BND`). Outside the gold line means no sign.
2. **Trades must be based in the suburb or one that borders it.** Check the ABN (ABR lookup) for the business location.
3. **Licensed trades show their licence.** Plumbers and electricians: check the number on the CBS public register and print it on the tile.
4. **The person who signs up works there.** No marketing agency, no head office buying spots for a whole chain. A locally owned franchise counts; a national booking on behalf of its stores doesn't.
5. **Cap per business.** A place holds only its own suburb. A trade holds **up to 3** suburbs, so one plumber can't lock up a whole council.
6. **Never a home address.** Trades are shown as a ute on the main road, never at a house. Nobody's home goes on a map.
7. **Gone means gone.** If a place shuts, the sign comes down within a week. A monthly walk-by or call covers this.

## 4. What money still can't buy (same rules as the agent spots)

- Not the numbers, not the order, not a star rating. There are **no reviews and no ratings at all**.
- **Never in the Letters, the daily or the news.** The Letters are written *in the voice of a long-time local*.
  A paid business turning up there would read as a neighbour's recommendation when it's an ad. That would mislead people (Australian Consumer Law) and burn the site's trust, so the rule goes in `daily_draft.py`'s guard, the same way "can be subdivided" did.
- Every tile says **"Paid placement"**, its link is `rel="sponsored"`, and every sign on the model has a small "paid" tag in its tap card.
- Empty spots show **"Open: the <suburb> café spot"** linking to `/advertise`. They never show an unpaid business as if it were endorsed.
- The ledger on `/how-this-site-works` adds a line: **local spots taken: 0 of 3,504** (438 suburbs × 8).

---

## 5. Price

**Decide:** the price. My recommendation: **$25 a month per suburb**, held for 12 months, monthly, with one month's notice to leave.

- It's half the agent's $49, because a café's whole-suburb reach is smaller and its margins are thinner.
- It's under the "just say yes at the counter" line for a small owner.
- It sits on the same line as the A$29 block report, which keeps the price list simple.

Size of it, as an illustration and not a forecast: 3,504 spots × $25 = $87,600/month if every spot filled.
At 5% filled (175 spots) it's about **$4,400/month**. The pilot below tells you the real fill rate. Don't quote any of this to a customer.

---

## 6. How it looks

### On the miniature (`/adelaide/<suburb>/miniature`)

- **Places:** paint the shop's real building footprint (Overture) in one accent colour, with a small hanging sign above it carrying the name. Tap it for a card: name, one line, phone, link, "Paid placement".
- **Trades:** a little ute on the suburb's main road (the longest road segment near the centre), name on the door. Tap it for the same card plus the licence number.
- **The agent's board stays the only billboard.** Signs stay small, so the agent's spot doesn't lose value.
- A new **"The locals"** button next to "Fly over / Explore / The board" flies the camera along each lit-up spot in kind order.
- The poster images (`/mini/<suburb>.jpg`, `-card.png`) get rebuilt with the signs on them, so every share of the suburb carries them.

### On the suburb page

A **"The locals"** strip goes right under the miniature, above the agent card: 8 tiles in fixed order.
A filled tile shows the kind, name, one line (≤ 80 characters), phone and link, plus "Paid placement".
An open tile shows "Open: <suburb> café" and links to `/advertise#locals`.

### On `/advertise`

Add a "Locals" section with the 8 kinds, the price, the rules above, and a per-suburb table showing which kinds are still open.

---

## 7. Build steps (for the code)

1. **Data:** `locals/<suburb>.json`, written on the desk and read-only on the server, like the agent data:
   ```json
   {"kind": "cafe", "type": "place", "name": "", "line": "", "phone": "", "url": "",
    "lat": 0, "lng": 0, "building_id": "", "licence": "", "abn": "",
    "since": "2026-11-01", "paid_until": "2026-12-01"}
   ```
2. **Validate at build** (fail the build, don't warn): place inside `D_BND`; trade suburb in its own or a bordering suburb; at most 3 suburbs per trade ABN; `paid_until` in the past drops the spot automatically.
3. **Miniature (bait build):** convert lat/lng to x/z with `D_ORIGIN`, find the containing footprint, tint it and add the sign sprite. Place the utes on the main road. Add `"locals": [...]` to the page's inline config next to `"agent"`.
4. **Preview mode for walk-ins:** like the existing "Put your name on the board", a desk-only `?preview=<kind>:<name>` that lights the shop up **on Aldo's phone only, without publishing**. This is the closing move at the counter (see §9).
5. **Suburb template:** the locals strip and its tiles.
6. **Advertise page, ledger line, `rel="sponsored"`, "Paid placement".**
7. **Letters/daily guard:** refuse any name that's in `locals/*.json`.
8. **Count what's out there:** add amenity/shop/craft counts per suburb to the OSM extract step. That gives a real "how many cafés does Henley Beach have" number for picking pilot suburbs. (The OSM Overpass query service wasn't reachable from this session, so these counts still need to be run.)

---

## 8. Pilot: the coast, 4 weeks

**Suburbs:** Henley Beach, Grange, Tennyson, West Beach, Seaton, Fulham Gardens (City of Charles Sturt). That's home turf, and these suburbs have shopping strips (Henley Square / Seaview Rd, Grange Rd / the jetty) you can walk.
6 suburbs × 8 kinds = **48 spots**.

| Week | Do |
|---|---|
| 1 | Build steps 1–5 for these 6 suburbs only. Run the OSM counts. List every place on the strips in `pipeline.csv` (type = local). |
| 2 | Walk-ins: 15 a day, places first. Phone in hand, preview mode ready. |
| 3 | Trades: walk-ins to anyone with a shopfront or yard, then emails to licensed trades whose ABN shows they're based there. Follow-ups for places. |
| 4 | Count it. Fix whatever people kept asking about. |

**Goal:** 10 paid spots across the 6 suburbs.
**Rethink if** fewer than 5 sign up after about 60 real conversations: the price, the kinds, or the format is wrong, and that's worth knowing before rolling out to 438 suburbs.
**Roll out** council by council after that, following the order of the Letters calendar.

---

## 9. The walk-in (places)

Do it in quiet hours (cafés after 2pm, pubs before 4pm, salons mid-morning). Openers, pick one:

1. "G'day, I'm Aldo from Tennyson. Can I show you something on my phone? It's your shop."
2. "I've built a little model of Henley Beach, every street. Your place is in it."
3. "Quick one. When people look up what Grange houses go for, I want them to find you next."

Then:

> *(open the miniature, find their building, preview their name on it)*
>
> That's Henley Beach, every house, built from the map. People open it when they look up what the suburb's worth: buyers, sellers, people who've just moved in.
> There's one café spot in the whole suburb. Your shop lights up, your name goes on it, and you're on the suburb's page with your number.
> It's $25 a month, it's only for people who are actually here, and nobody can pay to be rated above you, because there are no ratings.
>
> Want me to put it up?

If they're unsure: "No stress. I'll leave it unlit, and if someone else on the strip wants the spot I'll come back to you first." Only say that if you're going to do it.

Trades version: swap the building for the ute. "Every sale in Seaton needs a plumber. This one's parked on Tapleys Hill Rd with your name on the door." Check the road actually runs through the suburb before saying it.

**Then the BlueprintAU step (month 2, not day 1):** café or pub, mention Brass Register; tradie, give them Foreman free; anyone with one annoying problem, the $2,000 tool.
And ask every local who's selling in their street. Café owners hear it first, and that's how you warm up the agent spots.
