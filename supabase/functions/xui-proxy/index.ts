import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface XuiServerConfig {
  url: string;
  api_key: string;
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
    if (e.name === 'AbortError') throw new Error('Conexão expirou (timeout 15s)');
    throw e;
  }
}

function buildParamEntries(params: Record<string, string | string[]> = {}): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const value of v) parts.push(`${k}=${encodeURIComponent(value)}`);
    } else {
      parts.push(`${k}=${encodeURIComponent(v)}`);
    }
  }
  return parts;
}

function isWriteAction(action: string): boolean {
  const n = String(action || '').toLowerCase();
  return ['create_','edit_','delete_','enable_','disable_','ban_','unban_','convert_',
    'install_','start_','stop_','reload_','clear_','flush_','add_','kill_']
    .some(p => n.startsWith(p)) || n === 'mysql_query';
}

// Generic XUI API request (used for reads + non-provisioning writes)
async function xuiRequest(
  config: XuiServerConfig,
  action: string,
  params: Record<string, string | string[]> = {},
) {
  const baseUrl = config.url.replace(/\/+$/, '');
  const actionQuery = `api_key=${encodeURIComponent(config.api_key)}&action=${encodeURIComponent(action)}`;
  const paramParts = buildParamEntries(params);
  const queryString = [actionQuery, ...paramParts].join('&');
  const postBody = paramParts.join('&');

  const attempts: Array<{ method: string; url: string; init?: RequestInit }> = [];

  if (isWriteAction(action)) {
    attempts.push({
      method: 'POST', url: `${baseUrl}/?${actionQuery}`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: postBody },
    });
  }
  attempts.push({ method: 'GET', url: `${baseUrl}/?${queryString}` });

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      console.log(`[XUI] ${attempt.method}: ${attempt.url.replace(config.api_key, '***')}`);
      const response = await tryFetch(attempt.url, attempt.init || {});
      if (response.status === 404 || response.status === 403) continue;
      const text = await response.text();
      if (!text?.trim() || text.includes('<html') || text.includes('<!DOCTYPE')) continue;
      const json = JSON.parse(text);
      console.log(`[XUI] ✅ Keys: ${Object.keys(json).slice(0, 10).join(', ')}`);
      return json;
    } catch (e: any) {
      if (e.message?.includes('timeout') || e.message?.includes('expirou')) throw e;
      lastError = e;
    }
  }
  throw lastError || new Error('Não foi possível conectar ao XUI One.');
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
    const n = status.toLowerCase();
    if (n.includes('success') || n === 'ok' || n.includes('exists')) return null;
    if (n.includes('error') || n.includes('fail') || n.includes('invalid') || n.includes('denied')) return status;
  }
  return null;
}

function parseIdList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === '[]') return [];
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(v => String(v).trim()).filter(Boolean); } catch {}
  }
  return raw.split(',').map(v => v.replace(/[\[\]\s]/g, '').trim()).filter(Boolean);
}

function toNumericIdList(value: unknown, fallback: string[]): string[] {
  const ids = parseIdList(value).map((v) => v.replace(/\D/g, '').trim()).filter(Boolean);
  if (!ids.length) return fallback;
  return Array.from(new Set(ids));
}

function extractLineRows(payload: any): any[] {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data.filter(r => r && typeof r === 'object');
  if (data && typeof data === 'object') {
    if (data.id || data.line_id || data.username) return [data];
    const values = Object.values(data).filter(r => r && typeof r === 'object');
    if (values.length) return values;
  }
  return payload && typeof payload === 'object' ? [payload] : [];
}

function isLineActive(row: any): boolean {
  const enabled = String(row?.enabled ?? '').trim().toLowerCase();
  const adminEnabled = String(row?.admin_enabled ?? '').trim().toLowerCase();
  const falseLike = new Set(['0', 'false', 'disabled', 'inactive', 'off', 'no']);
  if (enabled && falseLike.has(enabled)) return false;
  if (adminEnabled && falseLike.has(adminEnabled)) return false;
  return true;
}

