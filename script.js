/* ============================================================
   GIS Helper — coordinate engine + UI
   ------------------------------------------------------------
   • Latitude / Longitude   (DD + DMS)
   • MGRS / USNG grid       (6, 8, 10 digit)
   • ArcGIS XY              (UTM Easting / Northing)
   • Place name             (Nominatim geocoding)
   • Four glass themes
   • Switchable base layers
   • Help + About modals
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     1. WGS 84 CONSTANTS
     ========================================================== */
  const R_A   = 6378137.0;
  const R_F   = 1 / 298.257223563;
  const R_E2  = R_F * (2 - R_F);
  const R_EP2 = R_E2 / (1 - R_E2);
  const K0    = 0.9996;
  const D2R   = Math.PI / 180;
  const R2D   = 180 / Math.PI;

  const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
  const COLS  = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const ROWS  = 'ABCDEFGHJKLMNPQRSTUV';

  /* ==========================================================
     2. PROJECTION MATH
     ========================================================== */
  function meridianArc(phi) {
    const e2 = R_E2, e4 = e2 * e2, e6 = e4 * e2;
    return R_A * (
        (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi)
    );
  }

  function zoneFor(lat, lon) {
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) return 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0  && lon < 9)  return 31;
      if (lon >= 9  && lon < 21) return 33;
      if (lon >= 21 && lon < 33) return 35;
      if (lon >= 33 && lon < 42) return 37;
    }
    return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  }

  function latLonToUtm(lat, lon) {
    const zone = zoneFor(lat, lon);
    const lon0 = (zone - 1) * 6 - 180 + 3;

    const phi    = lat * D2R;
    const sinP   = Math.sin(phi);
    const cosP   = Math.cos(phi);
    const tanP   = Math.tan(phi);

    const N  = R_A / Math.sqrt(1 - R_E2 * sinP * sinP);
    const T  = tanP * tanP;
    const C  = R_EP2 * cosP * cosP;
    const Aq = (lon - lon0) * D2R * cosP;
    const M  = meridianArc(phi);

    const easting = K0 * N * (
        Aq
      + (1 - T + C) * Math.pow(Aq, 3) / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * R_EP2) * Math.pow(Aq, 5) / 120
    ) + 500000;

    let northing = K0 * (M + N * tanP * (
        Aq * Aq / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(Aq, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * R_EP2) * Math.pow(Aq, 6) / 720
    ));

    if (lat < 0) northing += 10000000;

    return { zone, hemisphere: lat >= 0 ? 'N' : 'S', easting, northing };
  }

  function utmToLatLon(easting, northing, zone, hemisphere) {
    const e1 = (1 - Math.sqrt(1 - R_E2)) / (1 + Math.sqrt(1 - R_E2));

    const x = easting - 500000;
    let   y = northing;
    if (String(hemisphere).toUpperCase() === 'S') y -= 10000000;

    const M  = y / K0;
    const mu = M / (R_A * (1 - R_E2 / 4 - 3 * R_E2 * R_E2 / 64 - 5 * Math.pow(R_E2, 3) / 256));

    const phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

    const sinP1 = Math.sin(phi1), cosP1 = Math.cos(phi1), tanP1 = Math.tan(phi1);

    const N1 = R_A / Math.sqrt(1 - R_E2 * sinP1 * sinP1);
    const T1 = tanP1 * tanP1;
    const C1 = R_EP2 * cosP1 * cosP1;
    const R1 = R_A * (1 - R_E2) / Math.pow(1 - R_E2 * sinP1 * sinP1, 1.5);
    const D  = x / (N1 * K0);

    const lat = phi1 - (N1 * tanP1 / R1) * (
        D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * R_EP2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * R_EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );

    const lonOffset = (
        D
      - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * R_EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cosP1;

    const lon0 = (zone - 1) * 6 - 180 + 3;

    return { lat: lat * R2D, lon: lon0 + lonOffset * R2D };
  }

  /* ==========================================================
     3. MGRS / USNG
     ========================================================== */
  function latLonToMgrs(lat, lon, digits) {
    if (lat < -80 || lat > 84) throw new Error('MGRS out of range');

    const u = latLonToUtm(lat, lon);
    const band = BANDS[Math.min(19, Math.floor((lat + 80) / 8))];

    const colSet = COLS[(u.zone - 1) % 3];
    const col    = colSet[Math.floor(u.easting / 100000) - 1];

    const rowOffset = (u.zone % 2 === 0) ? 5 : 0;
    const row = ROWS[(Math.floor(u.northing / 100000) + rowOffset) % 20];

    const gzd = u.zone + band;
    if (!digits) return `${gzd} ${col}${row}`;

    const scale = Math.pow(10, 5 - digits);
    const e = String(Math.floor((u.easting  % 100000) / scale)).padStart(digits, '0');
    const n = String(Math.floor((u.northing % 100000) / scale)).padStart(digits, '0');

    return `${gzd} ${col}${row} ${e} ${n}`;
  }

  function mgrsToLatLon(raw) {
    const m = String(raw).trim().toUpperCase()
      .match(/^(\d{1,2})\s*([C-X])\s*([A-Z]{2})\s*([\d\s]*)$/);
    if (!m) throw new Error('That does not look like a valid MGRS / USNG grid reference.');

    const zone      = parseInt(m[1], 10);
    const band      = m[2];
    const colLetter = m[3][0];
    const rowLetter = m[3][1];
    const digits    = m[4].replace(/\s+/g, '');

    if (zone < 1 || zone > 60) throw new Error('UTM zone must be between 1 and 60.');
    if (digits.length % 2 !== 0) throw new Error('The numeric part of a grid reference needs an even number of digits (6 or 8).');

    const precision = digits.length / 2;
    if (precision > 5) throw new Error('Only up to 10 digits (1 m precision) are supported.');

    const colIdx = COLS[(zone - 1) % 3].indexOf(colLetter);
    if (colIdx < 0) throw new Error(`Column letter "${colLetter}" is invalid for UTM zone ${zone}.`);

    const rowRaw = ROWS.indexOf(rowLetter);
    if (rowRaw < 0) throw new Error(`Row letter "${rowLetter}" is not a valid MGRS row letter.`);

    const rowOffset = (zone % 2 === 0) ? 5 : 0;
    const rowIdx    = (rowRaw - rowOffset + 20) % 20;

    const scale = Math.pow(10, 5 - precision);
    let easting  = (colIdx + 1) * 100000;
    let northing = rowIdx * 100000;

    if (precision > 0) {
      easting  += parseInt(digits.slice(0, precision), 10) * scale + scale / 2;
      northing += parseInt(digits.slice(precision), 10)    * scale + scale / 2;
    } else {
      easting  += 50000;
      northing += 50000;
    }

    const bandIdx = BANDS.indexOf(band);
    if (bandIdx < 0) throw new Error(`"${band}" is not a valid latitude band letter.`);

    const southLat = -80 + bandIdx * 8;
    const approx   = K0 * meridianArc(southLat * D2R) + (southLat < 0 ? 10000000 : 0);
    northing += 2000000 * Math.round((approx - northing) / 2000000);

    const hemisphere = band >= 'N' ? 'N' : 'S';
    const ll = utmToLatLon(easting, northing, zone, hemisphere);

    return { lat: ll.lat, lon: ll.lon, zone, hemisphere, easting, northing, precision };
  }

  /* ==========================================================
     4. INPUT PARSERS
     ========================================================== */
  const MGRS_TEST = /^\s*\d{1,2}\s*[C-X]\s*[A-Z]{2}\s*[\d\s]{0,13}$/i;

  function parseLatLon(input) {
    const norm = String(input).toUpperCase()
      .replace(/[°º'′’"″”,;/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const bare    = norm.replace(/[NSEW]/g, ' ');
    const nums    = bare.match(/-?\d+(?:\.\d+)?/g) || [];
    const letters = norm.match(/[NSEW]/g) || [];

    let latNums, lonNums;
    if (nums.length === 2) {
      latNums = [nums[0]]; lonNums = [nums[1]];
    } else if (nums.length === 6) {
      latNums = nums.slice(0, 3); lonNums = nums.slice(3, 6);
    } else return null;

    let latHemi = '', lonHemi = '';
    if (letters.length >= 2) { latHemi = letters[0]; lonHemi = letters[1]; }
    else if (letters.length === 1) {
      if ('NS'.indexOf(letters[0]) >= 0) latHemi = letters[0];
      else lonHemi = letters[0];
    }

    const lat = angleToDegrees(latNums, latHemi);
    const lon = angleToDegrees(lonNums, lonHemi);
    if (lat === null || lon === null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return { lat, lon };
  }

  function angleToDegrees(parts, hemi) {
    const d = parseFloat(parts[0]);
    if (isNaN(d)) return null;
    let deg = Math.abs(d);
    if (parts[1] !== undefined) deg += Math.abs(parseFloat(parts[1])) / 60;
    if (parts[2] !== undefined) deg += Math.abs(parseFloat(parts[2])) / 3600;
    const negative = d < 0 || hemi === 'S' || hemi === 'W';
    return negative ? -deg : deg;
  }

  function parseUtm(input, zoneHint) {
    let s = String(input).toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    let zone = null, hemi = 'N';

    const zm = s.match(/(?:^|[\s,])(\d{1,2})\s*([NS])(?=[\s,]|$)/);
    if (zm) { zone = parseInt(zm[1], 10); hemi = zm[2]; s = s.replace(zm[0], ' '); }

    if (zone === null && zoneHint && String(zoneHint).trim()) {
      const zh = String(zoneHint).toUpperCase().match(/(\d{1,2})\s*([NS])?/);
      if (zh) { zone = parseInt(zh[1], 10); if (zh[2]) hemi = zh[2]; }
    }

    const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 2) return null;

    return { zone, hemi, easting: nums[0], northing: nums[1] };
  }

  function detectFormat(raw) {
    const s = String(raw).trim();
    if (!s) return null;
    if (MGRS_TEST.test(s)) return 'mgrs';

    const nums = (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const looksAngular = /[°º'′’"″]/.test(s) || /[NSEW]/i.test(s);

    if (nums.length >= 2) {
      const a = Math.abs(nums[0]), b = Math.abs(nums[1]);
      const latLonOK = a <= 90 && b <= 180;
      const utmOK    = a >= 100000 && a <= 999999 && b >= 0 && b <= 10000000;
      if (latLonOK && (looksAngular || !utmOK)) return 'latlon';
      if (utmOK) return 'utm';
      if (latLonOK) return 'latlon';
    }
    return 'place';
  }

  /* ==========================================================
     5. FORMATTERS
     ========================================================== */
  const fmtInt = n => Math.round(n).toLocaleString('en-US');

  function fmtDD(lat, lon) {
    return `${Math.abs(lat).toFixed(6)}° ${lat >= 0 ? 'N' : 'S'}, ` +
           `${Math.abs(lon).toFixed(6)}° ${lon >= 0 ? 'E' : 'W'}`;
  }

  function toDMS(value, isLat) {
    const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs = Math.abs(value);
    const d   = Math.floor(abs);
    const mF  = (abs - d) * 60;
    const m   = Math.floor(mF);
    const sec = ((mF - m) * 60).toFixed(2);
    return `${d}°${String(m).padStart(2, '0')}'${String(sec).padStart(5, '0')}"${dir}`;
  }

  function fmtDMS(lat, lon) { return `${toDMS(lat, true)}  ${toDMS(lon, false)}`; }
  function fmtUtm(u) { return `${u.zone}${u.hemisphere}  ${fmtInt(u.easting)} E  ${fmtInt(u.northing)} N`; }

  /* ==========================================================
     6. THEME PICKER
     ========================================================== */
  const THEME_KEY = 'gis-helper-theme';
  const VALID_THEMES = ['teal', 'violet', 'navy', 'amber'];

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = VALID_THEMES.includes(saved) ? saved : 'teal';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeMenuState(theme);
  }

  function setTheme(name) {
    if (!VALID_THEMES.includes(name)) return;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem(THEME_KEY, name);
    updateThemeMenuState(name);
  }

  function updateThemeMenuState(name) {
    document.querySelectorAll('.theme-item').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === name);
    });
  }

  initTheme();

  const themeBtn  = document.getElementById('theme-btn');
  const themeMenu = document.getElementById('theme-menu');
  const themeWrap = document.getElementById('theme-picker-wrap');

  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeMenu.classList.toggle('open');
    themeBtn.classList.toggle('active', themeMenu.classList.contains('open'));
  });

  themeMenu.querySelectorAll('.theme-item').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
      themeMenu.classList.remove('open');
      themeBtn.classList.remove('active');
    });
  });

  document.addEventListener('click', (e) => {
    if (!themeWrap.contains(e.target)) {
      themeMenu.classList.remove('open');
      themeBtn.classList.remove('active');
    }
  });

  /* ==========================================================
     7. ABOUT MODAL (tabs: Overview / Guide / Creator)
     ========================================================== */
  const ABOUT_KEY = 'gis-helper-about-seen';

  const aboutModal    = document.getElementById('about-modal');
  const aboutBtn      = document.getElementById('about-btn');
  const aboutClose    = document.getElementById('about-close');
  const aboutCloseBtn = document.getElementById('about-close-btn');

  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const tabInk     = document.getElementById('tab-ink');

  /* Slides the accent underline under whichever tab is active */
  function moveTabInk() {
    const active = tabButtons.find(b => b.classList.contains('active'));
    if (!active || !tabInk) return;
    tabInk.style.left  = active.offsetLeft + 'px';
    tabInk.style.width = active.offsetWidth + 'px';
  }

  function selectTab(name) {
    tabButtons.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'panel-' + name);
    });

    moveTabInk();
  }

  tabButtons.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));

    // Left / right arrows cycle tabs, as expected for role="tablist"
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir  = e.key === 'ArrowRight' ? 1 : -1;
      const next = tabButtons[(i + dir + tabButtons.length) % tabButtons.length];
      selectTab(next.dataset.tab);
      next.focus();
    });
  });

  function openModal(modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    moveTabInk();
    const firstClose = modal.querySelector('.modal-close');
    if (firstClose) setTimeout(() => firstClose.focus(), 60);
  }

  function closeModal(modal) {
    modal.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) {
      document.body.style.overflow = '';
    }
  }

  aboutBtn.addEventListener('click', () => openModal(aboutModal));
  aboutClose.addEventListener('click', () => closeModal(aboutModal));
  aboutCloseBtn.addEventListener('click', () => closeModal(aboutModal));
  aboutModal.addEventListener('click', (e) => {
    if (e.target === aboutModal) closeModal(aboutModal);
  });

  /* ---- ESC closes the modal + the theme menu ---- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    /* The import prompt is a promise, so it needs settling rather than just hiding. */
    if (importModal && importModal.classList.contains('open')) settleImport(null);
    if (confirmModal && confirmModal.classList.contains('open')) settleConfirm(false);
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m));

    if (themeMenu.classList.contains('open')) {
      themeMenu.classList.remove('open');
      themeBtn.classList.remove('active');
    }
  });

  window.addEventListener('resize', moveTabInk);

  // Place the underline after first layout so it doesn't slide in from nowhere
  requestAnimationFrame(() => { moveTabInk(); if (tabInk) tabInk.classList.add('ready'); });

  // Auto-open the About window on the very first visit
  if (!localStorage.getItem(ABOUT_KEY)) {
    setTimeout(() => { openModal(aboutModal); localStorage.setItem(ABOUT_KEY, '1'); }, 700);
  }

  /* ==========================================================
     8. MAP
     ========================================================== */
  const START = { lat: 40.6892, lon: -74.0445 };

  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true
  }).setView([START.lat, START.lon], 13);

  /* Bottom-left is left to the markings legend, so the scale bar sits under
     the zoom buttons instead of landing on top of it. */
  L.control.zoom({ position: 'topleft' }).addTo(map);
  L.control.scale({ position: 'topleft', imperial: true, metric: true }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

  const baseLayers = {
    standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    }),
    humanitarian: L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors, Tiles style by <a href="https://www.hotosm.org/">HOT</a>'
    })
  };

  let currentLayerName = 'standard';
  baseLayers.standard.addTo(map);

  function setBaseLayer(name) {
    if (!baseLayers[name] || name === currentLayerName) return;
    map.removeLayer(baseLayers[currentLayerName]);
    baseLayers[name].addTo(map);
    currentLayerName = name;
    document.querySelectorAll('.layer-item').forEach(el => {
      el.classList.toggle('active', el.dataset.layer === name);
    });
    /* An open preview set to "same as the map on screen" has just changed. */
    schedulePreview();
  }

  const layerToggle = document.getElementById('layer-toggle');
  const layerMenu   = document.getElementById('layer-menu');
  const layerCtrl   = document.querySelector('.layer-ctrl');

  layerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    layerMenu.classList.toggle('open');
  });

  layerMenu.querySelectorAll('.layer-item').forEach(btn => {
    btn.addEventListener('click', () => {
      setBaseLayer(btn.dataset.layer);
      layerMenu.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!layerCtrl.contains(e.target)) layerMenu.classList.remove('open');
  });

  /* ==========================================================
     9. MARKER
     ========================================================== */
  /* Themed pin — colours come from CSS vars, so it follows the active theme */
  const markerIcon = L.divIcon({
    className: 'gis-marker',
    html:
      '<span class="gis-pin-halo"></span>' +
      '<svg class="gis-pin-svg" viewBox="0 0 24 32" aria-hidden="true">' +
        '<path class="gis-pin-body" d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20C24 5.373 18.627 0 12 0z"/>' +
        '<circle class="gis-pin-hole" cx="12" cy="12" r="4.6"/>' +
      '</svg>',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36]
  });

  let marker = null;

  /* Restart the drop-in animation on the pin every time a point is selected */
  function bouncePin() {
    const el = marker && marker.getElement();
    if (!el) return;
    el.classList.remove('gis-pin-bounce');
    void el.offsetWidth;           // force reflow so the animation replays
    el.classList.add('gis-pin-bounce');
  }

  function placeMarker(lat, lon, label) {
    if (!marker) {
      marker = L.marker([lat, lon], { draggable: true, icon: markerIcon, zIndexOffset: 1000 }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        commitPoint(p.lat, p.lng, null, false);
      });
    } else marker.setLatLng([lat, lon]);
    if (label) marker.bindPopup(`<b>${label}</b>`).openPopup();
    bouncePin();
  }

  /* ==========================================================
     9b. MY LOCATION
     ----------------------------------------------------------
     The locate button moves the tactical pin to the user and lets the
     dashboard/grid refs follow it. "Follow" additionally keeps a
     watchPosition running so the pin keeps up as the user walks or
     drives, re-centring the map whenever the position drifts away.
     ========================================================== */
  const locateBtn = document.getElementById('locate-btn');
  const followBtn = document.getElementById('follow-btn');

  let geoWatch = null;          // watchPosition handle while following
  let geoBusy = false;          // a request is already in flight
  let geoCircle = null;         // accuracy halo
  let following = false;        // follow mode latched on

  const GEO_OPTS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

  /* Some browsers expose a `geolocation` property with no methods at all, so
     check for the function we actually call rather than the property alone. */
  function geoSupported() {
    return !!(navigator.geolocation &&
              typeof navigator.geolocation.getCurrentPosition === 'function');
  }

  function setLocateBusy(on) {
    geoBusy = on;
    locateBtn.classList.toggle('busy', on);
    locateBtn.disabled = on;
  }

  /* The accuracy halo is drawn under the pin and kept in step with it. */
  function showAccuracy(latlng, accuracy) {
    if (!accuracy || !isFinite(accuracy)) return;
    if (!geoCircle) {
      geoCircle = L.circle(latlng, {
        radius: accuracy,
        className: 'geo-accuracy',
        color: '#1a73e8',
        weight: 1,
        opacity: 0.55,
        fillColor: '#1a73e8',
        fillOpacity: 0.14,
        interactive: false
      }).addTo(map);
    } else {
      geoCircle.setLatLng(latlng);
      geoCircle.setRadius(accuracy);
    }
  }

  function clearAccuracy() {
    if (geoCircle) { map.removeLayer(geoCircle); geoCircle = null; }
  }

  function geoFail(err) {
    const msg = !err ? 'Could not read your location.'
      : err.code === 1 ? 'Location permission denied — enable it in your browser.'
      : err.code === 2 ? 'Your position is unavailable right now.'
      : err.code === 3 ? 'Location request timed out.'
      : 'Could not read your location.';
    setStatus(msg, 'err');
    stopFollow();
  }

  /* Drop the pin on the user. `fly` centres the map on the first fix only,
     so follow mode does not yank the view on every update. */
  function applyUserLocation(lat, lon, accuracy, fly) {
    showAccuracy([lat, lon], accuracy);
    commitPoint(lat, lon, 'My location', fly);
    /* commitPoint opens a popup; keep the halo beneath the pin. */
    if (geoCircle) geoCircle.bringToBack();
  }

  function stopFollow() {
    if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
    if (following) {
      following = false;
      followBtn.classList.remove('active');
      followBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function locateOnce(fly) {
    if (!geoSupported()) { setStatus('This browser has no location support.', 'err'); return; }
    if (geoBusy) return;
    setLocateBusy(true);
    setStatus('Finding your location…', 'warn');

    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocateBusy(false);
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        applyUserLocation(lat, lon, accuracy, fly !== false);
        setStatus(following ? 'Following your location' : 'Located · ' + Math.round(accuracy) + ' m accuracy', 'ok');
      },
      err => { setLocateBusy(false); geoFail(err); },
      GEO_OPTS
    );
  }

  locateBtn.addEventListener('click', () => {
    /* Pressing locate again stops an active follow, like a toggle. */
    if (following) { stopFollow(); setStatus('Follow mode off', 'warn'); return; }
    locateOnce(true);
  });

  followBtn.addEventListener('click', () => {
    if (following) { stopFollow(); clearAccuracy(); setStatus('Follow mode off', 'warn'); return; }
    if (!geoSupported()) { setStatus('This browser has no location support.', 'err'); return; }

    following = true;
    followBtn.classList.add('active');
    followBtn.setAttribute('aria-pressed', 'true');
    setLocateBusy(true);
    setStatus('Following your location…', 'warn');

    /* The first fix centres the map; later ones only re-centre on drift. */
    let firstFix = true;

    geoWatch = navigator.geolocation.watchPosition(
      pos => {
        setLocateBusy(false);
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        applyUserLocation(lat, lon, accuracy, firstFix);
        firstFix = false;
        /* Re-centre only once the user has actually moved out of view. */
        const b = map.getBounds();
        if (!b.contains([lat, lon])) map.setView([lat, lon], map.getZoom(), { animate: true });
        setStatus('Following · ' + Math.round(accuracy) + ' m accuracy', 'ok');
      },
      err => { setLocateBusy(false); geoFail(err); },
      GEO_OPTS
    );
  });

  /* ==========================================================
     10. DOM HELPERS
     ========================================================== */
  const $ = id => document.getElementById(id);

  function setStatus(msg, kind) {
    const s = $('status');
    s.textContent = msg;
    s.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  /* ==========================================================
     11. RENDERING
     ========================================================== */
  const state = { lat: null, lon: null, name: '', json: null };

  /* The map indicator position, kept separately from `state` so it can be
     restored on load without re-running a geocode. */
  let savedIndicator = null;

  function renderDashboard(lat, lon, name) {
    const u = latLonToUtm(lat, lon);

    let m6, m8, m10;
    try {
      m6  = latLonToMgrs(lat, lon, 3);
      m8  = latLonToMgrs(lat, lon, 4);
      m10 = latLonToMgrs(lat, lon, 5);
    } catch (e) {
      m6 = m8 = m10 = 'Out of MGRS range (±80° / 84°)';
    }

    const dd  = fmtDD(lat, lon);
    const dms = fmtDMS(lat, lon);
    const utm = fmtUtm(u);

    setText('o-latlon', dd);
    setText('o-dms',    dms);
    setText('o-utm',    utm);
    setText('o-m6',     m6);
    setText('o-m8',     m8);
    setText('o-m10',    m10);

    if (name !== undefined && name !== null) state.name = name;
    $('place').textContent = state.name || 'Dropped pin';

    state.lat = lat;
    state.lon = lon;
    state.json = {
      name: state.name || null,
      latitude: +lat.toFixed(8),
      longitude: +lon.toFixed(8),
      decimalDegrees: dd,
      dms: dms,
      arcgisXY_UTM: {
        zone: u.zone,
        hemisphere: u.hemisphere,
        easting: Math.round(u.easting * 100) / 100,
        northing: Math.round(u.northing * 100) / 100
      },
      mgrs6digit: m6,
      mgrs8digit: m8,
      mgrs10digit: m10
    };
  }

  function previewPoint(lat, lon) {
    const u = latLonToUtm(lat, lon);
    let m6 = '—', m8 = '—';
    try { m6 = latLonToMgrs(lat, lon, 3); m8 = latLonToMgrs(lat, lon, 4); } catch (e) {}

    const latlonStr = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    const utmStr    = `${u.zone}${u.hemisphere} ${fmtInt(u.easting)}E ${fmtInt(u.northing)}N`;

    setText('l-latlon', latlonStr); setText('l-utm', utmStr); setText('l-m6', m6); setText('l-m8', m8);
    setText('h-latlon', latlonStr); setText('h-utm', utmStr); setText('h-m6', m6); setText('h-m8', m8);
  }

  function commitPoint(lat, lon, name, fly) {
    renderDashboard(lat, lon, name);
    placeMarker(lat, lon, name || 'Selected point');
    if (fly) map.flyTo([lat, lon], Math.max(map.getZoom(), 13), { duration: 0.8 });

    /* Record the indicator as the restorable location. Deferred until the
       reverse geocode below settles so the name is captured too. */
    savedIndicator = { lat: +lat.toFixed(8), lon: +lon.toFixed(8), name: name || state.name || '' };
    saveMarkings();
    updateDataStatus();

    if (!name) {
      reverseGeocode(lat, lon).then(found => {
        if (found && Math.abs(state.lat - lat) < 1e-9 && Math.abs(state.lon - lon) < 1e-9) {
          state.name = found;
          $('place').textContent = found;
          if (state.json) state.json.name = found;
          marker.bindPopup(`<b>${found}</b>`);
          if (savedIndicator) { savedIndicator.name = found; saveMarkings(); updateDataStatus(); }
        }
      });
    }
  }

  /* ==========================================================
     12. GEOCODING
     ========================================================== */
  async function geocode(query) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Geocoding service unavailable.');
    const data = await res.json();
    if (!data.length) throw new Error(`No place found matching "${query}".`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
  }

  async function reverseGeocode(lat, lon) {
    try {
      const url = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=' + lat + '&lon=' + lon;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const d = await res.json();
      return d.display_name || null;
    } catch (e) { return null; }
  }

  /* ==========================================================
     13. QUERY HANDLER
     ========================================================== */
  async function runQuery() {
    const raw = $('query').value.trim();
    if (!raw) { setStatus('Type a location first.', 'warn'); $('query').focus(); return; }

    let fmt = $('format').value;
    if (fmt === 'auto') fmt = detectFormat(raw) || 'place';

    setStatus('Working…');

    try {
      let lat, lon, name = null;

      if (fmt === 'latlon') {
        const p = parseLatLon(raw);
        if (!p) throw new Error('Could not read those latitude / longitude values.');
        lat = p.lat; lon = p.lon;
      } else if (fmt === 'mgrs') {
        const p = mgrsToLatLon(raw);
        lat = p.lat; lon = p.lon;
        name = `MGRS ${String(raw).trim().toUpperCase()}`;
      } else if (fmt === 'utm') {
        const p = parseUtm(raw, $('zone').value);
        if (!p) throw new Error('Could not read those XY coordinates.');
        if (p.zone === null) {
          $('zone').focus();
          throw new Error('Please supply the UTM zone for these XY coordinates (e.g. 18N).');
        }
        const ll = utmToLatLon(p.easting, p.northing, p.zone, p.hemi);
        lat = ll.lat; lon = ll.lon;
        name = `UTM ${p.zone}${p.hemi} ${fmtInt(p.easting)}E ${fmtInt(p.northing)}N`;
      } else {
        const g = await geocode(raw);
        lat = g.lat; lon = g.lon; name = g.name;
      }

      if (!isFinite(lat) || !isFinite(lon)) throw new Error('The result was not a valid coordinate.');

      commitPoint(lat, lon, name, true);
      setStatus(`Found · ${fmt.toUpperCase()}`, 'ok');
    } catch (err) {
      setStatus(err.message, 'err');
    }
  }

  /* ==========================================================
     14. EVENT WIRING
     ========================================================== */
  $('go').addEventListener('click', runQuery);
  $('query').addEventListener('keydown', e => { if (e.key === 'Enter') runQuery(); });

  $('query').addEventListener('input', () => {
    if ($('format').value !== 'auto') return;
    const raw = $('query').value.trim();
    if (!raw) { setStatus('Ready'); return; }
    const f = detectFormat(raw);
    const labels = { latlon: 'Lat/Lon', mgrs: 'MGRS grid', utm: 'ArcGIS XY', place: 'Place name' };
    setStatus('Detected: ' + (labels[f] || '—'));
  });

  $('copy').addEventListener('click', async () => {
    if (!state.json) { setStatus('Nothing to copy yet.', 'warn'); return; }
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.json, null, 2));
      setStatus('Copied to clipboard', 'ok');
    } catch (e) {
      setStatus('Clipboard blocked by the browser', 'err');
    }
  });

  /* ---- Click any readout value to copy just that field ---- */
  document.querySelectorAll('.readout li').forEach(li => {
    li.tabIndex = 0;
    li.title = 'Click to copy this value';

    const doCopy = async () => {
      const value = li.querySelector('b') ? li.querySelector('b').textContent.trim() : '';
      if (!value || value === '—') { setStatus('Nothing to copy yet.', 'warn'); return; }
      try {
        await navigator.clipboard.writeText(value);
        li.classList.add('copied');
        setTimeout(() => li.classList.remove('copied'), 900);
        setStatus('Copied · ' + value, 'ok');
      } catch (e) {
        setStatus('Clipboard blocked by the browser', 'err');
      }
    };

    li.addEventListener('click', doCopy);
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doCopy(); }
    });
  });

  let rafQueued = false;
  let lastLatLng = null;

  map.on('mousemove', e => {
    lastLatLng = e.latlng;
    if (rafQueued) return;
    rafQueued = true;
    requestAnimationFrame(() => {
      rafQueued = false;
      if (lastLatLng) previewPoint(lastLatLng.lat, lastLatLng.lng);
    });
  });

  map.on('click', e => {
    if (isDrawingZone) {
      addZoneVertex(e.latlng);
      return;
    }
    commitPoint(e.latlng.lat, e.latlng.lng, null, false);
    setStatus('Point captured from map', 'ok');
  });

  /* ============================================================
     15. DEPLOYMENT ICONS & UNIT TYPES
     ------------------------------------------------------------
     Six tactical unit types, each with its own icon set.
     Special Task deliberately offers three shapes (star, diamond,
     circle) so ad-hoc task elements stay visually distinct.
     ============================================================ */
  const ICON_SVG = {
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V3.5"/><path d="M5 4.5h13.5l-2.6 4 2.6 4H5z" fill="currentColor" fill-opacity=".22"/></svg>',
    armour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15.5h20"/><path d="M4 15.5V12h3.5L9 8.5h6l1.5 3.5H20v3.5"/><rect x="9.5" y="4.4" width="5" height="4.1" rx="1"/><path d="M12 4.4V2"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="18" r="2.2"/></svg>',
    antenna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5.6" r="2.1" fill="currentColor" stroke="none"/><path d="M12 7.7V21"/><path d="M7 21l5-11.5L17 21"/><path d="M4.5 21h15"/><path d="M6.4 8.6a7.6 7.6 0 0 0 0 8"/><path d="M17.6 8.6a7.6 7.6 0 0 1 0 8"/></svg>',
    drone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="5" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4"/><path d="m7.1 7.1 2.1 2.1M16.9 7.1l-2.1 2.1M7.1 16.9l2.1-2.1M16.9 16.9l-2.1-2.1"/></svg>',
    detective: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5c2.9 0 5.2 2.2 5.2 5.1v1.4H6.8V9.6C6.8 6.7 9.1 4.5 12 4.5Z"/><path d="M3.6 11h16.8"/><circle cx="14.6" cy="17" r="3.8"/><path d="m17.4 19.8 3.1 3.1"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>',
    diamond: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 2.4 21.6 12 12 21.6 2.4 12z"/></svg>',
    circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/></svg>'
  };

  const ICON_LABEL = {
    flag: 'Flag',
    armour: 'Armoured Vehicle',
    antenna: 'Antenna / Signal Tower',
    drone: 'Drone',
    detective: 'Detective',
    star: 'Star',
    diamond: 'Diamond',
    circle: 'Circle'
  };

  /* The six fixed unit types. These ship with the tool and cannot be edited,
     but they are listed alongside user types in the manager. */
  const BUILTIN_UNIT_TYPES = {
    'company-hq':      { id: 'company-hq',      label: 'Company HQ',        icons: ['flag'],                      color: '#00F5D4', builtin: true },
    'support-platoon': { id: 'support-platoon', label: 'Support Platoon',   icons: ['armour'],                    color: '#F59E0B', builtin: true },
    'sigint-platoon':  { id: 'sigint-platoon',  label: 'SIGINT Platoon',    icons: ['antenna'],                   color: '#38BDF8', builtin: true },
    'isr-platoon':     { id: 'isr-platoon',     label: 'ISR Platoon',       icons: ['drone'],                     color: '#A78BFA', builtin: true },
    'humint-platoon':  { id: 'humint-platoon',  label: 'HUMINT Platoon',    icons: ['detective'],                 color: '#F472B6', builtin: true },
    'special-task':    { id: 'special-task',    label: 'Special Task',      icons: ['star', 'diamond', 'circle'],  color: '#EF4444', builtin: true }
  };

  const DEFAULT_TYPE = 'company-hq';

  /* User-defined unit types, persisted separately so upgrades never clobber them */
  const CUSTOM_TYPES_KEY = 'gis-helper-custom-types-v1';
  const CUSTOM_ID_PREFIX = 'custom-';
  let customUnitTypes = [];

  function isCustomTypeId(id) {
    return typeof id === 'string' && id.indexOf(CUSTOM_ID_PREFIX) === 0;
  }

  function newCustomTypeId() {
    let id;
    do {
      id = CUSTOM_ID_PREFIX + Math.random().toString(36).slice(2, 8);
    } while (customUnitTypes.some(t => t.id === id));
    return id;
  }

  /* Custom types win over built-ins so a user's own naming is never shadowed */
  function getUnitType(id) {
    if (!id) return null;
    if (isCustomTypeId(id)) {
      const found = customUnitTypes.find(t => t.id === id);
      if (found) return found;
      return null;
    }
    return BUILTIN_UNIT_TYPES[id] || null;
  }

  /* Never returns null — falls back to the default type */
  function resolveType(id) {
    return getUnitType(id) || BUILTIN_UNIT_TYPES[DEFAULT_TYPE];
  }

  function builtinTypeList() {
    return Object.keys(BUILTIN_UNIT_TYPES).map(k => BUILTIN_UNIT_TYPES[k]);
  }

  /* Older saved data used generic type names — map them onto the built-in set */
  const LEGACY_TYPE_MAP = {
    individual: 'company-hq',
    group: 'support-platoon',
    section: 'sigint-platoon',
    platoon: 'isr-platoon',
    humint: 'humint-platoon',
    sigint: 'sigint-platoon',
    isr: 'isr-platoon'
  };

  /* Older saved data used single-character icon keys */
  const LEGACY_ICON_MAP = {
    soldier: 'circle',
    truck: 'armour',
    tank: 'armour',
    heli: 'drone',
    cross: 'detective',
    target: 'circle',
    radio: 'antenna',
    medic: 'detective',
    supply: 'star'
  };

  function unitLabel(type) {
    const mapped = LEGACY_TYPE_MAP[type];
    const t = getUnitType(type) || getUnitType(mapped);
    if (t) return t.label;
    return String(type || 'Unit').charAt(0).toUpperCase() + String(type || 'Unit').slice(1);
  }

  /* Normalise a stored deployment so old records keep rendering correctly */
  function normaliseDeployment(d) {
    let t = getUnitType(d.type);

    if (!t) {
      const mapped = LEGACY_TYPE_MAP[d.type];
      t = getUnitType(mapped) || BUILTIN_UNIT_TYPES[DEFAULT_TYPE];
      d.type = t.id;
    }

    const allowed = t.icons;
    if (allowed.indexOf(d.icon) === -1) {
      d.icon = LEGACY_ICON_MAP[d.icon] && allowed.indexOf(LEGACY_ICON_MAP[d.icon]) !== -1
        ? LEGACY_ICON_MAP[d.icon]
        : allowed[0];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(String(d.color || ''))) {
      d.color = t.color;
    }
    return d;
  }

  function getDefaultIconForType(type) {
    return resolveType(type).icons[0];
  }

  /* ---- Custom type store -------------------------------------------- */

  /* Keeps only fields we recognise, with a guaranteed icon list and valid colour */
  function sanitiseCustomType(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const label = String(raw.label == null ? '' : raw.label).trim().slice(0, 40);
    if (!label) return null;

    const icons = Array.isArray(raw.icons)
      ? raw.icons.filter(k => Object.prototype.hasOwnProperty.call(ICON_SVG, k)).slice(0, 3)
      : [];
    if (!icons.length) icons.push('circle');

    const color = /^#[0-9a-fA-F]{6}$/.test(String(raw.color || '')) ? raw.color : '#38BDF8';

    let id = isCustomTypeId(raw.id) ? raw.id : newCustomTypeId();
    if (customUnitTypes.some(t => t.id === id)) id = newCustomTypeId();

    return { id, label, icons, color, builtin: false };
  }

  function saveCustomTypes() {
    try {
      localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(customUnitTypes));
    } catch (e) {}
  }

  function loadCustomTypes() {
    try {
      const raw = localStorage.getItem(CUSTOM_TYPES_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      customUnitTypes = data.map(sanitiseCustomType).filter(Boolean);
    } catch (e) {}
  }

  function customTypeInUse(id) {
    return markings.deployments.filter(d => d.type === id).length;
  }

  /* Create or update a user-defined type. Returns the stored record. */
  function upsertCustomType(fields) {
    const clean = sanitiseCustomType(fields);
    if (!clean) return null;

    const existing = fields.id ? customUnitTypes.findIndex(t => t.id === fields.id) : -1;
    if (existing >= 0) clean.id = customUnitTypes[existing].id;

    if (existing >= 0) customUnitTypes[existing] = clean;
    else customUnitTypes.push(clean);

    saveCustomTypes();
    return clean;
  }

  function deleteCustomType(id) {
    const idx = customUnitTypes.findIndex(t => t.id === id);
    if (idx === -1) return { removed: false, moved: 0 };

    const affected = customTypeInUse(id);
    const fallback = BUILTIN_UNIT_TYPES[DEFAULT_TYPE];

    // Re-point orphaned deployments at the fallback so nothing is silently lost
    markings.deployments.forEach(d => {
      if (d.type !== id) return;
      d.type = fallback.id;
      d.icon = fallback.icons[0];
      d.color = fallback.color;
    });

    customUnitTypes.splice(idx, 1);
    saveCustomTypes();

    return { removed: true, moved: affected };
  }

  /* Merges types carried inside an imported markings file */
  function mergeCustomTypes(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    list.forEach(raw => {
      const clean = sanitiseCustomType(raw);
      if (!clean) return;
      // Skip if this exact id or label already exists, so re-importing is idempotent
      if (customUnitTypes.some(t => t.id === clean.id || t.label.toLowerCase() === clean.label.toLowerCase())) return;
      customUnitTypes.push(clean);
      added++;
    });
    if (added) saveCustomTypes();
    return added;
  }

  function svgForIcon(iconKey) {
    return ICON_SVG[iconKey] || ICON_SVG.circle;
  }

  /* Shared badge markup — colour is driven by the --badge custom property */
  function buildBadgeHTML(iconKey, color, small) {
    return '<div class="deploy-badge' + (small ? ' deploy-badge-sm' : '') + '" ' +
      'style="--badge:' + color + ';--badge-soft:' + color + '22;' +
      '--badge-glow:' + color + '66;--badge-ring:' + color + '15;">' +
      svgForIcon(iconKey) +
      '</div>';
  }

  function buildDeployIconHTML(iconKey, color) {
    return '<div class="deploy-marker-wrap" style="cursor:pointer;">' +
      buildBadgeHTML(iconKey, color, false) +
      '</div>';
  }

  function deployIconOptions(color, iconKey) {
    return L.divIcon({
      className: 'deploy-marker-icon',
      html: buildDeployIconHTML(iconKey, color),
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      popupAnchor: [0, -24]
    });
  }

  /* ============================================================
     16. STATE - deployments, zones
     ============================================================ */
  const MARKINGS_KEY = 'gis-helper-markings-v1';

  const markings = {
    deployments: [],
    zones: []
  };

  let deployLayerGroup = L.layerGroup().addTo(map);
  let zoneLayerGroup   = L.layerGroup().addTo(map);
  let drawLayer        = L.layerGroup().addTo(map);

  let isDrawingZone = false;
  let drawVertices  = [];
  let drawPolyLine  = null;
  let doubleClickZoomEnabled = true;  // track whether double-click zoom is active

  /* ============================================================
     17. DEPLOYMENTS
     ============================================================ */
  function renderDeployMarker(d) {
    normaliseDeployment(d);
    const icon = deployIconOptions(d.color, d.icon);
    const m = L.marker([d.lat, d.lon], { icon, draggable: true, zIndexOffset: 1000 }).addTo(deployLayerGroup);

    const typeLabel = unitLabel(d.type);
    const parts = [];
    if (d.commander) parts.push(d.commander);
    if (d.troops)    parts.push(d.troops + ' troops');
    if (d.vehicles)  parts.push('Vehicles: ' + d.vehicles);
    if (d.arms)      parts.push('Arms: ' + d.arms);
    if (d.equip)     parts.push('Equip: ' + d.equip);

    const popupHTML =
      '<div style="font-family:var(--font);min-width:200px;">' +
        '<div style="font-size:14px;font-weight:700;color:' + d.color + ';margin-bottom:6px;">' +
          typeLabel + (d.commander ? ' \u00B7 ' + d.commander : '') +
        '</div>' +
        (parts.length ? '<div style="font-size:11.5px;color:#B4C5D0;line-height:1.6;margin-bottom:6px;">' + parts.join('<br>') + '</div>' : '') +
        '<div style="font-size:11px;color:#8899A6;border-top:1px solid rgba(255,255,255,.08);padding-top:5px;">' +
          '\uD83D\uDCC2 ' + d.lat.toFixed(5) + ', ' + d.lon.toFixed(5) +
        '</div>' +
        '<button class="map-edit-btn" data-kind="deployment" data-id="' + d.id + '" ' +
          'style="margin-top:8px;width:100%;padding:6px 10px;border-radius:8px;cursor:pointer;' +
          'font-size:11.5px;font-weight:600;color:#062A2A;background:' + d.color + ';border:none;">' +
          'Edit deployment' +
        '</button>' +
      '</div>';

    m.bindPopup(popupHTML);

    m.on('dragend', () => {
      const p = m.getLatLng();
      d.lat = +p.lat.toFixed(8);
      d.lon = +p.lng.toFixed(8);
      saveMarkings();
      renderDeployList();
    });

    return m;
  }

  function addDeploymentFromForm() {
    if (!state.lat || !state.lon) {
      setStatus('Click the map or search a location first.', 'warn');
      return;
    }

    const type      = $('deploy-type').value;
    const icon      = $('deploy-icon').value;
    const color     = $('deploy-color').value;
    const commander = $('deploy-commander').value.trim();
    const troops    = parseInt($('deploy-troops').value, 10) || 0;
    const vehicles  = $('deploy-vehicles').value.trim();
    const arms      = $('deploy-arms').value.trim();
    const equip     = $('deploy-equip').value.trim();

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type, icon, color,
      commander,
      troops, vehicles: vehicles || '',
      arms, equip,
      lat: +state.lat.toFixed(8),
      lon: +state.lon.toFixed(8),
      timestamp: Date.now()
    };

    markings.deployments.push(entry);
    renderDeployMarker(entry);
    saveMarkings();
    renderDeployList();
    updateDataStatus();

    setStatus('Deployment placed: ' + (entry.commander || unitLabel(type)), 'ok');
    clearDeployForm();
  }

  function removeDeployment(id) {
    markings.deployments = markings.deployments.filter(d => d.id !== id);
    redrawDeployments();
    saveMarkings();
    renderDeployList();
    updateDataStatus();
  }

  function clearDeployForm() {
    $('deploy-type').value = DEFAULT_TYPE;
    $('deploy-color').value = BUILTIN_UNIT_TYPES[DEFAULT_TYPE].color;
    $('deploy-color-hex').value = BUILTIN_UNIT_TYPES[DEFAULT_TYPE].color;
    $('deploy-commander').value = '';
    $('deploy-troops').value = 0;
    $('deploy-vehicles').value = '';
    $('deploy-arms').value = '';
    $('deploy-equip').value = '';
    populateIconOptions();
    updateDeployPreview();
  }

  /* Rebuild the icon dropdown so it only offers icons valid for this unit type */
  function populateIconOptions() {
    const type = $('deploy-type').value;
    const allowed = resolveType(type).icons;
    const sel = $('deploy-icon');
    const previous = sel.value;

    sel.innerHTML = allowed.map(key =>
      '<option value="' + key + '">' + (ICON_LABEL[key] || key) + '</option>'
    ).join('');

    if (allowed.indexOf(previous) !== -1) sel.value = previous;
    else sel.value = allowed[0];
  }

  /* Applies the unit type's default colour only when the user has not picked one */
  function applyTypeColour() {
    const type = $('deploy-type').value;
    const preset = resolveType(type).color;
    $('deploy-color').value = preset;
    $('deploy-color-hex').value = preset;
  }

  function updateDeployPreview() {
    const type = $('deploy-type').value;
    const icon = $('deploy-icon').value;
    const color = $('deploy-color').value;
    const u = resolveType(type);

    const preview = $('deploy-preview');
    if (preview) preview.innerHTML = buildBadgeHTML(icon, color, false);

    const hint = $('deploy-preview-hint');
    if (hint) {
      hint.innerHTML = '<b>' + u.label + '</b> \u00B7 ' +
        (ICON_LABEL[icon] || icon) + ' icon' +
        (u.icons.length > 1 ? ' (' + u.icons.length + ' available)' : '');
    }
  }

  function redrawDeployments() {
    deployLayerGroup.clearLayers();
    markings.deployments.forEach(d => renderDeployMarker(d));
    renderLegend();
  }

  /* Small inline glyphs for the list row controls */
  const UI_GLYPH = {
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  /* Tracks which row is being dragged, and whether a drag actually happened
     (so a drag does not also fire the row's click-to-fly-to handler). */
  let dragSrcId = null;
  let dragDidMove = false;
  let autoScrollTimer = null;
  let autoScrollTracker = null;
  let lastDragY = null;

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* Move a deployment to a new index, clamping to the list bounds */
  function moveDeploymentTo(id, targetIndex) {
    const list = markings.deployments;
    const from = list.findIndex(d => d.id === id);
    if (from === -1) return false;

    const to = Math.max(0, Math.min(list.length - 1, targetIndex));
    if (to === from) return false;

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return true;
  }

  /* Persist a new order and refresh everything that follows it */
  function commitOrder(message) {
    saveMarkings();
    renderDeployList();
    renderLegend();
    if (message) setStatus(message, 'ok');
  }

  function reorderDeployments(srcId, targetId, insertAfter) {
    const list = markings.deployments;
    const to = list.findIndex(d => d.id === targetId);
    if (to === -1) return;

    // Removing the source first shifts everything after it down by one
    const insertAt = insertAfter ? to + 1 : to;
    const from = list.findIndex(d => d.id === srcId);
    if (from < insertAt) {
      if (moveDeploymentTo(srcId, insertAt - 1)) commitOrder('Order updated');
    } else {
      if (moveDeploymentTo(srcId, insertAt)) commitOrder('Order updated');
    }
  }

  /* Alt + ArrowUp / ArrowDown reorders without a mouse */
  function nudgeDeployment(id, dir) {
    const i = markings.deployments.findIndex(d => d.id === id);
    if (i === -1) return;
    if (!moveDeploymentTo(id, i + dir)) return;

    commitOrder();
    const next = $('deploy-list').querySelector('.deploy-item[data-id="' + id + '"]');
    if (next) next.focus();
  }

  function duplicateDeployment(id) {
    const idx = markings.deployments.findIndex(d => d.id === id);
    if (idx === -1) return;

    const src = markings.deployments[idx];
    const copy = Object.assign({}, src, {
      id: newId(),
      commander: src.commander ? src.commander + ' (copy)' : '',
      timestamp: Date.now()
    });

    markings.deployments.splice(idx + 1, 0, copy);
    renderDeployMarker(copy);
    saveMarkings();
    renderDeployList();
    renderLegend();
    updateDataStatus();

    const next = $('deploy-list').querySelector('.deploy-item[data-id="' + copy.id + '"]');
    if (next) next.focus();

    setStatus('Duplicated: ' + (copy.commander || unitLabel(copy.type)), 'ok');
  }

  function renderDeployList() {
    const el = $('deploy-list');
    if (!markings.deployments.length) {
      el.innerHTML = '<div class="deploy-empty">No deployments marked yet. Place one on the map to begin.</div>';
      return;
    }

    el.innerHTML = markings.deployments.map((d, i) => {
      normaliseDeployment(d);
      const name = d.commander || unitLabel(d.type);
      const meta = [];
      if (d.troops)   meta.push(d.troops + ' troops');
      if (d.vehicles) meta.push(d.vehicles);
      meta.push(d.lat.toFixed(4) + ', ' + d.lon.toFixed(4));
      return (
        '<div class="deploy-item" data-id="' + d.id + '" draggable="true" tabindex="0" role="listitem"' +
        ' aria-label="' + (i + 1) + '. ' + name + ' — ' + unitLabel(d.type) + '">' +
          '<span class="deploy-grip" aria-hidden="true" title="Drag to reorder">' + UI_GLYPH.grip + '</span>' +
          '<div class="deploy-icon-mark" style="background:' + d.color + '22;border-color:' + d.color + ';color:' + d.color + ';">' +
            svgForIcon(d.icon) +
          '</div>' +
          '<div class="deploy-info">' +
            '<div class="deploy-name">' + name + '</div>' +
            '<div class="deploy-meta">' + unitLabel(d.type) + ' \u00B7 ' + meta.join(' \u00B7 ') + '</div>' +
          '</div>' +
          '<div class="deploy-row-actions">' +
            '<button class="deploy-edit" title="Edit details" aria-label="Edit ' + name + '" data-id="' + d.id + '">' + UI_GLYPH.edit + '</button>' +
            '<button class="deploy-dup" title="Duplicate" aria-label="Duplicate ' + name + '" data-id="' + d.id + '">' + UI_GLYPH.copy + '</button>' +
            '<button class="deploy-del" title="Remove" aria-label="Remove ' + name + '" data-id="' + d.id + '">' + UI_GLYPH.trash + '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    wireDeployRowInteractions(el);
  }

  function wireDeployRowInteractions(el) {
    const items = Array.from(el.querySelectorAll('.deploy-item'));

    /* ---- drag to reorder ---- */
    items.forEach(item => {
      item.addEventListener('dragstart', e => {
        dragSrcId = item.dataset.id;
        dragDidMove = false;
        item.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          // Firefox will not start a drag unless some data is set
          try { e.dataTransfer.setData('text/plain', dragSrcId); } catch (err) {}
        }
        startDragAutoScroll(el);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        clearDropMarkers(el);
        stopDragAutoScroll();
        // Let the click handler know a drag just finished, then reset
        setTimeout(() => { dragDidMove = false; dragSrcId = null; }, 0);
      });

      item.addEventListener('dragover', e => {
        if (!dragSrcId || item.dataset.id === dragSrcId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (!dragDidMove) dragDidMove = true;

        const after = isBelowMidpoint(e, item);
        clearDropMarkers(el);
        item.classList.add(after ? 'drop-after' : 'drop-before');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drop-before', 'drop-after');
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        const src = dragSrcId;
        const after = isBelowMidpoint(e, item);
        clearDropMarkers(el);
        if (src && src !== item.dataset.id) reorderDeployments(src, item.dataset.id, after);
        dragSrcId = null;
      });
    });

    /* ---- click a row to fly to it ---- */
    items.forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.deploy-del') || e.target.closest('.deploy-dup') ||
            e.target.closest('.deploy-edit') || e.target.closest('.deploy-grip')) return;
        if (dragDidMove) return;
        const d = markings.deployments.find(x => x.id === item.dataset.id);
        if (d) map.flyTo([d.lat, d.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
      });

      item.addEventListener('keydown', e => {
        if (e.target.closest('button')) return;

        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          nudgeDeployment(item.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const d = markings.deployments.find(x => x.id === item.dataset.id);
          if (d) map.flyTo([d.lat, d.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
        }
      });
    });

    /* ---- duplicate ---- */
    el.querySelectorAll('.deploy-dup').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        duplicateDeployment(btn.dataset.id);
      });
    });

    /* ---- edit details ---- */
    el.querySelectorAll('.deploy-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openEditDeployment(btn.dataset.id);
      });
    });

    /* ---- remove ---- */
    el.querySelectorAll('.deploy-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeDeployment(btn.dataset.id);
      });
    });
  }

  function isBelowMidpoint(e, el) {
    const rect = el.getBoundingClientRect();
    return (e.clientY - rect.top) > rect.height / 2;
  }

  function clearDropMarkers(el) {
    el.querySelectorAll('.deploy-item').forEach(i => i.classList.remove('drop-before', 'drop-after'));
  }

  /* Nudges the list up or down when a drag reaches the edge of the visible area */
  function startDragAutoScroll(el) {
    stopDragAutoScroll();

    const track = ev => { lastDragY = ev.clientY; };
    document.addEventListener('dragover', track);
    autoScrollTracker = track;

    autoScrollTimer = setInterval(() => {
      if (!dragSrcId) { stopDragAutoScroll(); return; }
      if (typeof lastDragY !== 'number') return;

      const rect = el.getBoundingClientRect();
      const EDGE = 26;
      if (lastDragY < rect.top + EDGE)          el.scrollTop -= 9;
      else if (lastDragY > rect.bottom - EDGE)  el.scrollTop += 9;
    }, 40);
  }

  function stopDragAutoScroll() {
    if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    if (autoScrollTracker) { document.removeEventListener('dragover', autoScrollTracker); autoScrollTracker = null; }
  }

  /* ============================================================
     18. ZONES
     ============================================================ */
  function formatArea(sqMetres) {
    if (sqMetres < 1000)      return sqMetres.toFixed(0) + ' m\u00B2';
    if (sqMetres < 1000000)  return (sqMetres / 1000).toFixed(1) + ' km\u00B2';
    return (sqMetres / 1000000).toFixed(2) + ' km\u00B2';
  }

  function polygonAreaM2(latLngs) {
    if (latLngs.length < 3) return 0;
    const R = 6371000;
    const pts = latLngs.map(ll => {
      const lat = ll.lat * Math.PI / 180;
      const lng = ll.lng * Math.PI / 180;
      return [R * lng * Math.cos(lat), R * lat];
    });
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i][0] * pts[j][1];
      area -= pts[j][0] * pts[i][1];
    }
    return Math.abs(area) / 2;
  }

  function startZoneDrawing() {
    if (isDrawingZone) return;
    isDrawingZone = true;
    drawVertices = [];
    drawLayer.clearLayers();
    map.getContainer().classList.add('map-drawing-active');
    // Disable Leaflet's double-click zoom while drawing
    if (map.doubleClickZoom) {
      try { map.doubleClickZoom.disable(); } catch (e) {}
      doubleClickZoomEnabled = false;
    }
    $('zone-draw-btn').textContent = '\u23F9 Finish zone';
    setStatus('Click on the map to add zone vertices. Press Stop drawing or click Finish zone to complete.', 'warn');
  }

  function stopZoneDrawing(finish) {
    if (!isDrawingZone) return;
    isDrawingZone = false;
    map.getContainer().classList.remove('map-drawing-active');
    $('zone-draw-btn').textContent = '\u2B21 Start drawing zone';
    // Re-enable double-click zoom if it was disabled while drawing
    if (!doubleClickZoomEnabled && map.doubleClickZoom) {
      try { map.doubleClickZoom.enable(); } catch (e) {}
      doubleClickZoomEnabled = true;
    }
    if (finish && drawVertices.length >= 3) {
      commitZone();
    }
    drawLayer.clearLayers();
    drawVertices = [];
    drawPolyLine = null;
  }

  function addZoneVertex(ll) {
    drawVertices.push({ lat: ll.lat, lng: ll.lng });

    const vm = L.circleMarker([ll.lat, ll.lng], {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: $('zone-color').value,
      fillOpacity: 1
    }).addTo(drawLayer);

    if (drawPolyLine) drawLayer.removeLayer(drawPolyLine);
    const latlngs = drawVertices.map(v => [v.lat, v.lng]);
    drawPolyLine = L.polyline(latlngs, {
      color: $('zone-color').value,
      weight: 2.5,
      dashArray: '6 6',
      fill: false
    }).addTo(drawLayer);

    const area = polygonAreaM2(drawVertices);
    setStatus('Vertex ' + drawVertices.length + ' \u00B7 area ' + formatArea(area), 'warn');
  }

  function commitZone() {
    if (drawVertices.length < 3) {
      setStatus('A zone needs at least 3 vertices.', 'err');
      stopZoneDrawing(false);
      return;
    }

    const color   = $('zone-color').value;
    const name    = $('zone-name').value.trim() || 'Zone ' + (markings.zones.length + 1);
    const details = $('zone-details').value.trim();
    const opacity = parseFloat($('zone-opacity').value) || 0.35;
    const area    = polygonAreaM2(drawVertices);

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      details,
      color,
      opacity,
      vertices: drawVertices.map(v => ({ lat: +v.lat.toFixed(8), lng: +v.lng.toFixed(8) })),
      areaM2: +area.toFixed(0),
      timestamp: Date.now()
    };

    markings.zones.push(entry);
    drawZonePoly(entry);

    saveMarkings();
    renderZoneList();
    renderLegend();
    updateDataStatus();
    setStatus('Zone saved: ' + name + ' (' + formatArea(area) + ')', 'ok');
    $('zone-name').value = '';
    $('zone-details').value = '';
  }

  function zonePopupHTML(z) {
    return (
      '<div style="font-family:var(--font);min-width:170px;">' +
        '<div style="font-size:14px;font-weight:700;color:' + z.color + ';">' + z.name + '</div>' +
        (z.details
          ? '<div style="font-size:11.5px;color:#B4C5D0;line-height:1.6;margin-top:5px;white-space:pre-wrap;">' +
              esc(z.details) + '</div>'
          : '') +
        '<div style="font-size:11.5px;color:#B4C5D0;margin-top:4px;">\uD83D\uDCC2 ' + formatArea(z.areaM2) + '</div>' +
        '<button class="map-edit-btn" data-kind="zone" data-id="' + z.id + '" ' +
          'style="margin-top:8px;width:100%;padding:6px 10px;border-radius:8px;cursor:pointer;' +
          'font-size:11.5px;font-weight:600;color:#062A2A;background:' + z.color + ';border:none;">' +
          'Edit zone' +
        '</button>' +
      '</div>'
    );
  }

  /* Draws one stored zone onto the layer group. Kept in one place so an edit
     only has to re-run it to refresh the polygon and its popup. */
  function drawZonePoly(z) {
    const poly = L.polygon((z.vertices || []).map(v => [v.lat, v.lng]), {
      color: z.color,
      weight: 2.5,
      fillColor: z.color,
      fillOpacity: z.opacity
    }).addTo(zoneLayerGroup);

    poly.bindPopup(zonePopupHTML(z));
    return poly;
  }

  function redrawZones() {
    zoneLayerGroup.clearLayers();
    markings.zones.forEach(drawZonePoly);
    renderLegend();
  }

  function removeZone(id) {
    markings.zones = markings.zones.filter(z => z.id !== id);
    redrawZones();
    saveMarkings();
    renderZoneList();
    updateDataStatus();
  }

  async function clearAllZones() {
    const n = markings.zones.length;
    if (!n) return;

    const ok = await askConfirm({
      title: 'Clear all zones?',
      subtitle: 'Every zone on the map is removed.',
      html:
        '<p>This removes <b>' + n + ' zone' + (n === 1 ? '' : 's') + '</b> from the map and from this browser.</p>' +
        '<p>Deployments are not affected.</p>',
      confirmLabel: 'Clear ' + n + ' zone' + (n === 1 ? '' : 's')
    });
    if (!ok) return;

    markings.zones = [];
    zoneLayerGroup.clearLayers();
    saveMarkings();
    renderZoneList();
    renderLegend();
    updateDataStatus();
    setStatus('All zones cleared.', 'warn');
  }

  function renderZoneList() {
    const el = $('zone-list');
    if (!markings.zones.length) {
      el.innerHTML = '<div class="zone-empty">No zones drawn yet.</div>';
      return;
    }

    el.innerHTML = markings.zones.map(z => (
      '<div class="zone-item" data-id="' + z.id + '">' +
        '<div class="zone-icon-mark" style="background:' + z.color + '33;border:2px solid ' + z.color + ';">' +
          '\u25A1' +
        '</div>' +
        '<div class="zone-info">' +
          '<div class="zone-name">' + z.name + '</div>' +
          (z.details ? '<div class="zone-details" title="' + esc(z.details) + '">' + esc(z.details) + '</div>' : '') +
          '<div class="zone-meta">' + formatArea(z.areaM2) + ' \u00B7 ' + z.vertices.length + ' vertices</div>' +
        '</div>' +
        '<div class="zone-row-actions">' +
          '<button class="zone-edit" title="Edit details" aria-label="Edit ' + z.name + '" data-id="' + z.id + '">' + UI_GLYPH.edit + '</button>' +
          '<button class="zone-del" title="Remove" aria-label="Remove ' + z.name + '" data-id="' + z.id + '">\u00D7</button>' +
        '</div>' +
      '</div>'
    )).join('');

    el.querySelectorAll('.zone-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.zone-del') || e.target.closest('.zone-edit')) return;
        const id = item.dataset.id;
        const z = markings.zones.find(x => x.id === id);
        if (z) {
          const center = z.vertices.reduce((s, v) => ({ lat: s.lat + v.lat, lng: s.lng + v.lng }), { lat: 0, lng: 0 });
          center.lat /= z.vertices.length;
          center.lng /= z.vertices.length;
          map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
        }
      });
    });

    el.querySelectorAll('.zone-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeZone(btn.dataset.id);
      });
    });

    el.querySelectorAll('.zone-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditZone(btn.dataset.id);
      });
    });
  }

  /* ============================================================
     EDIT A PLACED MARKING
     ============================================================
     One dialog edits either a deployment or a zone. Fields that only make
     sense for one of the two are hidden rather than disabled, so the dialog
     never shows a control that would be ignored on save. */

  const editModal    = $('edit-modal');
  /* What is being edited: 'deployment' or 'zone', plus the stored id. */
  let editTarget     = null;

  /* Type <select> markup, shared by the placement form and the editor. */
  function typeOptionsHTML() {
    let html = builtinTypeList().map(t =>
      '<option value="' + t.id + '">' + t.label + '</option>'
    ).join('');

    if (customUnitTypes.length) {
      html += '<optgroup label="Your types">' + customUnitTypes.map(t =>
        '<option value="' + t.id + '">' + t.label + '</option>'
      ).join('') + '</optgroup>';
    }
    return html;
  }

  /* Rebuild the editor's icon list for the chosen type */
  function refreshEditIcons() {
    const sel = $('edit-icon');
    const allowed = resolveType($('edit-type').value).icons;
    const previous = sel.value;
    sel.innerHTML = allowed.map(key =>
      '<option value="' + key + '">' + (ICON_LABEL[key] || key) + '</option>'
    ).join('');
    sel.value = allowed.indexOf(previous) !== -1 ? previous : allowed[0];
  }

  function updateEditPreview() {
    const color = $('edit-color').value;
    const name  = $('edit-name').value.trim() || 'No name given';
    const isZone = editTarget && editTarget.kind === 'zone';

    if (isZone) {
      /* A zone has no unit type, so the preview is just its fill and name. */
      $('edit-preview').innerHTML =
        '<div style="width:26px;height:26px;border-radius:6px;background:' + color +
        ';border:2px solid ' + color + ';"></div>';
      $('edit-preview-hint').innerHTML = '<b>' + name + '</b>';
      return;
    }

    const icon = $('edit-icon').value;
    $('edit-preview').innerHTML = buildBadgeHTML(icon, color, false);
    $('edit-preview-hint').innerHTML = [
      '<b>' + resolveType($('edit-type').value).label + '</b>',
      (ICON_LABEL[icon] || icon) + ' icon',
      name
    ].join(' \u00B7 ');
  }

  /* Shows or hides the field groups that belong to one kind of marking.
     The stylesheet hides both groups by default, so the shown one needs an
     explicit display value rather than being reset back to the default. */
  function setEditMode(kind) {
    const isZone = kind === 'zone';

    editModal.querySelectorAll('.edit-only-zone, .edit-only-deploy').forEach(el => {
      const show = el.classList.contains('edit-only-zone') ? isZone : !isZone;
      el.style.display = show ? (el.classList.contains('edit-grid') ? 'grid' : 'block') : 'none';
    });

    $('edit-title').textContent = isZone ? 'Edit zone' : 'Edit deployment';
    $('edit-subtitle').textContent = isZone
      ? 'Rename the zone or change how it is drawn on the map.'
      : 'Change the unit, its details, or where it sits in the list.';
    $('edit-name-label').textContent = isZone ? 'Zone name' : 'Commander';
    $('edit-name').placeholder = isZone ? 'e.g. Alpha Sector' : 'Name / callsign';
  }

  function openEditDeployment(id) {
    const d = markings.deployments.find(x => x.id === id);
    if (!d) return;
    normaliseDeployment(d);

    editTarget = { kind: 'deployment', id };
    setEditMode('deployment');

    $('edit-type').innerHTML = typeOptionsHTML();
    $('edit-type').value = d.type;
    refreshEditIcons();
    $('edit-icon').value = d.icon;
    $('edit-color').value = d.color;
    $('edit-color-hex').value = d.color;
    $('edit-name').value = d.commander || '';
    $('edit-troops').value = d.troops || 0;
    $('edit-vehicles').value = d.vehicles || '';
    $('edit-arms').value = d.arms || '';
    $('edit-equip').value = d.equip || '';
    updateEditPreview();

    openModal(editModal);
    setTimeout(() => $('edit-name').focus(), 80);
  }

  function openEditZone(id) {
    const z = markings.zones.find(x => x.id === id);
    if (!z) return;

    editTarget = { kind: 'zone', id };
    setEditMode('zone');

    /* Zones have no unit type or icon, so only the fill, the name and the
       free-text details apply. */
    $('edit-color').value = z.color;
    $('edit-color-hex').value = z.color;
    $('edit-opacity').value = z.opacity;
    $('edit-opacity-val').textContent = Number(z.opacity).toFixed(2);
    $('edit-name').value = z.name;
    $('edit-details').value = z.details || '';
    updateEditPreview();

    openModal(editModal);
    setTimeout(() => { $('edit-name').focus(); $('edit-name').select(); }, 80);
  }

  function closeEditModal() {
    closeModal(editModal);
    editTarget = null;
  }

  function saveEdit() {
    if (!editTarget) return;

    const color = $('edit-color').value;
    const name  = $('edit-name').value.trim();

    if (editTarget.kind === 'zone') {
      const z = markings.zones.find(x => x.id === editTarget.id);
      if (!z) { closeEditModal(); return; }

      z.name    = name || z.name;
      z.details = $('edit-details').value.trim();
      z.color   = color;
      z.opacity = parseFloat($('edit-opacity').value) || 0.35;

      redrawZones();
      saveMarkings();
      renderZoneList();
      updateDataStatus();
      closeEditModal();
      setStatus('Zone updated: ' + z.name, 'ok');
      return;
    }

    const d = markings.deployments.find(x => x.id === editTarget.id);
    if (!d) { closeEditModal(); return; }

    d.type      = $('edit-type').value;
    d.icon      = $('edit-icon').value;
    d.color     = color;
    d.commander = name;
    d.troops    = parseInt($('edit-troops').value, 10) || 0;
    d.vehicles  = $('edit-vehicles').value.trim();
    d.arms      = $('edit-arms').value.trim();
    d.equip     = $('edit-equip').value.trim();

    redrawDeployments();
    saveMarkings();
    renderDeployList();
    updateDataStatus();
    closeEditModal();
    setStatus('Deployment updated: ' + (d.commander || unitLabel(d.type)), 'ok');
  }

  /* ---- editor wiring ---- */
  $('edit-close').addEventListener('click', closeEditModal);
  $('edit-cancel-btn').addEventListener('click', closeEditModal);
  $('edit-save-btn').addEventListener('click', saveEdit);
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  $('edit-type').addEventListener('change', () => { refreshEditIcons(); updateEditPreview(); });
  $('edit-icon').addEventListener('change', updateEditPreview);
  $('edit-color').addEventListener('input', () => {
    $('edit-color-hex').value = $('edit-color').value;
    updateEditPreview();
  });
  $('edit-color-hex').addEventListener('input', () => {
    const v = $('edit-color-hex').value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      $('edit-color').value = v;
      updateEditPreview();
    }
  });
  $('edit-opacity').addEventListener('input', () => {
    $('edit-opacity-val').textContent = parseFloat($('edit-opacity').value).toFixed(2);
  });
  $('edit-name').addEventListener('input', updateEditPreview);

  /* Enter saves, matching the other dialogs' forms. */
  editModal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveEdit();
    }
  });

  /* The edit buttons inside Leaflet popups are created on demand, so they are
     handled by delegation rather than wired when the popup opens. */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.map-edit-btn');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.kind === 'zone') openEditZone(btn.dataset.id);
    else openEditDeployment(btn.dataset.id);
  });

  /* ============================================================
     CLEAR ALL DEPLOYMENTS AND ZONES
     ============================================================ */
  async function clearAllMarkings() {
    if (isDrawingZone) stopZoneDrawing(false);

    const dep = markings.deployments.length;
    const zon = markings.zones.length;
    const count = dep + zon;
    if (!count) {
      setStatus('There is nothing to clear.', 'warn');
      return;
    }

    const counts = [];
    if (dep) counts.push('<span><b>' + dep + '</b> deployment' + (dep === 1 ? '' : 's') + '</span>');
    if (zon) counts.push('<span><b>' + zon + '</b> zone' + (zon === 1 ? '' : 's') + '</span>');

    const ok = await askConfirm({
      title: 'Clear all operational data?',
      subtitle: 'This cannot be undone.',
      html:
        '<p>Every deployment and zone is removed from the map, from the sidebar lists and from this browser.</p>' +
        '<div class="confirm-counts">' + counts.join('') + '</div>',
      note: 'Your <b>map indicator</b> and <b>custom unit types</b> are kept.',
      confirmLabel: 'Clear everything'
    });
    if (!ok) return;

    markings.deployments = [];
    markings.zones = [];
    drawLayer.clearLayers();
    drawVertices = [];
    redrawDeployments();
    redrawZones();
    saveMarkings();
    renderDeployList();
    renderZoneList();
    updateDataStatus();
    setStatus('Cleared all deployments and zones.', 'warn');
  }

  $('data-clear-all-btn').addEventListener('click', clearAllMarkings);
  /* The same action is offered on the map itself, in the readout panel. */
  $('map-clear-all-btn').addEventListener('click', clearAllMarkings);

  /* ============================================================
     19. LEGEND
     ============================================================ */
  let legendEl = null;

  function renderLegend() {
    if (legendEl) {
      legendEl.remove();
      legendEl = null;
    }
    const hasMarkings = markings.deployments.length || markings.zones.length;
    if (!hasMarkings) return;

    legendEl = L.control({ position: 'bottomleft' });
    legendEl.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend');
      let html = '<h4>Markings</h4><ul>';

      markings.deployments.slice(0, 12).forEach(d => {
        normaliseDeployment(d);
        const label = (d.commander || unitLabel(d.type)) + (d.troops ? ' (' + d.troops + ')' : '');
        html += '<li>' +
          '<span class="legend-icon" style="color:' + d.color + ';">' + svgForIcon(d.icon) + '</span>' +
          '<span class="legend-swatch" style="background:' + d.color + ';"></span>' +
          '<span>' + label + '</span>' +
        '</li>';
      });

      if (markings.deployments.length > 12)
        html += '<li><span style="color:var(--muted);font-style:italic;">+' + (markings.deployments.length - 12) + ' more\u2026</span></li>';

      markings.zones.forEach(z => {
        html += '<li>' +
          '<span class="legend-swatch" style="background:' + z.color + '66;border:1px solid ' + z.color + ';"></span>' +
          '<span>' + z.name + '</span>' +
        '</li>';
      });

      html += '</ul>';
      div.innerHTML = html;
      return div;
    };
    legendEl.addTo(map);
  }

  /* ============================================================
     20. LOCAL SAVE / LOAD
     ============================================================ */
  /* Every persistence path (browser save, JSON export, clipboard copy) goes
     through this one builder, so a file, the clipboard and localStorage can
     never drift apart in shape. */
  function buildSessionPayload() {
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      app: 'GIS Helper',
      customUnitTypes: customUnitTypes,
      indicator: validIndicator(savedIndicator)
        ? { lat: savedIndicator.lat, lon: savedIndicator.lon, name: savedIndicator.name || null }
        : null,
      deployments: markings.deployments,
      zones: markings.zones
    };
  }

  function validIndicator(ind) {
    return !!ind && isFinite(ind.lat) && isFinite(ind.lon) &&
           ind.lat >= -90 && ind.lat <= 90 && ind.lon >= -180 && ind.lon <= 180;
  }

  function hasAnyData() {
    return markings.deployments.length > 0 ||
           markings.zones.length > 0 ||
           validIndicator(savedIndicator);
  }

  function saveMarkings() {
    try { localStorage.setItem(MARKINGS_KEY, JSON.stringify(buildSessionPayload())); } catch (e) {}
  }

  function loadMarkingsFromStorage() {
    try {
      const raw = localStorage.getItem(MARKINGS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Array.isArray(data.deployments)) markings.deployments = data.deployments.map(normaliseDeployment);
      if (Array.isArray(data.zones))       markings.zones = data.zones;
      if (validIndicator(data.indicator)) {
        savedIndicator = { lat: +data.indicator.lat, lon: +data.indicator.lon, name: data.indicator.name || '' };
      }
      return true;
    } catch (e) { return false; }
  }

  /* Move the map to the restored indicator. Only used on load/import, never
     during a normal merge, so a merge never yanks the map out from under you. */
  function applyIndicator() {
    if (!validIndicator(savedIndicator)) return false;
    commitPoint(savedIndicator.lat, savedIndicator.lon, savedIndicator.name || 'Restored location', false);
    map.setView([savedIndicator.lat, savedIndicator.lon], map.getZoom());
    return true;
  }

  function applyMarkingsToMap() {
    redrawDeployments();
    redrawZones();
    renderDeployList();
    renderZoneList();
    updateDataStatus();
  }

  function updateDataStatus() {
    /* Every change to the plan lands here, so this is the one place the open
       preview needs telling that its picture is stale. */
    previewPlanRev++;
    schedulePreview();

    const statusEl = $('data-status');
    const textEl   = $('data-status-text');
    const count    = markings.deployments.length + markings.zones.length;
    if (count === 0 && !validIndicator(savedIndicator)) {
      statusEl.classList.remove('has-data');
      textEl.textContent = 'No saved data';
    } else {
      statusEl.classList.add('has-data');
      const parts = [];
      if (validIndicator(savedIndicator)) parts.push('map indicator');
      if (count) parts.push(count + ' marking' + (count === 1 ? '' : 's'));
      textEl.textContent = parts.join(' + ') + ' stored in this browser';
    }
  }

  /* ============================================================
     21. EXPORT / IMPORT
     ============================================================ */
  function exportMarkingsFile() {
    if (!hasAnyData()) {
      setStatus('Nothing to export \u2014 add some markings first.', 'warn');
      return;
    }
    const blob = new Blob([JSON.stringify(buildSessionPayload(), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'gis-helper-data-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Data exported as JSON file.', 'ok');
  }

  /* Copy the whole session to the clipboard. The async Clipboard API is blocked
     on file:// in some browsers, so fall back to a hidden textarea + execCommand. */
  async function copyAllData() {
    if (!hasAnyData()) {
      setStatus('Nothing to copy \u2014 add some markings first.', 'warn');
      return;
    }
    const text = JSON.stringify(buildSessionPayload(), null, 2);
    const done = msg => setStatus(msg, 'ok');

    try {
      await navigator.clipboard.writeText(text);
      return done('All data copied to clipboard (' + text.length + ' chars).');
    } catch (e) { /* fall through to the legacy path */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done('All data copied to clipboard (' + text.length + ' chars).');
    } catch (e) { /* fall through to the warning below */ }

    setStatus('Clipboard blocked by the browser \u2014 use Export JSON instead.', 'warn');
  }

  /* ---- import mode prompt (merge vs replace) ---- */
  const importModal = document.getElementById('import-modal');
  let importResolver = null;

  function askImportMode(fileName, counts) {
    return new Promise(resolve => {
      importResolver = resolve;
      $('import-file-name').textContent = fileName;
      $('import-summary').innerHTML =
        '<span><b>' + counts.deployments + '</b> deployment' + (counts.deployments === 1 ? '' : 's') + '</span>' +
        '<span><b>' + counts.zones + '</b> zone' + (counts.zones === 1 ? '' : 's') + '</span>' +
        '<span><b>' + (counts.indicator ? '1' : '0') + '</b> map indicator</span>';
      openModal(importModal);
    });
  }

  function settleImport(choice) {
    if (importModal.classList.contains('open')) closeModal(importModal);
    const r = importResolver;
    importResolver = null;
    if (r) r(choice);
  }

  $('import-merge-btn').addEventListener('click',   () => settleImport('merge'));
  $('import-replace-btn').addEventListener('click', () => settleImport('replace'));
  $('import-cancel-btn').addEventListener('click',  () => settleImport(null));
  $('import-close').addEventListener('click',       () => settleImport(null));
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) settleImport(null);
  });

  /* ---- confirmation prompt (replaces confirm()) ----
     Same promise shape as the import prompt, so every way out of the dialog -
     the buttons, the overlay, Escape - settles the promise and the calling
     code never waits on a dialog that has already gone. */
  const confirmModal    = $('confirm-modal');
  let confirmResolver   = null;

  function askConfirm(opts) {
    return new Promise(resolve => {
      /* A second click would orphan the first promise, so cancel that one. */
      if (confirmResolver) settleConfirm(false);
      confirmResolver = resolve;
      $('confirm-title').textContent    = opts.title;
      $('confirm-subtitle').textContent = opts.subtitle || 'This action cannot be undone.';
      $('confirm-message').innerHTML    = opts.html;
      $('confirm-ok-btn').textContent   = opts.confirmLabel || 'Confirm';
      $('confirm-note').innerHTML       = opts.note || '';
      $('confirm-note').style.display   = opts.note ? '' : 'none';
      openModal(confirmModal);
      setTimeout(() => $('confirm-cancel-btn').focus(), 80);
    });
  }

  function settleConfirm(ok) {
    if (confirmModal.classList.contains('open')) closeModal(confirmModal);
    const r = confirmResolver;
    confirmResolver = null;
    if (r) r(ok);
  }

  $('confirm-ok-btn').addEventListener('click',    () => settleConfirm(true));
  $('confirm-cancel-btn').addEventListener('click', () => settleConfirm(false));
  $('confirm-close').addEventListener('click',     () => settleConfirm(false));
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) settleConfirm(false);
  });

  function importMarkingsFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid file format.');
      } catch (err) {
        setStatus('Could not read that file: ' + err.message, 'err');
        return;
      }

      const deployments = Array.isArray(data.deployments) ? data.deployments : [];
      const zones       = Array.isArray(data.zones)       ? data.zones       : [];
      const indicator   = validIndicator(data.indicator)  ? data.indicator   : null;

      if (!deployments.length && !zones.length && !indicator) {
        setStatus('That file has no deployments, zones or map indicator to import.', 'warn');
        return;
      }

      /* Only ask when there is actually something on screen to merge with. */
      let mode = 'merge';
      if (hasAnyData()) {
        mode = await askImportMode(file.name, {
          deployments: deployments.length,
          zones: zones.length,
          indicator: !!indicator
        });
        if (!mode) { setStatus('Import cancelled.', 'warn'); return; }
      }

      // Register any custom unit types the file carries before reading deployments,
      // so deployments referencing them resolve to the right label / icon / colour
      const addedTypes = mergeCustomTypes(data.customUnitTypes);

      if (mode === 'replace') {
        markings.deployments = [];
        markings.zones = [];
      }

      deployments.forEach(d => {
        if (!d.id) d.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        normaliseDeployment(d);
      });
      markings.deployments = markings.deployments.concat(deployments);

      zones.forEach(z => {
        if (!z.id) z.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      });
      markings.zones = markings.zones.concat(zones);

      /* Merge keeps your current map position; replace adopts the file's. */
      if (indicator && mode === 'replace') {
        savedIndicator = { lat: +indicator.lat, lon: +indicator.lon, name: indicator.name || '' };
        applyIndicator();
      }

      applyMarkingsToMap();
      saveMarkings();
      renderTypeSelect();
      populateIconOptions();
      updateDeployPreview();

      setStatus(
        (mode === 'replace' ? 'Replaced' : 'Imported') + ' with ' +
        deployments.length + ' deployment' + (deployments.length === 1 ? '' : 's') + ' and ' +
        zones.length + ' zone' + (zones.length === 1 ? '' : 's') +
        (mode === 'replace' && indicator ? ' \u00B7 map indicator restored' : '') +
        (addedTypes ? ' \u00B7 ' + addedTypes + ' custom type' + (addedTypes > 1 ? 's' : '') + ' added' : '') + '.', 'ok');
    };
    reader.readAsText(file);
  }

  /* ============================================================
     22. UI WIRING
     ============================================================ */
  const deployToggle = $('deploy-toggle');
  const zoneToggle   = $('zone-toggle');
  const deployCard   = $('deploy-card');
  const zoneCard     = $('zone-card');
  const dataCard     = $('data-card');

  function togglePanel(btn, card) {
    const isOpen = card.classList.contains('open');
    [deployCard, zoneCard, dataCard].forEach(c => c.classList.remove('open'));
    deployToggle.classList.remove('active');
    zoneToggle.classList.remove('active');
    if (!isOpen) {
      card.classList.add('open');
      btn.classList.add('active');
    }
  }

  deployToggle.addEventListener('click', () => togglePanel(deployToggle, deployCard));
  zoneToggle.addEventListener('click',   () => togglePanel(zoneToggle, zoneCard));

  $('deploy-add-btn').addEventListener('click', addDeploymentFromForm);
  $('deploy-clear-btn').addEventListener('click', clearDeployForm);

  $('deploy-type').addEventListener('change', () => {
    populateIconOptions();
    applyTypeColour();
    updateDeployPreview();
  });
  $('deploy-icon').addEventListener('change', updateDeployPreview);

  function syncColor(input, hexInput) {
    input.addEventListener('input', () => {
      hexInput.value = input.value;
      if (input === $('deploy-color')) updateDeployPreview();
    });
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        input.value = v;
        if (input === $('deploy-color')) updateDeployPreview();
      }
    });
  }
  syncColor($('deploy-color'), $('deploy-color-hex'));
  syncColor($('zone-color'),   $('zone-color-hex'));

  $('zone-draw-btn').addEventListener('click', () => {
    if (isDrawingZone) {
      if (drawVertices.length >= 3) {
        commitZone();
      } else {
        setStatus('Need at least 3 vertices for a zone.', 'warn');
      }
      stopZoneDrawing(false);
    } else {
      startZoneDrawing();
    }
  });

  $('zone-stop-btn').addEventListener('click', () => stopZoneDrawing(false));
  $('zone-clear-all-btn').addEventListener('click', clearAllZones);

  $('zone-opacity').addEventListener('input', () => {
    $('zone-opacity-val').textContent = parseFloat($('zone-opacity').value).toFixed(2);
  });

  $('data-save-btn').addEventListener('click', () => {
    saveMarkings();
    updateDataStatus();
    const size = localStorage.getItem(MARKINGS_KEY).length;
    setStatus('Saved to this browser (' + size + ' bytes).', 'ok');
  });

  $('data-load-btn').addEventListener('click', () => {
    const had = loadMarkingsFromStorage();
    const moved = applyIndicator();
    applyMarkingsToMap();
    setStatus(had ? 'Loaded from browser' + (moved ? ' \u00B7 map indicator restored' : '') + '.' : 'Nothing saved in this browser yet.', had ? 'ok' : 'warn');
  });

  $('data-copy-btn').addEventListener('click', copyAllData);
  $('data-export-btn').addEventListener('click', exportMarkingsFile);
  $('data-import-btn').addEventListener('click', () => { $('data-import-file').click(); });

  $('data-import-file').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      importMarkingsFile(e.target.files[0]);
    }
    e.target.value = '';
  });

  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].name.endsWith('.json')) {
      importMarkingsFile(files[0]);
    } else if (files && files[0]) {
      setStatus('Please drop a .json markings file.', 'warn');
    }
  });

  /* ============================================================
     23. UNIT TYPE MANAGER UI
     ============================================================ */
  const typesModal     = document.getElementById('types-modal');
  const typesClose     = document.getElementById('types-close');
  const typesCloseBtn  = document.getElementById('types-close-btn');
  const typeColorInput = document.getElementById('type-color');
  const typeColorHex   = document.getElementById('type-color-hex');

  /* Icons ticked in the manager form */
  let draftIcons = ['circle'];
  /* Id being edited, or null when creating a new type */
  let editingTypeId = null;

  function renderTypeSelect() {
    const sel = $('deploy-type');
    const current = sel.value;
    sel.innerHTML = typeOptionsHTML();
    sel.value = getUnitType(current) ? current : DEFAULT_TYPE;
  }

  function renderBuiltinGrid() {
    $('types-builtin-grid').innerHTML = builtinTypeList().map(t =>
      '<div class="types-builtin-chip">' +
        '<span class="types-chip-icon" style="color:' + t.color + ';">' + svgForIcon(t.icons[0]) + '</span>' +
        '<span>' + t.label + '</span>' +
      '</div>'
    ).join('');
  }

  function renderCustomTypeList() {
    const el = $('types-custom-list');
    if (!customUnitTypes.length) {
      el.innerHTML = '<div class="types-custom-empty">No custom types yet. Create one below \u2014 ' +
        'give it a name, pick its icons and choose a colour.</div>';
      return;
    }

    el.innerHTML = customUnitTypes.map(t => {
      const used = customTypeInUse(t.id);
      const iconNames = t.icons.map(k => ICON_LABEL[k] || k).join(', ');
      return (
        '<div class="types-custom-row' + (t.id === editingTypeId ? ' editing' : '') + '" data-id="' + t.id + '">' +
          '<span class="types-chip-icon" style="color:' + t.color + ';">' + svgForIcon(t.icons[0]) + '</span>' +
          '<div class="types-row-info">' +
            '<div class="types-row-name">' + t.label + '</div>' +
            '<div class="types-row-meta">' + iconNames + ' \u00B7 ' + t.color +
              (used ? ' \u00B7 ' + used + ' in use' : ' \u00B7 unused') +
            '</div>' +
          '</div>' +
          '<div class="types-row-btns">' +
            '<button type="button" class="type-edit-btn" title="Edit" aria-label="Edit ' + t.label + '" data-id="' + t.id + '">' + UI_GLYPH.copy + '</button>' +
            '<button type="button" class="type-del-btn" title="Delete" aria-label="Delete ' + t.label + '" data-id="' + t.id + '">' + UI_GLYPH.trash + '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    el.querySelectorAll('.type-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => beginEditCustomType(btn.dataset.id));
    });

    el.querySelectorAll('.type-del-btn').forEach(btn => {
      btn.addEventListener('click', () => removeCustomType(btn.dataset.id));
    });
  }

  function renderIconPicker() {
    $('type-icon-picker').innerHTML = Object.keys(ICON_SVG).map(key =>
      '<button type="button" class="type-icon-opt' + (draftIcons.indexOf(key) !== -1 ? ' selected' : '') +
      '" data-icon="' + key + '" aria-pressed="' + (draftIcons.indexOf(key) !== -1 ? 'true' : 'false') + '">' +
        svgForIcon(key) +
        '<span>' + (ICON_LABEL[key] || key) + '</span>' +
      '</button>'
    ).join('');

    $('type-icon-picker').querySelectorAll('.type-icon-opt').forEach(btn => {
      btn.addEventListener('click', () => toggleDraftIcon(btn.dataset.icon));
    });
  }

  function toggleDraftIcon(key) {
    const at = draftIcons.indexOf(key);

    if (at !== -1) {
      if (draftIcons.length === 1) {           // never allow zero icons
        setStatus('A unit type needs at least one icon.', 'warn');
        return;
      }
      draftIcons.splice(at, 1);
    } else {
      if (draftIcons.length >= 3) {
        setStatus('You can pick at most 3 icons per type.', 'warn');
        return;
      }
      draftIcons.push(key);
    }

    renderIconPicker();
    updateTypePreview();
  }

  function updateTypePreview() {
    const color = typeColorInput.value;
    const name = $('type-label').value.trim() || 'New type';

    $('type-preview').innerHTML = draftIcons.length === 1
      ? buildBadgeHTML(draftIcons[0], color, false)
      : '<div style="display:flex;gap:4px">' +
          draftIcons.map(k => buildBadgeHTML(k, color, true)).join('') +
        '</div>';

    $('type-preview-hint').innerHTML = '<b>' + name + '</b> \u00B7 ' +
      draftIcons.length + ' icon' + (draftIcons.length > 1 ? 's' : '') +
      ' \u00B7 ' + color;
  }

  function resetTypeForm() {
    editingTypeId = null;
    draftIcons = ['circle'];
    $('type-label').value = '';
    typeColorInput.value = '#38BDF8';
    typeColorHex.value = '#38BDF8';
    $('types-form-title').textContent = 'Create a unit type';
    $('types-form-pill').textContent = 'New';
    $('type-save-btn').textContent = 'Create type';
    renderIconPicker();
    updateTypePreview();
    renderCustomTypeList();
  }

  function beginEditCustomType(id) {
    const t = customUnitTypes.find(x => x.id === id);
    if (!t) return;

    editingTypeId = id;
    draftIcons = t.icons.slice();
    $('type-label').value = t.label;
    typeColorInput.value = t.color;
    typeColorHex.value = t.color;
    $('types-form-title').textContent = 'Edit unit type';
    $('types-form-pill').textContent = 'Editing';
    $('type-save-btn').textContent = 'Save changes';

    renderIconPicker();
    updateTypePreview();
    renderCustomTypeList();
    $('type-label').focus();
  }

  function saveTypeFromForm() {
    const label = $('type-label').value.trim();
    if (!label) {
      setStatus('Give the unit type a name first.', 'warn');
      $('type-label').focus();
      return;
    }

    const clash = customUnitTypes.some(t =>
      t.label.toLowerCase() === label.toLowerCase() && t.id !== editingTypeId);
    if (clash) {
      setStatus('You already have a custom type called "' + label + '".', 'warn');
      return;
    }

    const saved = upsertCustomType({
      id: editingTypeId,
      label,
      icons: draftIcons.slice(),
      color: typeColorInput.value
    });

    if (!saved) { setStatus('Could not save that unit type.', 'err'); return; }

    const wasEditing = !!editingTypeId;
    resetTypeForm();
    renderTypeSelect();
    renderBuiltinGrid();

    // Select the new / edited type so the user sees the result straight away
    $('deploy-type').value = saved.id;
    populateIconOptions();
    applyTypeColour();
    updateDeployPreview();

    setStatus((wasEditing ? 'Updated' : 'Created') + ' unit type: ' + saved.label, 'ok');
  }

  async function removeCustomType(id) {
    const t = customUnitTypes.find(x => x.id === id);
    if (!t) return;

    const used = customTypeInUse(id);
    const fallback = BUILTIN_UNIT_TYPES[DEFAULT_TYPE].label;

    const html = used
      ? '<p><b>' + esc(t.label) + '</b> is used by <b>' + used + ' deployment' + (used > 1 ? 's' : '') +
        '</b> on the map right now.</p>' +
        '<p>They will be reassigned to <b>' + esc(fallback) + '</b> and keep their own details.</p>'
      : '<p>The custom type <b>' + esc(t.label) + '</b> will be removed.</p>';

    const ok = await askConfirm({
      title: 'Delete this unit type?',
      subtitle: used ? 'Deployments using it will be reassigned.' : 'It is not in use.',
      html,
      note: 'The type is removed from this browser and from any file you export later.',
      confirmLabel: 'Delete type'
    });
    if (!ok) return;

    const wasEditing = editingTypeId === id;
    const res = deleteCustomType(id);

    resetTypeForm();
    renderTypeSelect();
    renderBuiltinGrid();

    // Repaint anything that was pointing at the deleted type
    redrawDeployments();
    applyMarkingsToMap();
    populateIconOptions();
    updateDeployPreview();

    setStatus(
      res.removed
        ? 'Deleted "' + t.label + '"' + (res.moved ? ' \u00B7 ' + res.moved + ' deployment(s) reassigned to ' + BUILTIN_UNIT_TYPES[DEFAULT_TYPE].label : '')
        : 'Could not delete that type.',
      res.removed ? 'ok' : 'err'
    );

    if (wasEditing) resetTypeForm();
  }

  /* ---- wiring ---- */
  $('types-manage-btn').addEventListener('click', () => {
    resetTypeForm();
    renderBuiltinGrid();
    renderCustomTypeList();
    renderTypeSelect();
    openModal(typesModal);
  });

  typesClose.addEventListener('click', () => closeModal(typesModal));
  typesCloseBtn.addEventListener('click', () => closeModal(typesModal));
  typesModal.addEventListener('click', (e) => {
    if (e.target === typesModal) closeModal(typesModal);
  });

  $('type-save-btn').addEventListener('click', saveTypeFromForm);
  $('type-cancel-btn').addEventListener('click', resetTypeForm);
  $('type-label').addEventListener('input', updateTypePreview);
  $('type-label').addEventListener('keydown', e => { if (e.key === 'Enter') saveTypeFromForm(); });

  syncColor(typeColorInput, typeColorHex);
  typeColorInput.addEventListener('input', updateTypePreview);
  typeColorHex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(typeColorHex.value.trim())) updateTypePreview();
  });

  /* ============================================================
     25. PRINTABLE REPORT & PNG EXPORT
     ============================================================ */
  /* One projection and one set of overlay painters feed both outputs, so the
     printed sheet and the PNG are always the same picture.

     The background is attempted as real map tiles, fetched as our own
     cross-origin <img> elements (this does NOT touch the live map layers, so
     it can never break the on-screen map). If the tile server refuses
     cross-origin reads we get no usable image, and we fall back to a clean
     schematic plan rather than handing the user a blank rectangle. */

  const EXPORT_W = 1600;
  const EXPORT_H = 1000;
  const EXPORT_MARGIN = 56;
  /* The A4 landscape page the PDF sheet is laid out on. Declared here because
     a fixed map scale is only meaningful against a physical sheet, and the
     export maths needs it before the PDF section runs. */
  const PDF_W = 842;
  const PDF_H = 595;
  const PDF_M = 30;
  const FONT = 'Poppins, "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
  const M_TO_FT = 3.280839895;
  const NICE_METRES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
                       10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const NICE_FEET = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
                     15840, 26400, 52800, 105600, 264000];

  /* Export preferences are UI settings, not plan data, so they are kept out of
     the shared session JSON on purpose and stored under their own key. */
  const EXPORT_PREFS_KEY = 'gis-helper-export-prefs-v2';

  /* Map scales a sheet is normally drawn at. 'auto' frames whatever the plan
     needs; a fixed fraction trades the whole plan for a known scale. */
  const SCALE_CHOICES = [
    'auto', '5000', '10000', '25000', '50000', '100000',
    '250000', '500000', '1000000', '2000000', '5000000', '10000000'
  ];
  const exportPrefs = {
    frame: 'all',           // all | view | deployments | zones | indicator
    mapType: 'screen',      // screen | standard | satellite | terrain | humanitarian
    orientation: 'north',   // north (north up) | fit (rotate onto the plan's long axis)
    scale: 'auto',          // auto (frame the plan) | a representative fraction, e.g. '25000'
    scaleUnits: 'both',     // both | metric | imperial | none
    title: '',
    date: '',
    /* What the Download dialog puts on the sheet or picture. The JSON export
       ignores this - a file is meant to be re-imported losslessly. */
    include: { map: true, scale: true, north: true, deployments: true, zones: true }
  };

  function loadExportPrefs() {
    try {
      const raw = localStorage.getItem(EXPORT_PREFS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) || {};
      if (['all', 'view', 'deployments', 'zones', 'indicator'].indexOf(d.frame) !== -1) exportPrefs.frame = d.frame;
      if (['both', 'metric', 'imperial', 'none'].indexOf(d.scaleUnits) !== -1) exportPrefs.scaleUnits = d.scaleUnits;
      if (['screen', 'standard', 'satellite', 'terrain', 'humanitarian'].indexOf(d.mapType) !== -1) exportPrefs.mapType = d.mapType;
      if (SCALE_CHOICES.indexOf(String(d.scale)) !== -1) exportPrefs.scale = String(d.scale);
      if (['north', 'fit'].indexOf(d.orientation) !== -1) exportPrefs.orientation = d.orientation;
      /* Older browsers only stored a "rotate to fit" flag. */
      if (d.orientation === undefined && typeof d.rotate === 'boolean') exportPrefs.orientation = d.rotate ? 'fit' : 'north';
      exportPrefs.title = String(d.title || '').slice(0, 60);
      exportPrefs.date = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : '';
      if (d.include && typeof d.include === 'object') {
        ['map', 'scale', 'north', 'deployments', 'zones'].forEach(k => {
          if (typeof d.include[k] === 'boolean') exportPrefs.include[k] = d.include[k];
        });
      }
    } catch (e) {}
  }

  function saveExportPrefs() {
    try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(exportPrefs)); } catch (e) {}
  }

  /* ---- one setting, many controls ----
     The same option appears in the sidebar Export options, again in the
     Download dialog and again on the sheet preview. Every control carrying
     [data-pref] reads and writes the one exportPrefs value, so the three places
     cannot drift apart. A dotted key reaches into the nested include ticks. */
  function prefGet(key) {
    if (key.indexOf('.') === -1) return exportPrefs[key];
    return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), exportPrefs);
  }

  function prefSet(key, value) {
    if (key.indexOf('.') === -1) { exportPrefs[key] = value; return; }
    const parts = key.split('.');
    const last = parts.pop();
    parts.reduce((o, k) => o[k], exportPrefs)[last] = value;
  }

  function syncPrefControls() {
    document.querySelectorAll('[data-pref]').forEach(el => {
      const v = prefGet(el.dataset.pref);
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.value !== String(v)) el.value = v;
    });
  }

  function setPref(key, value) {
    if (prefGet(key) === value) return;
    prefSet(key, value);
    saveExportPrefs();
    syncPrefControls();
    /* A preview on screen is showing this very setting, so redraw it. */
    schedulePreview();
  }

  function initPrefControls() {
    document.querySelectorAll('[data-pref]').forEach(el => {
      const key = el.dataset.pref;
      const commit = () => setPref(key, el.type === 'checkbox' ? el.checked : el.value);
      el.addEventListener('change', commit);
      /* Free-text fields need every keystroke, but only change once on blur. */
      if (el.tagName === 'INPUT' && el.type === 'text') el.addEventListener('input', commit);
    });
    syncPrefControls();
  }

  /* Which base map the export should draw. "screen" tracks whatever the live
     map is showing, so the download matches the view unless told otherwise. */
  function exportLayerName() {
    const m = exportPrefs.mapType;
    return (m === 'screen' || !baseLayers[m]) ? currentLayerName : m;
  }

  function layerLabel(name) {
    return {
      standard: 'Standard (OSM)',
      satellite: 'Satellite',
      terrain: 'Terrain',
      humanitarian: 'Humanitarian'
    }[name] || name;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function plainText(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }

  function safeMgrs(lat, lon, digits) {
    try { return latLonToMgrs(lat, lon, digits); } catch (e) { return 'Out of MGRS range'; }
  }

  function fmtDistance(m, imperial) {
    if (imperial) {
      const ft = m * M_TO_FT;
      return ft < 528 ? Math.round(ft) + ' ft' : (m / 1609.344).toFixed(2) + ' mi';
    }
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + ' km';
  }

  /* Largest value from a nice list that still fits the bar budget. */
  function pickScaleValue(list, perUnit) {
    let best = list[0];
    for (let i = 0; i < list.length; i++) {
      if (list[i] / perUnit <= 180) best = list[i]; else break;
    }
    return best;
  }

  function niceStep(raw) {
    if (!(raw > 0)) return 0;
    const pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    const n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Web Mercator world pixels, matching Leaflet's own maths. */
  function worldPx(lat, lon, zoom) {
    const s = 256 * Math.pow(2, zoom);
    const sin = Math.sin(Math.max(Math.min(lat, 85.05), -85.05) * Math.PI / 180);
    return {
      x: (lon + 180) / 360 * s,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s
    };
  }

  /* ---- framing presets ---- */
  function rawFramePoints() {
    const pts = [];
    const f = exportPrefs.frame;
    if (f === 'deployments' || f === 'all') {
      markings.deployments.forEach(d => pts.push({ lat: d.lat, lon: d.lon }));
    }
    if (f === 'zones' || f === 'all') {
      markings.zones.forEach(z => (z.vertices || []).forEach(v => pts.push({ lat: v.lat, lon: v.lng })));
    }
    if ((f === 'indicator' || f === 'all') && validIndicator(savedIndicator)) {
      pts.push({ lat: savedIndicator.lat, lon: savedIndicator.lon });
    }
    return pts;
  }

  function frameEmptyMessage() {
    return {
      deployments: 'No deployments placed yet \u2014 place some, or pick a different frame.',
      zones: 'No zones drawn yet \u2014 draw some, or pick a different frame.',
      indicator: 'No map indicator yet \u2014 select a location, or pick a different frame.',
      all: 'Nothing to export yet \u2014 add a map indicator, deployment or zone.'
    }[exportPrefs.frame] || 'Nothing to export yet.';
  }

  /* Returns the points to frame, or null (with a status set) if the chosen
     preset has nothing in it. */
  function prepareFramePoints() {
    if (exportPrefs.frame === 'view') {
      const b = map.getBounds();
      return [
        { lat: b.getNorth(), lon: b.getWest() },
        { lat: b.getSouth(), lon: b.getEast() }
      ];
    }
    const pts = rawFramePoints();
    if (!pts.length) { setStatus(frameEmptyMessage(), 'warn'); return null; }

    /* A single point has zero extent, so the plan would render as one dot in a
       huge frame. Expand it to a small box instead (~0.012 deg, about 1.3 km). */
    let n = -90, s = 90, w = 180, e = -180;
    pts.forEach(p => { n = Math.max(n, p.lat); s = Math.min(s, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); });
    const MIN_SPAN = 0.012;
    if ((e - w) < MIN_SPAN || (n - s) < MIN_SPAN) {
      const cLat = (n + s) / 2, cLon = (w + e) / 2;
      const dLat = Math.max(n - s, MIN_SPAN) / 2, dLon = Math.max(e - w, MIN_SPAN) / 2;
      return [{ lat: cLat - dLat, lon: cLon - dLon }, { lat: cLat + dLat, lon: cLon + dLon }];
    }
    return pts;
  }

  /* Principal-axis angle of the plan, in radians, measured from east in a
     lon/lat plane. The projector turns this into a canvas rotation of the same
     sign, so a value of 0 means north-up. */
  function fitAngle(pts) {
    if (exportPrefs.orientation !== 'fit' || pts.length < 2) return 0;
    const lat0 = pts.reduce((t, p) => t + p.lat, 0) / pts.length;
    const k = Math.cos(lat0 * Math.PI / 180);
    const xs = pts.map(p => p.lon * k);
    const ys = pts.map(p => p.lat);
    const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
    const my = ys.reduce((t, v) => t + v, 0) / ys.length;
    let cxx = 0, cxy = 0, cyy = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
    }
    if (cxx + cyy === 0) return 0;
    return 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  }

  function centreOf(pts) {
    let la = 0, lo = 0;
    pts.forEach(p => { la += p.lat; lo += p.lon; });
    return { lat: la / pts.length, lon: lo / pts.length };
  }

  /* Axis-aligned extent of the points after the canvas rotation is applied. */
  function rotatedFrame(pts, zoom, rot) {
    const mid = centreOf(pts);
    const c = worldPx(mid.lat, mid.lon, zoom);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
      const q = worldPx(p.lat, p.lon, zoom);
      const dx = q.x - c.x, dy = q.y - c.y;
      const rx = dx * ca - dy * sa;
      const ry = dx * sa + dy * ca;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    });
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, c };
  }

  /* Largest zoom at which the rotated plan still fits inside the margin.
     With a fixed scale the zoom is dictated by that scale instead, and the
     picture simply shows whatever falls inside the sheet. */
  function pickExportZoom(pts, rot) {
    const exportLayer = baseLayers[exportLayerName()];
    const layerMax = Math.min((exportLayer && exportLayer.options.maxZoom) || 18, 18);
    if (exportPrefs.scale !== 'auto') {
      const z = Math.round(scaleZoom(centreOf(pts).lat, +exportPrefs.scale));
      return Math.max(1, Math.min(layerMax, z));
    }
    const availW = EXPORT_W - 2 * EXPORT_MARGIN;
    const availH = EXPORT_H - 2 * EXPORT_MARGIN;
    for (let z = layerMax; z >= 1; z--) {
      const b = rotatedFrame(pts, z, rot);
      if (b.w <= availW && b.h <= availH) return z;
    }
    return 1;
  }

  /* ---- map scale ----
     A representative fraction is only meaningful against a physical sheet, so
     the sheet geometry is the reference: the A4 landscape page the PDF is laid
     out on. 1:X means 1 cm on that sheet covers X/100 metres on the ground. */
  const SHEET_W_CM = (PDF_W - 2 * PDF_M) / 72 * 2.54;

  function scaleZoom(lat, denom) {
    const metresAcrossSheet = SHEET_W_CM * (denom / 100);
    const mpp = metresAcrossSheet / EXPORT_W;
    return Math.log2(156543.03392804097 * Math.cos(lat * Math.PI / 180) / mpp);
  }

  /* The scale the picture actually came out at, for the caption and the note
     printed on the sheet. */
  function effectiveScale(zoom, lat) {
    const mpp = 156543.03392804097 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    return Math.round((mpp * EXPORT_W) / SHEET_W_CM * 100);
  }

  function scaleLabel(denom) {
    return '1:' + String(Math.round(denom)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* Uses exactly the same rotation matrix as ctx.rotate(), so tiles blitted with
     ctx.rotate(rot) line up with the vector overlays drawn here. */
  function makeProjector(pts, zoom, rot) {
    const mid = centreOf(pts);
    const c = worldPx(mid.lat, mid.lon, zoom);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const box = rotatedFrame(pts, zoom, rot);
    const availW = EXPORT_W - 2 * EXPORT_MARGIN;
    const availH = EXPORT_H - 2 * EXPORT_MARGIN;
    const dx = (availW - box.w) / 2 - box.minX + EXPORT_MARGIN;
    const dy = (availH - box.h) / 2 - box.minY + EXPORT_MARGIN;
    const span = 256 * Math.pow(2, zoom);

    const toCanvas = (lat, lon) => {
      const q = worldPx(lat, lon, zoom);
      const ax = q.x - c.x, ay = q.y - c.y;
      return { x: ax * ca - ay * sa + dx, y: ax * sa + ay * ca + dy };
    };

    return {
      zoom, rot, c, cLat: mid.lat, cLon: mid.lon,
      project: toCanvas,
      /* Unrotated, so tiles can be laid out axis-aligned before blitting. */
      projectRaw(lat, lon) {
        const q = worldPx(lat, lon, zoom);
        return { x: q.x - c.x + dx, y: q.y - c.y + dy };
      },
      unproject(x, y) {
        const rx = x - dx, ry = y - dy;
        const ax = rx * ca + ry * sa, ay = -rx * sa + ry * ca;
        const wx = ax + c.x, wy = ay + c.y;
        const lon = wx / span * 360 - 180;
        const n = Math.PI - 2 * Math.PI * wy / span;
        return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon };
      },
      metresPerPixel(lat) {
        return 156543.03392804097 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      }
    };
  }

  /* Tile loading is the only network-bound step in an export, so it gets a real
     queue. Firing every tile at once - there can be well over 200 of them -
     stacks them all behind the browser's handful of connections per host, the
     tile server starts throttling, and the finished sheet comes out with blank
     patches. Six in flight is what a well-behaved tile client uses anyway. */
  const TILE_CONCURRENCY = 6;
  const TILE_ATTEMPTS   = 3;
  const TILE_ATTEMPT_MS = 7000;   // per attempt
  const TILE_BUDGET_MS  = 25000;  // whole batch, retries included

  /* How the last tile batch fared. The sheet caption reads this so a picture
     with gaps admits to them instead of passing them off as blank terrain. */
  let lastTileGaps = { missing: 0, total: 0 };

  /* The user-facing version, for the status bar. Empty when the sheet is clean. */
  function tileGapNote(gaps) {
    if (!gaps || !gaps.missing) return '';
    return gaps.missing + ' of ' + gaps.total +
      ' map tiles could not be loaded, so the sheet has blank patches. ' +
      'Try a steadier connection, or a larger map scale to need fewer tiles.';
  }

  function loadTileImage(url, timeoutMs) {
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => done(null), timeoutMs || TILE_ATTEMPT_MS);
      /* Set before src: if the server sends no CORS header this fires onerror
         instead of quietly tainting the canvas. */
      img.crossOrigin = 'anonymous';
      img.onload = () => { clearTimeout(timer); done(img); };
      img.onerror = () => { clearTimeout(timer); done(null); };
      img.src = url;
    });
  }

  /* A retry that reuses the exact URL can just replay a response the browser
     already holds. Every attempt after the first asks for a fresh copy; tile
     servers ignore query parameters they do not know, so this is safe on all
     four providers. */
  function cacheBust(url, attempt) {
    if (!attempt) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + '_r=' + attempt;
  }

  /* Up to TILE_ATTEMPTS tries, giving up early once the batch budget is spent
     so a single slow tile cannot stall the export. Returns the Image or null. */
  async function fetchTileImage(url, deadline) {
    for (let attempt = 0; attempt < TILE_ATTEMPTS; attempt++) {
      const left = deadline - Date.now();
      if (left <= 0) return null;
      const img = await loadTileImage(cacheBust(url, attempt), Math.min(TILE_ATTEMPT_MS, left));
      if (img) return img;
    }
    return null;
  }

  /* `worker` over `items` with at most `limit` in flight, results in input
     order. Written out rather than reached for, so the export has no
     dependencies beyond Leaflet. */
  function mapLimit(items, limit, worker) {
    return new Promise(resolve => {
      const out = new Array(items.length);
      let next = 0;
      const runner = async () => {
        while (next < items.length) {
          const i = next++;
          out[i] = await worker(items[i]);
        }
      };
      const lanes = [];
      for (let i = 0; i < Math.min(limit, items.length); i++) lanes.push(runner());
      Promise.all(lanes).then(() => resolve(out));
    });
  }

  async function drawBaseTiles(ctx, proj) {
    lastTileGaps = { missing: 0, total: 0 };
    const layer = baseLayers[exportLayerName()];
    const tpl = layer && layer._url;
    if (!tpl) return false;

    const z = proj.zoom;
    const rot = proj.rot;
    const span = 256 * Math.pow(2, z);

    /* The window that has to be painted is the canvas itself, mapped back into
       world pixels through the very projector the overlays are drawn with.
       Sizing it from the plan instead - as this used to - meant that whenever a
       fixed map scale made the plan smaller than the picture, only the plan's
       own footprint was ever requested: the rest of the sheet was never even
       asked for, and came out blank. Deriving both the size and the origin
       from the canvas also keeps the tiles and the vector overlays on the same
       pixels by construction. */
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    [[0, 0], [EXPORT_W, 0], [0, EXPORT_H], [EXPORT_W, EXPORT_H]].forEach(corner => {
      const ll = proj.unproject(corner[0], corner[1]);
      /* Longitude past the antimeridian would ask for tiles that do not exist,
         so wrap it; a window wider than the world then falls through to the
         schematic base rather than to a sheet full of holes. */
      const q = worldPx(ll.lat, ((ll.lon + 540) % 360) - 180, z);
      if (q.x < ux0) ux0 = q.x;
      if (q.x > ux1) ux1 = q.x;
      if (q.y < uy0) uy0 = q.y;
      if (q.y > uy1) uy1 = q.y;
    });

    ux0 = Math.floor(ux0); ux1 = Math.ceil(ux1);
    uy0 = Math.floor(uy0); uy1 = Math.ceil(uy1);

    let ow = ux1 - ux0, oh = uy1 - uy0;
    if (ow > span || oh > span) return false;   // wider than the world itself

    let ox, oy;
    if (rot) {
      /* The offscreen sheet is blitted by its centre onto the anchor, so it
         stays centred on the plan - but it must be large enough that the
         rotated canvas lands entirely on it. */
      const ca = Math.abs(Math.cos(rot)), sa = Math.abs(Math.sin(rot));
      ow = Math.max(ow, Math.ceil(EXPORT_W * ca + EXPORT_H * sa));
      oh = Math.max(oh, Math.ceil(EXPORT_W * sa + EXPORT_H * ca));
      ox = Math.round(proj.c.x - ow / 2);
      oy = Math.round(proj.c.y - oh / 2);
    } else {
      ox = ux0;
      oy = uy0;
    }

    const x0 = Math.floor(ox / 256), x1 = Math.floor((ox + ow - 1) / 256);
    const y0 = Math.floor(oy / 256), y1 = Math.floor((oy + oh - 1) / 256);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > 220 || ow > 4000 || oh > 4000) return false;   // stay a well-behaved tile client

    const subs = layer.options.subdomains || 'abc';
    const wanted = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const sub = Array.isArray(subs) ? subs[Math.abs(x + y) % subs.length] : subs[0];
        wanted.push({ x, y, url: L.Util.template(tpl, { s: sub, z, x, y, r: '' }) });
      }
    }

    /* Queued rather than fired flat out, and each tile retried before it is
       written off - see TILE_CONCURRENCY above. */
    const deadline = Date.now() + TILE_BUDGET_MS;
    const tiles = await mapLimit(wanted, TILE_CONCURRENCY, t =>
      fetchTileImage(t.url, deadline).then(img => ({ img, x: t.x, y: t.y })));

    const got = tiles.filter(t => t.img).length;
    lastTileGaps = { missing: tiles.length - got, total: tiles.length };
    if (got < tiles.length * 0.6) return false;   // blocked or mostly dead

    /* Paint the page before any tile lands. A fresh canvas is fully
       transparent, so without this every strip the tiles do not reach - the
       margin around the plan, the corners outside a rotated map, a tile whose
       load failed - stays see-through. Transparent reads as black against the
       dark preview, and the PDF embeds this picture as JPEG, which has no
       alpha channel, so those same holes print as solid black. */
    ctx.fillStyle = '#DCE4EB';
    ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);

    let target = ctx;
    let sheet = null;
    if (rot) {
      sheet = document.createElement('canvas');
      sheet.width = ow;
      sheet.height = oh;
      target = sheet.getContext('2d');
      /* The rotated map is blitted from this sheet, so it needs its own base
         for the same reason: the strips outside the plan land on the page. */
      target.fillStyle = '#DCE4EB';
      target.fillRect(0, 0, ow, oh);
    }

    tiles.forEach(t => {
      if (!t.img) return;
      target.drawImage(t.img, t.x * 256 - ox, t.y * 256 - oy, 256, 256);
    });

    if (rot) {
      const anchor = proj.project(proj.cLat, proj.cLon);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, EXPORT_W, EXPORT_H);
      ctx.clip();
      ctx.translate(anchor.x, anchor.y);
      ctx.rotate(rot);
      ctx.drawImage(sheet, -ow / 2, -oh / 2);
      ctx.restore();
    }
    return true;
  }

  function drawSchematicBase(ctx, proj) {
    ctx.fillStyle = '#EEF3F7';
    ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);

    /* Derive the graticule window from the canvas corners, so it covers the
       whole sheet even when the plan has been rotated. */
    const corners = [
      proj.unproject(0, 0), proj.unproject(EXPORT_W, 0),
      proj.unproject(0, EXPORT_H), proj.unproject(EXPORT_W, EXPORT_H)
    ];
    let n = -90, s = 90, w = 180, e = -180;
    corners.forEach(c => {
      n = Math.max(n, c.lat); s = Math.min(s, c.lat);
      w = Math.min(w, c.lon); e = Math.max(e, c.lon);
    });

    const cLat = (n + s) / 2;
    const spanLat = Math.abs(n - s);
    const spanLon = Math.abs(e - w) * Math.cos(cLat * Math.PI / 180);
    const step = niceStep(Math.max(spanLat, spanLon) / 6) || 0.01;
    const dp = step < 0.01 ? 3 : 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#D3DDE6';
    ctx.fillStyle = '#7B8A99';
    ctx.font = '11px ' + FONT;

    /* Constant-latitude and constant-longitude lines are straight under Mercator
       and stay straight through this rotation, so plain segments are correct. */
    for (let lo = Math.ceil(w / step) * step; lo <= e; lo += step) {
      const a = proj.project(n, lo);
      const b = proj.project(s, lo);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(lo.toFixed(dp) + '\u00B0', a.x + 4, a.y - 12);
    }
    for (let la = Math.ceil(s / step) * step; la <= n; la += step) {
      const a = proj.project(la, w);
      const b = proj.project(la, e);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(la.toFixed(dp) + '\u00B0', a.x - 5, a.y);
    }

    if (!proj.rot) {
      ctx.strokeStyle = '#B9C6D2';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, EXPORT_W - 2, EXPORT_H - 2);
    }
  }

  /* Label chips already placed on this sheet. A crowded plan puts several
     markers within a pin's width of each other, and their labels then print on
     top of one another into an unreadable smudge, so each new chip steps down
     until it has clear air. Reset once per export. */
  let placedTags = [];

  function drawTag(ctx, x, y, text, color) {
    ctx.font = '600 15px ' + FONT;
    const w = ctx.measureText(text).width + 16;

    const clashes = ty => placedTags.some(t =>
      Math.abs(t.y - ty) < 26 && Math.abs(t.x - x) < (t.w + w) / 2);
    for (let step = 0; step < 10 && clashes(y); step++) y += 26;
    placedTags.push({ x, y, w });

    ctx.fillStyle = 'rgba(7,13,20,0.82)';
    roundRectPath(ctx, x - w / 2, y - 12, w, 24, 6);
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  function drawZones(ctx, proj) {
    markings.zones.forEach(z => {
      const vs = z.vertices || [];
      if (vs.length < 3) return;
      ctx.beginPath();
      vs.forEach((v, i) => {
        const p = proj.project(v.lat, v.lng);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.globalAlpha = Math.min(Math.max(z.opacity || 0.25, 0.08), 0.85);
      ctx.fillStyle = z.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = z.color;
      ctx.stroke();

      let la = 0, ln = 0;
      vs.forEach(v => { la += v.lat; ln += v.lng; });
      const c = proj.project(la / vs.length, ln / vs.length);
      drawTag(ctx, c.x, c.y, z.name + '  \u00B7  ' + formatArea(z.areaM2), z.color);
    });
  }

  /* Numbered pins so the report table and the image cross-reference. */
  function drawDeployments(ctx, proj) {
    markings.deployments.forEach((d, i) => {
      normaliseDeployment(d);
      const p = proj.project(d.lat, d.lon);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0B1118';
      ctx.stroke();
      ctx.fillStyle = '#0B1118';
      ctx.font = '700 15px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y + 0.5);
      drawTag(ctx, p.x, p.y + 30, d.commander || unitLabel(d.type), d.color);
    });
  }

  /* The map indicator is deliberately NOT drawn on the exported picture.
     It marks the working point in the live app, but on a handed-over plan
     sheet it reads as a pin marking the spot rather than as part of the
     ground data, so only the deployments and zones are printed. The
     indicator's coordinates still appear in the PDF/PNG facts block and
     still travel in the JSON, and it still influences auto-framing. */

  function drawScaleBar(ctx, proj, centerLat) {
    if (!exportPrefs.include.scale) return;
    const units = exportPrefs.scaleUnits;
    const mpp = proj.metresPerPixel(centerLat);
    let y = EXPORT_H - 30;

    if (units !== 'none' && mpp > 0) {
      const bars = [];
      if (units === 'metric' || units === 'both') {
        bars.push({ m: pickScaleValue(NICE_METRES, mpp), imperial: false });
      }
      if (units === 'imperial' || units === 'both') {
        bars.push({ m: pickScaleValue(NICE_FEET, mpp * M_TO_FT) / M_TO_FT, imperial: true });
      }

      for (let i = bars.length - 1; i >= 0; i--) {
        const bar = bars[i];
        const px = bar.m / mpp;
        const x = 26;

        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y); ctx.stroke();
        ctx.strokeStyle = '#0B1118'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
        ctx.moveTo(x + px, y - 6); ctx.lineTo(x + px, y + 6);
        ctx.stroke();

        const label = fmtDistance(bar.m, bar.imperial);
        ctx.font = '600 13px ' + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3.5;
        ctx.strokeText(label, x + px / 2, y - 8);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, x + px / 2, y - 8);

        y -= 30;
      }
    }

    /* The representative fraction sits above the bars, so the sheet works as a
       map rather than only as a picture - and it is still printed when the bar
       itself is hidden, because a sheet at 1:25 000 is still at 1:25 000. */
    const fixed = exportPrefs.scale !== 'auto';
    const denom = fixed ? +exportPrefs.scale : effectiveScale(proj.zoom, centerLat);
    const text = (fixed ? 'Map scale ' : 'Map scale approx. ') + scaleLabel(denom);

    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3.5;
    ctx.strokeText(text, 26, y - 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, 26, y - 22);
  }

  /* The arrow must follow the rotation, so it always points at true north
     within the (possibly rotated) plan. */
  function drawNorthArrow(ctx, proj) {
    if (!exportPrefs.include.north) return;
    const cx = EXPORT_W - 46, cy = 44;
    const rot = proj.rot || 0;
    const dx = Math.sin(rot), dy = -Math.cos(rot);   // north, after rotation
    const len = 20, halfW = 11;

    ctx.beginPath();
    ctx.moveTo(cx + dx * len, cy + dy * len);
    ctx.lineTo(cx - dx * 8 + dy * halfW, cy - dy * 8 - dx * halfW);
    ctx.lineTo(cx - dx * 8 - dy * halfW * 0.35, cy - dy * 8 + dx * halfW * 0.35);
    ctx.lineTo(cx - dx * 8 - dy * halfW, cy - dy * 8 + dx * halfW);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#0B1118'; ctx.stroke();

    ctx.font = '700 14px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText('N', cx + dx * (len + 6), cy + dy * (len + 6) + 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('N', cx + dx * (len + 6), cy + dy * (len + 6) + 4);
  }

  /* ODbL / CARTO / OpenTopoMap all require visible attribution. */
  function drawAttribution(ctx, usedTiles) {
    const layer = baseLayers[exportLayerName()];
    const text = usedTiles
      ? plainText(layer && layer.options.attribution)
      : 'Schematic plan \u2014 not to scale. Positions are WGS 84.';
    if (!text) return;
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(7,13,20,0.6)';
    ctx.fillRect(EXPORT_W - w - 20, EXPORT_H - 24, w + 16, 18);
    ctx.fillStyle = '#DBE6EE';
    ctx.fillText(text, EXPORT_W - 12, EXPORT_H - 8);
  }

  /* Wait until the sheet's picture is in the layout, but never for longer than
     a moment. img.decode() is the tidier signal, but it does not settle on
     every browser for an image in a hidden subtree - and a render that waits on
     it forever leaves the tables unfilled and the indicator spinning. The
     image being cached and complete is as good a signal as any at that point. */
  function whenImageReady(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 3000);
    });
  }

  async function buildExportCanvas() {
    const pts = prepareFramePoints();
    if (!pts) return null;

    const rot = fitAngle(pts);
    const mid = centreOf(pts);
    const zoom = pickExportZoom(pts, rot);
    const proj = makeProjector(pts, zoom, rot);

    /* A fixed scale shows whatever fits on the sheet, so the plan can end up
       larger than the picture. Say so rather than quietly cropping it. */
    let cropped = false;
    if (exportPrefs.scale !== 'auto') {
      const box = rotatedFrame(pts, zoom, rot);
      cropped = box.w > EXPORT_W - 2 * EXPORT_MARGIN || box.h > EXPORT_H - 2 * EXPORT_MARGIN;
    }

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');
    placedTags = [];

    let usedTiles = false;
    try { usedTiles = await drawBaseTiles(ctx, proj); } catch (e) { usedTiles = false; }
    if (!usedTiles) drawSchematicBase(ctx, proj);

    drawZones(ctx, proj);
    drawDeployments(ctx, proj);
    drawScaleBar(ctx, proj, mid.lat);
    drawNorthArrow(ctx, proj);
    drawAttribution(ctx, usedTiles);

    return {
      canvas, usedTiles, rot, zoom, cropped,
      centerLat: mid.lat,
      tilesWanted: lastTileGaps.total,
      tilesMissing: lastTileGaps.missing
    };
  }

  /* ---- report tables ---- */
  function buildReportTables() {
    $('report-title').textContent = exportPrefs.title || 'GIS Helper \u2014 Tactical Plan';

    /* Honour the Save Op Data ticks. The map is hidden with the whole figure
       (caption included) so it cannot leave a stray gap, and the two data
       tables drop out entirely rather than printing as empty headings. */
    $('report-figure').style.display = exportPrefs.include.map ? '' : 'none';
    $('report-deployments-block').style.display = exportPrefs.include.deployments ? '' : 'none';
    $('report-zones-block').style.display = exportPrefs.include.zones ? '' : 'none';

    /* One landscape page is the promise the copy makes. Past 4 rows the tables are
       compacted, and the room that frees is handed back to the map in measured
       steps so the picture stays legible instead of collapsing to a stamp.
       Past ~16 rows the tables cannot share a page with a readable map at all,
       so we stop compacting and let the sheet run onto a second page. */
    const rows = (exportPrefs.include.deployments ? markings.deployments.length : 0) +
                 (exportPrefs.include.zones ? markings.zones.length : 0);
    const sheet = document.querySelector('.report-sheet');
    sheet.classList.toggle('is-dense', rows > 4 && rows <= 16);
    sheet.classList.toggle('is-long', rows > 16);
    sheet.classList.toggle('is-map-lg', rows >= 5 && rows <= 8);
    sheet.classList.toggle('is-map-md', rows >= 9 && rows <= 13);

    const bits = [];
    if (exportPrefs.date) bits.push('Plan date: ' + exportPrefs.date);
    bits.push('Generated ' + new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    $('report-sub').textContent = bits.join(' \u00B7 ');

    const scope = {
      all: 'All deployments, zones and the map indicator',
      view: 'The area visible on the map at export time',
      deployments: 'Deployments only',
      zones: 'Zones only',
      indicator: 'The map indicator only'
    }[exportPrefs.frame];
    if (scope) $('report-scope').textContent = 'Framing: ' + scope;

    const hasInd = validIndicator(savedIndicator);
    $('report-place').textContent  = hasInd ? ($('place').textContent || 'Map indicator') : '\u2014';
    $('report-latlon').textContent = hasInd ? $('o-latlon').textContent : '\u2014';
    $('report-mgrs').textContent   = hasInd ? $('o-m8').textContent : '\u2014';
    $('report-utm').textContent    = hasInd ? $('o-utm').textContent : '\u2014';

    $('report-dep-count').textContent = '(' + markings.deployments.length + ')';
    $('report-zone-count').textContent = '(' + markings.zones.length + ')';

    $('report-deployments-body').innerHTML = markings.deployments.length
      ? markings.deployments.map((d, i) => {
          normaliseDeployment(d);
          return '<tr>' +
            '<td class="num">' + (i + 1) + '</td>' +
            '<td><span class="swatch" style="background:' + esc(d.color) + '"></span>' + esc(unitLabel(d.type)) + '</td>' +
            '<td>' + (esc(d.commander) || '\u2014') + '</td>' +
            '<td class="num">' + (d.troops || '\u2014') + '</td>' +
            '<td>' + (esc(d.vehicles) || '\u2014') + '</td>' +
            '<td>' + (esc(d.arms) || '\u2014') + '</td>' +
            '<td>' + (esc(d.equip) || '\u2014') + '</td>' +
            '<td class="mono">' + Number(d.lat).toFixed(5) + ', ' + Number(d.lon).toFixed(5) + '</td>' +
            '<td class="mono">' + esc(safeMgrs(d.lat, d.lon, 4)) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="9" class="report-empty">No deployments in this plan.</td></tr>';

    $('report-zones-body').innerHTML = markings.zones.length
      ? markings.zones.map((z, i) => {
          const vs = z.vertices || [];
          let la = 0, ln = 0;
          vs.forEach(v => { la += v.lat; ln += v.lng; });
          const clat = vs.length ? la / vs.length : null;
          const clon = vs.length ? ln / vs.length : null;
          return '<tr>' +
            '<td class="num">' + (i + 1) + '</td>' +
            '<td><span class="swatch" style="background:' + esc(z.color) + '"></span>' + esc(z.name) + '</td>' +
            '<td>' + (z.details ? esc(z.details) : '\u2014') + '</td>' +
            '<td class="num">' + esc(formatArea(z.areaM2)) + '</td>' +
            '<td class="num">' + vs.length + '</td>' +
            '<td class="mono">' + (clat === null ? '\u2014' : clat.toFixed(5) + ', ' + clon.toFixed(5)) + '</td>' +
            '<td class="mono">' + (clat === null ? '\u2014' : esc(safeMgrs(clat, clon, 4))) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="7" class="report-empty">No zones in this plan.</td></tr>';

    /* Only the unit types this plan actually uses, so the sheet stays short. */
    const used = [];
    markings.deployments.forEach(d => {
      normaliseDeployment(d);
      if (!used.some(t => t.id === d.type)) {
        const t = resolveType(d.type);
        used.push({ id: d.type, label: t.label, color: d.color });
      }
    });
    $('report-types').innerHTML = used.length
      ? used.map(t => '<span class="report-type"><span class="swatch" style="background:' +
          esc(t.color) + '"></span>' + esc(t.label) + '</span>').join('')
      : '<span class="report-empty">No unit types used.</span>';
    /* Unit types are derived from the deployments, so this follows the same tick. */
    $('report-types-block').style.display = (used.length && exportPrefs.include.deployments) ? '' : 'none';
  }

  function exportCaption(res) {
    const bits = [];
    const layerName = exportLayerName();
    bits.push(res.usedTiles
      ? 'Base map: ' + layerLabel(layerName) + (layerName === currentLayerName ? '.' : ' (chosen for this download).')
      : 'Schematic plan \u2014 base map tiles were unavailable, so positions are shown on a coordinate grid.');
    bits.push(Math.abs(res.rot) > 0.01
      ? 'North facing: rotated ' + Math.abs(Math.round(res.rot * 180 / Math.PI)) + '\u00B0 ' + (res.rot < 0 ? 'west' : 'east') + ' of north to fit the frame.'
      : 'North facing: north up.');
    bits.push(exportPrefs.scale === 'auto'
      ? 'Map scale approx. ' + scaleLabel(effectiveScale(res.zoom, res.centerLat)) + '.'
      : 'Map scale ' + scaleLabel(+exportPrefs.scale) + '.');
    if (res.cropped) {
      bits.push('The chosen scale is too fine for this plan, so the picture crops it \u2014 pick a larger scale or use Auto to frame everything.');
    }
    /* A blank patch in a finished PDF otherwise reads as blank terrain rather
       than as a gap, so say so on the sheet itself. Kept short because this
       caption is a single footer line on page 1 of the PDF. */
    if (res.usedTiles && res.tilesMissing) {
      bits.push('Note: ' + res.tilesMissing + ' of ' + res.tilesWanted +
        ' base map tiles failed to load, leaving blank patches.');
    }
    bits.push('Numbered pins correspond to the deployments table.');
    return bits.join(' ');
  }

  async function openReport() {
    setStatus('Preparing report\u2026', 'ok');
    try {
      const res = await buildExportCanvas();
      if (!res) return;
      const img = $('report-image');
      img.src = res.canvas.toDataURL('image/png');
      buildReportTables();
      $('report-caption').textContent = exportCaption(res);
      await whenImageReady(img);
      setStatus(res.usedTiles ? 'Report ready \u2014 opening the print dialog.' : 'Report ready (schematic) \u2014 opening the print dialog.', 'ok');
      setTimeout(() => window.print(), 150);
    } catch (e) {
      setStatus('Could not build the report: ' + e.message, 'err');
    }
  }

  /* ============================================================
     25a. SHEET PREVIEW
     ============================================================
     The printable sheet, on screen. It is the same #report markup and the same
     stylesheet the print dialog uses, so this is a proof of the page rather than
     a lookalike, and every print option redraws it as it is changed. */
  const reportEl     = $('report');
  const previewStage = $('preview-stage');
  const previewFrame = $('preview-frame');

  let previewOpen   = false;
  let previewTimer  = null;
  let previewToken  = 0;      // only the newest build may touch the sheet
  let previewRes    = null;   // last drawn map picture
  let previewResKey = '';     // ...and the settings it was drawn for
  let previewPlanRev = 0;     // bumped whenever the plan itself changes

  /* Settings that change the picture. Anything else - title, date, which
     tables are on the sheet - redraws from the picture already drawn, which
     keeps typing in the title field instant. */
  function previewMapKey() {
    return [
      exportPrefs.frame, exportPrefs.mapType, exportPrefs.orientation,
      exportPrefs.scale, exportPrefs.scaleUnits, exportLayerName(),
      exportPrefs.include.map, exportPrefs.include.scale, exportPrefs.include.north,
      previewPlanRev
    ].join('|');
  }

  function schedulePreview() {
    if (!previewOpen) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 180);
  }

  async function renderPreview() {
    if (!previewOpen) return;
    const token = ++previewToken;
    const busy  = $('preview-busy');
    const img   = $('report-image');
    busy.classList.add('is-on');

    try {
      const key = previewMapKey();
      if (!exportPrefs.include.map) {
        /* The sheet drops the picture altogether, so there is nothing to draw
           and no reason to go looking for tiles. */
        previewRes = null;
        previewResKey = key;
      } else if (key !== previewResKey) {
        const res = await buildExportCanvas();
        /* A newer change landed while the tiles were loading - it owns the
           sheet now, and its own build is already under way. */
        if (token !== previewToken) return;
        if (!res) { busy.classList.remove('is-on'); return; }
        previewRes = res;
        previewResKey = key;
        img.src = res.canvas.toDataURL('image/png');
        await whenImageReady(img);
        if (token !== previewToken) return;
      }

      buildReportTables();
      /* The caption belongs to the picture, so it only exists with one. */
      if (previewRes) $('report-caption').textContent = exportCaption(previewRes);
      fitPreview();
      if (token === previewToken) busy.classList.remove('is-on');
    } catch (e) {
      if (token !== previewToken) return;
      busy.classList.remove('is-on');
      setStatus('Could not draw the preview: ' + e.message, 'err');
    }
  }

  /* Scale the whole page down to the space the stage has, rather than letting
     a narrow window squeeze the layout - the sheet is only ever shown at its
     true A4 size or smaller. The frame is given the scaled size so the scroll
     area fits the page exactly. */
  function fitPreview() {
    const page = previewFrame.firstElementChild;
    if (!page) return;
    const w = page.offsetWidth;
    const h = page.offsetHeight;
    if (!w) return;
    const scale = Math.min(1, (previewStage.clientWidth - 44) / w);
    previewFrame.style.transform = 'scale(' + scale + ')';
    previewFrame.style.width  = Math.round(w * scale) + 'px';
    previewFrame.style.height = Math.round(h * scale) + 'px';
  }

  /* The preview takes the whole screen, so the app behind it goes inert rather
     than merely being covered - a keyboard user should not be able to tab into
     controls nobody can see. */
  function setAppInert(on) {
    Array.prototype.forEach.call(document.body.children, el => {
      if (el.id === 'report') return;
      if (on) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  function openPreview() {
    if (previewOpen) return;
    previewOpen = true;
    reportEl.classList.add('preview-open');
    reportEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setAppInert(true);
    syncPrefControls();
    fitPreview();
    renderPreview();
    setTimeout(() => $('preview-close-btn').focus(), 60);
  }

  function closePreview() {
    if (!previewOpen) return;
    previewOpen = false;
    clearTimeout(previewTimer);
    reportEl.classList.remove('preview-open');
    reportEl.setAttribute('aria-hidden', 'true');
    setAppInert(false);
    if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
  }

  window.addEventListener('resize', () => { if (previewOpen) fitPreview(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewOpen) closePreview();
  });

  /* ============================================================
     25b. DOWNLOAD DIALOG
     ============================================================
     One place to take the plan away: a JSON file to upload again later, a PDF
     sheet, or a PNG picture. The map options feed straight into exportPrefs via
     [data-pref], so the sidebar panel and this dialog can never disagree. */
  const saveOpModal = document.getElementById('saveop-modal');
  let saveOpFormat  = 'json';

  const INCLUDE_FIELDS = [
    ['map', 'saveop-map'],
    ['scale', 'saveop-scale'],
    ['north', 'saveop-north'],
    ['deployments', 'saveop-deployments'],
    ['zones', 'saveop-zones']
  ];

  const FORMAT_BUTTONS = {
    json: 'saveop-fmt-json',
    pdf: 'saveop-fmt-pdf',
    png: 'saveop-fmt-png'
  };

  const GO_LABEL = {
    json: 'Download JSON',
    pdf: 'Download PDF',
    png: 'Download PNG'
  };

  function applyIncludeToInputs() {
    INCLUDE_FIELDS.forEach(([key, id]) => { $(id).checked = exportPrefs.include[key]; });
  }

  function readIncludeFromInputs() {
    INCLUDE_FIELDS.forEach(([key, id]) => { exportPrefs.include[key] = $(id).checked; });
    saveExportPrefs();
    schedulePreview();
  }

  function setSaveOpFormat(fmt) {
    saveOpFormat = FORMAT_BUTTONS[fmt] ? fmt : 'json';
    Object.keys(FORMAT_BUTTONS).forEach(k => {
      const el = $(FORMAT_BUTTONS[k]);
      const on = k === saveOpFormat;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-checked', String(on));
    });

    const isJson  = saveOpFormat === 'json';
    const isPng   = saveOpFormat === 'png';
    /* A JSON file is always complete, so neither option group applies to it. */
    $('saveop-map-opts').classList.toggle('is-hidden', isJson);
    $('saveop-include').classList.toggle('is-hidden', isJson);
    /* The table ticks only mean something when there is a table to print. */
    $('saveop-include').querySelectorAll('.is-table-only').forEach(el => {
      el.classList.toggle('is-hidden', isPng);
    });
    $('saveop-go-btn').textContent = GO_LABEL[saveOpFormat];
  }

  function refreshSaveOpSummary() {
    const nd = markings.deployments.length;
    const nz = markings.zones.length;
    const hasInd = validIndicator(savedIndicator);
    const bits = [];
    if (hasInd) bits.push('<b>1</b> map indicator');
    if (nd) bits.push('<b>' + nd + '</b> deployment' + (nd === 1 ? '' : 's'));
    if (nz) bits.push('<b>' + nz + '</b> zone' + (nz === 1 ? '' : 's'));
    $('saveop-summary').innerHTML = bits.length
      ? 'This plan holds ' + bits.join(', ') + '.'
      : 'Nothing has been placed yet \u2014 search a location, place deployments or draw a zone first.';

    /* Name the base map that "same as the screen" currently resolves to, so the
       option reads as a real choice rather than a mystery. */
    const screenOpt = $('saveop-maptype').querySelector('option[value="screen"]');
    const exportSide = $('export-maptype');
    if (screenOpt) screenOpt.textContent = 'Same as the map on screen \u2014 ' + layerLabel(currentLayerName);
    if (exportSide) {
      const o = exportSide.querySelector('option[value="screen"]');
      if (o) o.textContent = 'Same as the map on screen \u2014 ' + layerLabel(currentLayerName);
    }
  }

  function openSaveOpModal() {
    applyIncludeToInputs();
    setSaveOpFormat(saveOpFormat);
    refreshSaveOpSummary();
    syncPrefControls();
    openModal(saveOpModal);
  }

  async function runSaveOp() {
    if (saveOpFormat === 'json') {
      exportMarkingsFile();
      return;
    }

    readIncludeFromInputs();

    /* The picture options have to be on for a PDF or PNG. A file with nothing
       to draw would come out blank, which reads as a bug rather than a choice. */
    const applicable = saveOpFormat === 'png'
      ? INCLUDE_FIELDS.filter(([k]) => k !== 'deployments' && k !== 'zones')
      : INCLUDE_FIELDS;
    if (!applicable.some(([key]) => exportPrefs.include[key])) {
      setStatus('Tick at least one item to include in the download.', 'warn');
      openSaveOpModal();
      return;
    }

    if (saveOpFormat === 'png') { await downloadPlanPng(); return; }
    await downloadPlanPdf();
  }

  $('save-op-btn').addEventListener('click', openSaveOpModal);
  $('download-btn').addEventListener('click', openSaveOpModal);
  $('upload-btn').addEventListener('click', () => $('data-import-file').click());
  $('saveop-close').addEventListener('click', () => closeModal(saveOpModal));
  $('saveop-cancel-btn').addEventListener('click', () => closeModal(saveOpModal));
  $('saveop-modal').addEventListener('click', (e) => {
    if (e.target === saveOpModal) closeModal(saveOpModal);
  });
  Object.keys(FORMAT_BUTTONS).forEach(k => {
    $(FORMAT_BUTTONS[k]).addEventListener('click', () => setSaveOpFormat(k));
  });
  INCLUDE_FIELDS.forEach(([, id]) => $(id).addEventListener('change', readIncludeFromInputs));
  $('saveop-go-btn').addEventListener('click', () => {
    closeModal(saveOpModal);
    runSaveOp();
  });

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function planFileName(ext) {
    return 'gis-helper-plan-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  }

  async function downloadPlanPng() {
    setStatus('Rendering PNG\u2026', 'ok');
    try {
      const res = await buildExportCanvas();
      if (!res) return;
      res.canvas.toBlob(blob => {
        if (!blob) { setStatus('Could not create the PNG file.', 'err'); return; }
        downloadBlob(blob, planFileName('png'));
        const gap = res.usedTiles ? tileGapNote(lastTileGaps) : '';
        setStatus(gap || ('Plan exported as PNG' + (res.usedTiles ? '' : ' (schematic)') + '.'),
          gap ? 'warn' : 'ok');
      }, 'image/png');
    } catch (e) {
      setStatus('Could not export the PNG: ' + e.message, 'err');
    }
  }

  /* ============================================================
     25c. PDF WRITER  (no dependencies)
     ============================================================
     A real .pdf is assembled by hand. The map page embeds the export canvas as
     a JPEG - PDF understands JPEG natively through /DCTDecode, so nothing is
     re-encoded - and the data pages use the base-14 Helvetica fonts every
     reader already has. That keeps the app dependency-free while still giving
     a double-clickable file instead of a print dialog. */

  const PDF_BODY_TOP = PDF_H - 74;
  const PDF_BOTTOM = 42;
  const PDF_ROW_H = 15;
  /* A header band and a gap under every row, so the tables read as grids
     rather than as a wall of text. */
  const PDF_HEAD_H = 16;
  const PDF_ROW_GAP = 5;

  const C_INK    = [0.06, 0.09, 0.12];
  const C_MUTED  = [0.40, 0.46, 0.52];
  const C_ACCENT = [0.00, 0.66, 0.60];
  const C_RULE   = [0.79, 0.83, 0.87];
  const C_GRID   = [0.88, 0.91, 0.94];
  const C_HEADBG = [0.11, 0.16, 0.20];
  const C_BAND   = [0.96, 0.97, 0.98];

  /* PDF text strings are single bytes in the font's own encoding, not UTF-8.
     Encoding the stream with TextEncoder turned every Latin-1 character into
     two UTF-8 bytes, and a reader taking the font one byte at a time printed
     the first of the pair as a stray Â - which is how "289.6 km²" reached the
     sheet as "289.6 kmÂ²", once for every zone row. Nothing above 0xFF is
     reachable in WinAnsi anyway, so one byte per character is both correct
     and lossless for everything pdfString can produce. */
  function pdfBytes(str) {
    const s = String(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function pdfNum(n) { return (Math.round(n * 100) / 100).toString(); }
  function pdfColor(c) { return c.map(v => pdfNum(v)).join(' '); }

  /* WinAnsi is the encoding every base-14 font assumes. A handful of typographic
     characters have a byte in WinAnsi and are worth keeping; anything else the
     app can produce becomes '?' rather than corrupting the stream. */
  const WINANSI = {
    '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94,
    '\u2013': 0x96, '\u2014': 0x97, '\u2026': 0x85, '\u2022': 0x95,
    '\u20AC': 0x80, '\u2122': 0x99
  };

  function pdfString(value) {
    let out = '';
    const s = String(value == null ? '' : value);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const code = s.charCodeAt(i);
      if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
      else if (code === 10 || code === 13 || code === 9) out += ' ';
      /* Every space-like character the app can be handed - the no-break space
         above all, which arrives in pasted names and notes - is not wanted on
         a sheet and is written as a plain space. */
      else if (code === 0xA0 || code === 0x2000 || code === 0x2007 ||
               (code >= 0x2009 && code <= 0x200A) ||
               code === 0x202F || code === 0x205F || code === 0x3000) out += ' ';
      else if (code === 0x2032) out += "'";
      else if (code === 0x2033) out += '"';
      else if (WINANSI[ch] !== undefined) out += String.fromCharCode(WINANSI[ch]);
      else if (code >= 32 && code <= 126) out += ch;
      else if (code >= 160 && code <= 255) out += String.fromCharCode(code);
      else out += '?';
    }
    return out;
  }

  function pdfTextOp(x, y, size, text, bold, color) {
    return pdfColor(color || C_INK) + ' rg\n' +
      'BT /' + (bold ? 'F2' : 'F1') + ' ' + pdfNum(size) + ' Tf 1 0 0 1 ' +
      pdfNum(x) + ' ' + pdfNum(y) + ' Tm (' + pdfString(text) + ') Tj ET';
  }

  function pdfFillOp(x, y, w, h, color) {
    return pdfColor(color) + ' rg ' +
      pdfNum(x) + ' ' + pdfNum(y) + ' ' + pdfNum(w) + ' ' + pdfNum(h) + ' re f';
  }

  function pdfLineOp(x1, y1, x2, y2, color) {
    return pdfColor(color || C_RULE) + ' RG 0.7 w ' +
      pdfNum(x1) + ' ' + pdfNum(y1) + ' m ' + pdfNum(x2) + ' ' + pdfNum(y2) + ' l S';
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* Advance widths per 1000 em for the two base-14 faces the PDF uses, taken
     from the Adobe AFM: [Helvetica, Helvetica-Bold]. Only printable ASCII is
     listed; anything else falls back to a mid-width glyph.

     This replaces a flat 0.53 em average, which under-measured capitals by up
     to a third: headings were centred as if they were narrower than they
     really are, so they spilled across the column rules and crowded the
     heading next door, and trimmed cells could overrun their column. */
  const PDF_GLYPHS = {
    ' ': [278, 278], '!': [278, 333], '"': [355, 474], '#': [556, 556],
    '$': [556, 556], '%': [889, 889], '&': [667, 722], "'": [191, 238],
    '(': [333, 333], ')': [333, 333], '*': [389, 389], '+': [584, 584],
    ',': [278, 278], '-': [333, 333], '.': [278, 278], '/': [278, 278],
    '0': [556, 556], '1': [556, 556], '2': [556, 556], '3': [556, 556],
    '4': [556, 556], '5': [556, 556], '6': [556, 556], '7': [556, 556],
    '8': [556, 556], '9': [556, 556], ':': [278, 333], ';': [278, 333],
    '<': [584, 584], '=': [584, 584], '>': [584, 584], '?': [556, 611],
    '@': [1015, 975],
    'A': [667, 722], 'B': [667, 722], 'C': [722, 722], 'D': [722, 722],
    'E': [667, 667], 'F': [611, 611], 'G': [778, 778], 'H': [722, 722],
    'I': [278, 278], 'J': [500, 556], 'K': [667, 722], 'L': [556, 611],
    'M': [833, 833], 'N': [722, 722], 'O': [778, 778], 'P': [667, 667],
    'Q': [778, 778], 'R': [722, 722], 'S': [667, 667], 'T': [611, 611],
    'U': [722, 722], 'V': [667, 667], 'W': [944, 944], 'X': [667, 667],
    'Y': [667, 667], 'Z': [611, 611],
    '[': [278, 333], '\\': [278, 278], ']': [278, 333], '^': [469, 584],
    '_': [556, 556], '`': [333, 333],
    'a': [556, 556], 'b': [556, 611], 'c': [500, 556], 'd': [556, 611],
    'e': [556, 556], 'f': [278, 333], 'g': [556, 611], 'h': [556, 611],
    'i': [222, 278], 'j': [222, 278], 'k': [500, 556], 'l': [222, 278],
    'm': [833, 889], 'n': [556, 611], 'o': [556, 611], 'p': [556, 611],
    'q': [556, 611], 'r': [333, 389], 's': [500, 556], 't': [278, 333],
    'u': [556, 611], 'v': [500, 556], 'w': [722, 778], 'x': [500, 556],
    'y': [500, 556], 'z': [500, 500],
    '{': [334, 389], '|': [260, 280], '}': [334, 389], '~': [584, 584]
  };

  /* The width of a string in the font it will be drawn with, in points. */
  function pdfTextWidth(text, size, bold) {
    const face = bold ? 1 : 0;
    const s = String(text == null ? '' : text);
    let em = 0;
    for (let i = 0; i < s.length; i++) {
      const g = PDF_GLYPHS[s[i]];
      em += (g ? g[face] : 556) / 1000;
    }
    return em * size;
  }

  /* Trim a cell to what its column can actually hold, measured rather than
     counted, so the text keeps its gutters instead of running into the next
     column. */
  function fitCell(text, width, size, bold) {
    const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (pdfTextWidth(s, size, bold) <= width) return s;
    const ell = '\u2026';
    if (pdfTextWidth(ell, size, bold) > width) return '';
    let cut = s.length;
    while (cut > 0 && pdfTextWidth(s.slice(0, cut) + ell, size, bold) > width) cut--;
    return s.slice(0, cut).replace(/[ ,;]+$/, '') + ell;
  }

  /* Column widths are chosen to add up to the full text width
     (PDF_W - 2 * PDF_M = 782), so the grid lines close on the right-hand
     margin instead of stopping short. */
  const DEP_COLS = [
    { label: '#', w: 20, right: true },
    { label: 'Unit type', w: 92 },
    { label: 'Commander', w: 96 },
    /* TROOPS is a 32pt heading; 36 left it almost touching both column rules,
       so it is widened and the space taken from the two grid-reference
       columns, which have room to spare. */
    { label: 'Troops', w: 44, right: true },
    { label: 'Vehicles', w: 78 },
    { label: 'Arms & ammo', w: 86 },
    { label: 'Equipment', w: 86 },
    { label: 'Lat / Lon', w: 146, size: 7.2 },
    { label: 'MGRS 8', w: 134, size: 7.2 }
  ];

  const ZONE_COLS = [
    { label: '#', w: 20, right: true },
    { label: 'Zone name', w: 118 },
    { label: 'Details', w: 150, size: 7.2 },
    { label: 'Area', w: 78, right: true },
    { label: 'Vertices', w: 48, right: true },
    { label: 'Centre (approx.)', w: 158, size: 7.2 },
    { label: 'MGRS 8', w: 210, size: 7.2 }
  ];

  function colsWidth(cols) {
    return cols.reduce((sum, c) => sum + c.w, 0);
  }

  /* Whole points handed out in proportion to the weights, largest remainder,
     so the shares add up to exactly the total asked for. */
  function shareOut(weights, total) {
    const out = weights.map(() => 0);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0 || total <= 0) return out;
    let used = 0;
    weights.forEach((wt, i) => {
      out[i] = Math.floor(total * wt / sum);
      used += out[i];
    });
    for (let i = 0; used < total; i = (i + 1) % out.length, used++) out[i]++;
    return out;
  }

  /* Column widths for one table, sized to what the rows actually have to hold.

     The fixed widths above are the intended allocation, and they are left
     exactly as they are whenever the text fits inside them, so an ordinary plan
     looks precisely as it always has. A column whose content is wider than
     that asks for the extra and pays for it out of the columns with room to
     spare - which is what lets a long Details note fill the page instead of
     being cut to an ellipsis. A column can never be squeezed below the width
     its own heading needs, so no heading can be pushed off its line, and the
     row always adds up to the full text width, so the grid still closes on the
     right-hand margin. */
  function colsToFit(base, rows) {
    const PAD = 8;   /* the inset fitCell and the rules both work to */
    const floor = base.map(c => Math.ceil(pdfTextWidth(c.label.toUpperCase(), 7.5, true) + PAD));
    const need = base.map((c, i) => {
      let w = floor[i];
      rows.forEach(cells => {
        const v = String(cells[i] == null ? '' : cells[i]).replace(/\s+/g, ' ').trim();
        if (v) w = Math.max(w, Math.ceil(pdfTextWidth(v, c.size || 7.8, false) + PAD));
      });
      return w;
    });

    const width = base.map(c => c.w);
    const want  = need.map((n, i) => Math.max(0, n - width[i]));
    const spare = width.map((v, i) => Math.max(0, v - Math.max(need[i], floor[i])));
    const move  = Math.min(want.reduce((a, b) => a + b, 0), spare.reduce((a, b) => a + b, 0));
    if (move > 0) {
      const give = shareOut(want, move);
      const take = shareOut(spare, move);
      width.forEach((v, i) => { width[i] = v + give[i] - take[i]; });
    }

    /* Anything still short after that fair share may come out of the slack the
       other columns hold above their floors. The heading is the one thing that
       must never be squeezed, and the floor is exactly that guarantee, so this
       can hand a column the last point or two it needs to print in full rather
       than lose its final character to an ellipsis. */
    for (let i = 0; i < width.length; i++) {
      while (width[i] < need[i]) {
        let donor = -1, most = 0;
        for (let j = 0; j < width.length; j++) {
          if (j === i) continue;
          const slack = width[j] - floor[j];
          if (slack > most) { most = slack; donor = j; }
        }
        if (donor < 0) break;
        width[i]++;
        width[donor]--;
      }
    }

    return base.map((c, i) => ({ label: c.label, w: width[i], size: c.size, right: c.right }));
  }

  /* Faint vertical rules: one between each pair of columns plus the two outer
     edges, so the table reads as a bordered grid. */
  function pdfColRules(cols, y, h) {
    const w = colsWidth(cols);
    const ops = [pdfLineOp(PDF_M, y, PDF_M, y + h, C_GRID),
                 pdfLineOp(PDF_M + w, y, PDF_M + w, y + h, C_GRID)];
    let x = PDF_M;
    cols.slice(0, -1).forEach(c => {
      x += c.w;
      ops.push(pdfLineOp(x, y, x, y + h, C_GRID));
    });
    return ops;
  }

  function pdfTableHeaderOps(cols, y) {
    const w = colsWidth(cols);
    const ops = [pdfFillOp(PDF_M, y, w, PDF_HEAD_H, C_HEADBG)];
    let x = PDF_M;
    cols.forEach(c => {
      const label = c.label.toUpperCase();
      const size = 7.5;
      /* Centred in the column, measured with the real glyph widths so the
         heading lands where it looks centred and keeps clear air either side. */
      const tx = x + Math.max(3, (c.w - pdfTextWidth(label, size, true)) / 2);
      ops.push(pdfTextOp(tx, y + PDF_HEAD_H / 2 - 2.6, size, label, true, [1, 1, 1]));
      x += c.w;
    });
    ops.push.apply(ops, pdfColRules(cols, y, PDF_HEAD_H));
    ops.push(pdfLineOp(PDF_M, y, PDF_M + w, y, C_ACCENT));
    return ops;
  }

  function pdfTableRowOps(cols, cells, y, banded) {
    const w = colsWidth(cols);
    const ops = [];
    if (banded) ops.push(pdfFillOp(PDF_M, y, w, PDF_ROW_H, C_BAND));
    let x = PDF_M;
    cols.forEach((c, i) => {
      const size = c.size || 7.8;
      const txt = fitCell(cells[i], c.w - 8, size, false);
      /* Numbers and grid references read better right-aligned. */
      const tx = c.right ? x + c.w - 4 - pdfTextWidth(txt, size, false) : x + 4;
      ops.push(pdfTextOp(tx, y + 4.5, size, txt, false, C_INK));
      x += c.w;
    });
    ops.push.apply(ops, pdfColRules(cols, y, PDF_ROW_H));
    /* A rule under the row closes the cell it belongs to. */
    ops.push(pdfLineOp(PDF_M, y, PDF_M + w, y, C_RULE));
    return ops;
  }

  function zoneCentre(z) {
    const vs = z.vertices || [];
    if (!vs.length) return null;
    let la = 0, ln = 0;
    vs.forEach(v => { la += v.lat; ln += v.lng; });
    return { lat: la / vs.length, lon: ln / vs.length };
  }

  /* Facts, tables and unit types, as an ordered flow of blocks that the
     paginator below spreads over as many pages as they need. */
  function planBlocks() {
    const blocks = [];

    const facts = pdfFactsOps();
    const types = pdfTypesOps(facts.endY - 8);
    /* The facts block draws at fixed positions from the top of the body down,
       so its height is however far the unit-type chips finished. */
    blocks.push({ kind: 'ops', ops: facts.ops.concat(types.ops), h: PDF_BODY_TOP - types.endY });

    if (exportPrefs.include.deployments) {
      /* The rows are built before the blocks so the columns can be sized to
         what they actually have to carry. */
      const rows = markings.deployments.map((d, i) => {
        normaliseDeployment(d);
        return [
          String(i + 1), unitLabel(d.type), d.commander || '', String(d.troops || ''),
          d.vehicles || '', d.arms || '', d.equip || '',
          Number(d.lat).toFixed(5) + ', ' + Number(d.lon).toFixed(5),
          safeMgrs(d.lat, d.lon, 4)
        ];
      });
      const cols = colsToFit(DEP_COLS, rows);
      blocks.push({ kind: 'heading', h: 34, text: 'Deployments (' + markings.deployments.length + ')' });
      rows.forEach((cells, i) => {
        blocks.push({
          kind: 'row', h: PDF_ROW_H + PDF_ROW_GAP, table: 'dep',
          cols, banded: i % 2 === 1, cells
        });
      });
      if (!markings.deployments.length) blocks.push({ kind: 'note', h: 16, text: 'No deployments in this plan.' });
      else blocks.push({ kind: 'gap', h: 12 });
    }

    if (exportPrefs.include.zones) {
      const rows = markings.zones.map((z, i) => {
        const c = zoneCentre(z);
        return [
          String(i + 1), z.name, z.details || '', formatArea(z.areaM2), String((z.vertices || []).length),
          c ? c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) : '',
          c ? safeMgrs(c.lat, c.lon, 4) : ''
        ];
      });
      const cols = colsToFit(ZONE_COLS, rows);
      blocks.push({ kind: 'heading', h: 34, text: 'Zones (' + markings.zones.length + ')' });
      rows.forEach((cells, i) => {
        blocks.push({
          kind: 'row', h: PDF_ROW_H + PDF_ROW_GAP, table: 'zone',
          cols, banded: i % 2 === 1, cells
        });
      });
      if (!markings.zones.length) blocks.push({ kind: 'note', h: 16, text: 'No zones in this plan.' });
      else blocks.push({ kind: 'gap', h: 12 });
    }

    return blocks;
  }

  /* Header and footer, stamped onto a text page once the page count is known. */
  function pdfPageChrome(pageNo, pageCount) {
    const ops = [];
    const title = exportPrefs.title || 'GIS Helper \u2014 Tactical Plan';
    const bits = [];
    if (exportPrefs.date) bits.push('Plan date: ' + exportPrefs.date);
    bits.push('Generated ' + new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    bits.push('Base map: ' + layerLabel(exportLayerName()));
    bits.push(exportPrefs.scale === 'auto'
      ? 'Map scale: fitted to the plan'
      : 'Map scale: ' + scaleLabel(+exportPrefs.scale));
    bits.push(exportPrefs.orientation === 'fit' ? 'North facing: rotate to fit' : 'North facing: north up');
    const scope = {
      all: 'All deployments, zones and the map indicator',
      view: 'The area visible on the map at export time',
      deployments: 'Deployments only',
      zones: 'Zones only',
      indicator: 'The map indicator only'
    }[exportPrefs.frame];
    if (scope) bits.push('Framing: ' + scope);

    ops.push(pdfTextOp(PDF_M, PDF_H - 34, 13, title, true, C_INK));
    ops.push(pdfTextOp(PDF_M, PDF_H - 48, 8, bits.join('   \u00B7   '), false, C_MUTED));
    ops.push(pdfLineOp(PDF_M, PDF_H - 56, PDF_W - PDF_M, PDF_H - 56));
    ops.push(pdfTextOp(PDF_M, 24, 7.5,
      'Produced with GIS Helper \u2014 no account, no server. Positions are WGS 84.', false, C_MUTED));
    ops.push(pdfTextOp(PDF_W - PDF_M, 24, 7.5, 'Page ' + pageNo + ' of ' + pageCount, false, C_MUTED));
    return ops;
  }

  function pdfFactsOps() {
    const hasInd = validIndicator(savedIndicator);
    const ops = [pdfTextOp(PDF_M, PDF_BODY_TOP, 10, 'Map indicator', true, C_INK)];
    let y = PDF_BODY_TOP - 16;
    const rows = hasInd
      ? [
          ['Location', $('place').textContent || savedIndicator.name || ''],
          ['Lat / Lon (DD)', $('o-latlon').textContent],
          ['Lat / Lon (DMS)', $('o-dms').textContent],
          ['ArcGIS XY (UTM)', $('o-utm').textContent],
          ['MGRS 6-digit (100 m)', $('o-m6').textContent],
          ['MGRS 8-digit (10 m)', $('o-m8').textContent],
          ['MGRS 10-digit (1 m)', $('o-m10').textContent]
        ]
      : [['Location', 'No map indicator in this plan']];
    rows.forEach(r => {
      ops.push(pdfTextOp(PDF_M + 8, y, 8, r[0], false, C_MUTED));
      ops.push(pdfTextOp(PDF_M + 180, y, 8, fitCell(r[1], PDF_W - 2 * PDF_M - 190, 8), false, C_INK));
      y -= 13;
    });
    return { ops, endY: y };
  }

  function pdfTypesOps(startY) {
    const ops = [];
    let y = startY;
    if (!exportPrefs.include.deployments) return { ops, endY: y };

    const used = [];
    markings.deployments.forEach(d => {
      normaliseDeployment(d);
      if (!used.some(t => t.id === d.type)) used.push({ label: resolveType(d.type).label, color: d.color });
    });
    if (!used.length) return { ops, endY: y };

    ops.push(pdfTextOp(PDF_M, y, 10, 'Unit types in this plan', true, C_INK));
    y -= 18;
    let x = PDF_M + 8;
    used.forEach(t => {
      const label = t.label + '   ';
      const w = pdfTextWidth(label, 8, false) + 18;
      if (x + w > PDF_W - PDF_M) { x = PDF_M + 8; y -= 16; }
      ops.push(pdfFillOp(x, y + 1, 8, 8, hexToRgb(t.color) || [0.5, 0.5, 0.5]));
      ops.push(pdfTextOp(x + 13, y + 2, 8, label, false, C_INK));
      x += w;
    });
    /* The chips finish well clear of whatever comes next - the Deployments
       heading that usually follows needs room of its own, or the legend and
       the table head read as one block. */
    return { ops, endY: y - 20 };
  }

  function canvasToJpeg(canvas, quality) {
    const url = canvas.toDataURL('image/jpeg', quality || 0.9);
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xFF;
    return { bytes, width: canvas.width, height: canvas.height };
  }

  /* Objects are numbered here rather than by a library, so the cross-reference
     table is a plain loop over the same list. */
  function assemblePdf(pages, img) {
    const objs = [];
    const imgObjNum = img ? 5 : 0;
    const firstPage = img ? 6 : 5;

    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [' +
      pages.map((_, i) => (firstPage + i * 2) + ' 0 R').join(' ') +
      '] /Count ' + pages.length + ' >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    if (img) {
      objs.push({
        head: pdfBytes(
          '<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode' +
          ' /Length ' + img.bytes.length + ' >>\nstream\n'),
        mid: img.bytes,
        tail: pdfBytes('\nendstream')
      });
    }

    pages.forEach((page, i) => {
      const contentNum = firstPage + i * 2 + 1;
      objs.push(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PDF_W + ' ' + PDF_H + ']' +
        ' /Resources <<' +
        (img ? ' /XObject << /Im0 ' + imgObjNum + ' 0 R >>' : '') +
        ' /Font << /F1 3 0 R /F2 4 0 R >> >>' +
        ' /Contents ' + contentNum + ' 0 R >>'
      );
      objs.push({
        head: pdfBytes('<< /Length ' + page.bytes.length + ' >>\nstream\n'),
        mid: page.bytes,
        tail: pdfBytes('\nendstream')
      });
    });

    const chunks = [];
    let pos = 0;
    const put = u8 => { chunks.push(u8); pos += u8.length; };

    put(pdfBytes('%PDF-1.4\n'));
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   /* binary marker */

    const offsets = [];
    objs.forEach((o, i) => {
      offsets[i + 1] = pos;
      put(pdfBytes((i + 1) + ' 0 obj\n'));
      if (typeof o === 'string') put(pdfBytes(o));
      else { put(o.head); put(o.mid); put(o.tail); }
      put(pdfBytes('\nendobj\n'));
    });

    let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= objs.length; i++) {
      xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\n' +
            'startxref\n' + pos + '\n%%EOF\n';
    put(pdfBytes(xref));

    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function buildPlanPdf() {
    let img = null;
    let caption = '';
    if (exportPrefs.include.map) {
      setStatus('Preparing the map picture\u2026', 'ok');
      const res = await buildExportCanvas();
      if (!res) return null;
      img = canvasToJpeg(res.canvas, 0.9);
      caption = exportCaption(res);
    }

    /* The map is its own page; the data flow starts on the next one. */
    const blocks = planBlocks();
    const pages = [];

    /* Lay the blocks out top-down, starting a new page when the next one will
       not fit above the footer. A table's header is drawn once, and again at
       the top of any page the table continues onto. */
    const textPages = [];
    let cur = [];
    let curY = PDF_BODY_TOP;
    /* Which table, if any, already has its header on the page being filled. */
    let openTable = null;

    const flush = () => {
      if (cur.length) textPages.push(cur);
      cur = [];
      curY = PDF_BODY_TOP;
      openTable = null;
    };

    blocks.forEach(b => {
      /* A row may need a header band above it, so both are measured together -
         that keeps a header from being stranded at the foot of a page. */
      if (b.kind === 'row') {
        const headH = (openTable === b.table) ? 0 : PDF_HEAD_H;
        if (curY - (headH + b.h) < PDF_BOTTOM) flush();

        let y = curY;
        if (openTable !== b.table) {
          cur.push.apply(cur, pdfTableHeaderOps(b.cols, y - PDF_HEAD_H));
          openTable = b.table;
          y -= PDF_HEAD_H;
        }
        cur.push.apply(cur, pdfTableRowOps(b.cols, b.cells, y - PDF_ROW_H, b.banded));
        curY = y - PDF_ROW_H - PDF_ROW_GAP;
        return;
      }

      /* A spacer is only a cursor advance. It must never trigger a flush, or a
         trailing one would leave a blank page at the end of the document. */
      if (b.kind === 'gap') { curY -= b.h; return; }

      if (curY - b.h < PDF_BOTTOM) flush();
      if (b.kind === 'ops') {
        cur.push.apply(cur, b.ops);
      } else if (b.kind === 'heading') {
        /* A section title always starts a fresh table. */
        openTable = null;
        cur.push(pdfTextOp(PDF_M, curY, 10, b.text, true, C_INK));
        cur.push(pdfLineOp(PDF_M, curY - 6, PDF_W - PDF_M, curY - 6, C_ACCENT));
      } else if (b.kind === 'note') {
        cur.push(pdfTextOp(PDF_M + 8, curY - 6, 8, b.text, false, C_MUTED));
      }
      curY -= b.h;
    });
    flush();

    const total = (img ? 1 : 0) + textPages.length;

    if (img) {
      const availW = PDF_W - 2 * PDF_M;
      const availH = PDF_H - 2 * PDF_M - 18;
      const s = Math.min(availW / img.width, availH / img.height);
      const w = img.width * s, h = img.height * s;
      const x = (PDF_W - w) / 2, y = PDF_H - PDF_M - h - 16;
      const ops = [
        'q ' + pdfNum(w) + ' 0 0 ' + pdfNum(h) + ' ' + pdfNum(x) + ' ' + pdfNum(y) + ' cm /Im0 Do Q',
        pdfColor(C_RULE) + ' RG 0.8 w ' +
          pdfNum(x) + ' ' + pdfNum(y) + ' ' + pdfNum(w) + ' ' + pdfNum(h) + ' re S',
        pdfTextOp(PDF_M, PDF_H - 34, 13, exportPrefs.title || 'GIS Helper \u2014 Tactical Plan', true, C_INK),
        pdfTextOp(PDF_M, 26, 8, caption, false, C_MUTED),
        pdfTextOp(PDF_W - PDF_M, 26, 8, 'Page 1 of ' + total, false, C_MUTED)
      ];
      pages.push({ bytes: pdfBytes(ops.join('\n')) });
    }

    /* The header and footer quote the page count, so they are stamped on once
       the flow has decided how many pages it needs. */
    textPages.forEach((pageOps, i) => {
      const pageNo = (img ? 1 : 0) + i + 1;
      const ops = pageOps.concat(pdfPageChrome(pageNo, total));
      pages.push({ bytes: pdfBytes(ops.join('\n')) });
    });

    return assemblePdf(pages, img);
  }

  async function downloadPlanPdf() {
    setStatus('Building PDF\u2026', 'ok');
    /* Cleared up front: with the map left off, no canvas is built and a stale
       tally from an earlier export would otherwise raise a false warning. */
    lastTileGaps = { missing: 0, total: 0 };
    try {
      const blob = await buildPlanPdf();
      if (!blob) return;
      downloadBlob(blob, planFileName('pdf'));
      /* Never let a patchy base map pass as a clean sheet. */
      const gap = tileGapNote(lastTileGaps);
      setStatus(gap || 'Plan downloaded as PDF.', gap ? 'warn' : 'ok');
    } catch (e) {
      setStatus('Could not build the PDF: ' + e.message, 'err');
    }
  }

  $('report-print-btn').addEventListener('click', openReport);
  $('report-png-btn').addEventListener('click', downloadPlanPng);

  $('report-preview-btn').addEventListener('click', openPreview);
  $('preview-close-btn').addEventListener('click', closePreview);
  /* Printing rebuilds the sheet from scratch, so the preview can be as stale as
     it likes - what matters is that the print dialog gets a fresh one. */
  $('preview-print-btn').addEventListener('click', openReport);
  $('preview-pdf-btn').addEventListener('click', downloadPlanPdf);

  /* ---- export options UI ---- */
  /* Every [data-pref] control is wired once at boot, so adding an option to
     the sidebar and to the Download dialog is just markup. */

  /* ============================================================
     26. BOOT
     ============================================================ */
  loadCustomTypes();
  loadMarkingsFromStorage();
  loadExportPrefs();
  initPrefControls();
  renderTypeSelect();
  populateIconOptions();
  updateDeployPreview();

  /* Restore the last session if there is one; otherwise open on the default view. */
  const restored = validIndicator(savedIndicator);
  if (restored) {
    applyIndicator();
    $('query').value = savedIndicator.name || '';
  } else {
    $('query').value = 'Statue of Liberty, New York';
    commitPoint(START.lat, START.lon, 'Statue of Liberty, New York, USA', false);
  }
  previewPoint(restored ? savedIndicator.lat : START.lat, restored ? savedIndicator.lon : START.lon);
  applyMarkingsToMap();
  updateDataStatus();

  const markingCount = markings.deployments.length + markings.zones.length;
  setStatus(
    restored || markingCount
      ? 'Ready \u00B7 restored ' + (restored ? '1 map indicator' : 'no map indicator') +
        (markingCount ? ' and ' + markingCount + ' marking' + (markingCount === 1 ? '' : 's') : '')
      : 'Ready');

})();
