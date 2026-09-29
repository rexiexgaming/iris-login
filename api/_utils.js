// api/_utils.js  –  shared logic for Vercel serverless functions

export function getProviderDefinitions() {
  return [
    {
      id: 'gemini',
      name: 'Gemini',
      type: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.5-flash'
    },
    {
      id: 'gemini-fallback',
      name: 'Gemini Fallback',
      type: 'gemini',
      apiKey: process.env.GEMINI_FALLBACK_API_KEY,
      model: 'gemini-2.5-flash-lite'
    },
    {
      id: 'groq',
      name: 'Groq',
      type: 'openai-compatible',
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      url: 'https://api.groq.com/openai/v1/chat/completions'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openai-compatible',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: 'openai/gpt-4o-mini',
      url: 'https://openrouter.ai/api/v1/chat/completions'
    }
  ];
}

export function buildProviderPayload(provider, params, isHealthCheck) {
  if (isHealthCheck) {
    if (provider.type === 'gemini') {
      return {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 }
      };
    }
    return {
      model: provider.model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 8,
      temperature: 0
    };
  }

  const hasDocumentContext =
    Array.isArray(params.contextPages) && params.contextPages.length > 0;
  const messages = [];

  const documentSysInstruction = `You are IRIS (Interactive Retrieval & Intelligent Search), a professional AI document assistant.
Your task is to answer user queries using the provided PDF document context.

Strict Rules:
1. Base your answer strictly on the facts, figures, and text provided in the PDF document.
2. For every factual claim, summary, key point, or quote, you MUST cite the exact page number(s) from which the information is drawn.
3. Citing Format: Cites must be written in the format [Page X] (e.g. [Page 4] or [Page 12, 13]). Place citations inline at the end of the sentence or clause containing the fact.
4. If you cite information from multiple pages, write it as [Page 3, 5] or [Page 6 - 8].
5. If the document does not contain the answer, say "I couldn't find information about that in the document context." Do not answer from general knowledge.
6. Keep your responses structured, clear, and easy to read. Use Markdown headers (## for sections, ### for sub-sections), bullet points (- item), bold (**text**), and italic (*text*) where appropriate.
7. Do NOT invent or assume information. Every claim must be grounded in the provided context.`;

  const generalSysInstruction = `You are IRIS, a professional AI assistant.
Provide clear, helpful, concise answers.
When a document is loaded, you should use it as your primary source. When no document is loaded, answer normally using general knowledge.
If the user asks for structured output, follow that format carefully.`;

  const finalSysInstruction = params.systemInstruction?.trim()
    ? params.systemInstruction.trim()
    : hasDocumentContext
    ? documentSysInstruction
    : generalSysInstruction;

  messages.push({ role: 'system', content: finalSysInstruction });

  if (hasDocumentContext) {
    let contextBlock = '[DOCUMENT CONTEXT]\n';
    for (const page of params.contextPages) {
      contextBlock += `--- START OF PAGE ${page.pageNum} ---\n${page.text}\n--- END OF PAGE ${page.pageNum} ---\n\n`;
    }
    contextBlock += '[END OF DOCUMENT CONTEXT]';

    messages.push({
      role: 'user',
      content: `Here is the PDF document context you must answer from:\n\n${contextBlock}\n\nAcknowledge receipt of this context and use only it when answering factual questions.`
    });
    messages.push({
      role: 'assistant',
      content:
        'Understood. I will answer using only the provided document context and cite the relevant pages.'
    });
  }

  for (const item of params.history || []) {
    messages.push({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.text
    });
  }

  messages.push({ role: 'user', content: params.prompt });

  if (provider.type === 'gemini') {
    return buildGeminiPayload(messages);
  }

  return {
    model: provider.model,
    messages,
    temperature: 0.3,
    max_tokens: 4096
  };
}

function buildGeminiPayload(messages) {
  const contents = [];
  let systemInstruction = null;

  for (const message of messages) {
    if (message.role === 'system') {
      systemInstruction = { parts: [{ text: message.content }] };
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    });
  }

  const body = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  return body;
}

export async function sendProviderRequest(provider, payload, hostUrl = '') {
  if (provider.type === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.error?.message || `Gemini error (${response.status})`);
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }

  const headers = {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = hostUrl || 'https://iris-ten-weld.vercel.app';
    headers['X-Title'] = 'IRIS';
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || `${provider.name} error (${response.status})`);
  }

  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${provider.name} returned an empty response.`);
  return text;
}

export async function requestFromProviders(params, hostUrl = '') {
  const providerOrder = getProviderDefinitions();
  const failures = [];

  for (const provider of providerOrder) {
    if (!provider.apiKey) continue;

    try {
      const payload = buildProviderPayload(provider, params, false);
      const text = await sendProviderRequest(provider, payload, hostUrl);
      return { text, provider: { id: provider.id, name: provider.name } };
    } catch (error) {
      failures.push({ provider: provider.name, message: error.message });
    }
  }

  const unavailableError = new Error('All AI providers are currently unavailable.');
  unavailableError.code = 'ALL_PROVIDERS_UNAVAILABLE';
  unavailableError.details = failures;
  throw unavailableError;
}
