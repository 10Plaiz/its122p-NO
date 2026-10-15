# Content-Security-Policy check, 15 October 2026

The enforced CSP in `vercel.json`, checked in Chromium before it reaches the live
site.

## Target

| Item | Value |
| :--- | :--- |
| Revision | `64c5c26` plus the uncommitted security-hardening changes |
| Site | `bun run build:web`, served by `serve.ts` on `http://localhost:5173` with every header from `vercel.json` |
| API | Not contacted. `check.mjs` answers each `/api/*` call with a fixed synthetic Citizen, report, and export |
| Outside services | Real: Google Maps JavaScript, Places, Google Fonts, Nominatim |
| Browser | Playwright Chromium, desktop user agent |

## Run it again

```bash
bun run build:web
bun tests/evidence/csp-local-2026-10-15/serve.ts "$PWD"      # leave running
node tests/evidence/csp-local-2026-10-15/check.mjs "$PWD" <screenshot folder>
```

The Maps key in `.env` must allow `http://localhost:5173/*`.

## Results

| Page | Exercised | Result |
| :--- | :--- | :--- |
| `/board` | Map, report card with a Supabase photo URL, fonts | No violation |
| `/report/new` | Map, Places search with suggestions, pin at map center, Nominatim address | No violation ([map](report-new.png), [search](places.png)) |
| `/my-reports` | PDF export through jsPDF | No violation; the PDF downloaded |
| `/account` | Page load | No violation |

Hosts the pages reached: `fonts.googleapis.com`, `fonts.gstatic.com`,
`maps.googleapis.com`, `maps.gstatic.com`, `places.googleapis.com`,
`nominatim.openstreetmap.org`.

Before `src/web/public/zod-config.js`, every page reported one `script-src eval`
violation: Zod probes `Function("")` when it builds an object schema. The probe
failed safely, but the report would be noise. The script sets Zod's `jitless`
option before any module runs.

## Limits

- Signed-in data was synthetic. Staff and Administrator pages were not opened;
  they load no extra outside hosts.
- The shared project's Storage images were not fetched; `img-src` allows
  `https://*.supabase.co`.
