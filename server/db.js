const fs = require("fs");
const path = require("path");

const {
  enrichRoutePlansWithRouting,
  getQuickBooksConnectionConfig,
  getRoutingProviderState,
  getWorkflowConnectionState,
  sanitizeWorkflowSourceType,
} = require("./integrations");
const { createPasswordRecord } = require("./security");

const DB_FILE =
  process.env.DB_FILE || path.join(process.cwd(), "data", "pool-ops-db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";

let pgPool = null;
const ESTIMATED_GAS_PRICE = 3.62;
const TYPICAL_EXPENSE_CATEGORIES = [
  "fuel",
  "liquid chlorine",
  "tabs",
  "muriatic acid",
  "salt",
  "stabilizer",
  "algaecide",
  "phosphate remover",
  "filter clean",
  "parts",
  "repairs",
  "supplies",
  "tolls",
  "disposal",
];
const SALES_PIPELINE_STAGES = ["submitted", "contacted", "quoted", "won", "lost"];
const SALES_TYPES = ["upsell", "equipment-upgrade", "repair", "new-service", "referral"];
const CUSTOMER_REQUEST_TYPES = ["complaint", "schedule", "referral", "photo-update", "general"];
const CUSTOMER_REQUEST_STATUSES = ["submitted", "reviewing", "scheduled", "resolved", "closed"];

function isoDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value || new Date().toISOString()).slice(0, 10);
}

function getWeekdayLabel(date) {
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return weekdays[new Date(`${isoDateOnly(date)}T12:00:00Z`).getUTCDay()];
}

function atTime(date, hours, minutes = 0) {
  return `${isoDateOnly(date)}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:00.000Z`;
}

function dateShift(date, days) {
  const base = new Date(`${isoDateOnly(date)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function normalizePriority(value) {
  const input = String(value || "").trim().toLowerCase();
  if (input === "urgent" || input === "critical" || input === "high") {
    return "high";
  }
  if (input === "low") {
    return "low";
  }
  return "medium";
}

function priorityRank(value) {
  return { high: 3, medium: 2, low: 1 }[normalizePriority(value)] || 1;
}

function normalizeWorkflowStatus(value) {
  const input = String(value || "").trim().toLowerCase();
  if (["done", "complete", "completed", "closed"].includes(input)) {
    return "completed";
  }
  if (["cancelled", "canceled", "void"].includes(input)) {
    return "cancelled";
  }
  if (["in-progress", "in_progress", "enroute", "in route", "active"].includes(input)) {
    return "in-progress";
  }
  return "queued";
}

function estimatedDriveMinutes(miles, averageMph = 26) {
  return miles > 0 ? Math.max(4, Math.round((miles / averageMph) * 60)) : 0;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function monthKey(date) {
  return isoDateOnly(date).slice(0, 7);
}

function poolLookupMap(db) {
  return new Map((db.pools || []).map((pool) => [pool.id, pool]));
}

function dataUrlSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeAvatarDataUrl(name, bg, accent) {
  const safeName = String(name || "User");
  const initials = safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

  return dataUrlSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="240" height="240" rx="54" fill="url(#g)"/><circle cx="120" cy="92" r="42" fill="rgba(255,255,255,.16)"/><path d="M54 196c13-31 39-47 66-47s54 16 66 47" fill="rgba(255,255,255,.14)"/><text x="120" y="132" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="54" font-weight="700" fill="#f4fffd">${initials}</text></svg>`,
  );
}

function makeProfileNote(role) {
  const notes = {
    "Lead Technician": "Trusted with route recovery, algae treatment jobs, and customer escalations.",
    "Route Technician": "Strong on consistency, fast deck cleanup, and chemical restocks.",
    "Senior Technician": "Handles automation checks, heaters, and higher-value service accounts.",
    "New Hire Technician": "Shadow-ready on advanced repairs, focused on clean logs and photos.",
  };
  return notes[role] || "Pool field technician.";
}

function seedEmployees() {
  return [
    {
      id: "emp-mia-rivera",
      name: "Mia Rivera",
      role: "Lead Technician",
      status: "active",
      email: "mia@bluecurrent.local",
      phone: "(561) 555-0147",
      avatarUrl: makeAvatarDataUrl("Mia Rivera", "#0ea5a0", "#3b82f6"),
      homeBase: { lat: 26.7153, lon: -80.0534, label: "West Palm dispatch" },
      vehicle: { unit: "Truck 12", mpg: 13.5, fuelType: "gas" },
      hourlyRate: 28,
      capacityMinutes: 510,
      specialties: ["green-to-clean", "salt systems"],
      certifications: ["CPO", "Salt cell service"],
      hireDate: "2022-04-18",
      emergencyContact: "L. Rivera • (561) 555-0113",
      profileNote: makeProfileNote("Lead Technician"),
      payroll: {
        payType: "hourly",
        hourlyRate: 28,
        overtimeRate: 42,
        ytdHours: 398,
        ytdGross: 12044,
        nextPayDate: "2026-03-13",
        bankLast4: "1842",
        payStubs: [
          { id: "stub-mia-1", periodStart: "2026-02-15", periodEnd: "2026-02-28", gross: 2268, net: 1712, status: "paid" },
          { id: "stub-mia-2", periodStart: "2026-03-01", periodEnd: "2026-03-13", gross: 2142, net: 1628, status: "processing" },
        ],
      },
    },
    {
      id: "emp-darius-hall",
      name: "Darius Hall",
      role: "Route Technician",
      status: "active",
      email: "darius@bluecurrent.local",
      phone: "(561) 555-0192",
      avatarUrl: makeAvatarDataUrl("Darius Hall", "#2563eb", "#0ea5a0"),
      homeBase: { lat: 26.5898, lon: -80.1003, label: "Lake Worth yard" },
      vehicle: { unit: "Truck 18", mpg: 14.8, fuelType: "gas" },
      hourlyRate: 24,
      capacityMinutes: 480,
      specialties: ["vacuuming", "tile cleanups"],
      certifications: ["Route standards"],
      hireDate: "2023-08-07",
      emergencyContact: "K. Hall • (561) 555-0176",
      profileNote: makeProfileNote("Route Technician"),
      payroll: {
        payType: "hourly",
        hourlyRate: 24,
        overtimeRate: 36,
        ytdHours: 356,
        ytdGross: 8760,
        nextPayDate: "2026-03-13",
        bankLast4: "9011",
        payStubs: [
          { id: "stub-darius-1", periodStart: "2026-02-15", periodEnd: "2026-02-28", gross: 1888, net: 1442, status: "paid" },
          { id: "stub-darius-2", periodStart: "2026-03-01", periodEnd: "2026-03-13", gross: 1796, net: 1384, status: "processing" },
        ],
      },
    },
    {
      id: "emp-serena-cho",
      name: "Serena Cho",
      role: "Senior Technician",
      status: "active",
      email: "serena@bluecurrent.local",
      phone: "(561) 555-0108",
      avatarUrl: makeAvatarDataUrl("Serena Cho", "#8b5cf6", "#0ea5a0"),
      homeBase: { lat: 26.4615, lon: -80.0728, label: "Delray staging" },
      vehicle: { unit: "Van 04", mpg: 16.2, fuelType: "gas" },
      hourlyRate: 30,
      capacityMinutes: 500,
      specialties: ["automation", "equipment checks"],
      certifications: ["CPO", "Pentair automation"],
      hireDate: "2021-11-02",
      emergencyContact: "J. Cho • (561) 555-0161",
      profileNote: makeProfileNote("Senior Technician"),
      payroll: {
        payType: "hourly",
        hourlyRate: 30,
        overtimeRate: 45,
        ytdHours: 402,
        ytdGross: 13218,
        nextPayDate: "2026-03-13",
        bankLast4: "7750",
        payStubs: [
          { id: "stub-serena-1", periodStart: "2026-02-15", periodEnd: "2026-02-28", gross: 2410, net: 1819, status: "paid" },
          { id: "stub-serena-2", periodStart: "2026-03-01", periodEnd: "2026-03-13", gross: 2280, net: 1731, status: "processing" },
        ],
      },
    },
    {
      id: "emp-owen-price",
      name: "Owen Price",
      role: "New Hire Technician",
      status: "active",
      email: "owen@bluecurrent.local",
      phone: "(561) 555-0166",
      avatarUrl: makeAvatarDataUrl("Owen Price", "#f59e0b", "#0ea5a0"),
      homeBase: { lat: 26.3696, lon: -80.1289, label: "Boca service pod" },
      vehicle: { unit: "Truck 21", mpg: 15.1, fuelType: "gas" },
      hourlyRate: 21,
      capacityMinutes: 450,
      specialties: ["chem logs", "filter checks"],
      certifications: ["Water chemistry basics"],
      hireDate: "2025-05-11",
      emergencyContact: "A. Price • (561) 555-0142",
      profileNote: makeProfileNote("New Hire Technician"),
      payroll: {
        payType: "hourly",
        hourlyRate: 21,
        overtimeRate: 31.5,
        ytdHours: 288,
        ytdGross: 6128,
        nextPayDate: "2026-03-13",
        bankLast4: "4468",
        payStubs: [
          { id: "stub-owen-1", periodStart: "2026-02-15", periodEnd: "2026-02-28", gross: 1596, net: 1238, status: "paid" },
          { id: "stub-owen-2", periodStart: "2026-03-01", periodEnd: "2026-03-13", gross: 1480, net: 1154, status: "processing" },
        ],
      },
    },
  ];
}

