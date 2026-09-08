# NHAI Network Explorer

An interactive map of NHAI's project network that drills down through the
organisational hierarchy:

```
State  →  Regional Office  →  PIU  →  Project
```

Clicking a state shows only the ROs operating in it; clicking an RO shows only
its PIUs; clicking a PIU lists only its projects. Every level has hover detail,
and the map camera flies to fit the selection.

Published artifact: https://claude.ai/code/artifact/dafda606-213c-4420-af4e-ed4a898f12b5

---

## Layout

| Path | What it is |
|---|---|
| **`index.html`** | **The deployable page.** Self-contained — open it or serve it as-is |
| `src/head.html` | `<title>` + Google Fonts links |
| `src/styles.css` | All page CSS — design tokens, both themes, layout |
| `src/body.html` | Page structure (header, map stage, inspector rail) |
| `src/app.js` | The whole interactive layer: projection, render, hit-test, drill-down, search |
| `build/export_db.js` | PostgreSQL → `data/raw.json` |
| `build/build.py` | `raw.json` + CSV + boundaries → `data/payload.json` |
| `build/alias.py` | PIU/district name → geoBoundaries `shapeName` (~110 aliases) |
| `build/bundle.py` | `src/` + `payload.json` → `dist/index.html` |
| `data/payload.json` | The embedded payload (1.75 MB) |
| `assets/boundaries/` | Vendored state / district / official-outline GeoJSON |
| `dist/artifact.html` | Same page minus the `<html>` wrapper, for the Artifact tool |

## Deploying — GitHub Pages

`index.html` at the root is a complete, self-contained document: the CSS, the JS
and all map geometry are inlined. Nothing is compiled at deploy time, so Pages
just serves the committed file.

### One-time setup

```bash
# 1. create the repo (or use the web UI / gh repo create)
git remote add origin https://github.com/Softsensor-org/nhai-network-explorer.git
git push -u origin main
```

Then in **Settings → Pages → Build and deployment**, set **Source** to
**GitHub Actions**. That is the only setting required — do *not* pick
"Deploy from a branch", which would bypass the workflow.

The site goes live at:

```
https://softsensor-org.github.io/nhai-network-explorer/
```

Every later `git push` to `main` redeploys automatically; **Actions → Deploy to
GitHub Pages → Run workflow** triggers it by hand.

### How the workflow works

`.github/workflows/pages.yml` copies `index.html` and `.nojekyll` into `_site/`
and uploads that — no Node, no Python, no build step, because the page is already
built. `.nojekyll` stops Jekyll from post-processing the output.

It needs `pages: write` and `id-token: write`, which are declared in the
workflow; no personal access token or repository secret is involved.

### Serving it anywhere else

```bash
xdg-open index.html            # just open the file
python3 -m http.server 8000    # or serve the folder -> http://localhost:8000
```

Any static host works — point it at this folder. `netlify.toml` is included for
Netlify (`publish = "."`, no build command).

Only `index.html` is needed at runtime. `src/`, `build/`, `data/` and `assets/`
are build-time inputs: committed for reproducibility, never fetched by a browser.

`dist/artifact.html` (git-ignored) is the same page without the
`<html>`/`<head>`/`<body>` wrapper, for the Artifact tool, which supplies its own.

## Rebuilding

```bash
# 1. refresh from PostgreSQL (needs the dhms_nhai_msrv .env)
cd ../dhms_nhai_msrv
node -r dotenv/config ../nhai-network-explorer/build/export_db.js

# 2. regenerate the payload  (needs: pip install shapely)
cd ../nhai-network-explorer
python3 build/build.py

# 3. assemble the page  -> index.html + dist/artifact.html
python3 build/bundle.py
```

Steps 2–3 are deterministic — the same inputs give a byte-identical payload.
To change only styling or behaviour, edit `src/` and run step 3 alone.

**Edit `src/`, never `index.html`** — the root page is generated and any direct
edit is overwritten by the next bundle.

---

## Data sources

