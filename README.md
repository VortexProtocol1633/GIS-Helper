# GIS Helper

**Coordinate & grid converter with a tactical marking layer — entirely in the browser.**

GIS Helper converts a location between every format a field kit tends to demand —
decimal degrees, DMS, MGRS/USNG (6, 8 and 10 digit) and ArcGIS XY (UTM easting/northing) —
and lets you pin **deployments**, mark **spot points** and draw **zones** on top of the result.

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
- **My location** — a Google Maps style crosshair finds you once and drops the marker on your
  position, and a **Follow** toggle keeps it tracking you as you move. Every format (decimal,
  DMS, ArcGIS XY, MGRS 6/8/10) updates to wherever you are standing, and the blue circle shows
  the reported accuracy in metres. Uses the browser's own Geolocation API: nothing is uploaded,
  nothing is stored, and the feature needs `https://` or `localhost` as browsers only expose a
  position over a secure connection.
- Draggable result marker, with reverse geocoding for a readable place name.

### Tactical marking layer
- **Six built-in unit types** — Company HQ, Support Platoon, SIGINT Platoon,
  ISR Platoon, HUMINT Platoon and Special Task.
- **Create your own unit types** with custom names, icons (up to 3 each) and colours.
- Per-deployment details: commander, troop strength, arms & ammo, special equipment.
- **Polygon zones** with live area calculation in m² / km², adjustable fill opacity, and a free-text **Details** note.
- Drag to reorder deployments, duplicate, fly-to, edit, and delete entries.
- A map legend and an always-available zone/deployment list.
- **Clear all op data** on the map wipes every deployment, spot point and zone at once.

### Spot points
Single positions rather than units — an observation point, an enemy sighting, your own
position, a waypoint, a hazard, a reference point — each with an optional name and a
free-text note.

- **Six built-in spot types** — Obsn Pt, Enemy Spot, Own Spot, Waypoint, Hazard and
  Reference Pt — plus **your own spot types** with a name, up to 3 icons and a colour,
  managed exactly like the unit types.
- Drawn as a lettered circle on the map, so a spot never reads as a unit: the letters
  **A, B, C…** cross-reference the Spot Points table.
- Every spot carries its **latitude / longitude** *and* its **ArcGIS XY (UTM easting /
  northing)**, plus the full DMS and MGRS — shown in the marker popup, in the sidebar
  row, and in a **separate “Spot Points” section** of the report sheet and the PDF.
- Drag a marker to move it, drag its row to reorder, edit it, duplicate it, delete it.

The Spot Points table prints **#**, name, spot type, details, **Lat / Lon**,
**ArcGIS XY (UTM E / N)** and **MGRS 8**, and it can be left off the sheet with its own
tick in the *Include* group.

### GeoJSON (for GIS)
**Download → GeoJSON** (or the **Export GeoJSON** button in the Download & Upload card) hands the
plan over as one `gis-helper-features-YYYY-MM-DD.geojson` file, ready to load as data layers:

| Feature | Geometry |
| --- | --- |
| Every **deployment** | `Point` |
| Every **spot point** | `Point` |
| Every **zone** | `Polygon` (the ring is closed, as GeoJSON requires) |
| The **map indicator** | `Point` |

Each feature carries the coordinates the app already prints as attributes — **latitude**,
**longitude**, **dms**, **utmZone**, **utmEasting**, **utmNorthing** and **mgrs** — plus the
marking's own fields (`kind`, `ref`, `label`, `type`, commander / troops / vehicles / armsAmmo /
equipment, or `name` / `details`, or `areaM2` / `vertexCount`). `ref` is the same number or letter
as the pin or circle on the picture and the sheet, so the file and the paper cross-reference.
Zones put their centre in clearly-named `centre…` fields so it is never confused with the ring
itself, and the collection carries a `bbox` so a GIS can zoom straight to the plan.

Positions are **WGS 84, longitude first** (RFC 7946), which is what ArcGIS, QGIS, Global Mapper,
GeoPandas and every web map expect. Read it back into GIS Helper with the **JSON** file — the
GeoJSON is for the other side of the fence.

### Georeferenced PNG (for GIS)
**Download → PNG** (and **Export PNG**) does not hand you a loose picture: it builds a
**`.zip`** holding the image together with everything a GIS needs to place it on the world
map.

