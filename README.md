# VacationSync API

## CORS Policy

The API allows cross-origin requests from our production and local development frontends. Requests must originate from one of the following origins:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:4173`
- `http://127.0.0.1:4173`
- `https://www.tripsyncbeta.com`
- `https://tripsyncbeta.com`

Any origin within the `*.tripsyncbeta.com` domain is also accepted. CORS responses include:

- `Access-Control-Allow-Origin` echoing the request origin
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`
- `Access-Control-Allow-Headers` including `Content-Type`, `Authorization`, `X-Request-ID`, `X-Filename`, `X-Content-Type`, and `X-Activities-Version`

### Testing with curl

Replace the URL with your environment as needed:

```bash
# Preflight (OPTIONS)
curl -i -X OPTIONS http://localhost:5000/api/trips/10/proposals/hotels \
  -H "Origin: https://www.tripsyncbeta.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization"

# Actual POST
curl -i -X POST http://localhost:5000/api/trips/10/proposals/hotels \
  -H "Origin: https://www.tripsyncbeta.com" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"hotelId":123}'
```

Successful responses include the CORS headers listed above. Use a different origin (e.g. `https://malicious.example.com`) to verify that disallowed origins receive a 500 response during the preflight check.

## Image + photo-search production configuration

This app uses a Vite frontend (`import.meta.env`) with an Express backend.

### Required env vars

- **Frontend (Vercel, Client Project)**
  - `VITE_API_URL=https://<your-render-backend-domain>`
  - Optional: `VITE_WS_URL=wss://<your-render-backend-domain>/ws`
- **Backend (Render, API Project)**
  - `PEXELS_API_KEY=<your-pexels-key>`
  - `CLIENT_URL=https://<your-vercel-frontend-domain>`
  - Optional: `CORS_ORIGINS=https://<your-vercel-frontend-domain>`

### Important notes

- Do **not** put `PEXELS_API_KEY` in Vercel client env vars. Pexels requests are made server-side through `/api/photos/*`.
- `VITE_API_URL` must point to the backend in production. If omitted, browser requests default to same-origin (`/api/...`) and fail on Vercel-only frontend deployments.
- Cover photo URLs beginning with `/uploads/...` are backend-hosted and should be resolved against `VITE_API_URL` in the client.