function seedPools() {
  return [
    {
      id: "pool-alton",
      customerName: "Alton Residence",
      address: "128 Ridge Lake Rd, West Palm Beach, FL",
      lat: 26.7421,
      lon: -80.0863,
      neighborhood: "West Palm",
      gallons: 17000,
      serviceMinutes: 42,
      serviceDays: ["sat", "wed"],
      priority: "high",
      equipment: ["salt cell", "heater"],
      gateCode: "#1942",
      notes: "Palm debris heavy after storms.",
      chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-banyan",
      customerName: "Banyan Club HOA",
      address: "441 Banyan Crest, Palm Beach Gardens, FL",
      lat: 26.8194,
      lon: -80.1191,
      neighborhood: "Palm Beach Gardens",
      gallons: 24000,
      serviceMinutes: 52,
      serviceDays: ["sat", "tue"],
      priority: "high",
      equipment: ["ozone", "auto-fill"],
      gateCode: "Office key",
      notes: "Commercial deck wash every Saturday.",
      chemicalProfile: { chlorineTarget: "3.0-5.0", phTarget: "7.3-7.6" },
    },
    {
      id: "pool-coral",
      customerName: "Coral Hammock",
      address: "722 Coral Springs Dr, Jupiter, FL",
      lat: 26.9216,
      lon: -80.1062,
      neighborhood: "Jupiter",
      gallons: 14500,
      serviceMinutes: 38,
      serviceDays: ["sat"],
      priority: "medium",
      equipment: ["variable pump"],
      gateCode: "Call owner",
      notes: "Small screen enclosure.",
      chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.7" },
    },
    {
      id: "pool-drift",
      customerName: "Driftwood Lane",
      address: "901 Driftwood Ln, Lake Worth Beach, FL",
      lat: 26.6199,
      lon: -80.0784,
      neighborhood: "Lake Worth",
      gallons: 13200,
      serviceMinutes: 35,
      serviceDays: ["sat", "thu"],
      priority: "medium",
      equipment: ["cartridge filter"],
      gateCode: "#8821",
      notes: "Dog in yard, use side gate.",
      chemicalProfile: { chlorineTarget: "2.0-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-estuary",
      customerName: "Estuary Point",
      address: "1608 Harbor Sound, Wellington, FL",
      lat: 26.6507,
      lon: -80.2189,
      neighborhood: "Wellington",
      gallons: 19500,
      serviceMinutes: 48,
      serviceDays: ["sat"],
      priority: "high",
      equipment: ["salt cell", "spa spillover"],
      gateCode: "#7600",
      notes: "Needs careful balancing after rain.",
      chemicalProfile: { chlorineTarget: "3.0-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-foxtail",
      customerName: "Foxtail Court",
      address: "47 Foxtail Ct, Boynton Beach, FL",
      lat: 26.5534,
      lon: -80.0992,
      neighborhood: "Boynton",
      gallons: 14800,
      serviceMinutes: 37,
      serviceDays: ["sat", "wed"],
      priority: "medium",
      equipment: ["DE filter"],
      gateCode: "#4519",
      notes: "Client wants photo after vacuum every visit.",
      chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-golden",
      customerName: "Golden Isles",
      address: "315 Golden Isles Dr, Delray Beach, FL",
      lat: 26.4553,
      lon: -80.0821,
      neighborhood: "Delray",
      gallons: 16000,
      serviceMinutes: 41,
      serviceDays: ["sat"],
      priority: "medium",
      equipment: ["automation", "spa"],
      gateCode: "Front desk",
      notes: "Check spa spillover programming monthly.",
      chemicalProfile: { chlorineTarget: "3.0-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-harbor",
      customerName: "Harbor View",
      address: "889 Harbor View Dr, Delray Beach, FL",
      lat: 26.4744,
      lon: -80.0613,
      neighborhood: "Delray",
      gallons: 22000,
      serviceMinutes: 55,
      serviceDays: ["sat"],
      priority: "high",
      equipment: ["heater", "salt cell"],
      gateCode: "#9901",
      notes: "Recent algae bloom, needs extra brushing.",
      chemicalProfile: { chlorineTarget: "3.5-5.0", phTarget: "7.2-7.5" },
    },
    {
      id: "pool-indigo",
      customerName: "Indigo Preserve",
      address: "1721 Indigo Preserve, Boca Raton, FL",
      lat: 26.3567,
      lon: -80.1117,
      neighborhood: "Boca",
      gallons: 15500,
      serviceMinutes: 39,
      serviceDays: ["sat", "tue"],
      priority: "medium",
      equipment: ["variable pump", "robot"],
      gateCode: "#2380",
      notes: "Owner tracks waterline photos closely.",
      chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-jasmine",
      customerName: "Jasmine Keys",
      address: "402 Jasmine Keys Blvd, Boca Raton, FL",
      lat: 26.4035,
      lon: -80.1368,
      neighborhood: "Boca",
      gallons: 18800,
      serviceMinutes: 44,
      serviceDays: ["sat"],
      priority: "medium",
      equipment: ["salt cell", "automation"],
      gateCode: "Guard gate",
      notes: "Guard needs company badge.",
      chemicalProfile: { chlorineTarget: "3.0-4.5", phTarget: "7.4-7.6" },
    },
    {
      id: "pool-keystone",
      customerName: "Keystone Estates",
      address: "51 Keystone Ct, Palm Beach Gardens, FL",
      lat: 26.8488,
      lon: -80.1577,
      neighborhood: "Palm Beach Gardens",
      gallons: 21000,
      serviceMinutes: 49,
      serviceDays: ["sat"],
      priority: "high",
      equipment: ["DE filter", "heater"],
      gateCode: "#1010",
      notes: "Leaves from ficus hedge clog skimmers.",
      chemicalProfile: { chlorineTarget: "3.0-5.0", phTarget: "7.3-7.5" },
    },
    {
      id: "pool-lagoon",
      customerName: "Lagoon Pointe",
      address: "210 Lagoon Pointe, Lake Worth Beach, FL",
      lat: 26.603,
      lon: -80.1232,
      neighborhood: "Lake Worth",
      gallons: 17500,
      serviceMinutes: 43,
      serviceDays: ["sat", "thu"],
      priority: "medium",
      equipment: ["cartridge filter", "spa"],
      gateCode: "#6125",
      notes: "Spa spillway calcium watch.",
      chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.7" },
    },
  ];
}

function seedUsers(employees) {
  const records = [
    { id: "user-owner", name: "Avery Munoz", email: "owner@bluecurrent.local", role: "owner", password: "owner123!", employeeId: null },
    { id: "user-dispatch", name: "Jordan Ellis", email: "dispatch@bluecurrent.local", role: "dispatcher", password: "dispatch123!", employeeId: null },
    { id: "user-mia", name: "Mia Rivera", email: "mia@bluecurrent.local", role: "technician", password: "tech123!", employeeId: "emp-mia-rivera" },
    { id: "user-darius", name: "Darius Hall", email: "darius@bluecurrent.local", role: "technician", password: "tech123!", employeeId: "emp-darius-hall" },
    { id: "user-serena", name: "Serena Cho", email: "serena@bluecurrent.local", role: "technician", password: "tech123!", employeeId: "emp-serena-cho" },
    { id: "user-owen", name: "Owen Price", email: "owen@bluecurrent.local", role: "technician", password: "tech123!", employeeId: "emp-owen-price" },
    { id: "user-customer-alton", name: "Lena Alton", email: "lena@alton.local", role: "customer", password: "customer123!", employeeId: null, poolIds: ["pool-alton"] },
    { id: "user-customer-harbor", name: "Harbor View HOA", email: "hoa@harborview.local", role: "customer", password: "customer123!", employeeId: null, poolIds: ["pool-harbor"] },
  ];

  return records.map((record) => {
    const passwordRecord = createPasswordRecord(record.password);
    const employee = employees.find((item) => item.id === record.employeeId) || null;

    return {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      employeeId: record.employeeId,
      poolIds: Array.isArray(record.poolIds) ? record.poolIds : [],
      avatarUrl: employee?.avatarUrl || makeAvatarDataUrl(record.name, "#0f766e", "#0284c7"),
      ...passwordRecord,
    };
  });
}

function buildSeedData() {
  const today = isoDateOnly(new Date());
  const yesterday = dateShift(today, -1);
  const employees = seedEmployees();
  const users = seedUsers(employees);
  const routing = getRoutingProviderState();
  const qbo = getQuickBooksConnectionConfig();

  return {
    company: {
      name: "BlueCurrent Pool Ops",
      timezone: "America/New_York",
      headquarters: "West Palm Beach, FL",
      serviceArea: "Palm Beach County coastal and inland routes",
      quickbooks: {
        mode: qbo.clientId ? "oauth-live" : "export-ready",
        vendor: "QuickBooks Online",
      },
    },
    employees,
    pools: seedPools(),
    visits: [
      {
        id: "visit-seeded-1",
        employeeId: "emp-mia-rivera",
        poolId: "pool-alton",
        date: today,
        arrivalAt: atTime(today, 8, 10),
        departureAt: atTime(today, 8, 53),
        actualLocation: { lat: 26.7419, lon: -80.0862, accuracyFeet: 42 },
        waterSample: { chlorine: 3.4, ph: 7.5, alkalinity: 92, salinity: 3200, temperature: 81 },
        chemicalsUsed: [
          { product: "Liquid chlorine", amount: "0.8 gal", cost: 4.4 },
          { product: "Phosphate remover", amount: "4 oz", cost: 2.3 },
        ],
        photos: [
          {
            id: "photo-seeded-1",
            name: "alton-skimmer.jpg",
            caption: "Deck and skimmer basket cleared",
            dataUrl: dataUrlSvg("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='220'><rect width='100%' height='100%' fill='%230e8f8e'/><circle cx='160' cy='110' r='74' fill='%23b9f3eb'/><text x='50%' y='52%' dominant-baseline='middle' text-anchor='middle' font-size='22' font-family='Arial' fill='%23032733'>Service Photo</text></svg>"),
          },
        ],
        remarks: "Brushed walls, emptied skimmer, cleaned pump basket.",
        recommendations: "Monitor phosphates next visit if debris load stays high.",
        routeContext: { plannedOrder: 1, plannedMilesFromPrev: 6.3 },
        createdAt: atTime(today, 8, 55),
      },
      {
        id: "visit-seeded-2",
        employeeId: "emp-darius-hall",
        poolId: "pool-drift",
        date: today,
        arrivalAt: atTime(today, 8, 18),
        departureAt: atTime(today, 8, 52),
        actualLocation: { lat: 26.6201, lon: -80.0788, accuracyFeet: 55 },
        waterSample: { chlorine: 2.1, ph: 7.8, alkalinity: 108, salinity: 0, temperature: 80 },
        chemicalsUsed: [
          { product: "Muriatic acid", amount: "18 oz", cost: 3.1 },
          { product: "Tabs", amount: "2 puck", cost: 1.8 },
        ],
        photos: [],
        remarks: "Vacuumed floor and backwashed filter.",
        recommendations: "pH slightly high, recheck after acid circulation.",
        routeContext: { plannedOrder: 1, plannedMilesFromPrev: 4.1 },
        createdAt: atTime(today, 8, 54),
      },
      {
        id: "visit-seeded-3",
        employeeId: "emp-serena-cho",
        poolId: "pool-harbor",
        date: yesterday,
        arrivalAt: atTime(yesterday, 13, 10),
        departureAt: atTime(yesterday, 14, 6),
        actualLocation: { lat: 26.4743, lon: -80.0615, accuracyFeet: 38 },
        waterSample: { chlorine: 1.1, ph: 7.3, alkalinity: 88, salinity: 3250, temperature: 79 },
        chemicalsUsed: [
          { product: "Liquid chlorine", amount: "1.5 gal", cost: 8.25 },
          { product: "Algaecide", amount: "12 oz", cost: 5.1 },
        ],
        photos: [],
        remarks: "Green tint reduced after prior shock treatment.",
        recommendations: "Schedule follow-up and inspect salt cell output.",
        routeContext: { plannedOrder: 4, plannedMilesFromPrev: 3.7 },
        createdAt: atTime(yesterday, 14, 8),
      },
    ],
    expenses: [
      {
        id: "expense-seeded-1",
        date: today,
        employeeId: "emp-mia-rivera",
        poolId: "pool-banyan",
        category: "fuel",
        amount: 48.32,
        vendor: "Shell",
        memo: "Saturday route fill-up",
        quickbooksStatus: "pending-export",
        createdAt: atTime(today, 7, 3),
      },
      {
        id: "expense-seeded-2",
        date: today,
        employeeId: "emp-serena-cho",
        poolId: "pool-harbor",
        category: "chemicals",
        amount: 126.4,
        vendor: "Pool Wholesale Supply",
        memo: "Shock and acid restock",
        quickbooksStatus: "pending-export",
        createdAt: atTime(today, 6, 50),
      },
    ],
    salesLeads: [
      {
        id: "sale-seeded-1",
        employeeId: "emp-mia-rivera",
        poolId: "pool-banyan",
        type: "equipment-upgrade",
        stage: "quoted",
        customerName: "Banyan Club HOA",
        contactName: "Facilities Desk",
        contactPhone: "(561) 555-0188",
        title: "Variable-speed pump upgrade",
        notes: "Current pump is loud and power-hungry. Manager requested replacement quote.",
        estimatedValue: 2800,
        payoutEstimate: 280,
        source: "field-observation",
        createdAt: atTime(today, 11, 18),
        updatedAt: atTime(today, 14, 10),
      },
      {
        id: "sale-seeded-2",
        employeeId: "emp-serena-cho",
        poolId: null,
        type: "new-service",
        stage: "won",
        customerName: "Sawgrass Lane Residence",
        contactName: "H. Morgan",
        contactPhone: "(561) 555-0129",
        title: "Weekly pool service conversion",
        notes: "Neighbor referral converted to weekly service after deck-side consult.",
        estimatedValue: 260,
        payoutEstimate: 125,
        source: "referral",
        createdAt: atTime(today, 9, 22),
        updatedAt: atTime(today, 16, 30),
        closedAt: atTime(today, 16, 30),
      },
    ],
    customerRequests: [
      {
        id: "customer-request-1",
        poolId: "pool-alton",
        customerUserId: "user-customer-alton",
        type: "photo-update",
        status: "reviewing",
        title: "Need extra before and after photos",
        message: "Please upload a wide shot after vacuuming because the landscaping crew leaves debris behind.",
        preferredDate: today,
        preferredWindow: "after-service",
        photos: [],
        createdAt: atTime(today, 7, 12),
        updatedAt: atTime(today, 9, 5),
      },
      {
        id: "customer-request-2",
        poolId: "pool-harbor",
        customerUserId: "user-customer-harbor",
        type: "schedule",
        status: "scheduled",
        title: "Move next visit later in the day",
        message: "The deck vendor is on site in the morning. Please arrive after 1 PM if possible.",
        preferredDate: dateShift(today, 2),
        preferredWindow: "afternoon",
        photos: [],
        createdAt: atTime(today, 8, 22),
        updatedAt: atTime(today, 10, 14),
      },
    ],
    workflowItems: [],
    routePlans: [],
    liveTracking: {
      positions: [],
      history: [],
    },
    auth: {
      users,
      sessions: [],
      oauthStates: [],
    },
    integrations: {
      routing: {
        provider: routing.provider,
        profile: routing.profile,
        configured: routing.configured,
        lastPlannedAt: null,
      },
      quickbooks: {
        environment: qbo.environment,
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
      },
      workflow: {
        sourceType: "json-url",
        sourceName: "",
        connectionString: "",
        feedUrl: "",
        sqlQuery: "",
        connected: false,
        lastSyncAt: "",
        lastSyncCount: 0,
        lastError: "",
      },
    },
  };
}

function cloneDb(db) {
  return JSON.parse(JSON.stringify(db));
}

function normalizeDb(parsed) {
  const seed = buildSeedData();
  const db = parsed && typeof parsed === "object" ? parsed : {};
  const seedEmployeeMap = new Map(seed.employees.map((employee) => [employee.id, employee]));
  const employees =
    Array.isArray(db.employees) && db.employees.length
      ? db.employees.map((employee) => ({
          ...(seedEmployeeMap.get(employee.id) || {}),
          ...employee,
          payroll: {
            ...((seedEmployeeMap.get(employee.id) || {}).payroll || {}),
            ...(employee.payroll || {}),
          },
        }))
      : seed.employees;
  const fallbackUsers = seedUsers(employees);
  const fallbackUserMap = new Map(fallbackUsers.map((user) => [user.id, user]));

  return {
    company: db.company && typeof db.company === "object" ? { ...seed.company, ...db.company } : seed.company,
    employees,
    pools: Array.isArray(db.pools) && db.pools.length ? db.pools : seed.pools,
    visits: Array.isArray(db.visits) ? db.visits : seed.visits,
    expenses: Array.isArray(db.expenses) ? db.expenses : seed.expenses,
    salesLeads: Array.isArray(db.salesLeads) ? db.salesLeads : seed.salesLeads,
    customerRequests: Array.isArray(db.customerRequests) ? db.customerRequests : seed.customerRequests,
    workflowItems: Array.isArray(db.workflowItems) ? db.workflowItems : seed.workflowItems,
    routePlans: Array.isArray(db.routePlans) ? db.routePlans : [],
    liveTracking:
      db.liveTracking && typeof db.liveTracking === "object"
        ? {
            positions: Array.isArray(db.liveTracking.positions) ? db.liveTracking.positions : [],
            history: Array.isArray(db.liveTracking.history) ? db.liveTracking.history : [],
          }
        : seed.liveTracking,
    auth:
      db.auth && typeof db.auth === "object"
        ? {
            users:
              Array.isArray(db.auth.users) && db.auth.users.length
                ? [
                    ...db.auth.users.map((user) => ({
                      ...(fallbackUserMap.get(user.id) || {}),
                      ...user,
                      poolIds: Array.isArray(user.poolIds)
                        ? uniqueStrings(user.poolIds)
                        : Array.isArray(fallbackUserMap.get(user.id)?.poolIds)
                          ? fallbackUserMap.get(user.id).poolIds
                          : [],
                    })),
                    ...fallbackUsers.filter((fallbackUser) => !db.auth.users.some((user) => user.id === fallbackUser.id)),
                  ]
                : fallbackUsers,
            sessions: Array.isArray(db.auth.sessions) ? db.auth.sessions : [],
            oauthStates: Array.isArray(db.auth.oauthStates) ? db.auth.oauthStates : [],
          }
        : seed.auth,
    integrations:
      db.integrations && typeof db.integrations === "object"
        ? {
            routing: { ...seed.integrations.routing, ...(db.integrations.routing || {}) },
            quickbooks: { ...seed.integrations.quickbooks, ...(db.integrations.quickbooks || {}) },
            workflow: { ...seed.integrations.workflow, ...(db.integrations.workflow || {}) },
          }
        : seed.integrations,
  };
}

async function getPool() {
  if (!DATABASE_URL) {
    return null;
  }

  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }

  return pgPool;
}

function ensureDbFile() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(buildSeedData(), null, 2));
  }
}

