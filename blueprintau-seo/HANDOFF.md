# Handoff: integrate on your PC

Pull the branch first:

```
git fetch origin ccr-9a3d12ad-bmwh15
git checkout ccr-9a3d12ad-bmwh15
```

Then open Claude Code in your **blueprintau.com site folder** and paste this:

---

> Integrate the SEO fixes from the `aldohushi1-stack` repo, branch `ccr-9a3d12ad-bmwh15`,
> folder `blueprintau-seo/`. Read `README.md` and `changes.diff` there first.
>
> 1. Compare each file in `blueprintau-seo/public_html/` with the same path in this site.
>    If my local file matches the "live/" side of `changes.diff`, copy the new file over.
>    If my local file has changed since then, apply only the hunks from `changes.diff`,
>    or re-run `python3 tools/build.py <my site folder> <out folder>` and use its output.
>    Stop and tell me if an edit doesn't apply.
> 2. Add the new `about/index.html` and replace `sitemap.xml`.
> 3. Merge the rule in `htaccess-add.txt` into `.htaccess`, keeping what's already there.
> 4. Show me the full diff and wait for me to say go. Then commit, push and deploy the
>    usual way.
> 5. After the deploy, check: `/about/` returns 200; `/dating/` has
>    `<meta name="robots" content="noindex, follow">`; `/build/index.html` 301s to `/build/`;
>    `/sitemap.xml` lists 26 URLs.

---

If the site has no local folder (edited straight in cPanel): upload everything in
`public_html/` to the same paths in File Manager, then do step 3 by hand.
