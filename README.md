# GIS Helper

**Coordinate & grid converter with a tactical marking layer — entirely in the browser.**

GIS Helper converts a location between every format a field kit tends to demand —
decimal degrees, DMS, MGRS/USNG (6, 8 and 10 digit) and ArcGIS XY (UTM easting/northing) —
and lets you pin **deployments** and draw **zones** on top of the result.

There is **no backend, no database and no account**. Your data never leaves your
machine unless you explicitly copy or export it, and a single JSON file carries a
complete session to anyone else.

---

## Features

### Coordinate conversion
- Accepts a **place name**, **lat/lon**, **MGRS/USNG grid reference** or raw **UTM XY**.
- Outputs all of the following at once:
  - Latitude / Longitude (decimal degrees)
  - Latitude / Longitude (DMS)
  - ArcGIS XY — UTM easting / northing
  - MGRS 6-digit (100 m), 8-digit (10 m) and 10-digit (1 m)
- **Auto-detect** input format, or force one from the dropdown.
- **Live cursor HUD** — hover the map for a running readout; click to lock the point.
- Draggable result marker, with reverse geocoding for a readable place name.

### Tactical marking layer
- **Six built-in unit types** — Company HQ, Support Platoon, SIGINT Platoon,
  ISR Platoon, HUMINT Platoon and Special Task.
- **Create your own unit types** with custom names, icons (up to 3 each) and colours.
- Per-deployment details: commander, troop strength, arms & ammo, special equipment.
- **Polygon zones** with live area calculation in m² / km² and adjustable fill opacity.
- Drag to reorder deployments, duplicate, fly-to, and delete entries.
- A map legend and an always-available zone/deployment list.

### Data — copy, save, download, upload
All four actions are available in the **Save & Share** card, and every one of them
uses the **same JSON payload**, so a copied blob, an exported file and the browser's
saved session can never drift apart in shape.

| Action | What it does |
| --- | --- |
| **Save to browser** | Writes the session to `localStorage` (auto-saved as you work). |
| **Load from browser** | Restores the last saved session onto the map. |
| **Copy all data** | Puts the whole session JSON on your clipboard. |
| **Export JSON file** | Downloads `gis-helper-data-YYYY-MM-DD.json`. |
| **Import JSON file** | Loads a saved file — or just **drag and drop** a `.json` anywhere on the page. |
| **Print report** | One-page plan sheet, printable or saved as PDF. |
| **Export PNG** | The plan picture as a PNG file. |

### Printing or sharing a picture

1. Build your map.
2. Set **Frame**, **Scale bar** and (optionally) **Rotate to fit** under *Export options*.
3. Press **Print report** for a paper/PDF sheet, or **Export PNG** for an image file.

A session contains:

- the **map indicator** position and name,
- every **deployment** (type, icon, colour, details, coordinates),
- every **zone** (vertices, colour, opacity, computed area),
- your **custom unit types**.

### Printable report & image export
- **Print report** renders a one-page A4 landscape plan sheet and opens your browser's
  print dialog — pick *Save as PDF* for a PDF. It contains the map indicator and its
  full coordinate readouts, the map picture, and tables of every deployment and zone.
- **Export PNG** downloads the same picture as `gis-helper-plan-YYYY-MM-DD.png`
  (1600×1000), with numbered pins that cross-reference the report table, a scale bar,
  a north arrow and the base map's attribution.
- The picture frames every deployment, zone and the map indicator automatically —
  you do not have to zoom the map first.
- **No new dependencies.** The image is drawn on a plain `<canvas>` in the browser.
  If the tile server refuses cross-origin tile reads (a browser security restriction
  that varies by provider), the export silently falls back to a **schematic plan** —
  a labelled coordinate grid with the same zones, pins and labels, minus the street
  imagery — and tells you which one you got. The on-screen map is never affected.

#### Export options
A collapsible **Export options** group sits above the two export buttons. Options are
remembered in this browser.

| Option | Values | Notes |
| --- | --- | --- |
| **Frame** | All deployments, zones & indicator · Whatever the map is showing · Deployments only · Zones only · Map indicator only | Chooses what the picture frames. Picking a preset with nothing in it tells you exactly what is missing instead of exporting a blank sheet. |
| **Scale bar** | Metric + imperial · Metric · Imperial · Hidden | Imperial uses feet and miles. |
| **Rotate to fit** | on / off | Off means north-up, always. On computes the plan's principal axis and spins the sheet onto it, so a long or diagonal plan fills the frame instead of leaving empty corners. The north arrow follows the rotation, and the caption states the applied angle. A plan that is already axis-aligned is not needlessly rotated. |
| **Plan title** | free text | Prints in the report header, e.g. `Exercise Ironclad`. |
| **Plan date** | date | Prints in the report header as distinct from when the file was generated. |

The title and date appear on the **printed sheet only** — they are not burned into the
PNG. Like the theme and custom unit types, export options are per-browser settings and
are deliberately *not* part of the shared session JSON, so they do not travel with an
exported plan file.

### Other
- Four themes (teal, indigo, emerald, orange) persisted across visits.
- Fully responsive, keyboard accessible, no build step.
- Your session is **auto-restored** the next time you open the page.

