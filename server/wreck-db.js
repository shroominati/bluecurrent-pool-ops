const fs = require("fs");
const path = require("path");

const DB_FILE =
  process.env.WRECK_DB_FILE ||
  path.join(process.cwd(), "data", "wreck-research-db.json");

const REQUIRED_ZONES = [
  {
    id: "zone-indian-key-hawk-channel",
    name: "Indian Key / Hawk Channel Line",
    lat: 24.8825,
    lon: -80.615,
    regionKey: "keys",
    areaTags: ["keys", "upper-keys", "indian-key", "islamorada", "hawk-channel"],
    driftRetention: 0.61,
    seabedRetention: 0.66,
    surveyGap: 0.41,
    legalSensitivity: "high",
    searchNote:
      "Upper Keys historical wreck line centered on the 1733 fleet pattern around Indian Key and Hawk Channel.",
  },
  {
    id: "zone-marquesas-tortugas-line",
    name: "Marquesas to Dry Tortugas Line",
    lat: 24.66,
    lon: -82.58,
    regionKey: "keys",
    areaTags: ["keys", "lower-keys", "quicksands", "key-west", "dry-tortugas"],
    driftRetention: 0.58,
    seabedRetention: 0.62,
    surveyGap: 0.74,
    legalSensitivity: "high",
    searchNote:
      "Lower Keys and Tortugas historical loss line tied to the 1622 galleons and deep shoal-scatter patterns.",
  },
  {
    id: "zone-sebastian-ledges",
    name: "Sebastian Ledge Corridor",
    lat: 27.821,
    lon: -80.3905,
    regionKey: "treasure-coast",
    areaTags: ["treasure-coast", "sebastian", "vero", "fort-pierce"],
    driftRetention: 0.78,
    seabedRetention: 0.72,
    surveyGap: 0.44,
    legalSensitivity: "high",
    searchNote:
      "Treasure Coast corridor where reef impact, littoral drift, and heavy fleet-loss reporting overlap.",
  },
  {
    id: "zone-fort-pierce-shoals",
    name: "Fort Pierce Shoal Cluster",
    lat: 27.4978,
    lon: -80.272,
    regionKey: "treasure-coast",
    areaTags: ["treasure-coast", "fort-pierce", "vero"],
    driftRetention: 0.69,
    seabedRetention: 0.64,
    surveyGap: 0.67,
    legalSensitivity: "high",
    searchNote:
      "Treasure Coast extension with charted wreck density and lower public attention than the Sebastian cluster.",
  },
  {
    id: "zone-canaveral-shelf",
    name: "Cape Canaveral Shoal Shelf",
    lat: 28.5332,
    lon: -80.3789,
    regionKey: "space-coast",
    areaTags: ["canaveral", "cape", "space-coast"],
    driftRetention: 0.66,
    seabedRetention: 0.69,
    surveyGap: 0.61,
    legalSensitivity: "medium",
    searchNote:
      "Space Coast corridor with strong current set, shoal interaction, and repeated weather-driven losses.",
  },
  {
    id: "zone-cocoa-reef-line",
    name: "Cocoa Reef Transit Line",
    lat: 28.3314,
    lon: -80.4521,
    regionKey: "space-coast",
    areaTags: ["space-coast", "canaveral", "cape"],
    driftRetention: 0.63,
    seabedRetention: 0.58,
    surveyGap: 0.71,
    legalSensitivity: "medium",
    searchNote:
      "Space Coast transit lane where storm tracks, shallows, and lesser-known charted hazards converge.",
  },
  {
    id: "zone-melbourne-breach",
    name: "Melbourne Beach Extension",
    lat: 28.0415,
    lon: -80.5175,
    regionKey: "space-coast",
    areaTags: ["space-coast", "melbourne", "cape", "canaveral", "brevard"],
    driftRetention: 0.79,
    seabedRetention: 0.74,
    surveyGap: 0.81,
    legalSensitivity: "medium",
    searchNote:
      "Southern Brevard extension supported by recent reporting and a published missing-vessel argument, but still weaker than the core Sebastian-Vero-Fort Pierce belt.",
  },
  {
    id: "zone-daytona-ponce-shelf",
    name: "Daytona / Ponce Shelf Corridor",
    lat: 29.1308,
    lon: -80.8953,
    regionKey: "daytona-coast",
    areaTags: ["daytona-coast", "daytona", "ponce", "volusia", "new-smyrna"],
    driftRetention: 0.64,
    seabedRetention: 0.57,
    surveyGap: 0.72,
    legalSensitivity: "medium",
    searchNote:
      "Volusia shelf corridor where inlet bars, storm transport, and shelf-edge gaps create a northern comparison zone up toward Daytona.",
  },
];

const LAND_FIND_ZONES = [
  {
    id: "land-indian-key-littoral",
    name: "Indian Key Strand",
    lat: 24.8392,
    lon: -80.7096,
    regionKey: "keys",
    areaTags: ["keys", "upper-keys", "indian-key", "islamorada", "hawk-channel"],
    beachRetention: 0.44,
    duneRetention: 0.38,
    stormWashover: 0.53,
    renourishmentRisk: 0.14,
    publicAccess: 0.18,
    terrainSignals: ["storm wrack edges", "shallow berm pockets", "coral-rubble lag"],
    searchNote:
      "Upper Keys shoreline context tied to the 1733 fleet, useful as a protected historical reference rather than a practical first-search beach.",
  },
  {
    id: "land-sebastian-wabasso",
    name: "Sebastian Inlet to Wabasso",
    lat: 27.8512,
    lon: -80.4296,
    regionKey: "treasure-coast",
    areaTags: ["treasure-coast", "sebastian", "wabasso", "vero"],
    beachRetention: 0.86,
    duneRetention: 0.83,
    stormWashover: 0.8,
    renourishmentRisk: 0.22,
    publicAccess: 0.74,
    terrainSignals: ["lower dune toe cuts", "post-storm wrack line pockets", "coin-line shell lag"],
    searchNote:
      "Highest-priority beach-and-surf observation corridor from Sebastian toward Wabasso, where survivor-camp history and repeated storm re-exposure are strongest.",
  },
  {
    id: "land-wabasso-vero-fort-pierce",
    name: "Wabasso - Vero - North Fort Pierce",
    lat: 27.6458,
    lon: -80.3336,
    regionKey: "treasure-coast",
    areaTags: ["treasure-coast", "wabasso", "vero", "fort-pierce"],
    beachRetention: 0.81,
    duneRetention: 0.77,
    stormWashover: 0.74,
    renourishmentRisk: 0.28,
    publicAccess: 0.69,
    terrainSignals: ["beach cusps", "scarped upper beach", "low swale pockets behind the berm"],
    searchNote:
      "Core Treasure Coast strip repeatedly producing 1715 finds, linking Wabasso, Vero, and the northern Fort Pierce sector.",
  },
  {
    id: "land-fort-pierce-north-bar",
    name: "Fort Pierce North Beach Bar",
    lat: 27.5078,
    lon: -80.2977,
    regionKey: "treasure-coast",
    areaTags: ["treasure-coast", "fort-pierce", "vero"],
    beachRetention: 0.75,
    duneRetention: 0.72,
    stormWashover: 0.7,
    renourishmentRisk: 0.33,
    publicAccess: 0.77,
    terrainSignals: ["inlet-adjacent berm breaks", "heavy-shell lag", "storm-cut dune ramps"],
    searchNote:
      "North side of Fort Pierce where the Urca de Lima field, shoal transport, and inlet reshaping support shoreline deposition.",
  },
  {
    id: "land-jupiter-breakers",
    name: "Jupiter to Palm Beach Breakers",
    lat: 26.9421,
    lon: -80.0714,
    regionKey: "treasure-coast",
    areaTags: ["jupiter", "palm-beach"],
    beachRetention: 0.52,
    duneRetention: 0.5,
    stormWashover: 0.66,
    renourishmentRisk: 0.49,
    publicAccess: 0.81,
    terrainSignals: ["narrow post-storm cuts", "berm toe shell layers", "breaker-line throw zones"],
    searchNote:
      "Secondary south-end analog corridor. Useful for storm-driven trade-loss context, but less supported than the core Sebastian-Wabasso-Fort Pierce belt.",
  },
  {
    id: "land-melbourne-washover",
    name: "Melbourne Beach / Southern Brevard",
    lat: 28.0482,
    lon: -80.5356,
    regionKey: "space-coast",
    areaTags: ["space-coast", "melbourne", "brevard", "cape", "canaveral"],
    beachRetention: 0.81,
    duneRetention: 0.79,
    stormWashover: 0.84,
    renourishmentRisk: 0.28,
    publicAccess: 0.69,
    terrainSignals: ["washover fans", "storm berm overwash pockets", "dark heavy-sand streaks"],
    searchNote:
      "Strongest Space Coast extension after the core Treasure Coast belt, supported by recent reporting and the published Melbourne proposal.",
  },
  {
    id: "land-canaveral-dunes",
    name: "Cape Canaveral Dune Shelf",
    lat: 28.4724,
    lon: -80.5368,
    regionKey: "space-coast",
    areaTags: ["space-coast", "canaveral", "cape"],
    beachRetention: 0.68,
    duneRetention: 0.71,
    stormWashover: 0.77,
    renourishmentRisk: 0.24,
    publicAccess: 0.58,
    terrainSignals: ["dune scarp bases", "storm-cut notches", "back-beach lag streaks"],
    searchNote:
      "Upper Space Coast follow-on corridor. Useful after Melbourne, but the historical support is weaker than the main Treasure Coast belt.",
  },
  {
    id: "land-cocoa-cusps",
    name: "Cocoa Beach Cusp Line",
    lat: 28.3626,
    lon: -80.6042,
    regionKey: "space-coast",
    areaTags: ["space-coast", "cape", "canaveral"],
    beachRetention: 0.71,
    duneRetention: 0.68,
    stormWashover: 0.72,
    renourishmentRisk: 0.36,
    publicAccess: 0.83,
    terrainSignals: ["cusp horns", "upper swash lag pockets", "storm wrack concentration lines"],
    searchNote:
      "Accessible Space Coast beach reach where current-set losses offshore can translate into upper-beach lag deposits after storms.",
  },
  {
    id: "land-daytona-ponce-beach",
    name: "Daytona to Ponce Beachface",
    lat: 29.1652,
    lon: -80.9632,
    regionKey: "daytona-coast",
    areaTags: ["daytona-coast", "daytona", "ponce", "volusia", "new-smyrna"],
    beachRetention: 0.73,
    duneRetention: 0.69,
    stormWashover: 0.76,
    renourishmentRisk: 0.35,
    publicAccess: 0.83,
    terrainSignals: ["bar-cut scarps", "upper swash heavy-sand pockets", "inlet-fed shell streaks"],
    searchNote:
      "Northern beach corridor around Ponce and Daytona where bar migration and storm cuts make a practical comparison zone for shoreline finds.",
  },
];

