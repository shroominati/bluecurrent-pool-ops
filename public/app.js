const state = {
  config: null,
  overview: null,
  serviceDate: new Date().toISOString().slice(0, 10),
  token: localStorage.getItem("poolOpsToken") || "",
  viewer: null,
  activeEmployeeId: "",
  activeMapEmployeeId: "",
  activeEmployeeTab: "overview",
  activeWorkspace: "dispatch",
  pendingPhotos: [],
  pendingCustomerPhotos: [],
  currentLocation: null,
  weatherByLocation: {},
  trackingWatchId: null,
  trackingHeartbeatTimer: null,
  lastHeartbeatAt: 0,
  overviewPollTimer: null,
  fleetMap: null,
  fleetMapLayers: null,
  focusedMap: null,
  focusedMapLayers: null,
  lastFleetMapFitKey: "",
  lastFocusedMapFitKey: "",
  deferredPrompt: null,
  apiBase: window.POOL_OPS_API_BASE || window.WRECK_API_BASE || window.REVEAL_API_BASE || "",
};

const ROUTE_COLORS = ["#4fc3f7", "#0ea5e9", "#38bdf8", "#7dd3fc", "#60a5fa", "#93c5fd"];

const refs = {
  loginScreen: document.getElementById("loginScreen"),
  appScreen: document.getElementById("appScreen"),
  loginForm: document.getElementById("loginForm"),
  demoAccounts: document.getElementById("demoAccounts"),
  viewerAvatar: document.getElementById("viewerAvatar"),
  viewerName: document.getElementById("viewerName"),
  viewerMeta: document.getElementById("viewerMeta"),
  installBtn: document.getElementById("installBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  companyName: document.getElementById("companyName"),
  configMode: document.getElementById("configMode"),
  configDb: document.getElementById("configDb"),
  companyMeta: document.getElementById("companyMeta"),
  serviceDate: document.getElementById("serviceDate"),
  generateRoutesBtn: document.getElementById("generateRoutesBtn"),
  routingStatus: document.getElementById("routingStatus"),
  quickbooksStatus: document.getElementById("quickbooksStatus"),
  pwaStatus: document.getElementById("pwaStatus"),
  recommendations: document.getElementById("recommendations"),
  integrationCopy: document.getElementById("integrationCopy"),
  integrationNotes: document.getElementById("integrationNotes"),
  workflowSourceForm: document.getElementById("workflowSourceForm"),
  workflowSourceType: document.getElementById("workflowSourceType"),
  workflowSourceName: document.getElementById("workflowSourceName"),
  workflowFeedUrl: document.getElementById("workflowFeedUrl"),
  workflowConnectionString: document.getElementById("workflowConnectionString"),
  workflowSqlQuery: document.getElementById("workflowSqlQuery"),
  workflowSaveBtn: document.getElementById("workflowSaveBtn"),
  workflowSyncBtn: document.getElementById("workflowSyncBtn"),
  workflowSyncSummary: document.getElementById("workflowSyncSummary"),
  quickbooksConnectBtn: document.getElementById("quickbooksConnectBtn"),
  quickbooksDisconnectBtn: document.getElementById("quickbooksDisconnectBtn"),
  kpiGrid: document.getElementById("kpiGrid"),
  workspaceTabs: document.getElementById("workspaceTabs"),
  workspacePanels: Array.from(document.querySelectorAll("[data-workspace-panel]")),
  economicsSummary: document.getElementById("economicsSummary"),
  economicsBoard: document.getElementById("economicsBoard"),
  expenseMixBoard: document.getElementById("expenseMixBoard"),
  opsMap: document.getElementById("opsMap"),
  focusedMap: document.getElementById("focusedMap"),
  fleetSpotlight: document.getElementById("fleetSpotlight"),
  focusedRouteRail: document.getElementById("focusedRouteRail"),
  routeBoard: document.getElementById("routeBoard"),
  visitFeed: document.getElementById("visitFeed"),
  employeeBoard: document.getElementById("employeeBoard"),
  employeeTabs: document.getElementById("employeeTabs"),
  employeePanel: document.getElementById("employeePanel"),
  payrollBoard: document.getElementById("payrollBoard"),
  salesSummary: document.getElementById("salesSummary"),
  salesBoard: document.getElementById("salesBoard"),
  salesLeaderboard: document.getElementById("salesLeaderboard"),
  customerPortalSummary: document.getElementById("customerPortalSummary"),
  customerPoolBoard: document.getElementById("customerPoolBoard"),
  customerRequestForm: document.getElementById("customerRequestForm"),
  customerPoolSelect: document.getElementById("customerPoolSelect"),
  customerRequestType: document.getElementById("customerRequestType"),
  customerReferralFields: document.getElementById("customerReferralFields"),
  customerReferralAddressField: document.getElementById("customerReferralAddressField"),
  customerPhotoInput: document.getElementById("customerPhotoInput"),
  customerPhotoPreview: document.getElementById("customerPhotoPreview"),
  customerRequestBoard: document.getElementById("customerRequestBoard"),
  customerVisitBoard: document.getElementById("customerVisitBoard"),
  poolBoard: document.getElementById("poolBoard"),
  workflowSummary: document.getElementById("workflowSummary"),
  workflowBoard: document.getElementById("workflowBoard"),
  quickbooksSummary: document.getElementById("quickbooksSummary"),
  quickbooksBoard: document.getElementById("quickbooksBoard"),
  employeeSelect: document.getElementById("employeeSelect"),
  expenseEmployeeSelect: document.getElementById("expenseEmployeeSelect"),
  poolSelect: document.getElementById("poolSelect"),
  expensePoolSelect: document.getElementById("expensePoolSelect"),
  salesForm: document.getElementById("salesForm"),
  salesEmployeeSelect: document.getElementById("salesEmployeeSelect"),
  salesPoolSelect: document.getElementById("salesPoolSelect"),
  portalSummary: document.getElementById("portalSummary"),
  portalRouteList: document.getElementById("portalRouteList"),
  visitForm: document.getElementById("visitForm"),
  expenseForm: document.getElementById("expenseForm"),
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  captureLocationBtn: document.getElementById("captureLocationBtn"),
  locationStatus: document.getElementById("locationStatus"),
  expenseDate: document.getElementById("expenseDate"),
  arrivalAt: document.getElementById("arrivalAt"),
  departureAt: document.getElementById("departureAt"),
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

function apiPath(path) {
  return `${state.apiBase}${path}`;
}

function preferredServiceDate() {
  return state.config?.suggestedServiceDate || state.serviceDate;
}

function storeToken(token) {
  state.token = token || "";
  if (state.token) {
    localStorage.setItem("poolOpsToken", state.token);
  } else {
    localStorage.removeItem("poolOpsToken");
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(apiPath(path), { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && path !== "/api/auth/login" && path !== "/api/config") {
    storeToken("");
    state.viewer = null;
    showLogin();
    throw new Error("Your session expired. Sign in again.");
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value || 0),
  );
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function datetimeLocalValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseChemicalLines(input) {
  return String(input || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [product = "", amount = "", cost = ""] = line.split("|").map((part) => part.trim());
      return { product, amount, cost: Number(cost || 0) || 0 };
    })
    .filter((item) => item.product && item.amount);
}

function isManager() {
  return state.viewer?.role === "owner" || state.viewer?.role === "dispatcher";
}

function isCustomerViewer() {
  return state.viewer?.role === "customer";
}

function availableWorkspaces() {
  if (isCustomerViewer()) {
    return [{ id: "customer", label: "Customer" }];
  }
  if (isManager()) {
    return [
      { id: "dispatch", label: "Dispatch" },
      { id: "team", label: "Team" },
      { id: "sales", label: "Sales" },
      { id: "customer", label: "Customer" },
      { id: "field", label: "Field" },
      { id: "admin", label: "Admin" },
    ];
  }
  return [
    { id: "field", label: "Field" },
    { id: "team", label: "Team" },
    { id: "sales", label: "Sales" },
  ];
}

function currentEmployee() {
  return state.overview?.employees.find((employee) => employee.id === state.activeEmployeeId) || null;
}

function currentRoutePlan() {
  return state.overview?.routePlans.find((plan) => plan.employeeId === state.activeEmployeeId) || null;
}

function routePoolsForEmployee() {
  const plan = currentRoutePlan();
  return plan ? plan.stops : [];
}

function workflowItemsForEmployee(employeeId) {
  const plan = state.overview?.routePlans.find((entry) => entry.employeeId === employeeId);
  return plan ? plan.stops.flatMap((stop) => stop.workflowItems || []) : [];
}

function routeColorForEmployee(employeeId) {
  const plans = state.overview?.routePlans || [];
  const index = plans.findIndex((plan) => plan.employeeId === employeeId);
  return ROUTE_COLORS[(index >= 0 ? index : 0) % ROUTE_COLORS.length];
}

function initialsForName(name) {
  return String(name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function weatherKey(lat, lon) {
  return `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
}

function weatherSummary(code) {
  const lookup = {
    0: { label: "Clear", icon: "Sun" },
    1: { label: "Mostly clear", icon: "Sun" },
    2: { label: "Partly cloudy", icon: "Cloud" },
    3: { label: "Overcast", icon: "Cloud" },
    45: { label: "Fog", icon: "Mist" },
    48: { label: "Rime fog", icon: "Mist" },
    51: { label: "Light drizzle", icon: "Drizzle" },
    53: { label: "Drizzle", icon: "Drizzle" },
    55: { label: "Heavy drizzle", icon: "Rain" },
    61: { label: "Light rain", icon: "Rain" },
    63: { label: "Rain", icon: "Rain" },
    65: { label: "Heavy rain", icon: "Rain" },
    71: { label: "Light snow", icon: "Snow" },
    73: { label: "Snow", icon: "Snow" },
    75: { label: "Heavy snow", icon: "Snow" },
    80: { label: "Rain showers", icon: "Rain" },
    81: { label: "Heavy showers", icon: "Rain" },
    82: { label: "Violent showers", icon: "Storm" },
    95: { label: "Thunderstorm", icon: "Storm" },
    96: { label: "Storm + hail", icon: "Storm" },
    99: { label: "Severe storm", icon: "Storm" },
  };
  return lookup[code] || { label: "Weather", icon: "Sky" };
}

async function refreshWeather() {
  const locations = [];
  const seen = new Set();

  (state.overview?.routePlans || []).forEach((plan) => {
    plan.stops.forEach((stop) => {
      const key = weatherKey(stop.coordinates.lat, stop.coordinates.lon);
      if (!seen.has(key)) {
        seen.add(key);
        locations.push({ key, lat: stop.coordinates.lat, lon: stop.coordinates.lon, label: stop.customerName });
      }
    });
  });

  (state.overview?.pools || []).forEach((pool) => {
    const key = weatherKey(pool.lat, pool.lon);
    if (!seen.has(key)) {
      seen.add(key);
      locations.push({ key, lat: pool.lat, lon: pool.lon, label: pool.customerName });
    }
  });

  if (!locations.length) {
    state.weatherByLocation = {};
    return;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", locations.map((item) => item.lat).join(","));
  url.searchParams.set("longitude", locations.map((item) => item.lon).join(","));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m,precipitation");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");

  try {
    const payload = await fetch(url.toString()).then((response) => response.json());
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.latitude) ? [] : [payload];
    const weatherByLocation = {};

    if (rows.length) {
      rows.forEach((row, index) => {
        const location = locations[index];
        if (!location || !row?.current) {
          return;
        }
        weatherByLocation[location.key] = {
          temperature: row.current.temperature_2m,
          weatherCode: row.current.weather_code,
          windSpeed: row.current.wind_speed_10m,
          precipitation: row.current.precipitation,
        };
      });
    } else if (payload?.latitude && Array.isArray(payload.latitude)) {
      payload.latitude.forEach((lat, index) => {
        const location = locations[index];
        if (!location || !payload?.current?.[index]) {
          return;
        }
      });
    }

    if (!rows.length && Array.isArray(payload?.current)) {
      payload.current.forEach((currentRow, index) => {
        const location = locations[index];
        if (!location || !currentRow) {
          return;
        }
        weatherByLocation[location.key] = {
          temperature: currentRow.temperature_2m,
          weatherCode: currentRow.weather_code,
          windSpeed: currentRow.wind_speed_10m,
          precipitation: currentRow.precipitation,
        };
      });
    }

    state.weatherByLocation = weatherByLocation;
  } catch (error) {
    state.weatherByLocation = {};
  }
}

function weatherBadge(lat, lon) {
  const weather = state.weatherByLocation[weatherKey(lat, lon)];
  if (!weather) {
    return "<span class='weather-chip'>Weather loading</span>";
  }
  const summary = weatherSummary(weather.weatherCode);
  return `<span class="weather-chip">${escapeHtml(summary.label)} ${Math.round(Number(weather.temperature || 0))}F • ${Math.round(
    Number(weather.windSpeed || 0),
  )} mph</span>`;
}

function mapPoint(point) {
  if (!point) {
    return null;
  }
  if (typeof point.lat === "number" && typeof point.lon === "number") {
    return { lat: point.lat, lon: point.lon };
  }
  return null;
}

function planDisplayPoints(plan) {
  const pathPoints = Array.isArray(plan.path) ? plan.path.map(mapPoint).filter(Boolean) : [];
  if (pathPoints.length >= 2) {
    return pathPoints;
  }
  return [mapPoint(plan.startPoint), ...plan.stops.map((stop) => mapPoint(stop.coordinates)), mapPoint(plan.startPoint)].filter(Boolean);
}

function latestEmployeeFieldPosition(employeeId) {
  const live = state.overview?.liveTracking?.positions?.find((entry) => entry.employeeId === employeeId);
  if (live) {
    return live;
  }
  const employee = state.overview?.employees.find((entry) => entry.id === employeeId);
  const latestVisit = employee?.todayVisits?.find((visit) => visit.actualLocation) || null;
  return latestVisit?.actualLocation || employee?.homeBase || null;
}

function heartbeatTrailForEmployee(employeeId) {
  return (state.overview?.liveTracking?.history || []).filter((entry) => entry.employeeId === employeeId);
}

function ensureLeafletMap(kind) {
  const isFleet = kind === "fleet";
  const host = isFleet ? refs.opsMap : refs.focusedMap;
  const currentMap = isFleet ? state.fleetMap : state.focusedMap;
  const containerId = isFleet ? "leafletFleetMap" : "leafletFocusedMap";
  const overlayId = isFleet ? "fleetMapOverlayCard" : "focusedMapOverlayCard";

  if (!window.L || !host) {
    return false;
  }

  if (currentMap) {
    return true;
  }

  host.innerHTML = `
    <div id="${containerId}" class="leaflet-ops-map"></div>
    <div id="${overlayId}" class="map-overlay-card"></div>
  `;

  const map = window.L.map(containerId, {
    zoomControl: false,
    attributionControl: true,
  });

  window.L.control
    .zoom({
      position: "bottomright",
    })
    .addTo(map);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const layers = {
    routes: window.L.layerGroup().addTo(map),
    stops: window.L.layerGroup().addTo(map),
    trails: window.L.layerGroup().addTo(map),
    employees: window.L.layerGroup().addTo(map),
  };

  if (isFleet) {
    state.fleetMap = map;
    state.fleetMapLayers = layers;
  } else {
    state.focusedMap = map;
    state.focusedMapLayers = layers;
  }

  return true;
}

function setMapOverlayCard(kind, content) {
  const overlay = document.getElementById(kind === "fleet" ? "fleetMapOverlayCard" : "focusedMapOverlayCard");
  if (overlay) {
    overlay.innerHTML = content;
  }
}

function createEmployeeMarker(plan, employee, isFocus) {
  const color = routeColorForEmployee(plan.employeeId);
  const markerHtml = `
    <button class="live-map-marker ${isFocus ? "is-focus" : ""}" style="--route-color:${color}" data-employee-id="${escapeHtml(plan.employeeId)}">
      <span class="live-map-pulse"></span>
      <span class="live-map-core">${escapeHtml(initialsForName(employee.name))}</span>
    </button>
  `;

  return window.L.divIcon({
    className: "live-map-icon-wrap",
    html: markerHtml,
    iconSize: [isFocus ? 54 : 46, isFocus ? 54 : 46],
    iconAnchor: [isFocus ? 27 : 23, isFocus ? 27 : 23],
  });
}

function setDefaultDateTimes() {
  const now = new Date();
  const depart = new Date(now.getTime() + 40 * 60000);
  refs.arrivalAt.value = datetimeLocalValue(now);
  refs.departureAt.value = datetimeLocalValue(depart);
  refs.serviceDate.value = state.serviceDate;
  refs.expenseDate.value = state.serviceDate;
  refs.locationStatus.textContent =
    "GPS is optional. Captured location helps compare planned routes to actual field activity.";
}

function syncWorkflowFieldVisibility() {
  const isPostgres = refs.workflowSourceType?.value === "postgres";
  refs.workflowFeedUrl?.closest(".field")?.classList.toggle("hidden", isPostgres);
  refs.workflowConnectionString?.closest(".field")?.classList.toggle("hidden", !isPostgres);
  refs.workflowSqlQuery?.closest(".field")?.classList.toggle("hidden", !isPostgres);
}

function showLogin() {
  refs.loginScreen.classList.remove("hidden");
  refs.appScreen.classList.add("hidden");
}

function showApp() {
  refs.loginScreen.classList.add("hidden");
  refs.appScreen.classList.remove("hidden");
}

function applyRoleVisibility() {
  document.querySelectorAll(".manager-only").forEach((node) => {
    node.classList.toggle("hidden", !isManager());
  });
  document.querySelectorAll(".internal-only").forEach((node) => {
    node.classList.toggle("hidden", isCustomerViewer());
  });
  refs.workspaceTabs?.closest(".workspace-nav-panel")?.classList.toggle("hidden", availableWorkspaces().length <= 1);
}

function renderDemoAccounts() {
  refs.demoAccounts.innerHTML = (state.config?.demoAccounts || [])
    .map(
      (account) => `
        <button class="demo-card" type="button" data-email="${escapeHtml(account.email)}" data-password="${escapeHtml(
          account.password,
        )}">
          <img class="demo-avatar" src="${escapeHtml(account.avatarUrl || "")}" alt="${escapeHtml(account.name || account.role)}" />
          <div class="demo-copy">
            <strong>${escapeHtml(account.name || account.role)}</strong>
            <span>${escapeHtml(account.role)} • ${escapeHtml(account.email)}</span>
            ${
              account.role === "customer"
                ? `<span>${Number(account.poolCount || 0)} pool account${Number(account.poolCount || 0) === 1 ? "" : "s"}</span>`
                : ""
            }
          </div>
        </button>
      `,
    )
    .join("");
}

function renderTopbar() {
  refs.viewerAvatar.src = state.viewer?.avatarUrl || "";
  refs.viewerName.textContent = state.viewer?.name || "User";
  refs.viewerMeta.textContent = `${state.viewer?.role || ""} • ${state.viewer?.email || ""}`;
}

function renderHero() {
  if (!state.config || !state.overview) {
    return;
  }

  refs.companyName.textContent = state.overview.company.name;
  refs.configMode.textContent = state.config.mode;
  refs.configDb.textContent = state.config.dbMode;
  refs.companyMeta.textContent = `${state.overview.company.headquarters} • ${state.overview.company.serviceArea}`;
  refs.routingStatus.textContent = `Routing: ${state.overview.integrations.routing.mode}`;
  refs.quickbooksStatus.textContent = state.overview.quickbooks.connected
    ? `QuickBooks: ${state.overview.quickbooks.companyName || "Connected"}`
    : `QuickBooks: ${state.overview.quickbooks.syncState}`;
  refs.pwaStatus.textContent = state.overview.liveTracking?.lastUpdatedAt
    ? `Live: ${formatDateTime(state.overview.liveTracking.lastUpdatedAt)}`
    : navigator.serviceWorker?.controller
      ? "PWA: offline-ready"
      : "PWA: installable";

  refs.integrationCopy.textContent = state.overview.quickbooks.connected
    ? `Connected to ${state.overview.quickbooks.companyName || "QuickBooks"} in ${state.overview.quickbooks.environment}.`
    : `Routing provider is ${state.overview.integrations.routing.mode}. QuickBooks is ${state.overview.quickbooks.syncState}. Workflow sync is ${state.overview.integrations.workflow.connected ? "live" : "idle"}.`;

  refs.workflowSyncSummary.textContent = state.overview.integrations.workflow.connected
    ? `${state.overview.integrations.workflow.sourceName || "Workflow source"} synced ${state.overview.integrations.workflow.lastSyncCount} jobs on ${state.overview.integrations.workflow.lastSyncAt ? formatDateTime(state.overview.integrations.workflow.lastSyncAt) : "recently"}.`
    : state.overview.integrations.workflow.lastError
      ? state.overview.integrations.workflow.lastError
      : "Connect a JSON feed or Postgres query to pull existing workflow into the route engine.";

  refs.integrationNotes.innerHTML = `
    <article class="list-card">
      <h3>Routing provider</h3>
      <p>${escapeHtml(state.overview.integrations.routing.provider)} • ${escapeHtml(
        state.overview.integrations.routing.profile,
      )}</p>
      <p class="meta-copy">Last route build: ${escapeHtml(
        state.overview.integrations.routing.lastPlannedAt
          ? formatDateTime(state.overview.integrations.routing.lastPlannedAt)
          : "Not yet generated",
      )}</p>
      <p class="meta-copy">Objective: least fuel burn + least time loss</p>
    </article>
    <article class="list-card">
      <h3>QuickBooks</h3>
      <p>${escapeHtml(
        state.overview.quickbooks.connected
          ? `${state.overview.quickbooks.companyLegalName || state.overview.quickbooks.companyName}`
          : state.overview.quickbooks.syncState,
      )}</p>
      <p class="meta-copy">Realm: ${escapeHtml(state.overview.quickbooks.realmId || "Not connected")}</p>
    </article>
    <article class="list-card">
      <h3>Workflow sync</h3>
      <p>${escapeHtml(state.overview.integrations.workflow.sourceName || "No source saved")}</p>
      <p class="meta-copy">${escapeHtml(state.overview.integrations.workflow.sourceType)} • ${escapeHtml(
        state.overview.integrations.workflow.connected
          ? `${state.overview.integrations.workflow.lastSyncCount} jobs imported`
          : "Awaiting source setup",
      )}</p>
    </article>
  `;

  if (refs.workflowSqlQuery && !refs.workflowSqlQuery.dataset.prefilled && state.overview.integrations.workflow.queryTemplate) {
    refs.workflowSqlQuery.value = state.overview.integrations.workflow.queryTemplate;
    refs.workflowSqlQuery.dataset.prefilled = "true";
  }
  refs.workflowSourceType.value = state.overview.integrations.workflow.sourceType || "json-url";
  refs.workflowSourceName.value = state.overview.integrations.workflow.sourceName || "";
  syncWorkflowFieldVisibility();

  refs.quickbooksConnectBtn.classList.toggle("hidden", !isManager() || state.overview.quickbooks.connected);
  refs.quickbooksDisconnectBtn.classList.toggle("hidden", !isManager() || !state.overview.quickbooks.connected);

  const items = state.overview.recommendations || [];
  refs.recommendations.innerHTML = items.length
    ? items.map((item) => `<article class="recommendation-pill">${escapeHtml(item)}</article>`).join("")
    : "<article class='recommendation-pill'>No urgent route or chemistry exceptions are open.</article>";
}

function renderKpis() {
  const dashboard = state.overview?.dashboard;
  if (!dashboard) {
    return;
  }

  const cards = [
    { label: "Pools due", value: dashboard.totalPoolsDue, detail: `${dashboard.completedPools} completed` },
    { label: "Route miles", value: dashboard.routeMiles, detail: `${dashboard.driveTimeHours} drive hrs` },
    { label: "Fuel burn", value: `${dashboard.fuelGallons} gal`, detail: `${formatMoney(dashboard.gasBurnCost)} est. cost` },
    { label: "Ops expense", value: formatMoney(dashboard.totalOperatingExpense || 0), detail: `${formatMoney(dashboard.averageCostPerJob || 0)} per job` },
    { label: "Chlorine", value: dashboard.averageChlorine ? `${dashboard.averageChlorine} ppm` : "--", detail: `${dashboard.lowChlorineJobs || 0} low jobs` },
    { label: "Sales pipe", value: formatMoney(dashboard.salesPipelineValue || 0), detail: `${dashboard.salesOpen || 0} open • ${formatMoney(dashboard.salesProjectedBonusMonth || 0)} bonus` },
  ];

  refs.kpiGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <p>${escapeHtml(card.label)}</p>
          <strong>${escapeHtml(String(card.value))}</strong>
          <span>${escapeHtml(card.detail)}</span>
        </article>
      `,
    )
    .join("");
}

function renderWorkspaceTabs() {
  if (!refs.workspaceTabs) {
    return;
  }
  const tabs = availableWorkspaces();
  if (!tabs.some((tab) => tab.id === state.activeWorkspace)) {
    state.activeWorkspace = tabs[0]?.id || "dispatch";
  }

  refs.workspaceTabs.innerHTML = tabs
    .map(
      (tab) => `
        <button class="workspace-tab ${state.activeWorkspace === tab.id ? "is-active" : ""}" type="button" data-workspace="${tab.id}">
          ${tab.label}
        </button>
      `,
    )
    .join("");
}

function applyWorkspaceVisibility() {
  refs.workspacePanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.workspacePanel !== state.activeWorkspace);
  });
}

