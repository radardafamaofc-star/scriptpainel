import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface XuiServerConfig {
  url: string;
  api_key: string;
  api_version?: string;
  use_proxy?: boolean;
}

async function tryFetch(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Conexão expirou (timeout 15s)');
    }
    throw e;
  }
}

function buildUrlsToTry(baseUrl: string): string[] {
  const clean = baseUrl.replace(/\/+$/, '');
  const urls: string[] = [];

  // Original URL as-is
  urls.push(`${clean}/api.php`);
  urls.push(`${clean}/player_api.php`);

  // Strip path, keep host:port
  try {
    const parsed = new URL(clean);
    if (parsed.pathname && parsed.pathname !== '/') {
      const root = `${parsed.protocol}//${parsed.host}`;
      urls.push(`${root}/api.php`);
      urls.push(`${root}/player_api.php`);
    }
  } catch {}

  return urls;
}

async function xuiRequest(
  config: XuiServerConfig,
  action: string,
  params: Record<string, string> = {}
) {
  const baseUrls = buildUrlsToTry(config.url);

  // XUI One accepts both api_key and username/password auth styles.
  // We'll try api_key as query param first, then as POST body.
  const authVariants = [
    // Variant 1: api_key as query param (some XUI One versions)
    (qs: URLSearchParams) => { qs.set('api_key', config.api_key); },
    // Variant 2: api_key as "token" param
    (qs: URLSearchParams) => { qs.set('token', config.api_key); },
  ];

  console.log(`[XUI] Testing ${baseUrls.length} base URLs x ${authVariants.length} auth variants for action: ${action}`);

  let lastError: Error | null = null;

  for (const baseEndpoint of baseUrls) {
    // === Try GET with different auth params ===
    for (const setAuth of authVariants) {
      const qs = new URLSearchParams();
      setAuth(qs);
      qs.set('action', action);
      if (config.api_version) qs.set('api_version', config.api_version);
      for (const [k, v] of Object.entries(params)) qs.set(k, v);

      const url = `${baseEndpoint}?${qs.toString()}`;
      try {
        console.log(`[XUI] GET: ${url.replace(config.api_key, '***')}`);
        const response = await tryFetch(url);

        if (response.status === 404) { console.log(`[XUI] 404`); continue; }
        if (response.status === 403) { console.log(`[XUI] 403 Forbidden`); continue; }

        const text = await response.text();
        if (!text || text.trim() === '') { console.log(`[XUI] Empty`); continue; }
        if (text.includes('<html') || text.includes('<!DOCTYPE')) { console.log(`[XUI] HTML page`); continue; }

        try {
          const json = JSON.parse(text);
          console.log(`[XUI] ✅ Success via GET`);
          return json;
        } catch {
          // Non-JSON but not HTML - might be an error message
          console.log(`[XUI] Non-JSON response: ${text.substring(0, 100)}`);
          continue;
        }
      } catch (e) {
        if (e.message.includes('timeout') || e.message.includes('expirou')) throw e;
        lastError = e;
        console.log(`[XUI] GET error: ${e.message}`);
      }
    }

    // === Try POST with form data ===
    try {
      const formData = new URLSearchParams();
      formData.set('api_key', config.api_key);
      formData.set('action', action);
      if (config.api_version) formData.set('api_version', config.api_version);
      for (const [k, v] of Object.entries(params)) formData.set(k, v);

      console.log(`[XUI] POST: ${baseEndpoint.replace(config.api_key, '***')}`);
      const response = await tryFetch(baseEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (response.status === 404) { console.log(`[XUI] POST 404`); continue; }

      const text = await response.text();
      if (!text || text.trim() === '') continue;
      if (text.includes('<html') || text.includes('<!DOCTYPE')) continue;

      try {
        const json = JSON.parse(text);
        console.log(`[XUI] ✅ Success via POST`);
        return json;
      } catch {
        console.log(`[XUI] POST Non-JSON: ${text.substring(0, 100)}`);
      }
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('expirou')) throw e;
      lastError = e;
      console.log(`[XUI] POST error: ${e.message}`);
    }

    // === Try POST with JSON body ===
    try {
      const jsonBody = JSON.stringify({
        api_key: config.api_key,
        action,
        api_version: config.api_version || '1',
        ...params,
      });

      console.log(`[XUI] POST JSON: ${baseEndpoint}`);
      const response = await tryFetch(baseEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBody,
      });

      if (response.status === 404) continue;

      const text = await response.text();
      if (!text || text.trim() === '') continue;
      if (text.includes('<html') || text.includes('<!DOCTYPE')) continue;

      try {
        const json = JSON.parse(text);
        console.log(`[XUI] ✅ Success via POST JSON`);
        return json;
      } catch {
        console.log(`[XUI] POST JSON Non-JSON: ${text.substring(0, 100)}`);
      }
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('expirou')) throw e;
      lastError = e;
    }
  }

  throw lastError || new Error(
    `Não foi possível conectar ao XUI One. Verifique se a URL e a chave de API estão corretas.\n` +
    `Formato esperado: http://SEU_IP:PORTA ou http://SEU_IP:PORTA/subdir`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, server_id, server_config, xui_action, xui_params } = body;

    // ── Test connection (server not saved yet) ──
    if (action === 'test_connection') {
      if (!server_config?.url || !server_config?.api_key) {
        return new Response(JSON.stringify({ error: 'URL e API Key são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const data = await xuiRequest(server_config, 'user_info');
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: `Falha ao conectar: ${e.message}`,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Execute any XUI One API action on a saved server ──
    if (action === 'xui_command') {
      if (!server_id || !xui_action) {
        return new Response(JSON.stringify({ error: 'server_id e xui_action são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: server, error: srvError } = await serviceClient
        .from('servers')
        .select('*')
        .eq('id', server_id)
        .single();

      if (srvError || !server) {
        return new Response(JSON.stringify({ error: 'Servidor não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!server.api_key) {
        return new Response(JSON.stringify({ error: 'API Key não configurada neste servidor' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config: XuiServerConfig = {
        url: server.host,
        api_key: server.api_key,
        api_version: server.access_code || '1',
      };

      try {
        const data = await xuiRequest(config, xui_action, xui_params || {});

        if (xui_action === 'get_server_stats' || xui_action === 'user_info') {
          await serviceClient
            .from('servers')
            .update({ status: 'online' })
            .eq('id', server_id);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        await serviceClient
          .from('servers')
          .update({ status: 'offline' })
          .eq('id', server_id);

        return new Response(JSON.stringify({
          success: false,
          error: e.message,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
