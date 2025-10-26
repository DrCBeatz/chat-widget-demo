//  server/server.js

const express = require('express');
const app = express();
app.use(express.json());

// Choose provider by env: PROVIDER=ollama (default) or PROVIDER=bedrock
const PROVIDER = process.env.PROVIDER || 'ollama';

// Only if you need CORS:
app.use((req,res,next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt = '', conversation_id, tenant_id } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    let text = '';
    if (PROVIDER === 'bedrock') {
      const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
      const client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1'
      });
      // Anthropic Claude 3 Haiku (verify model id for your region/account)
      const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
      const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      };
      const cmd = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });
      const resp = await client.send(cmd);
      const body = JSON.parse(Buffer.from(resp.body).toString('utf8'));
      // Anthropic-style response
      text = (body?.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('') || '';
    } else {
      // OLLAMA local (ensure `ollama serve` running)
      const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
      const r = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
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

app.post('/api/chat/stream', async (req, res) => {
  try {
    const { prompt = '' } = req.body || {};
    if (!prompt) { res.status(400).end('prompt required'); return; }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const upstream = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true })
    });

    // Forward each streamed line from Ollama as SSE "data: ..."
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // optional keepalive ping
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
        // Ollama streams JSON per line
        let obj; try { obj = JSON.parse(line); } catch { continue; }

        if (obj.response) {
          // Send the token to the browser
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
    // Send an error event so client can fall back
    try { res.write(`event: error\ndata: ${JSON.stringify('stream error')}\n\n`); } catch {}
    res.end();
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`API listening on http://localhost:${port} (provider=${PROVIDER})`));