async function ensureDb() {
  const pool = await getPool();
  if (!pool) {
    ensureDbFile();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await pool.query("SELECT id FROM app_state WHERE id = 1");
  if (existing.rowCount === 0) {
    await pool.query(
      "INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())",
      [JSON.stringify(buildSeedData())],
    );
  }
}

async function loadDb() {
  await ensureDb();
  const pool = await getPool();

  if (!pool) {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return normalizeDb(JSON.parse(raw));
  }

  const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
  if (result.rowCount === 0) {
    return cloneDb(buildSeedData());
  }

  return normalizeDb(result.rows[0].data);
}

async function saveDb(db) {
  await ensureDb();
  const normalized = normalizeDb(db);
  const pool = await getPool();

  if (!pool) {
    ensureDbFile();
    fs.writeFileSync(DB_FILE, JSON.stringify(normalized, null, 2));
    return;
  }

  await pool.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1", [
    JSON.stringify(normalized),
  ]);
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

function asMinutes(startAt, endAt) {
  const delta = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(0, Math.round(delta / 60000));
}

function isManager(viewer) {
  return viewer?.role === "owner" || viewer?.role === "dispatcher";
}

function isCustomer(viewer) {
  return viewer?.role === "customer";
}

function getViewerEmployee(db, viewer) {
  if (!viewer?.employeeId) {
    return null;
  }
  return db.employees.find((employee) => employee.id === viewer.employeeId) || null;
}

function getAccessiblePoolIds(db, viewer, routePlans = []) {
  if (!viewer || isManager(viewer)) {
    return null;
  }
  if (isCustomer(viewer)) {
    return new Set(Array.isArray(viewer.poolIds) ? viewer.poolIds : []);
  }
  return new Set(routePlans.flatMap((plan) => plan.stops.map((stop) => stop.poolId)));
}

function sanitizeViewer(db, user) {
  if (!user) {
    return null;
  }
  const employee = getViewerEmployee(db, user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId || null,
    poolIds: Array.isArray(user.poolIds) ? uniqueStrings(user.poolIds) : [],
    avatarUrl: user.avatarUrl || employee?.avatarUrl || "",
  };
}

function getAccessibleEmployees(db, viewer) {
  if (isManager(viewer) || !viewer) {
    return db.employees;
  }
  if (isCustomer(viewer)) {
    return [];
  }
  return db.employees.filter((employee) => employee.id === viewer.employeeId);
}

function getAccessibleRoutePlans(db, date, viewer) {
  const plans = db.routePlans.filter((plan) => plan.date === date);
  if (isManager(viewer) || !viewer) {
    return plans;
  }
  return plans.filter((plan) => plan.employeeId === viewer.employeeId);
}

function getAccessibleExpenses(db, date, viewer) {
  const expenses = db.expenses.filter((expense) => expense.date === date);
  if (isManager(viewer) || !viewer) {
    return expenses;
  }
  return expenses.filter((expense) => expense.employeeId === viewer.employeeId);
}

function workflowPoolsForDate(db, date) {
  const selectedDate = isoDateOnly(date);
  const poolsById = poolLookupMap(db);
  const grouped = new Map();

  (db.workflowItems || [])
    .filter((item) => item.serviceDate === selectedDate && !["completed", "cancelled"].includes(item.status))
    .forEach((item) => {
      const pool = poolsById.get(item.poolId);
      if (!pool) {
        return;
      }

      const existing = grouped.get(item.poolId) || {
        ...pool,
        serviceMinutes: Number(item.serviceMinutes || pool.serviceMinutes || 40),
        priority: normalizePriority(item.priority || pool.priority),
        workflowItems: [],
        workflowLabel: item.workflowLabel || "Workflow task",
        workflowStatus: item.status,
        workflowSourceName: item.sourceName || "",
      };

      existing.serviceMinutes = Math.max(
        Number(existing.serviceMinutes || 0),
        Number(item.serviceMinutes || pool.serviceMinutes || 40),
      );
      existing.priority =
        priorityRank(item.priority) > priorityRank(existing.priority) ? normalizePriority(item.priority) : existing.priority;
      existing.workflowStatus = item.status;
      existing.workflowLabel = item.workflowLabel || existing.workflowLabel;
      existing.workflowItems.push({
        id: item.id,
        label: item.workflowLabel,
        status: item.status,
        externalId: item.externalId,
      });

      grouped.set(item.poolId, existing);
    });

  return grouped;
}