function renderFleetMap() {
  const plans = state.overview?.routePlans || [];
  if (!plans.length) {
    refs.opsMap.innerHTML = "<article class='muted-card'>Generate routes to light up the command center map.</article>";
    state.fleetMap = null;
    state.fleetMapLayers = null;
    return;
  }

  if (!ensureLeafletMap("fleet")) {
    refs.opsMap.innerHTML = "<article class='muted-card'>Map engine unavailable in this browser.</article>";
    return;
  }
  state.fleetMap.invalidateSize();

  if (!state.activeMapEmployeeId || !plans.some((plan) => plan.employeeId === state.activeMapEmployeeId)) {
    state.activeMapEmployeeId = plans[0].employeeId;
  }

  Object.values(state.fleetMapLayers).forEach((layer) => layer.clearLayers());

  const allPoints = [];
  plans.forEach((plan) => {
    const color = routeColorForEmployee(plan.employeeId);
    const isActive = plan.employeeId === state.activeMapEmployeeId;
    const routePoints = planDisplayPoints(plan).map((point) => [point.lat, point.lon]);
    routePoints.forEach((point) => allPoints.push(point));

    if (routePoints.length >= 2) {
      window.L.polyline(routePoints, {
        color,
        weight: isActive ? 5 : 3,
        opacity: isActive ? 0.62 : 0.26,
        lineCap: "round",
      }).addTo(state.fleetMapLayers.routes);
    }

    const trailPoints = heartbeatTrailForEmployee(plan.employeeId).map((point) => [point.lat, point.lon]);
    trailPoints.forEach((point) => allPoints.push(point));
    if (trailPoints.length >= 2) {
      window.L.polyline(trailPoints, {
        color,
        weight: isActive ? 8 : 5,
        opacity: isActive ? 0.15 : 0.08,
        lineCap: "round",
      }).addTo(state.fleetMapLayers.trails);
    }

    const employee = state.overview?.employees.find((entry) => entry.id === plan.employeeId);
    const position = latestEmployeeFieldPosition(plan.employeeId);
    if (employee && position) {
      const markerLatLng = [position.lat, position.lon];
      allPoints.push(markerLatLng);
      const marker = window.L.marker(markerLatLng, {
        icon: createEmployeeMarker(plan, employee, isActive),
        keyboard: false,
      }).addTo(state.fleetMapLayers.employees);
      marker.on("click", () => {
        state.activeWorkspace = "dispatch";
        state.activeMapEmployeeId = plan.employeeId;
        if (isManager()) {
          state.activeEmployeeId = plan.employeeId;
          refs.employeeSelect.value = state.activeEmployeeId;
          populatePoolSelects();
          renderPortal();
        }
        renderWorkspaceTabs();
        applyWorkspaceVisibility();
        renderFleetMap();
        renderFocusedRouteMap();
        renderRouteBoard();
        renderEmployeeBoard();
        renderEmployeeTabs();
        renderEmployeePanel();
      });
      marker.bindTooltip(`${employee.name}<br>${plan.totalPools} stops • ${plan.totalMiles} mi`, {
        direction: "top",
      });
    }
  });

  const fitKey = plans
    .map((plan) => {
      const live = latestEmployeeFieldPosition(plan.employeeId);
      return `${plan.id}:${live?.lat || ""}:${live?.lon || ""}`;
    })
    .join("|");
  if (allPoints.length && state.lastFleetMapFitKey !== fitKey) {
    state.fleetMap.fitBounds(allPoints, { padding: [36, 36] });
    state.lastFleetMapFitKey = fitKey;
  }

  const liveCount = (state.overview?.liveTracking?.positions || []).length;
  setMapOverlayCard(
    "fleet",
    `
      <p class="mini-label">Main fleet map</p>
      <h3>${liveCount} live technicians tracked</h3>
      <p class="meta-copy">This top map always shows the full team, not the selected route only.</p>
      <div class="map-overlay-stats">
        <span>${plans.length} active routes</span>
        <span>${liveCount} live markers</span>
        <span>${state.overview?.dashboard?.routeMiles || 0} fleet miles</span>
      </div>
    `,
  );
}