---

## Getting started

No installation, no dependencies to install. Either:

**Option A — open it directly**

```bash
git clone https://github.com/<your-username>/GIS-Helper.git
cd GIS-Helper
```

Then open `index.html` in any modern browser. Everything works from `file://`.

**Option B — serve it locally** (recommended, so the clipboard API is allowed)

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

**Option C — deploy to GitHub Pages**

1. Push the repo to GitHub.
2. **Settings → Pages → Source: Deploy from a branch** → select `main` / `/ (root)`.
3. Your site goes live at `https://<your-username>.github.io/GIS-Helper/`.

### Sharing a plan with someone

1. Build your map, then press **Export JSON file** (or **Copy all data**).
2. Send the file however you like — email, drive, chat.
3. They open GIS Helper and press **Import JSON file**, or drop the file onto the page.

If they already have markings on their map, they get asked whether to **merge** the
file alongside them or **replace** everything with it.

### Printing or sharing a picture

1. Build your map.
2. Press **Print report** for a paper/PDF sheet, or **Export PNG** for an image file.

Both frame all your deployments, zones and the map indicator for you.

---

## Project structure

```
GIS-Helper/
├── index.html          # Markup, the About/Help modal, import prompt and report sheet
├── style.css           # All styling, four themes as CSS custom properties, print rules
├── script.js           # Coordinate maths, map, marking layer, data layer, export engine
├── LICENSE             # MIT
└── Assets/
    ├── creator.jpg
    └── creator-avatar.jpg
```

There are no other files. `index.html` is the entire application — no build step, no
package manager, no runtime dependencies beyond Leaflet from a CDN.

---

## The data file format

Handy if you want to generate or edit a plan programmatically. Pretty-printed JSON:

```json
{
  "version": 3,
  "exportedAt": "2026-10-03T12:00:00.000Z",
  "app": "GIS Helper",
  "customUnitTypes": [
    { "id": "custom-a1b2", "label": "Recon Team Alpha", "icons": ["drone"], "color": "#38BDF8", "builtin": false }
  ],
  "indicator": {
    "lat": 40.68925,
    "lon": -74.0445,
    "name": "Statue of Liberty, New York, USA"
  },
  "deployments": [
    {
      "id": "m1a2b3c4",
      "type": "company-hq",
      "icon": "flag",
      "color": "#00F5D4",
      "commander": "Capt. Example",
      "troops": 42,
      "vehicles": "2",
      "arms": "Standard issue",
      "equip": "Vehicle-mounted",
      "lat": 40.6895,
      "lon": -74.044,
      "timestamp": 1767225600000
    }
  ],
  "zones": [
    {
      "id": "z9y8x7w6",
      "name": "Alpha Sector",
      "color": "#FF6B6B",
      "opacity": 0.25,
      "vertices": [
        { "lat": 40.69, "lng": -74.046 },
        { "lat": 40.691, "lng": -74.043 },
        { "lat": 40.689, "lng": -74.042 }
      ],
      "areaM2": 42500
    }
  ]
}
```

Note that zone vertices use **`lng`**, while deployments and the map indicator
use **`lon`**. That asymmetry comes from Leaflet's own lat/lng convention.

`type` is one of the built-in ids — `company-hq`, `support-platoon`,
`sigint-platoon`, `isr-platoon`, `humint-platoon`, `special-task` — or a
`custom-…` id defined in `customUnitTypes`.

Everything except `vertices` (and `lat` / `lon` for positions) is optional.
Older files are accepted and missing fields are filled in safely, so files
from earlier versions still import — unknown unit types fall back to Company HQ
and legacy icon names are mapped to their modern equivalents.

---

## Privacy

- Your session is stored **only** in your own browser's `localStorage`.
- Nothing is uploaded anywhere. The app makes no requests to any server of its own.
- The only network calls are to public map tile servers, the
  [Nominatim](https://nominatim.openstreetmap.org/) geocoding API (place name
  lookup) and the Google Fonts stylesheet — each of which necessarily sees the
  coordinates you asked it about.
- **Printing and PNG export do re-fetch the map tiles** covering your plan, at the
  smallest zoom that frames it, purely to paint them onto the canvas. Nothing is
  sent anywhere; the requests go to the same public tile server that is already
  drawing your map.
- Exported files are ignored by git (see `.gitignore`) so a real plan is never
  committed by accident.

---

## Credits & attributions

- **Leaflet 1.9.4** — map library, loaded from a CDN.
- **Map tiles** — OpenStreetMap contributors, Esri, OpenTopoMap, Humanitarian
  OpenStreetMap Team and CARTO. Please respect their
  [tile usage policies](https://operations.osmfoundation.org/policies/tiles/) and
  attribution requirements if you deploy this yourself.
- **Nominatim** — geocoding by the OpenStreetMap Foundation, used under its
  [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- **Fonts** — Poppins via Google Fonts.
- Created by **Md Masrur Masuk Shopnil**.

---

## License

Released under the [MIT License](LICENSE). Use it, modify it, host it, share it.

If you fork it, the map tile providers still apply their own terms to the tiles
themselves — a fork needs its own tile setup if you deploy it at any real scale.