async function resolveLineIdByUsername(config: XuiServerConfig, username: string): Promise<string> {
  const checks = [
    { action: 'get_line', params: { username }, label: `get_line(username=${username})` },
    { action: 'get_lines', params: { search: username }, label: `get_lines(search=${username})` },
  ];
  for (const check of checks) {
    try {
      const data = await xuiRequest(config, check.action, check.params);
      const rows = extractLineRows(data);
      const match = rows.find((r: any) => String(r?.username || '').trim() === username);
      const candidate = match || rows[0];
      const lineId = String(candidate?.id || candidate?.line_id || '').trim();
      if (lineId) {
        console.log(`[XUI] Resolved line_id=${lineId} via ${check.label}`);
        return lineId;
      }
    } catch {}
  }
  return '';
}

function normalizeUnixTimestamp(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return String(Math.floor(numeric > 1e12 ? numeric / 1000 : numeric));
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed) && parsed > 0) return String(Math.floor(parsed / 1000));

  return '';
}

async function getLineRowById(config: XuiServerConfig, lineId: string): Promise<any | null> {
  try {
    const finalLine = await xuiRequest(config, 'get_line', { id: lineId });
    const rows = extractLineRows(finalLine);
    return rows.find((r: any) => String(r?.id || '').trim() === lineId) || rows[0] || null;
  } catch {
    return null;
  }
}

async function waitForLinePresence(
  config: XuiServerConfig,
  lineId: string,
  username: string,
  maxAttempts = 3,
  delayMs = 700,
): Promise<any | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (lineId) {
      const byId = await getLineRowById(config, lineId);
      if (byId) return byId;
    }
    if (username) {
      const resolvedId = await resolveLineIdByUsername(config, username);
      if (resolvedId) {
        const byUsername = await getLineRowById(config, resolvedId);
        if (byUsername) return byUsername;
      }
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

// Resolve package for create_line:
// - If value is numeric, treat as direct XUI package id
// - Otherwise, treat as internal plan id and fetch plans.package_id
async function resolveXuiPackageId(serviceClient: any, packageOrPlanId: string): Promise<string> {
  const raw = String(packageOrPlanId || '').trim();
  if (!raw) return '';

  if (/^\d+$/.test(raw)) return raw;

  const { data: plan, error } = await serviceClient
    .from('plans')
    .select('package_id')
    .eq('id', raw)
    .maybeSingle();

  if (error) {
    console.log(`[XUI] WARNING: failed to resolve plan package_id for plan id ${raw}: ${error.message}`);
    return '';
  }

  const resolved = String(plan?.package_id || '').trim();
  if (!resolved) {
    console.log(`[XUI] WARNING: plan ${raw} has empty package_id`);
    return '';
  }

  return resolved;
}

// Login to XUI panel using API key to get a session cookie
async function xuiPanelLogin(baseUrl: string, apiKey: string): Promise<string> {
  // Try authenticating via the API key - XUI may set a session
  const resp = await tryFetch(`${baseUrl}/?api_key=${encodeURIComponent(apiKey)}&action=user_info`, {
    method: 'GET',
    redirect: 'manual',
  });
  const raw = resp.headers.get('set-cookie') || '';
  const cookies = raw.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim()).filter(Boolean);
  console.log(`[XUI] Panel auth via API key: status=${resp.status} cookies=${cookies.length > 0 ? 'YES' : 'NO'}`);
  return cookies.join('; ');
}

async function fetchPackageBouquets(
  config: XuiServerConfig,
  packageId: string,
): Promise<{ bouquets: string[]; outputs: string[] }> {
  try {
    const data = await xuiRequest(config, 'get_packages');
    const pkgs = data?.data || data;
    const list: any[] = Array.isArray(pkgs) ? pkgs
      : (pkgs && typeof pkgs === 'object' ? Object.values(pkgs).filter(p => p && typeof p === 'object') : []);
    const pkg = list.find((p: any) => String(p?.id || '') === packageId);
    if (pkg) {
      const bouquets = parseIdList(pkg.bouquet || pkg.bouquets);
      const outputs = parseIdList(pkg.output || pkg.outputs || pkg.allowed_outputs);
      console.log(`[XUI] Package ${packageId}: bouquets=${JSON.stringify(bouquets)} outputs=${JSON.stringify(outputs)}`);
      return { bouquets, outputs };
    }
    console.log(`[XUI] Package ${packageId} not found in ${list.length} packages`);
  } catch (e: any) {
    console.log(`[XUI] Failed to fetch packages: ${e.message}`);
  }
  return { bouquets: [], outputs: [] };
}

