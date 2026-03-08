const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const {
  DB_FILE,
  REGION_DEFS,
  ensureDbFile,
  loadDb,
  saveDb,
  getScoredCandidateZones,
  analyzeJournalText,
  buildReferencePoints,
  buildOverview,
} = require("./wreck-db");

const PORT = Number(process.env.WRECK_PORT || process.env.PORT || 8899);
const REQUEST_TIMEOUT_MS = Number(process.env.WRECK_IMPORT_TIMEOUT_MS || 15000);
const WRECK_APP_USER = process.env.WRECK_APP_USER || "admin";
const WRECK_APP_PASSWORD = process.env.WRECK_APP_PASSWORD || "georgeeatsgold";
const WRECK_APP_AUTH_ENABLED = process.env.WRECK_APP_AUTH_ENABLED !== "false";

const LIVE_REGION_CONFIG = {
  keys: {
    tideStation: { id: "8723970", name: "Vaca Key, Florida Bay" },
    buoyStation: { id: "SMKF1", name: "Sombrero Key" },
    weatherPoint: { lat: 24.77, lon: -80.78 },
  },
  "treasure-coast": {
    tideStation: { id: "8722212", name: "Fort Pierce, South Jetty" },
    buoyStation: { id: "41114", name: "Fort Pierce" },
    weatherPoint: { lat: 27.45, lon: -80.2 },
  },
  "space-coast": {
    tideStation: { id: "8721604", name: "Trident Pier, Port Canaveral" },
    buoyStation: { id: "41113", name: "Cape Canaveral Nearshore" },
    weatherPoint: { lat: 28.5332, lon: -80.3789 },
  },
  "daytona-coast": {
    tideStation: { id: "8721120", name: "Daytona Beach Shores" },
    buoyStation: { id: "41012", name: "St. Augustine" },
    weatherPoint: { lat: 29.15, lon: -80.96 },
  },
};

const app = express();

function timingSafeMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(headerValue) {
  const header = String(headerValue || "");
  if (!header.startsWith("Basic ")) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch (error) {
    return null;
  }
}

function requireBasicAuth(req, res, next) {
  if (req.path === "/healthz") {
    return next();
  }
  if (!WRECK_APP_AUTH_ENABLED) {
    return next();
  }
  const credentials = parseBasicAuth(req.headers.authorization);
  const isAuthorized =
    credentials &&
    timingSafeMatch(credentials.username, WRECK_APP_USER) &&
    timingSafeMatch(credentials.password, WRECK_APP_PASSWORD);
  if (isAuthorized) {
    return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Florida Wreck Signal", charset="UTF-8"');
  res.set("Cache-Control", "no-store");
  return res.status(401).send("Authentication required.");
}

app.use(requireBasicAuth);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "maritime")));

app.get("/healthz", async (req, res) => {
  res.json({ ok: true });
});

function requireText(value, field, minLength = 1) {
  if (!value || String(value).trim().length < minLength) {
    throw new Error(`${field} is required.`);
  }
  return String(value).trim();
}

function sanitizeYear(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1500 || year > new Date().getUTCFullYear()) {
    throw new Error("year must be a valid integer between 1500 and the current year.");
  }
  return year;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": "FloridaWreckSignal/1.0",
      Accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": "FloridaWreckSignal/1.0",
      Accept: "text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function regionKeyFromZone(zone) {
  if (!zone) {
    return "treasure-coast";
  }
  if (zone.regionKey && LIVE_REGION_CONFIG[zone.regionKey]) {
    return zone.regionKey;
  }
  if ((zone.areaTags || []).includes("keys")) {
    return "keys";
  }
  if ((zone.areaTags || []).includes("space-coast")) {
    return "space-coast";
  }
  if ((zone.areaTags || []).includes("daytona-coast")) {
    return "daytona-coast";
  }
  return "treasure-coast";
}

async function safeFetch(task, fallback) {
  try {
    return await task();
  } catch (error) {
    return fallback(error);
  }
}

function parseDurationMillis(duration) {
  const match = String(duration || "").match(
    /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/,
  );
  if (!match) {
    return 0;
  }
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

function pickGridValue(property) {
  const values = property?.values || [];
  if (!values.length) {
    return null;
  }
  const now = Date.now();
  for (const entry of values) {
    const [start, duration] = String(entry.validTime || "").split("/");
    const startMs = Date.parse(start);
    const endMs = startMs + parseDurationMillis(duration);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && now >= startMs && now <= endMs) {
      return entry.value;
    }
  }
  return values[0].value;
}

function cToF(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Number((Number(value) * 9) / 5 + 32).toFixed(1);
}

function mToFt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Number(Number(value) * 3.28084).toFixed(1);
}

function kmhToMph(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Number(Number(value) * 0.621371).toFixed(1);
}

function msToKnots(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Number(Number(value) * 1.94384).toFixed(1);
}

