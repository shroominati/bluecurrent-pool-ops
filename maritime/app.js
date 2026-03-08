const state = {
  view: "predict",
  config: null,
  overview: null,
  analysis: null,
  liveRegions: [],
  referencePoints: [],
  predict: {
    surface: "land",
    selectedLandZoneId: null,
  },
  references: {
    filter: "all",
  },
  maps: {
    predict: null,
    predictLayer: null,
    references: null,
    referencesLayer: null,
    tracker: null,
    trackerLayer: null,
  },
  tracker: {
    selectedZoneId: null,
    watchId: null,
    currentPosition: null,
    path: [],
    liveBundle: null,
    refreshTimer: null,
  },
};

const refs = {
  configText: document.getElementById("configText"),
  warningText: document.getElementById("warningText"),
  summarySources: document.getElementById("summarySources"),
  summaryJournals: document.getElementById("summaryJournals"),
  summaryWrecks: document.getElementById("summaryWrecks"),
  viewTabs: document.getElementById("viewTabs"),
  predictSurfaceTabs: document.getElementById("predictSurfaceTabs"),
  overviewView: document.getElementById("overviewView"),
  predictView: document.getElementById("predictView"),
  referencesView: document.getElementById("referencesView"),
  wrecksView: document.getElementById("wrecksView"),
  predictEyebrow: document.getElementById("predictEyebrow"),
  predictTitle: document.getElementById("predictTitle"),
  predictFocusEyebrow: document.getElementById("predictFocusEyebrow"),
  predictFocusTitle: document.getElementById("predictFocusTitle"),
  predictScore: document.getElementById("predictScore"),
  predictMap: document.getElementById("predictMap"),
  predictSummary: document.getElementById("predictSummary"),
  predictList: document.getElementById("predictList"),
  referenceFilters: document.getElementById("referenceFilters"),
  referenceMap: document.getElementById("referenceMap"),
  referenceStats: document.getElementById("referenceStats"),
  referenceList: document.getElementById("referenceList"),
  wreckAnchorTargets: document.getElementById("wreckAnchorTargets"),
  regionCards: document.getElementById("regionCards"),
  startTrackingBtn: document.getElementById("startTrackingBtn"),
  stopTrackingBtn: document.getElementById("stopTrackingBtn"),
  trackerSummary: document.getElementById("trackerSummary"),
  trackerMap: document.getElementById("trackerMap"),
  trackerConditions: document.getElementById("trackerConditions"),
  analyzeForm: document.getElementById("analyzeForm"),
  observationForm: document.getElementById("observationForm"),
  analysisResult: document.getElementById("analysisResult"),
  zoneList: document.getElementById("zoneList"),
  importStatus: document.getElementById("importStatus"),
  modelNotes: document.getElementById("modelNotes"),
  journalList: document.getElementById("journalList"),
  savedAnalysisList: document.getElementById("savedAnalysisList"),
  wreckList: document.getElementById("wreckList"),
  stormList: document.getElementById("stormList"),
  toast: document.getElementById("toast"),
};

function showToast(message, isError = false) {
  refs.toast.textContent = message;
  refs.toast.classList.remove("hidden");
  refs.toast.classList.toggle("error", isError);
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => refs.toast.classList.add("hidden"), 4200);
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function fmtPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function fmtCoord(value) {
  return Number(value).toFixed(4);
}

function fmtDateTime(value) {
  if (!value) {
    return "n/a";
  }
  return new Date(value).toLocaleString();
}