async function provisionUserOnXui(
  server: any,
  rawParams: Record<string, string> = {},
  serviceClient: any,
) {
  const username = rawParams.username?.trim();
  const password = rawParams.password?.trim();
  if (!username || !password) throw new Error('username e password são obrigatórios');

  const baseUrl = String(server.host || '').replace(/\/+$/, '');
  const apiKey = server.api_key || '';
  const config: XuiServerConfig = { url: baseUrl, api_key: apiKey };
  const maxConnections = String(rawParams.max_connections || '1').trim() || '1';

  // 1. Resolve package_id from plans table
  let packageId = '';
  const planId = String(rawParams.plan_id || '').trim();
  const fallbackPackage = String(rawParams.package_id || rawParams.package || '').trim();

  if (planId && serviceClient) {
    const { data: plan, error: planErr } = await serviceClient
      .from('plans').select('package_id').eq('id', planId).maybeSingle();
    packageId = String(plan?.package_id || '').trim();
    console.log(`[XUI] PLAN LOOKUP: plan_id=${planId} => package_id=${packageId} error=${planErr?.message || 'none'}`);
  }
  if (!packageId && fallbackPackage) {
    packageId = serviceClient ? await resolveXuiPackageId(serviceClient, fallbackPackage) : fallbackPackage;
  }
  console.log('PACKAGE ID:', packageId);

  // 2. Fetch bouquets and outputs from XUI package
  let bouquets: string[] = [];
  let outputs: string[] = [];
  if (packageId && apiKey) {
    const pkgInfo = await fetchPackageBouquets(config, packageId);
    bouquets = pkgInfo.bouquets;
    outputs = pkgInfo.outputs;
  }

  // 3. Format exp_date as "YYYY-MM-DD"
  const rawExpDate = rawParams.exp_date || rawParams.expiry_date || '';
  let expDateFormatted = '';
  if (rawExpDate) {
    const raw = String(rawExpDate).trim();
    let d: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      expDateFormatted = raw;
    } else if (/^\d+$/.test(raw)) {
      const ts = Number(raw);
      d = new Date(ts > 1e12 ? ts : ts * 1000);
    } else {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) d = new Date(parsed);
    }
    if (d && !expDateFormatted) {
      expDateFormatted =
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
  }

  // 4. Login to XUI panel
  const panelUser = server.username || '';
  const panelPass = server.password || '';
  if (!panelUser || !panelPass) {
    throw new Error('Username/password do painel XUI não configurados no servidor');
  }
  const sessionCookie = await xuiPanelLogin(baseUrl, panelUser, panelPass);
  if (!sessionCookie) {
    throw new Error('Falha no login do painel XUI. Verifique username/password do servidor.');
  }

  // 5. Build form data for POST /post.php (replicating browser behavior)
  const formParts: string[] = [
    'action=line',
    'referer=lines',
    `username=${encodeURIComponent(username)}`,
    `password=${encodeURIComponent(password)}`,
    'member_id=1',
    `max_connections=${encodeURIComponent(maxConnections)}`,
  ];
  if (expDateFormatted) {
    formParts.push(`exp_date=${encodeURIComponent(expDateFormatted)}`);
  }
  if (bouquets.length) {
    formParts.push(`bouquets_selected=${encodeURIComponent(JSON.stringify(bouquets))}`);
  }
  for (const o of outputs) {
    formParts.push(`access_output[]=${encodeURIComponent(o)}`);
  }

  const postBody = formParts.join('&');
  const postUrl = `${baseUrl}/post.php`;

  console.log(`[XUI] POST_URL: ${postUrl}`);
  console.log(`[XUI] POST_PAYLOAD: ${postBody}`);

  // 6. Send POST request
  const response = await tryFetch(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': sessionCookie,
    },
    body: postBody,
  });

  const responseText = await response.text();
  console.log(`[XUI] POST_RESPONSE: ${responseText}`);

  let result: any = {};
  try {
    result = JSON.parse(responseText);
  } catch {
    if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
      throw new Error('Resposta HTML recebida - sessão pode ter expirado');
    }
  }

  const err = getXuiError(result);
  if (err) throw new Error(err);

  // 7. Resolve line_id
  let createdLineId = String(result?.data?.id || result?.id || result?.line_id || '').trim();
  if (!createdLineId) {
    createdLineId = await resolveLineIdByUsername(config, username);
  }

  // 8. Verify final state
  const finalRow = createdLineId ? await waitForLinePresence(config, createdLineId, username, 2, 500) : null;
  const finalUsername = String(finalRow?.username || username).trim();
  const finalLineId = String(finalRow?.id || finalRow?.line_id || createdLineId).trim();
  const active = finalRow ? isLineActive(finalRow) : true;

  console.log(
    `[XUI] Final state: line_id=${finalLineId} username=${finalUsername} bouquet=${finalRow?.bouquet || '?'} allowed_outputs=${finalRow?.allowed_outputs || '?'} active=${active}`,
  );

  return {
    action: 'post_php' as const,
    data: {
      ...result,
      data: {
        ...(typeof result?.data === 'object' && result?.data ? result.data : {}),
        id: finalLineId,
        username: finalUsername,
      },
    },
    line_id: finalLineId,
    username: finalUsername,
    account_active: active,
  };
}

