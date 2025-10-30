const storageKeys = {
  token: 'token',
  role: 'role',
  user: 'user',
};

const API_BASE = '/api';

const getSessionStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn('Sessao inativa, armazenamento indisponivel.', error);
    return null;
  }
};

const setSessionItem = (key, value) => {
  const storage = getSessionStorage();
  if (!storage) return;
  if (value == null) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
};

const getSessionItem = (key) => {
  const storage = getSessionStorage();
  if (!storage) return null;
  return storage.getItem(key);
};

export const getToken = () => getSessionItem(storageKeys.token);

export const getStoredRole = () => getSessionItem(storageKeys.role);

export const getStoredUser = () => {
  const raw = getSessionItem(storageKeys.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

export const clearSession = () => {
  const storage = getSessionStorage();
  if (!storage) return;
  Object.values(storageKeys).forEach((key) => storage.removeItem(key));
};

const buildUrl = (path, searchParams) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${API_BASE}${normalizedPath}`;
  if (searchParams && Object.keys(searchParams).length) {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value == null) return;
      params.append(key, value);
    });
    const query = params.toString();
    if (query) {
      url += `?${query}`;
    }
  }
  return url;
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
};

const request = async (path, options = {}) => {
  const { searchParams, headers, body, method = 'GET', ...rest } = options;
  const finalHeaders = new Headers(headers || {});
  const token = getToken();
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  let requestBody = body;
  if (body != null && !(body instanceof FormData)) {
    finalHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const endpoint = buildUrl(path, searchParams);
  const response = await fetch(endpoint, {
    method,
    body: requestBody,
    headers: finalHeaders,
    credentials: 'include',
    ...rest,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }
    const errorMessage =
      (payload && typeof payload === 'object' && payload.error) ||
      (typeof payload === 'string' && payload) ||
      `Falha ao comunicar com o servidor (status ${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload;
};

export const login = async ({ identifier, password }) => {
  const payload = await request('/login', {
    method: 'POST',
    body: { identifier, password },
  });

  if (payload?.token) {
    setSessionItem(storageKeys.token, payload.token);
  }
  if (payload?.user) {
    setSessionItem(storageKeys.role, payload.user.role || '');
    setSessionItem(storageKeys.user, payload.user);
  }
  return payload;
};

export const logout = () => {
  clearSession();
};

export const getMasterDashboard = (params) => request('/master/dashboard', { searchParams: params });

export const getInfluencerDashboard = (params) => request('/influencer/dashboard', { searchParams: params });

export const getInfluencerHistory = (params) => request('/influencer/history', { searchParams: params });

export default {
  login,
  logout,
  getMasterDashboard,
  getInfluencerDashboard,
  getInfluencerHistory,
  getToken,
  getStoredRole,
  getStoredUser,
};
