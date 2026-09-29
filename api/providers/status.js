// api/providers/status.js  –  Vercel serverless function for GET /api/providers/status

import { getProviderDefinitions, sendProviderRequest, buildProviderPayload } from '../_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const providerOrder = getProviderDefinitions();
    const statuses = [];
    let firstAvailable = null;

    const hostUrl = req.headers.origin || req.headers.host || '';

    for (const provider of providerOrder) {
      if (!provider.apiKey) {
        statuses.push({
          id: provider.id,
          name: provider.name,
          status: 'missing_key',
          error: 'No API Key provided'
        });
        continue;
      }

      try {
        await sendProviderRequest(
          provider,
          buildProviderPayload(
            provider,
            { prompt: 'Hello', contextPages: [], history: [], systemInstruction: '' },
            true
          ),
          hostUrl
        );

        statuses.push({ id: provider.id, name: provider.name, status: 'ok', error: null });
        if (!firstAvailable) {
          firstAvailable = { id: provider.id, name: provider.name };
        }
      } catch (err) {
        statuses.push({ id: provider.id, name: provider.name, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({ provider: firstAvailable, allStatuses: statuses });
  } catch (error) {
    console.error('Provider status check failed:', error);
    return res.status(500).json({ error: 'Failed to check provider status.' });
  }
}
