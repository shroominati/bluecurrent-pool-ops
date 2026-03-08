const crypto = require("crypto");
const {
  loadDb,
  saveDb,
  inferAreaTags,
  buildKeywordSignals,
} = require("../server/wreck-db");

const EAST_COAST_BBOX = {
  minLon: -81.7,
  minLat: 24.4,
  maxLon: -79.6,
  maxLat: 30.9,
};

const EAST_COAST_BUFFER = 0.55;
const ENC_SERVICES = [
  "enc_approach",
  "enc_berthing",
  "enc_coastal",
  "enc_general",
  "enc_harbor",
  "enc_overview",
];
const LOC_PAGE_SIZE = 100;
const LOC_MAX_PAGES = Number(process.env.LOC_MAX_PAGES || 2);
const REQUEST_TIMEOUT_MS = Number(process.env.IMPORT_TIMEOUT_MS || 20000);
const LOC_QUERY_DEFINITIONS = [
  { query: "shipwreck sebastian", areaTags: ["treasure-coast", "sebastian", "vero"] },
  { query: "shipwreck treasure coast", areaTags: ["treasure-coast", "sebastian", "vero"] },
  { query: "shipwreck fort pierce", areaTags: ["treasure-coast", "fort-pierce", "vero"] },
  { query: "shipwreck canaveral", areaTags: ["canaveral", "cape", "space-coast"] },
  { query: "shipwreck st augustine", areaTags: ["st-augustine", "matanzas", "north-east-florida"] },
  { query: "shipwreck jupiter", areaTags: ["jupiter", "palm-beach", "treasure-coast"] },
  { query: "shipwreck palm beach", areaTags: ["jupiter", "palm-beach", "treasure-coast"] },
  { query: "shipwreck biscayne", areaTags: ["biscayne", "miami", "fort-lauderdale"] },
  { query: "shipwreck miami reef", areaTags: ["biscayne", "miami", "fort-lauderdale"] },
  { query: "salvage florida reef", areaTags: ["treasure-coast", "biscayne", "miami"] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": "FloridaWreckSignal/1.0",
          Accept: "application/json,text/plain,text/html,*/*",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(300 * attempt);
      }
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url);
  return response.text();
}

function withinExpandedBbox(lat, lon, buffer = EAST_COAST_BUFFER) {
  return (
    lon >= EAST_COAST_BBOX.minLon - buffer &&
    lon <= EAST_COAST_BBOX.maxLon + buffer &&
    lat >= EAST_COAST_BBOX.minLat - buffer &&
    lat <= EAST_COAST_BBOX.maxLat + buffer
  );
}

function areaTagsFromCoords(lat, lon) {
  if (!withinExpandedBbox(lat, lon, 0.35)) {
    return [];
  }

  if (lat >= 29.2) {
    return ["st-augustine", "matanzas", "north-east-florida"];
  }
  if (lat >= 27.9) {
    return ["canaveral", "cape", "space-coast"];
  }
  if (lat >= 27.1) {
    return ["treasure-coast", "sebastian", "vero", "fort-pierce"];
  }
  if (lat >= 26.1) {
    return ["jupiter", "palm-beach", "treasure-coast"];
  }
  return ["biscayne", "miami", "fort-lauderdale"];
}

function parseCoordToken(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return null;
  }

  const hemi = raw.slice(-1).toUpperCase();
  const magnitude = Number(raw.slice(0, -1));
  if (!Number.isFinite(magnitude)) {
    return null;
  }

  if (hemi === "S" || hemi === "W") {
    return -magnitude;
  }
  return magnitude;
}

function scoreImportedWreckCargo(attrs, layerName) {
  const value = `${attrs.CATWRK || ""} ${attrs.OBJNAM || ""} ${attrs.INFORM || ""}`.toLowerCase();
  if (/plate fleet|treasure|silver|gold|coin|bullion/.test(value)) {
    return 0.95;
  }
  if (/dangerous wreck|wreck/.test(value)) {
    return 0.3;
  }
  if (/obstruction/.test(layerName.toLowerCase())) {
    return 0.12;
  }
  return 0.2;
}

function centerForGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { lon: geometry.x, lat: geometry.y };
  }

  const points = [];
  for (const ring of geometry.rings || []) {
    for (const [x, y] of ring) {
      points.push([x, y]);
    }
  }
  for (const path of geometry.paths || []) {
    for (const [x, y] of path) {
      points.push([x, y]);
    }
  }

  if (!points.length) {
    return null;
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
  };
}

