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
- `public/logos.js` + `public/marks/`: logos, flags, club crests (ESPN, ~170 clubs: top 5 leagues, Portugal, Netherlands,
  Champions League, NBA; a Night version where ESPN has one) and faces (ESPN headshots, found by name), made once by
  `npm run logos` from `config/logos.json`; loaded after first paint as lazy pictures; never fetched from anyone at run
  time; without them names simply show bare.
- `api/consensus.js`: the only API. Serves the newest reading at once (instance memory, else Blob), and when it is
  over **15 min** old reads the markets again **in the background** (`waitUntil`). readings keep to the clock: one per quarter
  hour (:00/:15/:30/:45 IST), taken by the first visit after it begins; `next_at` = the next quarter hour; if overdue it
  returns `updating: true` (page shows "updating now", asks every 20 s and repaints by itself, no reload needed).
  Parth asked about 20 min: note spending is set by stories and caps, not reading frequency, so 15 stayed. Fresh readings cached at the
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
- **Logos** (Parth, 27 Sep 2026: "icons/vectors/logos for important things… survive without Claude… all themes";
  then "make it look better, not cluttered"): brand marks in the text colour (AI labs, F1 makers, SpaceX, Nvidia,
  streaming, fintech), club crests in colour (Night uses ESPN's dark versions), faces for drivers and tennis players
  (else the flag they play under), round flags for countries, Polymarket/Kalshi/Manifold marks in the reading panel and
  "also" links (not in the card meta: it truncated "$136k today"), competition marks on board labels, and on a card
  title only when its label doesn't already say it (Champions League under Football, oil under Money; not F1 under
  Formula 1). Letter badges (RM, FCB) were tried and dropped as clutter. In small gauges the mark sits on its own line
  above the name. Retro tones pictures toward sepia (faces greyscale).
- Area titles carry Hindi seals: खेल, टेक, पैसा, दुनिया, परदा, फुटकर.
- A glass top bar (logo + area filters) appears **once the header's buttons have scrolled out of view** (was: after the
  tide board; changed 26 Sep 2026 because on the board no Notes button was reachable). Poster and the look
  button (Day/Night/Retro) sit **top right of the header, above the clock**, and again at the right end of the top bar
  (icons only on a phone). Parth moved them from the floating bottom-right capsule (26 Sep 2026): it hid market data.
- **Footer:** "Made with ♥ in India" (madewithloveinindia.org) "by Parth Bhatia" · aside **"Ideas by Parth. Typing by
  Claude. Complaints to Parth."** (Claude mark, muted, orange on hover; Parth's tone: stark, sarcastic, funny, but
  the ideas are his; never imply Claude did everything) · "Prices from Polymarket, Kalshi and Manifold. Andaaza reads
  them; it takes no bets." · Instagram button first (filled, gradient), LinkedIn quieter.
- **Poster** (`/poster` or the button): tide board + Currents + Coming up + Where the money is on one screen; always
  spans the full width and is scaled so its height fills the screen (laptop, 2560×1440 BenQ GW2790Q, ultra-wide);
  on a monitor on its side the three lists stack; stacks and scrolls on phone and tablet.
- **Width (Parth, 26 Sep 2026: "fix this once and for all")**: no max-width. The page always fills the screen's width
  with margins `--gut` = clamp(16px, 3vw, 64px) (one variable; the Currents bleed uses it too), and is scaled
  smoothly with width by `fitMonitor` (1× to 1920px, 1.33× at 2560, max 1.5×). QA widths: 1280, 1470, 1728, 1920,
  2560, 3440 ultra-wide, 1440×2560 portrait, 820 tablet, 390 phone: board uses 92–94% of the width everywhere.
- Section names chosen: Currents, Coming up, Where the money is, Miscellaneous, How this works (includes the water
  explanation). The top gauges have no title.
