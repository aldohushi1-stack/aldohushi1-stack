# blueprintau.com — fix pack (re-checked 11 Oct 2026)

All 34 sitemap URLs fetched live. The site source isn't on GitHub, so these are
files to upload through cPanel / File Manager. Nothing here has been applied yet.

## The pattern

Google decides what a site is from three things: what's in the sitemap, what the
homepage links to, and what the pages say about themselves. Right now all three
point in different directions:

| Signal | What Google sees today |
|---|---|
| Sitemap | 34 URLs — 9 of them aren't the business (dating, water filters, a winery, a prototype, a client's shop) |
| Homepage links | The products are linked well, but the homepage also links 13 side projects: `/aquawell/`, `/rhythm/`, `/brunos/`, `/dontsignthat/`, `/projects/adtrade/` (indexable) plus games and demos (`/arcade/`, `/whale/`, `/counter/`, `/projects/gearworks/`, `floor67`, `pufferline`, `overdrive`, `dreamcity` — already noindex) |
| Page self-description | `/dating/` titles itself "BlueprintAU — Draft the terms before the first date" |
| Product pages | `/foreman/`, `/takeoff/`, `/ledger/` *are the app*: Google reads a dashboard full of demo data ("Kestrel Electrical Pty Ltd, Adelaide") and ~750 words of button labels, not a page explaining the product |
| Founder | No About page (`/about/` is 404). Schema says "trying to become the best software developer" — an ambition, not a credential |

Fix: one site = one story. Custom software for Adelaide trades and small business,
proven by 20 years of experience and 25 builds.

## 1. Remove what confuses Google (do today)

1. **Replace `sitemap.xml`** with the one in this folder — 25 URLs, all business.
   Removed: `/dating/`, `/aquawell/`, `/rhythm/`, `/brunos/`, `/dontsignthat/`,
   `/projects/adtrade/`, `/glassbox/app/`, `/terms.html`, `/privacy.html`
   (terms/privacy stay live and indexable, they just don't need to be listed).
2. **Paste `htaccess-snippet.txt`** at the top of `.htaccess`. It adds a
   `noindex` header to the side projects (they keep working for people with the
   link) and 301s `/x/index.html` to `/x/`.
3. **Homepage: move the side-project links off the homepage** — `aquawell/`, `rhythm/`,
   `brunos/`, `dontsignthat/`, `arcade/`, `whale/`, `counter/` and the `projects/` games.
   Put them on one `/lab/` page (noindex) and link that once from the footer. Keep
   `projects/adtrade/` only once it's a real case study. Add a link to `/roster/`,
   which isn't linked from the homepage at all.
4. **Search Console** → Sitemaps → resubmit `https://blueprintau.com/sitemap.xml`.
   Then Removals → "Temporary removal" for `https://blueprintau.com/dating/` so it
   drops out fast instead of waiting for a recrawl.

## 2. Authority — 20 years in software and machinery

Use it everywhere Google and buyers look, worded the same way each time.

**Title (pick one, use it on the site, LinkedIn and Google Business Profile):**

- **Founder & Software Developer — 20 years in software and machinery** ← recommended
- Software & Machinery Specialist, 20 years
- Software Developer for the Trades — 20 years on the tools and the code

Avoid "Engineer" unless you hold the qualification. In some states (QLD, VIC, NSW)
"professional engineer" is a registered title, and Google trusts claims it can match
against LinkedIn.

**Homepage line — replace** "Twenty-five builds so far, and I'm trying to become the
best software developer in Adelaide and Australia." **with:**

> Twenty years in software and machinery. Twenty-five builds for Adelaide businesses.
> I answer the phone and I ship the tool.

**Schema — in the homepage JSON-LD `founder` block, replace `jobTitle` and `description`:**

```json
"jobTitle": "Founder & Software Developer",
"description": "Adelaide software developer with 20 years in software and machinery. Founder of BlueprintAU: 25+ custom tools built for trades and small business.",
"knowsAbout": ["Custom software development", "Industrial machinery", "Trade business software", "Quoting and invoicing systems"],
```

**About page** — add `/about/` (title: "Aldo Hushi — Adelaide Software Developer,
20 Years in Software & Machinery"). Cover: the 20 years (where, what machines, what
software), the 25 builds with named clients, the npm packages `glassbox-trace` and
`get-bearings`, a photo, and the phone number. Link it from the homepage and footer.
Machinery + software is your edge: almost no Adelaide software shop can say they've
run the gear their tradie clients use.

## 3. Still open from the 10 Oct check

- **Homepage H1** still has no keyword ("What's the one job only you can do?").
  Put "Custom software for Adelaide trades and small business" above it.
  (`/build/` is already fixed.)
- **Product pages are the app.** Add a short indexable intro above each app (H1 like
  "Foreman — free quoting and invoicing for tradies", 150–300 words, a screenshot,
  "Need it custom? $2,000 →" link to `/build/`), or move the app to `/foreman/app/`.
- **`/roster/`**: no canonical, 15-character description.
- **`/glassbox/`**: 480-character description, no structured data.
- **Two thin blog descriptions**: `custom-job-management-software-tradies` (38 chars),
  `stretch-your-stack-before-you-build` (87 chars).
- **Brass Register** still has no page (`/brass-register/` 404).
- **Adtrade**: rewrite as a case study linking to adtrade.com.au, then remove it
  from the noindex list.
- **Speed**: first byte measured at 0.7–1.0 s, but from an overseas server. Check with
  PageSpeed Insights before changing anything.
