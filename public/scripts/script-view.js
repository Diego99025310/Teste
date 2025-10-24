const state = {
  loading: false,
  scriptId: null,
  script: null
};

const elements = {
  title: document.getElementById('script-title'),
  meta: document.getElementById('script-meta'),
  statusMessage: document.getElementById('status-message'),
  article: document.getElementById('script-article'),
  description: document.getElementById('script-description'),
  video: document.getElementById('script-video'),
  logoutBtn: document.getElementById('logout-btn')
};

const session = (() => {
  try {
    return window.sessionStorage;
  } catch (error) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }
})();

const persistentSession = (() => {
  try {
    return window.localStorage;
  } catch (error) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
  }
})();

const TOKEN_STORAGE_KEY = 'token';

const readStorage = (storage, key) => {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
};

const writeStorage = (storage, key, value) => {
  if (!storage || typeof storage.setItem !== 'function') return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    // Ignore persistence failures (privacy mode, quota, etc.)
  }
};

const removeStorage = (storage, key) => {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(key);
  } catch (error) {
    // Ignore removal failures
  }
};

const getToken = () => {
  const sessionToken = readStorage(session, TOKEN_STORAGE_KEY);
  const persistentToken = readStorage(persistentSession, TOKEN_STORAGE_KEY);
  const token = sessionToken || persistentToken || null;

  if (token) {
    if (sessionToken !== token) {
      writeStorage(session, TOKEN_STORAGE_KEY, token);
    }
    if (persistentToken !== token) {
      writeStorage(persistentSession, TOKEN_STORAGE_KEY, token);
    }
  }

  return token;
};

const clearToken = () => {
  removeStorage(session, TOKEN_STORAGE_KEY);
  removeStorage(persistentSession, TOKEN_STORAGE_KEY);
};

const logout = () => {
  clearToken();
  if (typeof window.logout === 'function') {
    window.logout();
  } else {
    window.location.replace('login.html');
  }
};

elements.logoutBtn?.addEventListener('click', logout);

const ensureAuth = () => {
  const token = getToken();
  if (!token) {
    logout();
    return false;
  }
  return true;
};

const showMessage = (message, type = 'info') => {
  if (!elements.statusMessage) return;
  if (!message) {
    elements.statusMessage.textContent = '';
    elements.statusMessage.className = 'status-message';
    elements.statusMessage.setAttribute('hidden', '');
    return;
  }
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type === 'error' ? 'error' : 'info'}`.trim();
  elements.statusMessage.removeAttribute('hidden');
};

const setLoading = (loading) => {
  state.loading = loading;
  if (loading) {
    showMessage('Carregando roteiro...', 'info');
    elements.article?.setAttribute('hidden', '');
  }
};

const normalizeDateInput = (value) => {
  if (typeof value !== 'string') return value;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value.trim())) {
    return value.trim().replace(' ', 'T');
  }
  return value;
};

const formatDateTime = (value) => {
  if (!value) return null;
  const normalized = normalizeDateInput(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(parsed);
};

const toTrimmedString = (value) => {
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
};

const ensureUrlHasProtocol = (value = '') => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const extractYouTubeId = (url) => {
  if (!(url instanceof URL)) return null;
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const candidate = segments[0];
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  }

  if (host.endsWith('youtube.com')) {
    const searchId = url.searchParams.get('v');
    if (searchId && /^[A-Za-z0-9_-]{11}$/.test(searchId.trim())) {
      return searchId.trim();
    }

    if (segments.length >= 2 && ['embed', 'shorts', 'live'].includes(segments[0])) {
      const candidate = segments[1];
      if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate.trim())) {
        return candidate.trim();
      }
    }
  }

  return null;
};

const buildInstagramEmbedUrl = (url) => {
  if (!(url instanceof URL)) return '';
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (host !== 'instagram.com' && !host.endsWith('.instagram.com')) {
    return '';
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return '';
  }

  const prefix = segments[0].toLowerCase();
  const code = segments[1];
  if (!['p', 'reel', 'tv'].includes(prefix)) {
    return '';
  }

  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return '';
  }

  return `https://www.instagram.com/${prefix}/${code}/embed/`;
};

const normalizeProvider = (provider, fallbackUrl = '') => {
  const normalized = (provider || '').toLowerCase();
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('instagram')) return 'instagram';

  const direct = ensureUrlHasProtocol(fallbackUrl);
  if (!direct) return normalized || '';

  try {
    const parsed = new URL(direct);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('youtube')) return 'youtube';
    if (host.includes('instagram')) return 'instagram';
  } catch (error) {
    // Ignore parsing errors
  }

  return normalized || '';
};