function parseNoaaSeries(properties) {
  return {
    airTempF: cToF(pickGridValue(properties.temperature)),
    windSpeedMph: kmhToMph(pickGridValue(properties.windSpeed)),
    windGustMph: kmhToMph(pickGridValue(properties.windGust)),
    windDirectionDeg: pickGridValue(properties.windDirection),
    waveHeightFt: mToFt(pickGridValue(properties.waveHeight)),
    wavePeriodSec: pickGridValue(properties.wavePeriod),
    waveDirectionDeg: pickGridValue(properties.waveDirection),
    primarySwellFt: mToFt(pickGridValue(properties.primarySwellHeight)),
    probabilityOfPrecipitation: pickGridValue(properties.probabilityOfPrecipitation),
  };
}

function parseBuoyObservation(text, stationId, stationName) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) {
    return null;
  }
  const headers = lines[0].replace(/^#/, "").trim().split(/\s+/);
  const values = lines[2].trim().split(/\s+/);
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || null]));
  const safeNumber = (value) => {
    if (!value || value === "MM") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    stationId,
    stationName,
    observedAt: `${record.YY}-${String(record.MM).padStart(2, "0")}-${String(record.DD).padStart(
      2,
      "0",
    )}T${String(record.hh).padStart(2, "0")}:${String(record.mm).padStart(2, "0")}:00Z`,
    windSpeedKnots: msToKnots(safeNumber(record.WSPD)),
    gustKnots: msToKnots(safeNumber(record.GST)),
    windDirectionDeg: safeNumber(record.WDIR),
    waveHeightFt: mToFt(safeNumber(record.WVHT)),
    dominantPeriodSec: safeNumber(record.DPD),
    averagePeriodSec: safeNumber(record.APD),
    waveDirectionDeg: safeNumber(record.MWD),
    waterTempF: cToF(safeNumber(record.WTMP)),
    airTempF: cToF(safeNumber(record.ATMP)),
  };
}

function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function fetchTideBundle(station) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
  const predictionUrl = `${base}?product=predictions&application=FloridaWreckSignal&begin_date=${formatDateYYYYMMDD(
    now,
  )}&end_date=${formatDateYYYYMMDD(
    tomorrow,
  )}&datum=MLLW&station=${station.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
  const predictionJson = await fetchJson(predictionUrl);
  let observed = null;
  try {
    const waterUrl = `${base}?product=water_level&application=FloridaWreckSignal&date=latest&datum=MLLW&station=${station.id}&time_zone=lst_ldt&units=english&format=json`;
    const waterJson = await fetchJson(waterUrl);
    if (Array.isArray(waterJson.data) && waterJson.data.length) {
      observed = {
        time: waterJson.data[0].t,
        waterLevelFt: Number(waterJson.data[0].v),
      };
    }
  } catch (error) {
    observed = null;
  }
  const nowMs = Date.now();
  const nextEvents = (predictionJson.predictions || [])
    .filter((entry) => Date.parse(`${entry.t}:00`) >= nowMs - 60 * 60 * 1000)
    .slice(0, 4)
    .map((entry) => ({
      time: entry.t,
      type: entry.type === "H" ? "High" : "Low",
      heightFt: Number(entry.v),
    }));
  return {
    station,
    observed,
    nextEvents,
  };
}

async function fetchWeatherBundle(point) {
  const pointJson = await fetchJson(`https://api.weather.gov/points/${point.lat},${point.lon}`);
  const gridJson = await fetchJson(pointJson.properties.forecastGridData);
  return {
    point: {
      lat: point.lat,
      lon: point.lon,
      forecastZone: pointJson.properties.forecastZone,
      relativeLocation: pointJson.properties.relativeLocation?.properties || null,
    },
    conditions: parseNoaaSeries(gridJson.properties),
  };
}

async function fetchLiveBundleForRegion(regionId) {
  const region = REGION_DEFS.find((item) => item.id === regionId);
  const config = LIVE_REGION_CONFIG[regionId];
  if (!region || !config) {
    throw new Error("Unsupported live region.");
  }
  const [weather, tide, buoyText] = await Promise.all([
    safeFetch(() => fetchWeatherBundle(config.weatherPoint), () => ({
      point: {
        lat: config.weatherPoint.lat,
        lon: config.weatherPoint.lon,
        forecastZone: null,
        relativeLocation: null,
      },
      conditions: {
        airTempF: null,
        windSpeedMph: null,
        windGustMph: null,
        windDirectionDeg: null,
        waveHeightFt: null,
        wavePeriodSec: null,
        waveDirectionDeg: null,
        primarySwellFt: null,
        probabilityOfPrecipitation: null,
      },
    })),
    safeFetch(() => fetchTideBundle(config.tideStation), () => ({
      station: config.tideStation,
      observed: null,
      nextEvents: [],
    })),
    safeFetch(
      () => fetchText(`https://www.ndbc.noaa.gov/data/realtime2/${config.buoyStation.id}.txt`),
      () => null,
    ),
  ]);
  return {
    region: {
      id: region.id,
      name: region.name,
      blurb: region.blurb,
      center: region.center,
    },
    weather,
    tides: tide,
    buoy: buoyText ? parseBuoyObservation(buoyText, config.buoyStation.id, config.buoyStation.name) : null,
    fetchedAt: new Date().toISOString(),
  };
}