function renderFocusedRouteMap() {
  const plans = state.overview?.routePlans || [];
  if (!plans.length) {
    refs.focusedMap.innerHTML = "<article class='muted-card'>Select an employee after routes are generated.</article>";
    refs.fleetSpotlight.innerHTML = "";
    refs.focusedRouteRail.innerHTML = "";
    state.focusedMap = null;
    state.focusedMapLayers = null;
    return;
  }

  if (!ensureLeafletMap("focused")) {
    refs.focusedMap.innerHTML = "<article class='muted-card'>Map engine unavailable in this browser.</article>";
    return;
  }
  state.focusedMap.invalidateSize();

  if (!state.activeMapEmployeeId || !plans.some((plan) => plan.employeeId === state.activeMapEmployeeId)) {
    state.activeMapEmployeeId = plans[0].employeeId;
  }

  const focusPlan = plans.find((plan) => plan.employeeId === state.activeMapEmployeeId) || plans[0];
  Object.values(state.focusedMapLayers).forEach((layer) => layer.clearLayers());

  const color = routeColorForEmployee(focusPlan.employeeId);
  const focusPoints = [];
  const routePoints = planDisplayPoints(focusPlan).map((point) => [point.lat, point.lon]);
  routePoints.forEach((point) => focusPoints.push(point));

  if (routePoints.length >= 2) {
    window.L.polyline(routePoints, {
      color,
      weight: 7,
      opacity: 0.94,
      lineCap: "round",
    }).addTo(state.focusedMapLayers.routes);
  }

  const trailPoints = heartbeatTrailForEmployee(focusPlan.employeeId).map((point) => [point.lat, point.lon]);
  trailPoints.forEach((point) => focusPoints.push(point));
  if (trailPoints.length >= 2) {
    window.L.polyline(trailPoints, {
      color,
      weight: 11,
      opacity: 0.16,
      lineCap: "round",
    }).addTo(state.focusedMapLayers.trails);
  }

  focusPlan.stops.forEach((stop) => {
    const stopLatLng = [stop.coordinates.lat, stop.coordinates.lon];
    focusPoints.push(stopLatLng);
    window.L.circleMarker(stopLatLng, {
      radius: 7,
      color,
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 0.96,
    })
      .bindTooltip(`${stop.sequence}. ${stop.customerName}<br>${stop.address}`, { direction: "top" })
      .addTo(state.focusedMapLayers.stops);
  });

  const focusEmployee = state.overview?.employees.find((entry) => entry.id === focusPlan.employeeId);
  const position = latestEmployeeFieldPosition(focusPlan.employeeId);
  if (focusEmployee && position) {
    const markerLatLng = [position.lat, position.lon];
    focusPoints.push(markerLatLng);
    window.L.marker(markerLatLng, {
      icon: createEmployeeMarker(focusPlan, focusEmployee, true),
      keyboard: false,
    })
      .addTo(state.focusedMapLayers.employees)
      .bindTooltip(`${focusEmployee.name}<br>${focusPlan.totalPools} stops • ${focusPlan.totalMiles} mi`, {
        direction: "top",
      });
  }

  const fitKey = `${focusPlan.employeeId}:${focusPlan.totalPools}:${position?.lat || ""}:${position?.lon || ""}:${
    trailPoints.length
  }`;
  if (focusPoints.length && state.lastFocusedMapFitKey !== fitKey) {
    state.focusedMap.fitBounds(focusPoints, { padding: [40, 40] });
    state.lastFocusedMapFitKey = fitKey;
  }

  setMapOverlayCard(
    "focused",
    `
      <p class="mini-label">Focused live route</p>
      <h3>${escapeHtml(focusPlan.employeeName)}</h3>
      <p class="meta-copy">${focusPlan.totalPools} stops • ${focusPlan.totalMiles} mi • ${focusPlan.routeMode}</p>
      <div class="map-overlay-stats">
        <span>${heartbeatTrailForEmployee(focusPlan.employeeId).length} live pings</span>
        <span>${focusPlan.fuelGallons} gal burn</span>
        <span>${focusPlan.efficiencyScore} score</span>
      </div>
    `,
  );

  refs.fleetSpotlight.innerHTML = plans
    .map((plan) => {
      const employee = state.overview?.employees.find((entry) => entry.id === plan.employeeId);
      const summary = employee?.planSummary;
      const color = routeColorForEmployee(plan.employeeId);
      const isFocus = plan.employeeId === focusPlan.employeeId;
      return `
        <button class="fleet-spotlight-card ${isFocus ? "is-active" : ""}" type="button" data-employee-id="${escapeHtml(
          plan.employeeId,
        )}" style="--route-color:${color}">
          <div class="fleet-spotlight-top">
            <div class="viewer-chip">
              <img class="viewer-avatar" src="${employee?.avatarUrl || ""}" alt="${escapeHtml(plan.employeeName)}" />
              <div>
                <strong>${escapeHtml(plan.employeeName)}</strong>
                <p class="meta-copy">${escapeHtml(employee?.role || "")}</p>
              </div>
            </div>
            <span class="tag">${plan.totalPools} stops</span>
          </div>
          <div class="fleet-metrics">
            <span>${plan.totalMiles} mi</span>
            <span>${plan.fuelGallons} gal</span>
            <span>${summary?.completedPools || 0}/${summary?.totalPools || plan.totalPools} done</span>
            <span>${heartbeatTrailForEmployee(plan.employeeId).length} pings</span>
            <span>${workflowItemsForEmployee(plan.employeeId).length} workflow</span>
            <span>${plan.stops.filter((stop) => stop.customerScheduleRequested).length} customer sched</span>
          </div>
        </button>
      `;
    })
    .join("");

  refs.focusedRouteRail.innerHTML = focusPlan.stops
    .map(
      (stop) => `
        <article class="route-rail-card" style="--route-color:${routeColorForEmployee(focusPlan.employeeId)}">
          <div class="list-top">
            <div>
              <h3>${stop.sequence}. ${escapeHtml(stop.customerName)}</h3>
              <p class="meta-copy">${escapeHtml(stop.address)}</p>
            </div>
            <span class="tag">${stop.serviceMinutes} min</span>
          </div>
          <div class="pill-row">
            <span class="pill">${stop.milesFromPrev} mi in</span>
            <span class="pill">${stop.driveMinutesFromPrev} min drive</span>
            ${
              stop.workflowLabel
                ? `<span class="pill">${escapeHtml(stop.workflowLabel)}${stop.workflowStatus ? ` • ${escapeHtml(stop.workflowStatus)}` : ""}</span>`
                : ""
            }
            ${
              stop.customerScheduleRequested
                ? `<span class="pill">Customer schedule${stop.customerRequestWindow ? ` • ${escapeHtml(stop.customerRequestWindow)}` : ""}</span>`
                : ""
            }
            ${weatherBadge(stop.coordinates.lat, stop.coordinates.lon)}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderRouteBoard() {
  const plans = state.overview?.routePlans || [];
  if (!plans.length) {
    refs.routeBoard.innerHTML = "<article class='muted-card'>No route plan is available for this date.</article>";
    return;
  }

  refs.routeBoard.innerHTML = plans
    .map(
      (plan) => `
        <article class="route-card ${state.activeMapEmployeeId === plan.employeeId ? "is-active" : ""}" data-employee-id="${escapeHtml(plan.employeeId)}" style="--route-color:${routeColorForEmployee(plan.employeeId)}">
          <div class="route-top">
            <div>
              <p class="mini-label">${escapeHtml(plan.vehicleUnit)} • ${escapeHtml(plan.routeMode)}</p>
              <h3>${escapeHtml(plan.employeeName)}</h3>
            </div>
            <div class="score-badge">${escapeHtml(String(plan.efficiencyScore))}</div>
          </div>
            <div class="metric-grid">
              <div><label>Stops</label><strong>${plan.totalPools}</strong></div>
              <div><label>Miles</label><strong>${plan.totalMiles}</strong></div>
              <div><label>Fuel</label><strong>${plan.fuelGallons} gal</strong></div>
              <div><label>Capacity</label><strong>${formatPercent(plan.capacityUse)}</strong></div>
            </div>
            <p class="meta-copy">Optimized for least fuel + time loss via ${escapeHtml(plan.optimization?.heuristic || plan.routeMode)}.</p>
            ${
              plan.stops.some((stop) => stop.customerScheduleRequested)
                ? `<p class="meta-copy">${plan.stops.filter((stop) => stop.customerScheduleRequested).length} stop(s) were auto-inserted from customer schedule requests.</p>`
                : ""
            }
            <div class="route-path">
            ${plan.stops
              .map(
                (stop) => `
                  <div class="path-stop">
                    <span class="path-index">${stop.sequence}</span>
                    <div>
                      <strong>${escapeHtml(stop.customerName)}</strong>
                      <p>${escapeHtml(stop.address)}</p>
                      <p class="route-meta">${stop.milesFromPrev} mi from previous • ${stop.driveMinutesFromPrev} min drive • ${stop.serviceMinutes} min service</p>
                      ${
                        stop.workflowLabel
                          ? `<p class="meta-copy">${escapeHtml(stop.workflowLabel)} • ${escapeHtml(stop.workflowStatus || "queued")}</p>`
                          : ""
                      }
                      ${
                        stop.customerScheduleRequested
                          ? `<p class="meta-copy">Customer schedule automation${stop.customerRequestWindow ? ` • prefers ${escapeHtml(stop.customerRequestWindow)}` : ""}</p>`
                          : ""
                      }
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderVisitFeed() {
  refs.visitFeed.innerHTML = (state.overview?.recentVisits || [])
    .map(
      (visit) => `
        <article class="list-card">
          <div class="list-top">
            <div>
              <h3>${escapeHtml(visit.customerName)}</h3>
              <p class="meta-copy">${escapeHtml(visit.employeeName)} • ${escapeHtml(
                formatDateTime(visit.departureAt),
              )}</p>
            </div>
            <span class="tag">${visit.durationMinutes} min</span>
          </div>
          <p>${escapeHtml(visit.remarks)}</p>
          <p class="meta-copy">Cl ${visit.waterSample?.chlorine ?? "--"} • ${escapeHtml(visit.economics?.chlorineStatus || "not-tested")} • pH ${visit.waterSample?.ph ?? "--"} • ${visit.photos?.length || 0} photos</p>
          ${
            visit.economics
              ? `<div class="pill-row">
                  <span class="pill">Total ${formatMoney(visit.economics.totalExpense)}</span>
                  <span class="pill">Labor ${formatMoney(visit.economics.categoryCosts.labor)}</span>
                  <span class="pill">Chem ${formatMoney(visit.economics.categoryCosts.chemicals)}</span>
                  <span class="pill">Fuel ${formatMoney(visit.economics.categoryCosts.fuel)}</span>
                </div>`
              : ""
          }
          ${
            visit.issues?.length
              ? `<div class="pill-row">${visit.issues
                  .map((issue) => `<span class="pill warning-pill">${escapeHtml(issue)}</span>`)
                  .join("")}</div>`
              : ""
          }
          ${
            visit.photos?.length
              ? `<div class="feed-photo-row">${visit.photos
                  .slice(0, 3)
                  .map(
                    (photo) =>
                      `<img class="feed-thumb" src="${photo.dataUrl}" alt="${escapeHtml(
                        photo.caption || visit.customerName,
                      )}" />`,
                  )
                  .join("")}</div>`
              : ""
          }
        </article>
      `,
    )
    .join("");
}

