import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface XuiServerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

async function xuiRequest(server: XuiServerConfig, endpoint: string, params: Record<string, string> = {}) {
  const baseUrl = `http://${server.host}:${server.port}/api.php`;
  const url = new URL(baseUrl);
  url.searchParams.set('username', server.username);
  url.searchParams.set('password', server.password);
  url.searchParams.set('action', endpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`XUI API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, server_id, server_config } = body;

    // For test_connection, use provided config directly (server not saved yet)
    if (action === 'test_connection') {
      if (!server_config) {
        return new Response(JSON.stringify({ error: 'server_config is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const data = await xuiRequest(server_config, 'server');
        return new Response(JSON.stringify({
          success: true,
          server_info: {
            version: data.server_info?.version || 'Unknown',
            uptime: data.server_info?.uptime || 'N/A',
            total_users: data.server_info?.total_users || 0,
            active_cons: data.server_info?.active_cons || 0,
            total_cons: data.server_info?.total_cons || 0,
          },
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

    // For actions using a saved server
    if (action === 'server_info' || action === 'get_users' || action === 'get_active_connections') {
      if (!server_id) {
        return new Response(JSON.stringify({ error: 'server_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: server, error: srvError } = await supabase
        .from('servers')
        .select('*')
        .eq('id', server_id)
        .single();

      if (srvError || !server) {
        return new Response(JSON.stringify({ error: 'Server not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!server.username || !server.password) {
        return new Response(JSON.stringify({ error: 'Server credentials missing' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config: XuiServerConfig = {
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
      };

      let endpoint = 'server';
      if (action === 'get_users') endpoint = 'user';
      if (action === 'get_active_connections') endpoint = 'active_cons';

      const data = await xuiRequest(config, endpoint);

      // Update server status in DB
      if (action === 'server_info' && data.server_info) {
        await supabase
          .from('servers')
          .update({
            status: 'online',
            uptime: data.server_info.uptime || '0%',
          })
          .eq('id', server_id);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
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
