const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const {
  DB_FILE,
  DATABASE_URL,
  applyWorkflowSync,
  buildOverview,
  buildQuickBooksExport,
  buildRoutePlansForDate,
  ensureDb,
  ensureRoutePlansForDate,
  findUserByEmail,
  findUserById,
  getDuePools,
  isoDateOnly,
  isManager,
  loadDb,
  pruneExpiredSessions,
  sanitizeViewer,
  saveDb,
  waterStatus,
} = require("./db");
const {
  createQuickBooksConnectUrl,
  exchangeQuickBooksCode,
  fetchQuickBooksCompanyInfo,
  fetchWorkflowRows,
  getQuickBooksConnectionConfig,
  getRoutingProviderState,
  sanitizeWorkflowSourceType,
  revokeQuickBooksToken,
} = require("./integrations");
const { hashToken, verifyPassword } = require("./security");

const PORT = Number(process.env.PORT || 8787);
const SESSION_TTL_DAYS = 14;
const QUICKBOOKS_STATE_TTL_MINUTES = 15;
const DEMO_ACCOUNT_CREDENTIALS = [
  { email: "owner@bluecurrent.local", password: "owner123!" },
  { email: "dispatch@bluecurrent.local", password: "dispatch123!" },
  { email: "mia@bluecurrent.local", password: "tech123!" },
  { email: "serena@bluecurrent.local", password: "tech123!" },
  { email: "lena@alton.local", password: "customer123!" },
  { email: "hoa@harborview.local", password: "customer123!" },
];

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

function requireText(value, field, minLength = 1) {
  if (!value || String(value).trim().length < minLength) {
    throw new Error(`${field} is required.`);
  }
  return String(value).trim();
}

