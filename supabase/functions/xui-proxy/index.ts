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

async function xuiRequest(
  config: XuiServerConfig,
  action: string,
  params: Record<string, string> = {}
) {
  let baseUrl = config.url.replace(/\/+$/, '');

  // Build query params
  const qs = new URLSearchParams();
  qs.set('api_key', config.api_key);
  qs.set('action', action);
  if (config.api_version) qs.set('api_version', config.api_version);
  for (const [k, v] of Object.entries(params)) qs.set(k, v);
  const queryString = qs.toString();

  // XUI One API format: http://IP:PORT/accesscode/?api_key=KEY&action=...
  // The URL the user provides IS the base (including access code path).
  // We just append query params directly to it.
  const urlsToTry = [
    // Primary: URL as-is with query params (access code style)
    `${baseUrl}/?${queryString}`,
    // Without trailing slash
    `${baseUrl}?${queryString}`,
    // Legacy: api.php style
    `${baseUrl}/api.php?${queryString}`,
    `${baseUrl}/player_api.php?${queryString}`,
  ];

  // Also try root host with api.php
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== '/') {
      const root = `${parsed.protocol}//${parsed.host}`;
      urlsToTry.push(`${root}/api.php?${queryString}`);
      urlsToTry.push(`${root}/player_api.php?${queryString}`);
    }
  } catch {}

  console.log(`[XUI] Trying ${urlsToTry.length} URL patterns for action: ${action}`);

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    try {
      console.log(`[XUI] GET: ${url.replace(config.api_key, '***')}`);
      const response = await tryFetch(url);

      if (response.status === 404) {
        console.log(`[XUI] 404`);
        continue;
      }
      if (response.status === 403) {
        console.log(`[XUI] 403 Forbidden`);
        continue;
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        console.log(`[XUI] Empty response`);
        continue;
      }

      // Skip HTML pages (login pages, etc.)
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        console.log(`[XUI] HTML page, skipping`);
        continue;
      }

      try {
        const json = JSON.parse(text);
        console.log(`[XUI] ✅ Success! Keys: ${Object.keys(json).slice(0, 10).join(', ')}`);
        if (action === 'get_packages') {
          // Log full first entry to understand structure
          const entries = Object.entries(json);
          if (entries.length > 0) {
            const [firstKey, firstVal] = entries[0];
            console.log(`[XUI] Package entry key="${firstKey}" fields=${JSON.stringify(firstVal).substring(0, 500)}`);
          }
        }
        return json;
      } catch {
        console.log(`[XUI] Non-JSON: ${text.substring(0, 100)}`);
        continue;
      }
    } catch (e) {
      if (e.message.includes('timeout') || e.message.includes('expirou')) throw e;
      lastError = e;
      console.log(`[XUI] Error: ${e.message}`);
    }
  }

  throw lastError || new Error(
    `Não foi possível conectar ao XUI One. Verifique se a URL e a chave de API estão corretas.\n` +
    `Formato esperado: http://SEU_IP:PORTA/accesscode`
  );
}

function getXuiError(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const error = payload.error;
  if (error !== undefined && error !== null) {
    const message = String(error).trim();
    if (message && message.toLowerCase() !== 'none' && message.toLowerCase() !== 'null') return message;
  }

  const status = payload.status;
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (normalized.includes('error') || normalized.includes('fail')) return status;
  }

  return null;
}

function isXuiSuccess(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;

  if (payload.success === true || payload.ok === true || payload.result === true) return true;

  const status = payload.status;
  if (status === true || status === 1) return true;
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (normalized.includes('success') || normalized === 'ok') return true;
    if (normalized.includes('error') || normalized.includes('fail')) return false;
  }

  // Responses like get_packages may not have status/error and return object maps.
  return !getXuiError(payload) && Object.keys(payload).length > 0;
}

async function provisionUserOnXui(config: XuiServerConfig, rawParams: Record<string, string> = {}) {
  const username = rawParams.username?.trim();
  const password = rawParams.password?.trim();
  if (!username || !password) {
    throw new Error('username e password são obrigatórios para provisionar no XUI');
  }

  const maxConnections = rawParams.max_connections || '1';
  const expDate = rawParams.exp_date || '';
  const isTrial = rawParams.is_trial || '0';

  const bouquetRaw = rawParams.bouquet || rawParams.bouquets || '';
  const bouquetIds = bouquetRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  let resolvedBouquetIds = [...bouquetIds];
  if (!resolvedBouquetIds.length) {
    try {
      const packages = await xuiRequest(config, 'get_packages');
      const packageList = Array.isArray(packages) ? packages : Object.values(packages || {});
      const firstPackage = packageList.find((pkg: any) => pkg && (pkg.id || pkg.package_id));
      const firstPackageId = firstPackage ? String(firstPackage.id || firstPackage.package_id) : '';
      if (firstPackageId) {
        resolvedBouquetIds = [firstPackageId];
        console.log(`[XUI] Auto-selected package for provision: ${firstPackageId}`);
      }
    } catch (e) {
      console.log(`[XUI] Could not auto-select package: ${e.message}`);
    }
  }

  const primaryBouquet = resolvedBouquetIds[0] || bouquetRaw;
  const bouquetsSelected = resolvedBouquetIds.length ? JSON.stringify(resolvedBouquetIds) : '[]';

  const actionAttempts = [
    {
      action: 'user_create',
      params: {
        username,
        password,
        max_connections: maxConnections,
        exp_date: expDate,
        is_trial: isTrial,
        bouquet: primaryBouquet,
      },
    },
    {
      action: 'create_line',
      params: {
        username,
        password,
        max_connections: maxConnections,
        exp_date: expDate,
        is_trial: isTrial,
        bouquets_selected: bouquetsSelected,
      },
    },
    {
      action: 'create_user',
      params: {
        username,
        password,
        max_connections: maxConnections,
        exp_date: expDate,
        is_trial: isTrial,
        bouquet: bouquetRaw,
      },
    },
  ];

  let lastError = 'A API do XUI rejeitou a criação do usuário';

  for (const attempt of actionAttempts) {
    const data = await xuiRequest(config, attempt.action, attempt.params);
    const error = getXuiError(data);

    if (!error && isXuiSuccess(data)) {
      console.log(`[XUI] Provision success with action: ${attempt.action}`);
      return { action: attempt.action, data };
    }

    lastError = error || `Ação ${attempt.action} retornou status inválido`;
    console.log(`[XUI] Provision failed (${attempt.action}): ${lastError}`);
  }

  throw new Error(lastError);
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

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roleData } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const allowedRoles = ['admin', 'reseller', 'reseller_master', 'reseller_ultra'];
    if (!roleData || !allowedRoles.includes(roleData.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json();
    const { action, server_id, server_config, xui_action, xui_params } = body;

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
        if (xui_action === 'user_create') {
          const provisionResult = await provisionUserOnXui(config, xui_params || {});
          return new Response(JSON.stringify({
            success: true,
            data: provisionResult.data,
            action_used: provisionResult.action,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const data = await xuiRequest(config, xui_action, xui_params || {});
        const commandError = getXuiError(data);
        if (commandError) throw new Error(commandError);

        if (xui_action === 'get_server_stats' || xui_action === 'user_info') {
          await serviceClient.from('servers').update({ status: 'online' }).eq('id', server_id);
        }

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        if (xui_action === 'get_server_stats' || xui_action === 'user_info') {
          await serviceClient.from('servers').update({ status: 'offline' }).eq('id', server_id);
        }

        return new Response(JSON.stringify({ success: false, error: e.message }), {
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
