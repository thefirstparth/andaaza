# Andaaza (अंदाज़ा)

Watch the world change its mind.

## For whoever looks after it next

Andaaza, at https://getandaaza.vercel.app, shows what Polymarket, Kalshi and Manifold think about the things Parth
follows, as water levels. It is a site of its own: its own repository and Vercel project, no schedule, and it never
calls Claude or any other AI. It keeps running as long as the Vercel project, its Blob store and at least one of the
three sources exist. (It began inside The House of 1400 as "Pulse", then "Consensus"; the history came with it.)

## How it runs
- `public/index.html`: the whole page (HTML, CSS, JS in one file). No framework and no build step: Vercel serves
  `public/` as it is. The poster is the same page at `/poster`.
- `api/consensus.js`: the page's only data call. Serves the newest reading at once (memory, then Blob), reads the
  markets again in the background when the reading is over fifteen minutes old.
- `lib/consensus.js`: reads the three sources, sorts markets into subjects, picks and ranks them.
- `config/consensus.json`: every choice in words: subjects and their keywords, must-haves, follows, exclusions,
  minimums, the tide board. Most changes are edits here, not code.

## What happens when something breaks
| What fails | What the page does |
|---|---|
| One or two sources | Carries on with the others; a red dot marks the missing one. |
| All three sources | Keeps serving the last good reading, with a note saying how old it is. |
| Kalshi's full read | Keeps re-pricing the last list of Kalshi markets, tries a full read again an hour later. |
| Blob storage (gone, full, failing) | Works from memory and the edge cache; first visits after a quiet spell are slower (3 to 5 s). |
| The whole API | Each browser shows the last reading it saw, straight away, with its age. |
| Google Fonts | Falls back to system fonts; the layout holds. |

## Free-tier budget (Vercel Hobby)
- Storage: the Vercel Blob store `andaaza-readings` (Mumbai, private), connected to the `getandaaza` project (Storage tab). Without it the page still works, from memory.
- Blob writes: a reading is taken and saved at most every 15 minutes, only while someone is looking; Kalshi's list at
  most every 6 hours. Normal use stays well inside the free allowance; a screen showing it round the clock all month
  would need about 2,900, and if the allowance runs out readings carry on from memory. Reads happen only when memory
  has nothing fresh.
- Function time: a reading takes about 4 s (a full Kalshi read, every 6 hours, about 45 s; the limit is 60 s).

## Fixing things by hand
- A subject shows the wrong things: edit its `words`, `must` or `prefer` in `config/consensus.json`.
- A source changed its API: its reader is one function in `lib/consensus.js` (`polymarket`, `kalshiScan` and
  `kalshiReprice`, `manifold`). To switch a source off, make its function return `[]`.
- Polymarket renamed a tag: update the topic's `pm_tags`; the busiest 400 are read regardless.
- Check it locally: `npm install`, then `npm run dev` and open http://localhost:3000. Data only: `npm run check`.
- Icons are vendored into the page: edit the list in `scripts/icons.mjs`, then `npm run icons`.
- A domain of its own (say andaaza.in): add it in the Vercel project's Settings → Domains; nothing in the code changes.
- Old addresses on house14.vercel.app (`/andaaza`, `/consensus`, `/pulse`, `/markets`) and andaaza-live.vercel.app
  redirect here; those redirects live in The House of 1400's vercel.json.
