# BlueCurrent Pool Ops

Node/Express app for pool service companies that need dispatch planning, technician route tracking, field service logging, payroll visibility, and accounting integration in one product.

This version includes:
- role-based login for owners, dispatchers, and technicians
- route optimization with live road-network routing when Mapbox is configured
- technician portal for visit logging, chemistry, notes, photos, and GPS capture
- employee profiles with avatars, certifications, emergency contacts, and payroll summaries
- pay hub with projected day gross, pay stubs, and next pay dates
- QuickBooks OAuth connection status plus expense export feed
- installable PWA shell with offline-cached UI assets

## Run locally

```bash
npm install
npm run app:start
```

Open [http://localhost:8787](http://localhost:8787).

If `8787` is already in use, run:

```bash
PORT=8791 npm run app:start
```

## Demo accounts

- Owner: `owner@bluecurrent.local` / `owner123!`
- Dispatcher: `dispatch@bluecurrent.local` / `dispatch123!`
- Technician: `mia@bluecurrent.local` / `tech123!`

## Frontend build

```bash
npm run frontend:build
```

Static files are written to `dist/`.

## Environment

The app runs without external integrations, but the following env vars unlock the live features:

```bash
PORT=8787

# Optional: managed Postgres. If not set, JSON file mode is used.
# DATABASE_URL=postgres://user:pass@host:5432/db

# Optional: force a specific datastore file
# DB_FILE=/absolute/path/pool-ops-db.json

# Optional: real road-network routing
# ROUTING_PROVIDER=mapbox
# MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token
# MAPBOX_PROFILE=mapbox/driving-traffic

# Optional: QuickBooks OAuth
# QBO_CLIENT_ID=your_client_id
# QBO_CLIENT_SECRET=your_client_secret
# QBO_REDIRECT_URI=http://localhost:8787/api/integrations/quickbooks/callback
# QBO_ENVIRONMENT=sandbox

# Optional for frontend static deploy
# POOL_OPS_API_BASE=https://your-api.example.com
```

## API

### Public

- `GET /api/config`
- `POST /api/auth/login`
- `GET /api/integrations/quickbooks/callback`

### Authenticated

- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/overview?date=YYYY-MM-DD`
- `GET /api/payroll?date=YYYY-MM-DD`
- `POST /api/visits`
- `POST /api/expenses`
- `GET /api/quickbooks/export?date=YYYY-MM-DD`

### Manager-only

- `POST /api/route-plans/generate`
- `POST /api/integrations/quickbooks/connect-url`
- `POST /api/integrations/quickbooks/disconnect`

## Product notes

- Route assignment is still heuristic at the fleet level, then optionally upgraded with live Mapbox road-network timing and geometry per technician route.
- QuickBooks OAuth is live-ready when credentials are supplied, but this version still treats expenses as export/feed records rather than posting accounting transactions automatically.
- Photos are stored as browser-captured image data in the prototype so the app works without a separate object store.
- The service worker caches the core shell for install/offline startup, but API data still requires connectivity.

## Suggested next steps

1. Add customer-facing service reports and homeowner portals.
2. Push expenses into QuickBooks as mapped purchase or journal records once account/vendor mappings are defined.
3. Add persistent object storage for visit photos and signed upload flows.
4. Add turn-by-turn navigation deep links and live technician breadcrumb streaming.
