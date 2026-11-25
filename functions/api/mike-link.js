// Hands the page a short-lived signed link for one call with Mike, the voice
// agent on this page. The ElevenLabs key and the agent's id are settings of the
// Pages project (ELEVENLABS_API_KEY, MIKE_AGENT_ID); neither is in this
// repository or ever sent to the browser.

const json = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function onRequestGet({ request, env }) {
  // Only this site's own pages may ask. Browsers send Sec-Fetch-Site on every
  // fetch; a request without it, or from another site, is refused.
  if (request.headers.get('Sec-Fetch-Site') !== 'same-origin') {
    return json({ error: 'forbidden' }, 403);
  }
  if (!env.ELEVENLABS_API_KEY || !env.MIKE_AGENT_ID) {
    return json({ error: 'unavailable' }, 503);
  }

  let res;
  try {
    res = await fetch(
      'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=' +
        encodeURIComponent(env.MIKE_AGENT_ID),
      { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } },
    );
  } catch (e) {
    return json({ error: 'unavailable' }, 502);
  }
  if (!res.ok) {
    return json({ error: res.status === 429 ? 'busy' : 'unavailable' }, res.status === 429 ? 429 : 502);
  }

  const data = await res.json().catch(() => null);
  if (!data || !data.signed_url) return json({ error: 'unavailable' }, 502);
  return json({ signedUrl: data.signed_url }, 200);
}

export function onRequest() {
  return json({ error: 'method' }, 405);
}
