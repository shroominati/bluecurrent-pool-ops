# Florida Wreck Signal

Isolated maritime research app for Florida Keys-to-Daytona research, restored without modifying the pool-ops backend.

## Local Run

```bash
npm install
npm run wreck:start
```

Open [http://localhost:8899](http://localhost:8899).

## Password Protection

The maritime app now uses HTTP Basic Auth.

- Username: `admin`
- Password: `georgeeatsgold`

You can override both with environment variables:

```bash
export WRECK_APP_USER=admin
export WRECK_APP_PASSWORD=georgeeatsgold
npm run wreck:start
```

To disable auth temporarily for local testing only:

```bash
export WRECK_APP_AUTH_ENABLED=false
```

## Permanent Deploy

Two deployment helpers were added specifically for this app:

- [Dockerfile.wreck](/Users/alfredmunoz/Documents/Playground/Dockerfile.wreck)
- [render-wreck.yaml](/Users/alfredmunoz/Documents/Playground/render-wreck.yaml)

For Render:

1. Create a new web service from this repo.
2. Use `npm run wreck:start` as the start command.
3. Set `WRECK_APP_USER=admin`.
4. Set `WRECK_APP_PASSWORD=georgeeatsgold`.
5. Keep `WRECK_APP_AUTH_ENABLED=true`.

For Docker:

```bash
docker build -f Dockerfile.wreck -t florida-wreck-signal .
docker run -p 8899:8899 \
  -e WRECK_APP_USER=admin \
  -e WRECK_APP_PASSWORD=georgeeatsgold \
  florida-wreck-signal
```

## What It Includes

- Separate land and ocean prediction corridors
- Keys-to-Daytona coverage
- Reference Map with uploaded evidence points
- Imported historical evidence from NOAA ENC Direct, NHC HURDAT2, and LOC Chronicling America
- Live NOAA marine conditions for wind, waves, and tides
- Browser geolocation tracking with route-out links for coarse target corridors
- Manual journal note entry and rescoring

## Main Files

- `server/wreck-app.js`
- `server/wreck-db.js`
- `maritime/index.html`
- `maritime/app.js`
- `maritime/styles.css`
- `data/wreck-research-db.json`