function mapLinksForZone(zone, currentPosition = null) {
  const destination = `${zone.lat},${zone.lon}`;
  const query = encodeURIComponent(destination);
  const googleSearch = `https://www.google.com/maps/search/?api=1&query=${query}`;
  const appleSearch = `https://maps.apple.com/?ll=${query}&q=${query}`;
  const googleDirections = currentPosition
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        `${currentPosition.lat},${currentPosition.lon}`,
      )}&destination=${query}`
    : googleSearch;
  const appleDirections = currentPosition
    ? `https://maps.apple.com/?saddr=${encodeURIComponent(
        `${currentPosition.lat},${currentPosition.lon}`,
      )}&daddr=${query}&dirflg=d`
    : appleSearch;
  return {
    googleSearch,
    appleSearch,
    googleDirections,
    appleDirections,
    preferred:
      typeof navigator !== "undefined" && /Apple/i.test(navigator.vendor || "")
        ? appleDirections
        : googleDirections,
  };
}

function coordLinkHtml(zone, currentPosition = null) {
  const links = mapLinksForZone(zone, currentPosition);
  return `<a href="${escapeHtml(links.preferred)}" target="_blank" rel="noreferrer">${escapeHtml(
    `${fmtCoord(zone.lat)}, ${fmtCoord(zone.lon)}`,
  )}</a>`;
}

function nearbyWreckSummary(wrecks) {
  const items = Array.isArray(wrecks) ? wrecks : [];
  if (!items.length) {
    return "No nearby known wreck anchors loaded.";
  }
  return items
    .slice(0, 5)
    .map((wreck) =>
      wreck.depthFeet !== null && wreck.depthFeet !== undefined
        ? `${wreck.name} (${wreck.depthFeet} ft, ${wreck.distanceMiles} mi)`
        : `${wreck.name} (${wreck.distanceMiles} mi)`,
    )
    .join(" • ");
}

function nearbyWreckReferenceList(wrecks, maxItems = 12) {
  const items = Array.isArray(wrecks) ? wrecks.slice(0, maxItems) : [];
  if (!items.length) {
    return '<p class="meta-line">No nearby known wreck anchors loaded.</p>';
  }
  return `
    <div class="pill-row">
      ${items
        .map(
          (wreck) =>
            `<span class="tag">${escapeHtml(wreck.name)} • ${
              wreck.depthFeet !== null && wreck.depthFeet !== undefined
                ? `${escapeHtml(String(wreck.depthFeet))} ft • `
                : ""
            }${escapeHtml(String(wreck.distanceMiles))} mi</span>`,
        )
        .join("")}
    </div>
  `;
}

function zoneFocusGuidance(zone) {
  if (!zone) {
    return [];
  }
  if (Array.isArray(zone.predictionDrivers) && zone.predictionDrivers.length) {
    return zone.predictionDrivers;
  }
  const guidance = [];
  if (zone.regionKey === "treasure-coast") {
    guidance.push("Start with reef-and-shoal transitions parallel to the Treasure Coast breaker line.");
  }
  if (zone.regionKey === "space-coast") {
    guidance.push("Start with shoal shoulders and current-set transitions off Cape Canaveral and Cocoa.");
  }
  if (Number(zone.evidence?.wreckEvidence || 0) > 15) {
    guidance.push("Use nearby charted wrecks as control points and inspect the down-current scatter corridor around them.");
  }
  if (Number(zone.evidence?.driftRetention || 0) >= 0.68) {
    guidance.push("Prioritize drift pockets where heavier material could settle after storm transport.");
  }
  if (Number(zone.evidence?.seabedRetention || 0) >= 0.64) {
    guidance.push("Focus on hard-bottom to sand transitions that retain heavier debris better than open sand flats.");
  }
  if (Number(zone.evidence?.surveyGap || 0) >= 0.6) {
    guidance.push("Look first at under-surveyed shelf edges rather than heavily publicized recovery areas.");
  }
  guidance.push("Keep this at corridor scale only and verify legal constraints before any field activity.");
  return guidance.slice(0, 4);
}

function mapPopupHtml(title, zone) {
  const links = mapLinksForZone(zone, state.tracker.currentPosition);
  return `
    <strong>${escapeHtml(title)}</strong><br />
    ${escapeHtml(`${fmtCoord(zone.lat)}, ${fmtCoord(zone.lon)}`)}<br />
    <a href="${escapeHtml(links.appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a> ·
    <a href="${escapeHtml(links.googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
  `;
}

function ensureLeafletMap(kind, element) {
  if (typeof window.L === "undefined" || !element) {
    if (element) {
      element.innerHTML = '<div class="muted-card">Live map failed to load.</div>';
    }
    return null;
  }
  if (!state.maps[kind]) {
    const map = window.L.map(element, {
      zoomControl: true,
      attributionControl: true,
    });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    state.maps[kind] = map;
    state.maps[`${kind}Layer`] = window.L.layerGroup().addTo(map);
  }
  return state.maps[kind];
}

function renderLeafletZoneMap(
  kind,
  element,
  {
    zone,
    nearbyWrecks = [],
    otherZones = [],
    path = [],
    currentPosition = null,
  },
) {
  const map = ensureLeafletMap(kind, element);
  if (!map || !zone) {
    return;
  }
  const layerGroup = state.maps[`${kind}Layer`];
  layerGroup.clearLayers();

  const latLngs = [window.L.latLng(zone.lat, zone.lon)];

  otherZones
    .filter((candidate) => candidate.id !== zone.id)
    .forEach((candidate) => {
      const marker = window.L.circleMarker([candidate.lat, candidate.lon], {
        radius: 5,
        color: "rgba(255,255,255,0.55)",
        weight: 1,
        fillColor: "rgba(255,255,255,0.4)",
        fillOpacity: 0.7,
      });
      marker.bindPopup(mapPopupHtml(candidate.name, candidate));
      marker.addTo(layerGroup);
      latLngs.push(window.L.latLng(candidate.lat, candidate.lon));
    });

  nearbyWrecks
    .filter((wreck) => Number.isFinite(wreck?.lat) && Number.isFinite(wreck?.lon))
    .forEach((wreck) => {
      const marker = window.L.circleMarker([wreck.lat, wreck.lon], {
        radius: 6,
        color: "#5fd4c1",
        weight: 2,
        fillColor: "#5fd4c1",
        fillOpacity: 0.75,
      });
      marker.bindPopup(
        `
          <strong>${escapeHtml(wreck.name)}</strong><br />
          ${
            wreck.depthFeet !== null && wreck.depthFeet !== undefined
              ? `Depth: ${escapeHtml(String(wreck.depthFeet))} ft<br />`
              : ""
          }
          Distance: ${escapeHtml(String(wreck.distanceMiles))} mi
        `,
      );
      marker.addTo(layerGroup);
      latLngs.push(window.L.latLng(wreck.lat, wreck.lon));
    });

  const zoneCircle = window.L.circle([zone.lat, zone.lon], {
    radius: 2500,
    color: "#ffd166",
    weight: 2,
    fillColor: "#ffd166",
    fillOpacity: 0.12,
  });
  zoneCircle.bindPopup(mapPopupHtml(zone.name, zone));
  zoneCircle.addTo(layerGroup);

  const zoneMarker = window.L.circleMarker([zone.lat, zone.lon], {
    radius: 8,
    color: "#ffd166",
    weight: 2,
    fillColor: "#ffd166",
    fillOpacity: 1,
  });
  zoneMarker.bindPopup(mapPopupHtml(zone.name, zone));
  zoneMarker.addTo(layerGroup);

  const pathLatLngs = path
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
    .map((point) => window.L.latLng(point.lat, point.lon));
  if (pathLatLngs.length) {
    window.L.polyline(pathLatLngs, {
      color: "#5fd4c1",
      weight: 3,
      opacity: 0.9,
    }).addTo(layerGroup);
    latLngs.push(...pathLatLngs);
  }

  if (currentPosition && Number.isFinite(currentPosition.lat) && Number.isFinite(currentPosition.lon)) {
    const currentMarker = window.L.circleMarker([currentPosition.lat, currentPosition.lon], {
      radius: 7,
      color: "#ffba59",
      weight: 2,
      fillColor: "#ffba59",
      fillOpacity: 1,
    });
    currentMarker.bindPopup("Current position");
    currentMarker.addTo(layerGroup);
    latLngs.push(window.L.latLng(currentPosition.lat, currentPosition.lon));
  }

  if (latLngs.length > 1) {
    map.fitBounds(window.L.latLngBounds(latLngs), { padding: [28, 28] });
  } else {
    map.setView([zone.lat, zone.lon], kind === "predict" ? 10 : 11);
  }

  setTimeout(() => map.invalidateSize(), 0);
}

function invalidateVisibleMaps() {
  setTimeout(() => {
    if (state.maps.predict && state.view === "predict") {
      state.maps.predict.invalidateSize();
    }
    if (state.maps.references && state.view === "references") {
      state.maps.references.invalidateSize();
    }
    if (state.maps.tracker && state.view === "overview") {
      state.maps.tracker.invalidateSize();
    }
  }, 80);
}

function metersToFeet(value) {
  return Number(value || 0) * 3.28084;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda = toRad(lon2 - lon1);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function selectedZone() {
  return (state.overview?.candidateZones || []).find(
    (zone) => zone.id === state.tracker.selectedZoneId,
  );
}

function selectedLandZone() {
  return (state.overview?.landFindZones || []).find(
    (zone) => zone.id === state.predict.selectedLandZoneId,
  );
}

function selectedPredictOceanZone() {
  return (state.overview?.candidateZones || []).find(
    (zone) => zone.id === state.tracker.selectedZoneId,
  );
}

function selectedPredictZone() {
  return state.predict.surface === "ocean" ? selectedPredictOceanZone() : selectedLandZone();
}

function renderHeader() {
  if (!state.config || !state.overview) {
    return;
  }
  refs.configText.textContent = `${state.config.appName} • ${state.config.mode} • ${state.config.safetyMode}`;
  refs.warningText.textContent = state.config.warning;
  refs.summarySources.textContent = `Sources: ${state.overview.totals.sources}`;
  refs.summaryJournals.textContent = `Journals: ${state.overview.totals.journalEntries}`;
  refs.summaryWrecks.textContent = `Known wrecks: ${state.overview.totals.knownWrecks}`;
}

function renderRegionCards() {
  refs.regionCards.innerHTML = (state.liveRegions || [])
    .map((bundle) => {
      const topZone = (state.overview?.candidateZones || []).find((zone) => zone.regionKey === bundle.region.id);
      return `
        <article class="region-card">
          <div class="list-top">
            <div>
              <p class="mini-label">${escapeHtml(bundle.region.name)}</p>
              <h3>${escapeHtml(topZone?.name || "Coverage region")}</h3>
            </div>
            <span class="tag">${escapeHtml(topZone ? `${topZone.potentialScore}` : "live")}</span>
          </div>
          <p class="tracker-note">${escapeHtml(bundle.region.blurb)}</p>
          <div class="metric-grid">
            <div><label>Wind</label><strong>${escapeHtml(bundle.weather.conditions.windSpeedMph || "n/a")} mph</strong></div>
            <div><label>Wave</label><strong>${escapeHtml(bundle.buoy?.waveHeightFt || bundle.weather.conditions.waveHeightFt || "n/a")} ft</strong></div>
            <div><label>Tide Station</label><strong>${escapeHtml(bundle.tides.station.name)}</strong></div>
            <div><label>Known Wrecks</label><strong>${escapeHtml(String(topZone?.nearbyKnownWrecks?.length || 0))}</strong></div>
          </div>
          <p class="meta-line">${escapeHtml(nearbyWreckSummary(topZone?.nearbyKnownWrecks))}</p>
        </article>
      `;
    })
    .join("");
}

function renderZones() {
  refs.zoneList.innerHTML = (state.overview?.candidateZones || [])
    .map(
      (zone, index) => `
        <article class="route-card">
          <div class="list-top">
            <div>
              <p class="mini-label">Rank ${index + 1} • ${escapeHtml(zone.regionKey || "corridor")}</p>
              <h3>${escapeHtml(zone.name)}</h3>
            </div>
            <span class="score-badge">${escapeHtml(String(zone.potentialScore))}</span>
          </div>
          <p>${escapeHtml(zone.searchNote)}</p>
          <div class="metric-grid">
            <div><label>Confidence</label><strong>${fmtPercent(zone.confidence)}</strong></div>
            <div><label>Coords</label><strong>${coordLinkHtml(zone)}</strong></div>
            <div><label>Journal</label><strong>${escapeHtml(String(zone.evidence.journalEvidence))}</strong></div>
            <div><label>Wreck</label><strong>${escapeHtml(String(zone.evidence.wreckEvidence))}</strong></div>
          </div>
          <div class="pill-row">
            ${(zone.areaTags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p class="meta-line">Known wreck anchors: ${escapeHtml(nearbyWreckSummary(zone.nearbyKnownWrecks))}</p>
          <div class="tracker-actions">
            <button class="btn btn-secondary" data-action="track" data-zone-id="${escapeHtml(zone.id)}">Track Zone</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPredictView() {
  const isOcean = state.predict.surface === "ocean";
  const zones = isOcean ? state.overview?.candidateZones || [] : state.overview?.landFindZones || [];
  const zone = selectedPredictZone() || zones[0];
  if (!zone) {
    refs.predictEyebrow.textContent = isOcean ? "Ocean Map" : "Shoreline Map";
    refs.predictFocusEyebrow.textContent = isOcean ? "Ocean Focus" : "Land Focus";
    refs.predictFocusTitle.textContent = isOcean ? "Where To Scan First" : "Where To Walk First";
    refs.predictTitle.textContent = isOcean ? "No ocean corridor loaded" : "No land corridor loaded";
    refs.predictScore.textContent = "--";
    refs.predictMap.innerHTML = "";
    refs.predictSummary.innerHTML = '<article class="list-card"><p>No prediction data loaded.</p></article>';
    refs.predictList.innerHTML = "";
    return;
  }

  refs.predictSurfaceTabs.querySelectorAll("[data-predict-surface]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-predict-surface") === state.predict.surface);
  });
  refs.predictEyebrow.textContent = isOcean ? "Ocean Map" : "Shoreline Map";
  refs.predictFocusEyebrow.textContent = isOcean ? "Ocean Focus" : "Land Focus";
  refs.predictFocusTitle.textContent = isOcean ? "Where To Scan First" : "Where To Walk First";
  refs.predictTitle.textContent = zone.name;
  refs.predictScore.textContent = `Score ${zone.potentialScore}`;
  renderLeafletZoneMap("predict", refs.predictMap, {
    zone,
    nearbyWrecks: zone.nearbyKnownWrecks || [],
    otherZones: zones,
  });
  refs.predictSummary.innerHTML = isOcean
    ? `
      <article class="list-card">
        <p class="predict-lead">${escapeHtml(zone.searchNote)}</p>
        <div class="metric-grid">
          <div><label>Ocean Corridor</label><strong>${escapeHtml(zone.name)}</strong></div>
          <div><label>Coarse Center</label><strong>${coordLinkHtml(zone)}</strong></div>
          <div><label>Priority Score</label><strong>${escapeHtml(String(zone.potentialScore))}</strong></div>
          <div><label>Confidence</label><strong>${fmtPercent(zone.confidence)}</strong></div>
          <div><label>Storm Pattern</label><strong>${escapeHtml(String(zone.evidence?.stormEvidence || "n/a"))}</strong></div>
          <div><label>Ref Depth Band</label><strong>${escapeHtml(zone.depthProfile?.label || "n/a")}</strong></div>
          <div><label>Journal Signal</label><strong>${escapeHtml(String(zone.evidence?.journalEvidence || "n/a"))}</strong></div>
          <div><label>Survey Gap</label><strong>${fmtPercent(zone.evidence?.surveyGap || 0)}</strong></div>
          <div><label>Wreck Pattern</label><strong>${escapeHtml(String(zone.evidence?.wreckEvidence || "n/a"))}</strong></div>
          <div><label>Drift Hold</label><strong>${fmtPercent(zone.evidence?.driftRetention || 0)}</strong></div>
          <div><label>Seabed Hold</label><strong>${fmtPercent(zone.evidence?.seabedRetention || 0)}</strong></div>
        </div>
        <p class="meta-line">Showing ${escapeHtml(String(zones.length))} ocean corridors. Ranks combine archival evidence, storm tracks, nearby wreck anchors, shelf retention, and survey gaps.</p>
        <p class="meta-line">Known wreck anchors: ${escapeHtml(nearbyWreckSummary(zone.nearbyKnownWrecks))}</p>
        <ul class="focus-list">
          ${zoneFocusGuidance(zone).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
        <div class="tracker-actions">
          <button class="btn btn-secondary" data-action="predict-select-ocean" data-zone-id="${escapeHtml(zone.id)}">Keep This Ocean Selected</button>
          <button class="btn btn-primary" data-action="route-ocean" data-zone-id="${escapeHtml(zone.id)}">Route Offshore Corridor</button>
        </div>
        <div class="link-row">
          <a href="${escapeHtml(mapLinksForZone(zone).appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a>
          <a href="${escapeHtml(mapLinksForZone(zone).googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
        </div>
      </article>
    `
    : `
      <article class="list-card">
        <p class="predict-lead">${escapeHtml(zone.searchNote)}</p>
        <div class="metric-grid">
          <div><label>Land Corridor</label><strong>${escapeHtml(zone.name)}</strong></div>
          <div><label>Beach Center</label><strong>${coordLinkHtml(zone)}</strong></div>
          <div><label>Priority Score</label><strong>${escapeHtml(String(zone.potentialScore))}</strong></div>
          <div><label>Confidence</label><strong>${fmtPercent(zone.confidence)}</strong></div>
          <div><label>Storm Pattern</label><strong>${escapeHtml(String(zone.evidence?.stormEvidence || "n/a"))}</strong></div>
          <div><label>Depth Feed</label><strong>${escapeHtml(zone.depthProfile?.label || "n/a")}</strong></div>
          <div><label>Journal Signal</label><strong>${escapeHtml(String(zone.evidence?.journalEvidence || "n/a"))}</strong></div>
          <div><label>Feeder Corridor</label><strong>${escapeHtml(zone.feederZone?.name || "n/a")}</strong></div>
          <div><label>Wreck Pattern</label><strong>${escapeHtml(String(zone.evidence?.wreckEvidence || "n/a"))}</strong></div>
          <div><label>Dune Hold</label><strong>${fmtPercent(zone.evidence?.duneRetention || 0)}</strong></div>
          <div><label>Beach Hold</label><strong>${fmtPercent(zone.evidence?.beachRetention || 0)}</strong></div>
        </div>
        <p class="meta-line">Showing ${escapeHtml(String(zones.length))} on-land corridors. Ranks combine archival evidence, storm history, nearby wreck anchors, feeder-corridor strength, and beach/dune retention patterns.</p>
        <p class="meta-line">Look for: ${escapeHtml((zone.terrainSignals || []).join(" • ") || "post-storm beach and dune signal changes")}</p>
        <ul class="focus-list">
          ${zoneFocusGuidance(zone).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
        <div class="tracker-actions">
          <button class="btn btn-secondary" data-action="predict-select-land" data-zone-id="${escapeHtml(zone.id)}">Keep This Beach Selected</button>
          <button class="btn btn-primary" data-action="route-land" data-zone-id="${escapeHtml(zone.id)}">Route To Beach</button>
        </div>
        <div class="link-row">
          <a href="${escapeHtml(mapLinksForZone(zone).appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a>
          <a href="${escapeHtml(mapLinksForZone(zone).googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
        </div>
      </article>
    `;
  refs.predictList.innerHTML = zones
    .map(
      (candidate, index) => `
        <article class="route-card predict-card ${candidate.id === zone.id ? "is-selected" : ""}">
          <div class="list-top">
            <div>
              <p class="mini-label">${escapeHtml(isOcean ? `Ocean Find ${index + 1}` : `Land Find ${index + 1}`)}</p>
              <h3>${escapeHtml(candidate.name)}</h3>
            </div>
            <span class="score-badge">${escapeHtml(String(candidate.potentialScore))}</span>
          </div>
          <p>${escapeHtml(candidate.searchNote)}</p>
          <p class="meta-line">${escapeHtml(isOcean ? "Ocean pattern" : "Shore pattern")}: ${escapeHtml(zoneFocusGuidance(candidate)[0] || "Coarse corridor review only.")}</p>
          <p class="meta-line">${escapeHtml(isOcean ? "Offshore corridor" : "Beach corridor")} centered near ${coordLinkHtml(candidate)}</p>
          <p class="meta-line">${
            isOcean
              ? `Depth band: ${escapeHtml(candidate.depthProfile?.label || "n/a")}`
              : `Look for: ${escapeHtml((candidate.terrainSignals || []).slice(0, 2).join(" • ") || "storm-cut upper beach signals")}`
          }</p>
          <div class="tracker-actions">
            <button class="btn btn-secondary" data-action="${escapeHtml(isOcean ? "predict-select-ocean" : "predict-select-land")}" data-zone-id="${escapeHtml(candidate.id)}">Open ${escapeHtml(isOcean ? "Ocean" : "Land")} Corridor</button>
            <button class="btn btn-primary" data-action="${escapeHtml(isOcean ? "route-ocean" : "route-land")}" data-zone-id="${escapeHtml(candidate.id)}">Route To ${escapeHtml(isOcean ? "Corridor" : "Beach")}</button>
          </div>
          <div class="link-row">
            <a href="${escapeHtml(mapLinksForZone(candidate).appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a>
            <a href="${escapeHtml(mapLinksForZone(candidate).googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
          </div>
        </article>
      `,
    )
    .join("");
}