const deriveEmbeddedVideoUrl = ({ embedUrl, provider, url }) => {
  const existing = toTrimmedString(embedUrl);
  if (existing) {
    return existing;
  }

  const direct = ensureUrlHasProtocol(url);
  if (!direct) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(direct);
  } catch (error) {
    return '';
  }

  const normalizedProvider = normalizeProvider(provider, direct);
  if (normalizedProvider === 'youtube') {
    const videoId = extractYouTubeId(parsed);
    return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
  }

  if (normalizedProvider === 'instagram') {
    return buildInstagramEmbedUrl(parsed);
  }

  return '';
};

const decorateEmbedUrl = (src, provider) => {
  try {
    const parsed = new URL(src);
    if (provider === 'youtube') {
      parsed.searchParams.set('rel', '0');
      parsed.searchParams.set('modestbranding', '1');
      parsed.searchParams.set('playsinline', '1');
    } else if (provider === 'instagram') {
      parsed.searchParams.set('utm_source', 'ig_embed');
      parsed.searchParams.set('enable_video', '1');
      parsed.searchParams.set('hidecaption', '1');
    }
    return parsed.toString();
  } catch (error) {
    return src;
  }
};

const buildAutoplayUrl = (src, provider) => {
  const decorated = decorateEmbedUrl(src, provider);
  try {
    const parsed = new URL(decorated);
    if (provider === 'youtube') {
      parsed.searchParams.set('autoplay', '1');
      parsed.searchParams.set('mute', '1');
    } else if (provider === 'instagram') {
      parsed.searchParams.set('autoplay', '1');
      parsed.searchParams.set('mute', '1');
    }
    return parsed.toString();
  } catch (error) {
    return decorated;
  }
};

const extractYouTubeIdFromEmbed = (src) => {
  try {
    const parsed = new URL(src);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const candidate = segments[segments.length - 1];
    if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) {
      return candidate;
    }
    const searchId = parsed.searchParams.get('v');
    return searchId && /^[A-Za-z0-9_-]{11}$/.test(searchId) ? searchId : null;
  } catch (error) {
    return null;
  }
};

const createOverlayButton = () => {
  const overlay = document.createElement('button');
  overlay.type = 'button';
  overlay.className = 'embedded-video__overlay';

  const icon = document.createElement('span');
  icon.className = 'embedded-video__overlay-icon';
  icon.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'embedded-video__overlay-label';
  label.textContent = 'Reproduzir vídeo';

  overlay.append(icon, label);
  return overlay;
};

const createEmbeddedVideo = ({ embedUrl, format, provider, url } = {}) => {
  const src = deriveEmbeddedVideoUrl({ embedUrl, provider, url });
  if (!src) return null;

  const normalizedProvider = normalizeProvider(provider, embedUrl || url);
  const decoratedSrc = decorateEmbedUrl(src, normalizedProvider);
  const playbackSrc = buildAutoplayUrl(decoratedSrc, normalizedProvider);

  const wrapper = document.createElement('div');
  wrapper.className = 'embedded-video';
  const orientation = typeof format === 'string' && format.toLowerCase() === 'vertical' ? 'vertical' : 'landscape';
  wrapper.classList.add(`embedded-video--${orientation}`);
  wrapper.dataset.orientation = orientation;
  if (normalizedProvider) {
    wrapper.dataset.provider = normalizedProvider;
    wrapper.classList.add(`embedded-video--provider-${normalizedProvider}`);
  }

  if (normalizedProvider === 'youtube') {
    const videoId = extractYouTubeIdFromEmbed(decoratedSrc) || extractYouTubeIdFromEmbed(playbackSrc);
    if (videoId) {
      wrapper.style.setProperty('--embedded-video-thumbnail', `url("https://i.ytimg.com/vi/${videoId}/hqdefault.jpg")`);
      wrapper.classList.add('embedded-video--has-thumbnail');
    }
  }

  const iframe = document.createElement('iframe');
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('loading', 'lazy');
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('scrolling', 'no');
  if (normalizedProvider === 'instagram') {
    iframe.setAttribute('allowtransparency', 'true');
  }
  iframe.title = normalizedProvider === 'instagram' ? 'Vídeo do Instagram' : 'Vídeo do YouTube';
  iframe.dataset.src = playbackSrc;

  const overlay = createOverlayButton();
  overlay.addEventListener('click', () => {
    if (!iframe.src) {
      iframe.src = iframe.dataset.src || decoratedSrc;
    }
    wrapper.classList.add('is-playing');
    overlay.remove();
  });

  wrapper.append(iframe, overlay);
  return wrapper;
};