function renderEmployeeBoard() {
  const employees = state.overview?.employees || [];
  if (!state.activeMapEmployeeId && employees.length) {
    state.activeMapEmployeeId = employees[0].id;
  }

  refs.employeeBoard.innerHTML = employees
    .map(
      (employee) => `
        <button class="employee-selector-card ${state.activeMapEmployeeId === employee.id ? "is-active" : ""}" type="button" data-employee-id="${escapeHtml(
          employee.id,
        )}" style="--route-color:${routeColorForEmployee(employee.id)}">
          <img class="profile-avatar" src="${employee.avatarUrl}" alt="${escapeHtml(employee.name)}" />
          <div>
            <strong>${escapeHtml(employee.name)}</strong>
            <p class="meta-copy">${escapeHtml(employee.role)}</p>
          </div>
          <span class="tag">${employee.planSummary?.totalPools || 0} stops</span>
        </button>
      `,
    )
    .join("");
}

function renderEmployeeTabs() {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "route", label: "Route" },
    { id: "pay", label: "Pay" },
    { id: "sales", label: "Sales" },
  ];

  refs.employeeTabs.innerHTML = tabs
    .map(
      (tab) => `
        <button class="tab-btn ${state.activeEmployeeTab === tab.id ? "is-active" : ""}" type="button" data-tab="${tab.id}">
          ${tab.label}
        </button>
      `,
    )
    .join("");
}

