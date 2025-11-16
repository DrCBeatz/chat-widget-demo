# Chat Widget Demo (Web Component + React Wrapper + Streaming Backend)

A small, production-leaning demo of a **framework‑agnostic chat widget** implemented as a **Web Component** (`<aqila-chat>`) with:

- **Vanilla HTML host** (`public/vanilla.html`)
- **React host** with a tiny wrapper component (`src/ChatWidget.tsx`)
- **Tenant‑aware branding & context** via JSON config files
- **Live backend** (Node/Express) with **SSE streaming** using **Ollama** (local) or **AWS Bedrock** (Claude) behind a single `/api`

It’s designed to be easy to run locally and simple to deploy to typical “static + API” hosts (S3/CloudFront + App Runner/Lambda, Vercel/Netlify + server, etc.).

## Project Layout
```text
chat-widget-demo/
└── widget-host/
├── index.html                     # React app entry (loads the web component script)
├── public/
│   ├── widget.js                  #  Custom Element (framework-agnostic)
│   ├── vanilla.html               # Vanilla host demo page
│   ├── hospital.html              # Polished “City General Hospital” microsite demo
│   └── tenants/
│       ├── hospital-a/current/config.json
│       └── hospital-b/current/config.json
├── server/
│   └── server.js                  # Express API: /api/chat and /api/chat/stream (SSE)
├── src/                           # React demo (Vite)
│   ├── ChatWidget.tsx             # React wrapper around 
│   ├── custom-elements.d.ts       # JSX typing for the custom element
│   ├── App.tsx, index.css, …    # Demo UI
│   └── main.tsx
├── vite.config.ts                 # Dev proxy: /api -> http://localhost:8787
└── package.json
```

---

## Quick start (local)

### 0) Requirements
- **Node.js 18+** (tested with v22)
- **npm**
- One LLM backend:
  - **Ollama** (easiest): `ollama serve` + `ollama pull llama3.1:8b`
  - **AWS Bedrock** (optional): credentials + model access (e.g., Claude 3 Haiku)

### 1) Start the backend (Express)

