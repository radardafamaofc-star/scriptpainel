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

function encodeParamKey(key: string): string {
  // XUI expects bracket notation keys literally (e.g. bouquets_selected[])
  return key.includes('[]') ? key : encodeURIComponent(key);
}

function buildParamEntries(params: Record<string, string | string[]> = {}): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const encodedKey = encodeParamKey(k);
    if (Array.isArray(v)) {
      for (const value of v) parts.push(`${encodedKey}=${encodeURIComponent(value)}`);
    } else {
      parts.push(`${encodedKey}=${encodeURIComponent(v)}`);
    }
  }
  return parts;
}

function isWriteAction(action: string): boolean {
  const normalized = String(action || '').toLowerCase();
  return normalized.startsWith('create_')
    || normalized.startsWith('edit_')
    || normalized.startsWith('delete_')
    || normalized.startsWith('enable_')
    || normalized.startsWith('disable_')
    || normalized.startsWith('ban_')
    || normalized.startsWith('unban_')
    || normalized.startsWith('convert_')
    || normalized.startsWith('install_')
    || normalized.startsWith('start_')
    || normalized.startsWith('stop_')
    || normalized.startsWith('reload_')
    || normalized.startsWith('clear_')
    || normalized.startsWith('flush_')
    || normalized.startsWith('add_')
    || normalized.startsWith('kill_')
    || normalized === 'mysql_query';
}

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

  const getUrlsToTry = [
    `${baseUrl}/?${queryString}`,
    `${baseUrl}?${queryString}`,
  ];
  const postUrlsToTry = [
    `${baseUrl}/?${actionQuery}`,
    `${baseUrl}?${actionQuery}`,
  ];

  // Also try root host with api.php for legacy compat
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== '/') {
      const root = `${parsed.protocol}//${parsed.host}`;
      getUrlsToTry.push(`${root}/api.php?${queryString}`);
      postUrlsToTry.push(`${root}/api.php?${actionQuery}`);
    }
  } catch {}

  const writeAction = isWriteAction(action);
  const attempts: Array<{ method: 'GET' | 'POST'; url: string; init?: RequestInit }> = [];

  if (writeAction) {
    for (const url of postUrlsToTry) {
      attempts.push({
        method: 'POST',
        url,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: postBody,
        },
      });
    }
  }

  for (const url of getUrlsToTry) {
    attempts.push({ method: 'GET', url });
  }

  // For read actions, keep optional POST fallback as last resort
  if (!writeAction && postBody) {
    for (const url of postUrlsToTry) {
      attempts.push({
        method: 'POST',
        url,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: postBody,
        },
      });
    }
  }

  console.log(`[XUI] Trying ${attempts.length} request patterns for action: ${action}`);

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      console.log(`[XUI] ${attempt.method}: ${attempt.url.replace(config.api_key, '***')}`);
      if (attempt.method === 'POST' && attempt.init?.body) {
        console.log(`[XUI] POST body: ${String(attempt.init.body).substring(0, 1000)}`);
      }

      const response = await tryFetch(attempt.url, attempt.init || {});

      if (response.status === 404) { console.log(`[XUI] 404`); continue; }
      if (response.status === 403) { console.log(`[XUI] 403`); continue; }

      const text = await response.text();
      if (!text || text.trim() === '') { console.log(`[XUI] Empty`); continue; }
      if (text.includes('<html') || text.includes('<!DOCTYPE')) { console.log(`[XUI] HTML, skip`); continue; }

      try {
        const json = JSON.parse(text);
        console.log(`[XUI] ✅ Keys: ${Object.keys(json).slice(0, 10).join(', ')}`);
        if (action === 'get_packages') {
          const entries = Object.entries(json);
          if (entries.length > 0) {
            console.log(`[XUI] Package[0]: ${JSON.stringify(entries[0][1]).substring(0, 500)}`);
          }
        }
        if (action === 'create_line' || action === 'edit_line') {
          console.log(`[XUI] ${action} response: ${JSON.stringify(json).substring(0, 800)}`);
        }
        return json;
      } catch {
        console.log(`[XUI] Non-JSON: ${text.substring(0, 100)}`);
        continue;
      }
    } catch (e: any) {
      if (e.message?.includes('timeout') || e.message?.includes('expirou')) throw e;
      lastError = e;
      console.log(`[XUI] Error: ${e.message}`);
    }
  }

  throw lastError || new Error(
    `Não foi possível conectar ao XUI One. Verifique URL e API Key.\nFormato: http://IP:PORTA/accesscode`
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

function parseIdList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);

  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === '[]') return [];

  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      // fallback to comma split below
    }
  }

  return raw
    .split(',')
    .map((v) => v.replace(/[\[\]\s]/g, '').trim())
    .filter(Boolean);
}