function filteredReferencePoints() {
  const filter = state.references.filter;
  const points = Array.isArray(state.referencePoints) ? state.referencePoints : [];
  return filter === "all" ? points : points.filter((point) => point.type === filter);
}

function referenceMarkerColor(type) {
  if (type === "wreck") {
    return "#ffd166";
  }
  if (type === "journal") {
    return "#5fd4c1";
  }
  return "#f38f5a";
}

function renderReferenceView() {
  const points = filteredReferencePoints();
  refs.referenceFilters.querySelectorAll("[data-reference-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-reference-filter") === state.references.filter);
  });

  const map = ensureLeafletMap("references", refs.referenceMap);
  if (map) {
    const layerGroup = state.maps.referencesLayer;
    layerGroup.clearLayers();
    const latLngs = [];
    points.forEach((point) => {
      const marker = window.L.circleMarker([point.lat, point.lon], {
        radius: point.type === "source" ? 5 : 6,
        color: referenceMarkerColor(point.type),
        weight: 2,
        fillColor: referenceMarkerColor(point.type),
        fillOpacity: 0.82,
      });
      marker.bindPopup(
        `
          <strong>${escapeHtml(point.title)}</strong><br />
          ${escapeHtml(point.type)}${point.year ? ` • ${escapeHtml(String(point.year))}` : ""}<br />
          ${escapeHtml(`${fmtCoord(point.lat)}, ${fmtCoord(point.lon)}`)}
        `,
      );
      marker.addTo(layerGroup);
      latLngs.push(window.L.latLng(point.lat, point.lon));
    });
    if (latLngs.length) {
      map.fitBounds(window.L.latLngBounds(latLngs), { padding: [28, 28] });
    }
    setTimeout(() => map.invalidateSize(), 0);
  }

  const allPoints = Array.isArray(state.referencePoints) ? state.referencePoints : [];
  const wreckCount = allPoints.filter((point) => point.type === "wreck").length;
  const journalCount = allPoints.filter((point) => point.type === "journal").length;
  const sourceCount = allPoints.filter((point) => point.type === "source").length;
  refs.referenceStats.innerHTML = `
    <article class="list-card">
      <div class="metric-grid">
        <div><label>Showing</label><strong>${escapeHtml(String(points.length))}</strong></div>
        <div><label>Total Wrecks</label><strong>${escapeHtml(String(wreckCount))}</strong></div>
        <div><label>Total Journals</label><strong>${escapeHtml(String(journalCount))}</strong></div>
        <div><label>Total Sources</label><strong>${escapeHtml(String(sourceCount))}</strong></div>
      </div>
      <p class="meta-line">Journal and source points are inferred centroids from area tags or linked evidence when exact coordinates are not part of the uploaded record.</p>
    </article>
  `;

  refs.referenceList.innerHTML = points
    .slice(0, 120)
    .map(
      (point) => `
        <article class="route-card">
          <div class="list-top">
            <div>
              <p class="mini-label">${escapeHtml(point.type)}</p>
              <h3>${escapeHtml(point.title)}</h3>
            </div>
            <span class="tag">${escapeHtml(point.year ? String(point.year) : point.type)}</span>
          </div>
          <p>${escapeHtml(point.subtitle || "Reference point")}</p>
          <p class="meta-line">Point near ${coordLinkHtml(point)}</p>
          <div class="link-row">
            <a href="${escapeHtml(mapLinksForZone(point).appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a>
            <a href="${escapeHtml(mapLinksForZone(point).googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
            ${
              point.sourceUrl
                ? `<a href="${escapeHtml(point.sourceUrl)}" target="_blank" rel="noreferrer">Source Link</a>`
                : ""
            }
          </div>
        </article>
      `,
    )
    .join("");
}

