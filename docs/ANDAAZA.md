# Andaaza (अंदाज़ा), for whoever looks after it next

Andaaza is the prediction-markets page at `/andaaza`: what Polymarket, Kalshi and Manifold think about the things
Parth follows. It stands alone. It shares the Vercel project with The House of 1400 but no code, no data and no
schedule with it, and it never calls Claude or any other AI. It keeps running as long as the Vercel project, the
Blob store and at least one of the three sources exist.

## How it runs
- `public/andaaza.html`: the whole page (HTML, CSS, JS in one file). No framework, no build step beyond copying.
- `api/consensus.js`: the page's only data call. Serves the newest reading at once (memory, then Blob), reads the
  markets again in the background when the reading is over ten minutes old.
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
- Blob writes: the reading is saved at most every 30 minutes, Kalshi's list at most every 6 hours, so about 1,600
  writes a month even with a poster left open all day. Blob reads happen only when memory has nothing fresh.
- Function time: a reading takes about 4 s (a full Kalshi read, every 6 hours, about 45 s; the limit is 60 s).

## Fixing things by hand
- A subject shows the wrong things: edit its `words`, `must` or `prefer` in `config/consensus.json`.
- A source changed its API: its reader is one function in `lib/consensus.js` (`polymarket`, `kalshiScan` and
  `kalshiReprice`, `manifold`). To switch a source off, make its function return `[]`.
- Polymarket renamed a tag: update the topic's `pm_tags`; the busiest 400 are read regardless.
- Check it locally: `npm run dev`, then open `/andaaza.html`. Data only: `node -e "import('./lib/consensus.js').then(m=>m.consensus()).then(d=>console.log(d.topics.map(t=>t.id+':'+t.items.length)))"`.
- Old addresses (`/consensus`, `/pulse`, `/markets`) redirect to `/andaaza`; the poster is `/andaaza/poster`.
