export default {
  async fetch(request) {

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, x-deploy-token, x-deploy-target',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'memail worker active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);

    // ── DEPLOY ENDPOINT ──
    if (url.pathname === '/deploy') {
      try {
        const deployToken = request.headers.get('x-deploy-token');
        const target = request.headers.get('x-deploy-target') || 'index.html';
        const body = await request.json();
        const { content, github_token, owner, repo, message } = body;

        if (!deployToken || deployToken !== 'memail-deploy-2026') {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get current file SHA
        const shaResp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${target}`,
          { headers: { 'Authorization': `token ${github_token}`, 'User-Agent': 'memail-worker' } }
        );
        const shaData = await shaResp.json();
        const sha = shaData.sha;

        // Push new content
        const pushResp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${target}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `token ${github_token}`,
              'Content-Type': 'application/json',
              'User-Agent': 'memail-worker'
            },
            body: JSON.stringify({
              message: message || `Auto-deploy: ${new Date().toUTCString()}`,
              content: btoa(unescape(encodeURIComponent(content))),
              sha
            })
          }
        );

        const pushData = await pushResp.json();
        if (pushResp.ok) {
          return new Response(JSON.stringify({
            success: true,
            commit: pushData.commit?.sha?.slice(0,10),
            url: `https://vsrinath81.github.io/memail/`
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          return new Response(JSON.stringify({ error: pushData.message }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── CLAUDE AI ENDPOINT ──
    try {
      let body;
      try { body = await request.json(); }
      catch(e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const apiKey = request.headers.get('x-api-key') || '';
      if (!apiKey.startsWith('sk-ant')) {
        return new Response(JSON.stringify({ error: 'Invalid API key' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      body.stream = false;
      body.max_tokens = Math.min(body.max_tokens || 2000, 2000);

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body)
      });

      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
}