function renderView() {
  refs.predictView.classList.toggle("hidden", state.view !== "predict");
  refs.referencesView.classList.toggle("hidden", state.view !== "references");
  refs.overviewView.classList.toggle("hidden", state.view !== "overview");
  refs.wrecksView.classList.toggle("hidden", state.view !== "wrecks");
  refs.viewTabs.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-view") === state.view);
  });
  invalidateVisibleMaps();
}

function renderList(target, items, renderer, emptyText) {
  target.innerHTML = items.length
    ? items.map(renderer).join("")
    : `<article class="list-card"><p>${escapeHtml(emptyText)}</p></article>`;
}

function renderImportStatus() {
  const imports = state.overview?.sourceImports || {};
  const cards = [];
  if (imports.lastRunAt) {
    cards.push(`
      <article class="recommendation-pill">
        <h3>Last Import</h3>
        <p>${escapeHtml(fmtDateTime(imports.lastRunAt))}</p>
      </article>
    `);
  }
  if (imports.enc) {
    cards.push(`
      <article class="recommendation-pill">
        <h3>NOAA ENC Direct</h3>
        <p>${escapeHtml(String(imports.enc.recordsImported || 0))} wreck and obstruction records loaded.</p>
      </article>
    `);
  }
  if (imports.nhc) {
    cards.push(`
      <article class="recommendation-pill">
        <h3>NHC HURDAT2</h3>
        <p>${escapeHtml(String(imports.nhc.stormsImported || 0))} storms intersect the study corridor.</p>
      </article>
    `);
  }
  if (imports.loc) {
    cards.push(`
      <article class="recommendation-pill">
        <h3>LOC Search API</h3>
        <p>${escapeHtml(String(imports.loc.resultCount || 0))} OCR-backed hits imported.</p>
      </article>
    `);
  }
  refs.importStatus.innerHTML = cards.join("");
}

