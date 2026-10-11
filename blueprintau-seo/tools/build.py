"""Apply the blueprintau.com SEO fixes to a copy of the live HTML.

usage: python3 -I build.py LIVE_DIR OUT_DIR
"""
import html, json, os, re, shutil, sys

LIVE, OUT = sys.argv[1], sys.argv[2]
done = []


def rd(p):
    return open(os.path.join(LIVE, p), encoding="utf-8").read()


def wr(p, s):
    f = os.path.join(OUT, p)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    open(f, "w", encoding="utf-8").write(s)


def sub1(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"[{label}] expected 1 match, found {n}: {old[:80]!r}")
    done.append(label)
    return s.replace(old, new)


AUTHORITY = "Twenty years in software and machinery. Twenty-five builds for Adelaide businesses."

# ---------------------------------------------------------------- homepage
s = rd("index.html")
old_og = "I'm trying to become the best software developer in Adelaide and Australia. Tell me the one job only you can do and I'll build the tool for it. From $2,000."
new_og = "Twenty years in software and machinery. Tell me the one job only you can do and I'll build the tool for it. From $2,000."
for tag in ("og:description", "twitter:description"):
    s = sub1(s, f'"{tag}" content="{old_og}"', f'"{tag}" content="{new_og}"', f"home {tag}")

s = sub1(
    s,
    '"jobTitle": "Founder and software developer", "description": "Adelaide software developer and founder of BlueprintAU. Aldo Hushi is trying to become the best software developer in Adelaide and Australia.",',
    '"jobTitle": "Founder & Software Developer", "description": "Adelaide software developer with 20 years in software and machinery. Founder of BlueprintAU: 25 custom tools built for trades and small business.", "url": "https://blueprintau.com/about/", "knowsAbout": ["Custom software development", "Machinery", "Software for trade businesses", "Quoting and invoicing systems"],',
    "home schema founder",
)

s = sub1(
    s,
    '<p class="eyebrow">Adelaide · one job · one screen</p>\n<h1>What&#8217;s the one job<br>only you can do?</h1>',
    '<h1><span class="eyebrow h1-kicker">Custom software for Adelaide trades &amp; small business</span>What&#8217;s the one job<br>only you can do?</h1>',
    "home H1 keyword",
)
s = sub1(s, "\n.eyebrow{", "\n.h1-kicker{display:block;margin-bottom:18px;line-height:1.5;}\n.eyebrow{", "home kicker css")

# FAQ schema copy of the same answer (plain text, no link)
s = sub1(
    s,
    "Aldo Hushi — one founder in Adelaide. I answer the phone and I ship the tool. Twenty-five builds so far, and I'm trying to become the best software developer in Adelaide and Australia.\"",
    "Aldo Hushi — one founder in Adelaide, with twenty years in software and machinery. I answer the phone and I ship the tool. Twenty-five builds so far.\"",
    "home FAQ schema founder",
)
s = sub1(
    s,
    "Aldo Hushi — one founder in Adelaide. I answer the phone and I ship the tool. Twenty-five builds so far, and I'm trying to become the best software developer in Adelaide and Australia.</p>",
    'Aldo Hushi — one founder in Adelaide, with twenty years in software and machinery. I answer the phone and I ship the tool. Twenty-five builds so far. <a href="about/">More about Aldo</a>.</p>',
    "home FAQ founder",
)
s = sub1(
    s,
    "Aldo Hushi: Adelaide software developer, trying to become the best one in Adelaide and Australia. <a",
    'Aldo Hushi: Founder &amp; Software Developer, twenty years in software and machinery. <a href="about/">About</a> · <a',
    "home footer founder",
)

# Portfolio: Roster (a real product, not linked anywhere on the homepage) takes Floor 67's
# featured slot; Floor 67 joins the games folder; the dating concept leaves the site's front door.
floor67 = re.search(r'<a class="fitem" href="projects/floor67/".*?</a>\n', s).group(0)
roster = ('<a class="fitem" href="roster/" data-name="Roster"><div class="th"><img src="shots/roster.jpg" '
          'alt="Roster — the canteen roster that fills itself" loading="lazy"></div><div class="tx">'
          '<span class="kk">Live product · clubs</span><h4>Roster</h4><p>The canteen and volunteer roster that '
          'fills itself. Members claim shifts from one link. Free for clubs.</p></div></a>\n')