```bash
cd widget-host/server
npm install

# Option A: Ollama (streaming supported)
# Make sure "ollama serve" is running in another shell.
PROVIDER=ollama OLLAMA_MODEL="llama3.1:8b" node server.js

# Option B: AWS Bedrock (non-streaming → SSE emits one final chunk)
# Ensure AWS credentials/region and model access are configured.
PROVIDER=bedrock \
AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID="anthropic.claude-3-haiku-20240307-v1:0" \
node server.js

The server listens on http://localhost:8787 with:
- POST /api/chat
- POST /api/chat/stream (SSE)

2) Start the frontend (Vite + React + Web Component)

```bash
cd ../..           # back to widget-host
npm install
npm run dev
```

Open http://localhost:5173

The dev server proxies /api/* to http://localhost:8787 (see vite.config.ts).

### 3) Demo pages
- React demo: http://localhost:5173/
(Uses `<ChatWidget tenant="hospital-a" floating />`)
- Vanilla demo: http://localhost:5173/vanilla.html
(Direct `<aqila-chat tenant="hospital-b" floating>`)
- Hospital microsite: http://localhost:5173/hospital.html
(Polished landing page with floating widget)



## Using the web component

### Load the component script

Ensure your host page (including React’s index.html) loads the element:

``` html
<!-- widget-host/index.html -->
<script type="module" src="/widget.js"></script>
```

### Place the element where you want it:

```html
<aqila-chat tenant="hospital-a" floating></aqila-chat>
```

- tenant (string): selects the config under public/tenants/<id>/current/config.json
- floating (boolean attribute): docks widget bottom‑right and supports collapse/expand

### React wrapper (optional)

src/ChatWidget.tsx wraps the custom element and sets attributes via a ref:

```tsx
return <aqila-chat ref={ref} />; // attributes applied in useEffect via el.setAttribute(...)
```

JSX typing lives in src/custom-elements.d.ts.


## Tenant configuration

Each tenant supplies branding, UI strings, context and API preferences:

``` jsonc
// public/tenants/hospital-a/current/config.json
{
  "schema_version": "1.0",
  "tenant_id": "hospital-a",
  "branding": {
    "name": "Hospital A Chat Widget",
    "logo_url": "https://dummyimage.com/80x32/0b6fb3/ffffff&text=Hospital A",
    "base_color": "#0B6FB3"
  },
  "ui": {
    "initial_greeting": "Hi! I’m the Hospital A assistant. Ask me about visiting hours, parking, or policies."
  },
  "context": {
    "hours": "Visiting 10am–8pm daily. ICU: 2 visitors at a time, 10am–7pm. ER 24/7.",
    "parking": "Garage B (first hour free, then $3/hr, daily max $12). Parking office Level 1.",
    "locations": "Main entrance at 123 Health Ave. Clinics in Building C, Levels 2–4.",
    "policies": [
      { "id": "mask-2025-04", "title": "Mask Policy", "text": "Masks recommended; required in oncology & ICU." }
    ],
    "faq": [
      { "q": "What are visiting hours?", "a": "10am–8pm; ICU special limits (2 visitors, 10am–7pm)." }
    ]
  },
  "prompt": {
    "system": "You are a patient‑facing hospital assistant. Use ONLY the provided context. If a question is outside the context, say you don’t know and suggest contacting the hospital. Be brief and accurate; cite policy IDs when relevant."
  },
  "chatbot_api": {
    "transport": "sse",
    "base_url": ""
  }
}
```

Notes:
- base_url: "" → use same origin (works with Vite proxy in dev).
- The widget builds a context string from context and sends it with the user prompt & optional prompt.system.

## Backend API

Both endpoints accept JSON and include the composed prompt (system + context + user) when querying Ollama/Bedrock.

### POST /api/chat (non‑streaming)

#### Request:
```json
{
  "prompt": "What are visiting hours?",
  "system": "optional system instruction",
  "context": "optional context (built by widget)",
  "conversation_id": "uuid-...",
  "tenant_id": "hospital-a"
}
```

#### Response:
```json
{ "text": "Visiting hours are 10am–8pm daily …" }
```

#### cURL:
```bash
curl -X POST http://localhost:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"prompt":"Hello"}'
```

### POST /api/chat/stream (SSE)

Streams tokens as SSE data: events. The client appends each token to the UI.


#### Request:

```json
{ "prompt": "Explain ICU visitor limits", "system": "", "context": "..." }
```

#### SSE Stream:
```
data: "E"
data: "x"
data: "p"
...
event: done
data: [DONE]
```

With Ollama, streaming is “true streaming”. With Bedrock, this demo emits one final chunk for simplicity.

## Build & production

```bash
# Build the React app + copy public/ into dist/
cd widget-host
npm run build

# Preview the built site locally
npm run preview
```

- Vite copies everything from public/ (including widget.js and tenants/) into dist/.
- Deploy dist/ to any static host (S3+CloudFront, Netlify, Vercel, Cloudflare Pages, etc.).
- Deploy the Node server to a host that supports SSE (App Runner, Fly.io, Render, Railway, EC2, etc.).

## Environment variables
- `PROVIDER=ollama|bedrock`
- `OLLAMA_MODEL=llama3.1:8b (default)`
- `AWS_REGION=us-east-1`
- `BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0`
- `PORT=8787`


## Security & multi‑tenant notes (for production)

This demo trusts a tenant_id from the browser. In production:
- Authenticate (JWT/Cognito) and enforce per‑tenant authorization server‑side
- Sign requests (e.g., HMAC of tenant_id + conversation_id + timestamp)
- Validate origin & CORS (remember: CORS ≠ auth)
- Rate‑limit and add basic abuse protections

A simple pattern: issue a short‑lived JWT for a specific tenant in your admin, and validate it on /api/chat*.

## Troubleshooting
- Widget doesn’t render in React: ensure index.html includes `<script type="module" src="/widget.js"></script>`.
- Typing errors (aqila-chat doesn’t exist): check src/custom-elements.d.ts is included by TS (it is).
- 405 / CORS errors in vanilla page: open vanilla.html from the same Vite server (/vanilla.html) or enable CORS.
- No streaming: some proxies/serverless hosts buffer SSE. App Runner/Fly/EC2 work well.
- Ollama errors: ensure ollama serve is running and the model exists (ollama list).

## License

This project is licensed under the MIT License.