function parseSourceYear(value) {
  const match = String(value || "").match(/(15|16|17|18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metersToFeet(value) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Number((parsed * 3.28084).toFixed(1));
}

function extractEncDepthFields(attrs) {
  const depthMeters = finiteNumber(attrs.VALSOU);
  const heightMeters = finiteNumber(attrs.HEIGHT);
  const soundingAccuracyMeters = finiteNumber(attrs.SOUACC);
  return {
    depthMeters,
    depthFeet: metersToFeet(depthMeters),
    heightMeters,
    heightFeet: metersToFeet(heightMeters),
    soundingAccuracyMeters,
    soundingAccuracyFeet: metersToFeet(soundingAccuracyMeters),
    soundingQuality: attrs.QUASOU || null,
    soundingExposition: finiteNumber(attrs.EXPSOU),
    waterLevelCode: finiteNumber(attrs.WATLEV),
  };
}

function buildLocCargoProfile(text) {
  const value = String(text || "").toLowerCase();
  if (/(silver|gold|bullion|coin|treasure|plate fleet)/.test(value)) {
    return "treasure or specie keywords present";
  }
  if (/(cargo|merchant|freight|steamer|schooner|brig)/.test(value)) {
    return "merchant or vessel cargo indicators present";
  }
  if (/(salvage|wrecking|salvor)/.test(value)) {
    return "salvage mention without explicit cargo description";
  }
  return "cargo unclear";
}

function isRelevantLocHit(result) {
  const text = `${result.title || ""} ${(result.description || []).join(" ")} ${result.url || ""}`.toLowerCase();
  const hasWreckTerm = /(shipwreck|wreck|wrecked|stranded|grounded|sunk|foundered|salvage)/.test(text);
  const hasMaritimeContext = /(ship|vessel|schooner|steamer|brig|barque|reef|shoal|coast|inlet|hurricane|gulf stream|cargo)/.test(
    text,
  );
  return hasWreckTerm && hasMaritimeContext;
}

async function discoverLatestHurdatUrl() {
  const indexHtml = await fetchText("https://www.nhc.noaa.gov/data/hurdat/");
  const matches = Array.from(
    indexHtml.matchAll(/href="(hurdat2-1851-(\d{4})-[^"]+\.txt)"/g),
  ).map((match) => ({
    href: match[1],
    season: Number(match[2]),
  }));

  if (!matches.length) {
    throw new Error("Unable to discover a HURDAT2 file from the official NHC index.");
  }

  matches.sort((a, b) => a.season - b.season || a.href.localeCompare(b.href));
  const latest = matches.at(-1);
  return {
    season: latest.season,
    url: `https://www.nhc.noaa.gov/data/hurdat/${latest.href}`,
  };
}

async function importHurdatStorms() {
  console.log("Fetching NHC HURDAT2 index...");
  const latest = await discoverLatestHurdatUrl();
  console.log(`Downloading ${latest.url} ...`);
  const text = await fetchText(latest.url);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const storms = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index].split(",").map((part) => part.trim());
    if (header.length < 3) {
      index += 1;
      continue;
    }

    const stormId = header[0];
    const stormName = header[1];
    const pointCount = Number(header[2]);
    const year = Number(String(stormId).slice(4, 8));
    let maxWindKts = 0;
    let pointHits = 0;
    const areaTags = new Set();

    for (let offset = 1; offset <= pointCount && index + offset < lines.length; offset += 1) {
      const fields = lines[index + offset].split(",").map((part) => part.trim());
      if (fields.length < 7) {
        continue;
      }
      const lat = parseCoordToken(fields[4]);
      const lon = parseCoordToken(fields[5]);
      const wind = Number(fields[6]);
      if (Number.isFinite(wind)) {
        maxWindKts = Math.max(maxWindKts, wind);
      }
      if (lat === null || lon === null) {
        continue;
      }
      if (withinExpandedBbox(lat, lon)) {
        pointHits += 1;
        for (const tag of areaTagsFromCoords(lat, lon)) {
          areaTags.add(tag);
        }
      }
    }

    if (pointHits > 0) {
      storms.push({
        id: `import-nhc-${stormId.toLowerCase()}`,
        name: `${year} ${stormName}`,
        year,
        maxWindKts,
        areaTags: Array.from(areaTags),
        severity: Number(Math.min(1, maxWindKts / 120).toFixed(2)),
        notes: `Imported from official NHC HURDAT2. ${pointHits} track points intersect the Florida east coast research corridor.`,
        sourceUrl: latest.url,
        sourceId: "noaa-hurricanes",
      });
    }

    index += pointCount + 1;
  }

  return {
    storms,
    meta: {
      importedAt: new Date().toISOString(),
      fileUrl: latest.url,
      latestSeason: latest.season,
      stormsImported: storms.length,
    },
  };
}

