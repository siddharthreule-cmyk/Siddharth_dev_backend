/**
 * Swapify backend
 * ----------------
 * Implements every endpoint the frontend (index.html / profile.html) calls:
 *   GET    /api/items
 *   POST   /api/items
 *   POST   /api/items/:id/interest
 *   POST   /api/review
 *   GET    /api/accounts
 *   POST   /api/accounts
 *   POST   /api/login
 *   PUT    /api/accounts/:username
 *   DELETE /api/accounts/:username
 *   POST   /api/premium
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
<<<<<<< HEAD
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
=======
const OpenAI = require('openai');
>>>>>>> 0d24511357fbff865b675ccc0a0505ab7455353f
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'HELLOIMPENNYWISETHEDANCINGCLOWN';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// ---------- CORS (Bulletproof Frontend Linking) ----------
const defaultAllowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://siddharth-dev-frontend.onrender.com'
];

const envOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : [];
const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envOrigins])];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    if (
      process.env.CORS_ORIGIN === '*' ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS policy'));
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '5mb' })); // item images arrive as base64 data URLs, hence 5mb

// ================= SWAPIFY AI CHAT =================
// Merged in from da-hood-for-barter-questions.js so one process serves
// both the CRUD routes above and the AI chat below.

const aiClient = new OpenAI({
  apiKey: process.env.SWAPIFY_LLM_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const AI_MODEL = process.env.SWAPIFY_LLM_MODEL || 'llama-3.3-70b-versatile';

const AI_SYSTEM_PROMPT = `
You're Swapify AI — think of yourself as the sharp, street-smart friend everyone
wishes they had before making a trade. You live inside Swapify, a barter
marketplace where people swap items instead of buying them with cash.

How you talk:
- Like a real person, not a corporate chatbot. Casual, warm, a little witty when
  it fits — but never sloppy or unclear.
- Straight to the point. No stiff filler like "I would be happy to assist you
  with that." Just help, like you're texting a friend who knows their stuff.
- Confident opinions, not wishy-washy hedging. If a trade looks lopsided, say so
  plainly and explain why.

What you actually help with:
- Writing listings and descriptions that don't sound generic — punchy, honest,
  and specific to the item.
- Sizing up proposed trades and giving a real gut-check: does this feel roughly
  even, is one side clearly getting the better end, and what would make it fair
  (e.g. "throw in a little extra" or "ask for something small back").
- Answering questions about how bartering, categories, listings, and Swapify
  itself work.
- Dropping practical, no-nonsense safety tips — meet in public, check the item
  in person, don't rush a deal that feels off.
- If someone brings up trading big-ticket stuff (cars, houses, yachts, jets,
  boats, diamonds, gold, jewellery, submarines, bunkers, islands, castles, fine
  art), let them know casually that Swapify Premium is needed for that tier of
  trade.

Ground rules:
- Never invent exact real-world dollar prices — you don't have live market data.
  Talk fairness in terms of condition, demand, usefulness, and what feels like a
  reasonable trade, not made-up figures.
- Stay practical and human. You're here to help people make good trades, not to
  recite policy.
`.trim();

// ---------- tiny JSON-file "database" ----------
function ensureDBStorage() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

function readDB() {
  ensureDBStorage();
  if (!fs.existsSync(DB_PATH)) {
    const empty = { items: [], accounts: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }

  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : []
    };
  } catch (e) {
    console.error('db.json is corrupted, starting fresh:', e.message);
    return { items: [], accounts: [] };
  }
}

function writeDB(db) {
  ensureDBStorage();
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

// ================= SIGNUP EMAIL VERIFICATION (Gmail OTP) =================
// Used only during signup — login stays username/password as-is.
//
// Requires these env vars in Render:
//   GMAIL_USER=swapifysupport@gmail.com
//   GMAIL_APP_PASSWORD=<16-char Gmail App Password, NOT your real password>
// Generate an App Password at https://myaccount.google.com/apppasswords
// after turning on 2-Step Verification for the Gmail account.

const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const signupOtpStore = new Map(); // email -> { code, expiresAt, attempts }
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/send-otp — send a 6-digit code to the email being signed up with
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const db = readDB();
    const alreadyUsed = db.accounts.some(
      acc => String(acc.email || '').trim().toLowerCase() === email.trim().toLowerCase()
    );
    if (alreadyUsed) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const code = generateOtpCode();
    const key = email.trim().toLowerCase();
    signupOtpStore.set(key, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    await mailTransporter.sendMail({
      from: `"Swapify" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Verify your email for Swapify',
      text: `Your Swapify verification code is ${code}. It expires in 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color:#4f8cff;">Verify your email</h2>
          <p>Use this code to finish creating your Swapify account. It expires in 5 minutes.</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 0;">${code}</div>
          <p style="color:#888; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Verification code sent.' });
  } catch (error) {
    console.error('send-otp error:', error);
    return res.status(500).json({ error: 'Unable to send verification code. Please try again shortly.' });
  }
});

// POST /api/verify-otp — confirm the code before the account is created
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, code } = req.body || {};

    if (!isValidEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ verified: false, error: 'A valid email and 6-digit code are required.' });
    }

    const key = email.trim().toLowerCase();
    const record = signupOtpStore.get(key);

    if (!record) {
      return res.status(400).json({ verified: false, error: 'No code was requested for this email. Request a new one.' });
    }
    if (Date.now() > record.expiresAt) {
      signupOtpStore.delete(key);
      return res.status(400).json({ verified: false, error: 'This code has expired. Request a new one.' });
    }
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      signupOtpStore.delete(key);
      return res.status(429).json({ verified: false, error: 'Too many incorrect attempts. Request a new code.' });
    }
    if (record.code !== code) {
      record.attempts += 1;
      return res.status(400).json({ verified: false, error: 'Incorrect code.' });
    }

    signupOtpStore.delete(key); // one-time use
    return res.json({ verified: true, message: 'Email verified.' });
  } catch (error) {
    console.error('verify-otp error:', error);
    return res.status(500).json({ verified: false, error: 'Server error while verifying the code.' });
  }
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
app.delete('/api/accounts/:username', requireAdminSecret, (req, res) => {
  const db = readDB();
  const { username } = req.params;

  const index = db.accounts.findIndex(acc => normalizeUsername(acc.username) === normalizeUsername(username));
  if (index === -1) return res.status(404).json({ error: 'Account not found.' });

  db.accounts.splice(index, 1);
  writeDB(db);
  res.json({ ok: true, removed: username });
});

// ================= AI CHAT =================

// POST /api/chat — Swapify AI barter assistant
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A non-empty "message" string is required.' });
    }

    const priorTurns = Array.isArray(history) ? history.slice(-10) : [];

    const messages = [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      ...priorTurns
        .filter(
          (turn) =>
            turn &&
            (turn.role === 'user' || turn.role === 'assistant') &&
            typeof turn.content === 'string'
        )
        .map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: message },
    ];

    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 500,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I couldn't come up with a reply just now — please try again.";

    return res.json({ reply });
  } catch (error) {
    console.error('Swapify AI chat error:', error);
    return res.status(500).json({
      error: 'Swapify AI is temporarily unavailable. Please try again shortly.',
    });
  }
});

// ================= PREMIUM =================

// POST /api/premium — set a user's premium flag
app.post('/api/premium', (req, res) => {
  const db = readDB();
  const { username, premium } = req.body || {};

  if (!username) return res.status(400).json({ error: 'username is required.' });

  const account = findAccountByUsername(db, username);
  if (!account) return res.status(404).json({ error: 'Account not found.' });

  account.premium = !!premium || account.admin;
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