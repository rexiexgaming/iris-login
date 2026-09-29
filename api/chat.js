// api/chat.js  –  Vercel serverless function for POST /api/chat

import { requestFromProviders } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const body = req.body || {};
    const prompt = String(body?.prompt || '').trim();
    const contextPages = Array.isArray(body?.contextPages) ? body.contextPages : [];
    const history = Array.isArray(body?.history) ? body.history : [];
    const systemInstruction =
      typeof body?.systemInstruction === 'string' ? body.systemInstruction : '';

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const hostUrl = req.headers.origin || req.headers.host || '';

    const result = await requestFromProviders(
      { prompt, contextPages, history, systemInstruction },
      hostUrl
    );

    return res.status(200).json({ text: result.text, provider: result.provider });
  } catch (error) {
    console.error('Chat request failed:', error);

    if (error.code === 'ALL_PROVIDERS_UNAVAILABLE') {
      return res.status(503).json({
        error: 'All AI providers are currently unavailable.',
        code: 'ALL_PROVIDERS_UNAVAILABLE',
        details: error.details || []
      });
    }

    return res.status(500).json({ error: error.message || 'Failed to get AI response.' });
  }
}