s = sub1(s, floor67, roster, "home featured: roster in")
floor67_small = ('<a class="fitem" href="projects/floor67/" data-name="Floor 67"><div class="th letter">F</div>'
                 '<div class="tx"><span class="kk">Office sim</span><h4>Floor 67</h4></div></a>\n')
s = sub1(
    s,
    '<a class="fitem" href="dating/" data-name="BlueprintAU Dating"><div class="th letter">B</div><div class="tx"><span class="kk">Concept</span><h4>BlueprintAU Dating</h4></div></a>\n',
    floor67_small,
    "home more: dating out, floor67 in",
)

old_foot = re.search(r'<span class="k">Products</span>\n<ul class="foot-cols-2">\n(.*?)</ul>', s, re.S).group(1)
new_foot = """<li><a href="takeoff/">Takeoff</a></li>
<li><a href="foreman/">Foreman</a></li>
<li><a href="ledger/">Ledger</a></li>
<li><a href="catalogue/">Trade Catalogues</a></li>
<li><a href="roster/">Roster</a></li>
<li><a href="glassbox/">Glassbox</a></li>
<li><a href="https://aldo.today/">Adelaide house prices by suburb</a></li>
<li><a href="counter/">Photograph the Sale</a></li>
<li><a href="aquawell/">AquaWell</a></li>
<li><a href="projects/adtrade/">Adtrade ordering tool</a></li>
<li><a href="#desktop">All 25 builds</a></li>
"""
s = sub1(s, old_foot, new_foot, "home footer products")
s = sub1(s, '<li><a href="build/">Custom software builds</a></li>\n',
         '<li><a href="build/">Custom software builds</a></li>\n<li><a href="about/">About Aldo</a></li>\n',
         "home footer about link")
wr("index.html", s)

# --------------------------------------------- side projects: noindex in the page itself
NOINDEX = ["dating", "aquawell", "rhythm", "brunos", "dontsignthat", "projects/adtrade", "glassbox/app"]
for p in NOINDEX:
    s = rd(f"{p}/index.html")
    if re.search(r'<meta[^>]+name=["\']robots', s, re.I):
        raise SystemExit(f"{p} already has a robots meta")
    s = re.sub(r"(<meta charset=[^>]*>)", r'\1\n<meta name="robots" content="noindex, follow">', s, count=1, flags=re.I)
    if 'name="robots"' not in s:
        raise SystemExit(f"{p}: no <meta charset> to anchor on")
    done.append(f"noindex {p}")
    wr(f"{p}/index.html", s)

# ---------------------------------------------------------------- roster canonical
s = rd("roster/index.html")
s = sub1(s, "<title>", '<link rel="canonical" href="https://blueprintau.com/roster/">\n<title>', "roster canonical")
wr("roster/index.html", s)

# ---------------------------------------------------------------- glassbox
s = rd("glassbox/index.html")
old = re.search(r'<meta name="description" content="[^"]*">', s).group(0)
s = sub1(s, old, '<meta name="description" content="Glassbox shows what went wrong in a Claude Code session: timeline, cost and findings with evidence. Free, open source, runs locally.">', "glassbox description")
app = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Glassbox",
    "applicationCategory": "DeveloperApplication", "operatingSystem": "Web, Node.js",
    "url": "https://blueprintau.com/glassbox/",
    "description": "Flight-recorder viewer for Claude Code and Agent SDK sessions: timeline, cost and findings with evidence. Free and open source.",
    "offers": {"@type": "Offer", "price": "0", "priceCurrency": "AUD"},
    "sameAs": ["https://github.com/aldohushi1-stack/glassbox", "https://www.npmjs.com/package/glassbox-trace"],
    "publisher": {"@type": "Organization", "@id": "https://blueprintau.com/#org", "name": "BlueprintAU", "url": "https://blueprintau.com/"},
}
s = sub1(s, '<link rel="canonical"', '<script type="application/ld+json">' + json.dumps(app) + '</script>\n<link rel="canonical"', "glassbox schema")
wr("glassbox/index.html", s)

