/**
 * Rove API — Express + MongoDB, protected by Auth0 access tokens.
 *
 * Collections:
 *   users     { _id: auth0 sub, name, email, picture, createdAt, lastSeenAt }
 *   rankings  { _id: `${sub}:${itemId}`, sub, itemId, tier, score, note, updatedAt }
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import { auth } from 'express-oauth2-jwt-bearer';

const {
  PORT = 4000,
  MONGODB_URI,
  MONGODB_DB = 'rove',
  AUTH0_DOMAIN,
  AUTH0_AUDIENCE,
} = process.env;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!AUTH0_DOMAIN || !AUTH0_AUDIENCE) {
  console.error('Missing AUTH0_DOMAIN / AUTH0_AUDIENCE.');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);
const users = db.collection('users');
const rankings = db.collection('rankings');
await rankings.createIndex({ sub: 1, itemId: 1 }, { unique: true });
console.log(`Connected to MongoDB (${MONGODB_DB})`);

const checkJwt = auth({
  audience: AUTH0_AUDIENCE,
  issuerBaseURL: `https://${AUTH0_DOMAIN}/`,
  tokenSigningAlg: 'RS256',
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const sub = (req) => req.auth.payload.sub;

app.get('/health', (_req, res) => res.json({ ok: true }));

/** Upsert the caller's profile and return it. */
app.get('/api/me', checkJwt, async (req, res) => {
  const id = sub(req);
  const claims = req.auth.payload;
  const now = new Date();
  await users.updateOne(
    { _id: id },
    {
      $set: {
        name: claims.name ?? claims.nickname ?? claims.email ?? 'Traveler',
        email: claims.email ?? null,
        picture: claims.picture ?? null,
        lastSeenAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
  res.json(await users.findOne({ _id: id }));
});

app.get('/api/rankings', checkJwt, async (req, res) => {
  const rows = await rankings.find({ sub: sub(req) }).sort({ score: -1 }).toArray();
  res.json(rows.map(({ itemId, tier, score, note }) => ({ itemId, tier, score, note: note ?? null })));
});

/**
 * Upsert a batch of rankings. The client sends the whole recomputed tier after
 * each insertion, since one new ranking reshuffles every score in that tier.
 */
app.put('/api/rankings', checkJwt, async (req, res) => {
  const id = sub(req);
  const list = Array.isArray(req.body?.rankings) ? req.body.rankings : [];
  const valid = list.filter(
    (r) => Number.isInteger(r.itemId) && ['loved', 'liked', 'okay'].includes(r.tier) && typeof r.score === 'number'
  );
  if (!valid.length) return res.status(400).json({ error: 'no valid rankings' });

  await rankings.bulkWrite(
    valid.map((r) => ({
      updateOne: {
        filter: { _id: `${id}:${r.itemId}` },
        update: {
          $set: {
            sub: id,
            itemId: r.itemId,
            tier: r.tier,
            score: r.score,
            ...(typeof r.note === 'string' ? { note: r.note } : {}),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }))
  );
  res.json({ updated: valid.length });
});

app.delete('/api/rankings/:itemId', checkJwt, async (req, res) => {
  await rankings.deleteOne({ _id: `${sub(req)}:${Number(req.params.itemId)}` });
  res.status(204).end();
});

/** Everyone else's recent rankings — the social feed. */
app.get('/api/feed', checkJwt, async (req, res) => {
  const rows = await rankings
    .find({ sub: { $ne: sub(req) } })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();
  const profiles = await users.find({ _id: { $in: [...new Set(rows.map((r) => r.sub))] } }).toArray();
  const byId = Object.fromEntries(profiles.map((p) => [p._id, p]));
  res.json(
    rows.map((r) => ({
      itemId: r.itemId,
      tier: r.tier,
      score: r.score,
      note: r.note ?? null,
      updatedAt: r.updatedAt,
      user: { name: byId[r.sub]?.name ?? 'Someone', picture: byId[r.sub]?.picture ?? null },
    }))
  );
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'server error' });
});

app.listen(PORT, () => console.log(`Rove API on http://localhost:${PORT}`));
