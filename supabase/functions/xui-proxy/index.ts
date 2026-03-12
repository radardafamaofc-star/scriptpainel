import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface XuiServerConfig {
  host: string;
  port: number;
  access_code: string;
  api_key: string;
  https?: boolean;
}

async function xuiRequest(
  server: XuiServerConfig,
  action: string,
  params: Record<string, string> = {}
) {
  const protocol = server.https ? 'https' : 'http';
  const baseUrl = `${protocol}://${server.host}:${server.port}/${server.access_code}/`;
  const url = new URL(baseUrl);
  url.searchParams.set('api_key', server.api_key);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`XUI API HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`XUI API returned invalid JSON: ${text.substring(0, 200)}`);
    }
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Conexão expirou (timeout 15s)');
    }
    throw e;
  }
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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;

    // Use service role to check admin
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
      if (!server_config?.host || !server_config?.access_code || !server_config?.api_key) {
        return new Response(JSON.stringify({ error: 'host, access_code e api_key são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const data = await xuiRequest(server_config, 'get_server_stats');
        return new Response(JSON.stringify({
          success: true,
          data,
        }), {
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

      if (!server.access_code || !server.api_key) {
        return new Response(JSON.stringify({ error: 'Access Code ou API Key não configurados neste servidor' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config: XuiServerConfig = {
        host: server.host,
        port: server.port,
        access_code: server.access_code,
        api_key: server.api_key,
      };

      try {
        const data = await xuiRequest(config, xui_action, xui_params || {});

        // Auto-update server status on server_stats calls
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
        // Mark server offline on connection failure
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
