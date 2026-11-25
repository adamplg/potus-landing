// When a call with Mike has closed, the page sends its conversation id here and
// the conversation is deleted at ElevenLabs, so no transcript of it is kept.
// Only conversations of this page's own agent can be deleted through it.

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://api.elevenlabs.io/v1/convai/conversations/';

export async function onRequestPost({ request, env }) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site !== 'same-origin') return json({ error: 'forbidden' }, 403);
  if (!env.ELEVENLABS_API_KEY || !env.MIKE_AGENT_ID) return json({ error: 'unavailable' }, 503);

  let id = '';
  try { id = String((await request.json()).id || ''); } catch (e) {}
  if (!/^conv_[A-Za-z0-9]{10,64}$/.test(id)) return json({ error: 'bad id' }, 400);

  const headers = { 'xi-api-key': env.ELEVENLABS_API_KEY };
  // ElevenLabs needs a moment to finish a call before it can be read or deleted.
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await sleep(2500);
    let look;
    try { look = await fetch(API + id, { headers }); } catch (e) { continue; }
    if (look.status === 404 || look.status === 409) continue;
    if (!look.ok) return json({ error: 'unavailable' }, 502);
    const info = await look.json().catch(() => null);
    if (!info || info.agent_id !== env.MIKE_AGENT_ID) return json({ error: 'forbidden' }, 403);
    if (info.status && !['done', 'failed'].includes(info.status)) continue; // still being processed
    let gone;
    try { gone = await fetch(API + id, { method: 'DELETE', headers }); } catch (e) { continue; }
    if (gone.status === 204 || gone.ok) return json({ deleted: true }, 200);
    if (gone.status === 404) return json({ deleted: true }, 200);
    if (gone.status !== 409) return json({ error: 'unavailable' }, 502);
  }
  return json({ deleted: false }, 202);
}

export function onRequest() {
  return json({ error: 'method' }, 405);
}