const REGION_DEFS = [
  {
    id: "keys",
    name: "Florida Keys",
    tags: ["keys", "upper-keys", "lower-keys", "indian-key", "islamorada", "key-west", "dry-tortugas"],
    center: { lat: 24.77, lon: -80.78 },
    blurb:
      "Historically major 1622 and 1733 fleet-loss zone with higher protection, deeper water, and more practical limits than the Atlantic beach belt.",
  },
  {
    id: "treasure-coast",
    name: "Treasure Coast",
    tags: ["treasure-coast", "sebastian", "vero", "fort-pierce", "jupiter", "palm-beach"],
    center: { lat: 27.45, lon: -80.2 },
    blurb:
      "Primary bullion-loss corridor centered on Sebastian, Vero, and Fort Pierce wreck fields.",
  },
  {
    id: "space-coast",
    name: "Space Coast",
    tags: ["space-coast", "cape", "canaveral", "melbourne", "brevard"],
    center: { lat: 28.48, lon: -80.38 },
    blurb:
      "Cape Canaveral and Cocoa shelf corridor where current set and shoal interaction drive losses.",
  },
  {
    id: "daytona-coast",
    name: "Daytona Coast",
    tags: ["daytona-coast", "daytona", "ponce", "volusia", "new-smyrna"],
    center: { lat: 29.15, lon: -80.96 },
    blurb:
      "Northern Atlantic comparison corridor around Ponce and Daytona where inlet bars and storm transport reshape beach and shelf targets.",
  },
];

const ALLOWED_REGION_KEYS = new Set(REGION_DEFS.map((region) => region.id));

const CURATED_REPORT_SOURCES = [
  {
    id: "report-fl-history-3d",
    name: "Florida History in 3D",
    type: "state-archive",
    status: "curated-reference",
    url: "https://floridahistoryin3d.com/history.html",
    notes: "Florida Department of State overview tying the 1715 and 1733 fleet disasters to Florida archaeology.",
  },
  {
    id: "report-nps-spanish-fleets",
    name: "NPS Teaching with Historic Places",
    type: "federal-interpretation",
    status: "curated-reference",
    url: "https://www.nps.gov/teachers/classrooms/upload/Twhp-Lessons_Spanish-Treasure-Shipwrecks2006.pdf",
    notes: "National Park Service overview of the Spanish treasure fleets of 1715 and 1733.",
  },
  {
    id: "report-museums-in-the-sea-urca",
    name: "Museums in the Sea - Urca de Lima",
    type: "wreck-site",
    status: "curated-reference",
    url: "https://museumsinthesea.com/urcadelima/history.htm",
    notes: "Best accessible public summary for the Urca de Lima wreck preserve near Fort Pierce.",
  },
  {
    id: "report-noaa-san-pedro",
    name: "NOAA FKNMS - San Pedro",
    type: "wreck-site",
    status: "curated-reference",
    url: "https://floridakeys.noaa.gov/shipwrecktrail/sanpedro.html",
    notes: "NOAA page for the San Pedro preserve with cargo and location summary.",
  },
  {
    id: "report-nps-san-pedro",
    name: "NPS - San Pedro Shipwreck",
    type: "wreck-site",
    status: "curated-reference",
    url: "https://www.nps.gov/articles/sanpedro.htm",
    notes: "National Park Service summary for the San Pedro site and 1733 fleet context.",
  },
  {
    id: "report-noaa-quicksands",
    name: "NOAA Ocean Explorer - Quicksands Context",
    type: "historical-context",
    status: "curated-reference",
    url: "https://oceanexplorer.noaa.gov/expedition-feature/21quicksands-features-context/",
    notes: "NOAA historical context for the Quicksands and Marquesas ship-graveyard zone.",
  },
  {
    id: "report-mel-fisher-1622",
    name: "Mel Fisher Museum - 1622 Galleons",
    type: "museum",
    status: "curated-reference",
    url: "https://www.melfisher.org/copy-of-1622-galleons",
    notes: "Public-facing cargo and loss summary for Atocha, Santa Margarita, and related 1622 wrecks.",
  },
  {
    id: "report-keys-history-1733",
    name: "Florida Keys History Center - 1733 Fleet",
    type: "local-history",
    status: "curated-reference",
    url: "https://www.keyslibraries.org/post/vol-11",
    notes: "Archival synthesis of the 1733 Nueva Espana flota disaster across the Upper and Middle Keys.",
  },
  {
    id: "report-fl-state-parks-mclarty",
    name: "Florida State Parks - McLarty / Sebastian Inlet",
    type: "museum",
    status: "curated-reference",
    url: "https://www.floridastateparks.org/parks-and-trails/sebastian-inlet-state-park/experiences-amenities",
    notes: "State interpretation for the 1715 fleet survivors' camp and McLarty Treasure Museum.",
  },
  {
    id: "report-1715-fleet-society-history",
    name: "1715 Fleet Society - History",
    type: "archival-summary",
    status: "curated-reference",
    url: "https://1715fleetsociety.com/history/",
    notes: "Archival interpretation of the 1715 fleet composition and broader Cape Canaveral-to-south framing.",
  },
  {
    id: "report-1715-fleet-society-glossary",
    name: "1715 Fleet Society - Glossary",
    type: "wreck-catalog",
    status: "curated-reference",
    url: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
    notes: "Modern wreck-site names, proposed identifications, and caution notes for Treasure Coast sites.",
  },
  {
    id: "report-seafarer-melbourne",
    name: "Seafarer Exploration - Melbourne Beach Proposal",
    type: "scholarly-proposal",
    status: "curated-reference",
    url: "https://seafarerexplorationcorp.com/wp-content/uploads/2018/01/Dr.-Robert-Baer-Melbourne-Beach.pdf",
    notes: "Proposal tying a Melbourne Beach scatter to a missing 1715 fleet vessel; not consensus.",
  },
  {
    id: "report-brevard-1715",
    name: "Brevard Historical Commission - 1715 Plate Fleet",
    type: "regional-history",
    status: "curated-reference",
    url: "https://www.brevardfl.gov/docs/default-source/historical-commission-docs/not-508-indian-river-journal/2011-indian-river-journal-spring-summer.pdf?sfvrsn=2abf207d_3",
    notes: "Regional framing of the 1715 storm between St. Lucie and Cape Canaveral for Space Coast context.",
  },
  {
    id: "report-pares",
    name: "PARES",
    type: "archive-portal",
    status: "curated-reference",
    url: "https://pares.cultura.gob.es/pares/en/preguntas-frecuentes.html",
    notes: "Spain's state archive portal for manifests, salvage correspondence, and Indies-trade records.",
  },
  {
    id: "report-agi",
    name: "Archivo General de Indias",
    type: "archive-portal",
    status: "curated-reference",
    url: "https://www.cultura.gob.es/cultura/areas/archivos/mc/archivos/agi/portada.html",
    notes: "Primary archive for imperial correspondence and post-wreck records tied to Spanish fleets.",
  },
];

