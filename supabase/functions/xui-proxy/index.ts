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
  params: Record<string, string | string[]> = {}
) {
  let baseUrl = config.url.replace(/\/+$/, '');

  // Build query params — manually to avoid URLSearchParams encoding [] as %5B%5D
  const parts: string[] = [];
  parts.push(`api_key=${encodeURIComponent(config.api_key)}`);
  parts.push(`action=${encodeURIComponent(action)}`);
  if (config.api_version) parts.push(`api_version=${encodeURIComponent(config.api_version)}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const value of v) parts.push(`${k}=${encodeURIComponent(value)}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  const queryString = parts.join('&');

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

function payloadContainsUsername(payload: any, username: string): boolean {
  if (payload === null || payload === undefined) return false;

  if (typeof payload === 'string') {
    return payload.trim() === username;
  }

  if (Array.isArray(payload)) {
    return payload.some((item) => payloadContainsUsername(item, username));
  }

  if (typeof payload === 'object') {
    if (typeof payload.username === 'string' && payload.username.trim() === username) return true;
    return Object.values(payload).some((value) => payloadContainsUsername(value, username));
  }

  return false;
}

async function verifyProvisionedUser(config: XuiServerConfig, username: string): Promise<boolean> {
  const checks: Array<{ action: string; params?: Record<string, string | string[]> }> = [
    { action: 'get_line', params: { username } },
    { action: 'get_user', params: { username } },
    { action: 'get_lines', params: { search: username } },
    { action: 'get_users', params: { search: username } },
    { action: 'get_lines' },
    { action: 'get_users' },
  ];

  for (const check of checks) {
    try {
      const data = await xuiRequest(config, check.action, check.params || {});
      if (payloadContainsUsername(data, username)) {
        console.log(`[XUI] Verification success via ${check.action} for ${username}`);
        return true;
      }
    } catch {
      // ignore verification endpoint mismatch
    }
  }

  return false;
}

async function getOrCreateXuiMemberId(
  config: XuiServerConfig,
  userId: string,
  displayName: string,
  serviceClient: any,
): Promise<string> {
  // Check if we already have a cached member_id
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('xui_member_id')
    .eq('user_id', userId)
    .single();

  if (profile?.xui_member_id) {
    console.log(`[XUI] Cached member_id=${profile.xui_member_id} for ${displayName}`);
    return profile.xui_member_id;
  }

  const normalizeUsername = (value: string): string => {
    const cleaned = (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase()
      .trim();

    if (cleaned) return cleaned.slice(0, 24);
    return `rev_${userId.slice(0, 8)}`;
  };

  const usernameCandidates = Array.from(new Set([
    (displayName || '').trim(),
    normalizeUsername(displayName || ''),
    `rev_${userId.slice(0, 8)}`,
  ].filter(Boolean)));

  const saveMemberId = async (memberId: string) => {
    await serviceClient
      .from('profiles')
      .update({ xui_member_id: memberId })
      .eq('user_id', userId);
  };

  const listUsers = async (): Promise<any[]> => {
    const usersPayload = await xuiRequest(config, 'get_users');
    const data = usersPayload?.data || usersPayload;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      return Object.values(data).filter((item) => item && typeof item === 'object');
    }
    return [];
  };

  const findMatchingUser = (users: any[]): any | null => {
    const byName = users.find((u: any) => {
      if (!u || typeof u !== 'object') return false;
      const username = String(u.username || '').trim().toLowerCase();
      return usernameCandidates.some((candidate) => username === String(candidate).toLowerCase());
    });
    return byName || null;
  };

  // 1) Find existing user first
  try {
    const users = await listUsers();
    console.log(`[XUI] get_users returned ${users.length} users, searching for ${JSON.stringify(usernameCandidates)}`);

    const existing = findMatchingUser(users);
    if (existing) {
      const memberId = String(existing.member_id || existing.id || '').trim();
      if (memberId) {
        await saveMemberId(memberId);
        console.log(`[XUI] Found existing member_id=${memberId} for ${displayName}`);
        return memberId;
      }
    }
  } catch (e) {
    console.log(`[XUI] Could not search existing users: ${e.message}`);
  }

  // 2) Discover admin owner_id (needed to create sub-users)
  let ownerId = '1';
  try {
    const info = await xuiRequest(config, 'user_info');
    const infoData = info?.data || info?.user_info || info?.data?.user_info || {};
    if (infoData?.id) ownerId = String(infoData.id);
    console.log(`[XUI] user_info owner_id=${ownerId}`);
  } catch (e) {
    console.log(`[XUI] user_info failed, using owner_id=1: ${e.message}`);
  }

  // 3) Create reseller user with proper group mapping
  const xuiUsername = normalizeUsername(displayName || '');
  const createPassword = `panel_${Date.now()}`;

  const createAttempts: Array<Record<string, string>> = [
    { username: xuiUsername, password: createPassword, member_group_id: '2', owner_id: ownerId },
    { username: xuiUsername, password: createPassword, member_group_id: '2' },
    { username: xuiUsername, password: createPassword, member_group_id: '2', is_reseller: '1' },
    { username: xuiUsername, password: createPassword, member_group_id: '2', type: 'reseller' },
  ];

  for (const params of createAttempts) {
    try {
      const result = await xuiRequest(config, 'create_user', params);
      const status = String(result?.status || '').toUpperCase();
      const error = String(result?.error || '');
      console.log(`[XUI] create_user status=${status || 'n/a'} error=${error || 'n/a'} params=${JSON.stringify(params)}`);

      const directMemberId = String(result?.data?.member_id || result?.data?.id || result?.member_id || result?.id || '').trim();
      if (directMemberId) {
        await saveMemberId(directMemberId);
        console.log(`[XUI] Created reseller member_id=${directMemberId} username=${xuiUsername}`);
        return directMemberId;
      }

      // If API says success/exist but no id in response, re-fetch user list to resolve id
      if (status.includes('SUCCESS') || status.includes('EXIST')) {
        const users = await listUsers();
        const created = findMatchingUser(users);
        const fetchedMemberId = String(created?.member_id || created?.id || '').trim();
        if (fetchedMemberId) {
          await saveMemberId(fetchedMemberId);
          console.log(`[XUI] Resolved created member_id=${fetchedMemberId} after create_user`);
          return fetchedMemberId;
        }
      }
    } catch (e) {
      console.log(`[XUI] create_user failed with params=${JSON.stringify(params)}: ${e.message}`);
    }
  }

  console.log(`[XUI] WARNING: Could not resolve member_id for ${displayName}, line will be owned by API key admin`);
  return '';
}

async function provisionUserOnXui(
  config: XuiServerConfig,
  rawParams: Record<string, string> = {},
  memberId: string = '',
) {
  const username = rawParams.username?.trim();
  const password = rawParams.password?.trim();
  if (!username || !password) {
    throw new Error('username e password são obrigatórios para provisionar no XUI');
  }

  const maxConnections = rawParams.max_connections || '1';
  const expDate = rawParams.exp_date || '';

  const expUnix = Number(expDate);
  const nowUnix = Math.floor(Date.now() / 1000);
  const remainingHours = Number.isFinite(expUnix) && expUnix > nowUnix
    ? Math.max(1, Math.ceil((expUnix - nowUnix) / 3600))
    : 24;
  const remainingDays = Math.max(1, Math.ceil(remainingHours / 24));

  const bouquetRaw = rawParams.bouquet || rawParams.bouquets || '';
  const bouquetIds = bouquetRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  let resolvedBouquetIds = [...bouquetIds];
  if (!resolvedBouquetIds.length) {
    try {
      const packages = await xuiRequest(config, 'get_packages');
      const packageList = (Array.isArray(packages) ? packages : Object.values(packages || {}))
        .filter((pkg: any) => pkg && typeof pkg === 'object');

      const getPackageId = (pkg: any): string => String(pkg.id || pkg.package_id || pkg.packageId || '').trim();
      const isTrialPackage = (pkg: any): boolean => {
        const flags = [pkg.is_trial, pkg.trial, pkg.trial_package];
        return flags.some((value) => {
          const n = String(value ?? '').toLowerCase();
          return value === true || value === 1 || n === '1' || n === 'true';
        });
      };

      const allWithId = packageList.filter((pkg: any) => !!getPackageId(pkg));
      // Pick package with most bouquets for maximum content coverage
      const sorted = [...allWithId].sort((a: any, b: any) => {
        const bqA = Array.isArray(a.bouquets) ? a.bouquets : (typeof a.bouquets === 'string' ? JSON.parse(a.bouquets || '[]') : []);
        const bqB = Array.isArray(b.bouquets) ? b.bouquets : (typeof b.bouquets === 'string' ? JSON.parse(b.bouquets || '[]') : []);
        return bqB.length - bqA.length;
      });
      const picked = sorted[0];
      const pickedId = picked ? getPackageId(picked) : '';

      if (pickedId && picked) {
        // Extract bouquet IDs from the package's bouquets field
        let packageBouquets: string[] = [];
        try {
          const rawBouquets = picked.bouquets;
          if (typeof rawBouquets === 'string') {
            packageBouquets = JSON.parse(rawBouquets).map(String);
          } else if (Array.isArray(rawBouquets)) {
            packageBouquets = rawBouquets.map(String);
          }
        } catch {}

        if (packageBouquets.length > 0) {
          resolvedBouquetIds = packageBouquets;
          console.log(`[XUI] Auto-selected package: ${pickedId} with bouquets: ${JSON.stringify(packageBouquets)}`);
        } else {
          resolvedBouquetIds = [pickedId];
          console.log(`[XUI] Auto-selected package: ${pickedId} (no bouquets field, using package id)`);
        }
      }
    } catch (e) {
      console.log(`[XUI] Could not auto-select package: ${e.message}`);
    }
  }

  const bouquetsSelected = resolvedBouquetIds.length ? JSON.stringify(resolvedBouquetIds) : '[]';

  // Based on real XUI One docs: action=create_line with bouquets_selected and exp_date
  // DO NOT send is_trial — it makes the line show as "Trial" in XUI
  // Pass member_id to assign correct owner
  const baseParams: Record<string, string> = {
    username,
    password,
    max_connections: maxConnections,
  };
  if (memberId) baseParams.member_id = memberId;

  const actionAttempts: Array<{ action: string; params: Record<string, string | string[]> }> = [
    {
      action: 'create_line',
      params: { ...baseParams, exp_date: `${remainingHours}hours`, 'bouquets_selected[]': resolvedBouquetIds },
    },
    {
      action: 'create_line',
      params: { ...baseParams, exp_date: `${remainingDays}days`, 'bouquets_selected[]': resolvedBouquetIds },
    },
    {
      action: 'create_line',
      params: { ...baseParams, exp_date: expDate, 'bouquets_selected[]': resolvedBouquetIds },
    },
    {
      action: 'create_user',
      params: { ...baseParams, exp_date: `${remainingHours}hours`, 'bouquets_selected[]': resolvedBouquetIds },
    },
  ];

  let lastError = 'A API do XUI rejeitou a criação do usuário';

  for (const attempt of actionAttempts) {
    const data = await xuiRequest(config, attempt.action, attempt.params);
    const error = getXuiError(data);

    if (!error && isXuiSuccess(data)) {
      const verified = await verifyProvisionedUser(config, username);
      if (verified) {
        console.log(`[XUI] Provision success with action: ${attempt.action}`);
        return { action: attempt.action, data };
      }

      lastError = 'XUI retornou sucesso, mas o usuário não foi encontrado após criação';
      console.log(`[XUI] Provision uncertain (${attempt.action}): ${lastError}`);
      continue;
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
          // Resolve XUI member_id for the calling user
          const { data: profile } = await serviceClient
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .single();
          const displayName = profile?.display_name || user.email || `panel_${user.id.substring(0, 8)}`;

          const xuiMemberId = await getOrCreateXuiMemberId(config, user.id, displayName, serviceClient);
          console.log(`[XUI] Provisioning line with member_id=${xuiMemberId} for ${displayName}`);

          const provisionResult = await provisionUserOnXui(config, xui_params || {}, xuiMemberId);
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
