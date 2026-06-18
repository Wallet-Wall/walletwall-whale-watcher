const OPENROUTER_BASE   = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_BASE       = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_BASE    = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514';

async function _fetchProvider(url, headers, body, parseText, signal, tag, name) {
  try {
    const r = await fetch(url, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      ...(signal && { signal }),
    });
    if (r.ok) return parseText(await r.json()) ?? null;
    console.warn(`[${tag}] ${name}`, r.status);
  } catch (e) {
    console.warn(`[${tag}] ${name} error:`, e.message);
  }
  return null;
}

/**
 * Call available AI providers in priority order: OpenRouter → OpenAI → Anthropic.
 * Returns the first successful text response, or null if all fail or none are configured.
 *
 * @param {string} systemPrompt
 * @param {Array<{role:string,content:string}>} userMessages  (system message excluded — added automatically)
 * @param {{ maxTokens?: number, timeout?: number, tag?: string, openaiModelFallback?: string }} options
 */
export async function callAiProviders(systemPrompt, userMessages, {
  maxTokens           = 1000,
  timeout             = null,
  tag                 = 'ai',
  openaiModelFallback = 'gpt-4o-mini',
} = {}) {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey     = process.env.OPENAI_API_KEY;
  const anthropicKey  = process.env.ANTHROPIC_API_KEY;
  if (!openrouterKey && !openaiKey && !anthropicKey) return null;

  const allMessages  = [{ role: 'system', content: systemPrompt }, ...userMessages];
  const signal       = timeout ? AbortSignal.timeout(timeout) : undefined;
  const parseChoices = d => d.choices?.[0]?.message?.content;

  if (openrouterKey) {
    const text = await _fetchProvider(
      OPENROUTER_BASE,
      { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://walletwall.app', 'X-Title': 'Wallet Wall' },
      { model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o', max_tokens: maxTokens, messages: allMessages },
      parseChoices, signal, tag, 'OpenRouter',
    );
    if (text) return text;
  }

  if (openaiKey) {
    const text = await _fetchProvider(
      OPENAI_BASE,
      { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      { model: process.env.OPENAI_MODEL || openaiModelFallback, max_tokens: maxTokens, messages: allMessages },
      parseChoices, signal, tag, 'OpenAI',
    );
    if (text) return text;
  }

  if (anthropicKey) {
    const text = await _fetchProvider(
      ANTHROPIC_BASE,
      { 'x-api-key': anthropicKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      { model: ANTHROPIC_MODEL, max_tokens: maxTokens, system: systemPrompt, messages: userMessages },
      d => d.content?.find(b => b.type === 'text')?.text,
      signal, tag, 'Anthropic',
    );
    if (text) return text;
  }

  return null;
}