function customerSchedulePoolsForDate(db, date) {
  const selectedDate = isoDateOnly(date);
  const poolsById = poolLookupMap(db);
  const grouped = new Map();

  (db.customerRequests || [])
    .filter(
      (item) =>
        normalizeCustomerRequestType(item.type) === "schedule" &&
        isoDateOnly(item.preferredDate || "") === selectedDate &&
        !["resolved", "closed"].includes(normalizeCustomerRequestStatus(item.status)),
    )
    .forEach((item) => {
      const pool = poolsById.get(item.poolId);
      if (!pool) {
        return;
      }

      const existing = grouped.get(item.poolId) || {
        ...pool,
        serviceMinutes: Number(pool.serviceMinutes || 40),
        priority: "high",
        customerScheduleRequested: true,
        customerRequestIds: [],
        customerRequestTypes: [],
        customerRequestWindow: "",
        customerRequestSummary: "",
        customerRequestStatus: normalizeCustomerRequestStatus(item.status),
      };

      existing.priority = "high";
      existing.customerScheduleRequested = true;
      existing.customerRequestStatus = normalizeCustomerRequestStatus(item.status);
      existing.customerRequestIds = uniqueStrings([...(existing.customerRequestIds || []), item.id]);
      existing.customerRequestTypes = uniqueStrings([
        ...(existing.customerRequestTypes || []),
        normalizeCustomerRequestType(item.type),
      ]);
      existing.customerRequestWindow = item.preferredWindow || existing.customerRequestWindow || "";
      existing.customerRequestSummary = item.title || existing.customerRequestSummary || "";
      existing.serviceMinutes = Math.max(
        Number(existing.serviceMinutes || 0),
        Number(pool.serviceMinutes || 40),
      );

      grouped.set(item.poolId, existing);
    });

  return grouped;
}

function visitedPoolsForDate(db, date) {
  const selectedDate = isoDateOnly(date);
  const poolsById = poolLookupMap(db);
  const grouped = new Map();

  (db.visits || [])
    .filter((visit) => visit.date === selectedDate)
    .forEach((visit) => {
      const pool = poolsById.get(visit.poolId);
      if (!pool) {
        return;
      }

      const existing = grouped.get(visit.poolId) || {
        ...pool,
        workflowItems: [],
        workflowLabel: "",
        workflowStatus: "",
        workflowSourceName: "",
        actualVisitLogged: true,
        preferredEmployeeId: visit.employeeId,
        serviceMinutes: Number(pool.serviceMinutes || 40),
      };

      existing.actualVisitLogged = true;
      existing.preferredEmployeeId = existing.preferredEmployeeId || visit.employeeId;
      existing.serviceMinutes = Math.max(
        Number(existing.serviceMinutes || 0),
        asMinutes(visit.arrivalAt, visit.departureAt),
      );

      grouped.set(visit.poolId, existing);
    });

  return grouped;
}

function getDuePools(db, date) {
  const weekday = getWeekdayLabel(date);
  const recurring = new Map(
    db.pools
      .filter((pool) => Array.isArray(pool.serviceDays) && pool.serviceDays.includes(weekday))
      .map((pool) => [
        pool.id,
        {
          ...pool,
          workflowItems: [],
          workflowLabel: "",
          workflowStatus: "",
          workflowSourceName: "",
        },
      ]),
  );

  workflowPoolsForDate(db, date).forEach((workflowPool, poolId) => {
    const existing = recurring.get(poolId);
    recurring.set(poolId, existing ? { ...existing, ...workflowPool } : workflowPool);
  });

  customerSchedulePoolsForDate(db, date).forEach((customerPool, poolId) => {
    const existing = recurring.get(poolId);
    recurring.set(poolId, existing ? { ...existing, ...customerPool } : customerPool);
  });

  visitedPoolsForDate(db, date).forEach((visitedPool, poolId) => {
    const existing = recurring.get(poolId);
    recurring.set(poolId, existing ? { ...existing, ...visitedPool } : visitedPool);
  });

  return Array.from(recurring.values());
}

function routeMetricsForStops(stops, startPoint, vehicleMpg) {
  let totalMiles = 0;
  let totalDriveMinutes = 0;
  let totalServiceMinutes = 0;
  let cursor = startPoint;

  for (const stop of stops) {
    const milesFromPrev = haversineMiles(cursor.lat, cursor.lon, stop.lat, stop.lon);
    totalMiles += milesFromPrev;
    totalDriveMinutes += estimatedDriveMinutes(milesFromPrev);
    totalServiceMinutes += Number(stop.serviceMinutes || 0);
    cursor = stop;
  }

  if (stops.length) {
    const returnMiles = haversineMiles(cursor.lat, cursor.lon, startPoint.lat, startPoint.lon);
    totalMiles += returnMiles;
    totalDriveMinutes += estimatedDriveMinutes(returnMiles);
  }

  const fuelGallons = totalMiles / Math.max(vehicleMpg || 1, 1);
  return {
    totalMiles,
    driveMinutes: totalDriveMinutes,
    serviceMinutes: totalServiceMinutes,
    workdayMinutes: totalDriveMinutes + totalServiceMinutes,
    fuelGallons,
  };
}

function routeObjectiveScore(metrics, employee, stopCount, highestPriority = "medium") {
  const overflowMinutes = Math.max(0, metrics.workdayMinutes - Number(employee.capacityMinutes || 0));
  const capacityRatio = metrics.workdayMinutes / Math.max(Number(employee.capacityMinutes || 1), 1);
  const priorityCredit = priorityRank(highestPriority) * 3.2;
  return (
    metrics.driveMinutes * 1.7 +
    metrics.fuelGallons * 28 +
    Math.max(0, capacityRatio - 0.9) * 42 +
    overflowMinutes * 2.8 +
    stopCount * 1.1 -
    priorityCredit
  );
}

function nearestNeighborRoute(stops, startPoint) {
  const remaining = stops.slice();
  const ordered = [];
  let current = startPoint;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const distance = haversineMiles(current.lat, current.lon, candidate.lat, candidate.lon);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    current = next;
  }

  return ordered;
}