| File in the bundle | What it is |
| --- | --- |
| `gis-helper-plan-YYYY-MM-DD.png` | The 1600×1000 plan picture, in **EPSG:3857** (WGS 84 / Pseudo-Mercator, metres). |
| `…​.pgw` | The world file — the six affine terms that map a pixel to a map coordinate, measured off the picture's own projector. |
| `…​.prj` | The projection as ESRI WKT (`WGS_1984_Web_Mercator_Auxiliary_Sphere`). |
| `…​ READ ME.txt` | The projection, the scale, the rotation and how to open it. |

Unzip it and open the `.png` in ArcGIS, ArcGIS Pro, QGIS, Global Mapper or any other GIS
that reads a world file — keep the four files together and it lines up with every other
Web Mercator layer you have. Nothing is re-projected or approximated: the picture is painted
from Web Mercator tiles at a known zoom, so the mapping is exact.

**Rotate to fit still georeferences correctly.** A rotated plan is described by the world
file's own rotation terms (`D` and `B`), which are written from the same projector that drew
the plan — so a north-up export gets a clean axis-aligned world file and a rotated one gets
an affine that still puts every pin on its true ground position.

Untick **Georeferenced PNG** in *Export options* (or in the Download dialog) if you just
want the bare `.png` — a plain picture with no world file, as before.

### Data — download, upload, save, copy
A **Download** button sits in the top bar (and one in the **Download & Upload** card). It opens a
single dialog that takes the whole plan away as **JSON**, **GeoJSON**, **PDF** or **PNG**, with your
choice of map type, map scale, scale bar, north facing and framing. A matching **Upload** button loads a saved
plan back in. Every one of those actions uses the **same JSON payload**, so a copied blob, an
exported file and the browser's saved session can never drift apart in shape.

| Action | What it does |
| --- | --- |
| **Download → JSON** | Downloads `gis-helper-data-YYYY-MM-DD.json` — the working file, re-importable by anyone. |
| **Download → GeoJSON** | Downloads `gis-helper-features-YYYY-MM-DD.geojson` — the layers themselves, for GIS. Also on its own button, **Export GeoJSON**, in the Download & Upload card. |
| **Download → PDF** | Builds a real `.pdf`: the map page, then the coordinate facts and the deployment, **Spot Points** and zone tables. |
| **Download → PNG** | The 1600×1000 plan picture, georeferenced — a `.zip` holding the image, its `.pgw` world file, its `.prj` and a READ ME. Untick *Georeferenced PNG* for the bare picture. |
| **Upload JSON file** | Loads a saved file — or just **drag and drop** a `.json` anywhere on the page. |
| **Save to browser** | Writes the session to `localStorage` (auto-saved as you work). |
| **Load from browser** | Restores the last saved session onto the map. |
| **Copy all data** | Puts the whole session JSON on your clipboard. |
| **Print report** | The same one-page sheet, through the browser's own print dialog. |

### Taking the plan away

1. Build your map.
2. Press **Download** in the top bar.
3. Pick **JSON**, **GeoJSON**, **PDF** or **PNG**, choose the **map type**, **map scale**,
   **north facing**, **scale bar** and **framing**, tick what should be included, and press the
   button at the bottom.
4. A PNG download arrives as a `.zip` — unzip it and the picture, its `.pgw` world file and
   its `.prj` are ready for ArcGIS, QGIS or any other GIS.

A session contains:

- the **map indicator** position and name,
- every **deployment** (type, icon, colour, details, coordinates),
- every **spot point** (type, icon, colour, name, details, coordinates),
- every **zone** (vertices, colour, opacity, details, computed area),
- your **custom unit types** and **custom spot types**.

### PDF, print report & image export
- **Download → PDF** writes a genuine `.pdf` file: page one is the framed map, the pages after it
  are the map indicator's full coordinate readouts, the unit types in use, and a table of every
  deployment, every **spot point** (with its lat/lon and ArcGIS XY) and every zone with its area,
  centre and MGRS reference. The file is assembled by hand in the browser — the map is embedded
  as JPEG (`/DCTDecode`) and the text uses the base-14 Helvetica fonts every reader already has —
  so there is still **no dependency to install**. The text pages name the projection the picture
  is in, so the sheet stands on its own.
