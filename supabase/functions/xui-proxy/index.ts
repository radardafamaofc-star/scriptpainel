import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface XuiServerConfig {
  url: string;
  api_key: string;
  api_version?: string;
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
  const ids = parseIdList(value)
    .map((v) => v.replace(/\D/g, '').trim())
    .filter(Boolean);

  if (!ids.length) return fallback;
  return Array.from(new Set(ids));
}

function formatLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function buildPlayerApiUrls(config: XuiServerConfig): string[] {
  const baseUrl = config.url.replace(/\/+$/, '');
  const urls = [`${baseUrl}/player_api.php?api_key=${encodeURIComponent(config.api_key)}`];

  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== '/') {
      const root = `${parsed.protocol}//${parsed.host}`;
      urls.push(`${root}/player_api.php?api_key=${encodeURIComponent(config.api_key)}`);
    }
  } catch {}

  return Array.from(new Set(urls));
}

async function postPlayerApiForm(
  config: XuiServerConfig,
  form: URLSearchParams,
  actionName: string,
): Promise<any> {
  const payload = form.toString();
  let lastError = `${actionName} falhou`;

  for (const url of buildPlayerApiUrls(config)) {
    try {
      console.log(`[XUI] POST: ${url.replace(config.api_key, '***')}`);
      console.log(`[XUI] POST body: ${payload}`);

      const response = await tryFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload,
      });

      const text = await response.text();
      if (!text?.trim() || text.includes('<html') || text.includes('<!DOCTYPE')) {
        console.log(`[XUI] Skipping (HTML/empty): ${url.replace(config.api_key, '***')}`);
        continue;
      }

      const json = JSON.parse(text);
      console.log(`${actionName} response:`, JSON.stringify(json).substring(0, 1000));
      return json;
    } catch (e: any) {
      lastError = e.message;
      console.log(`[XUI] ${actionName} failed at ${url.replace(config.api_key, '***')}: ${e.message}`);
    }
  }

  throw new Error(lastError);
}

// STEP 1 — create_line via player_api.php (POST form-urlencoded)
async function createLineViaPlayerApi(
  config: XuiServerConfig,
  params: { username: string; password: string; expDate?: string },
): Promise<any> {
  const form = new URLSearchParams();
  form.set('action', 'create_line');
  form.set('username', params.username);
  form.set('password', params.password);
  if (params.expDate) form.set('exp_date', params.expDate);
  form.set('max_connections', '1');

  const payload = form.toString();
  console.log("create_line payload:", payload);

  return postPlayerApiForm(config, form, 'create_line');
}

