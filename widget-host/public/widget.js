// widget-host/public/widget.js

// Minimal utilities
const uid = () => ([1e7]+-1e3+-4e3+-8e3+-1e11)
  .replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

class AqilaChat extends HTMLElement {
  static get observedAttributes() { return ['tenant']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = {
      cfg: null,
      convId: null,
      messages: [], // {role:'user'|'assistant', text:string}
      collapsed: false
    };
  }

  _toggle() {
    this.state.collapsed = !this.state.collapsed;
    const w = this._q('.widget');
    const hdr = this._q('#hdr');
    if (this.state.collapsed) {
        w.classList.add('collapsed');
        hdr.setAttribute('aria-expanded', 'false');
    } else {
        w.classList.remove('collapsed');
        hdr.setAttribute('aria-expanded', 'true');
    }
  }

  connectedCallback() {
    this._ensureConvId();
    this._renderSkeleton();

    if (this.hasAttribute('floating')) {
      this.state.collapsed = true;
      this._q('#hdr').setAttribute('aria-expanded','false');
      this._q('.widget').classList.add('collapsed');
    }

    this._loadConfig();
  }

  attributeChangedCallback(name, _old, _new) {
    if (name === 'tenant' && this.isConnected) this._loadConfig();
  }

  get tenant() { return this.getAttribute('tenant'); }

  _ensureConvId() {
    const key = `aqila:${this.tenant || 'default'}:conversation_id`;
    let id = localStorage.getItem(key);
    if (!id) { id = uid(); localStorage.setItem(key, id); }
    this.state.convId = id;
  }

  async _loadConfig() {
    if (!this.tenant) return;
    const url = `./tenants/${this.tenant}/current/config.json`; // in prod: CDN URL
    try {
      const res = await fetch(url, { cache: 'no-store' });
      this.state.cfg = await res.json();
      this._applyTheme();
      this._render();
    } catch (e) {
      console.error('Config load failed', e);
      this._setStatus('Failed to load tenant config');
    }
  }

  _applyTheme() {
    const color = this.state?.cfg?.branding?.base_color || '#1f6feb';
    this.shadowRoot.host.style.setProperty('--brand', color);
  }

