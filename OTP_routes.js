/**
 * Swapify Email OTP Backend Routes
 * ---------------------------------
 * Add these routes to your existing Express app (e.g. server.js).
 *
 * Install:
 *   npm install nodemailer
 *
 * IMPORTANT — Gmail setup:
 * Gmail will NOT accept your normal account password for SMTP.
 * You must create an "App Password":
 *   1. Turn on 2-Step Verification on swapifysupport@gmail.com
 *   2. Go to https://myaccount.google.com/apppasswords
 *   3. Generate an app password for "Mail"
 *   4. Use THAT 16-character password below (never your real Gmail password)
 *
 * Set these as environment variables on Render (never hardcode secrets):
 *   GMAIL_USER=swapifysupport@gmail.com
 *   GMAIL_APP_PASSWORD=your16charapppassword
 */

const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const router = express.Router();

// ---------------------------------------------------------------------------
// 1. MAIL TRANSPORT
// ---------------------------------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'swapifysupport@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'YOUR_APP_PASSWORD_HERE',
  },
});

// ---------------------------------------------------------------------------
// 2. IN-MEMORY OTP STORE
// ---------------------------------------------------------------------------
// Fine for a small app / single server instance. For production at scale,
// swap this Map for Redis or a database table with a TTL/expiry column.
const otpStore = new Map(); // email -> { code, expiresAt, attempts }

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

function generateOtp() {
  // Cryptographically random 6-digit code, zero-padded.
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// 3. POST /api/send-otp
// ---------------------------------------------------------------------------
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const code = generateOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;
    otpStore.set(email.toLowerCase(), { code, expiresAt, attempts: 0 });

    await transporter.sendMail({
      from: `"Swapify" <${process.env.GMAIL_USER || 'swapifysupport@gmail.com'}>`,
      to: email,
      subject: 'Your Swapify verification code',
      text: `Your Swapify verification code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this email.`,
      html: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h2 style="color:#4f8cff;">Swapify verification code</h2>
          <p>Use the code below to verify your email. It expires in 5 minutes.</p>
          <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px 0;">${code}</div>
          <p style="color:#888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return res.json({ success: true, message: 'Verification code sent.' });
  } catch (error) {
    console.error('send-otp error:', error);
    return res.status(500).json({ error: 'Unable to send verification code. Please try again shortly.' });
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/verify-otp
// ---------------------------------------------------------------------------
router.post('/verify-otp', (req, res) => {
  try {
    const { email, code } = req.body;

    if (!isValidEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ verified: false, error: 'A valid email and 6-digit code are required.' });
    }

    const key = email.toLowerCase();
    const record = otpStore.get(key);

    if (!record) {
      return res.status(400).json({ verified: false, error: 'No code was requested for this email. Request a new one.' });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ verified: false, error: 'This code has expired. Request a new one.' });
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(key);
      return res.status(429).json({ verified: false, error: 'Too many incorrect attempts. Request a new code.' });
    }

    if (record.code !== code) {
      record.attempts += 1;
      return res.status(400).json({ verified: false, error: 'Incorrect code.' });
    }

    // Correct code — consume it so it can't be reused.
    otpStore.delete(key);
    return res.json({ verified: true, message: 'Email verified.' });
  } catch (error) {
    console.error('verify-otp error:', error);
    return res.status(500).json({ verified: false, error: 'Server error while verifying the code.' });
  }
});

module.exports = router;

/**
 * In your main server.js, mount this router under /api:
 *
 *   const otpRoutes = require('./otp-routes');
 *   app.use('/api', otpRoutes);
 */