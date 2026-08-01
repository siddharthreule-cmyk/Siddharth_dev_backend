/**
 * Swapify backend
 * ----------------
 * Implements every endpoint the frontend (index.html / profile.html) calls:
 *   GET    /items
 *   POST   /items
 *   POST   /items/:id/interest
 *   POST   /review
 *   GET    /accounts
 *   POST   /accounts
 *   POST   /login
 *   PUT    /accounts/:username
 *   DELETE /accounts/:username
 *   POST   /premium
 *
 * Storage: a single JSON file (data/db.json) read/written on every request.
 * This is intentionally simple to match the size of the project — see the
 * "WHAT COULD BREAK" notes below and in the README before relying on this
 * for anything with real users or money.
 *
 * WHAT COULD BREAK:
 * - Concurrency: two requests writing at the exact same moment can clobber
 *   each other (last write wins). Fine for a small class/demo project;
 *   not fine at real scale. A real database (Postgres/Mongo) fixes this.
 * - Ephemeral disks: many free hosts (including Render's free web service
 *   tier) wipe the local filesystem on every restart/redeploy. That means
 *   data/db.json — and everyone's accounts/listings — can vanish on
 *   redeploy unless you attach a persistent disk or move to a real DB.
 * - No sessions/auth tokens: every request trusts whatever username the
 *   client claims to be (e.g. "postedBy"). This backend recomputes
 *   admin/premium status server-side from the account record so a user
 *   can't just lie about being an admin in devtools — but it still can't
 *   verify *which* real person is making the request, since there's no
 *   login session/token system. Good enough for a hobby project; add
 *   proper auth (JWT/sessions) before this handles anything sensitive.
 * - The two admin-only routes (rename user, delete user) require an
 *   `x-admin-secret` header matching ADMIN_SECRET. Your current frontend
 *   doesn't send this header yet — see README "Frontend changes needed".
 * - Never add fields for raw card numbers/CVV to any endpoint here. The
 *   current payment form doesn't send that data anywhere — keep it that way.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-this-to-a-long-random-value';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// ---------- CORS ----------
// CORS_ORIGIN can be "*" (dev only) or a comma-separated allowlist of origins.
const rawOrigins = (process.env.CORS_ORIGIN || '*').trim();
const corsOptions =
  rawOrigins === '*'
    ? { origin: '*' }
    : { origin: rawOrigins.split(',').map(o => o.trim()) };

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '5mb' })); // item images arrive as base64 data URLs, hence 5mb

// ---------- tiny JSON-file "database" ----------
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const empty = { items: [], accounts: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('db.json is corrupted, starting fresh:', e.message);
    return { items: [], accounts: [] };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function findAccountByUsername(db, username) {
  const target = normalizeUsername(username);
  return db.accounts.find(acc => normalizeUsername(acc.username) === target) || null;
}

// Never send password hashes to the client.
function sanitizeAccount(account) {
  if (!account) return null;
  const { password, ...safe } = account;
  return safe;
}

function requireAdminSecret(req, res, next) {
  const provided = req.get('x-admin-secret');
  if (!provided || provided !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Missing or invalid admin secret.' });
  }
  next();
}

// ---------- health check ----------
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'swapify-backend' });
});

// ================= ITEMS =================

// GET /api/items — list every listing
app.get('/api/items', (req, res) => {
  const db = readDB();
  res.json(db.items);
});

// POST /api/items — create a listing
app.post('/api/items', (req, res) => {
  const db = readDB();
  const body = req.body || {};

  const required = ['name', 'category', 'condition', 'exchange', 'description'];
  for (const field of required) {
    if (!body[field] || !String(body[field]).trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // Don't trust client-claimed admin/premium flags — recompute from the
  // real account record so someone can't fake "postedByAdmin: true" via devtools.
  const postedBy = body.postedBy && String(body.postedBy).trim() ? String(body.postedBy).trim() : 'Guest';
  const posterAccount = postedBy !== 'Guest' ? findAccountByUsername(db, postedBy) : null;
  const postedByAdmin = !!(posterAccount && posterAccount.admin);
  const premiumOwner = !!(posterAccount && (posterAccount.premium || posterAccount.admin));

  const item = {
    id: nanoid(),
    name: String(body.name).trim(),
    category: String(body.category).trim(),
    condition: String(body.condition).trim(),
    exchange: String(body.exchange).trim(),
    description: String(body.description).trim(),
    image: typeof body.image === 'string' ? body.image : '',
    documentName: typeof body.documentName === 'string' ? body.documentName : '',
    postedBy,
    postedByAdmin,
    premiumOwner,
    ratingSum: 0,
    ratingCount: 0,
    reviews: [],
    interestedChats: [],
    createdAt: new Date().toISOString()
  };

  db.items.push(item);
  writeDB(db);
  res.status(201).json(item);
});

// POST /api/items/:id/interest — send a trade request message on a listing
app.post('/api/items/:id/interest', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const { message, from } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'A message is required.' });
  }

  const item = db.items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Listing not found.' });

  if (!item.interestedChats) item.interestedChats = [];
  item.interestedChats.push({
    from: from && String(from).trim() ? String(from).trim() : 'Guest',
    message: String(message).trim(),
    createdAt: new Date().toISOString()
  });

  writeDB(db);
  res.status(201).json(item);
});

// ================= REVIEWS =================

// POST /api/review — add a star rating + anonymous review text to a listing
app.post('/api/review', (req, res) => {
  const db = readDB();
  const { listingId, rating, reviewText } = req.body || {};

  const numericRating = Number(rating);
  if (!listingId || !Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'listingId and a rating between 1 and 5 are required.' });
  }
  if (!reviewText || !String(reviewText).trim()) {
    return res.status(400).json({ error: 'reviewText is required.' });
  }

  const item = db.items.find(i => i.id === listingId);
  if (!item) return res.status(404).json({ error: 'Listing not found.' });

  if (item.postedByAdmin) {
    return res.status(403).json({ error: 'Admin listings cannot receive new reviews.' });
  }

  item.ratingSum = (item.ratingSum || 0) + numericRating;
  item.ratingCount = (item.ratingCount || 0) + 1;
  if (!item.reviews) item.reviews = [];
  item.reviews.push({ rating: numericRating, text: String(reviewText).trim(), createdAt: new Date().toISOString() });

  writeDB(db);
  res.status(201).json(item);
});

// ================= ACCOUNTS / AUTH =================

// GET /api/accounts — list accounts (used by the admin panel; passwords stripped)
app.get('/api/accounts', (req, res) => {
  const db = readDB();
  res.json(db.accounts.map(sanitizeAccount));
});

// POST /api/accounts — sign up
app.post('/api/accounts', (req, res) => {
  const db = readDB();
  const { email, phone, username, password } = req.body || {};

  if (!email || !phone || !username || !password) {
    return res.status(400).json({ error: 'email, phone, username, and password are all required.' });
  }
  if (findAccountByUsername(db, username)) {
    return res.status(409).json({ error: 'This username already exists. Please log in or choose another username.' });
  }

  // Admin/premium status is decided here, server-side, by comparing the
  // plaintext password (before hashing) against ADMIN_SECRET — NOT by
  // trusting anything the client sends.
  const isAdmin = password === ADMIN_SECRET;

  const account = {
    username: String(username).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    password: bcrypt.hashSync(String(password), 10),
    admin: isAdmin,
    premium: isAdmin,
    createdAt: new Date().toISOString()
  };

  db.accounts.push(account);
  writeDB(db);
  res.status(201).json(sanitizeAccount(account));
});

// POST /api/login
app.post('/api/login', (req, res) => {
  const db = readDB();
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }

  const account = findAccountByUsername(db, username);
  if (!account || !bcrypt.compareSync(String(password), account.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  res.json(sanitizeAccount(account));
});

// PUT /api/accounts/:username — admin-only: rename an account's username
// Requires header: x-admin-secret: <ADMIN_SECRET>
app.put('/api/accounts/:username', requireAdminSecret, (req, res) => {
  const db = readDB();
  const { username } = req.params;
  const { username: newUsername } = req.body || {};

  if (!newUsername || !String(newUsername).trim()) {
    return res.status(400).json({ error: 'A new username is required.' });
  }

  const account = findAccountByUsername(db, username);
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  const clash = findAccountByUsername(db, newUsername);
  if (clash && normalizeUsername(clash.username) !== normalizeUsername(username)) {
    return res.status(409).json({ error: 'This username is already taken.' });
  }

  account.username = String(newUsername).trim();
  writeDB(db);
  res.json(sanitizeAccount(account));
});

// DELETE /api/accounts/:username — admin-only: remove a user
// Requires header: x-admin-secret: <ADMIN_SECRET>
app.delete('/api/accounts/:username', requireAdminSecret, (req, res) => {
  const db = readDB();
  const { username } = req.params;

  const index = db.accounts.findIndex(acc => normalizeUsername(acc.username) === normalizeUsername(username));
  if (index === -1) return res.status(404).json({ error: 'Account not found.' });

  db.accounts.splice(index, 1);
  writeDB(db);
  res.json({ ok: true, removed: username });
});

// ================= PREMIUM =================

// POST /api/premium — set a user's premium flag (called after the "payment" step)
app.post('/api/premium', (req, res) => {
  const db = readDB();
  const { username, premium } = req.body || {};

  if (!username) return res.status(400).json({ error: 'username is required.' });

  const account = findAccountByUsername(db, username);
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  account.premium = !!premium || account.admin; // admins are always premium
  writeDB(db);
  res.json(sanitizeAccount(account));
});

// ---------- 404 fallback ----------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(PORT, () => {
  console.log(`Swapify backend listening on port ${PORT}`);
});