function twoOptRoute(stops, startPoint) {
  if (stops.length < 4) {
    return stops.slice();
  }

  let best = stops.slice();
  let bestDistance = routeMetricsForStops(best, startPoint, 1).totalMiles;
  let improved = true;
  let passes = 0;

  while (improved && passes < 6) {
    improved = false;
    passes += 1;

    for (let start = 0; start < best.length - 2; start += 1) {
      for (let end = start + 1; end < best.length - 1; end += 1) {
        const candidate = best
          .slice(0, start)
          .concat(best.slice(start, end + 1).reverse(), best.slice(end + 1));
        const candidateDistance = routeMetricsForStops(candidate, startPoint, 1).totalMiles;
        if (candidateDistance + 0.01 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

function optimizeRouteOrder(stops, startPoint) {
  return twoOptRoute(nearestNeighborRoute(stops, startPoint), startPoint);
}

function simulatePoolInsertion(assignment, pool) {
  const sourceStops = assignment.pools;
  let best = null;

  for (let index = 0; index <= sourceStops.length; index += 1) {
    const candidate = sourceStops.slice(0, index).concat(pool, sourceStops.slice(index));
    const metrics = routeMetricsForStops(candidate, assignment.employee.homeBase, assignment.employee.vehicle.mpg);
    const score = routeObjectiveScore(metrics, assignment.employee, candidate.length, pool.priority);
    if (!best || score < best.score) {
      best = { orderedPools: candidate, metrics, score };
    }
  }

  return best;
}

function assignPoolsToEmployees(duePools, employees) {
  const assignments = employees.map((employee) => ({
    employee,
    pools: [],
    metrics: routeMetricsForStops([], employee.homeBase, employee.vehicle.mpg),
    objectiveScore: 0,
  }));

  const sortedPools = duePools
    .slice()
    .sort((a, b) => {
      return (
        priorityRank(b.priority) - priorityRank(a.priority) ||
        Number(b.serviceMinutes || 0) - Number(a.serviceMinutes || 0)
      );
    });

  for (const pool of sortedPools) {
    const eligibleAssignments = pool.preferredEmployeeId
      ? assignments.filter((assignment) => assignment.employee.id === pool.preferredEmployeeId)
      : assignments;
    const candidates = eligibleAssignments.length ? eligibleAssignments : assignments;

    let bestAssignment = candidates[0];
    let bestOption = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const assignment of candidates) {
      const option = simulatePoolInsertion(assignment, pool);
      const delta = option.score - assignment.objectiveScore;
      const mpgCredit = Number(assignment.employee.vehicle?.mpg || 0) * -0.18;
      const adjustedDelta = delta + mpgCredit;

      if (adjustedDelta < bestDelta) {
        bestDelta = adjustedDelta;
        bestOption = option;
        bestAssignment = assignment;
      }
    }

    bestAssignment.pools = bestOption.orderedPools;
    bestAssignment.metrics = bestOption.metrics;
    bestAssignment.objectiveScore = bestOption.score;
  }

  return assignments;
}

async function buildRoutePlansForDate(db, date) {
  const selectedDate = isoDateOnly(date);
  const duePools = getDuePools(db, selectedDate);
  const employees = db.employees.filter((employee) => employee.status === "active");
  const assignments = assignPoolsToEmployees(duePools, employees);

  const basePlans = assignments.map((assignment) => {
    const orderedPools = optimizeRouteOrder(assignment.pools, assignment.employee.homeBase);
    const routeMetrics = routeMetricsForStops(orderedPools, assignment.employee.homeBase, assignment.employee.vehicle.mpg);
    let cursor = assignment.employee.homeBase;

    const stops = orderedPools.map((pool, index) => {
      const milesFromPrev = haversineMiles(cursor.lat, cursor.lon, pool.lat, pool.lon);
      const driveMinutesFromPrev = estimatedDriveMinutes(milesFromPrev);
      cursor = pool;

      return {
        sequence: index + 1,
        poolId: pool.id,
        customerName: pool.customerName,
        address: pool.address,
        neighborhood: pool.neighborhood,
        priority: pool.priority,
        serviceMinutes: pool.serviceMinutes,
        milesFromPrev: Number(milesFromPrev.toFixed(1)),
        driveMinutesFromPrev,
        coordinates: { lat: pool.lat, lon: pool.lon },
        workflowLabel: pool.workflowLabel || "",
        workflowStatus: pool.workflowStatus || "",
        workflowSourceName: pool.workflowSourceName || "",
        workflowItems: pool.workflowItems || [],
        customerScheduleRequested: Boolean(pool.customerScheduleRequested),
        customerRequestIds: pool.customerRequestIds || [],
        customerRequestTypes: pool.customerRequestTypes || [],
        customerRequestWindow: pool.customerRequestWindow || "",
        customerRequestSummary: pool.customerRequestSummary || "",
        customerRequestStatus: pool.customerRequestStatus || "",
      };
    });

    const capacityMinutes = Math.max(assignment.employee.capacityMinutes, 1);

    return {
      id: `route-${selectedDate}-${assignment.employee.id}`,
      date: selectedDate,
      employeeId: assignment.employee.id,
      employeeName: assignment.employee.name,
      vehicleUnit: assignment.employee.vehicle.unit,
      vehicleMpg: assignment.employee.vehicle.mpg,
      startPoint: assignment.employee.homeBase,
      stops,
      path: [assignment.employee.homeBase, ...stops.map((stop) => stop.coordinates), assignment.employee.homeBase],
      totalPools: stops.length,
      totalMiles: Number(routeMetrics.totalMiles.toFixed(1)),
      driveMinutes: routeMetrics.driveMinutes,
      serviceMinutes: routeMetrics.serviceMinutes,
      workdayMinutes: routeMetrics.workdayMinutes,
      fuelGallons: Number(routeMetrics.fuelGallons.toFixed(1)),
      efficiencyScore: Math.max(
        35,
        Math.round(
          100 -
            (routeMetrics.driveMinutes / Math.max(stops.length * 30, 1)) * 12 -
            (routeMetrics.totalMiles / 90) * 14 -
            Math.max(0, routeMetrics.workdayMinutes - capacityMinutes) / 12,
        ),
      ),
      capacityUse: Number((routeMetrics.workdayMinutes / capacityMinutes).toFixed(2)),
      optimization: {
        objective: "least-fuel-and-time-loss",
        heuristic: "cheapest-insertion-plus-2opt",
        objectiveScore: Number(routeObjectiveScore(routeMetrics, assignment.employee, stops.length).toFixed(2)),
      },
      provider: getRoutingProviderState(),
      routeMode: "heuristic-fallback",
    };
  });

  const enrichedPlans = await enrichRoutePlansWithRouting(basePlans);
  return enrichedPlans.map((plan) => {
    const employee = employees.find((item) => item.id === plan.employeeId);
    return {
      ...plan,
      efficiencyScore: Math.max(
        35,
        Math.round(
          100 -
            (plan.driveMinutes / Math.max(plan.totalPools * 30, 1)) * 12 -
            (plan.totalMiles / 90) * 14 -
            Math.max(0, plan.workdayMinutes - Math.max(employee?.capacityMinutes || 1, 1)) / 12,
        ),
      ),
      optimization: {
        ...(plan.optimization || {}),
        objective: "least-fuel-and-time-loss",
        heuristic:
          plan.routeMode === "live-road-network" ? "cheapest-insertion-plus-2opt-plus-mapbox" : "cheapest-insertion-plus-2opt",
        objectiveScore: employee
          ? Number(routeObjectiveScore(plan, employee, plan.totalPools).toFixed(2))
          : Number(plan.optimization?.objectiveScore || 0),
      },
    };
  });
}

async function ensureRoutePlansForDate(db, date) {
  const selectedDate = isoDateOnly(date);
  const existing = db.routePlans.filter((plan) => plan.date === selectedDate);
  const duePools = getDuePools(db, selectedDate);
  const existingHasWork = existing.some((plan) => Number(plan.totalPools || 0) > 0);

  if (existing.length && (existingHasWork || !duePools.length)) {
    return { changed: false, routePlans: existing };
  }

  const generated = await buildRoutePlansForDate(db, selectedDate);
  db.routePlans = db.routePlans.filter((plan) => plan.date !== selectedDate).concat(generated);
  db.integrations.routing.lastPlannedAt = new Date().toISOString();
  db.integrations.routing.configured = getRoutingProviderState().configured;
  db.integrations.routing.profile = getRoutingProviderState().profile;
  return { changed: true, routePlans: generated };
}

function waterStatus(sample = {}) {
  const issues = [];
  const chlorine = Number(sample.chlorine);
  const ph = Number(sample.ph);

  if (Number.isFinite(chlorine) && chlorine < 2) {
    issues.push("low chlorine");
  } else if (Number.isFinite(chlorine) && chlorine > 5) {
    issues.push("high chlorine");
  }

  if (Number.isFinite(ph) && ph < 7.2) {
    issues.push("low pH");
  } else if (Number.isFinite(ph) && ph > 7.8) {
    issues.push("high pH");
  }

  return issues;
}

function collectLatestVisits(visits, poolId) {
  return visits
    .filter((visit) => visit.poolId === poolId)
    .sort((a, b) => b.departureAt.localeCompare(a.departureAt));
}

function buildEmployeeSnapshots(db, date, routePlans, viewer) {
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visitsToday = db.visits.filter(
    (visit) => visit.date === date && accessibleEmployeeIds.has(visit.employeeId),
  );
  const economics = buildVisitEconomics(db, date, viewer, routePlans);

  return getAccessibleEmployees(db, viewer).map((employee) => {
    const plan = routePlans.find((routePlan) => routePlan.employeeId === employee.id);
    const employeeVisits = visitsToday.filter((visit) => visit.employeeId === employee.id);
    const employeeEconomics = economics.filter((item) => item.employeeId === employee.id);
    const totalServiceMinutes = employeeVisits.reduce(
      (sum, visit) => sum + asMinutes(visit.arrivalAt, visit.departureAt),
      0,
    );
    const avgServiceMinutes = employeeVisits.length
      ? Math.round(totalServiceMinutes / employeeVisits.length)
      : 0;

    return {
      ...employee,
      planSummary: plan
        ? {
            totalPools: plan.totalPools,
            completedPools: employeeVisits.length,
            pendingPools: Math.max(plan.totalPools - employeeVisits.length, 0),
            totalMiles: plan.totalMiles,
            fuelGallons: plan.fuelGallons,
            efficiencyScore: plan.efficiencyScore,
            capacityUse: plan.capacityUse,
            routeMode: plan.routeMode,
            averageCostPerJob: roundMoney(
              employeeEconomics.reduce((sum, item) => sum + item.totalExpense, 0) / Math.max(employeeEconomics.length, 1),
            ),
            balancedChlorineRate: Number(
              (
                employeeEconomics.filter((item) => item.chlorineStatus === "balanced").length /
                Math.max(employeeEconomics.length, 1)
              ).toFixed(2),
            ),
          }
        : null,
      todayVisits: employeeVisits,
      avgServiceMinutes,
      paySummary: {
        payType: employee.payroll.payType,
        hourlyRate: employee.payroll.hourlyRate,
        nextPayDate: employee.payroll.nextPayDate,
        ytdGross: employee.payroll.ytdGross,
        bankLast4: employee.payroll.bankLast4,
      },
    };
  });
}

function buildPoolSnapshots(db, viewer, routePlans) {
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visiblePoolIds = getAccessiblePoolIds(db, viewer, routePlans);
  const workflowByPoolId = new Map();

  (db.workflowItems || []).forEach((item) => {
    if (!workflowByPoolId.has(item.poolId)) {
      workflowByPoolId.set(item.poolId, []);
    }
    workflowByPoolId.get(item.poolId).push(item);
  });

  return db.pools
    .map((pool) => {
      const latestVisit = collectLatestVisits(db.visits, pool.id)[0] || null;
      const workflowItems = (workflowByPoolId.get(pool.id) || []).sort((a, b) =>
        b.serviceDate.localeCompare(a.serviceDate),
      );
      return {
        ...pool,
        latestVisit:
          latestVisit && (isManager(viewer) || accessibleEmployeeIds.has(latestVisit.employeeId))
            ? latestVisit
            : latestVisit,
        waterIssues: latestVisit ? waterStatus(latestVisit.waterSample) : [],
        latestChlorine: latestVisit?.waterSample?.chlorine ?? null,
        workflowItems: workflowItems.slice(0, 3),
      };
    })
    .filter((pool) => !visiblePoolIds || visiblePoolIds.has(pool.id))
    .sort((a, b) => {
      const score = { high: 3, medium: 2, low: 1 };
      return (score[b.priority] || 1) - (score[a.priority] || 1);
    })
    .slice(0, 12);
}

function buildQuickBooksExport(db, date, viewer) {
  const selectedDate = isoDateOnly(date);
  const lines = getAccessibleExpenses(db, selectedDate, viewer).map((expense) => {
    const employee = db.employees.find((item) => item.id === expense.employeeId);
    const pool = db.pools.find((item) => item.id === expense.poolId);
    return {
      id: expense.id,
      date: expense.date,
      payee: expense.vendor,
      category: expense.category,
      amount: expense.amount,
      memo: expense.memo,
      customer: pool ? pool.customerName : "Unassigned",
      technician: employee ? employee.name : "Unknown",
      quickbooksStatus: expense.quickbooksStatus || "pending-export",
    };
  });

  const config = getQuickBooksConnectionConfig();
  const connection = db.integrations.quickbooks;

  return {
    mode: db.company.quickbooks.mode,
    environment: config.environment,
    connected: Boolean(connection.connected),
    companyName: connection.companyName || "",
    companyLegalName: connection.companyLegalName || "",
    realmId: connection.realmId || "",
    syncState: connection.connected ? "connected" : config.clientId ? "credentials-ready" : "credentials-required",
    lastSyncAt: connection.lastSyncAt || null,
    totalAmount: Number(lines.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    lines,
  };
}

function normalizeExpenseCategory(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return input || "supplies";
}

function normalizeSalesType(value) {
  const input = String(value || "").trim().toLowerCase();
  return SALES_TYPES.includes(input) ? input : "upsell";
}

function normalizeSalesStage(value) {
  const input = String(value || "").trim().toLowerCase();
  return SALES_PIPELINE_STAGES.includes(input) ? input : "submitted";
}

function normalizeCustomerRequestType(value) {
  const input = String(value || "").trim().toLowerCase();
  return CUSTOMER_REQUEST_TYPES.includes(input) ? input : "general";
}

function normalizeCustomerRequestStatus(value) {
  const input = String(value || "").trim().toLowerCase();
  return CUSTOMER_REQUEST_STATUSES.includes(input) ? input : "submitted";
}

function salesPayoutEstimate(type, estimatedValue) {
  const value = Number(estimatedValue || 0);
  const salesType = normalizeSalesType(type);

  if (salesType === "referral") {
    return 150;
  }
  if (salesType === "new-service") {
    return Math.max(125, roundMoney(value * 0.08));
  }
  if (salesType === "equipment-upgrade") {
    return roundMoney(value * 0.1);
  }
  if (salesType === "repair") {
    return roundMoney(value * 0.08);
  }
  return roundMoney(value * 0.06);
}

function chemicalCostForVisit(visit) {
  return roundMoney((visit.chemicalsUsed || []).reduce((sum, item) => sum + Number(item.cost || 0), 0));
}

function chlorineLabel(value) {
  const chlorine = Number(value);
  if (!Number.isFinite(chlorine)) {
    return "not-tested";
  }
  if (chlorine < 2) {
    return "low";
  }
  if (chlorine > 5) {
    return "high";
  }
  return "balanced";
}

function buildVisitEconomics(db, date, viewer, routePlans) {
  const selectedDate = isoDateOnly(date);
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visits = db.visits
    .filter((visit) => visit.date === selectedDate && accessibleEmployeeIds.has(visit.employeeId))
    .slice()
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt));

  const employeeMap = new Map(db.employees.map((employee) => [employee.id, employee]));
  const poolMap = poolLookupMap(db);
  const routeMap = new Map(routePlans.map((plan) => [plan.employeeId, plan]));
  const employeeVisitCounts = new Map();

  visits.forEach((visit) => {
    employeeVisitCounts.set(visit.employeeId, (employeeVisitCounts.get(visit.employeeId) || 0) + 1);
  });

  const expensesToday = getAccessibleExpenses(db, selectedDate, viewer);

  return visits.map((visit) => {
    const employee = employeeMap.get(visit.employeeId);
    const pool = poolMap.get(visit.poolId);
    const plan = routeMap.get(visit.employeeId);
    const completedCount = Math.max(employeeVisitCounts.get(visit.employeeId) || 1, 1);
    const durationMinutes = asMinutes(visit.arrivalAt, visit.departureAt);
    const laborCost = roundMoney((durationMinutes / 60) * Number(employee?.payroll?.hourlyRate || 0));
    const chemicalCost = chemicalCostForVisit(visit);
    const allocatedFuelCost = roundMoney(((plan?.fuelGallons || 0) * ESTIMATED_GAS_PRICE) / Math.max(plan?.totalPools || 1, 1));
    const directExpenseCost = roundMoney(
      expensesToday
        .filter((expense) => expense.poolId && expense.poolId === visit.poolId)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    );
    const sharedEmployeeExpenseCost = roundMoney(
      expensesToday
        .filter((expense) => expense.employeeId === visit.employeeId && !expense.poolId)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0) / completedCount,
    );
    const totalExpense = roundMoney(
      laborCost + chemicalCost + allocatedFuelCost + directExpenseCost + sharedEmployeeExpenseCost,
    );

    return {
      visitId: visit.id,
      employeeId: visit.employeeId,
      employeeName: employee?.name || "Unknown",
      poolId: visit.poolId,
      customerName: pool?.customerName || "Pool",
      categoryCosts: {
        labor: laborCost,
        chemicals: chemicalCost,
        fuel: allocatedFuelCost,
        direct: directExpenseCost,
        shared: sharedEmployeeExpenseCost,
      },
      durationMinutes,
      totalExpense,
      chlorineReading: Number.isFinite(Number(visit.waterSample?.chlorine)) ? Number(visit.waterSample.chlorine) : null,
      chlorineStatus: chlorineLabel(visit.waterSample?.chlorine),
      chemicalItems: visit.chemicalsUsed || [],
    };
  });
}

function parseWorkflowServiceDays(value, serviceDate) {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  }
  if (typeof value === "string" && value.trim()) {
    return uniqueStrings(
      value
        .split(/[,\s]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return serviceDate ? [getWeekdayLabel(serviceDate)] : [];
}

function workflowItemIdForRecord(record) {
  return `workflow-${slugify(record.sourceType)}-${slugify(record.externalId || `${record.poolKey}-${record.serviceDate}`)}`;
}

function normalizeWorkflowRecord(row, fallbackSource = {}) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const lat = Number(row.lat ?? row.latitude);
  const lon = Number(row.lon ?? row.lng ?? row.longitude);
  const customerName = String(row.customerName ?? row.customer_name ?? row.name ?? "").trim();
  const address = String(row.address ?? "").trim();

  if (!customerName || !address || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const serviceDate = isoDateOnly(
    row.serviceDate ?? row.service_date ?? row.scheduledDate ?? row.scheduled_date ?? row.date ?? new Date().toISOString(),
  );
  const sourceType = fallbackSource.sourceType || sanitizeWorkflowSourceType(fallbackSource.sourceType);
  const poolExternalId = String(row.poolExternalId ?? row.pool_external_id ?? row.customer_id ?? "").trim();
  const externalId = String(row.externalId ?? row.external_id ?? row.work_order_id ?? row.id ?? "").trim();
  const serviceDays = parseWorkflowServiceDays(row.serviceDays ?? row.service_days, row.serviceDate ? serviceDate : "");

  return {
    sourceType: sourceType || "json-url",
    sourceName: fallbackSource.sourceName || "Workflow source",
    externalId,
    poolExternalId,
    customerName,
    address,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    neighborhood: String(row.neighborhood ?? row.market ?? "").trim(),
    gallons: Number(row.gallons ?? 0) || 15000,
    serviceMinutes: Math.max(20, Number(row.serviceMinutes ?? row.service_minutes ?? 40) || 40),
    serviceDate,
    serviceDays,
    priority: normalizePriority(row.priority),
    status: normalizeWorkflowStatus(row.status),
    notes: String(row.notes ?? row.remarks ?? "").trim(),
    workflowLabel: String(row.workflowLabel ?? row.workflow_label ?? row.job_type ?? row.service_type ?? "Service workflow").trim(),
    poolKey: poolExternalId || `${customerName}-${address}`,
  };
}

function findPoolForWorkflowRecord(db, record) {
  return (
    db.pools.find((pool) => pool.externalRefs?.workflowPoolId && pool.externalRefs.workflowPoolId === record.poolExternalId) ||
    db.pools.find(
      (pool) =>
        pool.customerName.toLowerCase() === record.customerName.toLowerCase() &&
        pool.address.toLowerCase() === record.address.toLowerCase(),
    ) ||
    null
  );
}

function ensurePoolFromWorkflowRecord(db, record, importedAt) {
  const existing = findPoolForWorkflowRecord(db, record);
  const serviceDays = record.serviceDays.length ? record.serviceDays : existing?.serviceDays || [];

  if (existing) {
    Object.assign(existing, {
      customerName: existing.customerName || record.customerName,
      address: existing.address || record.address,
      lat: Number.isFinite(record.lat) ? record.lat : existing.lat,
      lon: Number.isFinite(record.lon) ? record.lon : existing.lon,
      neighborhood: record.neighborhood || existing.neighborhood,
      gallons: Number(record.gallons || existing.gallons || 0) || existing.gallons,
      priority:
        priorityRank(record.priority) > priorityRank(existing.priority) ? record.priority : existing.priority,
      serviceMinutes: Math.max(Number(existing.serviceMinutes || 0), Number(record.serviceMinutes || 0)) || existing.serviceMinutes,
      serviceDays,
      notes: existing.notes || record.notes,
      externalRefs: {
        ...(existing.externalRefs || {}),
        workflowPoolId: record.poolExternalId || existing.externalRefs?.workflowPoolId || "",
      },
      importedFromWorkflowAt: importedAt,
    });
    return { pool: existing, created: false };
  }

  const pool = {
    id: `pool-${slugify(record.customerName)}-${slugify(record.address).slice(0, 18)}`,
    customerName: record.customerName,
    address: record.address,
    lat: record.lat,
    lon: record.lon,
    neighborhood: record.neighborhood || "Imported workflow",
    gallons: record.gallons,
    serviceMinutes: record.serviceMinutes,
    serviceDays,
    priority: record.priority,
    equipment: [],
    gateCode: "",
    notes: record.notes || "Imported from connected workflow source.",
    chemicalProfile: { chlorineTarget: "2.5-4.0", phTarget: "7.4-7.6" },
    externalRefs: { workflowPoolId: record.poolExternalId || "" },
    importedFromWorkflowAt: importedAt,
  };
  db.pools.push(pool);
  return { pool, created: true };
}

function applyWorkflowSync(db, rows, sourceInput = {}) {
  const sourceType = sourceInput.sourceType || "json-url";
  const sourceName = sourceInput.sourceName || "Workflow source";
  const importedAt = new Date().toISOString();
  const existingItems = new Map((db.workflowItems || []).map((item) => [item.id, item]));
  const touchedDates = new Set();
  let importedCount = 0;
  let createdPools = 0;
  let updatedPools = 0;

  rows.forEach((row) => {
    const record = normalizeWorkflowRecord(row, { sourceType, sourceName });
    if (!record) {
      return;
    }

    const ensured = ensurePoolFromWorkflowRecord(db, record, importedAt);
    if (ensured.created) {
      createdPools += 1;
    } else {
      updatedPools += 1;
    }

    const itemId = workflowItemIdForRecord(record);
    const current = existingItems.get(itemId) || {};
    existingItems.set(itemId, {
      ...current,
      id: itemId,
      externalId: record.externalId,
      sourceType,
      sourceName,
      poolId: ensured.pool.id,
      serviceDate: record.serviceDate,
      priority: record.priority,
      serviceMinutes: record.serviceMinutes,
      status: record.status,
      workflowLabel: record.workflowLabel,
      notes: record.notes,
      importedAt,
      updatedAt: importedAt,
    });
    touchedDates.add(record.serviceDate);
    importedCount += 1;
  });

  db.workflowItems = Array.from(existingItems.values()).sort((a, b) =>
    `${a.serviceDate}${a.id}`.localeCompare(`${b.serviceDate}${b.id}`),
  );
  db.integrations.workflow = {
    ...(db.integrations.workflow || {}),
    sourceType,
    sourceName,
    connected: true,
    lastSyncAt: importedAt,
    lastSyncCount: importedCount,
    lastError: "",
  };

  return { importedCount, createdPools, updatedPools, importedAt, touchedDates: Array.from(touchedDates) };
}

function buildWorkflowHub(db, date, routePlans, viewer) {
  const selectedDate = isoDateOnly(date);
  const visiblePoolIds = getAccessiblePoolIds(db, viewer, routePlans);
  const poolsById = poolLookupMap(db);

  const items = (db.workflowItems || [])
    .filter(
      (item) =>
        item.serviceDate === selectedDate && (!visiblePoolIds || visiblePoolIds.has(item.poolId)),
    )
    .map((item) => {
      const pool = poolsById.get(item.poolId);
      return {
        ...item,
        customerName: pool?.customerName || "Imported pool",
        address: pool?.address || "",
        neighborhood: pool?.neighborhood || "",
      };
    })
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.customerName.localeCompare(b.customerName));

  return {
    totalOpen: items.filter((item) => item.status !== "completed").length,
    items: items.slice(0, 12),
  };
}

function buildRecommendations(db, date, routePlans, viewer) {
  const selectedDate = isoDateOnly(date);
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visitsToday = db.visits.filter(
    (visit) => visit.date === selectedDate && accessibleEmployeeIds.has(visit.employeeId),
  );
  const workflowBacklog = buildWorkflowHub(db, selectedDate, routePlans, viewer).items
    .filter((item) => item.status !== "completed")
    .slice(0, 2)
    .map((item) => `${item.customerName} has ${item.workflowLabel.toLowerCase()} queued from ${item.sourceName}.`);
  const salesStalls = buildSalesHub(db, selectedDate, viewer).leads
    .filter((lead) => ["submitted", "contacted"].includes(lead.stage))
    .slice(0, 2)
    .map((lead) => `${lead.employeeName} has ${lead.type.replaceAll("-", " ")} pending at ${lead.customerName}.`);

  const chemistryAlerts = visitsToday
    .map((visit) => ({ visit, issues: waterStatus(visit.waterSample) }))
    .filter((item) => item.issues.length)
    .map((item) => {
      const employee = db.employees.find((entry) => entry.id === item.visit.employeeId);
      const pool = db.pools.find((entry) => entry.id === item.visit.poolId);
      return `${pool?.customerName || "Pool"} flagged ${item.issues.join(" and ")} by ${
        employee?.name || "a technician"
      }.`;
    });

  const overloadedRoutes = routePlans
    .filter((plan) => plan.capacityUse > 1)
    .map(
      (plan) =>
        `${plan.employeeName} is over capacity at ${Math.round(plan.capacityUse * 100)}% for ${selectedDate}.`,
    );

  const stalePools = db.pools
    .map((pool) => ({ pool, latestVisit: collectLatestVisits(db.visits, pool.id)[0] || null }))
    .filter((item) => !item.latestVisit || item.latestVisit.date !== selectedDate)
    .slice(0, 3)
    .map((item) => `${item.pool.customerName} has no completed visit logged for ${selectedDate}.`);

  return [...chemistryAlerts, ...overloadedRoutes, ...workflowBacklog, ...salesStalls, ...stalePools].slice(0, 6);
}

function buildPayrollHub(db, date, viewer) {
  const selectedDate = isoDateOnly(date);
  const accessibleEmployees = getAccessibleEmployees(db, viewer);
  const visitsToday = db.visits.filter((visit) => visit.date === selectedDate);
  const salesHub = buildSalesHub(db, selectedDate, viewer);
  const leaderboardByEmployee = new Map(salesHub.leaderboard.map((item) => [item.employeeId, item]));

  const employees = accessibleEmployees.map((employee) => {
    const dayHours = visitsToday
      .filter((visit) => visit.employeeId === employee.id)
      .reduce((sum, visit) => sum + asMinutes(visit.arrivalAt, visit.departureAt) / 60, 0);
    const sales = leaderboardByEmployee.get(employee.id) || null;
    const projectedGross = Number((dayHours * Number(employee.payroll.hourlyRate || 0)).toFixed(2));
    const projectedBonus = roundMoney(sales?.projectedBonus || 0);

    return {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      avatarUrl: employee.avatarUrl,
      payType: employee.payroll.payType,
      hourlyRate: employee.payroll.hourlyRate,
      overtimeRate: employee.payroll.overtimeRate,
      nextPayDate: employee.payroll.nextPayDate,
      bankLast4: employee.payroll.bankLast4,
      ytdGross: employee.payroll.ytdGross,
      ytdHours: employee.payroll.ytdHours,
      projectedGross,
      projectedBonus,
      projectedGrossWithSales: roundMoney(projectedGross + projectedBonus),
      dayHours: Number(dayHours.toFixed(2)),
      salesSubmitted: sales?.submittedCount || 0,
      salesWon: sales?.wonCount || 0,
      payStubs: employee.payroll.payStubs,
    };
  });

  return {
    isManagerView: isManager(viewer),
    totalProjectedGross: Number(employees.reduce((sum, employee) => sum + employee.projectedGross, 0).toFixed(2)),
    totalProjectedBonus: roundMoney(employees.reduce((sum, employee) => sum + employee.projectedBonus, 0)),
    employees,
  };
}

function buildExpenseHub(db, date, viewer, routePlans) {
  const selectedDate = isoDateOnly(date);
  const expenses = getAccessibleExpenses(db, selectedDate, viewer);
  const visitEconomics = buildVisitEconomics(db, selectedDate, viewer, routePlans);
  const categoryTotals = new Map(TYPICAL_EXPENSE_CATEGORIES.map((category) => [category, 0]));

  expenses.forEach((expense) => {
    const category = normalizeExpenseCategory(expense.category);
    categoryTotals.set(category, roundMoney((categoryTotals.get(category) || 0) + Number(expense.amount || 0)));
  });

  visitEconomics.forEach((item) => {
    categoryTotals.set("fuel", roundMoney((categoryTotals.get("fuel") || 0) + item.categoryCosts.fuel));
    const chlorineCost = item.chemicalItems
      .filter((chemical) => String(chemical.product || "").toLowerCase().includes("chlorine"))
      .reduce((sum, chemical) => sum + Number(chemical.cost || 0), 0);
    if (chlorineCost > 0) {
      categoryTotals.set("liquid chlorine", roundMoney((categoryTotals.get("liquid chlorine") || 0) + chlorineCost));
    }
  });

  const totalExpense = roundMoney(
    expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0) +
      visitEconomics.reduce(
        (sum, item) => sum + item.categoryCosts.labor + item.categoryCosts.chemicals + item.categoryCosts.fuel,
        0,
      ),
  );

  const employeeOutput = Array.from(
    visitEconomics.reduce((map, item) => {
      const current = map.get(item.employeeId) || {
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        jobsCompleted: 0,
        chlorineBalanced: 0,
        totalExpense: 0,
        laborCost: 0,
        chemicalCost: 0,
        fuelCost: 0,
      };
      current.jobsCompleted += 1;
      current.totalExpense = roundMoney(current.totalExpense + item.totalExpense);
      current.laborCost = roundMoney(current.laborCost + item.categoryCosts.labor);
      current.chemicalCost = roundMoney(current.chemicalCost + item.categoryCosts.chemicals);
      current.fuelCost = roundMoney(current.fuelCost + item.categoryCosts.fuel);
      current.chlorineBalanced += item.chlorineStatus === "balanced" ? 1 : 0;
      map.set(item.employeeId, current);
      return map;
    }, new Map()).values(),
  ).map((item) => ({
    ...item,
    costPerJob: roundMoney(item.totalExpense / Math.max(item.jobsCompleted, 1)),
    balancedChlorineRate: Number((item.chlorineBalanced / Math.max(item.jobsCompleted, 1)).toFixed(2)),
  }));

  const chlorineReadings = visitEconomics
    .map((item) => item.chlorineReading)
    .filter((value) => Number.isFinite(value));

  return {
    totalExpense,
    averageCostPerJob: roundMoney(
      visitEconomics.reduce((sum, item) => sum + item.totalExpense, 0) / Math.max(visitEconomics.length, 1),
    ),
    averageChlorine: chlorineReadings.length
      ? Number((chlorineReadings.reduce((sum, value) => sum + value, 0) / chlorineReadings.length).toFixed(1))
      : null,
    lowChlorineJobs: visitEconomics.filter((item) => item.chlorineStatus === "low").length,
    jobEconomics: visitEconomics
      .slice()
      .sort((a, b) => b.totalExpense - a.totalExpense)
      .slice(0, 10),
    categoryTotals: Array.from(categoryTotals.entries())
      .map(([category, total]) => ({ category, total: roundMoney(total) }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    employeeOutput: employeeOutput.sort((a, b) => b.jobsCompleted - a.jobsCompleted || a.employeeName.localeCompare(b.employeeName)),
    typicalCategories: TYPICAL_EXPENSE_CATEGORIES,
  };
}

function getAccessibleSalesLeads(db, viewer) {
  if (isManager(viewer) || !viewer) {
    return db.salesLeads || [];
  }
  return (db.salesLeads || []).filter((lead) => lead.employeeId === viewer.employeeId);
}

function buildSalesHub(db, date, viewer) {
  const selectedDate = isoDateOnly(date);
  const employeeMap = new Map(db.employees.map((employee) => [employee.id, employee]));
  const poolMap = poolLookupMap(db);
  const leads = getAccessibleSalesLeads(db, viewer)
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    .map((lead) => ({
      ...lead,
      employeeName: employeeMap.get(lead.employeeId)?.name || "Unknown",
      poolName: lead.poolId ? poolMap.get(lead.poolId)?.customerName || "" : "",
      payoutEstimate: roundMoney(lead.payoutEstimate || salesPayoutEstimate(lead.type, lead.estimatedValue)),
    }));

  const monthWindow = monthKey(selectedDate);
  const wonThisMonth = leads.filter((lead) => lead.stage === "won" && monthKey(lead.closedAt || lead.updatedAt || lead.createdAt) === monthWindow);
  const leaderboard = Array.from(
    leads.reduce((map, lead) => {
      const current = map.get(lead.employeeId) || {
        employeeId: lead.employeeId,
        employeeName: lead.employeeName,
        submittedCount: 0,
        wonCount: 0,
        openCount: 0,
        quotedValue: 0,
        wonValue: 0,
        projectedBonus: 0,
      };
      current.submittedCount += 1;
      if (lead.stage === "won") {
        current.wonCount += 1;
        current.wonValue = roundMoney(current.wonValue + Number(lead.estimatedValue || 0));
        current.projectedBonus = roundMoney(current.projectedBonus + Number(lead.payoutEstimate || 0));
      } else if (!["lost"].includes(lead.stage)) {
        current.openCount += 1;
        current.quotedValue = roundMoney(current.quotedValue + Number(lead.estimatedValue || 0));
      }
      map.set(lead.employeeId, current);
      return map;
    }, new Map()).values(),
  ).sort((a, b) => b.wonValue - a.wonValue || b.submittedCount - a.submittedCount);

  return {
    totalOpen: leads.filter((lead) => !["won", "lost"].includes(lead.stage)).length,
    openPipelineValue: roundMoney(
      leads
        .filter((lead) => !["won", "lost"].includes(lead.stage))
        .reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0),
    ),
    wonValueMonth: roundMoney(wonThisMonth.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0)),
    projectedBonusMonth: roundMoney(wonThisMonth.reduce((sum, lead) => sum + Number(lead.payoutEstimate || 0), 0)),
    stageCounts: SALES_PIPELINE_STAGES.map((stage) => ({
      stage,
      count: leads.filter((lead) => lead.stage === stage).length,
    })),
    leads: leads.slice(0, 12),
    leaderboard,
    types: SALES_TYPES,
    stages: SALES_PIPELINE_STAGES,
  };
}

function buildCustomerHub(db, date, viewer) {
  const selectedDate = isoDateOnly(date);
  const visiblePoolIds = getAccessiblePoolIds(db, viewer, []);
  const poolMap = poolLookupMap(db);
  const employeeMap = new Map(db.employees.map((employee) => [employee.id, employee]));
  const requests = (db.customerRequests || [])
    .filter((item) => !visiblePoolIds || visiblePoolIds.has(item.poolId))
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    .map((item) => {
      const pool = poolMap.get(item.poolId);
      const latestVisit = pool ? collectLatestVisits(db.visits, pool.id)[0] || null : null;
      const latestEmployee = latestVisit ? employeeMap.get(latestVisit.employeeId) || null : null;
      return {
        ...item,
        type: normalizeCustomerRequestType(item.type),
        status: normalizeCustomerRequestStatus(item.status),
        poolName: pool?.customerName || "Pool account",
        address: pool?.address || "",
        neighborhood: pool?.neighborhood || "",
        latestVisitAt: latestVisit?.departureAt || null,
        latestTechName: latestEmployee?.name || "",
      };
    });

  const recentVisits = db.visits
    .filter((visit) => !visiblePoolIds || visiblePoolIds.has(visit.poolId))
    .slice()
    .sort((a, b) => b.departureAt.localeCompare(a.departureAt))
    .slice(0, 6)
    .map((visit) => ({
      ...visit,
      poolName: poolMap.get(visit.poolId)?.customerName || "Pool account",
      employeeName: employeeMap.get(visit.employeeId)?.name || "Technician",
      issues: waterStatus(visit.waterSample),
      durationMinutes: asMinutes(visit.arrivalAt, visit.departureAt),
    }));

  const poolSummaries = buildPoolSnapshots(db, viewer, [])
    .slice(0, 6)
    .map((pool) => ({
      ...pool,
      nextServiceDays: Array.isArray(pool.serviceDays) ? pool.serviceDays.join(" / ") : "",
    }));

  return {
    totalOpen: requests.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    requestTypes: CUSTOMER_REQUEST_TYPES,
    requestStatuses: CUSTOMER_REQUEST_STATUSES,
    requests: requests.slice(0, 12),
    pools: poolSummaries,
    recentVisits,
    nextServiceDate: selectedDate,
  };
}

function buildIntegrationStatus(db) {
  const routingState = getRoutingProviderState();
  const qboConfig = getQuickBooksConnectionConfig();
  const qbo = db.integrations.quickbooks;
  const workflow = getWorkflowConnectionState(db.integrations.workflow);

  return {
    routing: {
      provider: routingState.provider,
      profile: routingState.profile,
      mode: routingState.mode,
      configured: routingState.configured,
      lastPlannedAt: db.integrations.routing.lastPlannedAt || null,
    },
    quickbooks: {
      configured: Boolean(qboConfig.clientId && qboConfig.clientSecret && qboConfig.redirectUri),
      connected: Boolean(qbo.connected),
      environment: qboConfig.environment,
      companyName: qbo.companyName || "",
      companyLegalName: qbo.companyLegalName || "",
      lastSyncAt: qbo.lastSyncAt || null,
    },
    workflow: {
      configured: workflow.configured,
      connected: workflow.connected,
      sourceType: workflow.sourceType,
      sourceName: workflow.sourceName,
      lastSyncAt: workflow.lastSyncAt,
      lastSyncCount: workflow.lastSyncCount,
      lastError: workflow.lastError,
      queryTemplate: workflow.queryTemplate,
    },
  };
}

function buildLiveTracking(db, viewer) {
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const positions = (db.liveTracking?.positions || [])
    .filter((item) => accessibleEmployeeIds.has(item.employeeId))
    .map((item) => {
      const employee = db.employees.find((entry) => entry.id === item.employeeId);
      return {
        ...item,
        employeeName: employee?.name || "Unknown",
        avatarUrl: employee?.avatarUrl || "",
      };
    });

  const history = (db.liveTracking?.history || [])
    .filter((item) => accessibleEmployeeIds.has(item.employeeId))
    .slice(-300);

  return {
    lastUpdatedAt: positions
      .map((item) => item.recordedAt)
      .sort()
      .pop() || null,
    positions,
    history,
  };
}

function buildDashboard(db, date, routePlans, viewer) {
  const selectedDate = isoDateOnly(date);
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visitsToday = db.visits.filter(
    (visit) => accessibleEmployeeIds.has(visit.employeeId) && visit.date === selectedDate,
  );
  const duePools = getDuePools(db, selectedDate);
  const totalDriveMinutes = routePlans.reduce((sum, plan) => sum + plan.driveMinutes, 0);
  const totalServiceMinutes = routePlans.reduce((sum, plan) => sum + plan.serviceMinutes, 0);
  const totalMiles = routePlans.reduce((sum, plan) => sum + plan.totalMiles, 0);
  const totalFuelGallons = routePlans.reduce((sum, plan) => sum + plan.fuelGallons, 0);
  const workflowToday = buildWorkflowHub(db, selectedDate, routePlans, viewer);
  const expenseHub = buildExpenseHub(db, selectedDate, viewer, routePlans);
  const salesHub = buildSalesHub(db, selectedDate, viewer);
  const avgServiceTime = visitsToday.length
    ? Math.round(
        visitsToday.reduce((sum, visit) => sum + asMinutes(visit.arrivalAt, visit.departureAt), 0) /
          visitsToday.length,
      )
    : 0;

  return {
    date: selectedDate,
    totalPoolsDue: isManager(viewer) ? duePools.length : routePlans.reduce((sum, plan) => sum + plan.totalPools, 0),
    completedPools: visitsToday.length,
    activeEmployees: getAccessibleEmployees(db, viewer).filter((employee) => employee.status === "active").length,
    routeMiles: Number(totalMiles.toFixed(1)),
    fuelGallons: Number(totalFuelGallons.toFixed(1)),
    gasBurnCost: Number((totalFuelGallons * ESTIMATED_GAS_PRICE).toFixed(2)),
    avgServiceMinutes: avgServiceTime,
    driveTimeHours: Number((totalDriveMinutes / 60).toFixed(1)),
    serviceTimeHours: Number((totalServiceMinutes / 60).toFixed(1)),
    completionRate:
      (isManager(viewer) ? duePools.length : routePlans.reduce((sum, plan) => sum + plan.totalPools, 0)) > 0
        ? Number(
            (
              visitsToday.length /
              Math.max(isManager(viewer) ? duePools.length : routePlans.reduce((sum, plan) => sum + plan.totalPools, 0), 1)
            ).toFixed(2),
          )
        : 0,
    chemistryAlerts: visitsToday.filter((visit) => waterStatus(visit.waterSample).length).length,
    recommendationCount: visitsToday.filter((visit) => visit.recommendations).length,
    workflowOpen: workflowToday.totalOpen,
    averageChlorine: expenseHub.averageChlorine,
    lowChlorineJobs: expenseHub.lowChlorineJobs,
    totalOperatingExpense: expenseHub.totalExpense,
    averageCostPerJob: expenseHub.averageCostPerJob,
    salesOpen: salesHub.totalOpen,
    salesPipelineValue: salesHub.openPipelineValue,
    salesWonValueMonth: salesHub.wonValueMonth,
    salesProjectedBonusMonth: salesHub.projectedBonusMonth,
  };
}

function buildOverview(db, date, viewer) {
  const selectedDate = isoDateOnly(date);
  const routePlans = getAccessibleRoutePlans(db, selectedDate, viewer).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName),
  );
  const accessibleEmployeeIds = new Set(getAccessibleEmployees(db, viewer).map((employee) => employee.id));
  const visitEconomics = buildVisitEconomics(db, selectedDate, viewer, routePlans);
  const visitEconomicsById = new Map(visitEconomics.map((item) => [item.visitId, item]));
  const recentVisits = db.visits
    .filter((visit) => accessibleEmployeeIds.has(visit.employeeId))
    .slice()
    .sort((a, b) => b.departureAt.localeCompare(a.departureAt))
    .slice(0, 10)
    .map((visit) => ({
      ...visit,
      employeeName: db.employees.find((employee) => employee.id === visit.employeeId)?.name || "Unknown",
      customerName: db.pools.find((pool) => pool.id === visit.poolId)?.customerName || "Unknown pool",
      issues: waterStatus(visit.waterSample),
      durationMinutes: asMinutes(visit.arrivalAt, visit.departureAt),
      economics: visitEconomicsById.get(visit.id) || null,
    }));

  return {
    viewer: sanitizeViewer(db, viewer),
    company: db.company,
    integrations: buildIntegrationStatus(db),
    liveTracking: buildLiveTracking(db, viewer),
    dashboard: buildDashboard(db, selectedDate, routePlans, viewer),
    routePlans,
    employees: buildEmployeeSnapshots(db, selectedDate, routePlans, viewer),
    pools: buildPoolSnapshots(db, viewer, routePlans),
    recentVisits,
    quickbooks: buildQuickBooksExport(db, selectedDate, viewer),
    expenseHub: buildExpenseHub(db, selectedDate, viewer, routePlans),
    salesHub: buildSalesHub(db, selectedDate, viewer),
    customerHub: buildCustomerHub(db, selectedDate, viewer),
    workflowHub: buildWorkflowHub(db, selectedDate, routePlans, viewer),
    recommendations: buildRecommendations(db, selectedDate, routePlans, viewer),
    payrollHub: buildPayrollHub(db, selectedDate, viewer),
  };
}

