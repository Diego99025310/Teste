const state = {
  loading: false,
  cycle: null,
  influencer: null,
  scripts: [],
  plans: [],
  planMap: new Map(),
  pendingChanges: false,
  currentFilter: 'all',
  removedIds: new Set()
};

const elements = {
  cycleName: document.getElementById('cycle-name'),
  roteirosList: document.getElementById('roteiros-list'),
  emptyState: document.getElementById('empty-state'),
  saveBtn: document.getElementById('save-btn'),
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

const getToken = () => session.getItem('token');

const logout = () => {
  if (typeof window.logout === 'function') {
    window.logout();
  } else {
    session.removeItem('token');
    window.location.replace('login.html');
  }
};

elements.logoutBtn?.addEventListener('click', logout);

const toPlainText = (html) => {
  if (!html) return '';
  const stripped = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped;
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
  const plain = toPlainText(script.preview ?? script.descricao ?? script.description);
  const preview = plain.length > 180 ? `${plain.slice(0, 177).trim()}…` : plain;
  return {
    id: script.id,
    title: script.title ?? script.titulo ?? `Roteiro #${script.id}`,
    preview,
    description: script.description ?? script.descricao ?? '',
    product: script.product ?? null,
    updatedAt: script.updatedAt ?? script.updated_at ?? null,
    createdAt: script.createdAt ?? script.created_at ?? null
  };
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
    script_description: plan.scriptDescription ?? plan.script_description ?? null,
    created_at: plan.createdAt ?? plan.created_at ?? null,
    updated_at: plan.updatedAt ?? plan.updated_at ?? null,
    _removed: false
  };
};

const rebuildPlanMap = () => {
  state.planMap = new Map();
  state.removedIds = new Set();
  state.plans.forEach((plan) => {
    if (!plan || !plan.content_script_id) {
      return;
    }
    if (plan._removed) {
      state.removedIds.add(plan.content_script_id);
      return;
    }
    state.planMap.set(plan.content_script_id, plan);
  });
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
  state.pendingChanges = false;
  state.currentFilter = 'all';
  renderCycleInfo();
  renderRoteiros();
  updateSaveVisibility();
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

const getPlanForScript = (scriptId) => state.planMap.get(scriptId);

const scheduleForScript = (script, isoDate) => {
  if (!script || !isoDate) return;
  const normalizedDate = isoDate.trim();
  const existingPlan = getPlanForScript(script.id);
  if (existingPlan) {
    existingPlan.scheduled_date = normalizedDate;
    existingPlan._removed = false;
    existingPlan.status = 'scheduled';
  } else {
    const plan = normalizePlan({
      id: null,
      cycleId: state.cycle?.id ?? null,
      influencerId: state.influencer?.id ?? null,
      date: normalizedDate,
      status: 'scheduled',
      scriptId: script.id,
      scriptTitle: script.title,
      scriptDescription: script.description
    });
    state.plans.push(plan);
    state.planMap.set(script.id, plan);
  }
  state.removedIds.delete(script.id);
  state.pendingChanges = true;
  closeActivePopover();
  renderRoteiros();
  updateSaveVisibility();
};

const removeScheduleForScript = (scriptId) => {
  const plan = getPlanForScript(scriptId);
  if (!plan) return;
  plan._removed = true;
  state.planMap.delete(scriptId);
  state.removedIds.add(scriptId);
  state.pendingChanges = true;
  if (activePopover?.scriptId === scriptId) {
    closeActivePopover();
  }
  renderRoteiros();
  updateSaveVisibility();
};

const filterScripts = () => {
  if (state.currentFilter === 'scheduled') {
    return state.scripts.filter((script) => getPlanForScript(script.id));
  }
  if (state.currentFilter === 'available') {
    return state.scripts.filter((script) => !getPlanForScript(script.id));
  }
  return state.scripts;
};

const clearList = () => {
  closeActivePopover();
  if (elements.roteirosList) {
    elements.roteirosList.innerHTML = '';
  }
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
    const plan = getPlanForScript(script.id);
    const card = document.createElement('article');
    card.className = 'roteiro-card';
    card.dataset.id = String(script.id);
    if (plan && !plan._removed) {
      card.classList.add('scheduled');
    }

    const header = document.createElement('div');
    header.className = 'roteiro-header';

    const title = document.createElement('h3');
    title.className = 'roteiro-title';
    title.textContent = script.title;
    header.appendChild(title);

    if (script.product) {
      const badge = document.createElement('span');
      badge.className = 'roteiro-badge';
      badge.textContent = script.product;
      header.appendChild(badge);
    }

    const preview = document.createElement('p');
    preview.className = 'roteiro-preview';
    preview.textContent = script.preview || 'Sem preview disponível.';

    card.appendChild(header);
    card.appendChild(preview);

    if (plan && !plan._removed && plan.scheduled_date) {
      const scheduled = document.createElement('div');
      scheduled.className = 'scheduled-date';
      scheduled.innerHTML = `📅 Agendado para <strong>${formatDateLabel(plan.scheduled_date)}</strong>`;
      if (plan.status && plan.status !== 'scheduled') {
        const statusChip = document.createElement('span');
        statusChip.className = 'scheduled-date__status';
        statusChip.textContent = plan.status === 'validated' ? 'Validado' : plan.status;
        scheduled.appendChild(statusChip);
      }
      card.appendChild(scheduled);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const scheduleBtn = document.createElement('button');
    scheduleBtn.className = 'primary';
    scheduleBtn.type = 'button';
    scheduleBtn.textContent = plan && !plan._removed ? 'Editar data' : '📅 Agendar';
    scheduleBtn.addEventListener('click', () => openDatePicker(script));
    actions.appendChild(scheduleBtn);

    if (plan && !plan._removed) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'secondary danger';
      clearBtn.type = 'button';
      clearBtn.textContent = 'Remover';
      clearBtn.addEventListener('click', () => removeScheduleForScript(script.id));
      actions.appendChild(clearBtn);
    }

    card.appendChild(actions);
    elements.roteirosList.appendChild(card);
  });
};

