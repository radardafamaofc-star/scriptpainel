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
  // XUI expects bracket notation keys literally (e.g. bouquets_selected[], bouquets_selected[0])
  return (key.includes('[') && key.includes(']')) ? key : encodeURIComponent(key);
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
    if (normalized.includes('success') || normalized === 'ok' || normalized.includes('exists')) return null;

    if (
      normalized.startsWith('status_')
      || normalized.includes('error')
      || normalized.includes('fail')
      || normalized.includes('invalid')
      || normalized.includes('denied')
      || normalized.includes('forbidden')
    ) {
      return status;
    }
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
    if (normalized.includes('success') || normalized === 'ok' || normalized.includes('exists')) return true;
    if (
      normalized.startsWith('status_')
      || normalized.includes('error')
      || normalized.includes('fail')
      || normalized.includes('invalid')
      || normalized.includes('denied')
      || normalized.includes('forbidden')
    ) {
      return false;
    }
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

function formatLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type XuiLineAssignments = {
  bouquetIds: string[];
  packageIds: string[];
  outputIds: string[];
};

type ExpectedLineAssignments = {
  bouquetIds?: string[];
  packageIds?: string[];
  outputIds?: string[];
};

function normalizeIds(ids: string[] = []): string[] {
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
}

function sanitizeSelectionIds(ids: string[] = []): string[] {
  return normalizeIds(ids).filter((id) => {
    const numeric = Number(id);
    if (!Number.isNaN(numeric)) return numeric > 0;
    return id !== '0';
  });
}

function buildOutputPayload(outputIds: string[] = ['1', '2', '3']): Record<string, string | string[]> {
  const normalized = sanitizeSelectionIds(outputIds);
  const selected = normalized.length > 0 ? normalized : ['1', '2', '3'];
  const asNumbers = selected
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n));
  const json = JSON.stringify(asNumbers);

  return {
    allowed_outputs: json,
    output_formats: json,
    allowed_outputs_selected: json,
    'allowed_outputs[]': selected,
    'output_formats[]': selected,
    'allowed_outputs_selected[]': selected,
  };
}

function appendRawParams(parts: string[], params: Record<string, string | string[]>): void {
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const value of v) {
        parts.push(`${encodeParamKey(k)}=${encodeURIComponent(value)}`);
      }
      continue;
    }

    parts.push(`${encodeParamKey(k)}=${encodeURIComponent(v)}`);
  }
}

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
    bouquetIds: normalizeIds(bouquets),
    packageIds: normalizeIds(packages),
    outputIds: normalizeIds(outputs),
  };
}

function matchesExpectedAssignments(actual: XuiLineAssignments, expected: ExpectedLineAssignments): boolean {
  const expectedBouquets = normalizeIds(expected.bouquetIds || []);
  const expectedPackages = normalizeIds(expected.packageIds || []);
  const expectedOutputs = normalizeIds(expected.outputIds || []);

  const bouquetOk = expectedBouquets.length === 0
    || expectedBouquets.every((id) => actual.bouquetIds.includes(id));

  const packageOk = expectedPackages.length === 0
    || expectedPackages.some((id) => actual.packageIds.includes(id) || actual.bouquetIds.includes(id));

  const outputsOk = expectedOutputs.length === 0
    || expectedOutputs.every((id) => actual.outputIds.includes(id));

  return bouquetOk && packageOk && outputsOk;
}

function hasLineShape(row: any): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;

  return [
    'id',
    'line_id',
    'username',
    'package_id',
    'bouquet',
    'bouquets',
    'allowed_outputs',
  ].some((key) => row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '');
}

function extractLineRows(payload: any): any[] {
  const data = payload?.data ?? payload;

  if (Array.isArray(data)) {
    return data.filter((row) => row && typeof row === 'object');
  }

  if (data && typeof data === 'object') {
    if (hasLineShape(data)) return [data];

    const values = Object.values(data).filter((row) => row && typeof row === 'object');
    if (values.length) return values;
  }

  if (payload && typeof payload === 'object' && hasLineShape(payload)) {
    return [payload];
  }

  return payload && typeof payload === 'object' ? [payload] : [];
}

