# Clerk delete server

This is a minimal example server that performs secure deletion of a Clerk user
using the Clerk Admin API. Deploy this on a backend you control — do NOT embed
your `CLERK_SECRET` in a mobile client.

Setup:

1. Install dependencies:

```bash
npm install express node-fetch body-parser
```

2. Set environment variables (example):

```bash
export CLERK_SECRET="sk_xxx"
export DELETE_API_KEY="some-shared-secret"
node clerk-delete-server.js
```

3. Call the endpoint from your app (example curl):

```bash
curl -X POST https://your-server.example.com/delete-user \
  -H "Content-Type: application/json" \
  -H "x-delete-key: some-shared-secret" \
  -d '{"userId":"clerk_user_id_here"}'
```

Notes:

- The server requires `CLERK_SECRET`. Protect this server (auth, rate-limits).
- Client should authenticate to your server (e.g., via session cookie, token).
