const state = {
  loading: false,
  cycle: null,
  influencer: null,
  scripts: [],
  plans: [],
  planMap: new Map(),
  currentFilter: 'all'
};

const elements = {
  cycleName: document.getElementById('cycle-name'),
  roteirosList: document.getElementById('roteiros-list'),
  emptyState: document.getElementById('empty-state'),
  filters: Array.from(document.querySelectorAll('.filter-btn')),
  toastContainer: document.getElementById('toast-container'),
  logoutBtn: document.getElementById('logout-btn')
};

let toastTimeoutId = null;
let activePopover = null;

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

const toPlainText = (html, { preserveBreaks = false } = {}) => {
  if (!html) return '';
  let value = String(html);

  if (preserveBreaks) {
    value = value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<h[1-6][^>]*>/gi, '')
      .replace(/<ul[^>]*>/gi, '')
      .replace(/<ol[^>]*>/gi, '');

    value = value.replace(/<[^>]+>/g, '');

    return value
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatDateLabel = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
};

const ensureAuth = () => {
  const token = getToken();
  if (!token) {
    logout();
    return false;
  }
  return true;
};

const fetchWithAuth = async (url, { method = 'GET', body, headers = {} } = {}) => {
  if (!ensureAuth()) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const token = getToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const requestHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...headers
  };

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
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

const showToast = (message, type = 'info') => {
  if (!elements.toastContainer || !message) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  window.requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 300);
  }, 3200);
};

const closeActivePopover = () => {
  if (activePopover?.element?.isConnected) {
    activePopover.element.remove();
  }
  activePopover = null;
};

const setLoading = (loading) => {
  state.loading = loading;
  if (!elements.roteirosList) return;
  elements.roteirosList.innerHTML = '';
  if (loading) {
    for (let index = 0; index < 3; index += 1) {
      const skeleton = document.createElement('div');
      skeleton.className = 'loading-card';
      for (let line = 0; line < 3; line += 1) {
        const placeholder = document.createElement('div');
        placeholder.className = 'loading-card__line';
        skeleton.appendChild(placeholder);
      }
      elements.roteirosList.appendChild(skeleton);
    }
    elements.emptyState?.setAttribute('hidden', '');
  }
};

const normalizeScript = (script) => {
  if (!script) return null;

  const id = script.id ?? null;
  const title = script.title ?? script.titulo ?? (id ? `Roteiro #${id}` : 'Roteiro');

  const duration = script.duration ?? script.duracao ?? '';
  const context = script.context ?? script.contexto ?? '';
  const task = script.task ?? script.tarefa ?? '';
  const importantPoints =
    script.importantPoints ?? script.important_points ?? script.pontos_importantes ?? '';
  const closing = script.closing ?? script.finalization ?? script.finalizacao ?? '';
  const additionalNotes = script.additionalNotes ?? script.notas_adicionais ?? script.notes ?? '';

  const durationText = toPlainText(duration);
  const contextText = toPlainText(context, { preserveBreaks: true });
  const taskText = toPlainText(task, { preserveBreaks: true });
  const importantPointsText = toPlainText(importantPoints, { preserveBreaks: true });
  const closingText = toPlainText(closing, { preserveBreaks: true });
  const additionalNotesText = toPlainText(additionalNotes, { preserveBreaks: true });

  const previewFromApi = toPlainText(script.preview ?? '', { preserveBreaks: false });
  const fallbackPreviewSegments = [contextText, taskText, importantPointsText, closingText]
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0);
  const fallbackPreview = fallbackPreviewSegments.join(' ');
  const previewSource = (previewFromApi || fallbackPreview).trim();
  const preview = previewSource.length > 180 ? `${previewSource.slice(0, 177).trim()}…` : previewSource;

  return {
    id,
    title,
    preview,
    duration,
    durationText,
    context,
    contextText,
    task,
    taskText,
    importantPoints,
    importantPointsText,
    closing,
    closingText,
    additionalNotes,
    additionalNotesText,
    product: script.product ?? null,
    updatedAt: script.updatedAt ?? script.updated_at ?? null,
    createdAt: script.createdAt ?? script.created_at ?? null
  };
};

