// server/server.js
const express = require('express');
const app = express();

// --- middleware -------------------------------------------------------------
app.use(express.json());

// Dev-only CORS (only if you open pages from another origin than Vite proxy)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Choose provider by env: 'ollama' (default) or 'bedrock'
const PROVIDER = process.env.PROVIDER || 'ollama';

// Compose a single prompt from system + context + user prompt
function buildPrompt(userPrompt, system, context) {
  const sys = (system && system.trim())
    ? system.trim()
    : 'You are a helpful hospital assistant. Use ONLY the provided context. If unknown, say you do not know.';
  const ctx = (context && context.trim())
    ? `\n\n# Context (authoritative)\n${context}\n`
    : `\n\n# Context\n(none)\n`;
  return `${sys}${ctx}\n# Question\n${userPrompt}\n\n# Answer`;
}

// --- Non-streaming chat -----------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const {
      prompt: userPrompt = '',
      system = '',
      context = '',
      conversation_id,
      tenant_id
    } = req.body || {};
    if (!userPrompt) return res.status(400).json({ error: 'prompt required' });

    const composed = buildPrompt(userPrompt, system, context);
    let text = '';

    if (PROVIDER === 'bedrock') {
      const { BedrockRuntimeClient, InvokeModelCommand } =
        require('@aws-sdk/client-bedrock-runtime');
      const client  = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        messages: [{ role: 'user', content: [{ type: 'text', text: composed }] }]
      };

      const cmd  = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });
      const resp = await client.send(cmd);
      const body = JSON.parse(Buffer.from(resp.body).toString('utf8'));
      text = (body?.content || []).filter(c => c.type === 'text').map(c => c.text).join('') || '';
    } else {
      // OLLAMA local (ensure `ollama serve` running)
      const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
      const r = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: composed, stream: false })
      });
      const data = await r.json();
      text = data?.response || '';
    }

    res.json({ text, conversation_id, tenant_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'chat failure' });
  }
});

// --- Streaming chat (SSE) ---------------------------------------------------
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { prompt: userPrompt = '', system = '', context = '' } = req.body || {};
    if (!userPrompt) { res.status(400).end('prompt required'); return; }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const composed = buildPrompt(userPrompt, system, context);

    if (PROVIDER === 'bedrock') {
      // Simple “one-chunk” stream for Bedrock (non-stream API)
      const { BedrockRuntimeClient, InvokeModelCommand } =
        require('@aws-sdk/client-bedrock-runtime');
      const client  = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        messages: [{ role: 'user', content: [{ type: 'text', text: composed }] }]
      };

      const cmd  = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });
      const resp = await client.send(cmd);
      const body = JSON.parse(Buffer.from(resp.body).toString('utf8'));
      const text = (body?.content || []).filter(c => c.type === 'text').map(c => c.text).join('') || '';

      res.write(`data: ${JSON.stringify(text)}\n\n`);
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
      return;
    }

    // OLLAMA true streaming
    const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const upstream = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: composed, stream: true })
    });

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let idx;

      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;

        let obj; try { obj = JSON.parse(line); } catch { continue; }

        if (obj.response) {
          res.write(`data: ${JSON.stringify(obj.response)}\n\n`);
        }
        if (obj.done) {
          clearInterval(ping);
          res.write('event: done\ndata: [DONE]\n\n');
          res.end();
          return;
        }
      }
    }
  } catch (e) {
    console.error(e);
    try { res.write('event: error\ndata: "stream error"\n\n'); } catch {}
    res.end();
  }
});

// --- Start ------------------------------------------------------------------
const port = process.env.PORT || 8787;
app.listen(port, () =>
  console.log(`API listening on http://localhost:${port} (provider=${PROVIDER})`)
);