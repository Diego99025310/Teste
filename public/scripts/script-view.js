const state = {
  loading: false,
  scriptId: null,
  script: null,
  cycle: null,
  scheduleOccurrences: [],
  scheduleLoading: false,
  scheduling: false,
  scheduleError: null
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
  scheduleButton: document.getElementById('schedule-script-btn'),
  scheduleButtonLabel: document.querySelector('#schedule-script-btn .schedule-btn__label'),
  scheduleStatus: document.getElementById('schedule-status'),
  scheduleFeedback: document.getElementById('schedule-feedback'),
  scheduleCard: document.getElementById('schedule-card'),
  scheduleDateInput: document.getElementById('schedule-date-input')
};

const DEFAULT_SCHEDULE_LABEL = elements.scheduleButtonLabel?.textContent?.trim() || 'Agendar Roteiro';

const STATUS_LABELS = {
  scheduled: 'Agendado',
  validated: 'Validado',
  posted: 'Publicado',
  missed: 'Atrasado'
};

const getStatusLabel = (status) => {
  if (!status || typeof status !== 'string') return null;
  const key = status.toLowerCase();
  return STATUS_LABELS[key] ?? null;
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

elements.scheduleButton?.addEventListener('click', handleScheduleButtonClick);
elements.scheduleDateInput?.addEventListener('change', (event) => {
  const value = event?.target?.value ?? '';
  scheduleScript(value);
  event?.target?.blur?.();
});

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

const setScheduleFeedback = (message, type = 'info') => {
  if (!elements.scheduleFeedback) return;
  if (!message) {
    elements.scheduleFeedback.textContent = '';
    elements.scheduleFeedback.className = 'schedule-feedback';
    elements.scheduleFeedback.setAttribute('hidden', '');
    return;
  }

  const classes = ['schedule-feedback'];
  if (type === 'success') {
    classes.push('schedule-feedback--success');
  } else if (type === 'error') {
    classes.push('schedule-feedback--error');
  }

  elements.scheduleFeedback.className = classes.join(' ');
  elements.scheduleFeedback.textContent = message;
  elements.scheduleFeedback.removeAttribute('hidden');
};

const setScheduleButtonLabel = (label) => {
  if (!elements.scheduleButtonLabel) return;
  elements.scheduleButtonLabel.textContent = label;
};

const revealScheduleCard = () => {
  if (!elements.scheduleCard) return;
  if (!elements.scheduleCard.hasAttribute('hidden')) return;
  elements.scheduleCard.removeAttribute('hidden');
};

const setScheduleDateInputDisabled = (disabled) => {
  if (!elements.scheduleDateInput) return;
  if (disabled) {
    elements.scheduleDateInput.setAttribute('disabled', '');
    elements.scheduleDateInput.setAttribute('aria-disabled', 'true');
  } else {
    elements.scheduleDateInput.removeAttribute('disabled');
    elements.scheduleDateInput.removeAttribute('aria-disabled');
  }
};

const applyScheduleDateConstraints = () => {
  if (!elements.scheduleDateInput) return;

  if (state.cycle?.startDate) {
    elements.scheduleDateInput.min = state.cycle.startDate;
  } else {
    elements.scheduleDateInput.removeAttribute('min');
  }

  if (state.cycle?.endDate) {
    elements.scheduleDateInput.max = state.cycle.endDate;
  } else {
    elements.scheduleDateInput.removeAttribute('max');
  }
};

const setScheduleButtonLoading = (loading, label) => {
  if (!elements.scheduleButton) return;
  if (loading) {
    elements.scheduleButton.setAttribute('data-loading', 'true');
    if (label) {
      setScheduleButtonLabel(label);
    }
  } else {
    elements.scheduleButton.removeAttribute('data-loading');
    setScheduleButtonLabel(DEFAULT_SCHEDULE_LABEL);
  }
};

const setScheduleButtonDisabled = (disabled) => {
  if (!elements.scheduleButton) return;
  if (disabled) {
    elements.scheduleButton.setAttribute('disabled', '');
    elements.scheduleButton.setAttribute('aria-disabled', 'true');
  } else {
    elements.scheduleButton.removeAttribute('disabled');
    elements.scheduleButton.removeAttribute('aria-disabled');
  }
  setScheduleDateInputDisabled(disabled);
};

const setLoading = (loading) => {
  state.loading = loading;
  if (loading) {
    showMessage('Carregando roteiro...', 'info');
    elements.article?.setAttribute('hidden', '');
  }
};

const updateScheduleButtonAvailability = () => {
  if (!elements.scheduleButton) return;
  const disabled =
    !state.scriptId ||
    state.scheduleLoading ||
    state.scheduling ||
    (!state.cycle && Boolean(state.scheduleError));
  setScheduleButtonDisabled(disabled);
  applyScheduleDateConstraints();
};

const renderScheduleStatus = () => {
  if (!elements.scheduleStatus) return;

  if (state.scheduleLoading) {
    elements.scheduleStatus.textContent = 'Carregando informações de agendamento...';
    elements.scheduleStatus.className = 'schedule-status schedule-status--loading';
    elements.scheduleStatus.removeAttribute('hidden');
    return;
  }

  if (state.scheduleError) {
    elements.scheduleStatus.textContent = state.scheduleError;
    elements.scheduleStatus.className = 'schedule-status schedule-status--error';
    elements.scheduleStatus.removeAttribute('hidden');
    return;
  }

  const messages = [];
  if (state.cycle?.startDate && state.cycle?.endDate) {
    messages.push(
      `Ciclo vigente: ${formatDateLabel(state.cycle.startDate)} até ${formatDateLabel(state.cycle.endDate)}.`
    );
  } else if (state.cycle?.startDate || state.cycle?.endDate) {
    const startLabel = state.cycle?.startDate ? formatDateLabel(state.cycle.startDate) : null;
    const endLabel = state.cycle?.endDate ? formatDateLabel(state.cycle.endDate) : null;
    if (startLabel && endLabel) {
      messages.push(`Ciclo vigente: ${startLabel} até ${endLabel}.`);
    } else if (startLabel) {
      messages.push(`Ciclo iniciado em ${startLabel}.`);
    } else if (endLabel) {
      messages.push(`Ciclo encerra em ${endLabel}.`);
    }
  }

  if (state.scheduleOccurrences.length) {
    const formattedOccurrences = state.scheduleOccurrences
      .map((occurrence) => {
        const dateLabel = formatDateLabel(occurrence.date);
        const statusLabel = getStatusLabel(occurrence.status);
        return statusLabel ? `${dateLabel} (${statusLabel})` : dateLabel;
      })
      .join(' • ');
    messages.push(`Agendado para: ${formattedOccurrences}.`);
  } else if (state.cycle) {
    messages.push('Nenhum agendamento cadastrado para este roteiro ainda.');
  }

  if (!messages.length) {
    elements.scheduleStatus.textContent = '';
    elements.scheduleStatus.className = 'schedule-status';
    elements.scheduleStatus.setAttribute('hidden', '');
    return;
  }

  elements.scheduleStatus.textContent = messages.join(' ');
  elements.scheduleStatus.className = 'schedule-status';
  elements.scheduleStatus.removeAttribute('hidden');
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

const formatDateLabel = (isoDate) => {
  if (!isoDate || typeof isoDate !== 'string' || isoDate.length < 10) return isoDate;
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) return isoDate;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
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

const fetchWithAuth = async (url, { method = 'GET', body, headers = {} } = {}) => {
  if (!ensureAuth()) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const token = getToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      logout();
    }
    const error = new Error(data?.error || data?.message || 'Erro ao conectar com o servidor.');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const normalizeCycle = (cycle) => {
  if (!cycle) return null;

  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth() + 1;

  const year = Number(cycle.year ?? cycle.cycle_year ?? fallbackYear);
  const month = Number(cycle.month ?? cycle.cycle_month ?? fallbackMonth);
  const monthLabel = String(month).padStart(2, '0');

  const toDateOnly = (value) => {
    if (!value || typeof value !== 'string') return null;
    if (value.length >= 10) {
      return value.slice(0, 10);
    }
    return null;
  };

  const startDate =
    toDateOnly(cycle.startDate) ||
    toDateOnly(cycle.started_at) ||
    `${year}-${monthLabel}-01`;

  const computeCycleEnd = () => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${monthLabel}-${String(lastDay).padStart(2, '0')}`;
  };

  const endDate =
    toDateOnly(cycle.endDate) ||
    toDateOnly(cycle.ended_at) ||
    computeCycleEnd();

  return {
    id: cycle.id ?? null,
    year,
    month,
    startDate,
    endDate
  };
};

const normalizePlan = (plan) => {
  if (!plan || plan._removed) return null;
  const scriptId = plan.content_script_id ?? plan.scriptId ?? plan.script_id ?? plan.contentScriptId ?? null;
  const normalizedScriptId = Number(scriptId);
  if (!Number.isInteger(normalizedScriptId)) return null;

  const rawDate = plan.scheduled_date ?? plan.date ?? plan.scheduledDate ?? null;
  const date = typeof rawDate === 'string' && rawDate.length >= 10 ? rawDate.slice(0, 10) : null;
  if (!date) return null;

  const status = typeof plan.status === 'string' ? plan.status.toLowerCase() : null;

  return {
    scriptId: normalizedScriptId,
    date,
    status
  };
};

const isDateWithinCycle = (isoDate) => {
  if (!isoDate) return false;
  if (!state.cycle) return true;
  const { startDate, endDate } = state.cycle;
  if (startDate && isoDate < startDate) return false;
  if (endDate && isoDate > endDate) return false;
  return true;
};

const loadScheduleContext = async ({ silent = false } = {}) => {
  if (!state.scriptId || !elements.scheduleButton) return;

  if (!silent) {
    state.scheduleLoading = true;
    state.scheduleError = null;
    setScheduleButtonLoading(true, 'Carregando...');
    setScheduleButtonDisabled(true);
    renderScheduleStatus();
  }

  try {
    const data = await fetchWithAuth('/api/influencer/plan');
    state.cycle = normalizeCycle(data?.cycle);
    const occurrences = Array.isArray(data?.plans)
      ? data.plans
          .map((plan) => normalizePlan(plan))
          .filter((plan) => plan && plan.scriptId === state.scriptId)
      : [];
    state.scheduleOccurrences = occurrences;
    state.scheduleError = null;
    if (!silent) {
      setScheduleFeedback('', 'info');
    }
  } catch (error) {
    const message = error?.message || 'Não foi possível carregar os agendamentos.';
    state.scheduleError = message;
    setScheduleFeedback(message, 'error');
  } finally {
    state.scheduleLoading = false;
    if (!silent) {
      setScheduleButtonLoading(false);
    }
    renderScheduleStatus();
    updateScheduleButtonAvailability();
  }
};

function handleScheduleButtonClick() {
  if (!elements.scheduleDateInput || state.scheduleLoading || state.scheduling) return;
  if (!ensureAuth()) return;

  revealScheduleCard();

  elements.scheduleDateInput.value = '';
  applyScheduleDateConstraints();
  setScheduleDateInputDisabled(false);

  window.requestAnimationFrame(() => {
    if (typeof elements.scheduleDateInput.showPicker === 'function') {
      elements.scheduleDateInput.showPicker();
    } else {
      elements.scheduleDateInput.focus();
      elements.scheduleDateInput.click();
    }
  });
}

const scheduleScript = async (isoDate) => {
  if (!isoDate || state.scheduling) return;
  const normalizedDate = typeof isoDate === 'string' ? isoDate.slice(0, 10) : null;
  if (!normalizedDate) return;

  if (!isDateWithinCycle(normalizedDate)) {
    setScheduleFeedback('Escolha uma data dentro do ciclo vigente.', 'error');
    return;
  }

  if (state.scheduleOccurrences.some((occurrence) => occurrence.date === normalizedDate)) {
    setScheduleFeedback('Esse roteiro já está agendado para essa data.', 'error');
    return;
  }

  if (!ensureAuth()) return;

  state.scheduling = true;
  setScheduleButtonLoading(true, 'Agendando...');
  setScheduleButtonDisabled(true);

  try {
    await fetchWithAuth('/api/influencer/plan', {
      method: 'POST',
      body: {
        schedules: [
          {
            scriptId: state.scriptId,
            date: normalizedDate,
            append: true
          }
        ]
      }
    });
    setScheduleFeedback('Agendamento enviado para aprovação 💗', 'success');
    await loadScheduleContext({ silent: true });
  } catch (error) {
    const message = error?.message || 'Não foi possível agendar o roteiro.';
    setScheduleFeedback(message, 'error');
  } finally {
    state.scheduling = false;
    setScheduleButtonLoading(false);
    updateScheduleButtonAvailability();
  }
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
  loadScheduleContext();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