const CURATED_REPORT_WRECKS = [
  {
    id: "wreck-urca-de-lima",
    name: "Urca de Lima / Wedge Wreck",
    year: 1715,
    lat: 27.4973,
    lon: -80.2756,
    areaTags: ["treasure-coast", "fort-pierce", "vero"],
    cargoProfile: "storeship cargo including cowhides, chocolate, vanilla, and private silver",
    cargoValueWeight: 0.82,
    causeTags: ["hurricane", "shoal", "fleet"],
    historicalNotes:
      "Best-documented 1715 wreck site near Fort Pierce; remained relatively intact and supplied the Sebastian survivors' camp.",
    sourceId: "report-museums-in-the-sea-urca",
    sourceUrl: "https://museumsinthesea.com/urcadelima/history.htm",
  },
  {
    id: "wreck-cabin-wreck",
    name: "Cabin Wreck",
    year: 1715,
    lat: 27.803,
    lon: -80.397,
    areaTags: ["treasure-coast", "sebastian", "vero"],
    cargoProfile: "proposed New Spain warship with coin profile tied to the 1715 fleet",
    cargoValueWeight: 0.76,
    causeTags: ["hurricane", "reef", "fleet"],
    historicalNotes:
      "Most plausible historically tied 1715 site south of Sebastian Inlet, but still not absolutely secure in ship-name assignment.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-corrigans-beach",
    name: "Corrigan's Beach Wreck",
    year: 1715,
    lat: 27.7102,
    lon: -80.3431,
    areaTags: ["treasure-coast", "vero", "sebastian"],
    cargoProfile: "gold and silver recovery field with disputed ship identification",
    cargoValueWeight: 0.78,
    causeTags: ["hurricane", "reef", "fleet"],
    historicalNotes:
      "Major treasure-recovery site on the Treasure Coast; current research divides identification between Ubilla's capitana and almiranta traditions.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-douglass-beach",
    name: "Douglass Beach Wreck",
    year: 1715,
    lat: 27.5415,
    lon: -80.2458,
    areaTags: ["treasure-coast", "fort-pierce", "vero"],
    cargoProfile: "major gold coin recovery site with revised vessel assignment debates",
    cargoValueWeight: 0.81,
    causeTags: ["hurricane", "shoal", "fleet"],
    historicalNotes:
      "Known historically as the Gold Wreck; the site has produced major gold recoveries but its exact vessel identity remains contested.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-rio-mar",
    name: "Rio Mar Wreck",
    year: 1715,
    lat: 27.6542,
    lon: -80.3228,
    areaTags: ["treasure-coast", "vero", "sebastian"],
    cargoProfile: "proposed Tierra Firme capitana loss with unresolved assignment",
    cargoValueWeight: 0.7,
    causeTags: ["hurricane", "current", "fleet"],
    historicalNotes:
      "Proposed identification near Vero Beach often tied to the Tierra Firme capitana, but still treated as open to debate.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-green-cabin",
    name: "Green Cabin Wreck",
    year: 1618,
    lat: 27.6214,
    lon: -80.3349,
    areaTags: ["treasure-coast", "vero"],
    cargoProfile: "1618 Honduran fleet loss; often confused with 1715 wreck sites",
    cargoValueWeight: 0.45,
    causeTags: ["reef", "fleet"],
    historicalNotes:
      "Important exclusion from the 1715 fleet. Often discussed in the same coastal salvage landscape, but not part of the 1715 disaster.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-roberts-anchor",
    name: "Anchor Wreck / Roberts",
    year: 1810,
    lat: 27.7708,
    lon: -80.3837,
    areaTags: ["treasure-coast", "sebastian", "vero"],
    cargoProfile: "1810 hurricane loss; exclusion reference in the 1715 wreck field",
    cargoValueWeight: 0.28,
    causeTags: ["hurricane", "reef"],
    historicalNotes:
      "Useful cautionary exclusion near Wabasso Beach. Not part of the 1715 fleet despite its proximity to the same salvage coast.",
    sourceId: "report-1715-fleet-society-glossary",
    sourceUrl: "https://1715fleetsociety.com/glossary-category/1715-fleet-glossary/",
  },
  {
    id: "wreck-melbourne-beach-proposal",
    name: "Melbourne Beach Shipwreck Proposal",
    year: 1715,
    lat: 28.0332,
    lon: -80.5314,
    areaTags: ["space-coast", "melbourne", "cape", "canaveral"],
    cargoProfile: "proposed missing 1715 fleet vessel on the southern Space Coast",
    cargoValueWeight: 0.61,
    causeTags: ["hurricane", "shoal", "proposal"],
    historicalNotes:
      "Scholarly proposal for a missing 1715 fleet vessel near Melbourne Beach. Valuable for Space Coast coverage, but not consensus archaeology.",
    sourceId: "report-seafarer-melbourne",
    sourceUrl: "https://seafarerexplorationcorp.com/wp-content/uploads/2018/01/Dr.-Robert-Baer-Melbourne-Beach.pdf",
  },
  {
    id: "wreck-atocha",
    name: "Nuestra Senora de Atocha",
    year: 1622,
    lat: 24.883,
    lon: -82.002,
    areaTags: ["keys", "lower-keys", "quicksands", "key-west"],
    cargoProfile: "24 tons of silver bullion, silver pesos, gold bars, copper ingots, indigo, tobacco, and cannon",
    cargoValueWeight: 1,
    causeTags: ["hurricane", "shoal", "fleet"],
    historicalNotes:
      "Best-documented 1622 treasure galleon loss west of Key West in the Quicksands area; one of Florida's defining treasure wrecks.",
    sourceId: "report-mel-fisher-1622",
    sourceUrl: "https://www.melfisher.org/copy-of-1622-galleons",
  },
  {
    id: "wreck-santa-margarita",
    name: "Santa Margarita",
    year: 1622,
    lat: 24.834,
    lon: -81.97,
    areaTags: ["keys", "lower-keys", "quicksands", "key-west"],
    cargoProfile: "1622 treasure-fleet cargo associated with silver and fleet losses in the Quicksands field",
    cargoValueWeight: 0.93,
    causeTags: ["hurricane", "shoal", "fleet"],
    historicalNotes:
      "Confirmed 1622 galleon loss in the Lower Keys disaster field, commonly treated alongside Atocha in modern archaeology and salvage history.",
    sourceId: "report-mel-fisher-1622",
    sourceUrl: "https://www.melfisher.org/copy-of-1622-galleons",
  },
  {
    id: "wreck-rosario",
    name: "Nuestra Senora del Rosario",
    year: 1622,
    lat: 24.96,
    lon: -81.85,
    areaTags: ["keys", "lower-keys", "quicksands", "key-west"],
    cargoProfile: "1622 storm loss with public summaries varying on exact modern site assignment",
    cargoValueWeight: 0.7,
    causeTags: ["hurricane", "fleet"],
    historicalNotes:
      "Confirmed loss in the 1622 storm, but public Keys summaries vary on the precise modern site assignment.",
    sourceId: "report-noaa-quicksands",
    sourceUrl: "https://oceanexplorer.noaa.gov/expedition-feature/21quicksands-features-context/",
  },
  {
    id: "wreck-deep-sea-tortugas",
    name: "Deep-Sea Tortugas Shipwreck",
    year: 1622,
    lat: 24.55,
    lon: -83.25,
    areaTags: ["keys", "dry-tortugas", "straits-of-florida"],
    cargoProfile: "scholarly proposed Spanish-operated navio from the 1622 Tierra Firme fleet",
    cargoValueWeight: 0.57,
    causeTags: ["hurricane", "deep-water", "proposal"],
    historicalNotes:
      "Important research-site extension of the 1622 picture into the Tortugas and Straits of Florida, but not an Atlantic beachside wreck.",
    sourceId: "report-noaa-quicksands",
    sourceUrl: "https://oceanexplorer.noaa.gov/expedition-feature/21quicksands-features-context/",
  },
  {
    id: "wreck-san-pedro",
    name: "San Pedro",
    year: 1733,
    lat: 24.8265,
    lon: -80.6615,
    areaTags: ["keys", "upper-keys", "indian-key"],
    cargoProfile: "16,000 pesos in Mexican silver and crates of Chinese porcelain",
    cargoValueWeight: 0.86,
    causeTags: ["hurricane", "reef", "fleet"],
    historicalNotes:
      "Best public-access example of the 1733 fleet; NOAA states the Dutch-built vessel sank in about 18 feet of water one mile south of Indian Key.",
    sourceId: "report-noaa-san-pedro",
    sourceUrl: "https://floridakeys.noaa.gov/shipwrecktrail/sanpedro.html",
    depthFeet: 18,
    depthMeters: 5.5,
  },
  {
    id: "wreck-san-felipe",
    name: "San Felipe",
    year: 1733,
    lat: 24.95,
    lon: -80.56,
    areaTags: ["keys", "upper-keys", "islamorada"],
    cargoProfile: "protected 1733 fleet site and one of the best-known wrecks in scholarship",
    cargoValueWeight: 0.74,
    causeTags: ["hurricane", "reef", "fleet"],
    historicalNotes:
      "Protected 1733 site with restricted exact location in scholarship and preservation literature.",
    sourceId: "report-keys-history-1733",
    sourceUrl: "https://www.keyslibraries.org/post/vol-11",
  },
];

