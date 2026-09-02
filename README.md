# LoL ROFL Analysis Dashboard

Vite/React dashboard for backend-owned ROFL JSON reports. It deliberately
keeps champion names in JSON fields and uses generic player report artifacts.

```bash
npm install
npm run typecheck
npm run build
```

The production ingress serves the SPA and routes `/api` to the backend. The
current UI renders player impact and capability status; movement map and
objective timeline are reserved for verified patch event adapters.
