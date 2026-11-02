# Handover and contributing guide

Explorar España needs a new owner. I built it in 2025 as a volunteer for the
Instituto de la Ingeniería de España (IIE) and I can no longer maintain it.
This guide is written for whoever takes it over, whether that is the IIE, a
university group or an individual developer. It covers what has to move,
how the code is organised, how to change content and deploy, and what I know
is broken.

— Jon Andoni Baranda ([@jandoni](https://github.com/jandoni))

---

## Contents

- [Current state](#current-state)
- [Transition checklist](#transition-checklist)
- [Running it locally](#running-it-locally)
- [Editing places](#editing-places)
- [Deploying](#deploying)
- [Code map](#code-map)
- [Known issues](#known-issues)
- [Ideas for what comes next](#ideas-for-what-comes-next)

---

## Current state

| | |
|---|---|
| Live site | https://d6bj2oo3yl8y7.cloudfront.net (linked from https://www.iies.es/ingenet) |
| Hosting | AWS S3 (`eu-south-2`, Spain) behind CloudFront, on my AWS account |
| Map | Google Maps JavaScript API 3D maps, on my Google Cloud billing account |
| Server side | None. A static site; content is `src/config.json` |
| Tests / CI | None |
| Last change | January 2026 |

Everything in the repository is enough to rebuild and redeploy the site from
scratch on someone else's accounts. Nothing depends on a service only I can
reach, apart from the two accounts in the table.

---

## Transition checklist

In this order, so the live site never goes down.

**1. Take over the code.**
- [ ] I transfer this repository to the new owner's GitHub account or
      organisation (Settings → Transfer). Links and stars move with it, and
      the old URL redirects.
- [ ] Or fork it, and I archive this one with a pointer to the fork.

**2. Get your own Google Maps Platform key.**
- [ ] Create a Google Cloud project with billing enabled and enable the
      **Maps JavaScript API**.
- [ ] Create an API key. Restrict it to **HTTP referrers** (the production
      domain and `http://localhost:3000/*`) and to the Maps JavaScript API
      only. The key ships to every visitor's browser by design; the
      restriction is what stops it being reused elsewhere.
- [ ] Set a **budget alert**. Photorealistic 3D map loads are billed per
      load. I removed the Places API calls in January 2026 (commit
      `511215d`); they were costing about $85 a month. In testing, the app
      now calls only the Maps JavaScript API: flights use the coordinates
      stored in `config.json`, with no Geocoding or Elevation requests.
- [ ] Put the key in `.env` (see `.env.example`).

**3. Host it on your own AWS account.**
- [ ] Configure an AWS CLI profile with S3 and CloudFront permissions.
- [ ] Run `./deploy/setup-infrastructure.sh` with your own names, for
      example `AWS_PROFILE=iie BUCKET_NAME=ingenet-iie ./deploy/setup-infrastructure.sh`.
      It creates a private S3 bucket in `eu-south-2`, a CloudFront
      distribution with Origin Access Control, and `production-config.sh`.
- [ ] Wait for CloudFront to report `Deployed` (5 to 15 minutes), then run
      `./deploy/deploy.sh`.
- [ ] Optional: put it on a proper domain (for example a subdomain of
      `iies.es`) with an ACM certificate in `us-east-1` and a CNAME to the
      distribution.

**4. Switch traffic and close the old setup.**
- [ ] Update the link on https://www.iies.es/ingenet to the new URL.
- [ ] Once traffic has moved, I delete the old bucket, CloudFront
      distribution and Google key.

**5. Agree who owns the content.**
- [ ] Someone at the IIE should own `src/config.json`: which institutions
      appear, their descriptions, and permission to show their logos.

---

## Running it locally

Requirements: Node.js 18 or newer, and a Google Maps key (step 2 above).

```bash
npm install
cp .env.example .env     # set VITE_GOOGLE_MAPS_API_KEY
npm run dev              # http://localhost:3000
npm run build            # production build in dist/
npm run preview          # serve dist/ locally
```

The key reaches the page through Vite's `%VITE_GOOGLE_MAPS_API_KEY%`
replacement in `src/index.html`. The `.env` file lives in the repository root
(`envDir` in `vite.config.js`) and is gitignored.

---

## Editing places

All content is in `src/config.json`: a `properties` object for the opening
card and a `chapters` array with one entry per place. To add a place, copy an
existing entry, give it the next `id`, and change the fields.

| field | required | what it does |
|---|---|---|
| `id` | yes | unique number |
| `title` | yes | name on the card, list and top bar |
| `placeName` | yes | address the camera resolves to fly there |
| `cameraCoordinates` | yes | `{lat, lng, elevation}` used for the fly-to |
| `cameraStyle` | yes | camera move on arrival; every place uses `drone-orbit` |
| `content` | yes | description on the card (Spanish) |
| `dateTime` | yes | period shown on the card, e.g. `1750-Presente` |
| `address`, `website` | yes | shown on the card and in the "Enlaces" tab |
| `logoUrl`, `imageUrl`, `imageCredit` | yes | logo in the top bar and card, image credit |
| `etiquetas` | yes | tags for the four filters: `ubicacion`, `sector`, `profesion`, `tipo` |
| `focusOptions`, `preserveCustomImage` | yes | leave as in existing entries |
| `newsConfig` | no | `{rssUrl, keywords}` for the "Novedades" tab; without it the app tries common RSS paths on `website` |
| `highlights`, `gallery`, `phone`, `email` | no | extra card content, used by a few places |

Tags are free text, so keep spelling consistent: "Ferrol" and "ferrol" become
two different filter entries. For logos, `scripts/download-logos.sh`
downloads them into `src/assets/logos/` and
`scripts/update-config-logos.py` rewrites the config to use the local files.

Check the change with `npm run dev`, then deploy.

---

## Deploying

```bash
./deploy/deploy.sh
```

It builds with Vite, uploads `dist/` to S3 with cache headers (HTML never
cached; CSS, JS and JSON revalidated on every load; images and fonts cached),
and invalidates CloudFront. It
reads `production-config.sh`, written by `deploy/setup-infrastructure.sh`;
`deploy/production-config.example.sh` shows the fields if you need to write it
by hand for existing infrastructure. Both scripts can be run from any
directory.

---

## Code map

Only these modules are loaded; `main.js` is the entry point.

| file | role |
|---|---|
| `src/index.html` | page shell, Maps JS bootstrap, layout of all panels |
| `src/main.js` | start-up sequence, UI wiring, filters, cards, tabs |
| `src/chapters/chapter-navigation.js` | moving between places, intro card |
| `src/utils/google-maps-3d.js` | the `Map3DElement`, camera fly-to and orbit |
| `src/utils/google-markers-3d.js` | logo markers on the 3D map |
| `src/utils/chatbot.js` | the search assistant (keyword match on titles, places and tags) |
| `src/utils/news-service.js` | RSS fetching through CORS proxies, with caching |
| `src/utils/performance-settings.js`, `network-detector.js` | connection check at start-up; sets image preload batch size |
| `src/utils/places-new-api.js`, `simple-geocoder.js` | geocoder-based camera positioning; with coordinates in `config.json` it makes no API calls |
| `src/utils/loading-manager.js`, `image-preloader.js`, `ui.js` | loading screen and image preloading |

`docs/history/` holds my 2025 notes on the CesiumJS version (performance
work, logo migration, the first deployment guide). The CesiumJS renderer was
removed from the tree in November 2026; it is in the git history if you need
it.

---

## Known issues

Seen while testing the current build in November 2026:

- **"Alpha channel" banner.** `src/index.html` loads the Maps JavaScript API
  with `v: "alpha"`, so every visitor sees Google's "development only"
  notice. Check whether the 3D map features used here are available on the
  `beta` or weekly channel and move off alpha.
- **Search suggestions mention places that are not on the map.** The search
  box placeholder and the "no results" message suggest "Alhambra", "Prado",
  "Sagrada", "Palacio Real" and "Santiago", left over from an earlier
  dataset. Replace them with real examples such as "Ferrol" or "astillero"
  in `src/utils/chatbot.js` and `src/index.html`.
- **Mobile tab bar.** At phone width (390 px) the Información / Novedades /
  Enlaces tabs on the opening card render as an empty dark block.
- **Three 404s on every load.** `main.css` is bundled correctly, but a raw
  copy is also emitted and its `@import` lines point to
  `assets/css/styles/*.css`, which does not exist. Styles are unaffected.
  Removing the `@import` lines is not the fix: they are how those styles get
  bundled.
- **News depends on free public proxies** (allorigins, corsproxy.io,
  codetabs). corsproxy.io returned 403 during testing and the next proxy took
  over. A small CloudFront Function or Lambda proxy would remove the
  dependency.
- **The connection test downloads CesiumJS.** `network-detector.js` times
  a download of the full CesiumJS library (about 2.5 MB) from Google's CDN
  to estimate bandwidth, on every visit. The renderer no longer uses
  Cesium, and the visitors on slow links pay the most for the test.
  `navigator.connection.effectiveType`, or timing a small file from the
  site itself, would do the same job.
- **Leftover CesiumJS styles** remain in `main.css`.
- **No tests or CI.** A GitHub Action running `npm run build` on pull requests
  would be a cheap first step.

---

## Ideas for what comes next

- An English version of the interface and descriptions.
- Places beyond the maritime and naval core, if the IIE wants the map to
  cover the whole engineering network.
- A proper domain under `iies.es`.
- Simple, privacy-friendly visit counts, so the IIE can see whether schools
  use it.
