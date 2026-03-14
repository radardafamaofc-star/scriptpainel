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

function normalizeNumericIds(value: unknown): string[] {
  const ids = parseIdList(value)
    .map((v) => v.replace(/\D/g, '').trim())
    .filter(Boolean);

  return Array.from(new Set(ids)).sort((a, b) => Number(a) - Number(b));
}

function hasSameNumericIds(current: unknown, expected: string[]): boolean {
  const currentNorm = normalizeNumericIds(current);
  const expectedNorm = Array.from(
    new Set(expected.map((v) => String(v).replace(/\D/g, '').trim()).filter(Boolean))
  ).sort((a, b) => Number(a) - Number(b));

  if (currentNorm.length !== expectedNorm.length) return false;
  return currentNorm.every((id, idx) => id === expectedNorm[idx]);
}

function normalizeForMatch(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAdultName(name: string): boolean {
  const n = normalizeForMatch(name);
  return ['adult', 'adulto', 'xxx', '18', 'porn'].some((token) => n.includes(token));
}

function extractBouquetRows(payload: any): any[] {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === 'object');
  if (data && typeof data === 'object') {
    const values = Object.values(data).filter((row) => row && typeof row === 'object');
    if (values.length) return values;
  }
  return [];
}

async function resolvePackageIdFromBouquets(
  config: XuiServerConfig,
  params: {
    requestedPackageId?: string;
    planName?: string;
    bouquetIds: string[];
  },
): Promise<string> {
  const requested = String(params.requestedPackageId || '').replace(/\D/g, '').trim();
  if (requested && requested !== '0') return requested;

  let rows: any[] = [];
  try {
    const bouquetsPayload = await xuiRequest(config, 'get_bouquets');
    rows = extractBouquetRows(bouquetsPayload);
  } catch (e: any) {
    console.log(`[XUI] get_bouquets failed for package auto-resolve: ${e.message}`);
    return '';
  }

  if (!rows.length) return '';

  const desiredName = normalizeForMatch(params.planName || '');
  const desiredTokens = desiredName.split(' ').filter((token) => token.length >= 3);
  const desiredAdult = isAdultName(params.planName || '');
  const targetBouquetIds = new Set(
    params.bouquetIds
      .map((id) => String(id).replace(/\D/g, '').trim())
      .filter(Boolean),
  );

  let bestId = '';
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const rowId = String(row?.id ?? row?.bouquet_id ?? row?.package_id ?? '').replace(/\D/g, '').trim();
    if (!rowId) continue;

    const rowName = String(row?.bouquet_name ?? row?.name ?? '').trim();
    const normalizedRowName = normalizeForMatch(rowName);

    let score = 0;
    if (targetBouquetIds.has(rowId)) score += 180;

    if (desiredName) {
      if (normalizedRowName === desiredName) score += 300;
      if (normalizedRowName.includes(desiredName) || desiredName.includes(normalizedRowName)) score += 120;
      for (const token of desiredTokens) {
        if (normalizedRowName.includes(token)) score += 18;
      }

      const rowAdult = isAdultName(rowName);
      if (rowAdult === desiredAdult) score += 24;
      else score -= 18;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = rowId;
    }
  }

  if (bestId) {
    console.log(`[XUI] Auto-resolved package_id=${bestId} (plan_name=${params.planName || 'n/a'})`);
    return bestId;
  }

  return '';
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

// Build URLs to try for POST form actions (standard API endpoint first, then player_api.php)
function buildApiPostUrls(config: XuiServerConfig, action: string): string[] {
  const baseUrl = config.url.replace(/\/+$/, '');
  const apiKey = encodeURIComponent(config.api_key);
  const urls: string[] = [];

  // Primary: standard XUI API endpoint (works on XUIOne 1.5.12)
  urls.push(`${baseUrl}/?api_key=${apiKey}&action=${encodeURIComponent(action)}`);

  // Fallback: player_api.php
  urls.push(`${baseUrl}/player_api.php?api_key=${apiKey}`);

  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname !== '/') {
      const root = `${parsed.protocol}//${parsed.host}`;
      urls.push(`${root}/?api_key=${apiKey}&action=${encodeURIComponent(action)}`);
      urls.push(`${root}/player_api.php?api_key=${apiKey}`);
    }
  } catch {}

  return Array.from(new Set(urls));
}