app.get("/api/config", async (req, res) => {
  ensureDbFile();
  const db = await loadDb();
  res.json({
    appName: "Florida Wreck Signal",
    mode: db.sourceImports?.lastRunAt ? "live-imports" : "prototype",
    dbFile: DB_FILE,
    safetyMode: "coarse-zones-only",
    warning:
      "Use this for lawful maritime archaeology planning only. Verify archival records, protected-wreck rules, and permits before fieldwork.",
    capabilities: [
      "Florida Keys to Daytona coverage",
      "on-land beach and dune find corridors",
      "separate ocean prediction corridors",
      "live NOAA tide and marine conditions",
      "browser geolocation tracking",
      "target path guidance to coarse coordinates",
    ],
  });
});

app.get("/api/overview", async (req, res) => {
  const db = await loadDb();
  res.json(buildOverview(db));
});

app.get("/api/live-regions", async (req, res) => {
  try {
    const bundles = await Promise.all(REGION_DEFS.map((region) => fetchLiveBundleForRegion(region.id)));
    res.json({ regions: bundles });
  } catch (error) {
    res.status(502).json({ error: error.message || "Unable to fetch live NOAA region conditions." });
  }
});

app.get("/api/live-conditions", async (req, res) => {
  try {
    const db = await loadDb();
    const zoneId = String(req.query?.zoneId || "");
    const zones = getScoredCandidateZones(db);
    const zone = zones.find((item) => item.id === zoneId) || zones[0];
    const regionKey = regionKeyFromZone(zone);
    const bundle = await fetchLiveBundleForRegion(regionKey);
    res.json({
      zone: zone
        ? {
            id: zone.id,
            name: zone.name,
            lat: zone.lat,
            lon: zone.lon,
            regionKey: zone.regionKey,
          }
        : null,
      ...bundle,
    });
  } catch (error) {
    res.status(502).json({ error: error.message || "Unable to fetch live conditions for this zone." });
  }
});

app.get("/api/candidate-zones", async (req, res) => {
  const db = await loadDb();
  res.json({ candidateZones: getScoredCandidateZones(db) });
});

app.get("/api/reference-points", async (req, res) => {
  const db = await loadDb();
  res.json({ points: buildReferencePoints(db) });
});

app.post("/api/analyze-journal", async (req, res) => {
  try {
    const db = await loadDb();
    const text = requireText(req.body?.text, "text", 20);
    res.json({
      analysis: analyzeJournalText(
        {
          text,
          title: req.body?.title,
          year: req.body?.year,
          regionHint: req.body?.regionHint,
        },
        db,
      ),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to analyze journal text." });
  }
});

app.post("/api/journal-observations", async (req, res) => {
  try {
    const db = await loadDb();
    const title = requireText(req.body?.title, "title", 3);
    const excerpt = requireText(req.body?.excerpt, "excerpt", 20);
    const sourceLabel = requireText(req.body?.sourceLabel, "sourceLabel", 2);
    const year = sanitizeYear(req.body?.year);
    const areaTags = Array.isArray(req.body?.areaTags)
      ? req.body.areaTags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean).slice(0, 8)
      : [];
    const analysis = analyzeJournalText(
      {
        text: excerpt,
        title,
        year,
        regionHint: req.body?.regionHint || areaTags.join(" "),
      },
      db,
    );
    const entry = {
      id: crypto.randomUUID(),
      title,
      year: year || new Date().getUTCFullYear(),
      sourceLabel,
      sourceId: "manual-entry",
      verificationStatus: "unverified",
      areaTags: areaTags.length ? areaTags : analysis.extracted.areaTags,
      cargoProfile: analysis.extracted.cargoProfile,
      confidence: analysis.extracted.confidence,
      excerpt,
      createdAt: new Date().toISOString(),
    };
    const savedAnalysis = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title,
      extracted: analysis.extracted,
      topZoneIds: analysis.topZones.map((zone) => zone.id),
    };
    db.journalEntries.push(entry);
    db.savedAnalyses.push(savedAnalysis);
    await saveDb(db);
    res.status(201).json({
      journalEntry: entry,
      savedAnalysis,
      candidateZones: getScoredCandidateZones(db),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save journal observation." });
  }
});

app.get("*", async (req, res) => {
  res.sendFile(path.join(process.cwd(), "maritime", "index.html"));
});

ensureDbFile();
app.listen(PORT, () => {
  console.log(`Florida Wreck Signal listening on http://localhost:${PORT}`);
});