const CURATED_REPORT_JOURNALS = [
  {
    id: "journal-report-1622-context",
    title: "1622 Quicksands and Lower Keys disaster frame",
    year: 1622,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-noaa-quicksands",
    verificationStatus: "curated-summary",
    areaTags: ["keys", "lower-keys", "quicksands", "key-west"],
    cargoProfile: "treasure fleet cargo and shoal-loss context",
    confidence: 0.84,
    excerpt:
      "Curated summary: NOAA and Keys heritage context treat the Quicksands and Marquesas zone as a graveyard for vessels driven onto shoals by hurricanes, anchoring the 1622 fleet in Florida's treasure-wreck history.",
  },
  {
    id: "journal-report-1715-core",
    title: "1715 fleet wreck field from Sebastian to Fort Pierce",
    year: 1715,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-fl-history-3d",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "sebastian", "vero", "fort-pierce"],
    cargoProfile: "roughly 14 million pesos in treasure and cargo",
    confidence: 0.92,
    excerpt:
      "Curated summary: the 1715 convoy left Havana on 24 July 1715 and wrecked along roughly 50 miles of coast from Sebastian Inlet to Fort Pierce Inlet, killing more than 1,000 people.",
  },
  {
    id: "journal-report-1715-space-coast-frame",
    title: "Cape Canaveral southward framing for the 1715 disaster",
    year: 1715,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-brevard-1715",
    verificationStatus: "curated-summary",
    areaTags: ["space-coast", "cape", "canaveral", "treasure-coast"],
    cargoProfile: "regional framing for fleet losses and storm impact",
    confidence: 0.71,
    excerpt:
      "Curated summary: archival and Brevard regional interpretations frame the 1715 storm from Cape Canaveral southward, useful for Space Coast coverage but not proof that all named wrecks were located near the cape.",
  },
  {
    id: "journal-report-1715-identification-caution",
    title: "Modern 1715 site nicknames are useful but not all proven",
    year: 1715,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-1715-fleet-society-history",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "sebastian", "vero", "fort-pierce", "space-coast"],
    cargoProfile: "wreck-site identification caution and archival cross-checking",
    confidence: 0.82,
    excerpt:
      "Curated summary: the broader 1715 wreck field is secure, but several exact ship-name assignments attached to modern site nicknames remain interpretive rather than proven.",
  },
  {
    id: "journal-report-melbourne-proposal",
    title: "Melbourne Beach missing-vessel proposal",
    year: 1715,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-seafarer-melbourne",
    verificationStatus: "curated-summary",
    areaTags: ["space-coast", "melbourne", "cape", "canaveral"],
    cargoProfile: "proposed 1715 fleet vessel near the southern Space Coast",
    confidence: 0.56,
    excerpt:
      "Curated summary: a Seafarer Exploration paper argues that a Melbourne Beach scatter may represent a missing 1715 fleet vessel, but it should be treated as a proposal rather than settled archaeology.",
  },
  {
    id: "journal-report-1733-san-pedro",
    title: "San Pedro as the best public 1733 fleet reference",
    year: 1733,
    sourceLabel: "Curated from florida_treasure_wrecks_keys_to_spacecoast_report.docx",
    sourceId: "report-noaa-san-pedro",
    verificationStatus: "curated-summary",
    areaTags: ["keys", "upper-keys", "indian-key"],
    cargoProfile: "16,000 pesos in Mexican silver and Chinese porcelain",
    confidence: 0.87,
    excerpt:
      "Curated summary: San Pedro is the clearest public-access 1733 treasure wreck reference, with NOAA reporting Mexican silver and Chinese porcelain at a site in about 18 feet of water south of Indian Key.",
  },
];

const CURATED_ADDENDUM_SOURCES = [
  {
    id: "addendum-noaa-aoml-1715",
    name: "NOAA AOML - 1715 Fleet Hurricane Anniversary Summary",
    type: "historical-context",
    status: "curated-reference",
    notes:
      "Cited in the search-priority addendum for the Fort Pierce-to-Wabasso wreck distribution, Sebastian survivor camps, and 1955 hurricane re-exposure.",
  },
  {
    id: "addendum-fl-dhr-law",
    name: "Florida Division of Historical Resources - Laws / FAQ",
    type: "legal-context",
    status: "curated-reference",
    notes:
      "Cited in the addendum for state ownership, permit requirements, and non-disturbance rules on state lands and submerged bottomlands.",
  },
  {
    id: "addendum-urca-brochure",
    name: "Florida Division of Historical Resources - Urca de Lima Brochure",
    type: "wreck-site",
    status: "curated-reference",
    notes:
      "Cited in the addendum for the Urca de Lima preserve as a southern archaeological anchor and first-reef reference pattern.",
  },
  {
    id: "addendum-ap-2025-melbourne-fort-pierce",
    name: "Associated Press - 2025 Treasure Coast Recoveries",
    type: "recent-reporting",
    status: "curated-reference",
    notes:
      "Cited in the addendum for modern recoveries along the Melbourne-to-Fort Pierce stretch, supporting the Melbourne extension.",
  },
];

const CURATED_ADDENDUM_JOURNALS = [
  {
    id: "journal-addendum-sebastian-wabasso",
    title: "Sebastian Inlet to Wabasso is the strongest Atlantic-side start",
    year: 2026,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "addendum-noaa-aoml-1715",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "sebastian", "wabasso", "vero", "fort-pierce"],
    cargoProfile: "1715 fleet survivor-camp and beach re-exposure context",
    confidence: 0.94,
    excerpt:
      "Curated summary: the best-supported Atlantic corridor runs from Sebastian Inlet / McLarty southward through Wabasso, with documented survivor-salvage camps and later storm erosion re-exposing artifacts.",
  },
  {
    id: "journal-addendum-wabasso-vero-fort-pierce",
    title: "Wabasso - Vero - north Fort Pierce remain the core Treasure Coast strip",
    year: 2026,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "addendum-ap-2025-melbourne-fort-pierce",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "wabasso", "vero", "fort-pierce"],
    cargoProfile: "repeated 1715 find belt and modern recovery pattern",
    confidence: 0.91,
    excerpt:
      "Curated summary: Wabasso, Vero, and the northern Fort Pierce sector remain the core repeated-find belt, with recent reporting still describing recoveries along the Melbourne-to-Fort Pierce stretch.",
  },
  {
    id: "journal-addendum-urca-reference",
    title: "Urca de Lima is the southern fixed reference for the 1715 pattern",
    year: 2026,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "addendum-urca-brochure",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "fort-pierce", "vero"],
    cargoProfile: "protected archaeological anchor showing the first-reef shallow-water pattern",
    confidence: 0.86,
    excerpt:
      "Curated summary: the Urca de Lima preserve fixes the fleet's southern distribution and reinforces the first-reef, shallow-water pattern north of Fort Pierce Inlet.",
  },
  {
    id: "journal-addendum-melbourne-extension",
    title: "Melbourne Beach is the clearest Space Coast extension",
    year: 2026,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "report-seafarer-melbourne",
    verificationStatus: "curated-summary",
    areaTags: ["space-coast", "melbourne", "brevard", "cape", "canaveral"],
    cargoProfile: "southern Brevard extension supported by modern reporting and published argument",
    confidence: 0.79,
    excerpt:
      "Curated summary: Melbourne Beach is the strongest northern extension worth testing after the core Treasure Coast belt, but remains less settled than the Sebastian-Vero-Fort Pierce zone.",
  },
  {
    id: "journal-addendum-keys-practical-limit",
    title: "Keys fleet lines are historically major but operationally lower priority",
    year: 2026,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "report-noaa-san-pedro",
    verificationStatus: "curated-summary",
    areaTags: ["keys", "upper-keys", "indian-key", "lower-keys", "quicksands", "dry-tortugas"],
    cargoProfile: "major historical loss zones with low practical search priority",
    confidence: 0.77,
    excerpt:
      "Curated summary: the 1733 Indian Key / Hawk Channel line and the 1622 Marquesas-to-Dry-Tortugas line are historically important, but protection, depth, distance, and salvage history lower their practical value as first targets.",
  },
  {
    id: "journal-addendum-1955-reexposure",
    title: "1955 hurricane re-exposure shows burial is reversible on the Treasure Coast",
    year: 1955,
    sourceLabel: "Curated from florida_treasure_wrecks_search_priority_addendum.docx",
    sourceId: "addendum-noaa-aoml-1715",
    verificationStatus: "curated-summary",
    areaTags: ["treasure-coast", "sebastian", "wabasso", "vero"],
    cargoProfile: "storm erosion and artifact re-exposure context",
    confidence: 0.88,
    excerpt:
      "Curated summary: twentieth-century hurricane erosion washed out dunes and re-exposed artifacts in the Sebastian-Wabasso belt, reinforcing the value of exposure windows after major storms.",
  },
];

