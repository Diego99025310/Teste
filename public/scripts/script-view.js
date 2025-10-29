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
  duration: document.getElementById('script-duration'),
  context: document.getElementById('script-context'),
  task: document.getElementById('script-task'),
  importantPoints: document.getElementById('script-important-points'),
  closing: document.getElementById('script-closing'),
  notes: document.getElementById('script-notes'),
  notesSection: document.getElementById('script-notes-section'),
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

const setSectionContent = (element, html, { optional = false, fallback = 'Conteúdo não informado.' } = {}) => {
  if (!element) return;
  const section = element.closest('.script-section');
  if (html) {
    element.innerHTML = html;
    section?.removeAttribute('hidden');
    return;
  }

  if (optional) {
    element.innerHTML = '';
    section?.setAttribute('hidden', '');
    return;
  }

  element.textContent = fallback;
  section?.removeAttribute('hidden');
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

  const durationHtml = script?.duracao ?? script?.duration ?? '';
  const contextHtml = script?.contexto ?? script?.context ?? '';
  const taskHtml = script?.tarefa ?? script?.task ?? '';
  const importantPointsHtml =
    script?.pontos_importantes ?? script?.importantPoints ?? script?.important_points ?? '';
  const closingHtml = script?.finalizacao ?? script?.closing ?? script?.finalization ?? '';
  const notesHtml = script?.notas_adicionais ?? script?.additionalNotes ?? script?.notes ?? '';

  setSectionContent(elements.duration, durationHtml, { fallback: 'Duração não informada.' });
  setSectionContent(elements.context, contextHtml, { fallback: 'Contexto não informado.' });
  setSectionContent(elements.task, taskHtml, { fallback: 'Tarefa não informada.' });
  setSectionContent(elements.importantPoints, importantPointsHtml, {
    fallback: 'Pontos importantes não informados.'
  });
  setSectionContent(elements.closing, closingHtml, { fallback: 'Finalização não informada.' });
  setSectionContent(elements.notes, notesHtml, { optional: true, fallback: '' });

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
