/* Mike's call (local build, 2026-11-25).
   The phone rings on the page; the visitor answers; Mike drops them into a
   crisis; the page counts down the deadline he names, prints tomorrow's front
   page as he reads the headline, and offers the waitlist when the line goes dead.

   The page asks its own server for a signed link (/api/mike-link); the
   ElevenLabs client opens the call. The agent gets the chosen crisis as the
   dynamic variable crisis_id, and calls two client tools on this page:
   decision_made() and show_headline({ headline }). */
(() => {
  'use strict';
  const root = document.getElementById('mike');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const list = $('mcScenarioList'), eyebrow = $('mcEyebrow'), situation = $('mcSituation'), teaser = $('mcTeaser'), choiceLine = $('mcChoice');
  const clock = $('mcClock'), clockLabel = $('mcClockLabel'), clockTime = $('mcClockTime');
  const status = $('mcStatus'), answer = $('mcAnswer'), hangup = $('mcHangup');
  const words = $('mcWords'), transcript = $('mcTranscript'), note = $('mcNote');
  const after = $('mcAfter'), paper = $('mcPaper'), paperDate = $('mcPaperDate'), paperHeadline = $('mcPaperHeadline');
  const afterLead = $('mcAfterLead'), afterForm = $('mcAfterForm'), afterEmail = $('mcAfterEmail'), again = $('mcAgain');

  // No microphone API or no secure connection: the block stays hidden and the page is as before.
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.WebSocket) return;
  root.hidden = false;

  /* Marshall's situations (2026-11-25): the game's own scenarios cut down to ninety
     seconds. The id goes to the agent as crisis_id; each crisis's full text lives
     in the agent, never here. */
  const SCENARIOS = [
    { id: 'hormuz', title: 'The Hormuz Deadline', place: 'Strait of Hormuz · 04:10 local', line: 'Iran has shut the strait again. The ceasefire has forty days left.' },
    { id: 'taiwan', title: 'Invasion of Taiwan', place: 'Taiwan Strait · 05:40 local', line: 'China’s fleet left port an hour ago. It isn’t an exercise.' },
    { id: 'warhead', title: 'Loose Warhead', place: 'Islamabad · 02:15 local', line: 'A coup in Islamabad, and a warhead isn’t where it should be.' },
    { id: 'berlin', title: 'Agent in Jeopardy', place: 'Berlin · 23:30 local', line: 'A CIA officer burned in Berlin, holding proof she shouldn’t have.' },
  ];

  const DEADLINE = 90;   // seconds; the number Mike names
  const LIMIT = 170;     // seconds; the page ends the call here whatever happens
  const params = new URLSearchParams(location.search);
  const localhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const SIM = localhost && params.has('mikesim'); // a pretend call, for checking the page without placing one

  let chosen = 0, conversation = null, generation = 0, sdkPromise = null, controller = null;
  let connectTimer = null, limitTimer = null, clockTimer = null, clockStartTimer = null;
  let decided = false, headline = '', mikeTurns = 0, clockRunning = false, simTimers = [];

  /* ---------- the ring ---------- */
  // A stand-in two-tone ring made in the browser, until the app's own sound file arrives.
  const ring = (() => {
    let ctx = null, timer = null, stopAt = 0;
    function burst() {
      if (!ctx) return;
      const t = ctx.currentTime, g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.05);
      g.gain.setValueAtTime(0.07, t + 1.6);
      g.gain.linearRampToValueAtTime(0, t + 1.8);
      g.connect(ctx.destination);
      [440, 480].forEach((f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 1.85); });
    }
    return {
      start() {
        this.stop();
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        stopAt = Date.now() + 24000; // it doesn't ring for ever
        burst();
        timer = setInterval(() => { if (Date.now() > stopAt) this.stop(); else burst(); }, 4000);
      },
      stop() { clearInterval(timer); timer = null; if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; } },
    };
  })();

  // The app's own sounds (Marshall): the call-connected sound as the pick-up, and a click when the line closes.
  const sounds = { pickup: '/attached_assets/mike/establishedSound.m4a', out: '/attached_assets/mike/comms-click-out.wav' };
  function play(name) {
    try { const a = new Audio(sounds[name]); a.volume = 0.7; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }

  /* ---------- small helpers ---------- */
  const mmss = (s) => String(Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0');
  const say = (text) => { status.textContent = text || ''; };

  function renderScenarios() {
    list.replaceChildren(...SCENARIOS.map((sc, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mc-scenario'; b.textContent = sc.title;
      b.setAttribute('aria-pressed', String(i === chosen));
      b.addEventListener('click', () => { choose(i); ring.start(); });
      return b;
    }));
  }

  function choose(i) {
    chosen = i;
    [...list.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    situation.textContent = SCENARIOS[i].place;
    teaser.textContent = SCENARIOS[i].line;
  }

  function setState(state, message) {
    root.dataset.state = state;
    const active = state === 'asking' || state === 'connecting' || state === 'connected';
    eyebrow.textContent = { idle: 'Incoming', asking: 'Incoming', connecting: 'Putting you through…', connected: 'On the line', ended: 'Call ended', busy: 'Incoming', failed: 'Incoming', denied: 'Incoming' }[state];
    say(message != null ? message : { asking: 'Asking for your microphone…', connected: 'Mike’s on the line.' }[state] || '');
    answer.hidden = active || state === 'ended';
    answer.textContent = state === 'idle' ? 'Answer' : 'Try again';
    hangup.hidden = !active;
    note.hidden = active || state === 'ended';
    [...list.children].forEach((b) => { b.disabled = active; });
    words.hidden = state !== 'connected' && !(state === 'ended' && transcript.childElementCount);
    if (state !== 'connected') { clock.hidden = true; choiceLine.hidden = true; }
    teaser.hidden = active || state === 'ended';
    if (active) hangup.focus({ preventScroll: true });
  }

  /* ---------- the deadline clock ---------- */
  function startClock(token) {
    const began = Date.now();
    clock.hidden = false; clock.dataset.done = 'false';
    clockLabel.textContent = 'Decision in'; clockTime.textContent = mmss(DEADLINE);
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (token !== generation) return;
      const remaining = DEADLINE - Math.floor((Date.now() - began) / 1000);
      clockTime.textContent = mmss(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(clockTimer); clockTimer = null;
        clockLabel.textContent = 'Time’s up';
        say('Time’s up.');
        // Tell Mike, so he presses for an answer: a deadline that passed with nothing happening would break the spell.
        // It goes as a user message in square brackets (Marshall: a contextual update never makes him speak; his
        // prompt reads a bracketed line as the clock on the desk, not the President).
        try { if (conversation && conversation.sendUserMessage) conversation.sendUserMessage('[The ninety seconds are up.]'); } catch (e) {}
      }
    }, 250);
  }

  function decisionMade(choice) {
    if (decided) return;
    decided = true;
    const said = String(choice || '').trim().slice(0, 90);
    choiceLine.textContent = said; choiceLine.hidden = !said;
    clearTimeout(clockStartTimer); clearInterval(clockTimer); clockTimer = null;
    clock.hidden = false; clock.dataset.done = 'true';
    clockLabel.textContent = 'Decision made';
    say('');
  }

  /* ---------- the front page ---------- */
  function printHeadline(text) {
    headline = String(text || '').trim().replace(/^["“‘']+|["”’']+$/g, '').slice(0, 140);
    if (!headline) return;
    const tomorrow = new Date(Date.now() + 86400000);
    paperDate.textContent = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    paperHeadline.textContent = headline;
    after.hidden = false; paper.hidden = false;
    afterLead.hidden = true; afterForm.hidden = true; again.hidden = true;
    after.querySelectorAll('.mc-after-line, .mc-after-small').forEach((e) => { e.hidden = true; });
    say('Tomorrow’s front page: ' + headline);
  }

  function showAfter() {
    after.hidden = false;
    paper.hidden = !headline;
    afterLead.hidden = false; afterForm.hidden = false; again.hidden = false;
    after.querySelectorAll('.mc-after-line, .mc-after-small').forEach((e) => { e.hidden = false; });
    afterLead.textContent = decided || headline ? 'That was round one.' : 'The line went dead.';
    afterLead.focus({ preventScroll: true });
    (headline ? paper : afterLead).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------- the call ---------- */
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
    ring.stop();
    if (controller) controller.abort();
    controller = null;
    [connectTimer, limitTimer, clockStartTimer].forEach(clearTimeout);
    clearInterval(clockTimer); clockTimer = null;
    simTimers.forEach(clearTimeout); simTimers = [];
    const old = conversation; conversation = null;
    if (old) { try { await old.endSession(); } catch (e) {} }
  }

  function finish(state, message) {
    const wasConnected = root.dataset.state === 'connected';
    if (wasConnected) play('out');
    cleanup();
    setState(state, message);
    if (state === 'ended' && wasConnected) showAfter();
    else if (state !== 'ended') answer.focus({ preventScroll: true });
  }

  function onConnected(token) {
    if (token !== generation) return;
    clearTimeout(connectTimer);
    setState('connected');
    limitTimer = setTimeout(() => { if (token === generation) finish('ended'); }, LIMIT * 1000);
  }

  function onMikeSpoke(token, text) {
    if (token !== generation) return;
    const p = document.createElement('p');
    p.textContent = String(text || '');
    transcript.append(p); transcript.scrollTop = transcript.scrollHeight;
    // His first line names the deadline and waits for the caller; the second is the crisis. The clock starts
    // there, so a caller who hasn't answered yet loses no time before they know the problem (Marshall).
    mikeTurns++;
    if (mikeTurns === 2 && !decided && !clockRunning) { clockRunning = true; startClock(token); }
  }

  const BUSY = 'Mike’s in the Situation Room. Try again later, or join the waitlist below.';

  async function connect() {
    if (['asking', 'connecting', 'connected'].includes(root.dataset.state)) return;
    const token = ++generation;
    ring.stop();
    decided = false; headline = ''; mikeTurns = 0; clockRunning = false;
    transcript.replaceChildren(); clock.hidden = true; choiceLine.hidden = true; choiceLine.textContent = ''; after.hidden = true; paper.hidden = true;
    controller = new AbortController();
    document.querySelectorAll('video,audio').forEach((m) => m.pause());
    setState('asking');
    play('pickup'); // the press is what lets a browser play it
    if (SIM) { simulate(token); return; }
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
      if (!res.ok) { finish(res.status === 429 || res.status === 503 ? 'busy' : 'failed', res.status === 429 || res.status === 503 ? BUSY : 'The call could not connect. Please try again.'); return; }
      const { signedUrl } = await res.json();
      if (token !== generation) return;

      const session = await window.client.Conversation.startSession({
        signedUrl,
        dynamicVariables: { crisis_id: SCENARIOS[chosen].id },
        clientTools: {
          decision_made: (p) => { if (token === generation) decisionMade(p && p.choice); return 'ok'; },
          show_headline: (p) => { if (token === generation) printHeadline(p && p.headline); return 'shown'; },
        },
        preferHeadphonesForIosDevices: true,
        connectionDelay: { default: 500, android: 2000, ios: 1500 },
        onConnect: () => onConnected(token),
        onMessage: (m) => { if (m && m.source !== 'user') onMikeSpoke(token, m.message); },
        onDisconnect: () => {
          if (token !== generation) return;
          // Refused before it began (the day's calls are used up, or the line is full): say so kindly.
          if (root.dataset.state === 'connected') finish('ended'); else finish('busy', BUSY);
        },
        onError: () => { if (token === generation && root.dataset.state !== 'connected') finish('busy', BUSY); },
      });
      if (token !== generation) { try { await session.endSession(); } catch (e) {} return; }
      conversation = session;
    } catch (error) {
      if (token !== generation) return;
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) finish('denied', 'Allow microphone access in your browser, then try again.');
      else if (error && error.name === 'NotFoundError') finish('failed', 'No microphone was found on this device.');
      else if (root.dataset.state === 'connecting') finish('busy', BUSY);
      else finish('failed', 'The call could not connect. Please try again.');
    }
  }

  /* A pretend call on this Mac only (?mikesim, or ?mikesim=fast): no microphone, no network, no cost. */
  function simulate(token) {
    const k = params.get('mikesim') === 'fast' ? 0.05 : 1;
    const at = (s, fn) => simTimers.push(setTimeout(() => { if (token === generation) fn(); }, s * 1000 * k));
    at(0.5, () => setState('connecting'));
    at(1.5, () => onConnected(token));
    at(2, () => onMikeSpoke(token, 'Boss, it’s Mike. Sorry, there’s no good time for this. We’ve got a situation, and I need your decision in the next ninety seconds.'));
    at(8, () => onMikeSpoke(token, 'Iran has shut the strait again. Tanaka wants two destroyers in by morning. Benally wants you on the phone with their ambassador first.'));
    at(40, () => { decisionMade('A phone call to their ambassador'); onMikeSpoke(token, 'A phone call. All right. I’ll tell Tanaka to stand his ships down. He won’t thank you.'); });
    at(55, () => { printHeadline('President Blinks in Hormuz Standoff'); onMikeSpoke(token, 'Tomorrow’s Potomac Dispatch: “President Blinks in Hormuz Standoff.”'); });
    at(70, () => finish('ended'));
  }

  /* ---------- wiring ---------- */
  answer.addEventListener('click', connect);
  hangup.addEventListener('click', () => finish(root.dataset.state === 'connected' ? 'ended' : 'idle'));
  again.addEventListener('click', () => {
    after.hidden = true; paper.hidden = true; clock.hidden = true; transcript.replaceChildren();
    choose((chosen + 1) % SCENARIOS.length);
    setState('idle');
    root.scrollIntoView({ block: 'center' });
    answer.focus({ preventScroll: true });
  });
  // The sign-up under the front page hands the address to the page's own form, so there is one path for a sign-up.
  afterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const main = document.getElementById('signupForm'), email = document.getElementById('email');
    if (!main || !email) return;
    email.value = afterEmail.value.trim();
    document.getElementById('signup').scrollIntoView({ block: 'center' });
    if (main.requestSubmit) main.requestSubmit(); else main.dispatchEvent(new Event('submit', { cancelable: true }));
  });
  window.addEventListener('pagehide', cleanup);

  renderScenarios();
  choose(0);
  setState('idle');
})();