# ------------------------------- product pages: show the FAQ Google already has, as page text
INTRO_CSS = """<style>
.seo-about{box-sizing:border-box;width:calc(100% - 32px);max-width:760px;margin:40px auto 24px;padding:28px 26px;background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-radius:14px;font:15px/1.65 Inter,system-ui,sans-serif;}
.seo-about h2{font-size:22px;line-height:1.3;margin:0 0 10px;color:#0f172a;}
.seo-about h3{font-size:16px;margin:20px 0 4px;color:#0f172a;}
.seo-about p{margin:0 0 8px;}
.seo-about a{color:#c2410c;font-weight:600;}
</style>"""
TAG = {
    "foreman": "Foreman — free quoting, jobs and invoicing for tradies",
    "takeoff": "Takeoff — free plan takeoff and estimating for tradies",
    "ledger": "Ledger — free cash flow, GST and BAS tracker for tradies",
}
for p, h2 in TAG.items():
    s = rd(f"{p}/index.html")
    desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', s).group(1))
    faq = None
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        d = json.loads(block)
        if d.get("@type") == "FAQPage":
            faq = d["mainEntity"]
    if not faq:
        raise SystemExit(f"{p}: no FAQPage")
    qa = "".join(
        f"<h3>{html.escape(q['name'])}</h3><p>{html.escape(q['acceptedAnswer']['text'])}</p>" for q in faq
    )
    section = (
        f'{INTRO_CSS}\n<section class="seo-about" aria-labelledby="seo-about-h">'
        f'<h2 id="seo-about-h">{html.escape(h2)}</h2><p>{html.escape(desc)}</p>{qa}'
        f'<p style="margin-top:18px;">Need a tool built around how your business works? '
        f'<a href="../build/">Custom software, one tool, $2,000 fixed →</a></p></section>\n'
    )
    idx = s.rfind("</body>")
    s = s[:idx] + section + s[idx:]
    done.append(f"{p} about section ({len(faq)} Q&As)")
    wr(f"{p}/index.html", s)

# ---------------------------------------------------------------- /about/ (new)
b = rd("build/index.html")
head_end = b.index("<header")
head = b[:head_end]
footer = b[b.index("<footer>"): b.index("</footer>") + len("</footer>")]
tail_script = b[b.index("</footer>") + len("</footer>"): b.rindex("</body>")]
proof = re.search(r'<section id="proof".*?</section>', b, re.S).group(0)

title = "Aldo Hushi — Adelaide Software Developer, 20 Years in Software &amp; Machinery"
desc = "Aldo Hushi, founder of BlueprintAU: twenty years in software and machinery, 25 builds for Adelaide trades and small business. One tool, one problem, $2,000."
head = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", head, flags=re.S)
head = re.sub(r'(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*', lambda m: m.group(1) + desc, head)
head = re.sub(r'(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*', lambda m: m.group(1) + title + " | BlueprintAU", head)
head = head.replace("https://blueprintau.com/build/", "https://blueprintau.com/about/")
head = re.sub(r'<script type="application/ld\+json">.*?</script>\n', "", head, flags=re.S)
person = {
    "@context": "https://schema.org", "@type": "ProfilePage", "@id": "https://blueprintau.com/about/#page",
    "url": "https://blueprintau.com/about/", "name": "About Aldo Hushi",
    "mainEntity": {
        "@type": "Person", "@id": "https://blueprintau.com/#aldo", "name": "Aldo Hushi",
        "jobTitle": "Founder & Software Developer",
        "description": "Adelaide software developer with 20 years in software and machinery. Founder of BlueprintAU.",
        "worksFor": {"@id": "https://blueprintau.com/#org"},
        "homeLocation": {"@type": "City", "name": "Adelaide"},
        "knowsAbout": ["Custom software development", "Machinery", "Software for trade businesses", "Quoting and invoicing systems"],
        "sameAs": ["https://www.linkedin.com/in/aldohushi", "https://github.com/aldohushi1-stack",
                   "https://x.com/aldo_hushi", "https://www.facebook.com/profile.php?id=61593482654519"],
    },
}
crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "BlueprintAU", "item": "https://blueprintau.com/"},
    {"@type": "ListItem", "position": 2, "name": "About", "item": "https://blueprintau.com/about/"}]}