async function fetchEncLayerFeatures(serviceName, layer) {
  const features = [];
  let offset = 0;
  const baseUrl = `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/${serviceName}/MapServer/${layer.id}/query`;

  while (true) {
    const params = new URLSearchParams({
      f: "pjson",
      where: "1=1",
      returnGeometry: "true",
      spatialRel: "esriSpatialRelIntersects",
      geometry: `${EAST_COAST_BBOX.minLon},${EAST_COAST_BBOX.minLat},${EAST_COAST_BBOX.maxLon},${EAST_COAST_BBOX.maxLat}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outFields: "*",
      resultOffset: String(offset),
      resultRecordCount: "1000",
      orderByFields: "OBJECTID ASC",
    });
    const data = await fetchJson(`${baseUrl}?${params.toString()}`);
    if (!Array.isArray(data.features) || !data.features.length) {
      break;
    }
    features.push(...data.features);
    if (!data.exceededTransferLimit || data.features.length < 1000) {
      break;
    }
    offset += data.features.length;
  }

  return features;
}

async function importEncWrecks() {
  const imported = [];
  const dedupe = new Set();
  const layerHits = [];

  for (const serviceName of ENC_SERVICES) {
    console.log(`Inspecting NOAA ENC Direct service ${serviceName} ...`);
    const service = await fetchJson(
      `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/${serviceName}/MapServer?f=pjson`,
    );
    const layers = (service.layers || []).filter((layer) =>
      /\.(Wreck|Obstruction)_(point|area)$/i.test(layer.name),
    );

    for (const layer of layers) {
      const features = await fetchEncLayerFeatures(serviceName, layer);
      layerHits.push({
        serviceName,
        layerName: layer.name,
        featureCount: features.length,
      });

      for (const feature of features) {
        const center = centerForGeometry(feature.geometry);
        if (!center) {
          continue;
        }

        const areaTags = areaTagsFromCoords(center.lat, center.lon);
        if (!areaTags.length) {
          continue;
        }

        const attrs = feature.attributes || {};
        const key = [
          layer.name,
          center.lat.toFixed(4),
          center.lon.toFixed(4),
          String(attrs.OBJNAM || ""),
          String(attrs.CATWRK || attrs.CATOBS || ""),
        ].join("|");
        if (dedupe.has(key)) {
          continue;
        }
        dedupe.add(key);

        const layerType = /wreck/i.test(layer.name) ? "wreck" : "obstruction";
        const category = attrs.CATWRK || attrs.CATOBS || layerType;
        const depthFields = extractEncDepthFields(attrs);
        imported.push({
          id: `import-enc-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 16)}`,
          name: attrs.OBJNAM || `${serviceName.replace("enc_", "")} ${category}`,
          year: parseSourceYear(attrs.SORDAT),
          lat: Number(center.lat.toFixed(5)),
          lon: Number(center.lon.toFixed(5)),
          areaTags,
          cargoProfile:
            layerType === "wreck"
              ? `${category}; charted NOAA ENC wreck feature`
              : `${category}; charted NOAA ENC obstruction feature`,
          cargoValueWeight: scoreImportedWreckCargo(attrs, layer.name),
          causeTags:
            layerType === "wreck"
              ? ["charted-enc", "wreck"]
              : ["charted-enc", "obstruction"],
          historicalNotes:
            attrs.INFORM ||
            `${category}. Imported from NOAA ENC Direct ${serviceName} layer ${layer.name}.`,
          ...depthFields,
          sourceUrl: `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/${serviceName}/MapServer/${layer.id}`,
          sourceId: "noaa-enc-direct",
        });
      }
    }
  }

  return {
    wrecks: imported,
    meta: {
      importedAt: new Date().toISOString(),
      bbox: EAST_COAST_BBOX,
      servicesQueried: ENC_SERVICES,
      layers: layerHits,
      recordsImported: imported.length,
    },
  };
}

async function fetchLocQueryPage(query, page) {
  const params = new URLSearchParams({
    fo: "json",
    q: query,
    c: String(LOC_PAGE_SIZE),
    sp: String(page),
    dates: "1700/2027",
    fa: "original-format:newspaper|location:florida",
  });
  return fetchJson(`https://www.loc.gov/search/?${params.toString()}`);
}

async function importLocEntries() {
  const imported = [];
  const seen = new Set();
  const queryStats = [];

  for (const queryDef of LOC_QUERY_DEFINITIONS) {
    console.log(`Querying LOC for "${queryDef.query}" ...`);
    let importedForQuery = 0;
    for (let page = 1; page <= LOC_MAX_PAGES; page += 1) {
      const payload = await fetchLocQueryPage(queryDef.query, page);
      const results = Array.isArray(payload.results) ? payload.results : [];
      if (!results.length) {
        break;
      }

      for (const result of results) {
        if (!isRelevantLocHit(result)) {
          continue;
        }

        const sourceId = result.page_id || result.id || result.url;
        if (!sourceId || seen.has(sourceId)) {
          continue;
        }
        seen.add(sourceId);

        const description = Array.isArray(result.description)
          ? result.description.join(" ")
          : String(result.description || "");
        const areaTags = Array.from(
          new Set([
            ...queryDef.areaTags,
            ...inferAreaTags(
              `${result.title || ""} ${description} ${(result.location || []).join(" ")}`,
            ),
          ]),
        );
        if (!areaTags.length) {
          continue;
        }

        const combinedText = `${result.title || ""} ${description}`;
        const keywords = buildKeywordSignals(combinedText);
        imported.push({
          id: `import-loc-${String(sourceId).replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`,
          title: result.title || `LOC search hit: ${queryDef.query}`,
          year: parseSourceYear(result.date) || parseSourceYear(description),
          sourceLabel: (result.partof_title || [])[0] || "Library of Congress result",
          sourceId: "loc-chronicling-america",
          sourceUrl: result.url,
          verificationStatus: "imported-loc-snippet",
          areaTags,
          cargoProfile: buildLocCargoProfile(combinedText),
          confidence: Number(
            Math.min(
              0.86,
              0.36 + Math.min(0.18, areaTags.length * 0.07) + Math.min(0.18, keywords.length * 0.04),
            ).toFixed(2),
          ),
          excerpt: description.slice(0, 420),
          query: queryDef.query,
        });
        importedForQuery += 1;
      }

      if (results.length < LOC_PAGE_SIZE) {
        break;
      }
    }

    queryStats.push({
      query: queryDef.query,
      imported: importedForQuery,
    });
  }

  return {
    journalEntries: imported,
    meta: {
      importedAt: new Date().toISOString(),
      queries: queryStats,
      resultCount: imported.length,
      maxPagesPerQuery: LOC_MAX_PAGES,
    },
  };
}

async function main() {
  const db = await loadDb();
  console.log("Importing official maritime data...");

  const nhc = await importHurdatStorms();
  console.log(`NHC import complete: ${nhc.storms.length} storms.`);
  const enc = await importEncWrecks();
  console.log(`NOAA ENC import complete: ${enc.wrecks.length} records.`);
  const loc = await importLocEntries();
  console.log(`LOC import complete: ${loc.journalEntries.length} journal entries.`);

  db.importedStormEvents = nhc.storms;
  db.importedKnownWrecks = enc.wrecks;
  db.importedJournalEntries = loc.journalEntries;
  db.sourceImports = {
    lastRunAt: new Date().toISOString(),
    nhc: nhc.meta,
    enc: enc.meta,
    loc: loc.meta,
  };

  db.sources = db.sources.map((source) => {
    if (source.id === "noaa-hurricanes") {
      return { ...source, status: "imported" };
    }
    if (source.id === "noaa-enc-direct" || source.id === "noaa-awois") {
      return { ...source, status: "imported" };
    }
    if (source.id === "loc-chronicling-america") {
      return { ...source, status: "imported" };
    }
    return source;
  });

  await saveDb(db);

  console.log(`Imported ${nhc.storms.length} storms from ${nhc.meta.fileUrl}`);
  console.log(`Imported ${enc.wrecks.length} charted wreck/obstruction records from NOAA ENC Direct`);
  console.log(`Imported ${loc.journalEntries.length} LOC newspaper hits across ${LOC_QUERY_DEFINITIONS.length} queries`);
  console.log("Database updated:", db.sourceImports.lastRunAt);
}

main().catch((error) => {
  console.error("Maritime data import failed.");
  console.error(error);
  process.exit(1);
});