function renderEmployeePanel() {
  const employee = (state.overview?.employees || []).find((item) => item.id === state.activeMapEmployeeId) || null;
  if (!employee) {
    refs.employeePanel.innerHTML = "<article class='muted-card'>Select an employee to view details.</article>";
    return;
  }

  const plan = (state.overview?.routePlans || []).find((item) => item.employeeId === employee.id) || null;
  const payroll = state.overview?.payrollHub?.employees?.find((item) => item.id === employee.id) || null;
  const salesSummary = state.overview?.salesHub?.leaderboard?.find((item) => item.employeeId === employee.id) || null;
  const salesLeads = (state.overview?.salesHub?.leads || []).filter((item) => item.employeeId === employee.id);

  if (state.activeEmployeeTab === "route") {
    refs.employeePanel.innerHTML = plan
      ? `
          <article class="employee-panel-card">
            <div class="list-top">
              <div>
                <h3>${escapeHtml(employee.name)} route</h3>
                <p class="meta-copy">${plan.totalPools} stops • ${plan.totalMiles} mi • ${plan.fuelGallons} gal</p>
              </div>
              <span class="tag">${escapeHtml(plan.routeMode)}</span>
            </div>
            <div class="employee-detail-grid">
              <div><label>Efficiency</label><strong>${plan.efficiencyScore}</strong></div>
              <div><label>Capacity</label><strong>${formatPercent(plan.capacityUse)}</strong></div>
              <div><label>Live pings</label><strong>${heartbeatTrailForEmployee(employee.id).length}</strong></div>
              <div><label>Workflow</label><strong>${workflowItemsForEmployee(employee.id).length}</strong></div>
            </div>
            <div class="stack-list compact-stack">
              ${plan.stops
                .map(
                  (stop) => `
                    <article class="list-card compact-card">
                      <div class="list-top">
                        <h3>${stop.sequence}. ${escapeHtml(stop.customerName)}</h3>
                        <span class="tag">${stop.serviceMinutes} min</span>
                      </div>
                      <p class="meta-copy">${escapeHtml(stop.address)}</p>
                      <p class="meta-copy">${stop.milesFromPrev} mi • ${stop.driveMinutesFromPrev} min drive</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </article>
        `
      : "<article class='muted-card'>No route assigned to this employee for this date.</article>";
    return;
  }

  if (state.activeEmployeeTab === "pay") {
    refs.employeePanel.innerHTML = payroll
      ? `
          <article class="employee-panel-card">
            <div class="list-top">
              <div>
                <h3>${escapeHtml(employee.name)} pay view</h3>
                <p class="meta-copy">${escapeHtml(payroll.payType)} • Next pay ${escapeHtml(payroll.nextPayDate)}</p>
              </div>
              <span class="tag">${formatMoney(payroll.hourlyRate)}/hr</span>
            </div>
            <div class="employee-detail-grid">
              <div><label>Projected wages</label><strong>${formatMoney(payroll.projectedGross)}</strong></div>
              <div><label>Sales bonus</label><strong>${formatMoney(payroll.projectedBonus || 0)}</strong></div>
              <div><label>Total pay view</label><strong>${formatMoney(payroll.projectedGrossWithSales || payroll.projectedGross)}</strong></div>
              <div><label>Bank</label><strong>****${escapeHtml(payroll.bankLast4 || "")}</strong></div>
            </div>
            <div class="stub-list">
              ${payroll.payStubs
                .map(
                  (stub) => `
                    <div class="stub-chip">
                      <strong>${escapeHtml(stub.periodStart)} to ${escapeHtml(stub.periodEnd)}</strong>
                      <span>${formatMoney(stub.net)} net • ${escapeHtml(stub.status)}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        `
      : "<article class='muted-card'>No pay details available.</article>";
    return;
  }

  if (state.activeEmployeeTab === "sales") {
    refs.employeePanel.innerHTML = `
      <article class="employee-panel-card">
        <div class="list-top">
          <div>
            <h3>${escapeHtml(employee.name)} sales activity</h3>
            <p class="meta-copy">${salesSummary ? `${salesSummary.submittedCount} submitted • ${salesSummary.wonCount} won` : "No sales activity yet."}</p>
          </div>
          <span class="tag">${formatMoney(salesSummary?.projectedBonus || 0)} bonus</span>
        </div>
        <div class="employee-detail-grid">
          <div><label>Open pipeline</label><strong>${formatMoney(salesSummary?.quotedValue || 0)}</strong></div>
          <div><label>Won revenue</label><strong>${formatMoney(salesSummary?.wonValue || 0)}</strong></div>
          <div><label>Submitted</label><strong>${salesSummary?.submittedCount || 0}</strong></div>
          <div><label>Won</label><strong>${salesSummary?.wonCount || 0}</strong></div>
        </div>
        <div class="stack-list compact-stack">
          ${
            salesLeads.length
              ? salesLeads
                  .map(
                    (lead) => `
                      <article class="list-card compact-card">
                        <div class="list-top">
                          <h3>${escapeHtml(lead.title)}</h3>
                          <span class="tag">${escapeHtml(lead.stage)}</span>
                        </div>
                        <p class="meta-copy">${escapeHtml(lead.type)} • ${formatMoney(lead.estimatedValue || 0)} • ${formatMoney(lead.payoutEstimate || 0)} payout</p>
                      </article>
                    `,
                  )
                  .join("")
              : "<article class='muted-card'>No sales leads logged for this employee.</article>"
          }
        </div>
      </article>
    `;
    return;
  }

  refs.employeePanel.innerHTML = `
    <article class="employee-panel-card">
      <div class="employee-panel-hero">
        <img class="employee-panel-avatar" src="${employee.avatarUrl}" alt="${escapeHtml(employee.name)}" />
        <div>
          <h3>${escapeHtml(employee.name)}</h3>
          <p class="meta-copy">${escapeHtml(employee.role)} • ${escapeHtml(employee.email)}</p>
          <p>${escapeHtml(employee.profileNote || "")}</p>
        </div>
      </div>
      <div class="employee-detail-grid">
        <div><label>Phone</label><strong>${escapeHtml(employee.phone)}</strong></div>
        <div><label>Emergency</label><strong>${escapeHtml(employee.emergencyContact || "--")}</strong></div>
        <div><label>Workflow jobs</label><strong>${workflowItemsForEmployee(employee.id).length}</strong></div>
        <div><label>Avg cost/job</label><strong>${formatMoney(employee.planSummary?.averageCostPerJob || 0)}</strong></div>
      </div>
      <div class="pill-row">
        ${(employee.specialties || []).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
      </div>
      <p class="meta-copy">${employee.todayVisits.length} visits today • ${formatPercent(
        employee.planSummary?.balancedChlorineRate || 0,
      )} balanced chlorine • ${salesSummary?.submittedCount || 0} sales submitted</p>
    </article>
  `;
}

function renderPayrollBoard() {
  const payroll = state.overview?.payrollHub;
  if (!payroll) {
    return;
  }

  refs.payrollBoard.innerHTML = `
    <article class="list-card">
      <h3>${payroll.isManagerView ? "Team payroll projection" : "Your pay hub"}</h3>
      <p class="meta-copy">${formatMoney(payroll.totalProjectedGross)} projected wages + ${formatMoney(
        payroll.totalProjectedBonus || 0,
      )} projected sales bonus for ${state.serviceDate}</p>
    </article>
    ${payroll.employees
      .map(
        (employee) => `
          <article class="list-card">
            <div class="list-top">
              <div>
                <h3>${escapeHtml(employee.name)}</h3>
                <p class="meta-copy">${escapeHtml(employee.role)} • ${escapeHtml(employee.payType)}</p>
              </div>
              <span class="tag">${formatMoney(employee.hourlyRate)}/hr</span>
            </div>
            <p class="meta-copy">Today: ${employee.dayHours} hrs • Projected gross ${formatMoney(employee.projectedGross)}</p>
            <p class="meta-copy">Sales bonus: ${formatMoney(employee.projectedBonus || 0)} • Total pay view ${formatMoney(
              employee.projectedGrossWithSales || employee.projectedGross,
            )}</p>
            <p class="meta-copy">${employee.salesSubmitted || 0} submitted • ${employee.salesWon || 0} won</p>
            <p class="meta-copy">YTD: ${formatMoney(employee.ytdGross)} • Next pay ${escapeHtml(employee.nextPayDate)}</p>
            <div class="stub-list">
              ${employee.payStubs
                .map(
                  (stub) => `
                    <div class="stub-chip">
                      <strong>${escapeHtml(stub.periodStart)} to ${escapeHtml(stub.periodEnd)}</strong>
                      <span>${formatMoney(stub.net)} net • ${escapeHtml(stub.status)}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        `,
      )
      .join("")}
  `;
}

function renderPoolBoard() {
  refs.poolBoard.innerHTML = (state.overview?.pools || [])
    .map(
      (pool) => `
        <article class="list-card">
          <div class="list-top">
            <div>
              <h3>${escapeHtml(pool.customerName)}</h3>
              <p class="meta-copy">${escapeHtml(pool.neighborhood)} • ${escapeHtml(pool.address)}</p>
            </div>
            <span class="tag">${escapeHtml(pool.priority)}</span>
          </div>
          <p>${escapeHtml(pool.notes)}</p>
          <p class="meta-copy">Last visit: ${pool.latestVisit ? escapeHtml(formatDateTime(pool.latestVisit.departureAt)) : "Not logged"}</p>
          <div class="pill-row">${weatherBadge(pool.lat, pool.lon)} <span class="pill">Cl ${pool.latestChlorine ?? "--"}</span></div>
          ${
            pool.workflowItems?.length
              ? `<div class="pill-row">${pool.workflowItems
                  .map((item) => `<span class="pill">${escapeHtml(item.workflowLabel || "Workflow")} • ${escapeHtml(item.status)}</span>`)
                  .join("")}</div>`
              : ""
          }
          ${
            pool.waterIssues?.length
              ? `<div class="pill-row">${pool.waterIssues
                  .map((issue) => `<span class="pill warning-pill">${escapeHtml(issue)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </article>
      `,
    )
    .join("");
}

function renderWorkflowBoard() {
  const workflow = state.overview?.workflowHub;
  if (!workflow) {
    return;
  }

  refs.workflowSummary.textContent = workflow.totalOpen
    ? `${workflow.totalOpen} open workflow job${workflow.totalOpen === 1 ? "" : "s"} feeding the route engine for ${state.serviceDate}.`
    : "No imported workflow is open for this service date.";

  refs.workflowBoard.innerHTML = workflow.items.length
    ? workflow.items
        .map(
          (item) => `
            <article class="list-card workflow-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(item.customerName)}</h3>
                  <p class="meta-copy">${escapeHtml(item.workflowLabel)} • ${escapeHtml(item.address)}</p>
                </div>
                <span class="tag">${escapeHtml(item.status)}</span>
              </div>
              <div class="pill-row">
                <span class="pill">${escapeHtml(item.priority)}</span>
                <span class="pill">${item.serviceMinutes} min</span>
                <span class="pill">${escapeHtml(item.sourceName || item.sourceType)}</span>
              </div>
              ${item.notes ? `<p class="meta-copy">${escapeHtml(item.notes)}</p>` : ""}
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>Sync an external workflow source to surface queued jobs here.</article>";
}

function renderSalesBoard() {
  const sales = state.overview?.salesHub;
  if (!sales) {
    return;
  }

  refs.salesSummary.textContent = `${sales.totalOpen} open opportunities • ${formatMoney(
    sales.openPipelineValue,
  )} pipeline • ${formatMoney(sales.wonValueMonth)} won this month • ${formatMoney(
    sales.projectedBonusMonth,
  )} projected team bonus.`;

  refs.salesBoard.innerHTML = sales.leads.length
    ? sales.leads
        .map(
          (lead) => `
            <article class="list-card sales-card" data-sales-id="${escapeHtml(lead.id)}">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(lead.title)}</h3>
                  <p class="meta-copy">${escapeHtml(lead.customerName)} • ${escapeHtml(lead.employeeName)}</p>
                </div>
                <span class="tag">${escapeHtml(lead.stage)}</span>
              </div>
              <div class="pill-row">
                <span class="pill">${escapeHtml(lead.type)}</span>
                <span class="pill">${formatMoney(lead.estimatedValue || 0)} value</span>
                <span class="pill">${formatMoney(lead.payoutEstimate || 0)} payout</span>
                ${lead.poolName ? `<span class="pill">${escapeHtml(lead.poolName)}</span>` : ""}
              </div>
              <p class="meta-copy">${escapeHtml(lead.notes)}</p>
              ${
                isManager()
                  ? `<div class="pill-row stage-actions">
                      ${state.overview.salesHub.stages
                        .filter((stage) => stage !== lead.stage)
                        .map(
                          (stage) =>
                            `<button class="btn btn-ghost stage-btn" type="button" data-sales-id="${escapeHtml(
                              lead.id,
                            )}" data-stage="${escapeHtml(stage)}">${escapeHtml(stage)}</button>`,
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>No upsells or referrals logged yet.</article>";

  refs.salesLeaderboard.innerHTML = sales.leaderboard.length
    ? sales.leaderboard
        .map(
          (item) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(item.employeeName)}</h3>
                  <p class="meta-copy">${item.submittedCount} submitted • ${item.openCount} open • ${item.wonCount} won</p>
                </div>
                <span class="tag">${formatMoney(item.projectedBonus)}</span>
              </div>
              <div class="pill-row">
                <span class="pill">${formatMoney(item.quotedValue)} open pipeline</span>
                <span class="pill">${formatMoney(item.wonValue)} won revenue</span>
              </div>
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>Leaderboard will populate as employees log opportunities.</article>";
}

function renderEconomicsBoard() {
  const expenseHub = state.overview?.expenseHub;
  if (!expenseHub) {
    return;
  }

  refs.economicsSummary.textContent = expenseHub.averageChlorine
    ? `Average chlorine is ${expenseHub.averageChlorine} ppm. ${expenseHub.lowChlorineJobs} jobs are below target and average ${formatMoney(
        expenseHub.averageCostPerJob,
      )} in operating cost.`
    : `No same-day chemistry logs yet. Average cost per completed job will appear as technicians close visits.`;

  refs.economicsBoard.innerHTML = expenseHub.jobEconomics.length
    ? expenseHub.jobEconomics
        .map(
          (job) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(job.customerName)}</h3>
                  <p class="meta-copy">${escapeHtml(job.employeeName)} • ${job.durationMinutes} min on site</p>
                </div>
                <span class="tag">${formatMoney(job.totalExpense)}</span>
              </div>
              <div class="pill-row">
                <span class="pill">Cl ${job.chlorineReading ?? "--"} • ${escapeHtml(job.chlorineStatus)}</span>
                <span class="pill">Labor ${formatMoney(job.categoryCosts.labor)}</span>
                <span class="pill">Chem ${formatMoney(job.categoryCosts.chemicals)}</span>
                <span class="pill">Fuel ${formatMoney(job.categoryCosts.fuel)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>Visit economics will appear here as employees log completed jobs.</article>";

  refs.expenseMixBoard.innerHTML = expenseHub.categoryTotals.length
    ? expenseHub.categoryTotals
        .map(
          (item) => `
            <article class="list-card">
              <div class="list-top">
                <h3>${escapeHtml(item.category)}</h3>
                <span class="tag">${formatMoney(item.total)}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>No typical pool-business expenses have been recorded for this date.</article>";
}

function renderQuickbooksBoard() {
  const quickbooks = state.overview?.quickbooks;
  if (!quickbooks) {
    return;
  }

  refs.quickbooksSummary.textContent = `${formatMoney(quickbooks.totalAmount)} across ${quickbooks.lines.length} line${quickbooks.lines.length === 1 ? "" : "s"} • ${quickbooks.syncState}`;
  refs.quickbooksBoard.innerHTML = quickbooks.lines.length
    ? quickbooks.lines
        .map(
          (line) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(line.payee)}</h3>
                  <p class="meta-copy">${escapeHtml(line.technician)} • ${escapeHtml(line.customer)}</p>
                </div>
                <span class="tag">${escapeHtml(line.quickbooksStatus)}</span>
              </div>
              <p>${escapeHtml(line.category)} • ${escapeHtml(line.memo)}</p>
              <p class="meta-copy">${escapeHtml(line.date)} • ${formatMoney(line.amount)}</p>
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>No expenses queued for this date.</article>";
}

function populateEmployeeSelects() {
  const employees = state.overview?.employees || [];
  if (!state.activeEmployeeId && employees.length) {
    state.activeEmployeeId = state.viewer?.employeeId || employees[0].id;
  }
  if (!state.activeMapEmployeeId && employees.length) {
    state.activeMapEmployeeId = state.activeEmployeeId;
  }

  const options = employees
    .map(
      (employee) =>
        `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} • ${escapeHtml(
          employee.role,
        )}</option>`,
    )
    .join("");

  refs.employeeSelect.innerHTML = options;
  refs.expenseEmployeeSelect.innerHTML = options;
  refs.salesEmployeeSelect.innerHTML = options;
  refs.employeeSelect.value = state.activeEmployeeId || "";
  refs.expenseEmployeeSelect.value = state.activeEmployeeId || employees[0]?.id || "";
  refs.salesEmployeeSelect.value = state.activeEmployeeId || employees[0]?.id || "";
  refs.employeeSelect.disabled = !isManager();
  refs.salesEmployeeSelect.disabled = !isManager();
}

function populatePoolSelects() {
  const routeStops = routePoolsForEmployee();
  refs.poolSelect.innerHTML = routeStops.length
    ? routeStops
        .map(
          (stop) =>
            `<option value="${escapeHtml(stop.poolId)}">${stop.sequence}. ${escapeHtml(stop.customerName)}</option>`,
        )
        .join("")
    : (state.overview?.pools || [])
        .map(
          (pool) =>
            `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.customerName)} • ${escapeHtml(
              pool.neighborhood,
            )}</option>`,
        )
        .join("");

  refs.expensePoolSelect.innerHTML = `<option value="">No specific pool</option>${(state.overview?.pools || [])
    .map(
      (pool) =>
        `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.customerName)} • ${escapeHtml(
          pool.neighborhood,
        )}</option>`,
    )
    .join("")}`;
  refs.salesPoolSelect.innerHTML = `<option value="">Prospect / no current pool</option>${(state.overview?.pools || [])
    .map(
      (pool) =>
        `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.customerName)} • ${escapeHtml(
          pool.neighborhood,
        )}</option>`,
    )
    .join("")}`;
}

function renderPortal() {
  const employee = currentEmployee();
  const plan = currentRoutePlan();

  if (!employee || !plan) {
    refs.portalSummary.innerHTML = "No route is assigned to this employee for the selected date.";
    refs.portalRouteList.innerHTML = "";
    return;
  }

  refs.portalSummary.innerHTML = `
    <div class="metric-grid">
      <div><label>Technician</label><strong>${escapeHtml(employee.name)}</strong></div>
      <div><label>Stops</label><strong>${plan.totalPools}</strong></div>
      <div><label>Miles</label><strong>${plan.totalMiles}</strong></div>
      <div><label>Provider</label><strong>${escapeHtml(plan.routeMode)}</strong></div>
      <div><label>Live pings</label><strong>${heartbeatTrailForEmployee(employee.id).length}</strong></div>
      <div><label>Status</label><strong>${state.overview?.liveTracking?.positions?.find((entry) => entry.employeeId === employee.id) ? "Tracking live" : "Awaiting GPS"}</strong></div>
    </div>
  `;

  refs.portalRouteList.innerHTML = plan.stops
    .map((stop) => {
      const visit = employee.todayVisits.find((item) => item.poolId === stop.poolId);
      return `
        <article class="list-card route-stop-card ${visit ? "is-complete" : ""}">
          <div class="list-top">
            <div>
              <h3>${stop.sequence}. ${escapeHtml(stop.customerName)}</h3>
              <p class="meta-copy">${escapeHtml(stop.address)}</p>
            </div>
            <span class="tag">${visit ? "Completed" : "Pending"}</span>
          </div>
          <p class="meta-copy">${stop.milesFromPrev} mi from previous • ${stop.driveMinutesFromPrev} min drive • ${stop.serviceMinutes} min service</p>
        </article>
      `;
    })
    .join("");
}

function renderPhotoPreview() {
  refs.photoPreview.innerHTML = state.pendingPhotos.length
    ? state.pendingPhotos
        .map(
          (photo, index) => `
            <article class="photo-card">
              <img src="${photo.dataUrl}" alt="Service photo ${index + 1}" />
              <p>${escapeHtml(photo.name)}</p>
            </article>
          `,
        )
        .join("")
    : "<div class='muted-card'>Photos attached here will be saved with the visit log.</div>";
}

function renderCustomerPhotoPreview() {
  if (!refs.customerPhotoPreview) {
    return;
  }
  refs.customerPhotoPreview.innerHTML = state.pendingCustomerPhotos.length
    ? state.pendingCustomerPhotos
        .map(
          (photo, index) => `
            <article class="photo-card">
              <img src="${photo.dataUrl}" alt="Customer upload ${index + 1}" />
              <p>${escapeHtml(photo.name)}</p>
            </article>
          `,
        )
        .join("")
    : "<div class='muted-card'>Customers can upload deck, waterline, storm, or equipment photos here.</div>";
}

function syncCustomerRequestTypeVisibility() {
  const type = refs.customerRequestType?.value || "general";
  const isReferral = type === "referral";
  refs.customerReferralFields?.classList.toggle("hidden", !isReferral);
  refs.customerReferralAddressField?.classList.toggle("hidden", !isReferral);
}

function populateCustomerPoolSelect() {
  if (!refs.customerPoolSelect) {
    return;
  }
  const pools = isCustomerViewer() ? state.overview?.customerHub?.pools || [] : state.overview?.pools || [];
  refs.customerPoolSelect.innerHTML = pools.length
    ? pools
        .map(
          (pool) =>
            `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.customerName)} • ${escapeHtml(
              pool.neighborhood || "",
            )}</option>`,
        )
        .join("")
    : "<option value=\"\">No pool account available</option>";
}

function renderCustomerPortal() {
  const customerHub = state.overview?.customerHub;
  if (!customerHub) {
    return;
  }

  refs.customerPortalSummary.innerHTML = `
    <div class="metric-grid">
      <div><label>Open requests</label><strong>${customerHub.totalOpen || 0}</strong></div>
      <div><label>Pools on account</label><strong>${customerHub.pools?.length || 0}</strong></div>
      <div><label>Recent visits</label><strong>${customerHub.recentVisits?.length || 0}</strong></div>
      <div><label>Portal role</label><strong>${isCustomerViewer() ? "Customer" : "Office review"}</strong></div>
    </div>
  `;

  refs.customerPoolBoard.innerHTML = (customerHub.pools || []).length
    ? customerHub.pools
        .map(
          (pool) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(pool.customerName)}</h3>
                  <p class="meta-copy">${escapeHtml(pool.address)}</p>
                </div>
                <span class="tag">${escapeHtml(pool.priority)}</span>
              </div>
              <p class="meta-copy">Service days: ${escapeHtml(pool.nextServiceDays || "Weekly route")}</p>
              <div class="pill-row">
                ${weatherBadge(pool.lat, pool.lon)}
                <span class="pill">Cl ${pool.latestChlorine ?? "--"}</span>
                <span class="pill">${escapeHtml((pool.equipment || []).slice(0, 2).join(" • ") || "Standard service")}</span>
              </div>
              <p class="meta-copy">Last visit: ${pool.latestVisit ? escapeHtml(formatDateTime(pool.latestVisit.departureAt)) : "No visit logged yet"}</p>
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>No customer pools are connected to this login yet.</article>";

  refs.customerRequestBoard.innerHTML = (customerHub.requests || []).length
    ? customerHub.requests
        .map(
          (request) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(request.title)}</h3>
                  <p class="meta-copy">${escapeHtml(request.poolName)} • ${escapeHtml(request.type)}</p>
                </div>
                <span class="tag">${escapeHtml(request.status)}</span>
              </div>
              <p>${escapeHtml(request.message)}</p>
              <div class="pill-row">
                ${request.preferredDate ? `<span class="pill">Prefers ${escapeHtml(request.preferredDate)}</span>` : ""}
                ${request.preferredWindow ? `<span class="pill">${escapeHtml(request.preferredWindow)}</span>` : ""}
                ${request.referralName ? `<span class="pill">Referral: ${escapeHtml(request.referralName)}</span>` : ""}
                ${request.photos?.length ? `<span class="pill">${request.photos.length} photo${request.photos.length === 1 ? "" : "s"}</span>` : ""}
              </div>
              <p class="meta-copy">Updated ${escapeHtml(formatDateTime(request.updatedAt || request.createdAt))}</p>
              ${
                isManager()
                  ? `<div class="pill-row">${(state.overview.customerHub.requestStatuses || [])
                      .map(
                        (status) =>
                          `<button class="btn btn-ghost stage-btn" type="button" data-customer-request-id="${escapeHtml(
                            request.id,
                          )}" data-status="${escapeHtml(status)}">${escapeHtml(status)}</button>`,
                      )
                      .join("")}</div>`
                  : ""
              }
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>No customer requests have been submitted yet.</article>";

  refs.customerVisitBoard.innerHTML = (customerHub.recentVisits || []).length
    ? customerHub.recentVisits
        .map(
          (visit) => `
            <article class="list-card">
              <div class="list-top">
                <div>
                  <h3>${escapeHtml(visit.poolName)}</h3>
                  <p class="meta-copy">${escapeHtml(visit.employeeName)} • ${escapeHtml(formatDateTime(visit.departureAt))}</p>
                </div>
                <span class="tag">${visit.durationMinutes} min</span>
              </div>
              <p>${escapeHtml(visit.remarks)}</p>
              <div class="pill-row">
                <span class="pill">Cl ${visit.waterSample?.chlorine ?? "--"}</span>
                <span class="pill">pH ${visit.waterSample?.ph ?? "--"}</span>
                <span class="pill">${visit.photos?.length || 0} photos</span>
              </div>
              ${
                visit.recommendations
                  ? `<p class="meta-copy">Recommendation: ${escapeHtml(visit.recommendations)}</p>`
                  : ""
              }
            </article>
          `,
        )
        .join("")
    : "<article class='muted-card'>Recent service updates will appear here after your pool is serviced.</article>";

  populateCustomerPoolSelect();
  renderCustomerPhotoPreview();
  syncCustomerRequestTypeVisibility();
}

function renderOverview() {
  renderTopbar();
  renderHero();
  renderKpis();
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
  renderFleetMap();
  renderFocusedRouteMap();
  renderRouteBoard();
  renderVisitFeed();
  renderEmployeeBoard();
  renderEmployeeTabs();
  renderEmployeePanel();
  renderPayrollBoard();
  renderSalesBoard();
  renderPoolBoard();
  renderEconomicsBoard();
  renderWorkflowBoard();
  renderQuickbooksBoard();
  renderCustomerPortal();
  populateEmployeeSelects();
  populatePoolSelects();
  renderPortal();
  renderPhotoPreview();
  applyRoleVisibility();
}

async function refreshOverview() {
  state.overview = await api(`/api/overview?date=${encodeURIComponent(state.serviceDate)}`);
  state.viewer = state.overview.viewer;
  await refreshWeather();
  renderOverview();
}

function stopOverviewPolling() {
  if (state.overviewPollTimer) {
    clearInterval(state.overviewPollTimer);
    state.overviewPollTimer = null;
  }
}

function startOverviewPolling() {
  stopOverviewPolling();
  state.overviewPollTimer = setInterval(() => {
    if (!state.token || document.hidden) {
      return;
    }
    refreshOverview().catch(() => {});
  }, 15000);
}

async function sendTrackingHeartbeat(position, source = "watch") {
  if (!state.viewer?.employeeId) {
    return;
  }
  const now = Date.now();
  if (now - state.lastHeartbeatAt < 12000) {
    return;
  }
  state.lastHeartbeatAt = now;

  const battery =
    navigator.getBattery && typeof navigator.getBattery === "function"
      ? await navigator.getBattery().then((result) => Math.round(result.level * 100)).catch(() => null)
      : null;

  const coords = position.coords || position;
  await api("/api/tracking/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      employeeId: state.viewer.employeeId,
      date: state.serviceDate,
      lat: coords.latitude ?? coords.lat,
      lon: coords.longitude ?? coords.lon,
      accuracyFeet:
        coords.accuracy === undefined || coords.accuracy === null
          ? coords.accuracyFeet ?? null
          : Math.round(coords.accuracy * 3.28084),
      speedMph:
        coords.speed === undefined || coords.speed === null
          ? coords.speedMph ?? null
          : Number((coords.speed * 2.23694).toFixed(1)),
      heading: coords.heading === undefined ? null : coords.heading,
      batteryLevel: battery,
      recordedAt: new Date().toISOString(),
      source,
    }),
  });
}

function stopLiveTracking() {
  if (state.trackingWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.trackingWatchId);
    state.trackingWatchId = null;
  }
  if (state.trackingHeartbeatTimer) {
    clearInterval(state.trackingHeartbeatTimer);
    state.trackingHeartbeatTimer = null;
  }
}

function startLiveTracking() {
  stopLiveTracking();
  if (isManager() || !state.viewer?.employeeId || !navigator.geolocation) {
    return;
  }

  let latestPosition = null;
  state.trackingWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      latestPosition = position;
      state.currentLocation = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lon: Number(position.coords.longitude.toFixed(6)),
        accuracyFeet: Math.round(position.coords.accuracy * 3.28084),
      };
      refs.locationStatus.textContent = `Live tracking active at ${state.currentLocation.lat}, ${state.currentLocation.lon} (±${state.currentLocation.accuracyFeet} ft).`;
      await sendTrackingHeartbeat(position, "watch").catch(() => {});
    },
    () => {
      refs.locationStatus.textContent = "Location permission blocked. Live tracking is paused.";
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
  );

  state.trackingHeartbeatTimer = setInterval(() => {
    if (latestPosition && !document.hidden) {
      sendTrackingHeartbeat(latestPosition, "interval").catch(() => {});
    }
  }, 20000);
}

async function loadAuthenticatedApp() {
  const me = await api("/api/auth/me");
  state.viewer = me.viewer;
  state.serviceDate = preferredServiceDate();
  state.activeWorkspace = isCustomerViewer() ? "customer" : isManager() ? "dispatch" : "field";
  showApp();
  await refreshOverview();
  startOverviewPolling();
  startLiveTracking();
}

async function readFiles(files) {
  const readers = Array.from(files).slice(0, 5).map(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result || "") });
        reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
        reader.readAsDataURL(file);
      }),
  );

  return Promise.all(readers);
}

async function registerPwa() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (error) {
      showToast("Service worker registration failed.", true);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredPrompt = event;
    refs.installBtn.classList.remove("hidden");
  });
}

function handleQuickbooksQueryToast() {
  const url = new URL(window.location.href);
  const qb = url.searchParams.get("quickbooks");
  const message = url.searchParams.get("message");
  if (qb === "connected") {
    showToast("QuickBooks connected.");
  } else if (qb === "failed") {
    showToast(message || "QuickBooks connection failed.", true);
  }
  if (qb) {
    url.searchParams.delete("quickbooks");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", url.toString());
  }
}

refs.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.loginForm);
  try {
    const response = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    storeToken(response.token);
    await loadAuthenticatedApp();
    showToast(`Signed in as ${response.viewer.role}.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.demoAccounts.addEventListener("click", (event) => {
  const button = event.target.closest(".demo-card");
  if (!button) {
    return;
  }
  refs.loginForm.elements.email.value = button.dataset.email || "";
  refs.loginForm.elements.password.value = button.dataset.password || "";
});

refs.logoutBtn.addEventListener("click", async () => {
  try {
    if (state.token) {
      await api("/api/auth/logout", { method: "POST" });
    }
  } catch (error) {
    // Ignore logout failures and clear the local session anyway.
  }
  storeToken("");
  state.viewer = null;
  state.overview = null;
  stopOverviewPolling();
  stopLiveTracking();
  showLogin();
});

refs.installBtn.addEventListener("click", async () => {
  if (!state.deferredPrompt) {
    return;
  }
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  refs.installBtn.classList.add("hidden");
});

refs.serviceDate.addEventListener("change", async (event) => {
  state.serviceDate = event.target.value || state.serviceDate;
  refs.expenseDate.value = state.serviceDate;
  await refreshOverview().catch((error) => showToast(error.message, true));
});

refs.generateRoutesBtn.addEventListener("click", async () => {
  try {
    await api("/api/route-plans/generate", {
      method: "POST",
      body: JSON.stringify({ date: state.serviceDate }),
    });
    await refreshOverview();
    showToast("Routes rebuilt.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.routeBoard.addEventListener("click", (event) => {
  const card = event.target.closest("[data-employee-id]");
  if (!card) {
    return;
  }
  state.activeWorkspace = "dispatch";
  state.activeMapEmployeeId = card.dataset.employeeId || state.activeMapEmployeeId;
  state.activeEmployeeTab = "route";
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
  renderFleetMap();
  renderFocusedRouteMap();
  renderRouteBoard();
  renderEmployeeBoard();
  renderEmployeeTabs();
  renderEmployeePanel();
});

refs.employeeBoard.addEventListener("click", (event) => {
  const card = event.target.closest("[data-employee-id]");
  if (!card) {
    return;
  }
  state.activeWorkspace = "team";
  state.activeMapEmployeeId = card.dataset.employeeId || state.activeMapEmployeeId;
  state.activeEmployeeTab = "overview";
  if (isManager()) {
    state.activeEmployeeId = state.activeMapEmployeeId;
    refs.employeeSelect.value = state.activeEmployeeId;
    populatePoolSelects();
    renderPortal();
  }
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
  renderFleetMap();
  renderFocusedRouteMap();
  renderRouteBoard();
  renderEmployeeBoard();
  renderEmployeeTabs();
  renderEmployeePanel();
});

refs.fleetSpotlight.addEventListener("click", (event) => {
  const card = event.target.closest("[data-employee-id]");
  if (!card) {
    return;
  }
  state.activeWorkspace = "dispatch";
  state.activeMapEmployeeId = card.dataset.employeeId || state.activeMapEmployeeId;
  state.activeEmployeeTab = "route";
  if (isManager()) {
    state.activeEmployeeId = state.activeMapEmployeeId;
    refs.employeeSelect.value = state.activeEmployeeId;
    populatePoolSelects();
    renderPortal();
  }
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
  renderFleetMap();
  renderFocusedRouteMap();
  renderRouteBoard();
  renderEmployeeBoard();
  renderEmployeeTabs();
  renderEmployeePanel();
});

refs.employeeTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) {
    return;
  }
  state.activeEmployeeTab = button.dataset.tab || state.activeEmployeeTab;
  renderEmployeeTabs();
  renderEmployeePanel();
});

refs.workspaceTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-workspace]");
  if (!button) {
    return;
  }
  state.activeWorkspace = button.dataset.workspace || state.activeWorkspace;
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
});

refs.customerRequestType?.addEventListener("change", () => {
  syncCustomerRequestTypeVisibility();
});

refs.customerPhotoInput?.addEventListener("change", async (event) => {
  try {
    state.pendingCustomerPhotos = await readFiles(event.target.files || []);
    renderCustomerPhotoPreview();
    showToast(`${state.pendingCustomerPhotos.length} customer photo${state.pendingCustomerPhotos.length === 1 ? "" : "s"} attached.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.customerRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.customerRequestForm);

  try {
    await api("/api/customer-requests", {
      method: "POST",
      body: JSON.stringify({
        date: state.serviceDate,
        poolId: form.get("poolId"),
        type: form.get("type"),
        title: form.get("title"),
        message: form.get("message"),
        preferredDate: form.get("preferredDate"),
        preferredWindow: form.get("preferredWindow"),
        referralName: form.get("referralName"),
        referralPhone: form.get("referralPhone"),
        referralAddress: form.get("referralAddress"),
        photos: state.pendingCustomerPhotos,
      }),
    });
    refs.customerRequestForm.reset();
    state.pendingCustomerPhotos = [];
    await refreshOverview();
    showToast("Customer request sent.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.customerRequestBoard?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-customer-request-id][data-status]");
  if (!button) {
    return;
  }
  try {
    await api(`/api/customer-requests/${encodeURIComponent(button.dataset.customerRequestId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: state.serviceDate,
        status: button.dataset.status,
      }),
    });
    await refreshOverview();
    showToast(`Customer request moved to ${button.dataset.status}.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.workflowSourceType?.addEventListener("change", () => {
  syncWorkflowFieldVisibility();
});

refs.workflowSourceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.workflowSourceForm);

  try {
    await api("/api/integrations/workflow/config", {
      method: "POST",
      body: JSON.stringify({
        date: state.serviceDate,
        sourceType: form.get("sourceType"),
        sourceName: form.get("sourceName"),
        feedUrl: form.get("feedUrl"),
        connectionString: form.get("connectionString"),
        sqlQuery: form.get("sqlQuery"),
      }),
    });
    await refreshOverview();
    showToast("Workflow source saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.workflowSyncBtn?.addEventListener("click", async () => {
  try {
    await api("/api/integrations/workflow/sync", {
      method: "POST",
      body: JSON.stringify({ date: state.serviceDate }),
    });
    await refreshOverview();
    showToast("Workflow synced and routes invalidated for refreshed planning.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.salesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.salesForm);

  try {
    await api("/api/sales-leads", {
      method: "POST",
      body: JSON.stringify({
        date: state.serviceDate,
        employeeId: form.get("employeeId"),
        poolId: form.get("poolId") || null,
        type: form.get("type"),
        estimatedValue: form.get("estimatedValue"),
        customerName: form.get("customerName"),
        contactName: form.get("contactName"),
        contactPhone: form.get("contactPhone"),
        title: form.get("title"),
        notes: form.get("notes"),
      }),
    });
    refs.salesForm.reset();
    refs.salesEmployeeSelect.value = state.activeEmployeeId || state.viewer?.employeeId || "";
    await refreshOverview();
    showToast("Sales opportunity saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.salesBoard?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-sales-id][data-stage]");
  if (!button) {
    return;
  }

  try {
    await api(`/api/sales-leads/${encodeURIComponent(button.dataset.salesId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: state.serviceDate,
        stage: button.dataset.stage,
      }),
    });
    await refreshOverview();
    showToast(`Sales stage moved to ${button.dataset.stage}.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.quickbooksConnectBtn.addEventListener("click", async () => {
  try {
    const response = await api("/api/integrations/quickbooks/connect-url", { method: "POST" });
    window.location.href = response.url;
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.quickbooksDisconnectBtn.addEventListener("click", async () => {
  try {
    await api("/api/integrations/quickbooks/disconnect", { method: "POST" });
    await refreshOverview();
    showToast("QuickBooks disconnected.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.employeeSelect.addEventListener("change", (event) => {
  state.activeWorkspace = "field";
  state.activeEmployeeId = event.target.value;
  state.activeMapEmployeeId = state.activeEmployeeId;
  state.activeEmployeeTab = "route";
  populatePoolSelects();
  refs.salesEmployeeSelect.value = state.activeEmployeeId;
  renderPortal();
  renderWorkspaceTabs();
  applyWorkspaceVisibility();
  renderFleetMap();
  renderFocusedRouteMap();
  renderRouteBoard();
  renderEmployeeBoard();
  renderEmployeeTabs();
  renderEmployeePanel();
});

refs.photoInput.addEventListener("change", async (event) => {
  try {
    state.pendingPhotos = await readFiles(event.target.files || []);
    renderPhotoPreview();
    showToast(`${state.pendingPhotos.length} photo${state.pendingPhotos.length === 1 ? "" : "s"} attached.`);
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.captureLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.", true);
    return;
  }

  refs.locationStatus.textContent = "Requesting location...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.currentLocation = {
        lat: Number(position.coords.latitude.toFixed(6)),
        lon: Number(position.coords.longitude.toFixed(6)),
        accuracyFeet: Math.round(position.coords.accuracy * 3.28084),
      };
      refs.locationStatus.textContent = `Location captured at ${state.currentLocation.lat}, ${state.currentLocation.lon} (±${state.currentLocation.accuracyFeet} ft).`;
      sendTrackingHeartbeat(position, "manual-capture").catch(() => {});
      showToast("Current location attached to visit.");
    },
    (error) => {
      refs.locationStatus.textContent = "Unable to capture current location.";
      showToast(error.message || "Unable to capture location.", true);
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

refs.visitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.visitForm);

  try {
    await api("/api/visits", {
      method: "POST",
      body: JSON.stringify({
        employeeId: state.activeEmployeeId,
        poolId: form.get("poolId"),
        date: state.serviceDate,
        arrivalAt: new Date(form.get("arrivalAt")).toISOString(),
        departureAt: new Date(form.get("departureAt")).toISOString(),
        waterSample: {
          chlorine: form.get("chlorine"),
          ph: form.get("ph"),
          alkalinity: form.get("alkalinity"),
          salinity: form.get("salinity"),
          temperature: form.get("temperature"),
        },
        chemicalsUsed: parseChemicalLines(form.get("chemicals")),
        remarks: form.get("remarks"),
        recommendations: form.get("recommendations"),
        photos: state.pendingPhotos.map((photo) => ({ ...photo, caption: "Field capture" })),
        actualLocation: state.currentLocation,
      }),
    });

    refs.visitForm.reset();
    refs.photoInput.value = "";
    state.pendingPhotos = [];
    state.currentLocation = null;
    setDefaultDateTimes();
    await refreshOverview();
    showToast("Visit saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

refs.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(refs.expenseForm);
  try {
    await api("/api/expenses", {
      method: "POST",
      body: JSON.stringify({
        employeeId: form.get("employeeId"),
        poolId: form.get("poolId") || null,
        date: form.get("date"),
        category: form.get("category"),
        amount: form.get("amount"),
        vendor: form.get("vendor"),
        memo: form.get("memo"),
      }),
    });
    refs.expenseForm.reset();
    refs.expenseDate.value = state.serviceDate;
    await refreshOverview();
    showToast("Expense saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

async function init() {
  try {
    state.config = await api("/api/config");
    state.serviceDate = preferredServiceDate();
    renderDemoAccounts();
    setDefaultDateTimes();
    syncWorkflowFieldVisibility();
    await registerPwa();
    handleQuickbooksQueryToast();

    if (state.token) {
      await loadAuthenticatedApp();
    } else {
      stopOverviewPolling();
      stopLiveTracking();
      showLogin();
    }
  } catch (error) {
    showToast(error.message, true);
    showLogin();
  }
}

init();
