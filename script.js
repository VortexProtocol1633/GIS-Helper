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

  L.control.zoom({ position: 'topleft' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: true, metric: true }).addTo(map);

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
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
        if (e.target.closest('.deploy-del') || e.target.closest('.deploy-dup') || e.target.closest('.deploy-grip')) return;
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
    const opacity = parseFloat($('zone-opacity').value) || 0.35;
    const latlngs = drawVertices.map(v => [v.lat, v.lng]);
    const area    = polygonAreaM2(drawVertices);

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      color,
      opacity,
      vertices: drawVertices.map(v => ({ lat: +v.lat.toFixed(8), lng: +v.lng.toFixed(8) })),
      areaM2: +area.toFixed(0),
      timestamp: Date.now()
    };

    markings.zones.push(entry);

    const poly = L.polygon(latlngs, {
      color: color,
      weight: 2.5,
      fillColor: color,
      fillOpacity: opacity
    }).addTo(zoneLayerGroup);

    poly.bindPopup(
      '<div style="font-family:var(--font);min-width:150px;">' +
        '<div style="font-size:14px;font-weight:700;color:' + color + ';">' + name + '</div>' +
        '<div style="font-size:11.5px;color:#B4C5D0;margin-top:4px;">\uD83D\uDCC2 ' + formatArea(area) + '</div>' +
      '</div>'
    );

    saveMarkings();
    renderZoneList();
    renderLegend();
    updateDataStatus();
    setStatus('Zone saved: ' + name + ' (' + formatArea(area) + ')', 'ok');
    $('zone-name').value = '';
  }

  function removeZone(id) {
    markings.zones = markings.zones.filter(z => z.id !== id);
    zoneLayerGroup.clearLayers();
    markings.zones.forEach(z => {
      const poly = L.polygon(z.vertices.map(v => [v.lat, v.lng]), {
        color: z.color,
        weight: 2.5,
        fillColor: z.color,
        fillOpacity: z.opacity
      }).addTo(zoneLayerGroup);
      poly.bindPopup(
        '<div style="font-family:var(--font);min-width:150px;">' +
          '<div style="font-size:14px;font-weight:700;color:' + z.color + ';">' + z.name + '</div>' +
          '<div style="font-size:11.5px;color:#B4C5D0;margin-top:4px;">\uD83D\uDCC2 ' + formatArea(z.areaM2) + '</div>' +
        '</div>'
      );
    });
    saveMarkings();
    renderZoneList();
    renderLegend();
    updateDataStatus();
  }

  function clearAllZones() {
    if (!markings.zones.length) return;
    if (!confirm('Remove all zones?')) return;
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
          '<div class="zone-meta">' + formatArea(z.areaM2) + ' \u00B7 ' + z.vertices.length + ' vertices</div>' +
        '</div>' +
        '<button class="zone-del" title="Remove" data-id="' + z.id + '">\u00D7</button>' +
      '</div>'
    )).join('');

    el.querySelectorAll('.zone-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.zone-del')) return;
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
  }

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
    zoneLayerGroup.clearLayers();
    markings.zones.forEach(z => {
      const poly = L.polygon(z.vertices.map(v => [v.lat, v.lng]), {
        color: z.color,
        weight: 2.5,
        fillColor: z.color,
        fillOpacity: z.opacity
      }).addTo(zoneLayerGroup);
      poly.bindPopup(
        '<div style="font-family:var(--font);min-width:150px;">' +
          '<div style="font-size:14px;font-weight:700;color:' + z.color + ';">' + z.name + '</div>' +
          '<div style="font-size:11.5px;color:#B4C5D0;margin-top:4px;">\uD83D\uDCC2 ' + formatArea(z.areaM2) + '</div>' +
        '</div>'
      );
    });
    renderDeployList();
    renderZoneList();
    renderLegend();
    updateDataStatus();
  }

  function updateDataStatus() {
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

    let html = builtinTypeList().map(t =>
      '<option value="' + t.id + '">' + t.label + '</option>'
    ).join('');

    if (customUnitTypes.length) {
      html += '<optgroup label="Your types">' + customUnitTypes.map(t =>
        '<option value="' + t.id + '">' + t.label + '</option>'
      ).join('') + '</optgroup>';
    }

    sel.innerHTML = html;
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

  function removeCustomType(id) {
    const t = customUnitTypes.find(x => x.id === id);
    if (!t) return;

    const used = customTypeInUse(id);
    const msg = used
      ? 'Delete "' + t.label + '"?\n\n' + used + ' deployment' + (used > 1 ? 's' : '') +
        ' currently use' + (used > 1 ? '' : 's') + ' this type. They will be reassigned to "' +
        BUILTIN_UNIT_TYPES[DEFAULT_TYPE].label + '" and keep their own details.'
      : 'Delete the custom type "' + t.label + '"?';

    if (!confirm(msg)) return;

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
  const FONT = 'Poppins, "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
  const EXPORT_ACCENT = '#00C8B4';
  const M_TO_FT = 3.280839895;
  const NICE_METRES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
                       10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const NICE_FEET = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
                     15840, 26400, 52800, 105600, 264000];

  /* Export preferences are UI settings, not plan data, so they are kept out of
     the shared session JSON on purpose and stored under their own key. */
  const EXPORT_PREFS_KEY = 'gis-helper-export-prefs-v1';
  const exportPrefs = {
    frame: 'all',        // all | view | deployments | zones | indicator
    rotate: false,       // rotate the plan onto its longest axis
    scaleUnits: 'both',  // both | metric | imperial | none
    title: '',
    date: ''
  };

  function loadExportPrefs() {
    try {
      const raw = localStorage.getItem(EXPORT_PREFS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) || {};
      if (['all', 'view', 'deployments', 'zones', 'indicator'].indexOf(d.frame) !== -1) exportPrefs.frame = d.frame;
      if (['both', 'metric', 'imperial', 'none'].indexOf(d.scaleUnits) !== -1) exportPrefs.scaleUnits = d.scaleUnits;
      exportPrefs.rotate = !!d.rotate;
      exportPrefs.title = String(d.title || '').slice(0, 60);
      exportPrefs.date = /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : '';
    } catch (e) {}
  }

  function saveExportPrefs() {
    try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify(exportPrefs)); } catch (e) {}
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
    if (!exportPrefs.rotate || pts.length < 2) return 0;
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

  /* Largest zoom at which the rotated plan still fits inside the margin. */
  function pickExportZoom(pts, rot) {
    const layerMax = (baseLayers[currentLayerName] && baseLayers[currentLayerName].options.maxZoom) || 18;
    const availW = EXPORT_W - 2 * EXPORT_MARGIN;
    const availH = EXPORT_H - 2 * EXPORT_MARGIN;
    for (let z = Math.min(layerMax, 18); z >= 1; z--) {
      const b = rotatedFrame(pts, z, rot);
      if (b.w <= availW && b.h <= availH) return z;
    }
    return 1;
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

  function loadTileImage(url) {
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => done(null), 7000);
      /* Set before src: if the server sends no CORS header this fires onerror
         instead of quietly tainting the canvas. */
      img.crossOrigin = 'anonymous';
      img.onload = () => { clearTimeout(timer); done(img); };
      img.onerror = () => { clearTimeout(timer); done(null); };
      img.src = url;
    });
  }

  async function drawBaseTiles(ctx, proj, pts) {
    const layer = baseLayers[currentLayerName];
    const tpl = layer && layer._url;
    if (!tpl) return false;

    const z = proj.zoom;
    const rot = proj.rot;

    /* Unrotated tile footprint. When rotated, the sheet must also be large
       enough that its rotated outline still covers the whole canvas. */
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    pts.forEach(p => {
      const q = worldPx(p.lat, p.lon, z);
      ux0 = Math.min(ux0, q.x); ux1 = Math.max(ux1, q.x);
      uy0 = Math.min(uy0, q.y); uy1 = Math.max(uy1, q.y);
    });
    const PAD = 128;
    ux0 -= PAD; uy0 -= PAD; ux1 += PAD; uy1 += PAD;

    let ow = Math.ceil(ux1 - ux0), oh = Math.ceil(uy1 - uy0);
    if (rot) {
      const ca = Math.abs(Math.cos(rot)), sa = Math.abs(Math.sin(rot));
      const availW = EXPORT_W - 2 * EXPORT_MARGIN, availH = EXPORT_H - 2 * EXPORT_MARGIN;
      ow = Math.max(ow, Math.ceil(availW * ca + availH * sa));
      oh = Math.max(oh, Math.ceil(availH * ca + availW * sa));
    }

    /* Offscreen origin is the point the projector centres on, minus half the
       sheet, which is what makes the blit below line up exactly. */
    const ox = Math.round(proj.c.x - ow / 2), oy = Math.round(proj.c.y - oh / 2);

    const x0 = Math.floor(ox / 256), x1 = Math.floor((ox + ow - 1) / 256);
    const y0 = Math.floor(oy / 256), y1 = Math.floor((oy + oh - 1) / 256);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > 220 || ow > 4000 || oh > 4000) return false;   // stay a well-behaved tile client

    const subs = layer.options.subdomains || 'abc';
    const jobs = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const sub = Array.isArray(subs) ? subs[Math.abs(x + y) % subs.length] : subs[0];
        const url = L.Util.template(tpl, { s: sub, z, x, y, r: '' });
        jobs.push(loadTileImage(url).then(img => ({ img, x, y })));
      }
    }

    const tiles = await Promise.all(jobs);
    const got = tiles.filter(t => t.img).length;
    if (got < tiles.length * 0.6) return false;   // blocked or mostly dead

    let target = ctx;
    let sheet = null;
    if (rot) {
      sheet = document.createElement('canvas');
      sheet.width = ow;
      sheet.height = oh;
      target = sheet.getContext('2d');
      /* Neutral sheet so the corners outside the rotated map read as page,
         not as a rendering failure. */
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

  function drawTag(ctx, x, y, text, color) {
    ctx.font = '600 15px ' + FONT;
    const w = ctx.measureText(text).width + 16;
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

  function drawIndicator(ctx, proj) {
    if (!validIndicator(savedIndicator)) return;
    const p = proj.project(savedIndicator.lat, savedIndicator.lon);

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 26, p.y); ctx.lineTo(p.x + 26, p.y);
    ctx.moveTo(p.x, p.y - 26); ctx.lineTo(p.x, p.y + 26);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.bezierCurveTo(p.x - 13, p.y - 15, p.x - 11, p.y - 32, p.x, p.y - 32);
    ctx.bezierCurveTo(p.x + 11, p.y - 32, p.x + 13, p.y - 15, p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = EXPORT_ACCENT;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#06131A';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y - 22, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#06131A';
    ctx.fill();

    drawTag(ctx, p.x, p.y - 50, savedIndicator.name || 'Map indicator', EXPORT_ACCENT);
  }

  function drawScaleBar(ctx, proj, centerLat) {
    const units = exportPrefs.scaleUnits;
    if (units === 'none') return;
    const mpp = proj.metresPerPixel(centerLat);
    if (!(mpp > 0)) return;

    const bars = [];
    if (units === 'metric' || units === 'both') {
      bars.push({ m: pickScaleValue(NICE_METRES, mpp), imperial: false });
    }
    if (units === 'imperial' || units === 'both') {
      bars.push({ m: pickScaleValue(NICE_FEET, mpp * M_TO_FT) / M_TO_FT, imperial: true });
    }

    let y = EXPORT_H - 30;
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

  /* The arrow must follow the rotation, so it always points at true north
     within the (possibly rotated) plan. */
  function drawNorthArrow(ctx, proj) {
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
    const layer = baseLayers[currentLayerName];
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

  async function buildExportCanvas() {
    const pts = prepareFramePoints();
    if (!pts) return null;

    const rot = fitAngle(pts);
    const proj = makeProjector(pts, pickExportZoom(pts, rot), rot);
    const mid = centreOf(pts);

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_W;
    canvas.height = EXPORT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');

    let usedTiles = false;
    try { usedTiles = await drawBaseTiles(ctx, proj, pts); } catch (e) { usedTiles = false; }
    if (!usedTiles) drawSchematicBase(ctx, proj);

    drawZones(ctx, proj);
    drawDeployments(ctx, proj);
    drawIndicator(ctx, proj);
    drawScaleBar(ctx, proj, mid.lat);
    drawNorthArrow(ctx, proj);
    drawAttribution(ctx, usedTiles);

    return { canvas, usedTiles, rot };
  }

  /* ---- report tables ---- */
  function buildReportTables() {
    $('report-title').textContent = exportPrefs.title || 'GIS Helper \u2014 Tactical Plan';

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
            '<td class="num">' + esc(formatArea(z.areaM2)) + '</td>' +
            '<td class="num">' + vs.length + '</td>' +
            '<td class="mono">' + (clat === null ? '\u2014' : clat.toFixed(5) + ', ' + clon.toFixed(5)) + '</td>' +
            '<td class="mono">' + (clat === null ? '\u2014' : esc(safeMgrs(clat, clon, 4))) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="report-empty">No zones in this plan.</td></tr>';

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
    $('report-types-block').style.display = used.length ? '' : 'none';
  }

  function exportCaption(res) {
    const bits = [];
    bits.push(res.usedTiles ? 'Base map: ' + currentLayerName + '.' : 'Schematic plan \u2014 base map tiles were unavailable, so positions are shown on a coordinate grid.');
    if (Math.abs(res.rot) > 0.01) {
      bits.push('Rotated ' + Math.abs(Math.round(res.rot * 180 / Math.PI)) + '\u00B0 ' + (res.rot < 0 ? 'west' : 'east') + ' of north to fit the frame.');
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
      try { await img.decode(); } catch (e) {}
      setStatus(res.usedTiles ? 'Report ready \u2014 opening the print dialog.' : 'Report ready (schematic) \u2014 opening the print dialog.', 'ok');
      setTimeout(() => window.print(), 150);
    } catch (e) {
      setStatus('Could not build the report: ' + e.message, 'err');
    }
  }

  async function downloadPlanPng() {
    setStatus('Rendering PNG\u2026', 'ok');
    try {
      const res = await buildExportCanvas();
      if (!res) return;
      res.canvas.toBlob(blob => {
        if (!blob) { setStatus('Could not create the PNG file.', 'err'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gis-helper-plan-' + new Date().toISOString().slice(0, 10) + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus('Plan exported as PNG' + (res.usedTiles ? '' : ' (schematic)') + '.', 'ok');
      }, 'image/png');
    } catch (e) {
      setStatus('Could not export the PNG: ' + e.message, 'err');
    }
  }

  $('report-print-btn').addEventListener('click', openReport);
  $('report-png-btn').addEventListener('click', downloadPlanPng);

  /* ---- export options UI ---- */
  function applyExportPrefsToInputs() {
    $('export-frame').value = exportPrefs.frame;
    $('export-scale').value = exportPrefs.scaleUnits;
    $('export-rotate').checked = exportPrefs.rotate;
    $('export-title').value = exportPrefs.title;
    $('export-date').value = exportPrefs.date;
  }

  $('export-frame').addEventListener('change', (e) => {
    exportPrefs.frame = e.target.value;
    saveExportPrefs();
  });
  $('export-scale').addEventListener('change', (e) => {
    exportPrefs.scaleUnits = e.target.value;
    saveExportPrefs();
  });
  $('export-rotate').addEventListener('change', (e) => {
    exportPrefs.rotate = e.target.checked;
    saveExportPrefs();
  });
  $('export-title').addEventListener('input', (e) => {
    exportPrefs.title = e.target.value.slice(0, 60);
    saveExportPrefs();
  });
  $('export-date').addEventListener('change', (e) => {
    exportPrefs.date = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : '';
    saveExportPrefs();
  });

  /* ============================================================
     26. BOOT
     ============================================================ */
  loadCustomTypes();
  loadMarkingsFromStorage();
  loadExportPrefs();
  applyExportPrefsToInputs();
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
