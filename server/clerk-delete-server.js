// Minimal secure example server to delete a Clerk user using Clerk Admin API.
// Usage:
// 1. Set environment variables: CLERK_SECRET and DELETE_API_KEY
// 2. Run: node clerk-delete-server.js

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;
const CLERK_SECRET = process.env.CLERK_SECRET;
const DELETE_API_KEY = process.env.DELETE_API_KEY; // simple shared secret for requests

if (!CLERK_SECRET) {
  console.error('CLERK_SECRET is required to run this server');
  process.exit(1);
}
if (!DELETE_API_KEY) {
  console.error('DELETE_API_KEY is recommended to protect the endpoint');
}

app.post('/delete-user', async (req, res) => {
  try {
    const authHeader = req.headers['x-delete-key'] || req.headers['authorization'];
    if (DELETE_API_KEY) {
      const key = authHeader && authHeader.toString().replace(/^Bearer\s+/i, '');
      if (!key || key !== DELETE_API_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const url = `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`;
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${CLERK_SECRET}` },
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'Clerk delete failed', detail: text });
    }

    return res.json({ ok: true, userId });
  } catch (e) {
    console.error('delete-user error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

app.listen(PORT, () => console.log(`Clerk delete server listening on ${PORT}`));