// STEP 2 — edit_line via player_api.php (POST form-urlencoded)
async function editLineViaPlayerApi(
  config: XuiServerConfig,
  params: { lineId: string; bouquetIds: string[]; allowedOutputIds: string[] },
): Promise<any> {
  const form = new URLSearchParams();
  form.set('action', 'edit_line');
  form.set('id', params.lineId);

  for (const bouquetId of params.bouquetIds) {
    form.append('bouquets[]', bouquetId);
  }

  for (const outputId of params.allowedOutputIds) {
    form.append('allowed_outputs[]', outputId);
  }

  const payload = form.toString();
  console.log('edit_line payload:', payload);

  return postPlayerApiForm(config, form, 'edit_line');
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

  const normalizeUsername = (v: string) => {
    const c = (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase().trim();
    return c ? c.slice(0, 24) : `rev_${userId.slice(0, 8)}`;
  };

  const candidates = Array.from(new Set([(displayName || '').trim(), normalizeUsername(displayName || ''), `rev_${userId.slice(0, 8)}`].filter(Boolean)));
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

  const xuiUsername = normalizeUsername(displayName || '');
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

// Main provisioning: single POST create_line via player_api.php
// Package handles bouquets, outputs, max_connections automatically
async function provisionUserOnXui(
  config: XuiServerConfig,
  rawParams: Record<string, string> = {},
  memberId: string = '',
) {
  const username = rawParams.username?.trim();
  const password = rawParams.password?.trim();
  if (!username || !password) throw new Error('username e password são obrigatórios');

  const parsedPackageIds = parseIdList(rawParams.package_id || rawParams.package || '').filter(Boolean);
  let packageId = parsedPackageIds[0] || '';
  const rawPlanName = String(rawParams.plan_name || '').trim();

  // Auto-resolve package if not provided
  if (!packageId && rawPlanName) {
    try {
      const payload = await xuiRequest(config, 'get_packages');
      const rows = (Array.isArray(payload) ? payload : Object.values(payload || {})).filter((i: any) => i && typeof i === 'object');
      const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const wanted = normalize(rawPlanName);
      const scored = rows.map((pkg: any) => {
        const id = String(pkg.id || pkg.package_id || '').trim();
        if (!id) return null;
        const name = normalize(String(pkg.package_name || pkg.name || ''));
        let score = name === wanted ? 10 : 0;
        for (const t of wanted.split(' ').filter(t => t.length >= 2)) { if (name.includes(t)) score += 2; }
        return { id, name, score };
      }).filter(Boolean) as Array<{ id: string; name: string; score: number }>;
      scored.sort((a, b) => b.score - a.score);
      if (scored[0]?.score > 0) {
        packageId = scored[0].id;
        console.log(`[XUI] Auto-selected package '${scored[0].name}' id=${packageId}`);
      }
    } catch (e: any) {
      console.log(`[XUI] Could not auto-resolve package: ${e.message}`);
    }
  }

  if (!packageId) throw new Error('package_id é obrigatório para criar linha');

  // Format expiry date
  const rawExpDate = rawParams.exp_date || rawParams.expiry_date || '';
  let expDateFormatted = '';
  if (rawExpDate) {
    const ts = Number(rawExpDate);
    if (!isNaN(ts) && ts > 1_000_000_000) {
      expDateFormatted = formatLocalDateString(new Date(ts > 1e10 ? ts : ts * 1000));
    } else if (/^\d{4}-\d{2}-\d{2}/.test(rawExpDate)) {
      expDateFormatted = rawExpDate.substring(0, 10);
    }
  }

  console.log(`[XUI] Provisioning ${username} package_id=${packageId} member_id=${memberId || 'n/a'}`);

  // Single POST create_line — package handles bouquets, outputs, connections
  const createData = await createLineViaPlayerApi(config, {
    username,
    password,
    packageId,
    ...(expDateFormatted ? { expDate: expDateFormatted } : {}),
  });

  const createStatus = String(createData?.status || '').toUpperCase();
  const createError = getXuiError(createData);
  if (createStatus.includes('EXISTS_USERNAME')) throw new Error(`Username já existe no XUI: ${username}`);
  if (createError && !createStatus.includes('SUCCESS')) throw new Error(createError);

  // Resolve line_id
  const createdLineId = String(createData?.data?.id || createData?.id || '').trim() || await resolveLineIdByUsername(config, username);

  // STEP 2: Force package application via edit_line
  // XUI 1.5.x does not fully apply package on create_line, so we re-apply it
  if (createdLineId) {
    try {
      const editPayload = `api_key=${encodeURIComponent(config.api_key)}&action=edit_line&id=${encodeURIComponent(createdLineId)}&package=${encodeURIComponent(packageId)}`;
      console.log("edit_line payload:", editPayload.replace(config.api_key, '***'));

      const baseUrl = config.url.replace(/\/+$/, '');
      const editResponse = await tryFetch(`${baseUrl}/?api_key=${encodeURIComponent(config.api_key)}&action=edit_line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${encodeURIComponent(createdLineId)}&package=${encodeURIComponent(packageId)}`,
      });
      const editText = await editResponse.text();
      console.log("edit_line response:", editText.substring(0, 1000));
    } catch (e: any) {
      console.log(`[XUI] edit_line (package reapply) failed: ${e.message}`);
    }
  }

  // Get final state
  let finalUsername = username;
  let finalLineId = createdLineId;
  let active = true;

  if (createdLineId) {
    try {
      const finalLine = await xuiRequest(config, 'get_line', { id: createdLineId });
      const rows = extractLineRows(finalLine);
      const row = rows.find((r: any) => String(r?.id || '').trim() === createdLineId) || rows[0];
      if (row) {
        finalLineId = String(row.id || row.line_id || createdLineId).trim();
        finalUsername = String(row.username || username).trim();
        active = isLineActive(row);
        console.log(`[XUI] After edit_line: bouquet=${row.bouquet || '?'} allowed_outputs=${row.allowed_outputs || '?'}`);
      }
    } catch {}
  }

  if (finalUsername && finalUsername !== username) {
    console.log(`[XUI] WARNING: XUI changed username ${username} -> ${finalUsername}`);
  }

  console.log(`[XUI] Final state: line_id=${finalLineId} username=${finalUsername} active=${active}`);

  return {
    action: 'create_line' as const,
    data: {
      ...createData,
      data: {
        ...(typeof createData?.data === 'object' && createData?.data ? createData.data : {}),
        id: finalLineId,
        username: finalUsername,
      },
    },
    line_id: finalLineId,
    username: finalUsername,
    account_active: active,
  };
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
          let xuiMemberId = '';
          if (roleData.role !== 'admin') {
            const { data: profile } = await serviceClient
              .from('profiles').select('display_name').eq('user_id', user.id).single();
            const displayName = profile?.display_name || user.email || `panel_${user.id.substring(0, 8)}`;
            xuiMemberId = await getOrCreateXuiMemberId(config, user.id, displayName, serviceClient);
          } else {
            console.log('[XUI] Admin provisioning without member_id (owner line)');
          }

          await appendSystemLog(serviceClient, {
            type: 'info', action: 'XUI provisioning iniciado',
            detail: `server_id=${server_id} username=${xui_params?.username || 'n/a'} package_id=${xui_params?.package_id || 'auto'}`,
            user_id: user.id,
          });

          const result = await provisionUserOnXui(config, xui_params || {}, xuiMemberId);

          const finalUsername = String(result.username || xui_params?.username || '').trim();
          const finalLineId = String(result.line_id || '').trim();

          await appendSystemLog(serviceClient, {
            type: 'success', action: 'XUI provisioning concluído',
            detail: `server_id=${server_id} username=${finalUsername} line_id=${finalLineId} action=${result.action}`,
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