function buildSeedData() {
  return {
    sources: [
      {
        id: "noaa-enc-direct",
        name: "NOAA ENC Direct",
        type: "wreck-catalog",
        status: "priority-target",
        url: "https://encdirect.noaa.gov/",
        notes:
          "Official NOAA ENC Direct layers expose charted wrecks and obstructions through ArcGIS REST services.",
      },
      {
        id: "noaa-hurricanes",
        name: "NHC HURDAT2",
        type: "storm-history",
        status: "priority-target",
        url: "https://www.nhc.noaa.gov/data/hurdat/",
        notes:
          "Official National Hurricane Center best-track archive for Atlantic storms, updated with the latest completed season.",
      },
      {
        id: "loc-chronicling-america",
        name: "Library of Congress Search API",
        type: "newspapers",
        status: "priority-target",
        url: "https://www.loc.gov/apis/additional-apis/chronicling-america-api/",
        notes:
          "Official Library of Congress JSON search endpoints expose historic newspaper pages and OCR snippets.",
      },
      {
        id: "florida-memory",
        name: "Florida Memory",
        type: "state-archive",
        status: "manual-target",
        url: "https://www.floridamemory.com/",
        notes:
          "Useful for manual archival follow-up and local collections not yet wired into automated ingestion.",
      },
      ...CURATED_REPORT_SOURCES,
      ...CURATED_ADDENDUM_SOURCES,
    ],
    knownWrecks: [
      {
        id: "wreck-1715-sebastian",
        name: "1715 Plate Fleet Scatter",
        year: 1715,
        lat: 27.8504,
        lon: -80.4141,
        areaTags: ["treasure-coast", "sebastian", "vero", "fort-pierce"],
        cargoProfile: "silver coins, bullion, and fleet cargo",
        cargoValueWeight: 1,
        causeTags: ["hurricane", "reef", "drift"],
        historicalNotes:
          "High-value Spanish fleet losses concentrated along the Treasure Coast after a hurricane landfall.",
      },
      {
        id: "wreck-gil-blas",
        name: "El Salvador / Gil Blas Loss Corridor",
        year: 1750,
        lat: 28.6408,
        lon: -80.5196,
        areaTags: ["canaveral", "cape", "space-coast"],
        cargoProfile: "merchant cargo with scattered specie reports",
        cargoValueWeight: 0.64,
        causeTags: ["hurricane", "shoal", "current"],
        historicalNotes:
          "Representative high-energy loss corridor tied to shoals and Gulf Stream set around Cape Canaveral.",
      },
      ...CURATED_REPORT_WRECKS,
    ],
    stormEvents: [
      {
        id: "storm-1715",
        name: "1715 Treasure Coast Hurricane",
        year: 1715,
        maxWindKts: 110,
        areaTags: ["treasure-coast", "sebastian", "vero", "fort-pierce"],
        severity: 1,
        notes: "Anchor event for bullion-bearing fleet losses along the east-central coast.",
      },
      {
        id: "storm-1750",
        name: "Mid-Century Cape Storm Corridor",
        year: 1750,
        maxWindKts: 85,
        areaTags: ["canaveral", "cape", "space-coast"],
        severity: 0.63,
        notes: "Used for shoal and current compounding around Cape Canaveral.",
      },
    ],
    journalEntries: [
      {
        id: "journal-1715-paraphrase",
        title: "Fleet driven onto the coast",
        year: 1715,
        sourceLabel: "Seeded paraphrase for prototype",
        sourceId: "loc-chronicling-america",
        verificationStatus: "needs-source-check",
        areaTags: ["treasure-coast", "sebastian", "vero"],
        cargoProfile: "silver coins and fleet cargo",
        confidence: 0.88,
        excerpt:
          "Paraphrase: reports describe multiple ships driven ashore after a hurricane while sailing north with heavy treasure cargo.",
      },
      {
        id: "journal-canaveral-paraphrase",
        title: "Shoals and current off the cape",
        year: 1750,
        sourceLabel: "Seeded paraphrase for prototype",
        sourceId: "florida-memory",
        verificationStatus: "needs-source-check",
        areaTags: ["canaveral", "cape", "space-coast"],
        cargoProfile: "merchant cargo with coin rumors",
        confidence: 0.66,
        excerpt:
          "Paraphrase: mariners note strong set toward shoals near the cape during foul weather and poor visibility.",
      },
      ...CURATED_REPORT_JOURNALS,
      ...CURATED_ADDENDUM_JOURNALS,
    ],
    candidateZones: REQUIRED_ZONES,
    importedKnownWrecks: [],
    importedStormEvents: [],
    importedJournalEntries: [],
    sourceImports: {
      lastRunAt: null,
      nhc: null,
      enc: null,
      loc: null,
    },
    savedAnalyses: [],
  };
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

function dedupeById(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function normalizeSources(sources) {
  const normalized = (Array.isArray(sources) ? sources : buildSeedData().sources).map((source) => {
    if (source.id === "noaa-awois") {
      return {
        id: "noaa-enc-direct",
        name: "NOAA ENC Direct",
        type: "wreck-catalog",
        status: source.status === "imported" ? "imported" : "priority-target",
        url: "https://encdirect.noaa.gov/",
        notes:
          "Official NOAA ENC Direct layers expose charted wrecks and obstructions through ArcGIS REST services.",
      };
    }
    return source;
  });
  return dedupeById(normalized);
}

function ensureCoverageZones(candidateZones) {
  const existing = Array.isArray(candidateZones) ? candidateZones.slice() : [];
  const byId = new Map(existing.map((zone) => [zone.id, zone]));
  for (const required of REQUIRED_ZONES) {
    if (!byId.has(required.id)) {
      existing.push(required);
      continue;
    }
    byId.set(required.id, {
      ...required,
      ...byId.get(required.id),
      regionKey: required.regionKey,
    });
  }
  return dedupeById(existing.map((zone) => byId.get(zone.id) || zone));
}

function normalizeDb(parsed) {
  const seed = buildSeedData();
  const db = parsed && typeof parsed === "object" ? parsed : {};
  return {
    sources: normalizeSources([
      ...(db.sources || seed.sources),
      ...CURATED_REPORT_SOURCES,
      ...CURATED_ADDENDUM_SOURCES,
    ]),
    knownWrecks: dedupeById([...(Array.isArray(db.knownWrecks) ? db.knownWrecks : seed.knownWrecks), ...CURATED_REPORT_WRECKS]),
    stormEvents: Array.isArray(db.stormEvents) && db.stormEvents.length ? db.stormEvents : seed.stormEvents,
    journalEntries: dedupeById([
      ...(Array.isArray(db.journalEntries) ? db.journalEntries : seed.journalEntries),
      ...CURATED_REPORT_JOURNALS,
      ...CURATED_ADDENDUM_JOURNALS,
    ]),
    candidateZones: ensureCoverageZones(db.candidateZones || seed.candidateZones),
    importedKnownWrecks: Array.isArray(db.importedKnownWrecks) ? db.importedKnownWrecks : [],
    importedStormEvents: Array.isArray(db.importedStormEvents) ? db.importedStormEvents : [],
    importedJournalEntries: Array.isArray(db.importedJournalEntries) ? db.importedJournalEntries : [],
    sourceImports:
      db.sourceImports && typeof db.sourceImports === "object"
        ? {
            lastRunAt: db.sourceImports.lastRunAt || null,
            nhc: db.sourceImports.nhc || null,
            enc: db.sourceImports.enc || null,
            loc: db.sourceImports.loc || null,
          }
        : seed.sourceImports,
    savedAnalyses: Array.isArray(db.savedAnalyses) ? db.savedAnalyses : [],
  };
}

async function loadDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_FILE, "utf8");
  return normalizeDb(JSON.parse(raw));
}