// Helper to resolve or create XUI member_id (kept for reseller mirroring)
function normalizeUsername(v: string) {
  const c = (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase().trim();
  return c ? c.slice(0, 24) : '';
}

async function getOrCreateXuiMemberId(
  config: XuiServerConfig,
  userId: string,
  displayName: string,
  serviceClient: any,
): Promise<string> {
  const { data: profile } = await serviceClient
    .from('profiles').select('xui_member_id').eq('user_id', userId).single();
  if (profile?.xui_member_id) return profile.xui_member_id;

  const makeUsername = (v: string) => {
    const c = normalizeUsername(v);
    return c || `rev_${userId.slice(0, 8)}`;
  };

  const candidates = Array.from(new Set([(displayName || '').trim(), makeUsername(displayName || ''), `rev_${userId.slice(0, 8)}`].filter(Boolean)));
  const saveMemberId = async (id: string) => { await serviceClient.from('profiles').update({ xui_member_id: id }).eq('user_id', userId); };

  try {
    const usersPayload = await xuiRequest(config, 'get_users');
    const data = usersPayload?.data || usersPayload;
    const users = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.values(data).filter(i => i && typeof i === 'object') : []);
    const existing = users.find((u: any) => {
      const un = String(u?.username || '').trim().toLowerCase();
      return candidates.some(c => un === String(c).toLowerCase());
    });
    if (existing) {
      const id = String(existing.member_id || existing.id || '').trim();
      if (id) { await saveMemberId(id); return id; }
    }
  } catch {}

  let ownerId = '1';
  try {
    const info = await xuiRequest(config, 'user_info');
    const d = info?.data || info?.user_info || {};
    if (d?.id) ownerId = String(d.id);
  } catch {}

  const xuiUsername = makeUsername(displayName || '');
  const createPassword = `panel_${Date.now()}`;
  try {
    const result = await xuiRequest(config, 'create_user', { username: xuiUsername, password: createPassword, member_group_id: '2', owner_id: ownerId });
    const id = String(result?.data?.member_id || result?.data?.id || result?.member_id || result?.id || '').trim();
    if (id) { await saveMemberId(id); return id; }
    const status = String(result?.status || '').toUpperCase();
    if (status.includes('SUCCESS') || status.includes('EXIST')) {
      const usersPayload = await xuiRequest(config, 'get_users');
      const data = usersPayload?.data || usersPayload;
      const users = Array.isArray(data) ? data : Object.values(data || {}).filter(i => i && typeof i === 'object');
      const created = users.find((u: any) => String(u?.username || '').trim().toLowerCase() === xuiUsername.toLowerCase());
      const fetchedId = String(created?.member_id || created?.id || '').trim();
      if (fetchedId) { await saveMemberId(fetchedId); return fetchedId; }
    }
  } catch {}

  console.log(`[XUI] WARNING: Could not resolve member_id for ${displayName}`);
  return '';
}

