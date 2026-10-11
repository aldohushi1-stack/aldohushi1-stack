# blueprintau.com SEO fixes: built, ready to integrate

Built 11 Oct 2026 from the live site. Every changed page was checked in Chromium at
desktop and phone width: no JS errors, no sideways scroll.

**Nothing is live yet.** These are drafts until Aldo checks the copy and deploys.

## What's here

| Path | What it is |
|---|---|
| `public_html/` | Finished pages, same paths as on the server. Upload over the live files. |
| `changes.diff` | Every change as a diff against the live site (15 files). Read this first. |
| `htaccess-add.txt` | One redirect rule to merge into `.htaccess` (`/x/index.html` → `/x/`). |
| `HANDOFF.md` | Paste-in prompt for Claude Code on your PC. |
| `tools/build.py` | Re-applies every edit to a fresh copy of the live HTML (in case the site changed since 11 Oct). |
| `tools/shoot.js` | Screenshots the built pages in Chromium, using live assets. |

## What changed

**Removing what confuses Google**
- `sitemap.xml`: 34 → 26 URLs. Out: `/dating/`, `/aquawell/`, `/rhythm/`, `/brunos/`,
  `/dontsignthat/`, `/projects/adtrade/`, `/glassbox/app/`, `/terms.html`, `/privacy.html`.
  In: `/about/`.
- `<meta name="robots" content="noindex, follow">` added to those 7 side-project pages.
  They still work for anyone with the link.
- Homepage: the "BlueprintAU Dating" card is gone (it used the brand name for a dating site).
  Floor 67 moves to the games folder, and **Roster** takes its featured slot (it wasn't
  linked from the homepage at all). The footer product list is now the business products
  only, plus "All 25 builds".

**Authority: 20 years in software and machinery**
- Homepage schema `founder`: jobTitle "Founder & Software Developer", new description,
  `knowsAbout`, link to `/about/`.
- "Trying to become the best software developer in Adelaide and Australia" is replaced
  in all 5 places (OG, Twitter, FAQ, FAQ schema, footer) with the 20-years line.
- **New `/about/` page**: "Aldo Hushi. Twenty years in software and machinery.", with
  ProfilePage + Person schema, the work, the Adtrade testimonial, and contact details.

**Ranking fixes**
- Homepage H1 now opens with "Custom software for Adelaide trades & small business"
  (styled like the old orange eyebrow line, so the look barely changes).
- Foreman, Takeoff and Ledger: an indexable "About" section under the app, showing the
  FAQ that was only in the page's schema, plus a link to the $2,000 build. Google was
  reading only app buttons and demo data there.
- `/roster/`: canonical added.
- `/glassbox/`: description cut from 480 to 150 characters; SoftwareApplication schema added.

Correction to the 10 Oct report: the two "thin" blog descriptions were a parsing error
on my side (apostrophes). They're fine and weren't touched.

## Before you deploy, check the copy

The `/about/` page says "I've spent twenty years on both sides: the software and the
machinery." Make sure it's accurate, and add specifics if you can: where, what machines,
what software. Specifics are what make Google and buyers believe it.

## After deploying

1. Merge `htaccess-add.txt` into `.htaccess`.
2. Search Console → Sitemaps → resubmit `https://blueprintau.com/sitemap.xml`.
3. Search Console → Removals → temporary removal for `https://blueprintau.com/dating/`.
4. URL Inspection → Request indexing for `/`, `/about/`, `/foreman/`.
5. Put the same title on LinkedIn and your Google Business Profile:
   **Founder & Software Developer — 20 years in software and machinery**.

## Not built (needs input from you)

- **Brass Register page**: no features or prices on record. Send them and I'll build
  `/brass-register/`.
- **Adtrade case study**: needs results (time saved, orders, before and after). It stays
  noindexed until then.