async function saveDb(db) {
  ensureDbFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(normalizeDb(db), null, 2));
}

function buildKeywordSignals(text) {
  const value = String(text || "").toLowerCase();
  const keywords = {
    treasure: /(gold|silver|bullion|coin|specie|treasure|plate fleet|emerald)/,
    storm: /(hurricane|gale|storm|squall|tempest)/,
    reef: /(reef|shoal|bar|breaker|inlet|ledge)/,
    drift: /(current|gulf stream|drift|set south|set north|carried south|carried north)/,
    salvage: /(salvage|wrecking|diver|recovered|salvor)/,
  };
  return Object.entries(keywords)
    .filter(([, pattern]) => pattern.test(value))
    .map(([name]) => name);
}

function inferAreaTags(text, regionHint = "") {
  const value = `${text} ${regionHint}`.toLowerCase();
  const lookups = [
    { tags: ["treasure-coast", "sebastian", "wabasso", "vero", "fort-pierce"], pattern: /(treasure coast|sebastian|wabasso|vero|fort pierce)/ },
    { tags: ["space-coast", "canaveral", "cape", "melbourne", "brevard"], pattern: /(space coast|canaveral|cape|cocoa beach|melbourne|brevard)/ },
    { tags: ["keys", "lower-keys", "key-west", "quicksands", "dry-tortugas"], pattern: /(key west|lower keys|marquesas|quicksands|atocha|santa margarita|dry tortugas)/ },
    { tags: ["keys", "upper-keys", "indian-key", "islamorada", "hawk-channel"], pattern: /(upper keys|middle keys|indian key|hawk channel|islamorada|long key|conch key|san pedro)/ },
    { tags: ["jupiter", "palm-beach", "treasure-coast"], pattern: /(jupiter|palm beach|west palm)/ },
    { tags: ["biscayne", "miami", "fort-lauderdale"], pattern: /(biscayne|miami|fort lauderdale|pompano)/ },
    { tags: ["daytona-coast", "daytona", "ponce", "volusia", "new-smyrna"], pattern: /(daytona|ponce|ponce inlet|volusia|new smyrna)/ },
    { tags: ["st-augustine", "matanzas", "north-east-florida"], pattern: /(st\.?\s*augustine|matanzas)/ },
  ];
  return Array.from(new Set(lookups.filter((item) => item.pattern.test(value)).flatMap((item) => item.tags)));
}

function cargoSignalWeight(text) {
  const value = String(text || "").toLowerCase();
  if (/(gold|silver|bullion|coin|specie|treasure|emerald)/.test(value)) {
    return 1;
  }
  if (/(military|artillery|valuables)/.test(value)) {
    return 0.58;
  }
  if (/(merchant|trade|cargo|supplies)/.test(value)) {
    return 0.42;
  }
  return 0.25;
}

