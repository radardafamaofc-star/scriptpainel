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

async function tryFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
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

async function xuiRequest(
  config: XuiServerConfig,
  action: string,
  params: Record<string, string> = {}
) {
  let baseUrl = config.url.replace(/\/+$/, '');
  
  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.set('api_key', config.api_key);
  queryParams.set('action', action);
  if (config.api_version) {
    queryParams.set('api_version', config.api_version);
  }
  for (const [k, v] of Object.entries(params)) {
    queryParams.set(k, v);
  }
  const qs = queryParams.toString();

  // Try multiple URL patterns that XUI One panels commonly use
  const urlsToTry = [
    `${baseUrl}/api.php?${qs}`,
    `${baseUrl}/player_api.php?${qs}`,
  ];

  // Also try stripping the path and going to root
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== '/') {
      const rootUrl = `${parsed.protocol}//${parsed.host}`;
      urlsToTry.push(`${rootUrl}/api.php?${qs}`);
      urlsToTry.push(`${rootUrl}/player_api.php?${qs}`);
    }
  } catch {}

  console.log(`[XUI] Trying ${urlsToTry.length} URL patterns for action: ${action}`);

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    try {
      console.log(`[XUI] Trying: ${url.replace(config.api_key, '***')}`);
      const response = await tryFetch(url);

      if (response.status === 404) {
        console.log(`[XUI] 404 for: ${url.replace(config.api_key, '***')}`);
        continue; // Try next URL pattern
      }

      if (!response.ok) {
        throw new Error(`XUI API HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      
      // Some XUI panels return empty response for invalid endpoints
      if (!text || text.trim() === '') {
        console.log(`[XUI] Empty response for: ${url.replace(config.api_key, '***')}`);
        continue;
      }

      try {
        return JSON.parse(text);
      } catch {
        // If it's HTML (login page), skip
        if (text.includes('<html') || text.includes('<!DOCTYPE')) {
          console.log(`[XUI] Got HTML response, skipping`);
          continue;
        }
        throw new Error(`XUI API retornou resposta inválida: ${text.substring(0, 200)}`);
      }
    } catch (e) {
      lastError = e;
      if (e.message.includes('timeout') || e.message.includes('expirou')) {
        throw e; // Don't retry on timeout
      }
      console.log(`[XUI] Error for URL: ${e.message}`);
    }
  }

  throw lastError || new Error(
    `Não foi possível conectar ao XUI One. Verifique se a URL está correta.\n` +
    `Formato esperado: http://SEU_IP:PORTA ou http://SEU_IP:PORTA/subdir\n` +
    `URLs tentadas: ${urlsToTry.length}`
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
