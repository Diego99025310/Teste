export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const ensureLeadingSlash = (path) => (path.startsWith('/') ? path : `/${path}`);

export async function apiFetch(path, options = {}) {
  const target = `${API_BASE_URL}${ensureLeadingSlash(path)}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(target, {
    credentials: options.credentials ?? 'include',
    ...options,
    headers
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}
