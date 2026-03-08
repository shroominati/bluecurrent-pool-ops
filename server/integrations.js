const { URLSearchParams } = require("url");

function sanitizeWorkflowSourceType(value) {
  return value === "postgres" ? "postgres" : "json-url";
}

function getRoutingProviderState() {
  const provider = process.env.ROUTING_PROVIDER || "mapbox";
  const token = process.env.MAPBOX_ACCESS_TOKEN || "";
  const profile = process.env.MAPBOX_PROFILE || "mapbox/driving-traffic";

  return {
    provider,
    profile,
    configured: Boolean(token),
    mode: token ? "live-road-network" : "heuristic-fallback",
    supportsTraffic: profile === "mapbox/driving-traffic",
    maxDirectionsWaypoints: 25,
    maxOptimizationWaypoints: 12,
  };
}

function getQuickBooksConnectionConfig() {
  const environment = process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
  const baseUrl =
    environment === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";

  return {
    environment,
    clientId: process.env.QBO_CLIENT_ID || "",
    clientSecret: process.env.QBO_CLIENT_SECRET || "",
    redirectUri: process.env.QBO_REDIRECT_URI || "",
    authorizationEndpoint: "https://appcenter.intuit.com/connect/oauth2",
    tokenEndpoint: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    revocationEndpoint: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    companyBaseUrl: baseUrl,
    scopes: ["com.intuit.quickbooks.accounting"],
  };
}

function getWorkflowQueryTemplate() {
  return `SELECT
  work_order_id AS external_id,
  customer_name,
  address,
  latitude AS lat,
  longitude AS lon,
  neighborhood,
  gallons,
  service_minutes,
  service_date,
  priority,
  status,
  notes,
  service_type AS workflow_label,
  pool_external_id
FROM work_orders
WHERE service_date >= CURRENT_DATE
ORDER BY service_date ASC;`;
}

function getWorkflowConnectionState(dbWorkflow = {}) {
  return {
    configured: Boolean(
      dbWorkflow?.sourceType &&
        ((dbWorkflow.sourceType === "postgres" && dbWorkflow.connectionString && dbWorkflow.sqlQuery) ||
          (dbWorkflow.sourceType === "json-url" && dbWorkflow.feedUrl)),
    ),
    connected: Boolean(dbWorkflow?.connected),
    sourceType: sanitizeWorkflowSourceType(dbWorkflow?.sourceType),
    sourceName: dbWorkflow?.sourceName || "",
    lastSyncAt: dbWorkflow?.lastSyncAt || null,
    lastSyncCount: Number(dbWorkflow?.lastSyncCount || 0),
    lastError: dbWorkflow?.lastError || "",
    queryTemplate: getWorkflowQueryTemplate(),
  };
}

function mapboxHeaders() {
  return {
    Accept: "application/json",
  };
}

function formatCoordinates(points) {
  return points.map((point) => `${point.lon},${point.lat}`).join(";");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error_description || `Request failed: ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function fetchWorkflowRowsFromJsonUrl(config) {
  const payload = await fetchJson(config.feedUrl, { headers: { Accept: "application/json" } });
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

async function fetchWorkflowRowsFromPostgres(config) {
  const { Pool } = require("pg");
  const requiresTls = !/localhost|127\\.0\\.0\\.1/i.test(config.connectionString || "");
  const pool = new Pool({
    connectionString: config.connectionString,
    ssl: requiresTls ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await pool.query(config.sqlQuery);
    return result.rows || [];
  } finally {
    await pool.end().catch(() => {});
  }
}

async function fetchWorkflowRows(config = {}) {
  const sourceType = sanitizeWorkflowSourceType(config.sourceType);

  if (sourceType === "postgres") {
    if (!config.connectionString || !config.sqlQuery) {
      throw new Error("Workflow Postgres sync requires a connection string and SQL query.");
    }
    return fetchWorkflowRowsFromPostgres(config);
  }

  if (!config.feedUrl) {
    throw new Error("Workflow JSON sync requires a feed URL.");
  }

  return fetchWorkflowRowsFromJsonUrl(config);
}

async function optimizeStopOrderIfPossible(routePlan) {
  const config = getRoutingProviderState();
  const token = process.env.MAPBOX_ACCESS_TOKEN || "";

  if (!config.configured || routePlan.stops.length < 2 || routePlan.stops.length + 1 > 12) {
    return routePlan.stops;
  }

  const points = [routePlan.startPoint, ...routePlan.stops.map((stop) => stop.coordinates)];
  const params = new URLSearchParams({
    access_token: token,
    source: "first",
    roundtrip: "true",
    geometries: "geojson",
    overview: "full",
  });

  const url = `https://api.mapbox.com/optimized-trips/v1/${config.profile}/${formatCoordinates(points)}?${params.toString()}`;
  const payload = await fetchJson(url, { headers: mapboxHeaders() });
  const waypointIndexes = payload.waypoints
    .slice(1)
    .sort((a, b) => a.waypoint_index - b.waypoint_index)
    .map((waypoint) => waypoint.original_index - 1);

  if (!waypointIndexes.length || waypointIndexes.some((index) => index < 0)) {
    return routePlan.stops;
  }

  return waypointIndexes.map((index) => routePlan.stops[index]).filter(Boolean);
}

