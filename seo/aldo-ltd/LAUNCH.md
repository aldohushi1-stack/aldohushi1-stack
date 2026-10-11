# aldo.ltd — round 2: upload, index, launch

Everything in `upload/` mirrors the web root. Upload each file to the same path on aldo.ltd, overwriting what's there.
Every file was built from the live page as it stood on 11 Oct 2026 (Last-Modified 10:41 UTC). If you edit any of these pages on the server first, tell me and I'll rebuild the patch.

## 1. Upload (10 minutes)

| File | What changed |
|---|---|
| `index.html` | "Glassbox for Claude Code" in the H2 and schema (+ `alternateName: glassbox-trace`); blog section now links the new post and the six-rungs pillar |
| `blog/claude-code-subagent-cost/index.html` | **New post** — "Claude Code subagents: why a $21.83 session cost $322.36" |
| `media/og-blog-claude-code-subagent-cost.png` | Its share image, same style as the cost-patterns one |
| `blog/index.html` | New post card on top + in the Blog schema |
| `blog/feed.xml` | New post as the first item |
| `blog/2026-09-22/index.html`, `blog/2026-09-20/index.html` | Shared Person + Breadcrumb schema (nothing visible changes) |
| `sitemap.xml` | New post added; changed pages dated 2026-10-11 |
| `llms.txt` | New post listed; Glassbox named with its qualifier |

Then check: https://aldo.ltd/blog/claude-code-subagent-cost/ loads, and paste it into https://search.google.com/test/rich-results — expect BlogPosting + Breadcrumb, no errors.

## 2. Make Google and Bing index it (15 minutes, then wait)

1. **Google Search Console** → https://search.google.com/search-console → Add property → *Domain* → `aldo.ltd` → add the TXT record it gives you at your DNS host → Verify.
2. Sitemaps → submit `https://aldo.ltd/sitemap.xml`.
3. URL Inspection → paste each URL below → **Request indexing** (there's a daily limit of roughly 10, so do these first):
   1. `https://aldo.ltd/`
   2. `https://aldo.ltd/audit/`
   3. `https://aldo.ltd/blog/claude-code-subagent-cost/`
   4. `https://aldo.ltd/claude-code-cost-patterns/`
   5. `https://aldo.ltd/sample-agent-cost-audit/`
   6. `https://aldo.ltd/redact-claude-code-session/`
   7. `https://aldo.ltd/blog/six-rungs-seo-smo-aeo-geo-deo-sxo/`
4. **Bing Webmaster Tools** → https://www.bing.com/webmasters → *Import from Google Search Console* (one click once step 1 is done). This is the index ChatGPT search and Copilot draw on.
5. In Bing Webmaster → IndexNow → turn it on, and submit the same 7 URLs.

Do the same for **blueprintau.com** while you're there: it's the site that sells the $2,000 builds.

What to expect: impressions in Search Console within 1–2 weeks. Clicks follow impressions; come back to me with the Performance report after 14 days and I'll rewrite titles for the queries sitting at positions 8–20.

## 3. Unblock ClaudeBot and Meta's crawler

The server returns HTTP 418 to `ClaudeBot` and `meta-externalagent` on aldo.ltd **and** blueprintau.com. The response carries your own security headers, so it's coming from a rule on your hosting account, not from a CDN.

1. Search your `.htaccess` files for `418`, `ClaudeBot`, `meta-externalagent` or a `BrowserMatch`/`SetEnvIf` bot list. Delete those lines.
2. Nothing there? Check the hosting panel for a "block AI bots" / bot protection toggle, or ask the host's support to remove the block for both domains.
3. Test: `curl -A "ClaudeBot/1.0" -o /dev/null -w "%{http_code}" https://aldo.ltd/` should print `200`.

robots.txt needs no change: it already allows everyone.

## 4. Glassbox README

Pushed to branch `readme-audit-link` in the glassbox repo: one paragraph under the intro linking the audit and the new post.
**Merge it after step 1**, so the post link isn't dead: https://github.com/aldohushi1-stack/glassbox/compare/main...readme-audit-link

## 5. Launch posts — drafts, you post them

Post in this order, a day apart, after the page is indexed or at least live. Reply to every comment in the first two hours.

### Hacker News (Show HN)

Title (pick one):
- `Show HN: Glassbox – my Claude Code session said $21.83, it cost $322.36`
- `Show HN: Glassbox – open-source flight recorder for Claude Code sessions`

URL: `https://github.com/aldohushi1-stack/glassbox`

First comment:

> One night in September I left Claude Code building for eight hours. The session report said $21.83. The real number was $322.36.
>
> The difference was 36 subagents. Claude Code writes each one to its own transcript file in `<session-id>/subagents/`, and the tool I was using only read the main one. Usage was miscounted too: one streamed response is written as several records, each with a running `output_tokens` count, so summing them double-counts and taking the first undercounts.
>
> Glassbox reads all of it. `npx glassbox-trace` opens your newest session as a timeline: every model call, tool call and subagent, where the tokens went, and findings with evidence (context past 120k, retry loops, a file 22 agents each re-read). Runs locally, MIT, no tokens spent, nothing leaves the machine.
>
> Write-up of that night: https://aldo.ltd/blog/claude-code-subagent-cost/
>
> Happy to answer anything about the transcript format. I'm the only maintainer, and looking for a second.

### r/ClaudeAI

Title: `PSA: if your Claude Code cost tool only reads the main .jsonl, it's missing your subagents`

> My eight-hour session reported $21.83. With its 36 subagent transcripts counted it was $322.36.
>
> Subagents live in `~/.claude/projects/<project>/<session-id>/subagents/agent-*.jsonl`, not in the main file. Quick check on your own session:
>
> `ls ~/.claude/projects/*/<session-id>/subagents/agent-*.jsonl | wc -l`
>
> If that's more than zero and your tool shows one number per session, compare it with the bill.
>
> I wrote up the whole thing, including the streamed-usage trap, here: https://aldo.ltd/blog/claude-code-subagent-cost/ — the tool I built after (Glassbox, free, MIT, runs locally) is `npx glassbox-trace`.

### LinkedIn (aimed at the engineering lead who gets the bill)

Openers to pick from:
1. `Claude Code costs: my eight-hour session said $21.83. It cost $322.36.`
2. `Claude Code subagents don't show up where you'd look.`
3. `$21.83 on the report. $322.36 on the bill. Same session.`

Full draft under #1:

> Claude Code costs: my eight-hour session said $21.83. It cost $322.36.
>
> I'd left it building through the night. Six messages from me in eight hours.
>
> In that time it spun up 36 subagents. Each one writes its own transcript, in its own folder. The report I trusted only opened the main one.
>
> Most of the money was spent while nobody was watching.
>
> If your team runs Claude Code, the same thing is probably on your bill. I wrote up where the files live and how to count them properly: aldo.ltd/blog/claude-code-subagent-cost
>
> And if you'd rather a person read it for you, I do that too. Coffee's on me in Adelaide.

Aimed at: safety, the fear of money going out while no one is looking.