- **Print report** renders the same idea as a single A4 landscape sheet and hands it to your
  browser's print dialog, for anyone who would rather print it themselves.
- **Preview sheet** puts that sheet on screen first, with the print options in a panel beside it.
  It is the same markup and the same stylesheet the print dialog uses, drawn on a page of A4 at
  its true size (scaled down to fit the window), and it redraws the moment you change an option
  or the plan itself — so you can check the page without spending a print.
- **Download → GeoJSON** writes a `FeatureCollection` (points for deployments, spot points and the
  map indicator, polygons for zones) with the latitude / longitude, ArcGIS XY and MGRS of every
  feature as attributes — the same plan as a set of GIS layers.
- **Download → PNG** gives `gis-helper-plan-YYYY-MM-DD.zip`: the `1600×1000` picture
  (`gis-helper-plan-YYYY-MM-DD.png`), its `.pgw` world file, its `.prj` and a READ ME, with
  numbered pins and lettered spot circles that cross-reference the tables, a scale bar, a north
  arrow and the base map's attribution. It opens as a layer in any GIS.
- The picture frames every deployment, zone and the map indicator automatically —
  you do not have to zoom the map first.
- If the tile server refuses cross-origin tile reads (a browser security restriction
  that varies by provider), the export silently falls back to a **schematic plan** —
  a labelled coordinate grid with the same zones, pins and labels, minus the street
  imagery — and tells you which one you got. The on-screen map is never affected.
- Tiles for the export are requested **six at a time and retried up to three times**,
  because firing a few hundred at once just gets the server to throttle them and
  leaves blank patches on the sheet. If any tile still cannot be fetched, the caption
  and the status line both say how many, so a patchy base map is never mistaken for
  blank terrain.

#### Export options
A collapsible **Export options** group sits in the Download & Upload card, and the same controls
appear in the **Download** dialog — they are bound to one set of preferences, so the two places
can never disagree. Options are remembered in this browser.

| Option | Values | Notes |
| --- | --- | --- |
| **Frame** | All deployments, spots, zones & indicator · Whatever the map is showing · Deployments only · Spot points only · Zones only · Map indicator only | Chooses what the picture frames. Picking a preset with nothing in it tells you exactly what is missing instead of exporting a blank sheet. |
| **Map type** | Same as the map on screen · Standard · Satellite · Terrain · Humanitarian | The base map drawn into the file. The default follows whatever the live map is showing, and choosing another one never changes the map on screen. |
| **North facing** | North up · Rotate to fit | North up is the default. Rotate to fit computes the plan's principal axis and spins the sheet onto it, so a long or diagonal plan fills the frame; the north arrow follows and the caption states the applied angle. |
| **Map scale** | Auto · 1:5 000 · 1:10 000 · 1:25 000 · 1:50 000 · 1:100 000 and larger | A representative fraction, measured against the A4 landscape sheet the PDF is laid out on — at 1:25 000, 1 cm on the sheet is 250 m on the ground. **Auto** frames the whole plan and prints the scale it came out at; a fixed scale always wins, which on a tight plan means the picture crops it and the caption says so. The figure is printed on the sheet itself, under the scale bar. |
| **Scale bar** | Metric + imperial · Metric · Imperial · Hidden | Imperial uses feet and miles. |
| **Plan title** | free text | Prints in the PDF and report header, e.g. `Exercise Ironclad`. |
| **Plan date** | date | Prints in the PDF and report header, distinct from when the file was generated. |
| **Include** | Map · Scale bar · North arrow · Deployments · Spot Points · Zones | Shapes the PDF and the picture. A JSON download always carries everything, whatever is ticked. |
| **Georeferenced PNG** | on · off | Bundles the picture with its `.pgw` world file and `.prj` (EPSG:3857) in one `.zip`. On by default; untick it for the bare image. |

The title and date appear on the **sheet only** — they are not burned into the PNG. Like the theme
and custom unit types, export options are per-browser settings and are deliberately *not* part of
the shared session JSON, so they do not travel with an exported plan file.

