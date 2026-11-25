/* A short voice call with Mike, the page's AI Chief of Staff. The page asks its
   own server for a signed link (/api/mike-link), then the ElevenLabs client
   opens the call. The call is stopped here after LIMIT seconds. */
(() => {
  'use strict';
  const root = document.getElementById('mikeCall');
  if (!root) return;
  const start = document.getElementById('mikeCallStart');
  const end = document.getElementById('mikeCallEnd');
  const status = document.getElementById('mikeCallStatus');
  const timer = document.getElementById('mikeCallTimer');
  const note = document.getElementById('mikeCallNote');

  // No microphone API or no secure connection: the block stays hidden.
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.WebSocket) return;
  root.hidden = false;

  const LIMIT = 170; // seconds; the agent ends the call itself at about two minutes
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let conversation = null, clock = null, generation = 0, sdkPromise = null, connectTimer = null, controller = null;

  const WAITLIST = ' You can still join the waitlist below.';
  const MESSAGES = {
    idle: '',
    asking: 'Asking for your microphone…',
    connecting: 'Calling Mike…',
    connected: 'You’re speaking with Mike.',
    ended: 'The call has ended. The waitlist is just below.',
    busy: 'Mike can’t take a call right now.' + WAITLIST,
    denied: 'Allow microphone access in your browser, then try again.',
    failed: 'The call could not connect. Please try again.',
  };

  function setState(state, message) {
    root.dataset.state = state;
    status.textContent = message == null ? MESSAGES[state] : message;
    const active = state === 'asking' || state === 'connecting' || state === 'connected';
    start.hidden = active;
    end.hidden = !active;
    end.textContent = state === 'connected' ? 'End call' : 'Cancel';
    start.textContent = state === 'idle' ? 'Call Mike' : state === 'busy' ? 'Try again' : state === 'ended' ? 'Call again' : 'Try again';
    timer.hidden = state !== 'connected';
    note.hidden = active;
    if (active) end.focus({ preventScroll: true });
  }

  function left(s) {
    return String(Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0');
  }

  function startClock(token) {
    const began = Date.now();
    let warned = false;
    timer.textContent = left(LIMIT);
    clearInterval(clock);
    clock = setInterval(() => {
      if (token !== generation) return;
      const remaining = LIMIT - Math.floor((Date.now() - began) / 1000);
      timer.textContent = left(Math.max(0, remaining));
      if (remaining <= 30 && !warned) { warned = true; status.textContent = 'Thirty seconds left.'; }
      if (remaining <= 0) finish('ended');
    }, 1000);
  }

  function loadSDK() {
    if (window.client && window.client.Conversation) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/js/elevenlabs-sdk.js?v=2026-11-25';
        script.onload = resolve;
        script.onerror = () => { sdkPromise = null; script.remove(); reject(new Error('sdk')); };
        document.head.append(script);
      });
    }
    return sdkPromise;
  }

  async function cleanup() {
    generation++;
    if (controller) controller.abort();
    controller = null;
    clearTimeout(connectTimer);
    clearInterval(clock);
    clock = null;
    const old = conversation;
    conversation = null;
    if (old) { try { await old.endSession(); } catch (e) {} }
  }

  function finish(state, message) {
    cleanup();
    setState(state, message);
    start.focus({ preventScroll: true });
  }

  async function connect() {
    if (['asking', 'connecting', 'connected'].includes(root.dataset.state)) return;
    const token = ++generation;
    controller = new AbortController();
    document.querySelectorAll('video,audio').forEach((m) => m.pause());
    setState('asking');
    if (local) { finish('failed', 'Calls work on the published site.'); return; }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => t.stop());
      if (token !== generation) return;
      setState('connecting');
      connectTimer = setTimeout(() => { if (token === generation) finish('failed', 'The connection timed out. Please try again.'); }, 20000);

      const [res] = await Promise.all([
        fetch('/api/mike-link', { signal: controller.signal, cache: 'no-store' }),
        loadSDK(),
      ]);
      if (token !== generation) return;
      if (!res.ok) { finish(res.status === 429 || res.status === 503 ? 'busy' : 'failed'); return; }
      const { signedUrl } = await res.json();
      if (token !== generation) return;

      const session = await window.client.Conversation.startSession({
        signedUrl,
        preferHeadphonesForIosDevices: true,
        connectionDelay: { default: 500, android: 2000, ios: 1500 },
        onConnect: () => {
          if (token !== generation) return;
          clearTimeout(connectTimer);
          setState('connected');
          startClock(token);
        },
        onDisconnect: () => {
          if (token !== generation) return;
          // Refused before it began (the day's calls are used up, or the line is full): say so kindly.
          finish(root.dataset.state === 'connected' ? 'ended' : 'busy');
        },
        onError: () => { if (token === generation && root.dataset.state !== 'connected') finish('busy'); },
      });
      if (token !== generation) { try { await session.endSession(); } catch (e) {} return; }
      conversation = session;
    } catch (error) {
      if (token !== generation) return;
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) finish('denied');
      else if (error && error.name === 'NotFoundError') finish('failed', 'No microphone was found on this device.');
      else finish(root.dataset.state === 'connecting' ? 'busy' : 'failed');
    }
  }

  start.addEventListener('click', connect);
  end.addEventListener('click', () => finish(root.dataset.state === 'connected' ? 'ended' : 'idle'));
  window.addEventListener('pagehide', cleanup);
  setState('idle');
})();
