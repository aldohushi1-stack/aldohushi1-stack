# SEO fixes: ready to upload

From the two SEO check docs (10 Oct 2026). I couldn't reach either site's
source code, so these are files and snippets you upload yourself. Keep a
copy of anything you replace.

## blueprintau.com, in order

1. **`.htaccess`**: paste `blueprintau.com/htaccess-additions.txt` at the top
   of `public_html/.htaccess`. It does three things:
   - noindexes `/dating/`, `/aquawell/`, `/rhythm/`, `/brunos/` and `/projects/adtrade/`
   - 301s `/folder/index.html` to `/folder/`
   - turns on the LiteSpeed page cache
2. **`sitemap.xml`**: replace the live one with `blueprintau.com/sitemap.xml`.
   It has 29 URLs, down from 34; the five noindexed pages are out.
3. **Homepage H1** (`index.html`): keep your line and put the keyword in the H1.
   Before:
   ```html
   <p class="eyebrow">Adelaide · one job · one screen</p>
   <h1>What&#8217;s the one job<br>only you can do?</h1>
   ```
   After:
   ```html
   <h1><span class="eyebrow">Custom software for Adelaide small business</span>
   What&#8217;s the one job<br>only you can do?</h1>
   ```
   If the eyebrow styling looks off as a `span`, add `display:block` to it.
4. **Product H1s**: these match each page's existing title.
   - `foreman/index.html`: `<h1>Foreman</h1>` → `<h1>Foreman: free quoting and invoicing for tradies</h1>`
   - `takeoff/index.html`: `<h1>Takeoff</h1>` → `<h1>Takeoff: free plan takeoff and estimating for tradies</h1>`
   - `ledger/index.html`: `<h1>Ledger</h1>` → `<h1>Ledger: free cash flow, GST and BAS tracker for tradies</h1>`
5. **Missing canonical**: in `roster/index.html` `<head>`, add
   `<link rel="canonical" href="https://blueprintau.com/roster/">`
6. **Glassbox description**: in `glassbox/index.html`, replace the
   480-character `<meta name="description">` with this 144-character one:
   `Glassbox shows what went wrong in a Claude Code or Agent SDK session: timeline, cost and findings from the session .jsonl. Free and open source.`

## aldo.today

1. **`.htaccess`**: paste `aldo.today/htaccess-additions.txt` above the PHP
   front-controller rule. It 301s trailing-slash URLs to the clean URL.
2. **Speed**: there's no `.htaccess` fix. Every page's appraisal form carries a time-stamped
   token, so a page cache could break it. The fix is in the PHP code (see the file's notes).

## Check it worked

```sh
curl -sI https://blueprintau.com/dating/ | grep -i x-robots-tag      # noindex, follow
curl -sI https://blueprintau.com/build/index.html | grep -i location # https://blueprintau.com/build/
curl -sI https://blueprintau.com/ | grep -i x-litespeed-cache        # "hit" on the 2nd request
curl -sI https://aldo.today/adelaide/tennyson/ | grep -i location    # https://aldo.today/adelaide/tennyson
```

If the first line prints nothing, your host ignores `SetEnvIf`. Instead, paste
`<meta name="robots" content="noindex, follow">` into the `<head>` of those five
pages. If the site errors after any paste, put the old `.htaccess` back.

Then resubmit the sitemap in Search Console.