### Other
- Five cards on the marking layer: coordinate input, dashboard, live cursor, then
  **Deployments**, **Spot points**, **Zones** and the **Download & Upload** card.
- Four themes (teal, violet, navy, amber) persisted across visits.
- A built-in **Guide** with real full-screen captures of every step, taken from the running app
  with that step's panel already open. Each one is clickable, opening the picture at full size.
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

1. Build your map, then press **Download** → **JSON** (or **Copy all data**).
2. Send the file however you like — email, drive, chat.
3. They open GIS Helper and press **Upload** (top bar), or drop the file onto the page.

If they already have markings on their map, they get asked whether to **merge** the
file alongside them or **replace** everything with it.

### Printing or sharing a picture

1. Build your map.
2. Press **Download** → **PDF** for a real `.pdf` sheet, or **PNG** for an image file.
   **Print report** in the sidebar does the same sheet through the browser's print dialog.

Both frame all your deployments, zones and the map indicator for you.

---

## Project structure

```
GIS-Helper/
├── index.html          # Markup, the About/Help modal, the type managers, download & upload
│                       # dialogs, the report sheet
├── style.css           # All styling, four themes as CSS custom properties, print rules
├── script.js           # Coordinate maths, map, marking layer (deployments, spot points,
│                       # zones), data layer, export + PDF + georeferencing engine
├── LICENSE             # MIT
└── Assets/
    ├── creator.jpg
    ├── creator-avatar.jpg
    └── guide/          # Full-screen captures used by the Guide tab (overview, steps, dialogs)
```

There are no other files. `index.html` is the entire application — no build step, no
package manager, no runtime dependencies beyond Leaflet from a CDN.

---

## The data file format

Handy if you want to generate or edit a plan programmatically. Pretty-printed JSON:

```json
{
  "version": 4,
  "exportedAt": "2026-10-03T12:00:00.000Z",
  "app": "GIS Helper",
  "customUnitTypes": [
    { "id": "custom-a1b2", "label": "Recon Team Alpha", "icons": ["drone"], "color": "#38BDF8", "builtin": false }
  ],
  "customSpotTypes": [
    { "id": "spot-z9boq5", "label": "Vehicle checkpoint", "icons": ["hazard"], "color": "#FFAA00", "builtin": false }
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
  "spotPoints": [
    {
      "id": "mv48sndh6dge",
      "type": "spot-z9boq5",
      "icon": "hazard",
      "color": "#FFAA00",
      "name": "Bridge 1",
      "details": "Two spans, observed 06:20.",
      "lat": 40.68925,
      "lon": -74.0445,
      "timestamp": 1767225600000
    }
  ],
  "zones": [
    {
      "id": "z9y8x7w6",
      "name": "Alpha Sector",
      "details": "Phase line — do not cross without clearance",
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

For a spot point, `type` is one of `obsn-pt`, `enemy-spot`, `own-spot`,
`waypoint`, `hazard`, `ref-pt`, or a `spot-…` id defined in `customSpotTypes`.
Spot points live under **`spotPoints`**; older files that named the list `spots`
are read too.

Everything except `vertices` (and `lat` / `lon` for positions) is optional.
Older files are accepted and missing fields are filled in safely, so files
from earlier versions still import — unknown unit types fall back to Company HQ,
unknown spot types fall back to Obsn Pt, spot points with no usable position are
skipped rather than dropped onto 0,0, and legacy icon names are mapped to their
modern equivalents.

---

## Privacy

- Your session is stored **only** in your own browser's `localStorage`.
- Nothing is uploaded anywhere. The app makes no requests to any server of its own.
- The only network calls are to public map tile servers, the
  [Nominatim](https://nominatim.openstreetmap.org/) geocoding API (place name
  lookup) and the Google Fonts stylesheet — each of which necessarily sees the
  coordinates you asked it about.
- **Printing, PNG and PDF export do re-fetch the map tiles** covering your plan, at the
  smallest zoom that frames it, purely to paint them onto the canvas. Nothing is
  sent anywhere; the requests go to the same public tile server that is already
  drawing your map.
- Georeferencing is worked out **entirely on your machine** from the export's own
  projector. The `.pgw`, `.prj` and READ ME are written in the browser; no coordinate is
  ever sent to a projection service.
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