**PostgreSQL `dhms`** — the authoritative source. 887 active projects from
`master_upc_project`, joined to `master_state`, `master_region_zone`,
`master_piu`, `master_zone`, `master_contractor`, `master_ae_ie`.
24 states with projects, 25 ROs, 186 PIUs.

**`data/Network_Overview_UPC_Lat_Long.csv`** — matched on both `UPC` and
`Survey_UPC` (rewriting `N_…` to `N/…`). This is what makes the map usable:
the DB alone has coordinates for only 186 projects.

**`assets/boundaries/`** — vendored geometry:

| File | Source | Licence |
|---|---|---|
| `india-outline.official.geojson` | Approved national boundary | — |
| `india-states.ne10m.geojson` | Natural Earth 10m, 36 features | Public domain |
| `india-districts.gb-adm2.geojson` | geoBoundaries IND ADM2, 735 features | CC-BY 4.0 |

The **official outline** is drawn deliberately rather than a tile provider's
basemap, which would render foreign-perspective borders. It reaches 37.07°N with
J&K, Ladakh, Arunachal Pradesh and the island territories intact.

---

## How a project is placed

First match wins; the project detail panel always states which applied.

| Source | Projects | Meaning |
|---|---:|---|
| Project master `start_lat/lng` | 186 | Corridor endpoints from the DB |
| NSV network overview CSV | 430 | Surveyed start/end coordinates |
| PIU district centroid | 264 | **Approximate** — no coordinates in either source |
| None | 7 | Listed in panels, not drawn on the map |

The 264 approximate ones draw as smaller, half-opacity dots so an inferred
position is never mistaken for a survey fix.

## How territories are built

1. **PIU territory** = the district its office sits in.
2. **RO territory** = union of its PIUs' districts, plus any district assigned to
   it in `master_ro_district`.
3. **Leftover fill** — any part of a state not claimed by a PIU district joins
   the RO working there. Where a state has several ROs, each leftover piece joins
   whichever RO's territory it actually adjoins.

### Clipping: ROs that cross state lines

Six ROs work in more than one state (RO-Chennai, RO-Dehradun, RO-Delhi,
RO-Gandhinagar, RO-Guwahati, RO-Hyderabad). Drawing an RO's full national
territory inside a state view is wrong — selecting Rajasthan would light up the
whole of RO-Gandhinagar's Gujarat footprint for the sake of its 1 Rajasthan
project.

So `build.py` precomputes clipped slices:

- `payload.ro_by_state[state][ro]` — the RO's polygon ∩ that state
- `payload.piu_by_ro[ro][piu]`     — the PIU's polygon ∩ its RO

`currentFeatures()` in `app.js` prefers the slice and falls back to the full
polygon. The project dots and the RO stat tile are scoped to match, so an RO
opened via a state reads "1 in Rajasthan", not its national 49, and the panel
discloses the split under "Works across states".

### PIU name resolution

PIU names are town names, not district names, so `build/alias.py` maps them onto
geoBoundaries `shapeName` — spelling (`Kalaburagi`→Gulbarga,
`Prayagraj`→Allahabad), renaming (`Chhatrapati Sambhajinagar`→Aurangabad), and
town→district (`Sohna`→Gurgaon, `Chandikhole`→Cuttack), plus suffix stripping
(`Bhiwani-CHD-HR`, `Chennai - 2`, `CMU Mathura`).

**All 221 PIUs and all 148 RO-districts resolve**, so every RO and PIU has a
polygon. One caveat: Hyderabad is absent from the district source, so that PIU
maps to Rangareddy, the surrounding district.

---

## Two data caveats

**States with no projects.** 12 states have no projects in the master, so they
carry no RO of their own. They are attributed to the RO that administers them and
drawn at 42% opacity — filled and clickable, but visibly distinct from active
states:

| RO | Administers |
|---|---|
| RO-Guwahati | Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura |
| RO-Jammu | Ladakh |
| RO-Kolkata | Sikkim |
| RO-Mumbai | Goa, Dadra & Nagar Haveli and Daman & Diu |
| RO-Chennai | Andaman & Nicobar |
| RO-Thiruvananthapuram | Lakshadweep |
| RO-Chandigarh (PB) | Chandigarh |