function renderModelNotes() {
  refs.modelNotes.innerHTML = (state.overview?.modelNotes || [])
    .map((note) => `<article class="recommendation-pill"><p>${escapeHtml(note)}</p></article>`)
    .join("");
}

function renderAnalysis() {
  if (!state.analysis) {
    refs.analysisResult.innerHTML =
      "Run an analysis to see extracted Keys-to-Daytona land and ocean signals.";
    return;
  }
  refs.analysisResult.innerHTML = `
    <div class="metric-grid">
      <div><label>Areas</label><strong>${escapeHtml(state.analysis.extracted.areaTags.join(", ") || "none")}</strong></div>
      <div><label>Keywords</label><strong>${escapeHtml(state.analysis.extracted.keywordSignals.join(", ") || "none")}</strong></div>
      <div><label>Cargo</label><strong>${escapeHtml(state.analysis.extracted.cargoProfile)}</strong></div>
      <div><label>Confidence</label><strong>${fmtPercent(state.analysis.extracted.confidence)}</strong></div>
    </div>
    <div class="stack-list">
      <article class="list-card">
        <div class="list-top">
          <h3>Top Ocean Corridors</h3>
        </div>
        <p class="meta-line">${escapeHtml(
          (state.analysis.topZones || []).map((zone) => zone.name).join(" • ") || "none",
        )}</p>
      </article>
      <article class="list-card">
        <div class="list-top">
          <h3>Top On-Land Corridors</h3>
        </div>
        <p class="meta-line">${escapeHtml(
          (state.analysis.topLandZones || []).map((zone) => zone.name).join(" • ") || "none",
        )}</p>
      </article>
      ${state.analysis.topZones
        .map(
          (zone) => `
            <article class="list-card">
              <div class="list-top">
                <h3>${escapeHtml(zone.name)}</h3>
                <span class="tag">${escapeHtml(String(zone.potentialScore))}</span>
              </div>
              <p>${escapeHtml(zone.searchNote)}</p>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderOverviewLists() {
  renderList(
    refs.journalList,
    state.overview?.journalEntries || [],
    (entry) => `
      <article class="list-card">
        <div class="list-top">
          <h3>${escapeHtml(entry.title)}</h3>
          <span class="tag">${escapeHtml(String(entry.year || "n/a"))}</span>
        </div>
        <p>${escapeHtml(entry.excerpt)}</p>
        <p class="meta-line">${escapeHtml(entry.sourceLabel)} • ${escapeHtml(entry.verificationStatus)}</p>
      </article>
    `,
    "No journal evidence loaded.",
  );

  renderList(
    refs.savedAnalysisList,
    state.overview?.savedAnalyses || [],
    (entry) => `
      <article class="list-card">
        <div class="list-top">
          <h3>${escapeHtml(entry.title)}</h3>
          <span class="tag">${escapeHtml(new Date(entry.createdAt).toLocaleDateString())}</span>
        </div>
        <p class="meta-line">Top zones: ${escapeHtml((entry.topZoneIds || []).join(", "))}</p>
      </article>
    `,
    "No saved analyses yet.",
  );

  renderList(
    refs.wreckList,
    state.overview?.knownWrecks || [],
    (wreck) => `
      <article class="list-card">
        <div class="list-top">
          <h3>${escapeHtml(wreck.name)}</h3>
          <span class="tag">${escapeHtml(String(wreck.year || "n/a"))}</span>
        </div>
        <p>${escapeHtml(wreck.historicalNotes)}</p>
        <p class="meta-line">
          ${
            wreck.depthFeet !== null && wreck.depthFeet !== undefined
              ? `Depth: ${escapeHtml(String(wreck.depthFeet))} ft`
              : "Depth: n/a"
          }${
            wreck.soundingAccuracyFeet !== null && wreck.soundingAccuracyFeet !== undefined
              ? ` • Sounding accuracy: ${escapeHtml(String(wreck.soundingAccuracyFeet))} ft`
              : ""
          }
        </p>
      </article>
    `,
    "No wreck anchors loaded.",
  );

  renderList(
    refs.stormList,
    state.overview?.stormEvents || [],
    (storm) => `
      <article class="list-card">
        <div class="list-top">
          <h3>${escapeHtml(storm.name)}</h3>
          <span class="tag">${escapeHtml(String(storm.year || "n/a"))}</span>
        </div>
        <p>${escapeHtml(storm.notes)}</p>
      </article>
    `,
    "No storm history loaded.",
  );
}

function renderKnownWrecksView() {
  refs.wreckAnchorTargets.innerHTML = (state.overview?.candidateZones || [])
    .map(
      (zone) => `
        <article class="route-card">
          <div class="list-top">
            <div>
              <p class="mini-label">Anchor Reference</p>
              <h3>${escapeHtml(zone.name)}</h3>
            </div>
            <span class="tag">${escapeHtml(String(zone.nearbyKnownWrecks?.length || 0))} anchors</span>
          </div>
          <p class="meta-line">Reference set for the predicted target corridor centered near ${coordLinkHtml(zone)}</p>
          ${nearbyWreckReferenceList(zone.nearbyKnownWrecks, 12)}
          <div class="tracker-actions">
            <button class="btn btn-secondary" data-action="open-target" data-zone-id="${escapeHtml(zone.id)}">Open Predicted Target</button>
            <button class="btn btn-ghost" data-action="track" data-zone-id="${escapeHtml(zone.id)}">Route To Target</button>
          </div>
          <div class="link-row">
            <a href="${escapeHtml(mapLinksForZone(zone).appleSearch)}" target="_blank" rel="noreferrer">Apple Maps</a>
            <a href="${escapeHtml(mapLinksForZone(zone).googleSearch)}" target="_blank" rel="noreferrer">Google Maps</a>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderTrackerSvg() {
  const zone = selectedZone();
  if (!zone) {
    refs.trackerMap.innerHTML = "";
    return;
  }
  renderLeafletZoneMap("tracker", refs.trackerMap, {
    zone,
    nearbyWrecks: zone.nearbyKnownWrecks || [],
    otherZones: state.overview?.candidateZones || [],
    path: state.tracker.path.slice(-40),
    currentPosition: state.tracker.currentPosition,
  });
}

function renderTracker() {
  const zone = selectedZone();
  if (!zone) {
    refs.trackerSummary.innerHTML =
      "Select a Keys-to-Daytona ocean corridor to enable route guidance and live NOAA conditions.";
    refs.trackerConditions.innerHTML = "";
    refs.trackerMap.innerHTML = "";
    return;
  }

  const position = state.tracker.currentPosition;
  const accuracyFeet = position?.accuracy ? metersToFeet(position.accuracy).toFixed(0) : "n/a";
  const distance = position
    ? haversineMiles(position.lat, position.lon, zone.lat, zone.lon).toFixed(2)
    : "n/a";
  const bearing = position
    ? bearingDegrees(position.lat, position.lon, zone.lat, zone.lon).toFixed(0)
    : "n/a";
  const links = mapLinksForZone(zone, position);

  refs.trackerSummary.innerHTML = `
    <div class="tracker-stat-grid">
      <div class="tracker-stat"><label class="mini-label">Target</label><strong>${escapeHtml(zone.name)}</strong></div>
      <div class="tracker-stat"><label class="mini-label">Coords</label><strong>${coordLinkHtml(zone, position)}</strong></div>
      <div class="tracker-stat"><label class="mini-label">Distance</label><strong>${escapeHtml(String(distance))} mi</strong></div>
      <div class="tracker-stat"><label class="mini-label">Bearing</label><strong>${escapeHtml(String(bearing))}&deg;</strong></div>
      <div class="tracker-stat"><label class="mini-label">Accuracy</label><strong>${escapeHtml(String(accuracyFeet))} ft</strong></div>
      <div class="tracker-stat"><label class="mini-label">Track Points</label><strong>${escapeHtml(String(state.tracker.path.length))}</strong></div>
    </div>
    <div class="link-row">
      <a href="${escapeHtml(links.googleDirections)}" target="_blank" rel="noreferrer">Open in Google Maps</a>
      <a href="${escapeHtml(links.appleDirections)}" target="_blank" rel="noreferrer">Open in Apple Maps</a>
    </div>
  `;

  const live = state.tracker.liveBundle;
  refs.trackerConditions.innerHTML = live
    ? `
      <article class="list-card">
        <div class="list-top">
          <h3>${escapeHtml(live.region.name)}</h3>
          <span class="tag">${escapeHtml(fmtDateTime(live.fetchedAt))}</span>
        </div>
        <div class="metric-grid">
          <div><label>Wind</label><strong>${escapeHtml(live.weather.conditions.windSpeedMph || "n/a")} mph</strong></div>
          <div><label>Wind Dir</label><strong>${escapeHtml(String(live.weather.conditions.windDirectionDeg || "n/a"))}&deg;</strong></div>
          <div><label>Wave</label><strong>${escapeHtml(live.buoy?.waveHeightFt || live.weather.conditions.waveHeightFt || "n/a")} ft</strong></div>
          <div><label>Wave Period</label><strong>${escapeHtml(String(live.buoy?.dominantPeriodSec || live.weather.conditions.wavePeriodSec || "n/a"))} s</strong></div>
          <div><label>Water Temp</label><strong>${escapeHtml(String(live.buoy?.waterTempF || "n/a"))}&deg;F</strong></div>
          <div><label>Air Temp</label><strong>${escapeHtml(String(live.weather.conditions.airTempF || "n/a"))}&deg;F</strong></div>
        </div>
        <p class="meta-line">Tide station: ${escapeHtml(live.tides.station.name)}</p>
        <p class="meta-line">Known wreck anchors: ${escapeHtml(nearbyWreckSummary(zone.nearbyKnownWrecks))}</p>
        <p class="meta-line">
          Next tides:
          ${escapeHtml(
            (live.tides.nextEvents || [])
              .map((item) => `${item.type} ${item.time} (${item.heightFt} ft)`)
              .join(" • ") || "n/a",
          )}
        </p>
      </article>
    `
    : `<article class="list-card"><p>Loading live NOAA conditions for ${escapeHtml(zone.name)}...</p></article>`;

  renderTrackerSvg();
}

async function loadTrackerConditions() {
  const zone = selectedZone();
  if (!zone) {
    return;
  }
  try {
    const live = await api(`/api/live-conditions?zoneId=${encodeURIComponent(zone.id)}`);
    state.tracker.liveBundle = live;
    renderTracker();
  } catch (error) {
    showToast(error.message, true);
  }
}

function selectZone(zoneId) {
  state.tracker.selectedZoneId = zoneId;
  state.tracker.liveBundle = null;
  clearInterval(state.tracker.refreshTimer);
  state.tracker.refreshTimer = setInterval(loadTrackerConditions, 120000);
  loadTrackerConditions();
  renderPredictView();
  renderTracker();
}

function startTracking() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported in this browser.", true);
    return;
  }
  if (!selectedZone()) {
    const fallbackZone = state.overview?.candidateZones?.[0];
    if (fallbackZone) {
      selectZone(fallbackZone.id);
    }
  }
  if (state.tracker.watchId !== null) {
    return;
  }
  state.tracker.watchId = navigator.geolocation.watchPosition(
    (position) => {
      state.tracker.currentPosition = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      state.tracker.path.push({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recordedAt: Date.now(),
      });
      state.tracker.path = state.tracker.path.slice(-40);
      renderTracker();
    },
    (error) => {
      showToast(error.message || "Unable to watch your geolocation.", true);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 4000,
    },
  );
  renderTracker();
}

function stopTracking() {
  if (state.tracker.watchId !== null) {
    navigator.geolocation.clearWatch(state.tracker.watchId);
    state.tracker.watchId = null;
  }
  clearInterval(state.tracker.refreshTimer);
  state.tracker.refreshTimer = null;
  renderTracker();
}

function renderAll() {
  renderView();
  renderPredictView();
  renderReferenceView();
  renderHeader();
  renderRegionCards();
  renderZones();
  renderImportStatus();
  renderModelNotes();
  renderOverviewLists();
  renderKnownWrecksView();
  renderAnalysis();
  renderTracker();
}

function openRouteForZone(zone) {
  if (!zone) {
    return;
  }
  const links = mapLinksForZone(zone, state.tracker.currentPosition);
  window.open(links.preferred, "_blank", "noopener,noreferrer");
}

async function loadInitialData() {
  const [config, overview, liveRegions, referencePoints] = await Promise.all([
    api("/api/config"),
    api("/api/overview"),
    api("/api/live-regions"),
    api("/api/reference-points"),
  ]);
  state.config = config;
  state.overview = overview;
  state.liveRegions = liveRegions.regions || [];
  state.referencePoints = referencePoints.points || [];
  if (!state.predict.selectedLandZoneId && state.overview.landFindZones?.length) {
    state.predict.selectedLandZoneId = state.overview.landFindZones[0].id;
  }
  if (!state.tracker.selectedZoneId && state.overview.candidateZones.length) {
    state.tracker.selectedZoneId = state.overview.candidateZones[0].id;
  }
  await loadTrackerConditions();
  renderAll();
}

refs.zoneList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='track']");
  if (!button) {
    return;
  }
  selectZone(button.getAttribute("data-zone-id"));
});

refs.predictList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-zone-id]");
  if (!button) {
    return;
  }
  const zoneId = button.getAttribute("data-zone-id");
  const action = button.getAttribute("data-action");
  if (action === "predict-select-land" || action === "route-land") {
    state.predict.selectedLandZoneId = zoneId;
    if (action === "route-land") {
      openRouteForZone(selectedLandZone());
    }
  } else if (action === "predict-select-ocean" || action === "route-ocean") {
    selectZone(zoneId);
    if (action === "route-ocean") {
      openRouteForZone(selectedPredictOceanZone());
    }
  }
  state.view = "predict";
  renderAll();
});

refs.predictSummary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-zone-id]");
  if (!button) {
    return;
  }
  const zoneId = button.getAttribute("data-zone-id");
  const action = button.getAttribute("data-action");
  if (action === "predict-select-land" || action === "route-land") {
    state.predict.selectedLandZoneId = zoneId;
    if (action === "route-land") {
      openRouteForZone(selectedLandZone());
    }
  } else if (action === "predict-select-ocean" || action === "route-ocean") {
    selectZone(zoneId);
    if (action === "route-ocean") {
      openRouteForZone(selectedPredictOceanZone());
    }
  }
  state.view = "predict";
  renderAll();
});

refs.wreckAnchorTargets.addEventListener("click", (event) => {
  const button = event.target.closest("[data-zone-id]");
  if (!button) {
    return;
  }
  selectZone(button.getAttribute("data-zone-id"));
  if (button.getAttribute("data-action") === "track") {
    openRouteForZone(selectedZone());
    state.view = "overview";
  } else {
    state.view = "predict";
  }
  renderAll();
});

refs.viewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) {
    return;
  }
  state.view = button.getAttribute("data-view");
  renderView();
});

refs.predictSurfaceTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-predict-surface]");
  if (!button) {
    return;
  }
  state.predict.surface = button.getAttribute("data-predict-surface");
  renderPredictView();
});

refs.referenceFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-reference-filter]");
  if (!button) {
    return;
  }
  state.references.filter = button.getAttribute("data-reference-filter");
  renderReferenceView();
});

refs.startTrackingBtn.addEventListener("click", () => {
  startTracking();
});

refs.stopTrackingBtn.addEventListener("click", () => {
  stopTracking();
});

refs.analyzeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.analyzeForm);
  try {
    const response = await api("/api/analyze-journal", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        year: form.get("year"),
        regionHint: form.get("regionHint"),
        text: form.get("text"),
      }),
    });
    state.analysis = response.analysis;
    renderAnalysis();
    showToast("Journal analysis updated.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.observationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.observationForm);
  try {
    await api("/api/journal-observations", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        sourceLabel: form.get("sourceLabel"),
        year: form.get("year"),
        areaTags: String(form.get("areaTags") || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        excerpt: form.get("excerpt"),
      }),
    });
    refs.observationForm.reset();
    await loadInitialData();
    showToast("Observation saved and rankings refreshed.");
  } catch (error) {
    showToast(error.message, true);
  }
});

loadInitialData().catch((error) => {
  showToast(error.message, true);
});