const updateSaveVisibility = () => {
  if (!elements.saveBtn) return;
  const hasPending =
    (state.pendingChanges && Array.from(state.planMap.values()).some((plan) => plan.scheduled_date)) ||
    state.removedIds.size > 0;
  if (hasPending) {
    elements.saveBtn.removeAttribute('hidden');
  } else {
    elements.saveBtn.setAttribute('hidden', '');
  }
};

const validateDateWithinCycle = (isoDate) => {
  if (!state.cycle || !isoDate) return true;
  if (!state.cycle.startDate || !state.cycle.endDate) return true;
  return isoDate >= state.cycle.startDate && isoDate <= state.cycle.endDate;
};

const openDatePicker = (script) => {
  if (!script) return;
  const card = elements.roteirosList?.querySelector(`.roteiro-card[data-id="${script.id}"]`);
  if (!card) return;

  if (activePopover?.scriptId === script.id) {
    closeActivePopover();
    return;
  }

  closeActivePopover();

  const plan = getPlanForScript(script.id);
  const popover = document.createElement('div');
  popover.className = 'date-popover';
  popover.dataset.scriptId = String(script.id);
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `Agendamento para ${script.title}`);

  const title = document.createElement('p');
  title.className = 'date-popover__title';
  title.textContent = plan && !plan._removed ? 'Editar agendamento' : 'Novo agendamento';

  const label = document.createElement('label');
  label.className = 'date-popover__label';
  label.textContent = 'Escolha a data';

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'date-popover__input';
  input.value = plan?.scheduled_date ?? '';
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
  if (state.cycle?.startDate && state.cycle?.endDate) {
    helper.textContent = `Ciclo vigente: ${formatDateLabel(state.cycle.startDate)} até ${formatDateLabel(
      state.cycle.endDate
    )}`;
  } else {
    helper.textContent = 'Selecione um dia disponível para a publicação.';
  }

  const actions = document.createElement('div');
  actions.className = 'date-popover__actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'primary';
  confirmBtn.textContent = plan && !plan._removed ? 'Atualizar' : 'Agendar';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Cancelar';

  confirmBtn.addEventListener('click', () => {
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
    scheduleForScript(script, value);
  });

  cancelBtn.addEventListener('click', () => {
    closeActivePopover();
  });

  actions.append(confirmBtn, cancelBtn);

  popover.append(title, label, helper, actions);
  card.appendChild(popover);
  activePopover = { scriptId: script.id, element: popover };

  window.requestAnimationFrame(() => {
    input.focus();
    input.showPicker?.();
  });
};

const gatherPlanEntries = () => {
  const entries = [];
  state.plans.forEach((plan) => {
    if (!plan) return;
    if (plan._removed) return;
    if (!plan.scheduled_date) return;
    const entry = { date: plan.scheduled_date };
    if (plan.content_script_id) {
      entry.scriptId = plan.content_script_id;
    }
    if (plan.notes) {
      entry.notes = plan.notes;
    }
    entries.push(entry);
  });
  return entries;
};

const saveSchedules = async () => {
  if (!elements.saveBtn) return;
  if (!ensureAuth()) return;

  const entries = gatherPlanEntries();
  if (!entries.length && !state.removedIds.size) {
    showToast('Nenhum agendamento pendente para salvar.', 'info');
    state.pendingChanges = false;
    updateSaveVisibility();
    return;
  }

  elements.saveBtn.disabled = true;
  elements.saveBtn.textContent = 'Salvando...';

  try {
    const payload = {
      schedules: entries,
      removedScripts: Array.from(state.removedIds)
    };
    const response = await fetchWithAuth('/api/influencer/plan', { method: 'POST', body: payload });
    syncStateFromResponse(response);
    showToast('Agenda atualizada com sucesso! 💗', 'success');
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar os agendamentos.', 'error');
  } finally {
    elements.saveBtn.disabled = false;
    elements.saveBtn.textContent = 'Salvar agendamentos';
  }
};

elements.saveBtn?.addEventListener('click', saveSchedules);

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