  _renderSkeleton() {
    this.shadowRoot.innerHTML = `
       <style>
        :host { --brand:#1f6feb; display:inline-block; color-scheme: light; 
              font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
        textarea, input, select, button { -webkit-appearance: none; appearance: none; }
        .widget { width: 360px; border:1px solid #ccc; border-radius:12px; overflow:hidden;
                box-shadow: 0 8px 24px rgba(0,0,0,.08); }
        /* Make header a real button */
        .hdr {
        background: var(--brand); color:#fff; padding:12px; display:flex; align-items:center; gap:10px;
        width:100%; border:0; cursor:pointer; text-align:left;
        }
        .hdr img { height:24px; }
        .hdr .name { font-weight:600; font-size:14px; }
        .body { background:#fff; display:flex; flex-direction:column; height:420px; }
        .widget.collapsed .body { display:none; }
        .widget.collapsed .hdr { border-bottom-left-radius:12px; border-bottom-right-radius:12px; }
        .transcript { flex:1; padding:12px; overflow:auto; }
        .msg { margin-bottom:10px; }
        .msg.user { text-align:right; }
        .msg .bubble { display:inline-block; padding:10px 12px; border-radius: 14px; max-width: 85%; }
        .user .bubble { background:#e6f2ff; color:#003366; }
        .assistant .bubble { background:#f5f5f5; color:#222; }
        .composer { border-top:1px solid #eee; padding:8px; display:flex; gap:8px; }
        textarea { flex:1; resize:none; min-height:44px; max-height:120px; font:inherit; padding:10px;
                   border:1px solid #ddd; border-radius:10px; outline:none; background-color: #fff;
                   color: #111; border: 1px solid #ddd;}
        button { background: var(--brand); color:#fff; border:none; padding:0 16px; border-radius:10px; font-weight:600; }
        button[disabled]{ opacity:.6 }
        .status { font-size:12px; color:#666; padding:6px 12px; }
        /* Accessibility focus */
        button:focus, textarea:focus { outline: 3px solid rgba(0,0,0,.35); outline-offset:2px; }
        /* Live region for SR */
        .sr-live { position:absolute; left:-9999px; top:auto; width:1px; height:1px; overflow:hidden; }
        *, *::before, *::after { box-sizing: border-box; }
        :host([floating]) {
          position: fixed;
          right: max(16px, env(safe-area-inset-right));
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 2147483000; }
        :host([floating]) .widget {
          width: min(420px, calc(100vw - 32px));
        }
        @media (max-width: 520px) {
          :host([floating]) .widget {
            width: min(100vw - 16px, 420px);
          }
        }
        :host([floating]) .body {
          height: min(60vh, 520px);
        }
        .widget { transition: transform .18s ease, opacity .18s ease; }

      </style>
      <div class="widget" role="complementary" aria-label="Hospital chat">
        <button class="hdr" id="hdr" type="button" aria-expanded="true" aria-controls="panel">
        <img alt="" />
        <div class="name">Chat</div>
        </button>
        <div class="body" id="panel">
        <div class="transcript" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="status" aria-live="polite"></div>
        <div class="composer">
            <textarea aria-label="Message. Press Enter to send, Shift+Enter for new line"></textarea>
            <button type="button">Send</button>
        </div>
        </div>
        <div class="sr-live" aria-live="polite"></div>
    </div>
    `;
    const ta = this._q('textarea');
    const sendBtn = this._q('.composer button');
    const hdrBtn  = this._q('#hdr');
    ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
    });
    sendBtn.addEventListener('click', () => this._send());
    hdrBtn.addEventListener('click', () => this._toggle());
  }

  _q(sel) { return this.shadowRoot.querySelector(sel); }

  _render() {
    const name = this.state?.cfg?.branding?.name || 'Chat';
    const logo = this.state?.cfg?.branding?.logo_url || '';
    this._q('.name').textContent = name;
    this._q('.hdr img').src = logo;

    const log = this._q('.transcript');
    log.innerHTML = '';
    for (const m of this.state.messages) {
      const div = document.createElement('div');
      div.className = `msg ${m.role}`;
      div.innerHTML = `<div class="bubble">${m.text}</div>`;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  }

  _setStatus(t) { this._q('.status').textContent = t || ''; }

  async _send() {
    const ta = this._q('textarea');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    this.state.messages.push({ role: 'user', text });
    this._render();
    this._setStatus('Thinking…');

    const api = this.state?.cfg?.chatbot_api || {};
    const base = api.base_url || '';
    const urlChat   = base ? `${base}/api/chat`        : '/api/chat';
    const urlStream = base ? `${base}/api/chat/stream` : '/api/chat/stream';

    try {
      if ((api.transport || '').toLowerCase() === 'sse') {
        await this._streamResponse(urlStream, text);
      } else {
        const resp = await fetch(urlChat, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: text, conversation_id: this.state.convId, tenant_id: this.tenant })
        });
        if (!resp.ok) throw new Error('backend error');
        const data = await resp.json();
        this.state.messages.push({ role: 'assistant', text: data?.text || '(no reply)' });
        this._render();
      }
    } catch (e) {
      console.warn('Backend unavailable; falling back to fake stream', e);
      await this._fakeStreamResponse(text);
    } finally {
      this._setStatus('');
    }
  }

  async _fakeStreamResponse(userText) {
    const reply = `You said: "${userText}". This is a simulated assistant response streaming chunk by chunk.`;
    const chunks = reply.match(/.{1,8}/g) || [];
    const msg = { role: 'assistant', text: '' };
    this.state.messages.push(msg);
    for (const c of chunks) {
      await new Promise(r => setTimeout(r, 60));
      msg.text += c;
      this._render();
      this._announce(c); // SR live updates with debounce would be nicer
    }
  }

  async _streamResponse(url, prompt) {
    // create the empty assistant message up front
    const msg = { role: 'assistant', text: '' };
    this.state.messages.push(msg);
    this._render();

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!resp.ok || !resp.body) throw new Error('stream failed');

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // parse "data: ...\n\n" events
      let sep;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep).trim();   // e.g., "data: \"foo\"" or "event: done"
        buffer = buffer.slice(sep + 2);

        if (!raw) continue;
        if (raw.startsWith('event: done')) return;

        if (raw.startsWith('data:')) {
          const payload = raw.slice(5).trim();
          // we sent JSON-stringified tokens; try to parse, else append as-is
          try { msg.text += JSON.parse(payload); } catch { msg.text += payload; }
          this._render();
        }
      }
    }
  }

  _announce(text) {
    const sr = this._q('.sr-live');
    sr.textContent = text;
  }
}

if (!customElements.get('aqila-chat')) {
  customElements.define('aqila-chat', AqilaChat);
}
