# Tennyson in Miniature — review and recommendations

Page: https://aldo.today/adelaide/tennyson/miniature
Reviewed 10 Oct 2026, desktop (1440×900) and phone (390×844), every button pressed.

## Fix first

**`aldo.today/Tennyson` returns 404.** So do `/tennyson` and `www.`. If that short link is on a flyer, card or post, it's dead. Add a redirect for every suburb: `/<Suburb>` → `/adelaide/<suburb>/miniature`, case-insensitive.

## What works — keep it

- The look: tilt-shift toy town, sea on one side and West Lakes on the other. People will share it.
- The copy: "Tennyson is painted in. Its neighbours are still plaster."
- It's built carefully: it checks the phone can do 3D before downloading anything, shows a good fallback card when it can't, and lowers detail on phones. Ready in about 5 s.

## Recommendations, in order

1. **Make the billboard readable.** It's the product, and right now it's a few pixels. "The board" should fly the camera close enough for the face, line and phone number to fill the screen. (In testing the camera barely moved; check on a real phone.)
2. **Start the phone panel collapsed.** On load it covers about 45% of the screen. Start with one line plus the gold button; it already shrinks after the first tap.
3. **Keep street labels out of the top ~120 px.** On phones, "Military Road" sits behind the Tennyson title chip and shows as "…oad".
4. **Say the call-to-action once.** Drop the gold line "Selling in Tennyson? Ask what your place is worth." It repeats the "What's my place worth?" button.
5. **Move the map credits out of the main panel.** Put them behind a small "ⓘ Data" link or in a corner. They're legally needed, not needed up front.
6. **Fix or drop the red and white dots on the water.** They read as noise. If they're boats or buoys, make fewer, bigger ones.
7. **Ease the desktop blur.** The top third is too soft; the dunes and the north end disappear.
8. **Hide "Agents: this board is open" from home owners.** Show it on `/advertise` or to agents only.
9. **Upgrade three.js some time.** It's r128 (2021); not urgent.

## Renting space to other local businesses — is it feasible?

**Technically: yes, easily.** The model already contains every building footprint, and the page reads its settings from a JSON slot (`bait-slot`, which already has an `agent` field). A "landmark" is just one more entry: the business's own footprint painted in their colours, a little sign on the roof, a label, and a tap that opens a card (name, offer, link, call button). Once that's built, adding a business is filling in a form.

**Commercially: possible, not proven yet.** What decides it:

| Question | Why it matters | How to find out |
|---|---|---|
| How many people open the miniature? | Businesses pay for local eyeballs. With no numbers it's a gift, not an ad. | The page already POSTs to `/miniature/seen`, so count it over 30 days, per suburb. |
| Are there businesses in Tennyson? | Tennyson is ~1,100 people and almost all houses. | Sell the **coast strip** as one patch: Tennyson, Grange, Henley Beach, Semaphore Park, West Lakes Shore. |
| Does it clash with your own lead flow? | You're the "free appraisal" guy, so renting the board to an agent hands them your leads. | Keep the board yourself. Rent only to **non-competing** categories: cafés, trades, gyms, salons, physios, mortgage brokers (the suburb page already has an empty broker slot). |

**How to sell it:**
- **Show, don't pitch.** Walk into a café on Military Road or Jetty Road with their actual building already painted in the miniature on your phone. Nobody says no to seeing their shop as a toy.
- **One business per category per suburb.** "The only café on the Tennyson model." Being exclusive is what they're paying for.
- **First month free, then monthly.** Don't take money up front before you can show view numbers.
- **Label it.** Put a small "Sponsored" tag on paid landmarks so it's clearly advertising (Australian Consumer Law).
- **Use it to get your foot in the door for BlueprintAU.** A landmark at a low monthly fee gets you talking to the owner, and the $2,000 custom tool is the real sale. A tradie on the map → Foreman / Takeoff; a bar → Brass Register.

**Prices (guesses, test them; nothing here is market data):** a small business landmark at roughly $30–80 a month per suburb; a broker or other high-value category more. Set real prices only once you have 30 days of view counts.

## Next steps

1. Fix the short link (redirect).
2. Fixes 1–3 above (board close-up, phone panel, labels).
3. Pull 30 days of `/seen` counts for the coast-strip suburbs.
4. Build landmark support (a JSON entry, a painted footprint and a tap card) and pre-build 3 demo businesses.
5. Walk them in. Report real yes/no results, not projected ones.