type XuiLineAssignments = {
  bouquetIds: string[];
  packageIds: string[];
  outputIds: string[];
};

type ExpectedLineAssignments = {
  bouquetIds?: string[];
  packageId?: string;
  outputIds?: string[];
};

function extractLineAssignments(payload: any): XuiLineAssignments {
  const bouquets: string[] = [];
  const packages: string[] = [];
  const outputs: string[] = [];

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    bouquets.push(...parseIdList(node.bouquet));
    bouquets.push(...parseIdList(node.bouquets));
    bouquets.push(...parseIdList(node.bouquets_selected));

    packages.push(...parseIdList(node.package_id));

    outputs.push(...parseIdList(node.allowed_outputs));
    outputs.push(...parseIdList(node.output_formats));
    outputs.push(...parseIdList(node.allowed_outputs_selected));

    Object.values(node).forEach(visit);
  };

  visit(payload);

  return {
    bouquetIds: Array.from(new Set(bouquets)),
    packageIds: Array.from(new Set(packages)),
    outputIds: Array.from(new Set(outputs)),
  };
}

function matchesExpectedAssignments(actual: XuiLineAssignments, expected: ExpectedLineAssignments): boolean {
  const expectedBouquets = Array.from(new Set((expected.bouquetIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const expectedPackage = String(expected.packageId || '').trim();
  const expectedOutputs = Array.from(new Set((expected.outputIds || []).map((id) => String(id).trim()).filter(Boolean)));

  const bouquetOk = expectedBouquets.length === 0 || expectedBouquets.every((id) => actual.bouquetIds.includes(id));
  const packageOk = !expectedPackage || actual.packageIds.includes(expectedPackage);
  const outputsOk = expectedOutputs.length === 0 || expectedOutputs.every((id) => actual.outputIds.includes(id));

  return bouquetOk && packageOk && outputsOk;
}

async function verifyProvisionedUser(
  config: XuiServerConfig,
  username: string,
  expected: ExpectedLineAssignments = {},
): Promise<boolean> {
  const expectedBouquets = Array.from(new Set((expected.bouquetIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const expectedPackage = String(expected.packageId || '').trim();
  const expectedOutputs = Array.from(new Set((expected.outputIds || []).map((id) => String(id).trim()).filter(Boolean)));

  const checks: Array<{ action: string; params?: Record<string, string | string[]> }> = [
    { action: 'get_line', params: { username } },
    { action: 'get_lines', params: { search: username } },
    { action: 'get_lines' },
  ];

  for (const check of checks) {
    try {
      const data = await xuiRequest(config, check.action, check.params || {});
      if (!payloadContainsUsername(data, username)) continue;

      const actual = extractLineAssignments(data);
      if (matchesExpectedAssignments(actual, expected)) {
        console.log(`[XUI] Verification success via ${check.action} for ${username} bouquets=${JSON.stringify(actual.bouquetIds)} outputs=${JSON.stringify(actual.outputIds)} package=${JSON.stringify(actual.packageIds)}`);
        return true;
      }

      console.log(`[XUI] Verification mismatch via ${check.action} for ${username}. expectedBouquets=${JSON.stringify(expectedBouquets)} gotBouquets=${JSON.stringify(actual.bouquetIds)} expectedOutputs=${JSON.stringify(expectedOutputs)} gotOutputs=${JSON.stringify(actual.outputIds)} expectedPackage=${JSON.stringify(expectedPackage)} gotPackage=${JSON.stringify(actual.packageIds)}`);
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

  let resolvedPackageId = bouquetIds.length === 1 ? bouquetIds[0] : '';
  let resolvedBouquetIds = [...bouquetIds];

  const outputRaw = rawParams.allowed_outputs || rawParams.output_formats || rawParams.allowed_outputs_selected || '';
  let resolvedOutputIds = parseIdList(outputRaw);

  if (!resolvedBouquetIds.length) {
    try {
      const packages = await xuiRequest(config, 'get_packages');
      const packageList = (Array.isArray(packages) ? packages : Object.values(packages || {}))
        .filter((pkg: any) => pkg && typeof pkg === 'object');

      const getPackageId = (pkg: any): string => String(pkg.id || pkg.package_id || pkg.packageId || '').trim();

      const allWithId = packageList.filter((pkg: any) => !!getPackageId(pkg));
      const sorted = [...allWithId].sort((a: any, b: any) => {
        const bqA = parseIdList(a.bouquets);
        const bqB = parseIdList(b.bouquets);
        return bqB.length - bqA.length;
      });

      const picked = sorted[0];
      const pickedId = picked ? getPackageId(picked) : '';

      if (pickedId && picked) {
        resolvedPackageId = pickedId;

        const packageBouquets = parseIdList(picked.bouquets);
        if (packageBouquets.length > 0) {
          resolvedBouquetIds = packageBouquets;
          console.log(`[XUI] Auto-selected package: ${pickedId} with bouquets: ${JSON.stringify(packageBouquets)}`);
        } else {
          resolvedBouquetIds = [pickedId];
          console.log(`[XUI] Auto-selected package: ${pickedId} (no bouquets field, using package id)`);
        }

        const packageOutputs = parseIdList(picked.output_formats);
        if (packageOutputs.length > 0) {
          resolvedOutputIds = packageOutputs;
          console.log(`[XUI] Auto-selected output formats from package: ${JSON.stringify(packageOutputs)}`);
        }
      }
    } catch (e: any) {
      console.log(`[XUI] Could not auto-select package: ${e.message}`);
    }
  }

  resolvedBouquetIds = Array.from(new Set(resolvedBouquetIds.map((id) => String(id).trim()).filter(Boolean)));
  resolvedOutputIds = Array.from(new Set(resolvedOutputIds.map((id) => String(id).trim()).filter(Boolean)));

  const baseParams: Record<string, string> = {
    username,
    password,
    max_connections: maxConnections,
  };
  if (memberId) baseParams.member_id = memberId;

  const expectedAssignments: ExpectedLineAssignments = {
    bouquetIds: resolvedBouquetIds,
    packageId: resolvedPackageId || undefined,
    outputIds: resolvedOutputIds,
  };

  const assignmentVariants: Array<Record<string, string | string[]>> = [
    {
      ...(resolvedPackageId ? { package_id: resolvedPackageId } : {}),
      ...(resolvedBouquetIds.length ? { 'bouquets_selected[]': resolvedBouquetIds } : {}),
      ...(resolvedOutputIds.length ? { allowed_outputs: JSON.stringify(resolvedOutputIds) } : {}),
    },
    {
      ...(resolvedPackageId ? { package_id: resolvedPackageId } : {}),
      ...(resolvedBouquetIds.length ? { bouquets_selected: resolvedBouquetIds } : {}),
      ...(resolvedOutputIds.length ? { 'allowed_outputs_selected[]': resolvedOutputIds } : {}),
      ...(resolvedOutputIds.length ? { 'output_formats[]': resolvedOutputIds } : {}),
    },
    {
      ...(resolvedPackageId ? { package_id: resolvedPackageId } : {}),
      ...(resolvedBouquetIds.length ? { bouquet: JSON.stringify(resolvedBouquetIds) } : {}),
      ...(resolvedOutputIds.length ? { output_formats: JSON.stringify(resolvedOutputIds) } : {}),
    },
    {
      ...(resolvedPackageId ? { package_id: resolvedPackageId } : {}),
      ...(resolvedOutputIds.length ? { allowed_outputs: JSON.stringify(resolvedOutputIds) } : {}),
    },
  ];

  const expVariants = [`${remainingHours}hours`, `${remainingDays}days`];
  if (expDate && Number.isFinite(Number(expDate)) && Number(expDate) > 0) {
    expVariants.push(expDate);
  }

  let lastError = 'A API do XUI rejeitou a criação da linha';

  for (const expValue of expVariants) {
    for (const assignment of assignmentVariants) {
      const params = { ...baseParams, exp_date: expValue, ...assignment };
      console.log(`[XUI] create_line params: ${JSON.stringify(params)}`);

      const data = await xuiRequest(config, 'create_line', params);
      const error = getXuiError(data);
      if (error || !isXuiSuccess(data)) {
        lastError = error || 'create_line retornou status inválido';
        console.log(`[XUI] Provision failed: ${lastError}`);
        continue;
      }

      const responseAssignments = extractLineAssignments(data?.data || data);
      const responseMatches = matchesExpectedAssignments(responseAssignments, expectedAssignments);
      const verified = await verifyProvisionedUser(config, username, expectedAssignments);
      if (responseMatches || verified) {
        console.log(`[XUI] ✅ Provision success for ${username} bouquets=${JSON.stringify(responseAssignments.bouquetIds)} outputs=${JSON.stringify(responseAssignments.outputIds)} package=${JSON.stringify(responseAssignments.packageIds)}`);
        return { action: 'create_line', data };
      }

      // create_line may succeed but ignore bouquet/output params depending on panel mode. Force with edit_line.
      const lineId = String(data?.data?.id || '').trim();
      if (lineId) {
        try {
          const editParams = { id: lineId, ...baseParams, exp_date: expValue, ...assignment };
          console.log(`[XUI] edit_line fallback params: ${JSON.stringify(editParams)}`);
          const edited = await xuiRequest(config, 'edit_line', editParams);
          const editError = getXuiError(edited);
          if (!editError && isXuiSuccess(edited)) {
            const verifiedAfterEdit = await verifyProvisionedUser(config, username, expectedAssignments);
            if (verifiedAfterEdit) {
              console.log(`[XUI] ✅ Provision success via edit_line fallback for ${username}`);
              return { action: 'edit_line', data: edited };
            }
          }
        } catch (e: any) {
          console.log(`[XUI] edit_line fallback failed: ${e.message}`);
        }
      }

      lastError = 'Linha criada, mas sem bouquets/outputs aplicados';
      console.log(`[XUI] Provision uncertain: ${lastError}`);
    }
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
          // Admin deve criar linhas diretamente no owner principal do XUI.
          // member_id para admin pode gerar linhas sem acesso real ao conteúdo.
          let xuiMemberId = '';
          if (roleData.role !== 'admin') {
            const { data: profile } = await serviceClient
              .from('profiles')
              .select('display_name')
              .eq('user_id', user.id)
              .single();
            const displayName = profile?.display_name || user.email || `panel_${user.id.substring(0, 8)}`;

            xuiMemberId = await getOrCreateXuiMemberId(config, user.id, displayName, serviceClient);
            console.log(`[XUI] Provisioning line with member_id=${xuiMemberId} for ${displayName}`);
          } else {
            console.log('[XUI] Admin provisioning without member_id (owner line)');
          }

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