const buildScriptViewerUrl = (scriptId) => {
  if (!scriptId) return 'script-view.html';
  const numericId = Number(scriptId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return 'script-view.html';
  }
  return `script-view.html?id=${encodeURIComponent(numericId)}`;
};

const createViewScriptAction = (script) => {
  const link = document.createElement('a');
  link.className = 'card-actions__button card-actions__button--view';
  link.href = buildScriptViewerUrl(script?.id);
  link.textContent = 'Visualizar';
  if (script?.title) {
    link.setAttribute('aria-label', `Abrir roteiro completo de ${script.title}`);
  }

  return link;
};

const normalizePlan = (plan) => {
  if (!plan) return null;
  const scriptId = plan.scriptId ?? plan.content_script_id ?? null;
  return {
    id: plan.id ?? null,
    cycleId: plan.cycleId ?? plan.cycle_id ?? null,
    influencerId: plan.influencerId ?? plan.influencer_id ?? null,
    scheduled_date: plan.date ?? plan.scheduled_date ?? null,
    status: plan.status ?? 'scheduled',
    notes: plan.notes ?? null,
    content_script_id: scriptId,
    script_title: plan.scriptTitle ?? plan.script_title ?? null,
    created_at: plan.createdAt ?? plan.created_at ?? null,
    updated_at: plan.updatedAt ?? plan.updated_at ?? null,
    _removed: false,
    _new: false,
    _localId: null
  };
};

const rebuildPlanMap = () => {
  const planMap = new Map();

  state.plans.forEach((plan) => {
    if (!plan || plan._removed || !plan.content_script_id) {
      return;
    }

    const list = planMap.get(plan.content_script_id) ?? [];
    list.push(plan);
    planMap.set(plan.content_script_id, list);
  });

  planMap.forEach((list, scriptId) => {
    list.sort((a, b) => {
      if (a.scheduled_date === b.scheduled_date) {
        return (a.id ?? 0) - (b.id ?? 0);
      }
      return a.scheduled_date.localeCompare(b.scheduled_date);
    });
    planMap.set(scriptId, list);
  });

  state.planMap = planMap;
};

const getPlansForScript = (scriptId) => state.planMap.get(scriptId) ?? [];

const hasPlansForScript = (scriptId) => getPlansForScript(scriptId).length > 0;

const planExistsForDate = (scriptId, isoDate) =>
  state.plans.some(
    (plan) =>
      plan &&
      !plan._removed &&
      plan.content_script_id === scriptId &&
      plan.scheduled_date === isoDate
  );

const STATUS_LABELS = {
  scheduled: 'Agendado',
  validated: 'Validado',
  posted: 'Publicado',
  missed: 'Atrasado'
};

const buildStatusChip = (plan) => {
  if (!plan) return null;

  const chip = document.createElement('span');
  chip.className = 'schedule-occurrence__status';

  if (plan._new) {
    chip.classList.add('schedule-occurrence__status--pending');
    chip.textContent = 'Novo agendamento';
    return chip;
  }

  const statusKey = typeof plan.status === 'string' ? plan.status.toLowerCase() : '';
  const label = STATUS_LABELS[statusKey] ?? (statusKey ? statusKey : 'Agendado');
  chip.textContent = label;

  if (statusKey === 'validated') {
    chip.classList.add('schedule-occurrence__status--validated');
  } else if (statusKey === 'posted') {
    chip.classList.add('schedule-occurrence__status--posted');
  } else if (statusKey === 'missed') {
    chip.classList.add('schedule-occurrence__status--missed');
  } else {
    chip.classList.add('schedule-occurrence__status--scheduled');
  }

  return chip;
};