function findSuggestedServiceDate(db, startDate = new Date().toISOString()) {
  const base = isoDateOnly(startDate);
  let bestDate = base;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let offset = -3; offset <= 10; offset += 1) {
    const candidate = dateShift(base, offset);
    const duePools = getDuePools(db, candidate).length;
    const visits = (db.visits || []).filter((visit) => visit.date === candidate).length;
    const expenses = (db.expenses || []).filter((expense) => expense.date === candidate).length;
    const score = visits * 25 + duePools * 10 + expenses * 5 - Math.abs(offset) * 2;

    if (score > bestScore) {
      bestScore = score;
      bestDate = candidate;
    }
  }

  return bestScore > 0 ? bestDate : base;
}

function findUserByEmail(db, email) {
  return db.auth.users.find((user) => user.email.toLowerCase() === String(email || "").trim().toLowerCase()) || null;
}

function findUserById(db, userId) {
  return db.auth.users.find((user) => user.id === userId) || null;
}

function pruneExpiredSessions(db) {
  const now = Date.now();
  db.auth.sessions = db.auth.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
  db.auth.oauthStates = db.auth.oauthStates.filter((item) => new Date(item.expiresAt).getTime() > now);
}

module.exports = {
  DB_FILE,
  DATABASE_URL,
  applyWorkflowSync,
  asMinutes,
  buildOverview,
  buildQuickBooksExport,
  buildRoutePlansForDate,
  ensureDb,
  ensureRoutePlansForDate,
  findUserByEmail,
  findUserById,
  getAccessibleEmployees,
  getDuePools,
  findSuggestedServiceDate,
  getViewerEmployee,
  haversineMiles,
  isoDateOnly,
  isManager,
  loadDb,
  pruneExpiredSessions,
  sanitizeViewer,
  saveDb,
  waterStatus,
};