function chunkPoints(points, maxPoints) {
  const output = [];
  let cursor = 0;

  while (cursor < points.length - 1) {
    const slice = points.slice(cursor, cursor + maxPoints);
    if (slice.length < 2 && output.length) {
      output[output.length - 1].push(points[points.length - 1]);
      break;
    }

    if (slice.length < 2) {
      break;
    }

    output.push(slice);
    cursor += maxPoints - 1;
  }

  return output;
}

async function getDirectionsForPoints(points) {
  const config = getRoutingProviderState();
  const token = process.env.MAPBOX_ACCESS_TOKEN || "";

  if (!config.configured || points.length < 2) {
    return null;
  }

  const params = new URLSearchParams({
    access_token: token,
    geometries: "geojson",
    overview: "full",
    steps: "false",
  });

  const url = `https://api.mapbox.com/directions/v5/${config.profile}/${formatCoordinates(points)}?${params.toString()}`;
  const payload = await fetchJson(url, { headers: mapboxHeaders() });
  return payload.routes?.[0] || null;
}

async function enrichRoutePlanWithRouting(routePlan) {
  const routingState = getRoutingProviderState();
  if (!routingState.configured || !routePlan.stops.length) {
    return {
      ...routePlan,
      provider: routingState,
      routeMode: "heuristic-fallback",
    };
  }

  let orderedStops = routePlan.stops;

  try {
    orderedStops = await optimizeStopOrderIfPossible(routePlan);
  } catch (error) {
    orderedStops = routePlan.stops;
  }

  const fullPath = [routePlan.startPoint, ...orderedStops.map((stop) => stop.coordinates), routePlan.startPoint];
  const chunks = chunkPoints(fullPath, 25);
  const routes = [];

  for (const chunk of chunks) {
    const segment = await getDirectionsForPoints(chunk);
    if (!segment) {
      return {
        ...routePlan,
        stops: orderedStops.map((stop, index) => ({ ...stop, sequence: index + 1 })),
        provider: routingState,
        routeMode: "heuristic-fallback",
      };
    }
    routes.push(segment);
  }

  const allLegs = routes.flatMap((route) => route.legs || []);
  const enrichedStops = orderedStops.map((stop, index) => {
    const leg = allLegs[index] || null;
    return {
      ...stop,
      sequence: index + 1,
      milesFromPrev: leg ? Number(((leg.distance || 0) / 1609.344).toFixed(1)) : stop.milesFromPrev,
      driveMinutesFromPrev: leg ? Math.max(1, Math.round((leg.duration || 0) / 60)) : stop.driveMinutesFromPrev,
    };
  });

  const totalDistanceMeters = routes.reduce((sum, route) => sum + Number(route.distance || 0), 0);
  const totalDurationSeconds = routes.reduce((sum, route) => sum + Number(route.duration || 0), 0);
  const totalMiles = Number((totalDistanceMeters / 1609.344).toFixed(1));
  const driveMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));
  const totalServiceMinutes = enrichedStops.reduce((sum, stop) => sum + stop.serviceMinutes, 0);
  const geometry = routes.flatMap((route) => route.geometry?.coordinates || []);
  const fuelGallons = totalMiles / Math.max(routePlan.vehicleMpg || 1, 1);

  return {
    ...routePlan,
    stops: enrichedStops,
    path: geometry.length
      ? geometry.map(([lon, lat]) => ({ lon, lat }))
      : [routePlan.startPoint, ...enrichedStops.map((stop) => stop.coordinates), routePlan.startPoint],
    totalMiles,
    driveMinutes,
    workdayMinutes: driveMinutes + totalServiceMinutes,
    fuelGallons: Number(fuelGallons.toFixed(1)),
    provider: routingState,
    routeMode: "live-road-network",
  };
}

async function enrichRoutePlansWithRouting(routePlans) {
  const output = [];
  for (const routePlan of routePlans) {
    output.push(await enrichRoutePlanWithRouting(routePlan));
  }
  return output;
}

function requireQuickBooksConfig() {
  const config = getQuickBooksConnectionConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error("QuickBooks OAuth is not configured. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI.");
  }
  return config;
}

function createQuickBooksConnectUrl(state) {
  const config = requireQuickBooksConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: config.scopes.join(" "),
    redirect_uri: config.redirectUri,
    state,
  });
  return `${config.authorizationEndpoint}?${params.toString()}`;
}

function basicAuthHeader(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function exchangeQuickBooksCode(code) {
  const config = requireQuickBooksConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  return fetchJson(config.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

async function refreshQuickBooksToken(refreshToken) {
  const config = requireQuickBooksConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  return fetchJson(config.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

async function revokeQuickBooksToken(token) {
  const config = requireQuickBooksConfig();

  return fetchJson(config.revocationEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
}

async function fetchQuickBooksCompanyInfo(realmId, accessToken) {
  const config = requireQuickBooksConfig();
  const url = `${config.companyBaseUrl}/v3/company/${realmId}/companyinfo/${realmId}`;

  return fetchJson(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

module.exports = {
  createQuickBooksConnectUrl,
  enrichRoutePlansWithRouting,
  exchangeQuickBooksCode,
  fetchQuickBooksCompanyInfo,
  fetchWorkflowRows,
  getQuickBooksConnectionConfig,
  getRoutingProviderState,
  getWorkflowConnectionState,
  getWorkflowQueryTemplate,
  refreshQuickBooksToken,
  revokeQuickBooksToken,
  sanitizeWorkflowSourceType,
};