const extractScriptVideo = (script) => {
  if (!script) return null;
  if (script.video && typeof script.video === 'object') {
    const url = toTrimmedString(script.video.url ?? script.video.href ?? '');
    const embedUrl = toTrimmedString(script.video.embedUrl ?? '');
    const provider = toTrimmedString(script.video.provider ?? '');
    const format = toTrimmedString(script.video.format ?? script.video.videoFormat ?? '');
    if (url || embedUrl) {
      return {
        url: url || null,
        embedUrl: embedUrl || null,
        provider: provider || null,
        format: format || null
      };
    }
  }

  const fallbackUrl = toTrimmedString(script.video_url ?? script.videoUrl ?? '');
  const fallbackEmbed = toTrimmedString(script.video_embed_url ?? script.videoEmbedUrl ?? '');
  const fallbackProvider = toTrimmedString(script.video_provider ?? script.videoProvider ?? '');
  const fallbackFormat = toTrimmedString(script.video_format ?? script.videoFormat ?? '');

  if (fallbackUrl || fallbackEmbed) {
    return {
      url: fallbackUrl || null,
      embedUrl: fallbackEmbed || null,
      provider: fallbackProvider || null,
      format: fallbackFormat || null
    };
  }

  return null;
};

const renderScriptVideo = (video) => {
  const container = elements.video;
  if (!container) return;
  container.innerHTML = '';
  if (!video || (!video.url && !video.embedUrl)) {
    container.setAttribute('hidden', '');
    return;
  }

  const embed = createEmbeddedVideo({
    embedUrl: video.embedUrl,
    provider: video.provider,
    url: video.url,
    format: video.format ?? null
  });
  if (embed) {
    container.appendChild(embed);
  }

  if (!container.childNodes.length) {
    container.setAttribute('hidden', '');
    return;
  }

  container.removeAttribute('hidden');
};

const renderScript = (script) => {
  state.script = script;
  const title = script?.titulo ?? script?.title ?? `Roteiro #${state.scriptId ?? ''}`.trim();
  if (elements.title) {
    elements.title.textContent = title || 'Roteiro';
  }

  const updated = script?.updated_at ?? script?.updatedAt ?? null;
  const created = script?.created_at ?? script?.createdAt ?? null;
  const formattedUpdated = formatDateTime(updated);
  const formattedCreated = formatDateTime(created);

  if (elements.meta) {
    if (formattedUpdated && formattedCreated && formattedUpdated !== formattedCreated) {
      elements.meta.textContent = `Atualizado em ${formattedUpdated}`;
      elements.meta.removeAttribute('hidden');
    } else if (formattedUpdated) {
      elements.meta.textContent = `Atualizado em ${formattedUpdated}`;
      elements.meta.removeAttribute('hidden');
    } else if (formattedCreated) {
      elements.meta.textContent = `Criado em ${formattedCreated}`;
      elements.meta.removeAttribute('hidden');
    } else {
      elements.meta.textContent = '';
      elements.meta.setAttribute('hidden', '');
    }
  }

  const descriptionHtml = script?.descricao ?? script?.description ?? '';
  if (elements.description) {
    elements.description.innerHTML = descriptionHtml ||
      '<p>Este roteiro não possui conteúdo cadastrado no momento.</p>';
  }

  renderScriptVideo(extractScriptVideo(script));

  elements.article?.removeAttribute('hidden');
  showMessage('', 'info');
};

const fetchScript = async (id) => {
  if (!ensureAuth()) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const token = getToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const response = await fetch(`/scripts/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      logout();
      const error = new Error('Sessão expirada. Faça login novamente.');
      error.status = 401;
      throw error;
    }
    const error = new Error(data?.error || 'Não foi possível carregar o roteiro.');
    error.status = response.status;
    throw error;
  }

  return data;
};

const loadScript = async () => {
  if (!state.scriptId) return;
  setLoading(true);
  try {
    const script = await fetchScript(state.scriptId);
    renderScript(script);
  } catch (error) {
    elements.article?.setAttribute('hidden', '');
    if (error.status === 404) {
      showMessage('Roteiro não encontrado ou pode ter sido removido.', 'error');
    } else {
      showMessage(error.message || 'Não foi possível carregar o roteiro.', 'error');
    }
  } finally {
    state.loading = false;
  }
};

const initialize = () => {
  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const numericId = Number(rawId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    showMessage('Identificador de roteiro inválido.', 'error');
    return;
  }
  state.scriptId = numericId;
  if (!ensureAuth()) return;
  loadScript();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