async function resolveLineIdByUsername(config: XuiServerConfig, username: string): Promise<string> {
  const checks: Array<{ action: string; params?: Record<string, string | string[]> }> = [
    { action: 'get_lines', params: { search: username } },
    { action: 'get_lines' },
  ];

  for (const check of checks) {
    try {
      const data = await xuiRequest(config, check.action, check.params || {});
      const rows = extractLineRows(data);
      const match = rows.find((row: any) => String(row?.username || '').trim() === username);
      const lineId = String(match?.id || '').trim();
      if (lineId) return lineId;
    } catch {
      // ignore and try next source
    }
  }

  return '';
}

async function verifyProvisionedUser(
  config: XuiServerConfig,
  username: string,
  expected: ExpectedLineAssignments = {},
  lineId: string = '',
): Promise<boolean> {
  const expectedBouquets = normalizeIds(expected.bouquetIds || []);
  const expectedPackages = normalizeIds(expected.packageIds || []);
  const expectedOutputs = normalizeIds(expected.outputIds || []);

  const resolvedLineId = lineId || await resolveLineIdByUsername(config, username);
  const checks: Array<{ action: string; params?: Record<string, string | string[]>; label: string }> = [];

  if (resolvedLineId) {
    checks.push({ action: 'get_line', params: { id: resolvedLineId }, label: `get_line(id=${resolvedLineId})` });
  }

  checks.push(
    { action: 'get_lines', params: { search: username }, label: `get_lines(search=${username})` },
    { action: 'get_lines', label: 'get_lines' },
  );

  for (const check of checks) {
    try {
      const data = await xuiRequest(config, check.action, check.params || {});
      const rows = extractLineRows(data);
      const target = rows.find((row: any) => {
        const rowId = String(row?.id || '').trim();
        const rowUsername = String(row?.username || '').trim();
        if (resolvedLineId && rowId) return rowId === resolvedLineId;
        return rowUsername === username;
      });

      if (!target) continue;

      const actual = extractLineAssignments(target);
      if (matchesExpectedAssignments(actual, expected)) {
        console.log(`[XUI] Verification success via ${check.label} for ${username} bouquets=${JSON.stringify(actual.bouquetIds)} outputs=${JSON.stringify(actual.outputIds)} package=${JSON.stringify(actual.packageIds)}`);
        return true;
      }

      console.log(`[XUI] Verification mismatch via ${check.label} for ${username}. expectedBouquets=${JSON.stringify(expectedBouquets)} gotBouquets=${JSON.stringify(actual.bouquetIds)} expectedOutputs=${JSON.stringify(expectedOutputs)} gotOutputs=${JSON.stringify(actual.outputIds)} expectedPackages=${JSON.stringify(expectedPackages)} gotPackage=${JSON.stringify(actual.packageIds)}`);
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

type PackageAssignments = {
  bouquetIds: string[];
  outputIds: string[];
};

// Fetch bouquet/output IDs belonging to a package
async function getPackageAssignments(config: XuiServerConfig, packageId: string): Promise<PackageAssignments> {
  try {
    const payload = await xuiRequest(config, 'get_packages');
    const rows = (Array.isArray(payload) ? payload : Object.values(payload || {}))
      .filter((item: any) => item && typeof item === 'object');

    const pkg = rows.find((p: any) => String((p as any)?.id || (p as any)?.package_id || '') === packageId);
    if (!pkg) {
      return { bouquetIds: [], outputIds: ['1', '2', '3'] };
    }

    const bouquetIds = sanitizeSelectionIds(parseIdList((pkg as any).bouquets));
    const outputIds = sanitizeSelectionIds(
      parseIdList((pkg as any).output_formats || (pkg as any).allowed_outputs || ''),
    );

    console.log(`[XUI] Package ${packageId} has bouquets=${JSON.stringify(bouquetIds)} outputs=${JSON.stringify(outputIds)}`);

    return {
      bouquetIds,
      outputIds: outputIds.length > 0 ? outputIds : ['1', '2', '3'],
    };
  } catch (e: any) {
    console.log(`[XUI] Failed to get package assignments: ${e.message}`);
    return { bouquetIds: [], outputIds: ['1', '2', '3'] };
  }
}

// Build a raw GET URL for create_line with bouquets_selected[] as literal bracket params
// This is how QPanel and the official XUI docs do it
function buildCreateLineUrl(
  config: XuiServerConfig,
  params: Record<string, string>,
  bouquetIds: string[],
  outputIds: string[] = ['1', '2', '3'],
): string {
  const baseUrl = config.url.replace(/\/+$/, '');
  const parts: string[] = [
    `api_key=${encodeURIComponent(config.api_key)}`,
    `action=create_line`,
  ];

  appendRawParams(parts, params);

  // bouquets_selected[] as individual params with literal brackets (NOT encoded)
  for (const id of bouquetIds) {
    parts.push(`bouquets_selected[]=${encodeURIComponent(id)}`);
  }

  // Send every known output key variant used by different XUI builds
  appendRawParams(parts, buildOutputPayload(outputIds));

  return `${baseUrl}/?${parts.join('&')}`;
}

// Build a raw GET URL for edit_line with bouquets_selected[]
function buildEditLineUrl(
  config: XuiServerConfig,
  lineId: string,
  bouquetIds: string[],
  outputIds: string[] = ['1', '2', '3'],
  packageId: string = '',
  username: string = '',
  password: string = '',
): string {
  const baseUrl = config.url.replace(/\/+$/, '');
  const parts: string[] = [
    `api_key=${encodeURIComponent(config.api_key)}`,
    `action=edit_line`,
    `id=${encodeURIComponent(lineId)}`,
  ];

  // CRITICAL: preserve username/password so XUI doesn't overwrite them
  if (username) parts.push(`username=${encodeURIComponent(username)}`);
  if (password) parts.push(`password=${encodeURIComponent(password)}`);

  for (const id of bouquetIds) {
    parts.push(`bouquets_selected[]=${encodeURIComponent(id)}`);
  }

  // Send every known output key variant used by different XUI builds
  appendRawParams(parts, buildOutputPayload(outputIds));

  if (packageId) {
    parts.push(`package_id=${encodeURIComponent(packageId)}`);
    parts.push(`package_id[]=${encodeURIComponent(packageId)}`);
  }

  return `${baseUrl}/?${parts.join('&')}`;
}

async function syncLineAssignments(
  config: XuiServerConfig,
  lineId: string,
  username: string,
  expected: ExpectedLineAssignments,
  outputIds: string[] = ['1', '2', '3'],
  password: string = '',
): Promise<boolean> {
  const bouquetIds = sanitizeSelectionIds(expected.bouquetIds || []);
  const packageIds = sanitizeSelectionIds(expected.packageIds || []);
  const normalizedOutputs = sanitizeSelectionIds(outputIds).length > 0 ? sanitizeSelectionIds(outputIds) : ['1', '2', '3'];

  if (!lineId) return false;

  // Don't verify outputs — XUI manages them at package level
  const expectedCheck: ExpectedLineAssignments = bouquetIds.length > 0
    ? { bouquetIds }
    : { packageIds };

  const hasExpected = (expectedCheck.bouquetIds?.length || 0) > 0 || (expectedCheck.packageIds?.length || 0) > 0;
  if (!hasExpected) return true;

  const jsonBouquets = JSON.stringify(bouquetIds.map((id) => Number(id)).filter((n) => Number.isFinite(n)));
  const outputPayload = buildOutputPayload(normalizedOutputs);

  // CRITICAL: Always include username+password to prevent XUI from overwriting them
  const identityParams: Record<string, string> = {};
  if (username) identityParams.username = username;
  if (password) identityParams.password = password;

  const attempts: Array<{ label: string; run: () => Promise<void> }> = [
    {
      label: 'GET edit_line bouquets_selected[]',
      run: async () => {
        const url = buildEditLineUrl(config, lineId, bouquetIds, normalizedOutputs, packageIds[0] || '', username, password);
        console.log(`[XUI] ${url.replace(config.api_key, '***')}`);
        const response = await tryFetch(url);
        const text = await response.text();
        if (text && !text.includes('<html')) {
          try {
            const parsed = JSON.parse(text);
            console.log(`[XUI] GET edit_line response: ${JSON.stringify(parsed).substring(0, 800)}`);
          } catch {
            // ignore non-json
          }
        }
      },
    },
    {
      label: 'POST edit_line custom outputs first (package_id=0)',
      run: async () => {
        await xuiRequest(config, 'edit_line', {
          id: lineId,
          ...identityParams,
          package_id: '0',
          'package_id[]': ['0'],
          'bouquets_selected[]': bouquetIds,
          ...outputPayload,
        });
      },
    },
    {
      label: 'POST edit_line bouquets_selected[] + outputs',
      run: async () => {
        await xuiRequest(config, 'edit_line', {
          id: lineId,
          ...identityParams,
          ...(packageIds[0] ? { package_id: packageIds[0] } : {}),
          ...(packageIds[0] ? { 'package_id[]': [packageIds[0]] } : {}),
          'bouquets_selected[]': bouquetIds,
          ...outputPayload,
        });
      },
    },
    {
      label: 'POST edit_line bouquets_selected json',
      run: async () => {
        await xuiRequest(config, 'edit_line', {
          id: lineId,
          ...identityParams,
          ...(packageIds[0] ? { package_id: packageIds[0] } : {}),
          bouquets_selected: jsonBouquets,
          ...outputPayload,
        });
      },
    },
    {
      label: 'POST edit_line bouquet json',
      run: async () => {
        await xuiRequest(config, 'edit_line', {
          id: lineId,
          ...identityParams,
          ...(packageIds[0] ? { package_id: packageIds[0] } : {}),
          bouquet: jsonBouquets,
          ...outputPayload,
        });
      },
    },
    {
      label: 'POST edit_line bouquet[]',
      run: async () => {
        await xuiRequest(config, 'edit_line', {
          id: lineId,
          ...identityParams,
          ...(packageIds[0] ? { package_id: packageIds[0] } : {}),
          'bouquet[]': bouquetIds,
          ...outputPayload,
        });
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      console.log(`[XUI] Sync attempt: ${attempt.label} line_id=${lineId}`);
      await attempt.run();
    } catch (e: any) {
      console.log(`[XUI] Sync attempt failed (${attempt.label}): ${e.message}`);
    }

    const ok = await verifyProvisionedUser(config, username, expectedCheck, lineId);
    if (ok) {
      console.log(`[XUI] ✅ Sync confirmed via ${attempt.label} for ${username}`);
      return true;
    }
  }

  return false;
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
  const parsedPackageIds = sanitizeSelectionIds(
    parseIdList(rawParams.package_id || rawParams.bouquet || rawParams.bouquets || ''),
  );
  let packageId = parsedPackageIds[0] || '';
  const rawPlanName = String(rawParams.plan_name || '').trim();

  // Auto-resolve package if not provided
  if (!packageId && rawPlanName) {
    try {
      const payload = await xuiRequest(config, 'get_packages');
      const rows = (Array.isArray(payload) ? payload : Object.values(payload || {}))
        .filter((item: any) => item && typeof item === 'object');

      const normalize = (value: string) => value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

      const wanted = normalize(rawPlanName);
      const candidates = rows.map((pkg: any) => {
        const id = String(pkg.id || pkg.package_id || '').trim();
        if (!id) return null;
        const name = String(pkg.package_name || pkg.name || '').trim();
        const nameNorm = normalize(name);
        const bouquetsCount = parseIdList(pkg.bouquets).length;
        let score = 0;
        const tokens = wanted.split(' ').filter((t) => t.length >= 2);
        for (const token of tokens) {
          if (nameNorm.includes(token)) score += 2;
        }
        if (nameNorm === wanted) score += 8;
        score += Math.min(bouquetsCount, 20) * 0.05;
        return { id, name, score, bouquetsCount };
      }).filter(Boolean) as Array<{ id: string; name: string; score: number; bouquetsCount: number }>;

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0]?.score > 0) {
        packageId = candidates[0].id;
        console.log(`[XUI] Auto-selected package '${candidates[0].name}' id=${packageId} score=${candidates[0].score}`);
      } else if (candidates.length > 0) {
        candidates.sort((a, b) => b.bouquetsCount - a.bouquetsCount);
        packageId = candidates[0].id;
        console.log(`[XUI] Fallback package by coverage: '${candidates[0].name}' id=${packageId}`);
      }
    } catch (e: any) {
      console.log(`[XUI] Could not auto-resolve package: ${e.message}`);
    }
  }

  // Get bouquet IDs from the package
  let bouquetIds: string[] = [];
  // ALWAYS force all 3 output formats: HLS(1), MPEGTS(2), RTMP(3)
  const outputIds: string[] = ['1', '2', '3'];
  if (packageId) {
    const assignments = await getPackageAssignments(config, packageId);
    bouquetIds = assignments.bouquetIds;
    // Do NOT use assignments.outputIds — always force all outputs active
  }

  // Calculate expiration variants
  const expUnix = Number(expDate);
  const nowUnix = Math.floor(Date.now() / 1000);
  const remainingHours = Number.isFinite(expUnix) && expUnix > nowUnix
    ? Math.max(1, Math.ceil((expUnix - nowUnix) / 3600))
    : 24;
  const remainingDays = Math.max(1, Math.ceil(remainingHours / 24));

  const rawExpDate = String(expDate || '').trim();
  const expVariants: string[] = [];
  if (rawExpDate) {
    const compactRaw = rawExpDate.toLowerCase().replace(/\s+/g, '');
    if (/^\d+(hours?|days?)$/.test(compactRaw)) expVariants.push(compactRaw);
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(rawExpDate)) expVariants.push(rawExpDate);
  }
  expVariants.push(`${remainingHours}hours`, `${remainingDays}days`);
  if (Number.isFinite(expUnix) && expUnix > 0) {
    const expAsDate = new Date(expUnix * 1000);
    if (!Number.isNaN(expAsDate.getTime())) expVariants.push(formatLocalDateString(expAsDate));
  }
  const uniqueExpVariants = Array.from(new Set(expVariants.map((v) => String(v).trim()).filter(Boolean)));

  console.log(`[XUI] Provisioning ${username} package_id=${packageId || 'n/a'} bouquets=${bouquetIds.length} plan_name='${rawPlanName || 'n/a'}' exp_variants=${JSON.stringify(uniqueExpVariants)}`);

  // Don't include outputIds in verification — XUI stores outputs at the PACKAGE level,
  // not at the line level. The line's allowed_outputs field stays [] when a package is assigned.
  // We still SEND outputs in create/edit calls as best-effort.
  const expectedAssignments: ExpectedLineAssignments = bouquetIds.length > 0
    ? { bouquetIds }
    : (packageId ? { packageIds: [packageId] } : {});
  const hasExpectedAssignments = (expectedAssignments.bouquetIds?.length || 0) > 0
    || (expectedAssignments.packageIds?.length || 0) > 0;

  const ensureExpectedAssignments = async (lineIdCandidate: string): Promise<'create_line' | 'create_and_edit'> => {
    if (!hasExpectedAssignments) return 'create_line';

    const resolvedLineId = lineIdCandidate || await resolveLineIdByUsername(config, username);
    const alreadyAssigned = await verifyProvisionedUser(config, username, expectedAssignments, resolvedLineId);
    if (alreadyAssigned) return 'create_line';

    if (!resolvedLineId) {
      throw new Error('Linha criada, mas não foi possível localizar o ID no XUI para sincronizar bouquets.');
    }

    const synced = await syncLineAssignments(config, resolvedLineId, username, expectedAssignments, outputIds, password);
    if (synced) return 'create_and_edit';

    throw new Error('Linha criada no XUI, mas o pacote não aplicou bouquets. No XUI, deixe Trial/Standard Package em OFF e valide os bouquets do pacote.');
  };

  let lastError = 'A API do XUI rejeitou a criação da linha';

  for (const expValue of uniqueExpVariants) {
    const lineParams: Record<string, string> = {
      username,
      password,
      max_connections: maxConnections,
      exp_date: expValue,
    };
    if (memberId) lineParams.member_id = memberId;
    if (packageId) lineParams.package_id = packageId;

    // Strategy 1: GET with bouquets_selected[] in query string (QPanel style)
    if (bouquetIds.length > 0) {
      try {
        const url = buildCreateLineUrl(config, lineParams, bouquetIds, outputIds);
        console.log(`[XUI] GET create_line (QPanel style): ${url.replace(config.api_key, '***')}`);
        const response = await tryFetch(url);
        const text = await response.text();
        if (text && !text.includes('<html')) {
          const json = JSON.parse(text);
          console.log(`[XUI] create_line response: ${JSON.stringify(json).substring(0, 800)}`);
          const status = String(json?.status || '').toUpperCase();
          if (isXuiSuccess(json) || status.includes('EXISTS_USERNAME')) {
            const lineId = String(json?.data?.id || '').trim();
            const actionUsed = await ensureExpectedAssignments(lineId);
            return { action: actionUsed, data: json };
          }
          const err = getXuiError(json);
          if (err) {
            lastError = err;
            console.log(`[XUI] create_line (GET) failed: ${err}`);
          }
        }
      } catch (e: any) {
        console.log(`[XUI] GET create_line error: ${e.message}`);
        lastError = e.message;
      }
    }

    // Strategy 2: Standard xuiRequest (POST fallback)
    try {
      console.log(`[XUI] Fallback: POST create_line params: ${JSON.stringify(lineParams)}`);
      const data = await xuiRequest(config, 'create_line', lineParams);
      const createError = getXuiError(data);
      const status = String(data?.status || '').toUpperCase();

      if (createError && !status.includes('EXISTS_USERNAME')) {
        lastError = createError;
        continue;
      }
      if (!isXuiSuccess(data) && !status.includes('EXISTS_USERNAME')) {
        lastError = createError || 'create_line retornou status inválido';
        continue;
      }

      const lineId = String(data?.data?.id || '').trim();
      const actionUsed = await ensureExpectedAssignments(lineId);

      console.log(`[XUI] ✅ Line created for ${username} package_id=${packageId || 'none'} action=${actionUsed}`);
      return { action: actionUsed, data };
    } catch (e: any) {
      lastError = e.message;
      console.log(`[XUI] create_line POST error: ${lastError}`);
    }
  }

  throw new Error(lastError);
}

async function appendSystemLog(
  serviceClient: any,
  payload: { type: 'info' | 'success' | 'warning' | 'error'; action: string; detail?: string; user_id?: string },
) {
  try {
    const detail = String(payload.detail || '').slice(0, 2000);
    await serviceClient.from('system_logs').insert({
      type: payload.type,
      action: payload.action,
      detail,
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

          const reqUsername = String(xui_params?.username || '').trim();
          const reqPackageId = String(xui_params?.package_id || '').trim();
          await appendSystemLog(serviceClient, {
            type: 'info',
            action: 'XUI provisioning iniciado',
            detail: `server_id=${server_id} username=${reqUsername || 'n/a'} package_id=${reqPackageId || 'auto'}`,
            user_id: user.id,
          });

          const provisionResult = await provisionUserOnXui(config, xui_params || {}, xuiMemberId);

          await appendSystemLog(serviceClient, {
            type: provisionResult.warning ? 'warning' : 'success',
            action: 'XUI provisioning concluído',
            detail: `server_id=${server_id} username=${reqUsername || 'n/a'} action=${provisionResult.action}${provisionResult.warning ? ` warning=${provisionResult.warning}` : ''}`,
            user_id: user.id,
          });

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
      } catch (e: any) {
        if (xui_action === 'get_server_stats' || xui_action === 'user_info') {
          await serviceClient.from('servers').update({ status: 'offline' }).eq('id', server_id);
        }

        await appendSystemLog(serviceClient, {
          type: 'error',
          action: 'XUI provisioning erro',
          detail: `server_id=${server_id} action=${xui_action} username=${String(xui_params?.username || 'n/a')} error=${String(e.message || e)}`,
          user_id: user.id,
        });

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
