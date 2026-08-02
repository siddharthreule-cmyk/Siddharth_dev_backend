/**
 * Swapify AI Chat Endpoint
 * ------------------------
 * Real LLM-powered barter assistant using an OpenAI-compatible API.
 * Works with OpenAI directly, or with Groq (which exposes an
 * OpenAI-compatible /chat/completions endpoint) by swapping BASE_URL + MODEL.
 *
 * Install:
 *   npm install express openai cors dotenv
 *
 * Run:
 *   node server.js
 */

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// 1. LLM CLIENT CONFIGURATION
// ---------------------------------------------------------------------------
// For OpenAI: leave baseURL as default (comment it out) and use an OpenAI key.
// For Groq: set baseURL to "https://api.groq.com/openai/v1" and use a Groq key.
const client = new OpenAI({
  apiKey: process.env.SWAPIFY_LLM_API_KEY || 'YOUR_API_KEY_HERE',
  baseURL: 'https://api.groq.com/openai/v1', // remove this line to use OpenAI instead
});

// Pick a model that matches whichever provider/baseURL you're using above.
// Groq examples: "llama-3.3-70b-versatile", "llama-3.1-8b-instant"
// OpenAI examples: "gpt-4o-mini", "gpt-4o"
const MODEL = process.env.SWAPIFY_LLM_MODEL || 'llama-3.3-70b-versatile';

// ---------------------------------------------------------------------------
// 2. SYSTEM PROMPT — defines the assistant's persona and behavior
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are Swapify AI, the built-in assistant for Swapify, a barter/trading marketplace
where users exchange items instead of buying them with money.

Your responsibilities:
- Help users write clear, appealing item listings and descriptions.
- Evaluate proposed trades and give a fair-value assessment (e.g. "this trade looks
  roughly even" or "Item A is generally worth more than Item B, so consider asking
  for something extra").
- Answer general questions about how bartering, listings, categories, and the
  Swapify platform work.
- Give practical safety tips for meeting traders and verifying items.
- If a user asks about trading high-value items (cars, houses, yachts, jets, boats,
  diamonds, gold, jewellery, submarines, bunkers, islands, castles, or fine art),
  remind them that a Swapify Premium membership is required for those trades.

Tone: friendly, concise, practical. Avoid making up specific real-world market
prices you cannot verify — give general fairness guidance instead, and encourage
users to compare condition, demand, and utility rather than exact dollar values.
`.trim();

// ---------------------------------------------------------------------------
// 3. CHAT ENDPOINT
// ---------------------------------------------------------------------------
// Accepts: { message: string, history?: [{ role: 'user'|'assistant', content: string }] }
// Returns: { reply: string }
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A non-empty "message" string is required.' });
    }

    // Optional prior turns from the frontend, capped to keep requests small/fast.
    const priorTurns = Array.isArray(history) ? history.slice(-10) : [];

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
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

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.6,
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

// ---------------------------------------------------------------------------
// 4. START SERVER
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Swapify backend listening on port ${PORT}`);
});

module.exports = app;