- **Sections as pages (Parth, 26 Sep 2026: "not an endless PDF")**: every section is a tinted band ruled off from the
  next (double rule in Retro). The top bar's chips are pages: Everything · ★ Favourites · Currents · each subject ·
  Where the money is; each has an address (#sport, #favourites, #currents, #where-the-money-is), back works. Showing
  Everything, the top bar outlines the section being read (scroll spy) and scrolls the chip into view; the row fades at
  its edges when it scrolls. **Favourites** = every must-have (★) plus every market about someone followed (`f` flag).
- **Board notes aligned** (Parth, 27 Sep 2026: notes looked random; a caption strip under the board was rejected: "the
  note should be next to the prediction"): each gauge's parts sit on shared rows (CSS subgrid), so every note sits
  under its own gauge, on the same line as the others, in same-height boxes. Without subgrid: the stacked layout.
  The move line ("▲ 1 pt in a day") stays in the text block right under the subtitle (8px): putting it on a shared
  row too left gaps under short columns (Parth caught it).
- **Notes button** (Gemini mark + count), floating bottom right and travelling with you (Parth, 27 Sep 2026; it
  replaced the header and top-bar Notes buttons; the footer leaves room under it). A solid Gemini blue-violet pill
  with a › arrow so it reads as pressable; sized with the screen (font clamp 14–21px: ~42px tall on a laptop, 55px on
  the BenQ, compact on a phone). Once started it names where you are ("7 / 13 · La Liga"; the market's name is hidden
  on a phone) and the current note keeps a ring until the next press, restored after each reading's repaint. Each press brings the next note to the middle of the screen and
  flashes it; a note shown twice (board and its card) is one stop; wraps after the last; on a page with no notes it
  opens Everything first. Tested on the live data: 17 notes, 17 stops, laptop clicks and phone taps.

## Notes: why it moved, why it leads (Gemini, `lib/why.js`)
- Parth's call (26 Sep 2026). **Why it moved**: favourite moved ≥10 pts in a day, ≥15 in a week, ≥25 in 30 days (spread ≤ 4,
  real money), anywhere but **Currents** (never notes there). **Why it leads**: favourite ≥50% now and a week ago
  (a day on Kalshi), up to settled (Parth wants Antonelli at 91% explained too), on the board, subject cards and any ★
  must-have; weekly charts and dated rankings are skipped. Shown in a tinted Gemini blue-violet panel with the Gemini
  mark (Parth: a note must be noticeable, clearly AI-written); dashed plain box in Retro.
- **Why they are favoured** (matches, added 26 Sep 2026; Parth: "at least for the favourites"): the board's match
  gauges and Coming-up matches of anyone followed, written once within 48 h of the start from 5 days of news, rewritten
  only if the favourite changes (`why.matches`; `which: "all"` covers every match, ~4 more searches a day). Matches
  had been left out not for budget but because fixtures carry no price history and need a different question.
- Each note ends with its age in small grey text ("3 h ago", then the date), counted from now and updated every 30 s
  with the clock.
- Numbers as digits: the voice asks for them, and `digits()` turns any spelled-out two to ninety-nine (and "plus 24")
  into digits, also on notes already saved (Parth caught "seven wins… plus twenty-four").
- News backup: if Tavily fails and `NEWSDATA_API_KEY` is set, NewsData.io's free plan (200/day, commercial use OK, no
  card; free news ~12 h late) is searched instead. Brave (paid) and Linkup (work email only) rejected.
- Refresh: a note belongs to a story. Moved: kept while the move stays (a day move carries on as a week move, then fades
  and the note goes); rewritten only on 10 more points the same way, a reversal (a new story), or a new favourite.
  Leads (Parth: "7 wins from 7 will go stale"): rewritten after the leader's next match ends (its start + 3 h, taken
  from Coming up when the note is written, `nm`), on a 5-point move either way, a new favourite, or at the latest
  weekly. Budget caps are hard, so refresh logic can never push past the limits.
- Visitors never add cost: one reading per 15 min at most; a second function copy that finds a fresher saved reading
  writes no notes. Both keys are free plans without a card, so a limit means "notes pause", never a bill.
- Each note = 1 Tavily search (free 1,000/month) + 1 Gemini call (free key, no billing). Gemini gets the news, the
  market's rules and contenders, picks one item (0 = no note) and writes ≤140 chars. Style: Bhide as a general guide
  only (fact first, the actual cause, names and numbers, no hedging), not newspaper strictness. Code rejects em dashes,
  hedges, analysis -ing tails and notes that name no contender.
- A note belongs to a story: moved notes are rewritten only when the price moves 10 more points, turns, or the
  favourite changes; misses retried only after 5 more points; lead notes weekly. Caps: 3 per reading, 25/day, 750/month.
  Order: the tide board first (moves, then leaders and matches), favourites (followed matches, ★, follows), other
  moves, other leaders. (First live fill put notes on deep
  rows while the board waited behind minor moves; Parth saw none. The board is what everyone sees.)
- Tested on a preview-only bench before launch (removed at launch): Parth judged Primetime, Russell, PayPal, Big
  Brother, Venezuela, Zverev, Barcelona notes good; the Arsenal one (Arteta's contract) wrong, which led to the rival
  search (Manchester City's points case).
- Rejected, with reasons: Gemini's own Google Search (not free on current models; terms forbid storing or showing its
  answers to others), Gemini 2.5 (closed to new keys), Google News RSS (personal-use terms), GDELT (rate-limited),
  The Guardian (thin on India), Grok (paid). ChatGPT Plus / Claude Pro include no API use; Google AI Pro gives $10/month
  Cloud credit but needs billing, and a billing project with $0 prepaid refuses even free calls (402).

## Mistakes already made (don't repeat)
- A finished race stayed on the board: Kalshi keeps race markets open a week (Russell 98%, under the 98.5% cut).
  Now `decided` (config): a leader ≥95% on a question past its due date gives way (Parth: only past, not upcoming).
- The page was capped at 1280px, zoomed only from 2100px: every laptop and 1080p screen between had wide empty margins.
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
