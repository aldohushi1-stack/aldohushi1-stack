# Scripts: aldo.today spots

Drafts. Swap the `<brackets>`, check the suburb's numbers on its page before you quote them, and check `/advertise` to confirm the spot's still open.
Every one aims at the same thing: **a coffee, or a yes to one suburb.**

---

## 1. Walk-in (front desk or agent at their desk, about 45 seconds)

Aimed at: status. "Your name, on your suburb."

> G'day, I'm Aldo, I live in Tennyson. I run aldo.today, the site with every Adelaide suburb's house price on one map, straight from the Valuer-General.
>
> When someone in <suburb> wants to know what their place might be worth, they look it up, and they land on a page with the number, then one agent's name underneath.
> Right now that name is mine, because nobody's taken it.
>
> I'd rather it was someone who actually sells there. It's $49 a month, it's yours alone, and I can't change the numbers for you or anyone else. That's the point of it.
>
> Can I leave you this and grab ten minutes over a coffee this week?

Leave behind: a printed copy of their suburb's page, with your number on it.
If they're busy: "No stress. What's the best email for the person who'd decide this?"

---

## 2. Phone (office landline)

> Hi, it's Aldo Hushi from aldo.today. Is <agent> around?
>
> *(to the agent)* Quick one: I run the Adelaide suburb prices site, aldo.today. Every suburb page has one spot for one local agent, and <suburb>'s is open.
> I'm not after a big decision on the phone. Can I buy you a coffee near the office Thursday or Friday and show you the page?

Gatekeeper: "Who handles your marketing or listings spend? I'll send them the page so they can have a look first."

---

## 3. Cold email to an agent

**Subject options** (pick one):

- `<Suburb> got its letter today`
- `Your name on the <suburb> page?`
- `<Suburb>: $<median>, and an empty spot`

**Opener options** (pick one):

1. *Letters hook:* "<Suburb>'s letter from a long-time local went up on aldo.today today. Here it is: <link>."
2. *Number hook:* "<Suburb>'s median is $<median> on <sales> sales to June. That's the Valuer-General's figure, and it's on aldo.today with the working shown."
3. *Local hook:* "I live in Tennyson and I saw your board on <street>."

**Body (under the strongest, the letters hook):**

> Hi <first name>,
>
> <Suburb>'s letter from a long-time local went up on aldo.today today: <letter link>
>
> Under the suburb's price page, there's room for one agent, and only one. It's the name a seller sees right after they look up what <suburb> houses go for. Right now that's me, with my own phone number, because nobody's taken it.
>
> I'd like it to be someone who sells there. $49 a month, exclusive, and the price holds for 12 months. It's marked as paid, and nobody can buy a better number or a higher ranking. That's in the rules: aldo.today/how-this-site-works
>
> Up for a coffee near your office this week? Ten minutes, and I'll show you the page.
>
> Aldo Hushi
> aldo.today · 0423 003 680 · hi@aldo.today
> Tennyson, SA 5022
>
> Not for you? Reply "no" and I won't email again.

**Agency principal version:** swap the third paragraph for:

> The agency bundle holds up to 8 suburbs for $350 a month, and the agency owns them, not the agent. So if someone moves on, you swap the name and keep the spot. The office patch ($500) adds a block-split pass for the whole office, and I set it all up.

---

## 4. Email to a broker, conveyancer, surveyor or builder

Aimed at: being in the room at the right moment.

**Subject:** `Local help, <council>`

> Hi <first name>,
>
> aldo.today has the house prices for every suburb in <council>, plus rents, land $/m² and whether a block meets the Code's minimums to split.
>
> Each council page has one "Local help" spot for each of a broker, a conveyancer, a land surveyor and a builder. The <trade> spot for <council> is open. You'd be listed on the council page and on all <n> of its suburb pages, right next to the numbers people are reading when they work out what they can afford, or whether their block might split.
>
> $99 a month, one per trade per council, marked as paid.
>
> Worth a coffee? I'm around <council area> most days.
>
> Aldo Hushi · aldo.today · 0423 003 680
>
> Not for you? Reply "no" and I won't email again.

Surveyors and builders: lead with the block-split angle. The `/split-check` and `/subdivide-adelaide` pages are where their customers start.

---

## 5. LinkedIn DM (no hashtags, keep it short)

Pick an opener:

1. "<Suburb> got its letter on aldo.today today. Thought you'd want to see it: <link>"
2. "Saw your <street> sale. The <suburb> page on aldo.today has one agent spot, and it's still empty."
3. "Ciao <name>," *(only if the name is Italian)* + opener 1.

Then:

> I run aldo.today: Valuer-General prices for every Adelaide suburb, one agent per suburb, $49 a month. Coffee this week? I'll show you the page.

---

## 6. Follow-ups

**Day 3:**

> Hi <first name>, just bumping this up. <Suburb>'s spot is still open as of this morning. Coffee Thursday or Friday?

**Day 8 (last one):**

> Last one from me, promise. If <suburb> isn't the right patch, tell me which one is and I'll check it's free. Otherwise, all the best with the spring listings.

Then stop. Mark them `closed-no-reply` in `pipeline.csv` and leave them alone.

---

## 7. Objections

| They say | You say |
|---|---|
| "How many leads will I get?" | "I won't promise you a number. The ledger's public: 3 enquiries this month, sitewide. It's early. What you're buying is the name on the suburb, before someone else takes it, for $49." |
| "We're on realestate.com.au / Domain already." | "Good, keep that. This isn't a listing portal. It's the page people read before they're ready to list, when they're working out what the suburb's doing." |
| "Who else is on it?" | "Nobody yet, and the site shows that publicly. You'd be first in <suburb>." |
| "Can I get a better spot or a better ranking?" | "No. Nobody can, and that's why the site's worth being on." |
| "What do you get from my sale?" | "Nothing. No referral fee, no commission. You pay for the spot and that's it." |
| "Send me something." | Email the suburb page link, the advertise link, and a coffee time, all in one email. |
| "Too expensive." | "$49 a month is less than one letterbox drop. Start with one suburb, and if it doesn't earn its keep, don't renew." *(Check the cancellation terms before you say this, and only say what's true.)* |

---

## 8. The close

> Great. Which suburb do you want first? I'll put your card up today and send you an invoice for the first month. If you want more suburbs later, the bundle's $350 for 8.

Then: add the agent to the site, screenshot their live card, send the screenshot and the invoice together, and update `pipeline.csv` to `won`.