ld = "".join(f'<script type="application/ld+json">{json.dumps(x)}</script>\n' for x in (person, crumbs))
head = head.replace("<link rel=\"preconnect\"", ld + "<link rel=\"preconnect\"", 1)
head = head.replace(' aria-current="page"', "")
A = 'style="color:var(--accent);font-weight:600;text-decoration:none;"'
body = f"""<header class="hero" id="top">
<div class="wrap">
<p class="crumbs"><a href="../">BlueprintAU</a> / About</p>
<p class="eyebrow" style="margin-top:18px;">Founder &amp; Software Developer · Adelaide</p>
<h1>Aldo Hushi.<br><span class="hi">Twenty years in software and machinery.</span></h1>
<p class="lede">I run BlueprintAU from Adelaide. Twenty-five builds for Adelaide businesses so far. I answer the phone, I scope the job with you, and I ship the tool.</p>
<div class="hero-ctas">
<a class="btn orange" href="../#booking">Book the free hour</a>
<a class="btn outline" href="../build/">See the $2,000 build</a>
</div>
<div class="terms">
<div class="term"><b>20 years</b><span>in software and machinery</span></div>
<div class="term"><b>25 builds</b><span>shipped from the lab, live or as working demos</span></div>
<div class="term"><b>3 free tools</b><span>for tradies: Foreman, Takeoff and Ledger</span></div>
<div class="term"><b>1 founder</b><span>the person you call is the person who builds it</span></div>
</div>
</div>
</header>

<section id="story" aria-labelledby="story-h">
<div class="wrap">
<div class="sec-head"><div>
<p class="eyebrow">Why it matters</p>
<h2 id="story-h">Software built by someone who knows the gear</h2>
</div></div>
<div style="max-width:720px;font-size:16px;line-height:1.7;">
<p>Most software for the trades is written by people who have never stood next to the machine it's meant to run around. I've spent twenty years on both sides: the software and the machinery. So when you tell me how a job really moves through your business, I don't need a translator.</p>
<p style="margin-top:14px;">That's why BlueprintAU builds one tool for one problem, for a fixed $2,000. Quotes that live in the ute, a roster run from a group chat, a catalogue that's last year's PDF. We name the job in an hour and it's live on your name in five working days.</p>
</div>
</div>
</section>

<section id="work" aria-labelledby="work-h">
<div class="wrap">
<div class="sec-head"><div>
<p class="eyebrow">The work</p>
<h2 id="work-h">What I've built</h2>
</div></div>
<ul style="max-width:720px;font-size:16px;line-height:1.8;padding-left:20px;">
<li><a href="../foreman/" {A}>Foreman</a> — free quoting, jobs and invoicing for tradies.</li>
<li><a href="../takeoff/" {A}>Takeoff</a> — measure off a plan and turn it into a priced quote.</li>
<li><a href="../ledger/" {A}>Ledger</a> — cash flow, GST and BAS for sole-trader tradies.</li>
<li><a href="../catalogue/" {A}>Trade Catalogues</a> and <a href="../roster/" {A}>Roster</a> — for suppliers and clubs.</li>
<li><a href="../glassbox/" {A}>Glassbox</a> — open source, on npm as <code>glassbox-trace</code>. Also <code>get-bearings</code>. Both on <a href="https://github.com/aldohushi1-stack" {A} rel="me noopener">GitHub</a>.</li>
<li>Custom builds for Adelaide businesses, including the <a href="../projects/adtrade/" {A}>Adtrade ordering tool</a>.</li>
</ul>
</div>
</section>

{proof}

<section id="contact" aria-labelledby="contact-h">
<div class="wrap">
<div class="sec-head"><div>
<p class="eyebrow">Talk to me</p>
<h2 id="contact-h">Tell me the job that won't leave you alone.</h2>
</div></div>
<p style="font-size:16px;">Call <a href="tel:+61423003680" {A}>0423 003 680</a>, write <a href="mailto:hi@aldo.ltd" {A}>hi@aldo.ltd</a>, or <a href="../#booking" {A}>book the free hour</a>. Adelaide CBD, or a video call if you're on a job.</p>
</div>
</section>

"""
footer = footer.replace('<li><a href="../build/">Custom software builds</a></li>',
                        '<li><a href="../build/">Custom software builds</a></li>\n<li><a href="../about/">About Aldo</a></li>')
wr("about/index.html", head + body + footer + tail_script + "</body>\n</html>\n")
done.append("about page")

print("\n".join(done))
