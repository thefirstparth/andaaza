# Andaaza (अंदाज़ा): context for a new session

> **The first rule, above every other: Andaaza must stay fully functional forever, whether or not Claude (or any AI,
> or anyone) is around to look after it. Judge every decision by that.** In practice:
> - Nothing at run time may depend on Claude or any AI, a scheduled job, a person, or a session. AI may add optional
>   notes (Gemini's "why it moved", decided 26 Sep 2026); the page must look and work the same without them.
> - Prefer plain, long-lived web standards and free public data over clever or new features; anything newer must
>   fall back gracefully in browsers that lack it.
> - Every outside dependency (a source, storage, fonts, the host) needs a fallback, so the page degrades, never breaks.
> - Stay inside free tiers with room to spare; running out must mean "slower", never "down".
> - Keep it understandable to a stranger: choices live in `config/consensus.json` in plain words, and the README says
>   how to fix things by hand without code.
> - If a change would make Andaaza need ongoing care to keep working, don't make it; propose another way.

Read this first. It is the whole story so far: what Andaaza is, how it works, every decision Parth made (and the ones
he rejected), the mistakes already fixed, and how he likes to work. The README covers day-to-day upkeep.

## What it is
- **Andaaza** (Hindi/Urdu: an estimate, a guess, a rough calculation) shows what the world's prediction markets think,
  as **water levels**: every chance is a gauge filled to its percentage. Tagline: **"Watch the world change its mind."**
- Owner: **Parth Bhatia** (Bengaluru; Instagram @bearded.bhatia, LinkedIn /in/connectwithparth). He uses it to watch
  **trends**, not to bet or look at money. It is **public** (India and worldwide), so every label must be clear to a
  first-time visitor; flavour comes second.
- Live: **https://getandaaza.vercel.app** (poster: `/poster`). Repo: `thefirstparth/andaaza` (private). Vercel
  project: `getandaaza`. Storage: Blob store `andaaza-readings` (Mumbai, private).
- History: born inside The House of 1400 (Parth's daily newspaper site, repo `thefirstparth/house-of-1400`,
  house14.vercel.app) as "Pulse", renamed "Consensus", then "Andaaza"; moved to its own repo on 26 Sep 2026 with its
  git history. Old addresses (house14.vercel.app/andaaza, /consensus, /pulse, /markets, andaaza-live.vercel.app)
  redirect here from the paper's vercel.json. **The two sites must never depend on or link to each other.**

## Non-negotiables
1. **Must run forever without Claude.** Nothing depends on any AI (the optional Gemini notes are the only AI call). No scheduled jobs. Everything decided at run time from
   live data and `config/consensus.json`. Plain, widely supported CSS/JS; fixed font metrics, not fragile tricks.
2. **No hardcoded markets or stories.** Choices are rules (regex patterns, thresholds), never named market IDs.
3. **Fast:** the page must show data in well under 3 s (5 s max), then update in the background.
4. **Free tier only** (Vercel Hobby, Blob free allowance). Writes are budgeted.
5. **Real QA before saying "done":** measure, screenshot laptop/phone/2560 in Day/Night/Retro, pages and posters.
   Parth has caught unverified claims before ("did we not do any QA?"); never claim alignment or correctness by eye.

## Architecture (tiny on purpose)
- `public/index.html`: the entire page (HTML+CSS+JS, no framework, no build). Icons are vendored between
  `ICONS:BEGIN/END` by `npm run icons` (Iconify: Material Symbols rounded + Simple Icons).
- `api/consensus.js`: the only API. Serves the newest reading at once (instance memory, else Blob), and when it is
  over **15 min** old reads the markets again **in the background** (`waitUntil`). `next_at` = reading time + 15 min;
  if overdue it returns `updating: true` (page shows "updating now" and asks every 20 s). Fresh readings cached at the
  edge 60 s; overdue ones not cached. Very first visit ever: quick reading without Kalshi (~3 s), Kalshi follows.
- `lib/consensus.js`: reads **Polymarket** (busiest 400 + each subject's `pm_tags`), **Kalshi**, **Manifold**
  (play money, marked). Kalshi is read in full at most every **6 h** into a saved index of ~450 relevant events;
  between scans those markets are re-priced 100 per request (~4 s total instead of ~40 s). If a scan fails, the old
  index keeps being re-priced; retry after 1 h.
- `lib/blob.js`: Blob read/write. `config/consensus.json`: every editorial choice in words.
- Fallbacks: a source down → carry on (red dot); all down → last good reading with a "last good reading from …" note
  after 3 h; API down → each browser shows the last reading it kept (localStorage), within 1.5 s.
- Local: `npm install`, `npm run dev` (http://localhost:3000), `npm run check` (reads markets once, prints counts).

## Selection logic (config/consensus.json)
- Floors: a market needs $2,000 traded in 24 h ($500 for F1 and NBA; $300 for must-haves). Settled markets
  (>98.5% / <1.5%), side bets (pole, podium, fastest lap, handicaps, O/U), price ladders go.
- **Exclusions:** US domestic politics (incl. Trump approval/RCP), the Fed, American sports, weather, esports,
  post/tweet counts, **crypto entirely** (Parth asked to remove Bitcoin).
- **Follows:** Real Madrid, Verstappen, Alcaraz, Djokovic, India, Warriors. **Barcelona is followed as a rival
  (a hatewatch), not a team he supports.**
- Subjects (areas): Sport (F1, football, cricket, tennis, NBA) · Tech (AI & tech) · Money (India first; no crypto) ·
  World & India · Screen & culture (film, series & streaming, celebrities; Indian items preferred) · Miscellaneous.
- Per subject: **must-haves** (`must` regex, at most 2 per rule, marked ★) → follows → `prefer` → rest by score
  (0.6 × today's trade + 0.4 × lifetime/30). **3 to 9** shown dynamically; first 3 as cards, rest as one-line rows.
- Must-haves include: next F1 race winner, Drivers' title, Verstappen; anything Madrid, La Liga/UCL champion,
  Ballon d'Or, Clásico; India/Kohli cricket; Alcaraz, Djokovic; Warriors; best-AI-model question; RBI, Sensex/Nifty,
  rupee, Indian inflation/GDP; wars moving oil (Iran, Hormuz, Israel, Ukraine…).
- A settled recurring question hands over to its next round (September's best AI model at 99% → October's).
- Duplicates across sites merge into one card ("also: Kalshi 61%").
- **Coming up** (sports only): matches within 7 days with a followed side or a name on the topic's `notable` list.
- **Tide board (top 7), in this order, each with fallbacks:** Best AI model · Real Madrid · Football · Formula 1 ·
  Cricket · World · Most traded. **Label = what the market is (La Liga, Champions League…), never why it was picked.**
  The gauge shows the **real leader** (Barcelona 80%); the followed side's chance rides on a chip (Real Madrid 18%).
  Yes/no questions are headlined by the question itself, never "Yes".
- **Currents:** moves of 4+ points in a day where the favourite's **spread ≤ 4 points** (traders agree on the price)
  and the usual floor is met; weekly/monthly rankings excluded. Parth: the amount is only a proxy for accuracy.
- **Where the money is:** the 10 busiest markets overall.

## Design (Parth approved each of these; don't regress them)
- **Water is the theme.** Numbers are drawn twice and masked by the waterline: subject colour above, white below
  (the "Oklahoma City 22%" look Parth loves). Board numbers all sit bottom-left. Names never cross the waterline
  (≥50%: name at the foot, under water; <50%: at the head).
- **Waves read the data:** calm (long swell) under 2 pts moved today, normal, choppy (short, fast) from 8 pts; each
  gauge has its own phase. The water **breathes continuously** (bob ±0.5/1/2 pts by sea state) because Parth keeps
  the page open all day; it rises on first load and flows old→new on each reading. Registered CSS props (`@property
  --pv`, `--bob`); off for reduced motion. The wave is long and gentle (72 px) so split digits stay legible.
- Yesterday's level: dashed mark (full width on the board with "was X%" when ≥35%; a notch on small gauges).
- **Colour:** OKLCH tonal palettes on one hue wheel (every subject equally bold): F1 red, tennis clay, India saffron,
  money gold, football green, cricket teal, AI blue, world navy, NBA violet, film purple, celebs pink, streaming
  raspberry. Brand **neel (indigo)** + **marigold** accent. Neutral ground; near-black Night.
- **Three looks** (button cycles, names the next): **Day, Night, Retro** (old printed tide almanac: aged paper,
  printer's inks, halftone water, double rules, Libre Caslon Text + IBM Plex Mono; Retro fonts load only when chosen;
  Retro ignores the OS dark setting).
- **Type:** Instrument Sans (reading; narrow width only for big numbers) + Instrument Serif italic (name, titles).
  Parth rejected Roboto Flex/Bodoni as not modern enough. Tiro Devanagari Hindi and Noto Nastaliq Urdu are loaded for
  their few letters only.
- **Header:** the gauge-drop logo inside the name (sized in the name's ems, centred on it, measured 0.000em) ·
  **Andaaza** · marigold seal **अंदाज़ा** (centred on the x-height middle, measured) · one dictionary line (🔊 speaks
  it with the device voice, /ən·daː·zaː/, noun · Hindi, Urdu, اندازہ, "an estimate, a guess, a rough calculation.")
  · hero **"Watch the world change its mind."** Each form of the word appears **once** (Parth disliked repetition).
  Background: faint **lehariya** (Rajasthani wave tie-dye; lehar = wave) in neel/marigold, fading at the edges.
  Reading panel: IST clock, "Markets read at … · next update …", source dots.
- Area titles carry Hindi seals: खेल, टेक, पैसा, दुनिया, परदा, फुटकर.
- A glass top bar (logo + area filters) appears **only after scrolling past the tide board**. Poster/Night live in a
  floating glass capsule bottom-right.
- **Footer:** "Made with ♥ in India" (madewithloveinindia.org) "by Parth Bhatia" · aside **"Ideas by Parth. Typing by
  Claude. Complaints to Parth."** (Claude mark, muted, orange on hover; Parth's tone: stark, sarcastic, funny, but
  the ideas are his; never imply Claude did everything) · "Prices from Polymarket, Kalshi and Manifold. Andaaza reads
  them; it takes no bets." · Instagram button first (filled, gradient), LinkedIn quieter.
- **Poster** (`/poster` or the button): tide board + Currents + Coming up + Where the money is on one screen; fills a
  2560×1440 monitor (Parth's BenQ), fits laptop, stacks on phone.
- Section names chosen: Currents, Coming up, Where the money is, Miscellaneous, How this works (includes the water
  explanation). The top gauges have no title.

## Notes: why it moved, why it leads (Gemini, `lib/why.js`)
- Parth's call (26 Sep 2026). **Why it moved**: favourite moved ≥10 pts in a day, ≥15 in a week, ≥25 in 30 days (spread ≤ 4,
  real money), anywhere but **Currents** (never notes there). **Why it leads**: favourite ≥50% now and a week ago
  (a day on Kalshi), up to settled (Parth wants Antonelli at 91% explained too), on the board, subject cards and any ★
  must-have; weekly charts and dated rankings are skipped. Shown in a tinted Gemini blue-violet panel with the Gemini
  mark (Parth: a note must be noticeable, clearly AI-written); dashed plain box in Retro.
- Visitors never add cost: one reading per 15 min at most; a second function copy that finds a fresher saved reading
  writes no notes. Both keys are free plans without a card, so a limit means "notes pause", never a bill.
- Each note = 1 Tavily search (free 1,000/month) + 1 Gemini call (free key, no billing). Gemini gets the news, the
  market's rules and contenders, picks one item (0 = no note) and writes ≤140 chars. Style: Bhide as a general guide
  only (fact first, the actual cause, names and numbers, no hedging), not newspaper strictness. Code rejects em dashes,
  hedges, analysis -ing tails and notes that name no contender.
- A note belongs to a story: moved notes are rewritten only when the price moves 10 more points, turns, or the
  favourite changes; misses retried only after 5 more points; lead notes weekly. Caps: 3 per reading, 25/day, 750/month.
  Order: board moves, other moves, board leaders, card leaders.
- Tested on a preview-only bench before launch (removed at launch): Parth judged Primetime, Russell, PayPal, Big
  Brother, Venezuela, Zverev, Barcelona notes good; the Arsenal one (Arteta's contract) wrong, which led to the rival
  search (Manchester City's points case).
- Rejected, with reasons: Gemini's own Google Search (not free on current models; terms forbid storing or showing its
  answers to others), Gemini 2.5 (closed to new keys), Google News RSS (personal-use terms), GDELT (rate-limited),
  The Guardian (thin on India), Grok (paid). ChatGPT Plus / Claude Pro include no API use; Google AI Pro gives $10/month
  Cloud credit but needs billing, and a billing project with $0 prepaid refuses even free calls (402).

## Mistakes already made (don't repeat)
- Container query units (`cqh`) for the water: Safari showed 17% as full. Use percentages only.
- Board label named the reason ("Real Madrid") above Barcelona's 80%: labels name the market.
- `next update` kept moving to "now + 1 min"; fixed to reading time + 15 min / "updating now".
- A later `.staff{transition}` rule silently overrode the level transition: check computed styles, not just CSS.
- Aligning seals/logo by the text box (not by font metrics) looked off at some sizes: always measure.
- On Vercel, a real file (index.html) wins over vercel.json rewrites; host-based routing needed middleware (moot now).

## Open items / ideas not done
- A real domain (andaaza.in, ~₹700–1,000/yr): add in Vercel → Domains; nothing in code changes.
- India-specific markets are thin on these exchanges; the preference exists but often has little to promote.
- Test once on a real iPhone/Safari after big visual changes (only Chromium is available in the Claude sandbox).

## Working with Parth
- Replies are often voice-dictated (Wispr Flow): numbered option lists help him answer quickly ("1 keep, 4 change").
- Give options with a recommendation; he decides names, copy and taste. Explain trade-offs plainly.
- Keep commits small, with clear messages; he prefers seeing it live and verified. The House of 1400 has its own
  scheduled daily runs; never touch that repo from Andaaza work.