function overlapScore(zoneTags, itemTags) {
  const zoneSet = new Set(zoneTags || []);
  const safeItemTags = Array.isArray(itemTags) ? itemTags : [];
  const matches = safeItemTags.filter((tag) => zoneSet.has(tag)).length;
  if (!matches) {
    return 0;
  }
  return matches / Math.max(zoneSet.size || 1, safeItemTags.length);
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

function getEffectiveKnownWrecks(db) {
  return dedupeById([...(db.knownWrecks || []), ...(db.importedKnownWrecks || [])]);
}

function getEffectiveStormEvents(db) {
  return dedupeById([...(db.stormEvents || []), ...(db.importedStormEvents || [])]);
}

function getEffectiveJournalEntries(db) {
  return dedupeById([...(db.journalEntries || []), ...(db.importedJournalEntries || [])]);
}

function journalEvidenceForZone(zone, journalEntries) {
  return journalEntries.reduce(
    (sum, entry) =>
      sum +
      overlapScore(zone.areaTags, entry.areaTags) *
        Number(entry.confidence || 0) *
        cargoSignalWeight(entry.cargoProfile),
    0,
  );
}

function stormEvidenceForZone(zone, stormEvents) {
  return stormEvents.reduce(
    (sum, event) => sum + overlapScore(zone.areaTags, event.areaTags) * Number(event.severity || 0),
    0,
  );
}

function wreckEvidenceForZone(zone, wrecks) {
  return wrecks.reduce((sum, wreck) => {
    const distance = haversineMiles(zone.lat, zone.lon, wreck.lat, wreck.lon);
    if (distance > 120) {
      return sum;
    }
    const distanceWeight = 1 - distance / 120;
    const tagWeight = overlapScore(zone.areaTags, wreck.areaTags);
    return sum + (distanceWeight * 0.65 + tagWeight * 0.35) * Number(wreck.cargoValueWeight || 0.15);
  }, 0);
}

function getNearbyKnownWrecks(zone, wrecks, maxDistanceMiles = 60, limit = 12) {
  return wrecks
    .filter((wreck) => Number.isFinite(wreck?.lat) && Number.isFinite(wreck?.lon))
    .map((wreck) => {
      const distanceMiles = haversineMiles(zone.lat, zone.lon, wreck.lat, wreck.lon);
      return {
        ...wreck,
        distanceMiles,
        tagOverlap: overlapScore(zone.areaTags, wreck.areaTags),
      };
    })
    .filter((wreck) => wreck.distanceMiles <= maxDistanceMiles || wreck.tagOverlap > 0)
    .sort(
      (a, b) =>
        b.tagOverlap - a.tagOverlap ||
        a.distanceMiles - b.distanceMiles ||
        Number(b.cargoValueWeight || 0) - Number(a.cargoValueWeight || 0),
    )
    .slice(0, limit)
    .map((wreck) => ({
      id: wreck.id,
      name: wreck.name,
      year: wreck.year || null,
      cargoProfile: wreck.cargoProfile || "charted wreck feature",
      lat: wreck.lat,
      lon: wreck.lon,
      depthMeters: Number.isFinite(wreck.depthMeters) ? wreck.depthMeters : null,
      depthFeet: Number.isFinite(wreck.depthFeet) ? wreck.depthFeet : null,
      soundingAccuracyFeet: Number.isFinite(wreck.soundingAccuracyFeet) ? wreck.soundingAccuracyFeet : null,
      distanceMiles: Number(wreck.distanceMiles.toFixed(1)),
      sourceId: wreck.sourceId || null,
      sourceUrl: wreck.sourceUrl || null,
    }));
}

function getZoneDepthProfile(nearbyKnownWrecks) {
  const depths = (nearbyKnownWrecks || [])
    .map((wreck) => Number(wreck.depthFeet))
    .filter((value) => Number.isFinite(value) && value > 0.5);
  if (!depths.length) {
    return {
      minFeet: null,
      maxFeet: null,
      averageFeet: null,
      sampleCount: 0,
      label: "Depth pending sounding-backed references",
    };
  }
  const minFeet = Math.min(...depths);
  const maxFeet = Math.max(...depths);
  const averageFeet = depths.reduce((sum, value) => sum + value, 0) / depths.length;
  return {
    minFeet: Number(minFeet.toFixed(1)),
    maxFeet: Number(maxFeet.toFixed(1)),
    averageFeet: Number(averageFeet.toFixed(1)),
    sampleCount: depths.length,
    label:
      minFeet === maxFeet
        ? `${minFeet.toFixed(1)} ft reference depth`
        : `${minFeet.toFixed(1)}-${maxFeet.toFixed(1)} ft reference band`,
  };
}

function buildPredictionDrivers(zone, { journalEvidence, stormEvidence, wreckEvidence, depthProfile }) {
  const drivers = [];
  if (stormEvidence >= 20) {
    drivers.push("Historic storm tracks repeatedly cut through this corridor.");
  } else if (stormEvidence >= 10) {
    drivers.push("Storm history supports periodic transport and breakup in this corridor.");
  }
  if (zone.driftRetention >= 0.68) {
    drivers.push("Littoral drift and current set support heavier material settling here.");
  }
  if (zone.seabedRetention >= 0.64) {
    drivers.push("Hard-bottom and reef-edge retention improves the chance of persistent debris pockets.");
  }
  if (journalEvidence >= 10) {
    drivers.push("Archival and journal evidence clusters strongly in this area.");
  }
  if (wreckEvidence >= 10) {
    drivers.push("Nearby known wreck anchors reinforce the pattern of repeated losses here.");
  }
  if (depthProfile.sampleCount >= 3 && depthProfile.label) {
    drivers.push(`Reference wreck soundings cluster around ${depthProfile.label}.`);
  }
  if (zone.surveyGap >= 0.6) {
    drivers.push("Survey gaps remain larger here than in the most publicized recovery stretches.");
  }
  return drivers.slice(0, 4);
}

function selectFeederZone(zone, offshoreZones) {
  return (Array.isArray(offshoreZones) ? offshoreZones : [])
    .map((candidate) => ({
      ...candidate,
      tagOverlap: overlapScore(zone.areaTags, candidate.areaTags),
      distanceMiles: haversineMiles(zone.lat, zone.lon, candidate.lat, candidate.lon),
    }))
    .sort(
      (a, b) =>
        b.tagOverlap - a.tagOverlap ||
        b.potentialScore - a.potentialScore ||
        a.distanceMiles - b.distanceMiles,
    )[0] || null;
}

function buildLandPredictionDrivers(zone, { journalEvidence, stormEvidence, wreckEvidence, feederZone, nearbyKnownWrecks }) {
  const drivers = [];
  if (feederZone) {
    drivers.push(`Primary feeder corridor is ${feederZone.name} (${feederZone.potentialScore}).`);
  }
  if (stormEvidence >= 10 || zone.stormWashover >= 0.76) {
    drivers.push("Historic storm wash-over and beach runup favor shoreline deposition here.");
  }
  if (zone.beachRetention >= 0.74) {
    drivers.push("Beachface retention is stronger here, especially around cusps and shell-lag pockets.");
  }
  if (zone.duneRetention >= 0.72) {
    drivers.push("Lower dune cuts and wrack buildup can trap heavier storm-thrown material in this segment.");
  }
  if (wreckEvidence >= 10 || nearbyKnownWrecks.length >= 4) {
    drivers.push("Nearby offshore wreck anchors support repeated material-loss patterns into this shoreline reach.");
  }
  if (zone.renourishmentRisk >= 0.35) {
    drivers.push("Renourishment and beach reworking may bury or disperse older signals, so treat this as a corridor only.");
  }
  return drivers.slice(0, 4);
}

function regionKeyForZone(zone) {
  if (zone.regionKey) {
    return zone.regionKey;
  }
  if ((zone.areaTags || []).includes("keys")) {
    return "keys";
  }
  if ((zone.areaTags || []).includes("treasure-coast")) {
    return "treasure-coast";
  }
  if ((zone.areaTags || []).includes("space-coast")) {
    return "space-coast";
  }
  if ((zone.areaTags || []).includes("daytona-coast")) {
    return "daytona-coast";
  }
  return "other";
}

function scoreCandidateZone(zone, db) {
  const journals = getEffectiveJournalEntries(db);
  const storms = getEffectiveStormEvents(db);
  const wrecks = getEffectiveKnownWrecks(db);
  const journalEvidence = journalEvidenceForZone(zone, journals);
  const stormEvidence = stormEvidenceForZone(zone, storms);
  const wreckEvidence = wreckEvidenceForZone(zone, wrecks);
  const nearbyKnownWrecks = getNearbyKnownWrecks(zone, wrecks);
  const depthProfile = getZoneDepthProfile(nearbyKnownWrecks);
  const relevantJournalCount = journals.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const relevantStormCount = storms.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const relevantWreckCount = wrecks.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const rawScore =
    Math.sqrt(journalEvidence + 0.01) * 3 +
    Math.sqrt(stormEvidence + 0.01) * 2.2 +
    Math.sqrt(wreckEvidence + 0.01) * 3.2 +
    zone.driftRetention * 10 +
    zone.seabedRetention * 8 +
    zone.surveyGap * 6 +
    10;
  const potentialScore = Math.max(1, Math.min(100, Math.round(rawScore)));
  const confidence = Math.max(
    0.36,
    Math.min(
      0.94,
      0.38 +
        Math.min(0.22, Math.log1p(relevantJournalCount + relevantStormCount + relevantWreckCount) * 0.08) +
        Math.min(0.12, Math.sqrt(journalEvidence + 0.01) * 0.02),
    ),
  );
  return {
    ...zone,
    regionKey: regionKeyForZone(zone),
    potentialScore,
    confidence: Number(confidence.toFixed(2)),
    evidence: {
      journalEvidence: Number(journalEvidence.toFixed(2)),
      stormEvidence: Number(stormEvidence.toFixed(2)),
      wreckEvidence: Number(wreckEvidence.toFixed(2)),
      relevantJournalCount,
      relevantStormCount,
      relevantWreckCount,
      driftRetention: zone.driftRetention,
      seabedRetention: zone.seabedRetention,
      surveyGap: zone.surveyGap,
    },
    nearbyKnownWrecks,
    depthProfile,
    predictionDrivers: buildPredictionDrivers(zone, {
      journalEvidence,
      stormEvidence,
      wreckEvidence,
      depthProfile,
    }),
    recommendation:
      zone.legalSensitivity === "high"
        ? "Archive-first review only. Use this zone for permitting and remote-sensing planning, not direct recovery."
        : "Prioritize archival confirmation and non-invasive survey planning before any fieldwork.",
  };
}

function scoreLandFindZone(zone, db, offshoreZones) {
  const journals = getEffectiveJournalEntries(db);
  const storms = getEffectiveStormEvents(db);
  const wrecks = getEffectiveKnownWrecks(db);
  const journalEvidence = journalEvidenceForZone(zone, journals);
  const stormEvidence = stormEvidenceForZone(zone, storms);
  const wreckEvidence = wreckEvidenceForZone(zone, wrecks);
  const nearbyKnownWrecks = getNearbyKnownWrecks(zone, wrecks, 30, 10);
  const depthProfile = getZoneDepthProfile(nearbyKnownWrecks);
  const feederZone = selectFeederZone(zone, offshoreZones);
  const feederBoost = feederZone ? feederZone.potentialScore / 100 : 0;
  const relevantJournalCount = journals.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const relevantStormCount = storms.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const relevantWreckCount = wrecks.filter((entry) => overlapScore(zone.areaTags, entry.areaTags) > 0).length;
  const rawScore =
    Math.sqrt(journalEvidence + 0.01) * 2.6 +
    Math.sqrt(stormEvidence + 0.01) * 2.6 +
    Math.sqrt(wreckEvidence + 0.01) * 2.7 +
    zone.beachRetention * 11 +
    zone.duneRetention * 9 +
    zone.stormWashover * 9 +
    feederBoost * 10 -
    zone.renourishmentRisk * 4 +
    zone.publicAccess * 1.5 +
    12;
  const potentialScore = Math.max(1, Math.min(100, Math.round(rawScore)));
  const confidence = Math.max(
    0.38,
    Math.min(
      0.93,
      0.4 +
        Math.min(0.2, Math.log1p(relevantJournalCount + relevantStormCount + relevantWreckCount) * 0.075) +
        Math.min(0.12, feederBoost * 0.15),
    ),
  );
  return {
    ...zone,
    regionKey: regionKeyForZone(zone),
    potentialScore,
    confidence: Number(confidence.toFixed(2)),
    evidence: {
      journalEvidence: Number(journalEvidence.toFixed(2)),
      stormEvidence: Number(stormEvidence.toFixed(2)),
      wreckEvidence: Number(wreckEvidence.toFixed(2)),
      relevantJournalCount,
      relevantStormCount,
      relevantWreckCount,
      beachRetention: zone.beachRetention,
      duneRetention: zone.duneRetention,
      stormWashover: zone.stormWashover,
      renourishmentRisk: zone.renourishmentRisk,
      publicAccess: zone.publicAccess,
    },
    feederZone: feederZone
      ? {
          id: feederZone.id,
          name: feederZone.name,
          potentialScore: feederZone.potentialScore,
          lat: feederZone.lat,
          lon: feederZone.lon,
        }
      : null,
    nearbyKnownWrecks,
    depthProfile,
    predictionDrivers: buildLandPredictionDrivers(zone, {
      journalEvidence,
      stormEvidence,
      wreckEvidence,
      feederZone,
      nearbyKnownWrecks,
    }),
    recommendation:
      "Use this for lawful shoreline observation planning only. Stay at broad public-access corridor scale and verify protected-area rules before any field activity.",
  };
}

function getScoredCandidateZones(db) {
  return ensureCoverageZones(db.candidateZones)
    .filter((zone) => ALLOWED_REGION_KEYS.has(regionKeyForZone(zone)))
    .map((zone) => scoreCandidateZone(zone, db))
    .sort((a, b) => b.potentialScore - a.potentialScore || b.confidence - a.confidence);
}

function getScoredLandFindZones(db) {
  const offshoreZones = getScoredCandidateZones(db);
  return LAND_FIND_ZONES.filter((zone) => ALLOWED_REGION_KEYS.has(regionKeyForZone(zone)))
    .map((zone) => scoreLandFindZone(zone, db, offshoreZones))
    .sort((a, b) => b.potentialScore - a.potentialScore || b.confidence - a.confidence);
}

function orderCoverageBalancedZones(zones) {
  const ranked = Array.isArray(zones) ? zones.slice() : [];
  const chosen = [];
  const seenIds = new Set();
  const seenRegions = new Set();

  for (const zone of ranked) {
    if (!seenRegions.has(zone.regionKey)) {
      chosen.push(zone);
      seenIds.add(zone.id);
      seenRegions.add(zone.regionKey);
    }
  }

  for (const zone of ranked) {
    if (!seenIds.has(zone.id)) {
      chosen.push(zone);
      seenIds.add(zone.id);
    }
  }

  return chosen;
}

function centerForAreaTags(areaTags) {
  const tags = Array.isArray(areaTags) ? areaTags : [];
  const buckets = new Map();

  for (const zone of [...REQUIRED_ZONES, ...LAND_FIND_ZONES]) {
    for (const tag of zone.areaTags || []) {
      if (!buckets.has(tag)) {
        buckets.set(tag, []);
      }
      buckets.get(tag).push({ lat: zone.lat, lon: zone.lon });
    }
  }

  for (const region of REGION_DEFS) {
    for (const tag of region.tags || []) {
      if (!buckets.has(tag)) {
        buckets.set(tag, []);
      }
      buckets.get(tag).push(region.center);
    }
  }

  const matches = tags.flatMap((tag) => buckets.get(tag) || []);
  if (!matches.length) {
    return null;
  }
  const lat = matches.reduce((sum, point) => sum + point.lat, 0) / matches.length;
  const lon = matches.reduce((sum, point) => sum + point.lon, 0) / matches.length;
  return {
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
  };
}

function buildReferencePoints(db) {
  const wrecks = getEffectiveKnownWrecks(db)
    .filter((wreck) => Number.isFinite(wreck?.lat) && Number.isFinite(wreck?.lon))
    .map((wreck) => ({
      id: `wreck:${wreck.id}`,
      type: "wreck",
      lat: wreck.lat,
      lon: wreck.lon,
      title: wreck.name,
      subtitle: wreck.historicalNotes || wreck.cargoProfile || "Known wreck reference",
      year: wreck.year || null,
      sourceId: wreck.sourceId || null,
      sourceUrl: wreck.sourceUrl || null,
      areaTags: wreck.areaTags || [],
    }));

  const journals = getEffectiveJournalEntries(db)
    .map((entry) => {
      const center = centerForAreaTags(entry.areaTags);
      if (!center) {
        return null;
      }
      return {
        id: `journal:${entry.id}`,
        type: "journal",
        lat: center.lat,
        lon: center.lon,
        title: entry.title,
        subtitle: entry.excerpt,
        year: entry.year || null,
        sourceId: entry.sourceId || null,
        sourceUrl: null,
        areaTags: entry.areaTags || [],
      };
    })
    .filter(Boolean);

  const sourcePoints = (db.sources || [])
    .map((source) => {
      const linkedWrecks = wrecks.filter((wreck) => wreck.sourceId === source.id);
      const linkedJournals = journals.filter((journal) => journal.sourceId === source.id);
      const matches = [...linkedWrecks, ...linkedJournals];
      if (!matches.length) {
        return null;
      }
      const lat = matches.reduce((sum, point) => sum + point.lat, 0) / matches.length;
      const lon = matches.reduce((sum, point) => sum + point.lon, 0) / matches.length;
      return {
        id: `source:${source.id}`,
        type: "source",
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        title: source.name,
        subtitle: source.notes || `${matches.length} linked records`,
        year: null,
        sourceId: source.id,
        sourceUrl: source.url || null,
        areaTags: [],
      };
    })
    .filter(Boolean);

  return [...wrecks, ...journals, ...sourcePoints];
}

function buildCoverageRegions(zones) {
  return REGION_DEFS.map((region) => {
    const matching = zones.filter((zone) => zone.regionKey === region.id);
    return {
      id: region.id,
      name: region.name,
      blurb: region.blurb,
      center: region.center,
      zoneCount: matching.length,
      topZone: matching[0]
        ? {
            id: matching[0].id,
            name: matching[0].name,
            potentialScore: matching[0].potentialScore,
          }
        : null,
    };
  });
}

function analyzeJournalText({ text, title, year, regionHint }, db) {
  const areaTags = inferAreaTags(text, regionHint);
  const keywordSignals = buildKeywordSignals(text);
  const confidence =
    0.22 +
    Math.min(0.28, areaTags.length * 0.09) +
    Math.min(0.22, keywordSignals.length * 0.055);
  const cargoProfile =
    keywordSignals.includes("treasure")
      ? "coin or bullion indicators present"
      : keywordSignals.includes("salvage")
        ? "salvage mention without explicit treasure cargo"
        : "cargo unclear";
  const syntheticEntry = {
    id: "analysis-preview",
    title: title || "Temporary journal analysis",
    year: Number(year) || new Date().getUTCFullYear(),
    sourceLabel: "User supplied",
    sourceId: "manual-entry",
    verificationStatus: "unverified",
    areaTags: areaTags.length ? areaTags : ["florida-east-coast"],
    cargoProfile,
    confidence: Number(Math.min(0.92, confidence).toFixed(2)),
    excerpt: String(text || "").trim().slice(0, 800),
  };
  const previewDb = {
    ...db,
    journalEntries: [...(db.journalEntries || []), syntheticEntry],
  };
  return {
    extracted: {
      areaTags: syntheticEntry.areaTags,
      keywordSignals,
      cargoProfile,
      confidence: syntheticEntry.confidence,
    },
    topZones: getScoredCandidateZones(previewDb).slice(0, 4),
    topLandZones: getScoredLandFindZones(previewDb).slice(0, 4),
  };
}

function buildOverview(db) {
  const candidateZones = orderCoverageBalancedZones(getScoredCandidateZones(db));
  const landFindZones = orderCoverageBalancedZones(getScoredLandFindZones(db));
  const knownWrecks = getEffectiveKnownWrecks(db)
    .slice()
    .sort(
      (a, b) =>
        Number(b.cargoValueWeight || 0) - Number(a.cargoValueWeight || 0) ||
        (a.year || 0) - (b.year || 0) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );
  const stormEvents = getEffectiveStormEvents(db)
    .slice()
    .sort((a, b) => (b.year || 0) - (a.year || 0));
  const journalEntries = getEffectiveJournalEntries(db)
    .slice()
    .sort(
      (a, b) =>
        Number(b.confidence || 0) - Number(a.confidence || 0) ||
        (a.year || 0) - (b.year || 0) ||
        String(a.title || "").localeCompare(String(b.title || "")),
    );
  return {
    config: {
      appName: "Florida Wreck Signal",
      dbFile: DB_FILE,
      safetyMode: "coarse-zones-only",
    },
    totals: {
      sources: db.sources.length,
      knownWrecks: knownWrecks.length,
      stormEvents: stormEvents.length,
      journalEntries: journalEntries.length,
    },
    modelNotes: [
      "Ocean scores combine journal evidence, storm corridors, known wreck gravity, seabed retention, and survey gaps.",
      "Land-find targets weight feeder corridors, storm wash-over, beach and dune retention, and nearby wreck clustering.",
      "Coverage now spans the Florida Keys through the Treasure Coast and Space Coast up to Daytona comparison zones.",
      "Predict views show the full scored corridor set while keeping a region-balanced order near the top.",
      "Candidate zones stay intentionally broad. Use them for archival follow-up, permitting, and non-invasive survey planning.",
    ],
    coverageRegions: buildCoverageRegions(candidateZones),
    sources: db.sources,
    sourceImports: db.sourceImports,
    knownWrecks: knownWrecks.slice(0, 80),
    stormEvents: stormEvents.slice(0, 80),
    journalEntries: journalEntries.slice(0, 80),
    referencePointTotals: {
      wrecks: getEffectiveKnownWrecks(db).filter((wreck) => Number.isFinite(wreck?.lat) && Number.isFinite(wreck?.lon)).length,
      journals: getEffectiveJournalEntries(db).filter((entry) => centerForAreaTags(entry.areaTags)).length,
      sources: (db.sources || []).length,
    },
    candidateZones,
    landFindZones,
    savedAnalyses: db.savedAnalyses
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20),
  };
}

module.exports = {
  DB_FILE,
  REGION_DEFS,
  ensureDbFile,
  loadDb,
  saveDb,
  inferAreaTags,
  buildKeywordSignals,
  getEffectiveKnownWrecks,
  getEffectiveStormEvents,
  getEffectiveJournalEntries,
  getScoredCandidateZones,
  getScoredLandFindZones,
  analyzeJournalText,
  buildReferencePoints,
  buildOverview,
};