const normalizeCycle = (cycle) => {
  if (!cycle) return null;
  const fallbackYear = new Date().getFullYear();
  const fallbackMonth = new Date().getMonth() + 1;
  const year = Number(cycle.year ?? cycle.cycle_year ?? fallbackYear);
  const month = Number(cycle.month ?? cycle.cycle_month ?? fallbackMonth);
  const monthLabel = String(month).padStart(2, '0');

  const toDateOnly = (value) => {
    if (!value) return null;
    if (typeof value === 'string' && value.length >= 10) {
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

  const endDate = toDateOnly(cycle.endDate) || computeCycleEnd();

  return {
    id: cycle.id ?? null,
    year,
    month,
    status: cycle.status ?? 'open',
    label: cycle.label ?? `${monthLabel}/${year}`,
    startDate,
    endDate
  };
};

const syncStateFromResponse = (data) => {
  state.cycle = normalizeCycle(data?.cycle);

  state.influencer = data?.influencer ?? null;
  state.scripts = Array.isArray(data?.scripts) ? data.scripts.map((script) => normalizeScript(script)).filter(Boolean) : [];
  state.plans = Array.isArray(data?.plans) ? data.plans.map((plan) => normalizePlan(plan)).filter(Boolean) : [];
  rebuildPlanMap();
  state.currentFilter = 'all';

  renderCycleInfo();
  renderRoteiros();
};

const renderCycleInfo = () => {
  if (!elements.cycleName) return;
  if (!state.cycle) {
    elements.cycleName.textContent = 'Não encontrado';
    return;
  }
  const month = String(state.cycle.month).padStart(2, '0');
  elements.cycleName.textContent = `${month}/${state.cycle.year}`;
};

const persistPlanChanges = async (payload) => {
  if (!ensureAuth()) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const response = await fetchWithAuth('/api/influencer/plan', {
    method: 'POST',
    body: payload
  });

  syncStateFromResponse(response);
  return response;
};

const addScheduleForScript = async (script, isoDate) => {
  if (!script || !isoDate) return false;
  const normalizedDate = isoDate.trim();
  if (planExistsForDate(script.id, normalizedDate)) {
    showToast('Esse roteiro já está agendado para essa data.', 'error');
    return false;
  }

  try {
    await persistPlanChanges({
      schedules: [
        {
          scriptId: script.id,
          date: normalizedDate,
          append: true
        }
      ]
    });
    closeActivePopover();
    showToast('Agendamento enviado para aprovação 💗', 'success');
    return true;
  } catch (error) {
    if (error?.message) {
      showToast(error.message, 'error');
    } else {
      showToast('Não foi possível agendar o roteiro.', 'error');
    }
    return false;
  }
};

const removePlanOccurrence = async (plan, triggerButton) => {
  if (!plan) return;

  if (!plan.id) {
    showToast('Não foi possível identificar este agendamento.', 'error');
    return;
  }

  const originalText = triggerButton?.textContent;
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = 'Removendo...';
  }

  let success = false;
  try {
    await persistPlanChanges({ removedPlans: [plan.id] });
    showToast('Agendamento removido.', 'success');
    success = true;
  } catch (error) {
    if (error?.message) {
      showToast(error.message, 'error');
    } else {
      showToast('Não foi possível remover o agendamento.', 'error');
    }
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = originalText ?? 'Remover';
    }
    if (success && activePopover?.scriptId === plan.content_script_id) {
      closeActivePopover();
    }
  }
};

const filterScripts = () => {
  if (state.currentFilter === 'scheduled') {
    return state.scripts.filter((script) => hasPlansForScript(script.id));
  }
  if (state.currentFilter === 'available') {
    return state.scripts.filter((script) => !hasPlansForScript(script.id));
  }
  return state.scripts;
};

const clearList = () => {
  closeActivePopover();
  if (elements.roteirosList) {
    elements.roteirosList.innerHTML = '';
  }
};

const createSectionSummary = (label, content, { optional = false, fallback = '' } = {}) => {
  const normalized = typeof content === 'string' ? content.trim() : '';
  if (!normalized && optional) {
    return null;
  }

  const section = document.createElement('div');
  section.className = 'roteiro-section';

  const title = document.createElement('h4');
  title.className = 'roteiro-section__title';
  title.textContent = label;
  section.appendChild(title);

  const body = document.createElement('p');
  body.className = 'roteiro-section__content';
  body.textContent = normalized || fallback || '';
  section.appendChild(body);

  return section;
};

