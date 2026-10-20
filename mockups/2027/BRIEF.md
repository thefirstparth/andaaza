# Andaaza 2027: eight design directions (brief)

Mockups only. The live site (`public/`) is not touched. Every page reads one real, frozen reading from
`data.js` (`window.AZ`, made by `tools/build-data.mjs` from the live API on 21 Oct 2026, 04:00 IST).

Parth chose (20 Oct 2026): working HTML mockups on real data, laptop + phone; header, tide board, Currents and one
subject (Sport) per mockup; water stays in all but drawn differently, plus one wildcard; **one in-between light theme
each** (tinted, never stark white, never near-black; no dark mode); only the name, tagline, अंदाज़ा seal and data rules
are fixed. Five different directions plus three modern versions of today's Andaaza.

## Every page must
- Be one standalone file `mockups/2027/<slug>.html`: its own `<!doctype html>`, `<meta charset="utf-8">`,
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, a `<title>` like
  "Andaaza · Matka", `<script src="data.js"></script>`, all other CSS/JS inline. Fonts only from Google Fonts
  (`fonts.googleapis.com`), each with a real fallback stack. No other external host (marks are local: `marks/...`).
- Render everything from `window.AZ` (no invented numbers, names or dates). Show, in this order:
  1. **Header**: Andaaza, the अंदाज़ा seal, the dictionary line (/ən·daː·zaː/ · noun · Hindi, Urdu · اندازہ · "an
     estimate, a guess, a rough calculation."), the hero "Watch the world change its mind.", the reading
     (IST 04:00, next update 04:15, the three sources with a status dot; Manifold is play money).
  2. **Tide board**: all 7 of `AZ.board`. Label = what the market is (`label`), the leader (`lead.name`, `lead.mark`),
     its chance as the gauge level, `sub`, the move ("▲ 71 pts in 30 days · was 8%" from `move`, `was`, `window`:
     day → "in a day", week → "this week", month → "in 30 days"), yesterday's level as a mark where known.
     Yes/no questions (`yesno`) are headlined by the question (`sub`), never "Yes".
  3. **Currents** (`AZ.currents`, 6): big moves in a day ("▲ 33 pts").
  4. **Sport** (खेल): Football (`AZ.topics.football.items`, first 4; "Coming up" from `.next`, 3 matches with
     kickoff IST), Formula 1 (`AZ.topics.f1.items`), Tennis (`AZ.topics.tennis.items`). ★ for `star`, a quiet
     "Following" sign for `followed`, `added` label ("Added 7 days ago"; marigold "New" when `isNew`), `also`
     ("also: Kalshi 97%"), money traded today (`today`, as "$31k today").
  5. **Footer line**: "Ideas by Parth. Typing by Claude. Complaints to Parth." and "Prices from Polymarket, Kalshi
     and Manifold. Andaaza reads them; it takes no bets."
- Water reads the data: level = chance (percent heights, never `cqh`); calm swell under 2 pts moved, choppy from 8;
  gentle continuous motion that switches off under `prefers-reduced-motion`.
- Marks: `mark.t === 'svg'` → inline its `svg` (it uses currentColor); `'img'` → `<img src>`; flags (`flag: true`)
  round. A missing mark shows the bare name.
- Phone (≤ 600px) is designed, not squeezed: it is the **installed web app** view (home-screen app, no browser
  bar), so plan thumb reach (a bottom bar is welcome), safe areas (`env(safe-area-inset-*)`), no horizontal page
  scroll, 16px minimum gutter written `max(16px, env(safe-area-inset-left))`.
- Laptop: fill the width with margins `clamp(16px, 3vw, 64px)`; no max-width box.
- Light, single theme: `color-scheme: light`, explicit `background` on body, all colours as tokens on `:root`.
- Plain web standards with fallbacks (the site must run forever without care): CSS + a little vanilla JS.
  Newer features (`@property`, subgrid, `backdrop-filter`, view transitions, scroll-driven animation) only with a
  graceful fallback.
- Text contrast ≥ 4.5:1 (labels too), visible keyboard focus, real `<a href>`/`<button>`.
- Complete at rest: nothing waits at opacity 0 for a scroll observer.
- No AI-template tropes: no purple-blue gradient hero, no emoji, no accent-bar cards, no Inter/Space Grotesk, no
  generic cream + serif + terracotta, not everything centred, not `rounded-lg` on everything.
- Small type uses at most four sizes; big numbers use tabular figures.

## The eight
Five different directions:
- **A · Matka** (`a-matka.html`): Indian craft. Water held in clay pots.
- **B · Front Page** (`b-front-page.html`): the data desk. Sentences and annotated charts.
- **C · Forecast** (`c-forecast.html`): wildcard. Read like a weather forecast ("79% chance").
- **D · Instrument** (`d-instrument.html`): precision. Graduated cylinders on engineering paper.
- **E · Pebbles** (`e-pebbles.html`): expressive and playful. Soft shapes, springy water.

Three modern versions of today's Andaaza:
- **F · Andaaza Next** (`f-next.html`): today's design, refined for 2027.
- **G · Andaaza Glass** (`g-glass.html`): today's design with a legible take on Liquid Glass.
- **H · Andaaza Lehar** (`h-lehar.html`): brand-forward. Neel, marigold and lehariya lead.

## Round 2 (Parth, 21 Oct 2026): density on the phone
Parth liked **F · Andaaza Next** and **G · Andaaza Glass** (but G's ground made everything unreadable). His problem:
on the installed app (iPhone 17, Nothing Phone (3)) too little is seen per scroll; design is hampering UX and
navigation. A plain dense list (a reference he showed: big % + title + grey bar + "Others 2%") is "fucking bland".
Information first, design in service of it, but still Andaaza.

Measured on iPhone 17 as an app (402 × 874, ~778 px usable): the live site shows 2 of the 7 tide gauges on the
first screen and is ~16 screens long; F shows 2 (5 more behind a sideways swipe); G shows 1.

Five new variants, all of F's family (light haze ground, Instrument Serif italic name, Instrument Sans, Bricolage
Grotesque narrowed numbers, the OKLCH subject palette, water that reads the data, the masked number, the seal):
- **I · Tide Rows** (`i-tide-rows.html`): every market a slim row whose background fills left → right like water.
- **J · Tide Grid** (`j-tide-grid.html`): today's vertical gauges, small, three or four to a row.
- **K · Glass, clear** (`k-glass-clear.html`): G's glass on a calm ground; glass only for floating controls.
- **L · Pages** (`l-pages.html`): each section is a page you swipe to; each page fits its screen.
- **M · Race Bars** (`m-race-bars.html`): each market shows its whole field in one water channel.

Every round-2 page shows: compact header, tide board (7), Currents (6), Where the money is (`AZ.money`, 10), Sport
(football 4 + Coming up 3, F1, tennis). On the phone the dictionary line and hero may shrink to one quiet line
(the full dictionary line can live in an "About" sheet). Measure with `density.mjs` (scratchpad) at 402 × 874 and
412 × 915: markets fully on the first screen, and screens to the end.
