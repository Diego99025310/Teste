(() => {
  'use strict';

  const API_BASE = '';
  const POINT_VALUE_BRL = 0.1;
  const storageKeys = {
    token: 'token',
    role: 'role',
    userId: 'userId',
    userEmail: 'userEmail'
  };

  const storage = (() => {
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

  const fallbackPersistentStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };

  const persistentStorage = (() => {
    try {
      const candidate = window.localStorage;
      if (!candidate) return fallbackPersistentStorage;
      const testKey = '__hidrapink_persist_test__';
      candidate.setItem(testKey, '1');
      candidate.removeItem(testKey);
      return candidate;
    } catch (error) {
      return fallbackPersistentStorage;
    }
  })();

  const getStorageItem = (store, key) => {
    if (!store || typeof store.getItem !== 'function') return null;
    try {
      return store.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const setStorageItem = (store, key, value) => {
    if (!store || typeof store.setItem !== 'function') return;
    try {
      store.setItem(key, value);
    } catch (error) {
      // Ignore persistence failures (modo privado, cota excedida, etc.)
    }
  };

  const removeStorageItem = (store, key) => {
    if (!store || typeof store.removeItem !== 'function') return;
    try {
      store.removeItem(key);
    } catch (error) {
      // Ignore removal failures
    }
  };

  const createCredentialsStore = () => {
    const STORAGE_KEY = 'hidrapink:influencerCredentials:v1';
    let cache = null;

    const load = () => {
      if (cache) return cache;
      const raw = persistentStorage.getItem(STORAGE_KEY);
      if (!raw) {
        cache = {};
        return cache;
      }
      try {
        const parsed = JSON.parse(raw);
        cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (error) {
        cache = {};
      }
      return cache;
    };

    const persist = (data) => {
      cache = data;
      try {
        persistentStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      } catch (error) {
        // Ignora falhas de persistência (modo privado, cota excedida, etc.)
      }
    };

    const sanitizeRecord = (record = {}) => {
      const result = {};
      Object.entries(record).forEach(([key, value]) => {
        if (value == null) return;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) return;
          result[key] = trimmed;
          return;
        }
        result[key] = value;
      });
      return result;
    };

    const resolveKey = (id) => {
      const numeric = Number(id);
      if (!Number.isInteger(numeric) || numeric <= 0) return null;
      return String(numeric);
    };

    return {
      get(id) {
        const key = resolveKey(id);
        if (!key) return null;
        const store = load();
        return store[key] || null;
      },
      set(id, values = {}) {
        const key = resolveKey(id);
        if (!key) return null;
        const sanitized = sanitizeRecord(values);
        if (!Object.keys(sanitized).length) {
          const store = load();
          return store[key] || null;
        }
        const store = load();
        const nextEntry = { ...(store[key] || {}), ...sanitized };
        store[key] = nextEntry;
        persist(store);
        return nextEntry;
      },
      remove(id) {
        const key = resolveKey(id);
        if (!key) return;
        const store = load();
        if (store[key]) {
          delete store[key];
          persist(store);
        }
      }
    };
  };

  const influencerCredentialsStore = createCredentialsStore();

  const rememberInfluencerCredentials = (payload = {}) => {
    const id = payload.id ?? payload.influencer_id ?? payload.influencerId;
    const entry = {
      senha_provisoria:
        payload.senha_provisoria ??
        payload.provisionalPassword ??
        payload.loginPassword ??
        null,
      login_email: payload.login_email ?? payload.loginEmail ?? null,
      contato: (() => {
        const rawContact = payload.contato ?? payload.contact;
        if (rawContact == null) return null;
        const digits = digitOnly(String(rawContact));
        return digits || null;
      })(),
      nome: payload.nome ?? payload.name ?? null
    };
    const sanitized = Object.fromEntries(
      Object.entries(entry).filter(([, value]) => {
        if (value == null) return false;
        if (typeof value === 'string') {
          return value.trim().length > 0;
        }
        return true;
      })
    );
    if (!id || !Object.keys(sanitized).length) {
      return;
    }
    sanitized.updatedAt = new Date().toISOString();
    influencerCredentialsStore.set(id, sanitized);
  };

  const digitOnly = (value = '') => value.replace(/\D/g, '');

  const toTrimmedString = (value) => {
    if (value == null) return '';
    return String(value).trim();
  };

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const convertPlainTextBlockToHtml = (block = '') => {
    if (!block) return '';
    const normalizedBlock = block.replace(/\r\n/g, '\n');
    const lines = normalizedBlock.split('\n');
    const trimmedLines = lines.map((line) => line.trim()).filter((line) => line.length > 0);
    if (!trimmedLines.length) return '';

    const bulletPattern = /^\s*(?:[-*•])\s+/;
    const numberedPattern = /^\s*\d{1,3}[.)-]\s+/;

    if (trimmedLines.every((line) => numberedPattern.test(line))) {
      const items = trimmedLines.map((line) => {
        const content = line.replace(numberedPattern, '').trim();
        return `<li>${escapeHtml(content)}</li>`;
      });
      return `<ol>${items.join('')}</ol>`;
    }

    if (trimmedLines.every((line) => bulletPattern.test(line))) {
      const items = trimmedLines.map((line) => {
        const content = line.replace(bulletPattern, '').trim();
        return `<li>${escapeHtml(content)}</li>`;
      });
      return `<ul>${items.join('')}</ul>`;
    }

    const paragraphLines = lines.map((line) => escapeHtml(line.trimEnd()));
    return `<p>${paragraphLines.join('<br />')}</p>`;
  };

  const convertPlainTextToHtml = (value = '') => {
    const trimmed = toTrimmedString(value);
    if (!trimmed) return '';

    const normalized = trimmed.replace(/\r\n/g, '\n');
    const blocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);

    if (!blocks.length) {
      return `<p>${escapeHtml(normalized)}</p>`;
    }

    return blocks
      .map((block) => convertPlainTextBlockToHtml(block))
      .filter((html) => html && html.trim().length > 0)
      .join('');
  };

  const sanitizeRichTextHtml = (input = '') => {
    if (!input) return '';
    const template = document.createElement('template');
    template.innerHTML = input;

    const allowedTags = new Set([
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'a',
      'blockquote',
      'code',
      'pre',
      'span',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6'
    ]);

    const allowedAttributes = {
      a: new Set(['href', 'title', 'target', 'rel'])
    };

    const nodes = [];
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    const isSafeUrl = (value = '') => /^(https?:|mailto:)/i.test(String(value).trim());

    nodes.forEach((node) => {
      const tagName = node.tagName.toLowerCase();

      if (!allowedTags.has(tagName)) {
        const fragment = document.createDocumentFragment();
        while (node.firstChild) {
          fragment.appendChild(node.firstChild);
        }
        node.replaceWith(fragment);
        return;
      }

      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const allowedForTag = allowedAttributes[tagName] || new Set();
        const isAllowed = allowedForTag.has(name);

        if (!isAllowed) {
          node.removeAttribute(attr.name);
          return;
        }

        if (tagName === 'a' && name === 'href') {
          const hrefValue = attr.value.trim();
          if (!isSafeUrl(hrefValue)) {
            node.removeAttribute(attr.name);
            return;
          }
        }
      });

      if (tagName === 'a') {
        if (!node.hasAttribute('href')) {
          node.removeAttribute('target');
          node.removeAttribute('rel');
          return;
        }

        const target = node.getAttribute('target');
        if (!target || !['_blank', '_self'].includes(target.trim())) {
          node.setAttribute('target', '_blank');
        }
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return template.innerHTML;
  };

  const RICH_TEXT_HTML_PATTERN = /<\s*(?:p|ul|ol|li|br|strong|em|b|i|u|a|blockquote|code|pre|h[1-6])\b[^>]*>/i;

  const prepareScriptHtml = (value = '') => {
    const trimmed = toTrimmedString(value);
    if (!trimmed) return '';
    if (RICH_TEXT_HTML_PATTERN.test(trimmed)) {
      return sanitizeRichTextHtml(trimmed);
    }
    return sanitizeRichTextHtml(convertPlainTextToHtml(trimmed));
  };

  const setRichTextContent = (element, value = '') => {
    if (!element) return;
    const html = prepareScriptHtml(value);
    element.innerHTML = html;
  };

    const renderScriptManagementList = () => {
      if (!listContainer) return;
      listContainer.innerHTML = '';
      if (!cachedScripts.length) {
        return;
      }

      const fragment = document.createDocumentFragment();

      cachedScripts.forEach((script) => {
        const item = document.createElement('article');
        item.className = 'script-management-item';
        item.dataset.id = String(script.id);
        if (editingScriptId === script.id) {
          item.dataset.state = 'editing';
        }

        const header = document.createElement('header');
        header.className = 'script-management-item__header';

        const summary = document.createElement('div');
        summary.className = 'script-management-item__summary';

        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'script-management-toggle';
        const detailsId = `script-details-${script.id}`;
        toggleButton.setAttribute('aria-controls', detailsId);
        summary.appendChild(toggleButton);

        const titleEl = document.createElement('h3');
        titleEl.textContent = script.title;
        summary.appendChild(titleEl);

        if (script.durationText) {
          const durationBadge = document.createElement('span');
          durationBadge.className = 'script-management-duration';
          durationBadge.textContent = script.durationText;
          summary.appendChild(durationBadge);
        }

        if (script.preview) {
          const previewEl = document.createElement('p');
          previewEl.className = 'script-management-preview';
          previewEl.textContent = script.preview;
          summary.appendChild(previewEl);
        }

        header.appendChild(summary);

        const actionsEl = document.createElement('div');
        actionsEl.className = 'script-management-item__actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.dataset.action = 'edit';
        editButton.className = 'secondary';
        editButton.textContent = 'Editar';
        actionsEl.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.dataset.action = 'delete';
        deleteButton.textContent = 'Excluir';
        actionsEl.appendChild(deleteButton);

        header.appendChild(actionsEl);
        item.appendChild(header);

        const body = document.createElement('div');
        body.className = 'script-management-item__body';
        body.id = detailsId;

        const bodyInner = document.createElement('div');
        bodyInner.className = 'script-management-item__body-inner';
        body.appendChild(bodyInner);

        bodyInner.appendChild(createSectionElement('Duração', script.duration));
        bodyInner.appendChild(createSectionElement('Contexto', script.context));
        bodyInner.appendChild(createSectionElement('Tarefa', script.task));
        bodyInner.appendChild(createSectionElement('Pontos importantes', script.importantPoints));
        bodyInner.appendChild(createSectionElement('Finalização', script.closing));
        if (script.additionalNotes) {
          bodyInner.appendChild(
            createSectionElement('Notas adicionais', script.additionalNotes, { optional: true })
          );
        }

        if (script.createdAt || script.updatedAt) {
          const meta = document.createElement('p');
          meta.className = 'script-meta';
          const createdAt = script.createdAt ? new Date(script.createdAt) : null;
          const updatedAt = script.updatedAt ? new Date(script.updatedAt) : null;
          const createdLabel = createdAt
            ? `Criado em ${createdAt.toLocaleDateString('pt-BR')} às ${createdAt.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
              })}`
            : null;
          const updatedLabel =
            updatedAt && (!createdAt || updatedAt.getTime() !== createdAt.getTime())
              ? `Atualizado em ${updatedAt.toLocaleDateString('pt-BR')} às ${updatedAt.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}`
              : null;
          meta.textContent = [createdLabel, updatedLabel].filter(Boolean).join(' • ');
          bodyInner.appendChild(meta);
        }

        item.appendChild(body);
        fragment.appendChild(item);

        const storedExpanded = scriptExpansionState.get(script.id);
        const expanded = editingScriptId === script.id || storedExpanded === true;
        scriptExpansionState.set(script.id, expanded);
        applyScriptExpansionToItem(item, script, expanded);
      });

      listContainer.appendChild(fragment);
    };

    const loadScriptsList = async ({ showStatus = true } = {}) => {
      if (!listContainer) return;
      if (showStatus) {
        setMessage(listMessageEl, 'Carregando roteiros...', 'info');
      }
      try {
        const scripts = await fetchScripts();
        const normalized = Array.isArray(scripts)
          ? scripts.map((script) => normalizeScriptRecord(script)).filter(Boolean)
          : [];
        const previousExpansion = new Map(scriptExpansionState);
        scriptExpansionState.clear();
        cachedScripts = normalized;
        cachedScripts.forEach((script) => {
          const wasExpanded = editingScriptId === script.id || previousExpansion.get(script.id) === true;
          scriptExpansionState.set(script.id, wasExpanded);
        });
        renderScriptManagementList();
        if (!cachedScripts.length) {
          setMessage(listMessageEl, 'Nenhum roteiro cadastrado até o momento.', 'info');
        } else if (showStatus) {
          setMessage(listMessageEl, '', '');
        }
      } catch (error) {
        cachedScripts = [];
        renderScriptManagementList();
        setMessage(listMessageEl, error.message || 'Nao foi possivel carregar os roteiros.', 'error');
      }
    };

    const resetForm = ({ keepMessage = false } = {}) => {
      editingScriptId = null;
      if (form) {
        form.reset();
        form.dataset.mode = 'create';
        delete form.dataset.editingId;
      }
      [
        titleInput,
        durationInput,
        contextInput,
        taskInput,
        importantPointsInput,
        closingInput,
        notesInput
      ].forEach((input) => {
        if (input) {
          input.removeAttribute('aria-invalid');
        }
      });
      if (submitButton) {
        submitButton.textContent = 'Salvar roteiro';
        submitButton.disabled = false;
      }
      if (cancelEditButton) {
        cancelEditButton.hidden = true;
        cancelEditButton.disabled = false;
      }
      if (!keepMessage) {
        setMessage(formMessageEl, '', '');
      }
      renderScriptManagementList();
    };

    const enterEditMode = (script) => {
      if (!form || !script) return;
      editingScriptId = script.id;
      scriptExpansionState.set(script.id, true);
      form.dataset.mode = 'edit';
      form.dataset.editingId = String(script.id);
      if (titleInput) {
        titleInput.value = script.rawTitle || script.title || '';
        titleInput.removeAttribute('aria-invalid');
      }
      if (durationInput) {
        durationInput.value = script.durationText || '';
        durationInput.removeAttribute('aria-invalid');
      }
      if (contextInput) {
        contextInput.value = script.contextText || '';
        contextInput.removeAttribute('aria-invalid');
      }
      if (taskInput) {
        taskInput.value = script.taskText || '';
        taskInput.removeAttribute('aria-invalid');
      }
      if (importantPointsInput) {
        importantPointsInput.value = script.importantPointsText || '';
        importantPointsInput.removeAttribute('aria-invalid');
      }
      if (closingInput) {
        closingInput.value = script.closingText || '';
        closingInput.removeAttribute('aria-invalid');
      }
      if (notesInput) {
        notesInput.value = script.additionalNotesText || '';
        notesInput.removeAttribute('aria-invalid');
      }
      if (submitButton) {
        submitButton.textContent = 'Salvar alterações';
      }
      if (cancelEditButton) {
        cancelEditButton.hidden = false;
        cancelEditButton.disabled = false;
      }
      setMessage(
        formMessageEl,
        'Editando roteiro selecionado. Faça as alterações e salve ou cancele a edição.',
        'info'
      );
      renderScriptManagementList();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleInput?.focus();
    };

    cancelEditButton?.addEventListener('click', () => {
      resetForm();
      setMessage(formMessageEl, 'Edição cancelada.', 'info');
      titleInput?.focus();
    });

    newScriptShortcutButton?.addEventListener('click', () => {
      resetForm();
      setMessage(formMessageEl, 'Preencha os campos para cadastrar um novo roteiro.', 'info');
      form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleInput?.focus();
    });

    listContainer?.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const actionTrigger = event.target.closest('button[data-action]');
      if (actionTrigger) {
        const action = actionTrigger.dataset.action;
        if (!action) return;

        const item = actionTrigger.closest('.script-management-item');
        if (!item) return;

        const scriptId = Number(item.dataset.id);
        if (!Number.isInteger(scriptId) || scriptId <= 0) return;

        const script = cachedScripts.find((entry) => entry.id === scriptId);
        if (!script) return;

        if (action === 'edit') {
          event.preventDefault();
          enterEditMode(script);
          return;
        }

        if (action === 'delete') {
          event.preventDefault();
          const confirmed = window.confirm(
            `Tem certeza que deseja excluir o roteiro "${script.title}"? Essa acao nao pode ser desfeita.`
          );
          if (!confirmed) {
            return;
          }

          if (actionTrigger instanceof HTMLButtonElement) {
            actionTrigger.disabled = true;
          }

          setMessage(listMessageEl, 'Excluindo roteiro...', 'info');

          const wasEditing = editingScriptId === script.id;

          (async () => {
            try {
              await deleteScript(script.id);
              if (wasEditing) {
                resetForm();
                setMessage(formMessageEl, 'O roteiro selecionado foi excluido.', 'info');
              }
              await loadScriptsList({ showStatus: false });
              setMessage(listMessageEl, 'Roteiro excluido com sucesso!', 'success');
            } catch (error) {
              setMessage(
                listMessageEl,
                error.message || 'Nao foi possivel excluir o roteiro.',
                'error'
              );
            } finally {
              if (actionTrigger instanceof HTMLButtonElement) {
                actionTrigger.disabled = false;
              }
            }
          })();
        }

        return;
      }

      const toggleTrigger = event.target.closest(
        '.script-management-toggle, .script-management-item__summary'
      );
      if (!toggleTrigger) return;

      const item = toggleTrigger.closest('.script-management-item');
      if (!item) return;

      const scriptId = Number(item.dataset.id);
      if (!Number.isInteger(scriptId) || scriptId <= 0) return;

      const script = cachedScripts.find((entry) => entry.id === scriptId);
      if (!script) return;

      if (editingScriptId === script.id) {
        updateScriptExpansion(script, true);
        return;
      }

      const nextExpanded = scriptExpansionState.get(script.id) !== true;
      updateScriptExpansion(script, nextExpanded);
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const title = toTrimmedString(titleInput?.value || '');
      const duration = toTrimmedString(durationInput?.value || '');
      const context = toTrimmedString(contextInput?.value || '');
      const task = toTrimmedString(taskInput?.value || '');
      const importantPoints = toTrimmedString(importantPointsInput?.value || '');
      const closing = toTrimmedString(closingInput?.value || '');
      const additionalNotes = toTrimmedString(notesInput?.value || '');

      const validations = [
        {
          input: titleInput,
          valid: Boolean(title) && title.length >= 3,
          message: 'Informe um título com pelo menos 3 caracteres.'
        },
        {
          input: durationInput,
          valid: Boolean(duration),
          message: 'Informe a duração prevista do conteúdo.'
        },
        {
          input: contextInput,
          valid: Boolean(context) && context.length >= 10,
          message: 'Informe o contexto com pelo menos 10 caracteres.'
        },
        {
          input: taskInput,
          valid: Boolean(task) && task.length >= 10,
          message: 'Descreva a tarefa com pelo menos 10 caracteres.'
        },
        {
          input: importantPointsInput,
          valid: Boolean(importantPoints) && importantPoints.length >= 10,
          message: 'Liste os pontos importantes com pelo menos 10 caracteres.'
        },
        {
          input: closingInput,
          valid: Boolean(closing) && closing.length >= 5,
          message: 'Descreva a finalização com pelo menos 5 caracteres.'
        }
      ];

      let firstError = null;
      validations.forEach((rule) => {
        flagInvalidField(rule.input, rule.valid);
        if (!rule.valid && !firstError) {
          firstError = rule;
        }
      });
      if (notesInput) {
        flagInvalidField(notesInput, true);
      }

      if (firstError) {
        setMessage(formMessageEl, firstError.message, 'error');
        focusFirstInvalidField(form);
        return;
      }

      const isEditing = Number.isInteger(editingScriptId) && editingScriptId > 0;

      setMessage(formMessageEl, isEditing ? 'Atualizando roteiro...' : 'Salvando roteiro...', 'info');

      if (submitButton) {
        submitButton.disabled = true;
      }
      if (cancelEditButton && !cancelEditButton.hidden) {
        cancelEditButton.disabled = true;
      }

      try {
        const payload = {
          title,
          duration,
          context,
          task,
          importantPoints,
          closing,
          additionalNotes
        };
        if (isEditing) {
          await updateScript({ id: editingScriptId, ...payload });
          setMessage(formMessageEl, 'Roteiro atualizado com sucesso!', 'success');
        } else {
          await createScript(payload);
          setMessage(formMessageEl, 'Roteiro cadastrado com sucesso!', 'success');
        }

        await loadScriptsList({ showStatus: false });
        resetForm({ keepMessage: true });
        titleInput?.focus();
      } catch (error) {
        setMessage(
          formMessageEl,
          error.message ||
            (isEditing ? 'Nao foi possivel atualizar o roteiro.' : 'Nao foi possivel cadastrar o roteiro.'),
          'error'
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
        if (cancelEditButton) {
          cancelEditButton.disabled = false;
        }
      }
    });

    resetForm({ keepMessage: true });
    loadScriptsList();
  };


  const renderInfluencerDetails = (container, data) => {
    if (!container) return;
    container.innerHTML = '';
    if (!data) {
      container.textContent = 'Nenhum dado encontrado.';
      return;
    }

    const createValueElement = (value) => {
      if (value && typeof value === 'object') {
        if (value.type === 'link' && value.url) {
          const anchor = document.createElement('a');
          anchor.href = value.url;
          anchor.className = 'detail-link';
          anchor.classList.add('info-value');
          anchor.textContent = value.label || value.url;
          if (value.external !== false) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          }
          return anchor;
        }
      }
      const el = document.createElement('span');
      el.className = 'info-value';
      el.textContent = value == null || value === '' ? '-' : String(value);
      return el;
    };

    const instagramHandle = (data.instagram || '').trim();
    const hasInstagram = instagramHandle && instagramHandle !== '-';
    const instagramLabel = hasInstagram
      ? instagramHandle.startsWith('@')
        ? instagramHandle
        : `@${instagramHandle}`
      : data.instagram;
    const instagramValue = hasInstagram
      ? {
          type: 'link',
          url: `https://www.instagram.com/${instagramHandle.replace(/^@/, '')}`,
          label: instagramLabel,
          external: true
        }
      : data.instagram;

    const emailValue =
      data.email && data.email !== '-'
        ? { type: 'link', url: `mailto:${data.email}`, label: data.email, external: false }
        : data.email;

    const contactDigits = digitOnly(data.contato);
    const contactValue =
      data.contato && data.contato !== '-' && contactDigits
        ? { type: 'link', url: `tel:+55${contactDigits}`, label: data.contato, external: false }
        : data.contato;

    const loginEmailValue =
      data.loginEmail && data.loginEmail !== '-'
        ? { type: 'link', url: `mailto:${data.loginEmail}`, label: data.loginEmail, external: false }
        : data.loginEmail;

    const addressParts = [data.logradouro, data.numero].filter((part) => part && part !== '-');
    const addressValue = addressParts.length ? addressParts.join(', ') : data.logradouro;

    const locationParts = [data.cidade, data.estado].filter((part) => part && part !== '-');
    const locationValue = locationParts.length ? locationParts.join(' / ') : '-';

    const items = [
      {
        key: 'nome',
        label: 'Nome',
        value: data.nome
      },
      {
        key: 'cupom',
        label: 'Cupom',
        value: data.cupom
      },
      {
        key: 'link',
        label: 'Link',
        value:
          data.discountLink && data.discountLink !== '-'
            ? {
                type: 'link',
                url: data.discountLink,
                label: data.discountLink
              }
            : '-'
      }
    ];

    const fragment = document.createDocumentFragment();

    items.forEach(({ key, label, value }) => {
      const item = document.createElement('dl');
      item.className = 'info-item';
      if (key) {
        item.dataset.field = key;
      }

      const labelEl = document.createElement('dt');
      labelEl.textContent = `${label}:`;
      item.appendChild(labelEl);

      let valueEl = null;
      if (key === 'link' && value && typeof value === 'object' && value.url) {
        const wrapper = document.createElement('dd');
        wrapper.className = 'detail-actions info-value';

        const linkEl = createValueElement(value);
        if (linkEl) {
          wrapper.appendChild(linkEl);
        }

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'copy-button';
        const defaultCopyLabel = 'Copiar';
        copyButton.textContent = defaultCopyLabel;
        copyButton.addEventListener('click', async () => {
          try {
            await copyTextToClipboard(value.url);
            copyButton.textContent = 'Copiado!';
            copyButton.classList.remove('error');
            copyButton.classList.add('copied');
          } catch (error) {
            copyButton.textContent = 'Erro ao copiar';
            copyButton.classList.remove('copied');
            copyButton.classList.add('error');
          }
          window.setTimeout(() => {
            copyButton.textContent = defaultCopyLabel;
            copyButton.classList.remove('copied');
            copyButton.classList.remove('error');
          }, 2000);
        });
        wrapper.appendChild(copyButton);

        valueEl = wrapper;
      } else {
        valueEl = createValueElement(value);
        if (valueEl) {
          const dd = document.createElement('dd');
          dd.className = 'info-value';
          dd.appendChild(valueEl);
          valueEl = dd;
        }
      }

      if (valueEl) {
        item.appendChild(valueEl);
      } else {
        const dd = document.createElement('dd');
        dd.className = 'info-value';
        dd.textContent = '-';
        item.appendChild(dd);
      }

      fragment.appendChild(item);
    });

    container.appendChild(fragment);
  };

  const renderInfluencerStatus = (container, message) => {
    if (!container) return;
    container.innerHTML = '';
    if (!message) return;
    const status = document.createElement('p');
    status.className = 'info-status';
    status.textContent = message;
    container.appendChild(status);
  };

  const initInfluencerPage = () => {
    if (!ensureAuth()) return;
    attachLogoutButtons();

    const pageType = document.body?.dataset?.page || 'influencer';
    const isStandalonePerformancePage = pageType === 'influencer-performance';

    const detailsEl = document.getElementById('influencerDetails');
    const greetingEl = document.getElementById('influencerGreeting');

    const salesMessageEl = document.getElementById('influencerSalesMessage');
    const salesSummaryEl = document.getElementById('influencerSalesSummary');
    const salesTableBody = document.querySelector('#influencerSalesTable tbody');

    const contractInfoEl = document.getElementById('influencerContractInfo');
    const contractMessageEl = document.getElementById('influencerContractMessage');
    const viewContractBtn = document.getElementById('viewSignedContractButton');
    const downloadContractBtn = document.getElementById('downloadSignedContractButton');

    const planMessageEl = document.getElementById('planMessage');
    const planScheduleBoardEl = document.getElementById('planScheduleBoard');
    const planCyclePeriodEls = document.querySelectorAll('[data-plan-cycle]');
    const planCycleHelperEls = document.querySelectorAll('[data-plan-cycle-helper]');
    const planMultiplierEls = document.querySelectorAll('[data-plan-multiplier]');
    const planMultiplierLabelEls = document.querySelectorAll('[data-plan-multiplier-label]');
    const planPlannedCountEls = document.querySelectorAll('[data-plan-planned]');
    const planValidatedCountEls = document.querySelectorAll('[data-plan-validated]');
    const planPendingCountEls = document.querySelectorAll('[data-plan-pending]');


    const fullMonthLabels = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro'
    ];

    const shortMonthLabels = [
      'JAN',
      'FEV',
      'MAR',
      'ABR',
      'MAI',
      'JUN',
      'JUL',
      'AGO',
      'SET',
      'OUT',
      'NOV',
      'DEZ'
    ];

    const planStatusLabels = {
      scheduled: 'Pendente',
      validated: 'Validado',
      posted: 'Em validação',
      missed: 'Não entregue'
    };

    const planStatusClasses = {
      validated: 'validated',
      scheduled: 'pending',
      posted: 'review',
      missed: 'missed'
    };

    const updateTextNodes = (nodes, value) => {
      const text = value == null ? '' : String(value);
      nodes.forEach((node) => {
        if (!node) return;
        node.textContent = text;
      });
    };

    const parsePlanDateParts = (value) => {
      const fallback = { day: '--', monthLabel: '' };
      if (!value) return fallback;
      const iso = String(value).split('T')[0];
      const [year, month, day] = iso.split('-').map((part) => Number(part));
      if (!year || !month || !day) return fallback;
      const monthIndex = Math.min(Math.max(month - 1, 0), shortMonthLabels.length - 1);
      return {
        day: String(day).padStart(2, '0'),
        monthLabel: shortMonthLabels[monthIndex] || String(month).padStart(2, '0')
      };
    };

    const planState = {
      cycle: null,
      plans: [],
      scripts: [],
      progress: null,
      loading: false
    };

    let currentContractRecord = null;
    let contractWaived = false;

    const formatPlanStatus = (status) => planStatusLabels[status] || status || '-';

    const resolveScriptTitle = (plan) => {
      if (!plan) return '-';
      const existingTitle = toTrimmedString(plan.script_title ?? plan.scriptTitle ?? '');
      if (existingTitle) return existingTitle;
      const scriptId = plan.content_script_id;
      if (scriptId == null) return '-';
      const script = planState.scripts.find((item) => Number(item?.id) === Number(scriptId));
      return toTrimmedString(script?.titulo ?? script?.title ?? '') || `Roteiro ${scriptId}`;
    };

    const renderPlanOverview = () => {
      const cycle = planState.cycle;
      if (cycle?.cycle_month && cycle?.cycle_year) {
        const monthIndex = Number(cycle.cycle_month) - 1;
        const monthLabel = fullMonthLabels[monthIndex] || `Mês ${cycle.cycle_month}`;
        updateTextNodes(planCyclePeriodEls, `${monthLabel} ${cycle.cycle_year}`);
        const helper = `Ciclo ${String(cycle.cycle_month).padStart(2, '0')}/${cycle.cycle_year}`;
        updateTextNodes(planCycleHelperEls, helper);
      } else {
        updateTextNodes(planCyclePeriodEls, '–');
        updateTextNodes(planCycleHelperEls, 'Estamos preparando seus dados.');
      }

      const plans = Array.isArray(planState.plans) ? planState.plans : [];
      const progress = planState.progress || {};
      const plannedCount = progress.plannedDays ?? plans.length;
      const validatedCount =
        progress.validatedDays ?? plans.filter((plan) => plan.status === 'validated').length;
      const pendingCount =
        progress.pendingValidations ?? plans.filter((plan) => plan.status === 'scheduled').length;

      updateTextNodes(planPlannedCountEls, formatInteger(plannedCount));
      updateTextNodes(planValidatedCountEls, formatInteger(validatedCount));
      updateTextNodes(planPendingCountEls, formatInteger(pendingCount));

      const multiplierLabel = toTrimmedString(progress.multiplierLabel ?? '') || 'Multiplicador do ciclo';
      updateTextNodes(planMultiplierLabelEls, multiplierLabel);
      updateTextNodes(planMultiplierEls, formatMultiplierDisplay(progress.multiplier));
    };

    const renderPlanSchedule = () => {
      if (!planScheduleBoardEl) return;
      planScheduleBoardEl.innerHTML = '';

      const plans = Array.isArray(planState.plans) ? [...planState.plans] : [];
      if (!plans.length) {
        const empty = document.createElement('div');
        empty.className = 'schedule-empty';
        empty.textContent = 'Nenhum agendamento cadastrado para este ciclo.';
        planScheduleBoardEl.appendChild(empty);
        return;
      }

      plans.sort((a, b) => {
        const aDate = a?.scheduled_date || '';
        const bDate = b?.scheduled_date || '';
        if (aDate === bDate) {
          return (Number(a?.id) || 0) - (Number(b?.id) || 0);
        }
        return aDate < bDate ? -1 : 1;
      });

      const fragment = document.createDocumentFragment();

      plans.forEach((plan) => {
        if (!plan) return;
        const status = plan.status || 'scheduled';
        const card = document.createElement('article');
        card.className = `schedule-card schedule-card--${planStatusClasses[status] || 'pending'}`;

        const dateSection = document.createElement('div');
        dateSection.className = 'schedule-card__date';
        const dateParts = parsePlanDateParts(plan.scheduled_date);
        const dayEl = document.createElement('span');
        dayEl.className = 'schedule-card__day';
        dayEl.textContent = dateParts.day;
        dateSection.appendChild(dayEl);

        const monthEl = document.createElement('span');
        monthEl.className = 'schedule-card__month';
        monthEl.textContent = dateParts.monthLabel;
        dateSection.appendChild(monthEl);
        card.appendChild(dateSection);

        const info = document.createElement('div');
        info.className = 'schedule-card__info';

        const statusEl = document.createElement('span');
        statusEl.className = 'schedule-card__status';
        statusEl.textContent = formatPlanStatus(status);
        info.appendChild(statusEl);

        const titleEl = document.createElement('h3');
        titleEl.className = 'schedule-card__title';
        titleEl.textContent = plan.content_script_id ? resolveScriptTitle(plan) : 'Roteiro a definir';
        info.appendChild(titleEl);

        if (plan.notes) {
          const noteEl = document.createElement('p');
          noteEl.className = 'schedule-card__note';
          noteEl.textContent = plan.notes;
          info.appendChild(noteEl);
        }

        card.appendChild(info);
        fragment.appendChild(card);
      });

      planScheduleBoardEl.appendChild(fragment);
    };

    const loadPlan = async ({ silent = false } = {}) => {
      if (planState.loading) return;
      planState.loading = true;
      if (!silent) {
        setMessage(planMessageEl, 'Carregando sua agenda...', 'info');
      }
      try {
        const data = await apiFetch('/influencer/dashboard');
        planState.cycle = data?.cycle ?? null;
        planState.plans = Array.isArray(data?.plans) ? data.plans : [];
        if (Array.isArray(data?.scripts)) {
          planState.scripts = data.scripts;
        } else if (Array.isArray(data?.suggestions)) {
          planState.scripts = data.suggestions;
        } else {
          planState.scripts = [];
        }
        planState.progress = data?.progress ?? null;
        renderPlanOverview();
        renderPlanSchedule();
        if (!silent) {
          setMessage(planMessageEl, '', '');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        if (!silent) {
          setMessage(planMessageEl, error.message || 'Não foi possível carregar sua agenda.', 'error');
        }
      } finally {
        planState.loading = false;
      }
    };

    const setContractButtonsEnabled = (enabled) => {
      if (viewContractBtn) {
        if (enabled) viewContractBtn.removeAttribute('disabled');
        else viewContractBtn.setAttribute('disabled', '');
      }
      if (downloadContractBtn) {
        if (enabled) {
          downloadContractBtn.removeAttribute('disabled');
          downloadContractBtn.removeAttribute('hidden');
        } else {
          downloadContractBtn.setAttribute('disabled', '');
          downloadContractBtn.setAttribute('hidden', '');
        }
      }
    };

    const applyContractWaiverState = () => {
      if (!contractWaived) {
        return false;
      }
      if (contractInfoEl) contractInfoEl.innerHTML = '';
      setContractButtonsEnabled(false);
      if (contractMessageEl) {
        setMessage(contractMessageEl, 'A assinatura do contrato foi dispensada para sua conta.', 'info');
      }
      return true;
    };

    const renderContractInfo = (record) => {
      if (!contractInfoEl) return;
      contractInfoEl.innerHTML = '';
      if (!record) return;

      const items = [
        { label: 'Versão do termo', value: record.versao || '-' },
        { label: 'Assinado em (Brasília)', value: formatDateTimeDetailed(record.datasAceite) },
        { label: 'Assinado em (UTC)', value: record.datasAceite?.utc || record.datasAceite?.iso || '-' },
        { label: 'Hash SHA-256', value: record.hashTermo || '-', type: 'code' },
        { label: 'Endereço IP', value: record.ipUsuario || '-' },
        { label: 'Canal de autenticação', value: record.canalDescricao || record.canalAutenticacao || '-' },
        { label: 'Status do aceite', value: record.status || '-' },
        { label: 'Código gerado em', value: formatDateTimeDetailed(record.datasCodigoAssinatura) }
      ];

      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        const row = document.createElement('dl');
        row.className = 'info-item';

        const labelEl = document.createElement('dt');
        labelEl.textContent = `${item.label}:`;
        row.appendChild(labelEl);

        const valueEl = document.createElement('dd');
        valueEl.className = 'info-value';
        if (item.type === 'code') {
          const codeEl = document.createElement('code');
          codeEl.textContent = item.value ?? '-';
          valueEl.appendChild(codeEl);
        } else {
          valueEl.textContent = item.value ?? '-';
        }
        row.appendChild(valueEl);
        fragment.appendChild(row);
      });

      contractInfoEl.appendChild(fragment);
    };

    const loadContractRecord = async () => {
      if (!contractMessageEl) return;
      if (contractInfoEl) contractInfoEl.innerHTML = '';
      setContractButtonsEnabled(false);
      if (applyContractWaiverState()) {
        currentContractRecord = null;
        return;
      }
      setMessage(contractMessageEl, 'Carregando contrato assinado...', 'info');
      currentContractRecord = null;
      try {
        const data = await apiFetch('/api/contrato-assinado');
        currentContractRecord = data;
        renderContractInfo(data);
        setMessage(contractMessageEl, 'Contrato assinado disponível para consulta.', 'success');
        setContractButtonsEnabled(Boolean(data?.html));
      } catch (error) {
        currentContractRecord = null;
        if (error.status === 401) {
          logout();
          return;
        }
        if (error.status === 404) {
          setMessage(
            contractMessageEl,
            error.message || 'Ainda não encontramos um contrato assinado para este acesso.',
            'info'
          );
          return;
        }
        setMessage(contractMessageEl, error.message || 'Não foi possível carregar o contrato assinado.', 'error');
      }
    };

    viewContractBtn?.addEventListener('click', () => {
      if (!currentContractRecord?.html) {
        setMessage(contractMessageEl, 'Contrato indisponível para visualização no momento.', 'error');
        return;
      }
      const opened = openHtmlDocument(currentContractRecord.html);
      if (!opened) {
        setMessage(
          contractMessageEl,
          'Não foi possível abrir o contrato em uma nova aba. Verifique o bloqueio de pop-ups e tente novamente.',
          'error'
        );
      }
    });

    downloadContractBtn?.addEventListener('click', () => {
      if (!currentContractRecord?.html) {
        setMessage(contractMessageEl, 'Contrato indisponível para download no momento.', 'error');
        return;
      }
      const filename = currentContractRecord.filename || 'contrato-hidrapink.html';
      const success = downloadHtmlDocument(currentContractRecord.html, filename);
      if (!success) {
        setMessage(contractMessageEl, 'Não foi possível iniciar o download do contrato.', 'error');
      }
    });

    const findFirstValue = (candidates = []) =>
      candidates.find((candidate) => candidate != null && candidate !== '');

    const resolveSalePoints = (sale) => {
      const pointsValue = findFirstValue([
        sale.points,
        sale.points_total,
        sale.total_points,
        sale.base_points,
        sale.pontos,
        sale.pontos_totais,
        sale.pointsEarned,
        sale.pointsAwarded
      ]);
      const parsed = parseToNumberOrNull(pointsValue);
      return parsed != null && parsed >= 0 ? parsed : 0;
    };

    const renderSalesSummary = (rows) => {
      if (!salesSummaryEl) return;
      salesSummaryEl.innerHTML = '';
      if (!Array.isArray(rows) || rows.length === 0) {
        return;
      }

      const totalOrders = rows.length;
      const totalPoints = rows.reduce((sum, sale) => sum + resolveSalePoints(sale), 0);

      const ordersHelper = totalOrders === 1 ? 'pedido registrado' : 'pedidos registrados';

      const metrics = [
        {
          label: 'Quantidade de pedidos',
          value: formatInteger(totalOrders),
          helper: ordersHelper
        },
        {
          label: 'Pontos acumulados',
          value: formatInteger(totalPoints),
          helper: 'Total sem aplicar o multiplicador'
        }
      ];

      const fragment = document.createDocumentFragment();
      metrics.forEach((metric) => {
        const card = document.createElement('div');
        card.className = 'metric-card';

        const labelEl = document.createElement('h4');
        labelEl.textContent = metric.label;
        card.appendChild(labelEl);

        const valueEl = document.createElement('p');
        valueEl.textContent = metric.value;
        card.appendChild(valueEl);

        if (metric.helper) {
          const helperEl = document.createElement('span');
          helperEl.className = 'metric-helper';
          helperEl.textContent = metric.helper;
          card.appendChild(helperEl);
        }

        fragment.appendChild(card);
      });

      salesSummaryEl.appendChild(fragment);
    };

    const renderSalesTable = (rows) => {
      renderSalesSummary(rows);
      if (!salesTableBody) return;
      salesTableBody.innerHTML = '';
      if (!Array.isArray(rows) || rows.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 3;
        emptyCell.className = 'empty';
        emptyCell.textContent = 'Nenhuma venda registrada.';
        emptyRow.appendChild(emptyCell);
        salesTableBody.appendChild(emptyRow);
        return;
      }
      const fragment = document.createDocumentFragment();
      rows.forEach((sale) => {
        const tr = document.createElement('tr');
        const orderCandidates = [
          sale.order_number,
          sale.orderNumber,
          sale.numero_pedido,
          sale.numeroPedido,
          sale.order,
          sale.pedido,
          sale.id
        ];
        const orderValue = orderCandidates.find((candidate) => candidate != null && candidate !== '');
        const orderDisplay = orderValue != null && orderValue !== '' ? String(orderValue) : '-';

        const dateCandidates = [
          sale.date,
          sale.order_date,
          sale.data,
          sale.created_at,
          sale.createdAt,
          sale.sale_date
        ];
        const rawDate = dateCandidates.find((candidate) => candidate != null && candidate !== '');
        const dateDisplay = rawDate ? formatDateToBR(rawDate) : '-';

        const pointsValue = resolveSalePoints(sale);
        const pointsDisplay = formatInteger(pointsValue);

        const cells = [
          { label: 'Número do pedido', value: orderDisplay },
          { label: 'Data', value: dateDisplay },
          { label: 'Pontos', value: pointsDisplay }
        ];
        cells.forEach(({ label, value }) => {
          const td = document.createElement('td');
          td.textContent = value;
          td.dataset.label = label;
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      });
      salesTableBody.appendChild(fragment);
    };

    const loadInfluencerSales = async (influencerId) => {
      if (!influencerId) {
        renderSalesTable([]);
        setMessage(salesMessageEl, 'Nenhuma venda registrada até o momento.', 'info');
        return;
      }
      setMessage(salesMessageEl, 'Carregando desempenho...', 'info');
      try {
        const salesData = await apiFetch(`/sales/${influencerId}`);
        const rows = Array.isArray(salesData) ? salesData : [];
        renderSalesTable(rows);
        if (!rows.length) {
          setMessage(salesMessageEl, 'Nenhuma venda registrada até o momento.', 'info');
        } else {
          setMessage(salesMessageEl, '', '');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(salesMessageEl, error.message || 'Nao foi possivel carregar as vendas.', 'error');
        renderSalesTable([]);
      }
    };

    const loadInfluencer = async () => {
      renderInfluencerStatus(detailsEl, 'Carregando dados...');
      contractWaived = false;
      try {
        const data = await apiFetch('/influenciadoras');
        const influencer = Array.isArray(data) ? data[0] : null;
        if (!influencer) {
          renderInfluencerStatus(detailsEl, 'Nenhum registro associado ao seu usuario.');
          renderSalesTable([]);
          if (isStandalonePerformancePage) {
            setMessage(salesMessageEl, 'Nenhum registro associado ao seu usuario.', 'info');
          } else {
            setMessage(salesMessageEl, '', '');
          }
          if (greetingEl) {
            greetingEl.textContent = 'Bem vinda, Pinklover.';
          }
          if (!isStandalonePerformancePage) {
            await loadContractRecord();
          }
          return;
        }
        renderInfluencerDetails(detailsEl, formatInfluencerDetails(influencer));
        if (greetingEl) {
          const safeName = (influencer.nome || '').trim() || 'Pinklover';
          greetingEl.textContent = `Bem vinda, ${safeName}.`;
        }
        contractWaived = parseBooleanFlag(
          influencer.contract_signature_waived ?? influencer.contractSignatureWaived
        );
        if (!isStandalonePerformancePage) {
          if (!contractWaived) {
            setMessage(contractMessageEl, '', '');
          } else {
            applyContractWaiverState();
          }
        }
        await loadInfluencerSales(influencer.id);
        if (!isStandalonePerformancePage) {
          await loadContractRecord();
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        renderInfluencerStatus(detailsEl, error.message || 'Nao foi possivel carregar os dados.');
        if (greetingEl) {
          greetingEl.textContent = 'Bem vinda, Pinklover.';
        }
        contractWaived = false;
        if (isStandalonePerformancePage) {
          setMessage(salesMessageEl, error.message || 'Nao foi possivel carregar os dados.', 'error');
          renderSalesTable([]);
        } else {
          setContractButtonsEnabled(false);
          if (contractMessageEl) {
            setMessage(
              contractMessageEl,
              'Não foi possível carregar o contrato assinado.',
              'error'
            );
          }
        }
      }
    };

    enforceTermAcceptance().then(async (allowed) => {
      if (!allowed) return;
      await loadInfluencer();
      if (!isStandalonePerformancePage) {
        await loadPlan();
      }
    });
  };


  const initMasterSkuPointsPage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const form = document.getElementById('skuPointsForm');
    const messageEl = document.getElementById('skuPointsMessage');
    const skuInput = form?.elements.sku || null;
    const descriptionInput = form?.elements.description || null;
    const pointsInput = form?.elements.points || null;
    const activeInput = form?.elements.active || null;
    const cancelEditButton = document.getElementById('cancelSkuEditButton');
    const reloadButton = document.getElementById('reloadSkuPointsButton');
    const tableBody = document.querySelector('#skuPointsTable tbody');

    addRealtimeValidation(form);

    let skuPoints = [];
    let editingId = null;

    const resetForm = ({ clearMessage = false } = {}) => {
      editingId = null;
      if (form) {
        form.reset();
        form.dataset.mode = 'create';
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Cadastrar SKU';
        form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
      }
      if (activeInput) activeInput.checked = true;
      if (clearMessage) setMessage(messageEl, '');
    };

    const renderTable = () => {
      if (!tableBody) return;
      tableBody.innerHTML = '';
      if (!skuPoints.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 5;
        emptyCell.className = 'empty';
        emptyCell.textContent = 'Nenhum SKU cadastrado ainda.';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
      }

      const fragment = document.createDocumentFragment();
      skuPoints.forEach((row) => {
        const tr = document.createElement('tr');
        tr.dataset.id = String(row.id);

        const skuTd = document.createElement('td');
        skuTd.textContent = row.sku || '-';
        tr.appendChild(skuTd);

        const descriptionTd = document.createElement('td');
        descriptionTd.textContent = row.description || '-';
        tr.appendChild(descriptionTd);

        const pointsTd = document.createElement('td');
        pointsTd.textContent = formatInteger(Number(row.points_per_unit ?? row.pointsPerUnit ?? 0));
        tr.appendChild(pointsTd);

        const statusTd = document.createElement('td');
        statusTd.textContent = row.active ? 'Ativo' : 'Inativo';
        statusTd.dataset.status = row.active ? 'active' : 'inactive';
        tr.appendChild(statusTd);

        const actionsTd = document.createElement('td');
        actionsTd.className = 'actions';
        actionsTd.innerHTML = `
          <button type="button" data-action="edit">Editar</button>
          <button type="button" data-action="delete">Excluir</button>
        `;
        tr.appendChild(actionsTd);

        fragment.appendChild(tr);
      });

      tableBody.appendChild(fragment);
    };

    const loadSkuPoints = async ({ showStatus = true } = {}) => {
      if (showStatus) setMessage(messageEl, 'Carregando SKUs...', 'info');
      try {
        const response = await apiFetch('/sku-points');
        skuPoints = Array.isArray(response)
          ? response.map((row) => ({
              ...row,
              points_per_unit: Number(row.points_per_unit ?? row.pointsPerUnit ?? 0),
              active: row.active ? 1 : 0
            }))
          : [];
        renderTable();
        if (showStatus) setMessage(messageEl, 'SKUs carregados com sucesso.', 'success');
      } catch (error) {
        skuPoints = [];
        renderTable();
        setMessage(messageEl, error.message || 'Nao foi possivel carregar os SKUs cadastrados.', 'error');
      }
    };

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const skuValue = (skuInput?.value || '').trim();
      const descriptionValue = (descriptionInput?.value || '').trim();
      const pointsValue = Number(pointsInput?.value ?? pointsInput?.valueAsNumber ?? 0);
      const activeValue = Boolean(activeInput?.checked);

      flagInvalidField(skuInput, Boolean(skuValue));
      flagInvalidField(pointsInput, Number.isFinite(pointsValue) && pointsValue >= 0);

      if (!skuValue || !Number.isFinite(pointsValue) || pointsValue < 0) {
        setMessage(messageEl, 'Informe o SKU e a pontuação por unidade.', 'error');
        focusFirstInvalidField(form);
        return;
      }

      const payload = {
        sku: skuValue,
        description: descriptionValue || undefined,
        points_per_unit: Math.round(pointsValue),
        active: activeValue ? 1 : 0
      };

      try {
        if (editingId) {
          await apiFetch(`/sku-points/${editingId}`, { method: 'PUT', body: payload });
          setMessage(messageEl, 'SKU atualizado com sucesso.', 'success');
        } else {
          await apiFetch('/sku-points', { method: 'POST', body: payload });
          setMessage(messageEl, 'SKU cadastrado com sucesso.', 'success');
        }
        resetForm({ clearMessage: false });
        await loadSkuPoints({ showStatus: false });
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(
          messageEl,
          error.message || 'Nao foi possivel salvar o cadastro de pontos para o SKU informado.',
          'error'
        );
      }
    });

    tableBody?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      const id = Number(row?.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const action = button.dataset.action;

      if (action === 'edit') {
        const target = skuPoints.find((entry) => entry.id === id);
        if (!target) return;
        editingId = id;
        if (form) form.dataset.mode = 'edit';
        const submitBtn = form?.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Salvar SKU';
        if (skuInput) skuInput.value = target.sku || '';
        if (descriptionInput) descriptionInput.value = target.description || '';
        if (pointsInput) pointsInput.value = target.points_per_unit != null ? String(target.points_per_unit) : '';
        if (activeInput) activeInput.checked = Boolean(target.active);
        setMessage(messageEl, 'Editando pontuação do SKU selecionado.', 'info');
      } else if (action === 'delete') {
        if (!window.confirm('Deseja realmente remover este SKU?')) return;
        (async () => {
          try {
            await apiFetch(`/sku-points/${id}`, { method: 'DELETE' });
            if (editingId === id) resetForm({ clearMessage: false });
            await loadSkuPoints({ showStatus: false });
            setMessage(messageEl, 'SKU removido com sucesso.', 'success');
          } catch (error) {
            if (error.status === 401) {
              logout();
              return;
            }
            setMessage(messageEl, error.message || 'Nao foi possivel remover o SKU selecionado.', 'error');
          }
        })();
      }
    });

    cancelEditButton?.addEventListener('click', () => {
      resetForm({ clearMessage: true });
      setMessage(messageEl, 'Edição cancelada.', 'info');
    });

    reloadButton?.addEventListener('click', () => {
      loadSkuPoints({ showStatus: true });
    });

    loadSkuPoints({ showStatus: true });
  };

  const initTermAcceptancePage = () => {
    if (!ensureAuth()) return;
    if (session.role !== 'influencer') {
      redirectTo(session.role === 'master' ? 'master.html' : 'login.html');
      return;
    }
    attachLogoutButtons();

    const checkbox = document.getElementById('aceite');
    const enviarBtn = document.getElementById('enviarCodigo');
    const validarBtn = document.getElementById('validarCodigo');
    const recusarBtn = document.getElementById('recusar');
    const codigoInput = document.getElementById('codigo');
    const verificacao = document.getElementById('verificacao');
    const messageEl = document.getElementById('aceiteMessage');

    const sanitizeCode = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);

    const setVerificationEnabled = (enabled) => {
      if (!verificacao) return;
      if (enabled) {
        verificacao.dataset.enabled = 'true';
        codigoInput?.removeAttribute('disabled');
        validarBtn?.removeAttribute('disabled');
        codigoInput?.focus();
      } else {
        verificacao.dataset.enabled = 'false';
        if (codigoInput) {
          codigoInput.value = '';
          codigoInput.setAttribute('disabled', '');
        }
        validarBtn?.setAttribute('disabled', '');
      }
    };

    const setStatus = (message, type = 'info') => {
      setMessage(messageEl, message, type);
    };

    setVerificationEnabled(false);

    codigoInput?.addEventListener('input', (event) => {
      const target = event.target;
      if (target) {
        target.value = sanitizeCode(target.value);
      }
    });

    const solicitarCodigo = async () => {
      if (!checkbox?.checked) {
        setStatus('Você precisa aceitar o termo para continuar.', 'error');
        return;
      }

      setStatus('Validando sua elegibilidade...', 'info');
      setVerificationEnabled(false);
      if (enviarBtn) enviarBtn.disabled = true;
      try {
        const response = await apiFetch('/api/enviar-token', { method: 'POST', body: {} });
        const successMessage = response?.message
          || 'Código liberado! Utilize o código de assinatura enviado pela equipe HidraPink.';
        setStatus(successMessage, 'success');
        setVerificationEnabled(true);
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        if (error.status === 428) {
          redirectTo(error.data?.redirect || '/aceite-termos');
          return;
        }
        const message =
          error.message
          || 'Não foi possível validar o código de assinatura. Caso o problema persista, contate a equipe HidraPink.';
        setStatus(message, 'error');
        if (checkbox?.checked) {
          setVerificationEnabled(true);
        }
      } finally {
        if (enviarBtn) enviarBtn.disabled = false;
      }
    };

    enviarBtn?.addEventListener('click', solicitarCodigo);

    validarBtn?.addEventListener('click', async () => {
      const codigo = sanitizeCode(codigoInput?.value || '');
      if (codigo.length !== 6) {
        setStatus('Informe o código de assinatura com 6 dígitos.', 'error');
        codigoInput?.focus();
        return;
      }

      if (validarBtn) validarBtn.disabled = true;
      setStatus('Validando código...', 'info');
      try {
        const response = await apiFetch('/api/validar-token', {
          method: 'POST',
          body: { codigo }
        });
        setStatus('Termo aceito com sucesso! Redirecionando...', 'success');
        window.setTimeout(() => {
          redirectTo(response?.redirect || 'influencer.html');
        }, 800);
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        if (error.status === 428) {
          redirectTo(error.data?.redirect || '/aceite-termos');
          return;
        }
        setStatus(error.message || 'Não foi possível validar o código de assinatura.', 'error');
      } finally {
        if (validarBtn) validarBtn.disabled = false;
      }
    });

    recusarBtn?.addEventListener('click', () => {
      setStatus('Você optou por recusar o termo. Sessão encerrada.', 'info');
      window.setTimeout(logout, 400);
    });

    const initialize = async () => {
      try {
        const status = await fetchAcceptanceStatus();
        if (status?.aceito) {
          redirectTo('influencer.html');
          return;
        }
        setVerificationEnabled(false);
        setStatus('Leia o termo, aceite e confirme com o código de assinatura fornecido pela HidraPink.', 'info');
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        if (error.status === 428) {
          setVerificationEnabled(false);
          setStatus('Leia o termo, aceite e confirme com o código de assinatura fornecido pela HidraPink.', 'info');
          return;
        }
        setStatus(error.message || 'Não foi possível verificar o status do termo.', 'error');
      }
    };

    initialize();
  };

  const bootstrap = () => {
    const page = document.body?.dataset.page || '';
    const initializers = {
      login: initLoginPage,
      'master-home': initMasterHomePage,
      'master-create': initMasterCreatePage,
      'master-consult': initMasterConsultPage,
      'master-list': initMasterListPage,
      'master-sales': initMasterSalesPage,
      'master-sku-points': initMasterSkuPointsPage,
      'master-scripts': initMasterScriptsPage,
      influencer: initInfluencerPage,
      'influencer-performance': initInfluencerPage,
      'aceite-termos': initTermAcceptancePage
    };
    const initializer = initializers[page];
    if (initializer) {
      initializer();
    } else {
      attachLogoutButtons();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