⚠️ **This mapping is not in the database.** It is NHAI's standard jurisdictional
arrangement, hard-coded as `ADMIN_STATE_RO` in `build/build.py`. There is no row
tying Nagaland to RO-Guwahati because there are no projects there to create one.
Correct that table if NHAI's actual allocation differs.

**One corrected `state_id`.** 15 of 887 projects have a UPC state suffix that
disagrees with `state_id`. Checked case by case, most are genuine cross-border
corridors where the suffix names the *originating* state (e.g. `N/02001/18001/GJ`
is filed under Maharashtra with PIU Thane — correct), so the DB stays
authoritative and is **not** blanket-overridden.

`build.py` overrides only where the UPC suffix, the PIU name and the district the
PIU sits in **all three** agree against it. Exactly one project qualifies:

    N/04002/25002/GA   PIU Goa, district North Goa   Maharashtra -> Goa

Without it Goa showed 0 projects while its single 13 km project sat under
Maharashtra. Goa is consequently a real state in the map, not an
administered-only one, and Maharashtra reads 87 rather than 88. If the DB row is
fixed upstream, this rule simply stops matching — it is not a hard-coded count.

**Territory beyond Natural Earth.** India's official outline claims area the
Natural Earth state polygons omit (Gilgit-Baltistan, Aksai Chin — 4.5% of the
national area). That remainder is merged into J&K and Ladakh so no part of India
renders blank.

---

## Notes on the front end

No map library and no tile requests — `src/app.js` implements its own Web
Mercator projection over the vendored GeoJSON on a single `<canvas>`.

- Mercator y is scaled to degrees (`×180/π`) so the aspect ratio is correct.
  Without it the map collapses to a flat sliver.
- Hit-testing is ray-casting in **geographic** space, so it stays correct at any
  zoom.
- Territory colours are hashed from the name, so a given RO keeps its colour
  between builds.
- Light and dark themes are token-driven and handle all three viewer states
  (explicit light, explicit dark, un-stamped system default).

**Naming.** Offices render as `RO-Mumbai` and units as `PIU-Nashik` everywhere
(map labels, breadcrumbs, panels, legend, search) via the `roLabel()` /
`piuLabel()` helpers, which are idempotent — a name already carrying the prefix
is not doubled.

**Map labels** are dropped rather than allowed to overflow. A label must fit
inside its own territory's width; a few long names have short forms
(`DNH & DD`, `J & K`, `A & N Islands`), and anything still too wide is omitted,
with a collision check so two labels never overlap. This is why
"Dadra and Nagar Haveli and Daman and Diu" no longer sprawls across Maharashtra —
the hover tooltip still gives the full name.

**Row hover** marks the territory with a ring and a label chip rather than
zooming to fit it. Fitting was tried and rejected: RO-Gandhinagar's slice of
Rajasthan is ~0.04% of the state, so a fit filled the screen with flat colour and
lost all context. The camera pans (never zooms) only when the target is outside
the viewport, and restores on mouse-out.

**Small states get leader lines.** Labels are placed in two passes — inline where
the name fits inside the shape, otherwise a callout outside it joined by a line
to the nearest point on its outline (not its centroid, which made the
Lakshadweep leader cross back over Kerala). Goa, Mizoram, Tripura, Nagaland,
Sikkim, Delhi, Chandigarh, DNH & DD, Lakshadweep and A&N all label this way; a
few long names have short forms. Callouts try 8 directions at increasing distance
and take the first slot that collides with nothing already drawn.

**One `anim()` gotcha worth keeping.** `requestAnimationFrame` timestamps are
document-relative, so seeding the tween's `t0` from `performance.now()` made the
progress ratio negative and drove `scale` to -252 (the map rendered as one flat
fill). `t0` is now taken from the first rAF callback.

**Keyboard:** `/` focuses search · `Esc` goes up one level.