function optionalText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function optionalNumber(value, field) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid number.`);
  }
  return parsed;
}

function sanitizeDate(value) {
  return isoDateOnly(value || new Date().toISOString());
}

function sanitizePhotos(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 5)
    .map((photo) => ({
      id: crypto.randomUUID(),
      name: optionalText(photo?.name) || "service-photo",
      caption: optionalText(photo?.caption),
      dataUrl: requireText(photo?.dataUrl, "photo.dataUrl", 10),
    }))
    .filter((photo) => photo.dataUrl.startsWith("data:image/"));
}

function lookupOrThrow(collection, id, label) {
  const item = collection.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`${label} was not found.`);
  }
  return item;
}

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function authTokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function loadSessionContext(req) {
  const db = await loadDb();
  const beforeSessions = db.auth.sessions.length;
  const beforeStates = db.auth.oauthStates.length;
  pruneExpiredSessions(db);
  if (db.auth.sessions.length !== beforeSessions || db.auth.oauthStates.length !== beforeStates) {
    await saveDb(db);
  }

  const token = authTokenFromRequest(req);
  if (!token) {
    return { db, token: "", session: null, user: null };
  }

  const session = db.auth.sessions.find((entry) => entry.tokenHash === hashToken(token)) || null;
  const user = session ? findUserById(db, session.userId) : null;
  return { db, token, session, user };
}

async function requireAuth(req, res, next) {
  try {
    const context = await loadSessionContext(req);
    if (!context.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    req.db = context.db;
    req.authToken = context.token;
    req.session = context.session;
    req.user = context.user;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message || "Authentication failed." });
  }
}

function requireManager(req, res, next) {
  if (!isManager(req.user)) {
    res.status(403).json({ error: "Manager access is required." });
    return;
  }
  next();
}

function assertEmployeeAccess(req, employeeId) {
  if (isManager(req.user)) {
    return;
  }
  if (req.user.employeeId !== employeeId) {
    throw new Error("You can only access your own employee record.");
  }
}

function assertCustomerPoolAccess(req, poolId) {
  if (isManager(req.user)) {
    return;
  }
  if (req.user.role !== "customer") {
    throw new Error("Customer portal access is required.");
  }
  if (!Array.isArray(req.user.poolIds) || !req.user.poolIds.includes(poolId)) {
    throw new Error("You can only access your own pool account.");
  }
}

function recordLiveTracking(db, payload) {
  if (!payload || payload.employeeId === undefined || payload.lat === undefined || payload.lon === undefined) {
    return;
  }

  const entry = {
    employeeId: payload.employeeId,
    lat: Number(payload.lat),
    lon: Number(payload.lon),
    accuracyFeet: payload.accuracyFeet === null || payload.accuracyFeet === undefined ? null : Number(payload.accuracyFeet),
    speedMph: payload.speedMph === null || payload.speedMph === undefined ? null : Number(payload.speedMph),
    heading: payload.heading === null || payload.heading === undefined ? null : Number(payload.heading),
    batteryLevel: payload.batteryLevel === null || payload.batteryLevel === undefined ? null : Number(payload.batteryLevel),
    recordedAt: payload.recordedAt || new Date().toISOString(),
    source: payload.source || "portal",
  };

  db.liveTracking = db.liveTracking || { positions: [], history: [] };
  db.liveTracking.positions = (db.liveTracking.positions || []).filter((item) => item.employeeId !== entry.employeeId);
  db.liveTracking.positions.push(entry);
  db.liveTracking.history = [...(db.liveTracking.history || []).filter((item) => item.employeeId !== entry.employeeId || item.recordedAt !== entry.recordedAt), entry].slice(-600);
}

async function rebuildRoutePlansForDates(db, dates) {
  const uniqueDates = Array.from(
    new Set(
      (dates || [])
        .filter(Boolean)
        .map((value) => sanitizeDate(value)),
    ),
  );

  if (!uniqueDates.length) {
    return;
  }

  let nextPlans = db.routePlans || [];
  for (const date of uniqueDates) {
    const routePlans = await buildRoutePlansForDate(db, date);
    nextPlans = nextPlans.filter((plan) => plan.date !== date).concat(routePlans);
  }
  db.routePlans = nextPlans;
  db.integrations.routing.lastPlannedAt = new Date().toISOString();
}

app.get("/api/config", async (req, res) => {
  const db = await loadDb();
  const routing = getRoutingProviderState();
  const qbo = getQuickBooksConnectionConfig();
  res.json({
    appName: "BlueCurrent Pool Ops",
    mode: "expanded-mvp",
    dbMode: DATABASE_URL ? "postgres-jsonb" : "json-file",
    dbFile: DB_FILE,
    routingProvider: routing,
    quickbooksMode: qbo.clientId ? "oauth-ready" : "export-ready",
    capabilities: [
      "role-based login",
      "map-backed routing when configured",
      "fuel-and-time route optimization",
      "employee field portal",
      "customer self-service portal",
      "visit photo capture",
      "water chemistry logging",
      "pay hub",
      "PWA install support",
      "QuickBooks OAuth status",
      "external workflow database sync",
    ],
    demoAccounts: DEMO_ACCOUNT_CREDENTIALS.map((account) => {
      const user = findUserByEmail(db, account.email);
      return {
        role: user?.role || "user",
        name: user?.name || account.email,
        email: account.email,
        password: account.password,
        avatarUrl: user?.avatarUrl || "",
        poolCount: Array.isArray(user?.poolIds) ? user.poolIds.length : 0,
      };
    }),
  });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const db = await loadDb();
    pruneExpiredSessions(db);
    const email = requireText(req.body?.email, "email", 3).toLowerCase();
    const password = requireText(req.body?.password, "password", 6);
    const user = findUserByEmail(db, email);

    if (!user || !verifyPassword(password, user)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const token = crypto.randomUUID();
    const session = {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };

    db.auth.sessions.push(session);
    await saveDb(db);

    res.status(201).json({
      token,
      viewer: sanitizeViewer(db, user),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to log in." });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({
    viewer: sanitizeViewer(req.db, req.user),
  });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  req.db.auth.sessions = req.db.auth.sessions.filter((session) => session.id !== req.session.id);
  await saveDb(req.db);
  res.status(204).end();
});

app.get("/api/overview", requireAuth, async (req, res) => {
  const selectedDate = sanitizeDate(req.query?.date);
  const routeState = await ensureRoutePlansForDate(req.db, selectedDate);
  if (routeState.changed) {
    await saveDb(req.db);
  }
  res.json(buildOverview(req.db, selectedDate, req.user));
});

app.get("/api/payroll", requireAuth, async (req, res) => {
  const selectedDate = sanitizeDate(req.query?.date);
  const routeState = await ensureRoutePlansForDate(req.db, selectedDate);
  if (routeState.changed) {
    await saveDb(req.db);
  }
  res.json(buildOverview(req.db, selectedDate, req.user).payrollHub);
});

app.post("/api/tracking/heartbeat", requireAuth, async (req, res) => {
  try {
    const employeeId = requireText(req.body?.employeeId, "employeeId");
    assertEmployeeAccess(req, employeeId);
    lookupOrThrow(req.db.employees, employeeId, "Employee");

    recordLiveTracking(req.db, {
      employeeId,
      lat: optionalNumber(req.body?.lat, "lat"),
      lon: optionalNumber(req.body?.lon, "lon"),
      accuracyFeet: optionalNumber(req.body?.accuracyFeet, "accuracyFeet"),
      speedMph: optionalNumber(req.body?.speedMph, "speedMph"),
      heading: optionalNumber(req.body?.heading, "heading"),
      batteryLevel: optionalNumber(req.body?.batteryLevel, "batteryLevel"),
      recordedAt: optionalText(req.body?.recordedAt) || new Date().toISOString(),
      source: optionalText(req.body?.source) || "portal",
    });
    await saveDb(req.db);

    res.status(201).json({
      ok: true,
      liveTracking: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).liveTracking,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to record tracking heartbeat." });
  }
});

app.post("/api/route-plans/generate", requireAuth, requireManager, async (req, res) => {
  try {
    const selectedDate = sanitizeDate(req.body?.date);
    const routePlans = await buildRoutePlansForDate(req.db, selectedDate);
    req.db.routePlans = req.db.routePlans.filter((plan) => plan.date !== selectedDate).concat(routePlans);
    req.db.integrations.routing.lastPlannedAt = new Date().toISOString();
    await saveDb(req.db);

    res.status(201).json({
      date: selectedDate,
      routePlans,
      dashboard: buildOverview(req.db, selectedDate, req.user).dashboard,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to generate route plans." });
  }
});

app.post("/api/visits", requireAuth, async (req, res) => {
  try {
    const employeeId = requireText(req.body?.employeeId, "employeeId");
    assertEmployeeAccess(req, employeeId);
    const poolId = requireText(req.body?.poolId, "poolId");
    const employee = lookupOrThrow(req.db.employees, employeeId, "Employee");
    const pool = lookupOrThrow(req.db.pools, poolId, "Pool");
    const date = sanitizeDate(req.body?.date);
    const arrivalAt = requireText(req.body?.arrivalAt, "arrivalAt", 10);
    const departureAt = requireText(req.body?.departureAt, "departureAt", 10);
    const remarks = requireText(req.body?.remarks, "remarks", 8);
    const waterSample = {
      chlorine: optionalNumber(req.body?.waterSample?.chlorine, "waterSample.chlorine"),
      ph: optionalNumber(req.body?.waterSample?.ph, "waterSample.ph"),
      alkalinity: optionalNumber(req.body?.waterSample?.alkalinity, "waterSample.alkalinity"),
      salinity: optionalNumber(req.body?.waterSample?.salinity, "waterSample.salinity"),
      temperature: optionalNumber(req.body?.waterSample?.temperature, "waterSample.temperature"),
    };
    const chemicalsUsed = Array.isArray(req.body?.chemicalsUsed)
      ? req.body.chemicalsUsed
          .map((item) => ({
            product: optionalText(item?.product),
            amount: optionalText(item?.amount),
            cost: optionalNumber(item?.cost, "chemicalsUsed.cost") || 0,
          }))
          .filter((item) => item.product && item.amount)
      : [];
    const actualLocation =
      req.body?.actualLocation &&
      req.body.actualLocation.lat !== undefined &&
      req.body.actualLocation.lon !== undefined
        ? {
            lat: optionalNumber(req.body.actualLocation.lat, "actualLocation.lat"),
            lon: optionalNumber(req.body.actualLocation.lon, "actualLocation.lon"),
            accuracyFeet: optionalNumber(
              req.body.actualLocation.accuracyFeet,
              "actualLocation.accuracyFeet",
            ),
          }
        : null;
    const photos = sanitizePhotos(req.body?.photos);

    const routePlan = req.db.routePlans.find(
      (plan) => plan.date === date && plan.employeeId === employeeId,
    );
    const routeStop = routePlan?.stops.find((stop) => stop.poolId === poolId) || null;

    const visit = {
      id: crypto.randomUUID(),
      employeeId,
      poolId,
      date,
      arrivalAt,
      departureAt,
      actualLocation,
      waterSample,
      chemicalsUsed,
      photos,
      remarks,
      recommendations: optionalText(req.body?.recommendations),
      routeContext: routeStop
        ? {
            plannedOrder: routeStop.sequence,
            plannedMilesFromPrev: routeStop.milesFromPrev,
          }
        : null,
      createdAt: new Date().toISOString(),
    };

    req.db.visits.push(visit);
    pool.lastServiceAt = departureAt;
    pool.lastWaterSample = waterSample;
    pool.lastRecommendations = visit.recommendations;
    if (actualLocation) {
      recordLiveTracking(req.db, {
        employeeId,
        lat: actualLocation.lat,
        lon: actualLocation.lon,
        accuracyFeet: actualLocation.accuracyFeet,
        recordedAt: departureAt,
        source: "visit-log",
      });
    }
    await saveDb(req.db);

    res.status(201).json({
      visit: {
        ...visit,
        employeeName: employee.name,
        customerName: pool.customerName,
        issues: waterStatus(waterSample),
      },
      dashboard: buildOverview(req.db, date, req.user).dashboard,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save visit." });
  }
});

app.post("/api/expenses", requireAuth, async (req, res) => {
  try {
    const employeeId = requireText(req.body?.employeeId, "employeeId");
    assertEmployeeAccess(req, employeeId);
    lookupOrThrow(req.db.employees, employeeId, "Employee");
    const poolId = optionalText(req.body?.poolId) || null;

    if (poolId) {
      lookupOrThrow(req.db.pools, poolId, "Pool");
    }

    const expense = {
      id: crypto.randomUUID(),
      date: sanitizeDate(req.body?.date),
      employeeId,
      poolId,
      category: requireText(req.body?.category, "category", 2).toLowerCase(),
      amount: optionalNumber(req.body?.amount, "amount"),
      vendor: requireText(req.body?.vendor, "vendor", 2),
      memo: requireText(req.body?.memo, "memo", 4),
      quickbooksStatus: req.db.integrations.quickbooks.connected ? "ready-to-sync" : "pending-export",
      createdAt: new Date().toISOString(),
    };

    req.db.expenses.push(expense);
    await saveDb(req.db);

    res.status(201).json({
      expense,
      quickbooks: buildQuickBooksExport(req.db, expense.date, req.user),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save expense." });
  }
});

app.post("/api/sales-leads", requireAuth, async (req, res) => {
  try {
    const employeeId = requireText(req.body?.employeeId, "employeeId");
    assertEmployeeAccess(req, employeeId);
    lookupOrThrow(req.db.employees, employeeId, "Employee");
    const poolId = optionalText(req.body?.poolId) || null;

    if (poolId) {
      lookupOrThrow(req.db.pools, poolId, "Pool");
    }

    const type = optionalText(req.body?.type).toLowerCase() || "upsell";
    const estimatedValue = optionalNumber(req.body?.estimatedValue, "estimatedValue") || 0;
    const payoutEstimate =
      type === "referral"
        ? 150
        : type === "new-service"
          ? Math.max(125, Number((estimatedValue * 0.08).toFixed(2)))
          : type === "equipment-upgrade"
            ? Number((estimatedValue * 0.1).toFixed(2))
            : type === "repair"
              ? Number((estimatedValue * 0.08).toFixed(2))
              : Number((estimatedValue * 0.06).toFixed(2));

    const lead = {
      id: crypto.randomUUID(),
      employeeId,
      poolId,
      type,
      stage: "submitted",
      customerName: requireText(req.body?.customerName, "customerName", 2),
      contactName: optionalText(req.body?.contactName),
      contactPhone: optionalText(req.body?.contactPhone),
      title: requireText(req.body?.title, "title", 4),
      notes: requireText(req.body?.notes, "notes", 8),
      estimatedValue,
      payoutEstimate,
      source: optionalText(req.body?.source) || "field-submission",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    req.db.salesLeads = Array.isArray(req.db.salesLeads) ? req.db.salesLeads : [];
    req.db.salesLeads.push(lead);
    await saveDb(req.db);

    res.status(201).json({
      lead,
      salesHub: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).salesHub,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save sales lead." });
  }
});

app.patch("/api/sales-leads/:leadId", requireAuth, requireManager, async (req, res) => {
  try {
    const lead = lookupOrThrow(req.db.salesLeads || [], req.params.leadId, "Sales lead");
    if (req.body?.stage !== undefined) {
      lead.stage = optionalText(req.body?.stage).toLowerCase() || lead.stage;
    }
    if (req.body?.estimatedValue !== undefined) {
      lead.estimatedValue = optionalNumber(req.body?.estimatedValue, "estimatedValue") || 0;
    }
    if (req.body?.notes !== undefined) {
      lead.notes = requireText(req.body?.notes, "notes", 8);
    }
    lead.updatedAt = new Date().toISOString();
    if (lead.stage === "won" || lead.stage === "lost") {
      lead.closedAt = lead.closedAt || lead.updatedAt;
    }

    await saveDb(req.db);

    res.json({
      lead,
      salesHub: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).salesHub,
      payrollHub: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).payrollHub,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to update sales lead." });
  }
});

app.post("/api/customer-requests", requireAuth, async (req, res) => {
  try {
    if (!isManager(req.user) && req.user.role !== "customer") {
      throw new Error("Customer portal access is required.");
    }

    const poolId = requireText(req.body?.poolId, "poolId");
    const pool = lookupOrThrow(req.db.pools, poolId, "Pool");
    assertCustomerPoolAccess(req, poolId);
    const date = sanitizeDate(req.body?.date);
    const type = optionalText(req.body?.type).toLowerCase() || "general";
    const photos = sanitizePhotos(req.body?.photos);

    const request = {
      id: crypto.randomUUID(),
      poolId,
      customerUserId: req.user.role === "customer" ? req.user.id : optionalText(req.body?.customerUserId),
      type,
      status: "submitted",
      title: requireText(req.body?.title, "title", 4),
      message: requireText(req.body?.message, "message", 8),
      preferredDate: optionalText(req.body?.preferredDate),
      preferredWindow: optionalText(req.body?.preferredWindow),
      referralName: optionalText(req.body?.referralName),
      referralPhone: optionalText(req.body?.referralPhone),
      referralAddress: optionalText(req.body?.referralAddress),
      photos,
      source: req.user.role === "customer" ? "customer-portal" : optionalText(req.body?.source) || "office-entry",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    req.db.customerRequests = Array.isArray(req.db.customerRequests) ? req.db.customerRequests : [];
    req.db.customerRequests.push(request);
    if (type === "schedule" && request.preferredDate) {
      await rebuildRoutePlansForDates(req.db, [request.preferredDate]);
    }
    await saveDb(req.db);

    res.status(201).json({
      request: {
        ...request,
        poolName: pool.customerName,
      },
      customerHub: buildOverview(req.db, date, req.user).customerHub,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save customer request." });
  }
});

app.patch("/api/customer-requests/:requestId", requireAuth, requireManager, async (req, res) => {
  try {
    const request = lookupOrThrow(req.db.customerRequests || [], req.params.requestId, "Customer request");
    const previousPreferredDate = request.preferredDate;
    const requestType = optionalText(request.type).toLowerCase() || "general";
    if (req.body?.status !== undefined) {
      request.status = optionalText(req.body?.status).toLowerCase() || request.status;
    }
    if (req.body?.message !== undefined) {
      request.message = requireText(req.body?.message, "message", 8);
    }
    if (req.body?.preferredDate !== undefined) {
      request.preferredDate = optionalText(req.body?.preferredDate);
    }
    if (req.body?.preferredWindow !== undefined) {
      request.preferredWindow = optionalText(req.body?.preferredWindow);
    }
    request.updatedAt = new Date().toISOString();
    if (requestType === "schedule") {
      await rebuildRoutePlansForDates(req.db, [previousPreferredDate, request.preferredDate]);
    }
    await saveDb(req.db);

    res.json({
      request,
      customerHub: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).customerHub,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to update customer request." });
  }
});

app.get("/api/quickbooks/export", requireAuth, async (req, res) => {
  const selectedDate = sanitizeDate(req.query?.date);
  res.json(buildQuickBooksExport(req.db, selectedDate, req.user));
});

app.post("/api/integrations/quickbooks/connect-url", requireAuth, requireManager, async (req, res) => {
  try {
    const state = crypto.randomUUID();
    req.db.auth.oauthStates.push({
      id: crypto.randomUUID(),
      state,
      userId: req.user.id,
      expiresAt: new Date(Date.now() + QUICKBOOKS_STATE_TTL_MINUTES * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    await saveDb(req.db);
    res.json({ url: createQuickBooksConnectUrl(state) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to start QuickBooks connection." });
  }
});

app.get("/api/integrations/quickbooks/callback", async (req, res) => {
  const db = await loadDb();
  pruneExpiredSessions(db);
  const state = optionalText(req.query?.state);
  const code = optionalText(req.query?.code);
  const realmId = optionalText(req.query?.realmId);

  try {
    if (!state || !code || !realmId) {
      throw new Error("Missing QuickBooks callback parameters.");
    }

    const oauthState = db.auth.oauthStates.find((item) => item.state === state);
    if (!oauthState) {
      throw new Error("QuickBooks authorization state is invalid or expired.");
    }

    const tokenPayload = await exchangeQuickBooksCode(code);
    const companyPayload = await fetchQuickBooksCompanyInfo(realmId, tokenPayload.access_token);
    const companyInfo = companyPayload.CompanyInfo || {};

    db.integrations.quickbooks = {
      environment: getQuickBooksConnectionConfig().environment,
      connected: true,
      realmId,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      expiresAt: new Date(Date.now() + Number(tokenPayload.expires_in || 0) * 1000).toISOString(),
      refreshExpiresAt: new Date(Date.now() + Number(tokenPayload.x_refresh_token_expires_in || 0) * 1000).toISOString(),
      companyName: companyInfo.CompanyName || "",
      companyLegalName: companyInfo.LegalName || "",
      connectedByUserId: oauthState.userId,
      lastSyncAt: new Date().toISOString(),
    };
    db.auth.oauthStates = db.auth.oauthStates.filter((item) => item.state !== state);
    await saveDb(db);

    res.redirect(`${buildBaseUrl(req)}/?quickbooks=connected`);
  } catch (error) {
    db.auth.oauthStates = db.auth.oauthStates.filter((item) => item.state !== state);
    await saveDb(db);
    res.redirect(`${buildBaseUrl(req)}/?quickbooks=failed&message=${encodeURIComponent(error.message)}`);
  }
});

app.post("/api/integrations/quickbooks/disconnect", requireAuth, requireManager, async (req, res) => {
  try {
    const existingToken = req.db.integrations.quickbooks.accessToken;
    if (existingToken) {
      try {
        await revokeQuickBooksToken(existingToken);
      } catch (error) {
        // Keep the local disconnect even if provider revocation fails.
      }
    }

    req.db.integrations.quickbooks = {
      environment: getQuickBooksConnectionConfig().environment,
      connected: false,
      realmId: "",
      accessToken: "",
      refreshToken: "",
      expiresAt: "",
      refreshExpiresAt: "",
      companyName: "",
      companyLegalName: "",
      connectedByUserId: "",
      lastSyncAt: "",
    };
    await saveDb(req.db);

    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to disconnect QuickBooks." });
  }
});

app.post("/api/integrations/workflow/config", requireAuth, requireManager, async (req, res) => {
  try {
    const sourceType = sanitizeWorkflowSourceType(optionalText(req.body?.sourceType));
    const sourceName = requireText(req.body?.sourceName, "sourceName", 2);
    const connectionString = optionalText(req.body?.connectionString);
    const feedUrl = optionalText(req.body?.feedUrl);
    const sqlQuery = optionalText(req.body?.sqlQuery);

    if (sourceType === "postgres" && (!connectionString || !sqlQuery)) {
      throw new Error("Postgres workflow sync requires both a connection string and SQL query.");
    }

    if (sourceType === "json-url" && !feedUrl) {
      throw new Error("JSON workflow sync requires a feed URL.");
    }

    req.db.integrations.workflow = {
      ...(req.db.integrations.workflow || {}),
      sourceType,
      sourceName,
      connectionString,
      feedUrl,
      sqlQuery,
      connected: Boolean(req.db.integrations.workflow?.lastSyncAt),
      lastError: "",
    };
    await saveDb(req.db);

    res.status(201).json({
      workflow: buildOverview(req.db, sanitizeDate(req.body?.date), req.user).integrations.workflow,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to save workflow connection." });
  }
});

app.post("/api/integrations/workflow/sync", requireAuth, requireManager, async (req, res) => {
  try {
    const workflowConfig = req.db.integrations.workflow || {};
    const rows = await fetchWorkflowRows(workflowConfig);
    const summary = applyWorkflowSync(req.db, rows, workflowConfig);
    if (summary.touchedDates.length) {
      req.db.routePlans = req.db.routePlans.filter((plan) => !summary.touchedDates.includes(plan.date));
    } else {
      req.db.routePlans = [];
    }
    await saveDb(req.db);

    const selectedDate = sanitizeDate(req.body?.date);
    res.status(201).json({
      summary,
      overview: buildOverview(req.db, selectedDate, req.user),
    });
  } catch (error) {
    req.db.integrations.workflow = {
      ...(req.db.integrations.workflow || {}),
      connected: false,
      lastError: error.message || "Workflow sync failed.",
    };
    await saveDb(req.db);
    res.status(400).json({ error: error.message || "Unable to sync workflow source." });
  }
});

app.get("/api/due-pools", requireAuth, async (req, res) => {
  const selectedDate = sanitizeDate(req.query?.date);
  res.json({ date: selectedDate, pools: getDuePools(req.db, selectedDate) });
});

app.get("*", async (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`BlueCurrent Pool Ops listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database.", error);
    process.exit(1);
  });