const renderRoteiros = () => {
  if (!elements.roteirosList) return;
  clearList();

  if (state.loading) {
    return;
  }

  const scripts = filterScripts();
  if (!scripts.length) {
    elements.emptyState?.removeAttribute('hidden');
    return;
  }

  elements.emptyState?.setAttribute('hidden', '');

  scripts.forEach((script) => {
    const occurrences = getPlansForScript(script.id);
    const card = document.createElement('article');
    card.className = 'roteiro-card';
    card.dataset.id = String(script.id);
    if (occurrences.length) {
      card.classList.add('scheduled');
    }

    const header = document.createElement('div');
    header.className = 'roteiro-header';

    const headerInfo = document.createElement('div');
    headerInfo.className = 'roteiro-header__info';

    const title = document.createElement('h3');
    title.className = 'roteiro-title';
    title.textContent = script.title;
    headerInfo.appendChild(title);

    if (script.durationText) {
      const duration = document.createElement('span');
      duration.className = 'roteiro-duration';
      duration.textContent = script.durationText;
      headerInfo.appendChild(duration);
    }

    if (script.product) {
      const badge = document.createElement('span');
      badge.className = 'roteiro-badge';
      badge.textContent = script.product;
      headerInfo.appendChild(badge);
    }

    if (script.preview) {
      const preview = document.createElement('p');
      preview.className = 'roteiro-preview';
      preview.textContent = script.preview;
      headerInfo.appendChild(preview);
    }

    header.appendChild(headerInfo);

    const details = document.createElement('div');
    details.className = 'roteiro-details';

    const sectionsContainer = document.createElement('div');
    sectionsContainer.className = 'roteiro-sections';

    const sections = [
      createSectionSummary('Duração', script.durationText, { fallback: 'Duração não informada.' }),
      createSectionSummary('Contexto', script.contextText, { fallback: 'Contexto não informado.' }),
      createSectionSummary('Tarefa', script.taskText, { fallback: 'Tarefa não informada.' }),
      createSectionSummary('Pontos importantes', script.importantPointsText, {
        fallback: 'Pontos importantes não informados.'
      }),
      createSectionSummary('Finalização', script.closingText, { fallback: 'Finalização não informada.' }),
      createSectionSummary('Notas adicionais', script.additionalNotesText, { optional: true })
    ];

    sections
      .filter(Boolean)
      .forEach((section) => sectionsContainer.appendChild(section));

    if (sectionsContainer.childElementCount > 0) {
      details.appendChild(sectionsContainer);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const viewButton = createViewScriptAction(script);
    actions.appendChild(viewButton);

    const scheduleBtn = document.createElement('button');
    scheduleBtn.className = 'card-actions__button card-actions__button--schedule';
    scheduleBtn.type = 'button';
    scheduleBtn.textContent = 'Agendar';
    scheduleBtn.addEventListener('click', () => openDatePicker(script));
    actions.appendChild(scheduleBtn);

    if (occurrences.length) {
      const list = document.createElement('div');
      list.className = 'schedule-occurrences';

      occurrences.forEach((plan) => {
        if (!plan || plan._removed || !plan.scheduled_date) {
          return;
        }

        const occurrence = document.createElement('div');
        occurrence.className = 'schedule-occurrence';
        if (plan._new) {
          occurrence.classList.add('schedule-occurrence--new');
        }

        const info = document.createElement('div');
        info.className = 'schedule-occurrence__info';

        const dateLabel = document.createElement('span');
        dateLabel.className = 'schedule-occurrence__date';
        dateLabel.textContent = formatDateLabel(plan.scheduled_date);
        info.appendChild(dateLabel);

        const statusChip = buildStatusChip(plan);
        if (statusChip) {
          info.appendChild(statusChip);
        }

        const statusKey = typeof plan.status === 'string' ? plan.status.toLowerCase() : 'scheduled';
        const canRemove = plan._new || statusKey === 'scheduled';

        if (canRemove) {
          const actionsContainer = document.createElement('div');
          actionsContainer.className = 'schedule-occurrence__actions';

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'occurrence-remove';
          removeBtn.textContent = 'Remover';
          removeBtn.addEventListener('click', () => removePlanOccurrence(plan, removeBtn));

          actionsContainer.appendChild(removeBtn);

          occurrence.append(info, actionsContainer);
        } else {
          occurrence.appendChild(info);
        }
        list.appendChild(occurrence);
      });

      details.appendChild(list);
    }

    card.appendChild(header);
    card.appendChild(actions);
    card.appendChild(details);
    elements.roteirosList.appendChild(card);
  });
};

const validateDateWithinCycle = (isoDate) => {
  if (!state.cycle || !isoDate) return true;
  if (!state.cycle.startDate || !state.cycle.endDate) return true;
  return isoDate >= state.cycle.startDate && isoDate <= state.cycle.endDate;
};

const openDatePicker = (script) => {
  if (!script) return;

  let card = elements.roteirosList?.querySelector(`.roteiro-card[data-id="${script.id}"]`);
  if (!card) return;

  if (activePopover?.scriptId === script.id) {
    closeActivePopover();
    return;
  }

  closeActivePopover();

  const occurrences = getPlansForScript(script.id);
  const popover = document.createElement('div');
  popover.className = 'date-popover';
  popover.dataset.scriptId = String(script.id);
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `Adicionar agendamento para ${script.title}`);

  const title = document.createElement('p');
  title.className = 'date-popover__title';
  title.textContent = 'Adicionar novo agendamento';

  const label = document.createElement('label');
  label.className = 'date-popover__label';
  label.textContent = 'Escolha a data';

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'date-popover__input';
  input.value = '';
  if (state.cycle?.startDate) {
    input.min = state.cycle.startDate;
  }
  if (state.cycle?.endDate) {
    input.max = state.cycle.endDate;
  }

  const handleEscape = (event) => {
    if (event.key === 'Escape') {
      closeActivePopover();
    }
  };

  input.addEventListener('keydown', handleEscape);

  label.appendChild(input);

  const helper = document.createElement('p');
  helper.className = 'date-popover__helper';
  const cycleMessage =
    state.cycle?.startDate && state.cycle?.endDate
      ? `Ciclo vigente: ${formatDateLabel(state.cycle.startDate)} até ${formatDateLabel(state.cycle.endDate)}`
      : 'Selecione um dia disponível para a publicação.';
  if (occurrences.length) {
    const suffix = occurrences.length === 1 ? 'data agendada' : 'datas agendadas';
    helper.textContent = `${cycleMessage}. Você já possui ${occurrences.length} ${suffix} para este roteiro.`;
  } else {
    helper.textContent = cycleMessage;
  }

  const actions = document.createElement('div');
  actions.className = 'date-popover__actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'primary';
  confirmBtn.textContent = 'Adicionar';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Cancelar';

  confirmBtn.addEventListener('click', async () => {
    const value = input.value;
    if (!value) {
      showToast('Escolha uma data para agendar.', 'error');
      input.focus();
      return;
    }
    if (!validateDateWithinCycle(value)) {
      showToast('Escolha uma data dentro do ciclo vigente.', 'error');
      input.focus();
      return;
    }
    confirmBtn.disabled = true;
    const previousLabel = confirmBtn.textContent;
    confirmBtn.textContent = 'Adicionando...';
    try {
      const success = await addScheduleForScript(script, value);
      if (!success) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = previousLabel;
        input.focus();
      }
    } finally {
      if (!confirmBtn.disabled) {
        confirmBtn.textContent = previousLabel;
      }
    }
  });

  cancelBtn.addEventListener('click', () => {
    closeActivePopover();
  });

  actions.append(confirmBtn, cancelBtn);

  popover.append(title, label, helper, actions);
  const detailsContainer = card.querySelector('.roteiro-details') || card;
  detailsContainer.appendChild(popover);
  activePopover = { scriptId: script.id, element: popover };

  window.requestAnimationFrame(() => {
    input.focus();
    input.showPicker?.();
  });
};

elements.filters.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.classList.contains('active')) return;
    elements.filters.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');
    state.currentFilter = button.dataset.filter ?? 'all';
    renderRoteiros();
  });
});

const loadPlanData = async () => {
  if (state.loading) return;
  setLoading(true);
  try {
    const data = await fetchWithAuth('/api/influencer/plan');
    syncStateFromResponse(data);
  } catch (error) {
    if (error.status !== 401) {
      showToast(error.message || 'Não foi possível carregar os roteiros.', 'error');
    }
  } finally {
    state.loading = false;
    if (elements.roteirosList) {
      elements.roteirosList.innerHTML = '';
    }
    renderRoteiros();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!ensureAuth()) return;
    loadPlanData();
  });
} else {
  if (ensureAuth()) {
    loadPlanData();
  }
}
