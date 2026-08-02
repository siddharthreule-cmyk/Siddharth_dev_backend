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

// ---------------------------------------------------------------------------
// 4. START SERVER
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Swapify backend listening on port ${PORT}`);
});

module.exports = app;