async function postXuiForm(
  config: XuiServerConfig,
  action: string,
  form: URLSearchParams,
  actionName: string,
): Promise<any> {
  const payload = form.toString();
  let lastError = `${actionName} falhou`;

  for (const url of buildApiPostUrls(config, action)) {
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

async function xuiRequestGetOnly(
  config: XuiServerConfig,
  action: string,
  params: Record<string, string | string[]> = {},
): Promise<any> {
  const baseUrl = config.url.replace(/\/+$/, '');
  const actionQuery = `api_key=${encodeURIComponent(config.api_key)}&action=${encodeURIComponent(action)}`;
  const paramParts = buildParamEntries(params);
  const queryString = [actionQuery, ...paramParts].join('&');
  const url = `${baseUrl}/?${queryString}`;

  console.log(`[XUI] GET-only: ${url.replace(config.api_key, '***')}`);
  const response = await tryFetch(url, { method: 'GET' });
  const text = await response.text();

  if (!text?.trim() || text.includes('<html') || text.includes('<!DOCTYPE')) {
    throw new Error('Resposta vazia/HTML em GET-only');
  }

  return JSON.parse(text);
}

function normalizeUniqueNumericIds(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => String(v).replace(/\D/g, '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => Number(a) - Number(b));
}

function applyLineAccessFields(form: URLSearchParams, bouquetIds: string[], allowedOutputIds: string[]): void {
  const normalizedBouquets = normalizeUniqueNumericIds(bouquetIds);
  if (normalizedBouquets.length) {
    const bouquetJson = JSON.stringify(normalizedBouquets.map(Number));

    // Send both keys for compatibility across XUI 1.5.x builds
    for (const bid of normalizedBouquets) {
      form.append('bouquets_selected[]', bid);
      form.append('bouquets_selected', bid);
    }
    form.set('bouquet', bouquetJson);
  }

  const normalizedOutputs = normalizeUniqueNumericIds(allowedOutputIds);
  if (normalizedOutputs.length) {
    const outputNumbers = normalizedOutputs.map(Number).filter((id) => Number.isFinite(id));
    const outputJson = JSON.stringify(outputNumbers);
    const outputCsv = outputNumbers.join(',');

    // Multiple aliases used by different XUI 1.5.x builds
    form.set('allowed_outputs', outputJson);
    form.set('output_formats', outputJson);
    form.set('allowed_output', outputCsv);
  }
}

function applyLineAccessQueryParams(
  params: Record<string, string | string[]>,
  bouquetIds: string[],
  allowedOutputIds: string[],
): void {
  const normalizedBouquets = normalizeUniqueNumericIds(bouquetIds);
  if (normalizedBouquets.length) {
    params['bouquets_selected[]'] = normalizedBouquets;
    params.bouquets_selected = normalizedBouquets;
    params.bouquet = JSON.stringify(normalizedBouquets.map(Number));
  }

  const normalizedOutputs = normalizeUniqueNumericIds(allowedOutputIds);
  if (normalizedOutputs.length) {
    const outputNumbers = normalizedOutputs.map(Number).filter((id) => Number.isFinite(id));
    const outputJson = JSON.stringify(outputNumbers);
    params.allowed_outputs = outputJson;
    params.output_formats = outputJson;
    params.allowed_output = outputNumbers.join(',');
  }
}

// Single-step create_line focused on explicit credentials + package fields
async function createLinePost(
  config: XuiServerConfig,
  params: {
    username: string;
    password: string;
    expDate?: string;
    memberId?: string;
    packageId?: string;
    maxConnections?: number;
    bouquetIds: number[];
    allowedOutputIds: number[];
  },
): Promise<any> {
  const form = new URLSearchParams();
  form.set('username', params.username);
  form.set('password', params.password);
  if (params.expDate) form.set('exp_date', params.expDate);
  form.set('max_connections', String(Math.max(1, Number(params.maxConnections ?? 1) || 1)));

  const memberId = String(params.memberId || '').replace(/\D/g, '').trim();
  if (memberId) form.set('member_id', memberId);

  // NOTE: Do NOT send package_id/package in create_line.
  // XUI 1.5.12 with disabled packages overrides bouquet/allowed_outputs to []
  // when package_id is present. We set it AFTER bouquets are confirmed.

  const bouquetIds = params.bouquetIds.map(Number).filter((id) => Number.isFinite(id)).map(String);
  const allowedOutputIds = params.allowedOutputIds.map(Number).filter((id) => Number.isFinite(id)).map(String);

  applyLineAccessFields(form, bouquetIds, allowedOutputIds);

  console.log('create_line payload:', form.toString());
  return postXuiForm(config, 'create_line', form, 'create_line');
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
  const normalizedLineId = String(lineId || '').trim();
  const normalizedUsername = String(username || '').trim();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (normalizedLineId) {
      const byId = await getLineRowById(config, normalizedLineId);
      if (byId) return byId;
    }

    if (normalizedUsername) {
      const resolvedId = await resolveLineIdByUsername(config, normalizedUsername);
      if (resolvedId) {
        const byUsername = await getLineRowById(config, resolvedId);
        if (byUsername) return byUsername;
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

async function restoreLineBouquets(
  config: XuiServerConfig,
  lineId: string,
  expectedBouquetIds: string[],
): Promise<void> {
  if (!expectedBouquetIds.length) return;

  try {
    await xuiRequest(config, 'edit_line', {
      id: lineId,
      bouquet: JSON.stringify(expectedBouquetIds.map(Number).filter((id) => Number.isFinite(id))),
      'bouquets_selected[]': expectedBouquetIds,
    });

    const restored = await getLineRowById(config, lineId);
    console.log(`[XUI] Bouquet restore result: bouquet=${restored?.bouquet || '?'}`);
  } catch (e: any) {
    console.log(`[XUI] Bouquet restore failed: ${e.message}`);
  }
}

async function enforceAllowedOutputsPostCreate(
  config: XuiServerConfig,
  params: {
    lineId: string;
    allowedOutputIds: string[];
    expectedBouquetIds?: string[];
    expectedUsername?: string;
    expectedPassword?: string;
    expectedMemberId?: string;
    expectedPackageId?: string;
    expDate?: string;
    maxConnections?: string;
  },
): Promise<any | null> {
  const lineId = String(params.lineId || '').trim();
  if (!lineId) return null;

  const targetUsername = String(params.expectedUsername || '').trim();
  const targetPassword = String(params.expectedPassword || '').trim();
  const targetExpDate = String(params.expDate || '').trim();
  const targetMaxConnections = String(params.maxConnections || '').replace(/\D/g, '').trim() || '1';
  const targetMemberId = String(params.expectedMemberId || '').replace(/\D/g, '').trim();

  const expectedBouquetIds = (params.expectedBouquetIds || [])
    .map((id) => String(id).replace(/\D/g, '').trim())
    .filter(Boolean);

  const allowedNumeric = params.allowedOutputIds.map(Number).filter((id) => Number.isFinite(id));
  const targetAllowed = allowedNumeric.map((id) => String(id));
  const allowedJson = JSON.stringify(allowedNumeric);

  const checkSynced = async (label: string) => {
    const refreshed = await getLineRowById(config, lineId);
    if (!refreshed) return null;

    const bouquetOk = expectedBouquetIds.length === 0 || hasSameNumericIds(refreshed?.bouquet, expectedBouquetIds);
    const outputsOk = targetAllowed.length === 0 || hasSameNumericIds(refreshed?.allowed_outputs ?? refreshed?.output_formats, targetAllowed);

    console.log(
      `[XUI] After ${label}: username=${refreshed?.username || '?'} password=${refreshed?.password || '?'} bouquet=${refreshed?.bouquet || '?'} allowed_outputs=${refreshed?.allowed_outputs || '?'}`,
    );

    if (bouquetOk && outputsOk) return refreshed;
    return null;
  };

  // Pass 1: keep member_id, Pass 2: retry without member_id (XUI 1.5.12 reseller limitation workaround)
  for (const includeMemberId of [true, false]) {
    try {
      const form = new URLSearchParams();
      form.set('id', lineId);
      form.set('line_id', lineId);
      form.set('max_connections', targetMaxConnections);
      if (targetUsername) form.set('username', targetUsername);
      if (targetPassword) form.set('password', targetPassword);
      if (targetExpDate) form.set('exp_date', targetExpDate);
      if (includeMemberId && targetMemberId) form.set('member_id', targetMemberId);

      for (const bid of expectedBouquetIds) form.append('bouquets_selected[]', bid);
      if (allowedNumeric.length) form.set('allowed_outputs', allowedJson);

      const label = includeMemberId ? 'spec_with_member' : 'spec_without_member';
      console.log(`[XUI] edit_line sync (${label}) payload: ${form.toString()}`);
      const editData = await postXuiForm(config, 'edit_line', form, `edit_line(${label})`);

      const editStatus = String(editData?.status || '').toUpperCase();
      const editError = getXuiError(editData);
      if (editError && !editStatus.includes('SUCCESS')) {
        console.log(`[XUI] edit_line sync (${label}) rejected: ${editError}`);
        continue;
      }

      const synced = await checkSynced(`edit_line(${label})`);
      if (synced) return synced;

      // GET fallback with exactly same API-spec fields
      const getParams: Record<string, string | string[]> = {
        id: lineId,
        line_id: lineId,
        max_connections: targetMaxConnections,
      };
      if (targetUsername) getParams.username = targetUsername;
      if (targetExpDate) getParams.exp_date = targetExpDate;
      if (includeMemberId && targetMemberId) getParams.member_id = targetMemberId;
      if (expectedBouquetIds.length) getParams['bouquets_selected[]'] = expectedBouquetIds;
      if (allowedNumeric.length) getParams.allowed_outputs = allowedJson;

      console.log(`[XUI] edit_line GET sync (${label}) params: ${JSON.stringify(getParams).substring(0, 1000)}`);
      const editGetData = await xuiRequestGetOnly(config, 'edit_line', getParams);
      const editGetStatus = String(editGetData?.status || '').toUpperCase();
      const editGetError = getXuiError(editGetData);
      if (!editGetError || editGetStatus.includes('SUCCESS')) {
        const syncedGet = await checkSynced(`edit_line_get(${label})`);
        if (syncedGet) return syncedGet;
      }
    } catch (e: any) {
      console.log(`[XUI] edit_line sync failed: ${e.message}`);
    }
  }

  return getLineRowById(config, lineId);
}

async function enforceUsernamePostCreate(
  config: XuiServerConfig,
  params: {
    lineId: string;
    username: string;
    password?: string;
    expDate?: string;
    maxConnections?: string;
    memberId?: string;
  },
): Promise<string> {
  const lineId = String(params.lineId || '').trim();
  const username = String(params.username || '').trim();
  if (!lineId || !username) return '';

  const form = new URLSearchParams();
  form.set('id', lineId);
  form.set('line_id', lineId);
  form.set('username', username);

  const password = String(params.password || '').trim();
  if (password) form.set('password', password);

  const expDate = String(params.expDate || '').trim();
  if (expDate) form.set('exp_date', expDate);

  const maxConnections = String(params.maxConnections || '').replace(/\D/g, '').trim();
  if (maxConnections) form.set('max_connections', maxConnections);

  const memberId = String(params.memberId || '').replace(/\D/g, '').trim();
  if (memberId) form.set('member_id', memberId);

  try {
    await postXuiForm(config, 'edit_line', form, 'edit_line(username_fix)');
  } catch (e: any) {
    console.log(`[XUI] Username fix POST failed: ${e.message}`);
  }

  try {
    await xuiRequestGetOnly(config, 'edit_line', Object.fromEntries(form.entries()));
  } catch (e: any) {
    console.log(`[XUI] Username fix GET failed: ${e.message}`);
  }

  const refreshed = await getLineRowById(config, lineId);
  return String(refreshed?.username || '').trim();
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

async function getOwnerMemberId(config: XuiServerConfig): Promise<string> {
  try {
    const info = await xuiRequest(config, 'user_info');
    const data = info?.data || info?.user_info || info || {};
    const ownerId = String(data?.id || data?.member_id || '').replace(/\D/g, '').trim();
    if (ownerId) return ownerId;
  } catch {}
  return '1';
}

const DEFAULT_BOUQUET_IDS = ['1', '2', '3', '177', '178'];
const DEFAULT_ALLOWED_OUTPUT_IDS = ['1', '2', '3'];

// Resolve bouquets and allowed_outputs from a package on the XUI server
async function resolvePackageContents(
  config: XuiServerConfig,
  packageId: string,
): Promise<{ bouquetIds: string[]; allowedOutputIds: string[] }> {
  const result = { bouquetIds: [] as string[], allowedOutputIds: [] as string[] };
  const pid = String(packageId || '').replace(/\D/g, '').trim();
  if (!pid || pid === '0') return result;

  try {
    const packagesPayload = await xuiRequest(config, 'get_packages');
    const data = packagesPayload?.data ?? packagesPayload;
    let packages: any[] = [];
    if (Array.isArray(data)) {
      packages = data;
    } else if (data && typeof data === 'object') {
      packages = Object.values(data).filter((p) => p && typeof p === 'object');
    }

    const pkg = packages.find((p: any) => String(p?.id || p?.package_id || '').replace(/\D/g, '') === pid);
    if (!pkg) {
      console.log(`[XUI] Package ${pid} not found in get_packages response`);
      return result;
    }

    // Extract bouquets from package
    const rawBouquets = pkg.bouquets ?? pkg.bouquet ?? pkg.bouquet_ids ?? pkg.bouquets_selected ?? '';
    result.bouquetIds = parseIdList(rawBouquets).map((v) => v.replace(/\D/g, '').trim()).filter(Boolean);

    // Extract allowed_outputs from package
    const rawOutputs = pkg.allowed_outputs ?? pkg.output_formats ?? pkg.allowed_output ?? '';
    const parsedOutputs = parseIdList(rawOutputs).map((v) => v.replace(/\D/g, '').trim()).filter(Boolean);
    // If outputs are empty, default to all 3 (ts, hls, rtmp) - packages usually allow all
    result.allowedOutputIds = parsedOutputs.length ? parsedOutputs : DEFAULT_ALLOWED_OUTPUT_IDS;

    console.log(`[XUI] Package ${pid} contents: bouquets=[${result.bouquetIds.join(',')}] outputs=[${result.allowedOutputIds.join(',')}]`);
  } catch (e: any) {
    console.log(`[XUI] Failed to resolve package contents: ${e.message}`);
  }

  return result;
}

// Main provisioning for XUIOne 1.5.x: single-step create_line
async function provisionUserOnXui(
  config: XuiServerConfig,
  rawParams: Record<string, string> = {},
  memberId: string = '',
) {
  const username = rawParams.username?.trim();
  const password = rawParams.password?.trim();
  if (!username || !password) throw new Error('username e password são obrigatórios');

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

  const requestedPackageId = String(rawParams.package_id || rawParams.package || '').replace(/\D/g, '').trim();
  const explicitBouquets = toNumericIdList(rawParams.bouquets ?? rawParams.bouquet, []);
  const explicitAllowedOutputs = toNumericIdList(rawParams.allowed_outputs, []);
  const planName = String(rawParams.plan_name || rawParams.plan || '').trim();

  let resolvedPackageFromPlan = '';
  if (!requestedPackageId && planName) {
    resolvedPackageFromPlan = await resolvePackageIdFromBouquets(config, {
      requestedPackageId,
      planName,
      bouquetIds: explicitBouquets,
    });
  }

  const packageIdForPayload = requestedPackageId || resolvedPackageFromPlan;

  // CRITICAL: When we have a package_id but no explicit bouquets/outputs,
  // resolve the package contents and send them explicitly.
  // XUI 1.5.12 does NOT auto-inherit bouquets/outputs from package_id via API.
  let bouquetIds: string[];
  let allowedOutputIds: string[];

  // Resolve package contents once if needed
  let pkgContents = { bouquetIds: [] as string[], allowedOutputIds: [] as string[] };
  if (packageIdForPayload && (!explicitBouquets.length || !explicitAllowedOutputs.length)) {
    pkgContents = await resolvePackageContents(config, packageIdForPayload);
  }

  if (explicitBouquets.length) {
    bouquetIds = explicitBouquets;
  } else if (packageIdForPayload) {
    bouquetIds = pkgContents.bouquetIds.length ? pkgContents.bouquetIds : DEFAULT_BOUQUET_IDS;
  } else {
    bouquetIds = DEFAULT_BOUQUET_IDS;
  }

  if (explicitAllowedOutputs.length) {
    allowedOutputIds = explicitAllowedOutputs;
  } else if (packageIdForPayload) {
    allowedOutputIds = pkgContents.allowedOutputIds.length ? pkgContents.allowedOutputIds : DEFAULT_ALLOWED_OUTPUT_IDS;
  } else {
    allowedOutputIds = DEFAULT_ALLOWED_OUTPUT_IDS;
  }

  const maxConnections = String(Math.max(1, Number(rawParams.max_connections || '1') || 1));

  const requestedMemberId = String(memberId || rawParams.member_id || '').replace(/\D/g, '').trim();
  const effectiveMemberId = requestedMemberId || await getOwnerMemberId(config);

  console.log(
    `[XUI] Provisioning ${username} member_id=${effectiveMemberId} package_id=${packageIdForPayload || 'none'} bouquets=${bouquetIds.join(',')} allowed_outputs=${allowedOutputIds.join(',')}`,
  );

  let createData: any = null;
  try {
    createData = await createLinePost(config, {
      username,
      password,
      ...(expDateFormatted ? { expDate: expDateFormatted } : {}),
      memberId: effectiveMemberId,
      ...(packageIdForPayload ? { packageId: packageIdForPayload } : {}),
      maxConnections: Number(maxConnections),
      bouquetIds: bouquetIds.map(Number),
      allowedOutputIds: allowedOutputIds.map(Number),
    });
  } catch (e: any) {
    const message = String(e?.message || '');
    if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('expirou')) {
      const timeoutLineId = await resolveLineIdByUsername(config, username);
      if (timeoutLineId) {
        createData = { status: 'STATUS_SUCCESS', data: { id: timeoutLineId, username } };
        console.log(`[XUI] create_line timeout, but line was found by username=${username} line_id=${timeoutLineId}`);
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  const createStatus = String(createData?.status || '').toUpperCase();
  const createError = getXuiError(createData);
  if (createStatus.includes('EXISTS_USERNAME')) throw new Error(`Username já existe no XUI: ${username}`);
  if (createError && !createStatus.includes('SUCCESS')) throw new Error(createError);

  // Resolve line_id
  const createdLineId = String(createData?.data?.id || createData?.id || '').trim() || await resolveLineIdByUsername(config, username);
  if (!createdLineId) throw new Error('Não foi possível resolver o line_id após create_line');

  // Get final state
  let finalUsername = username;
  let finalLineId = createdLineId;
  let active = true;
  let finalRow: any = null;

  if (createdLineId) {
    finalRow = await waitForLinePresence(config, createdLineId, username);
    if (finalRow) {
      finalLineId = String(finalRow.id || finalRow.line_id || createdLineId).trim();
      finalUsername = String(finalRow.username || username).trim();
      active = isLineActive(finalRow);
      console.log(`[XUI] After create_line: username=${finalRow.username || '?'} bouquet=${finalRow.bouquet || '?'} allowed_outputs=${finalRow.allowed_outputs || '?'}`);
    }

    const currentPackageId = String(finalRow?.package_id || '').replace(/\D/g, '').trim();
    const needsBouquetSync = !hasSameNumericIds(finalRow?.bouquet, bouquetIds);
    const needsOutputSync = !hasSameNumericIds(finalRow?.allowed_outputs ?? finalRow?.output_formats, allowedOutputIds);
    const needsUsernameSync = String(finalRow?.username || '').trim() !== username;
    const needsPackageSync = !!packageIdForPayload && currentPackageId !== packageIdForPayload;

    if (needsBouquetSync || needsOutputSync || needsUsernameSync || needsPackageSync) {
      console.log(
        `[XUI] Sync required for line_id=${createdLineId} bouquet=${needsBouquetSync} outputs=${needsOutputSync} username=${needsUsernameSync} package=${needsPackageSync}`,
      );

      const fallbackRow = await enforceAllowedOutputsPostCreate(config, {
        lineId: createdLineId,
        allowedOutputIds,
        expectedBouquetIds: bouquetIds,
        expectedUsername: username,
        expectedPassword: password,
        expectedMemberId: effectiveMemberId,
        expectedPackageId: packageIdForPayload,
        expDate: expDateFormatted,
        maxConnections,
      });

      if (fallbackRow) {
        finalRow = fallbackRow;
        finalLineId = String(fallbackRow.id || fallbackRow.line_id || finalLineId).trim();
        finalUsername = String(fallbackRow.username || finalUsername || username).trim();
        active = isLineActive(fallbackRow);
        console.log(`[XUI] After sync: username=${fallbackRow.username || '?'} bouquet=${fallbackRow.bouquet || '?'} allowed_outputs=${fallbackRow.allowed_outputs || '?'}`);
      }
    }
  }

  if (finalUsername && finalUsername !== username) {
    const fixedUsername = await enforceUsernamePostCreate(config, {
      lineId: finalLineId,
      username,
      password,
      expDate: expDateFormatted,
      maxConnections,
      memberId: effectiveMemberId,
    });

    if (fixedUsername === username) {
      finalUsername = username;
      console.log(`[XUI] Username restored to requested value: ${username}`);
    } else {
      console.log(`[XUI] WARNING: XUI changed username ${username} -> ${finalUsername}`);
    }
  }

  const confirmedRow = await waitForLinePresence(config, finalLineId, finalUsername || username, 2, 500);
  if (!confirmedRow) {
    throw new Error('XUI não confirmou a criação da linha. Operação abortada para evitar inconsistência.');
  }

  finalLineId = String(confirmedRow.id || confirmedRow.line_id || finalLineId).trim();
  finalUsername = String(confirmedRow.username || finalUsername || username).trim();
  active = isLineActive(confirmedRow);

  const finalBouquetOk = bouquetIds.length === 0 || hasSameNumericIds(confirmedRow?.bouquet, bouquetIds);
  const finalOutputsOk = allowedOutputIds.length === 0 || hasSameNumericIds(confirmedRow?.allowed_outputs ?? confirmedRow?.output_formats, allowedOutputIds);

  if (!finalBouquetOk || !finalOutputsOk) {
    console.log(
      `[XUI] WARNING: bouquet/access may not have persisted (bouquet=${confirmedRow?.bouquet || '[]'} outputs=${confirmedRow?.allowed_outputs || '[]'} expected_bouquets=[${bouquetIds.join(',')}] expected_outputs=[${allowedOutputIds.join(',')}])`
    );
  }

  // Set package_id only when bouquet/output are already confirmed
  // (prevents XUI from clearing fields when package inheritance is broken)
  if (packageIdForPayload && finalBouquetOk && finalOutputsOk) {
    try {
      const pkgForm = new URLSearchParams();
      pkgForm.set('id', finalLineId);
      pkgForm.set('line_id', finalLineId);
      pkgForm.set('package_id', packageIdForPayload);
      pkgForm.set('package', packageIdForPayload);

      for (const bid of bouquetIds) pkgForm.append('bouquets_selected[]', bid);
      if (allowedOutputIds.length) pkgForm.set('allowed_outputs', JSON.stringify(allowedOutputIds.map(Number)));
      if (finalUsername) pkgForm.set('username', finalUsername);
      if (password) pkgForm.set('password', password);
      if (expDateFormatted) pkgForm.set('exp_date', expDateFormatted);
      pkgForm.set('max_connections', maxConnections);

      await postXuiForm(config, 'edit_line', pkgForm, 'edit_line(set_package)');
      console.log(`[XUI] Package ${packageIdForPayload} associated to line ${finalLineId}`);
    } catch (e: any) {
      console.log(`[XUI] WARNING: Failed to set package_id: ${e.message}`);
    }
  } else if (packageIdForPayload) {
    console.log('[XUI] Skipping set_package because bouquet/output are not confirmed yet.');
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
          const profileLabel = String(
            user.user_metadata?.display_name ||
            user.user_metadata?.name ||
            user.email ||
            `user_${user.id.slice(0, 8)}`
          );
          const xuiMemberId = await getOrCreateXuiMemberId(config, user.id, profileLabel, serviceClient);
          console.log(`[XUI] Provisioning with member_id=${xuiMemberId || 'owner'}`);

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