async function appendSystemLog(
  serviceClient: any,
  payload: { type: 'info' | 'success' | 'warning' | 'error'; action: string; detail?: string; user_id?: string },
) {
  try {
    await serviceClient.from('system_logs').insert({
      type: payload.type,
      action: payload.action,
      detail: String(payload.detail || '').slice(0, 2000),
      user_id: payload.user_id || null,
    });
  } catch (e: any) {
    console.log(`[XUI] Failed to write system_logs: ${e.message}`);
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roleData } = await serviceClient
      .from('user_roles').select('role').eq('user_id', user.id).single();

    const allowedRoles = ['admin', 'reseller', 'reseller_master', 'reseller_ultra'];
    if (!roleData || !allowedRoles.includes(roleData.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, server_id, server_config, xui_action, xui_params } = body;

    if (action === 'test_connection') {
      if (!server_config?.url || !server_config?.api_key) {
        return new Response(JSON.stringify({ error: 'URL e API Key são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const data = await xuiRequest(server_config, 'user_info');
        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: `Falha ao conectar: ${e.message}` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'xui_command') {
      if (!server_id || !xui_action) {
        return new Response(JSON.stringify({ error: 'server_id e xui_action são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: server, error: srvError } = await serviceClient
        .from('servers').select('*').eq('id', server_id).single();
      if (srvError || !server) {
        return new Response(JSON.stringify({ error: 'Servidor não encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!server.api_key) {
        return new Response(JSON.stringify({ error: 'API Key não configurada neste servidor' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config: XuiServerConfig = { url: server.host, api_key: server.api_key };

      try {
        if (xui_action === 'user_create') {
          const profileLabel = String(
            user.user_metadata?.display_name ||
            user.user_metadata?.name ||
            user.email ||
            `user_${user.id.slice(0, 8)}`
          );
          // Resolve member_id but we won't use it for create_line (member_id=0)
          await getOrCreateXuiMemberId(config, user.id, profileLabel, serviceClient);

          await appendSystemLog(serviceClient, {
            type: 'info', action: 'XUI provisioning iniciado',
            detail: `server_id=${server_id} username=${xui_params?.username || 'n/a'} package_id=${xui_params?.package_id || 'auto'}`,
            user_id: user.id,
          });

          const result = await provisionUserOnXui(server, xui_params || {}, serviceClient);

          const finalUsername = String(result.username || xui_params?.username || '').trim();
          const finalLineId = String(result.line_id || '').trim();

          await appendSystemLog(serviceClient, {
            type: 'success', action: 'XUI provisioning concluído',
            detail: `server_id=${server_id} username=${finalUsername} line_id=${finalLineId}`,
            user_id: user.id,
          });

          return new Response(JSON.stringify({
            success: true,
            data: result.data,
            action_used: result.action,
            generated_username: finalUsername || null,
            line_id: finalLineId || null,
            account_active: result.account_active ?? null,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
      } catch (e: any) {
        if (xui_action === 'get_server_stats' || xui_action === 'user_info') {
          await serviceClient.from('servers').update({ status: 'offline' }).eq('id', server_id);
        }
        await appendSystemLog(serviceClient, {
          type: 'error', action: 'XUI provisioning erro',
          detail: `server_id=${server_id} action=${xui_action} username=${xui_params?.username || 'n/a'} error=${e.message}`,
          user_id: user.id,
        });
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
