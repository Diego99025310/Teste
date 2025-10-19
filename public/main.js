(() => {
  'use strict';

  const API_BASE = '';
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

  const stripDiacritics = (value = '') => {
    const stringValue = String(value ?? '');
    if (typeof stringValue.normalize === 'function') {
      return stringValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return stringValue;
  };

  const deriveFixedPassword = ({ name = '', contact = '' } = {}) => {
    const normalizedName = stripDiacritics(name)
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toLowerCase();
    const contactDigits = digitOnly(contact);
    const phoneSuffix = contactDigits.slice(-4);
    if (!normalizedName && !phoneSuffix) return '';
    return `${normalizedName}${phoneSuffix}`;
  };

  const prepareWhatsappPhone = (value) => {
    const digits = digitOnly(value);
    if (!digits) return '';
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
      return digits;
    }
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    return digits;
  };

  const buildWhatsappMessageContext = ({ name = '', contact = '', password = '', loginOverride = '' } = {}) => {
    const displayName = String(name ?? '').trim() || 'influenciadora';
    const contactDigits = digitOnly(contact);
    const loginFallback = String(loginOverride ?? '').trim();
    const loginDisplay = contactDigits ? maskPhone(contactDigits) : loginFallback || 'informar o celular';
    const passwordDisplay = String(password ?? '').trim();

    const messageLines = [
      `Olá, ${displayName}`,
      '',
      'Segue seu login e senha para acesso ao painel Hidrapink.',
      '',
      'Site: https://painel.hidrapink.com.br/',
      `Login: ${loginDisplay}`,
      `Senha: ${passwordDisplay || 'gerada automaticamente no cadastro'}`,
      '',
      'Atenciosamente,',
      'Hidrapink'
    ];

    const message = messageLines.join('\n');
    const whatsappPhone = prepareWhatsappPhone(contactDigits);
    const baseUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}` : 'https://wa.me/';
    const url = message ? `${baseUrl}?text=${encodeURIComponent(message)}` : '';

    return { message, url, contactDigits, loginDisplay, password: passwordDisplay, name: displayName };
  };

  const parseBooleanFlag = (value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return false;
    const ascii = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['1', 'true', 'on', 'yes', 'sim', 'y', 's', 'dispensa', 'dispensado', 'dispensada'].includes(ascii)) {
      return true;
    }
    if (['0', 'false', 'off', 'no', 'nao', 'n'].includes(ascii)) {
      return false;
    }
    return false;
  };

  const maskCPF = (value = '') => {
    const digits = digitOnly(value).slice(0, 11);
    if (!digits.length) return '';
    let masked = digits.slice(0, Math.min(3, digits.length));
    if (digits.length > 3) masked += '.' + digits.slice(3, Math.min(6, digits.length));
    if (digits.length > 6) masked += '.' + digits.slice(6, Math.min(9, digits.length));
    if (digits.length > 9) masked += '-' + digits.slice(9, 11);
    return masked;
  };

  const maskPhone = (value = '') => {
    const digits = digitOnly(value).slice(0, 11);
    if (!digits.length) return '';
    if (digits.length <= 2) return digits;
    const ddd = digits.slice(0, 2);
    if (digits.length <= 6) return `(${ddd}) ${digits.slice(2)}`;
    const middleLength = digits.length === 11 ? 5 : 4;
    const middle = digits.slice(2, 2 + middleLength);
    const suffix = digits.slice(2 + middleLength);
    return `(${ddd}) ${middle}${suffix ? `-${suffix}` : ''}`;
  };

  const maskCEP = (value = '') => {
    const digits = digitOnly(value).slice(0, 8);
    if (!digits.length) return '';
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const getCaretPositionFromDigits = (maskedValue, digitsBeforeCaret) => {
    if (!maskedValue) return 0;
    if (digitsBeforeCaret <= 0) return 0;
    let digitsSeen = 0;
    for (let index = 0; index < maskedValue.length; index += 1) {
      if (/\d/.test(maskedValue[index])) {
        digitsSeen += 1;
        if (digitsSeen >= digitsBeforeCaret) {
          return index + 1;
        }
      }
    }
    return maskedValue.length;
  };

  const applyMaskWithCaret = (input, maskFn) => {
    if (!input) return;
    const rawValue = String(input.value || '');
    const selectionStart = typeof input.selectionStart === 'number' ? input.selectionStart : rawValue.length;
    const digitsBeforeCaret = digitOnly(rawValue.slice(0, selectionStart)).length;
    const maskedValue = maskFn(rawValue);
    input.value = maskedValue;
    if (typeof input.setSelectionRange === 'function') {
      const caretPosition = getCaretPositionFromDigits(maskedValue, digitsBeforeCaret);
      input.setSelectionRange(caretPosition, caretPosition);
    }
  };

  const createLoginIdentifierMask = () => {
    let mode = 'auto';

    const format = (rawValue) => {
      const stringValue = String(rawValue ?? '');
      if (!stringValue) {
        mode = 'auto';
        return '';
      }

      const normalizedSpaces = stringValue.replace(/\s+/g, ' ');
      const trimmed = normalizedSpaces.trim();
      if (!trimmed) {
        mode = 'auto';
        return '';
      }

      if (/[A-Za-z@]/.test(trimmed)) {
        mode = 'email';
        return trimmed;
      }

      const digits = digitOnly(trimmed);
      if (!digits) {
        mode = 'auto';
        return trimmed;
      }

      if (mode === 'email' && !/[A-Za-z@]/.test(trimmed)) {
        mode = 'auto';
      }

      if (trimmed.startsWith('+')) {
        mode = 'phone';
      }

      if (mode !== 'phone') {
        mode = 'phone';
      }

      return maskPhone(digits);
    };

    format.reset = () => {
      mode = 'auto';
    };

    format.getMode = () => mode;

    return format;
  };

  const copyTextToClipboard = async (text) => {
    const value = String(text ?? '');
    if (!value) return;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const execCommand = typeof document.execCommand === 'function' ? document.execCommand.bind(document) : null;
    const success = execCommand ? execCommand('copy') : false;
    document.body.removeChild(textarea);
    if (!success) {
      throw new Error('Nao foi possivel copiar o texto.');
    }
  };

  const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const parseToNumber = (value) => {
    if (typeof value === 'string') {
      const normalized = value.replace(/\./g, '').replace(',', '.');
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatCurrency = (value) => currencyFormatter.format(parseToNumber(value));

  const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const formatInteger = (value) => integerFormatter.format(parseToNumber(value));

  const formatDateToBR = (value) => {
    if (!value) return '-';
    const iso = String(value).split('T')[0];
    const parts = iso.split('-');
    if (parts.length !== 3) return value;
    const [year, month, day] = parts;
    if (!year || !month || !day) return value;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year.padStart(4, '0')}`;
  };

  const formatDateTimeDetailed = (value) => {
    if (!value) return '-';
    if (typeof value === 'object' && (value.br || value.iso || value.raw || value.utc)) {
      return value.br || value.iso || value.utc || value.raw || '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
        hour12: false,
        timeZone: 'America/Sao_Paulo'
      }).format(date);
    } catch (error) {
      return date.toLocaleString('pt-BR', { hour12: false });
    }
  };

  const createBlobUrl = (content, type = 'text/plain') => {
    try {
      const blob = new Blob([content], { type });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Nao foi possivel gerar o arquivo para download.', error);
      return null;
    }
  };

  const openHtmlDocument = (html) => {
    if (!html) return false;
    const url = createBlobUrl(html, 'text/html');
    if (!url) return false;
    const popup = window.open(url, '_blank', 'noopener');
    if (!popup) {
      URL.revokeObjectURL(url);
      return false;
    }

    const cleanup = () => URL.revokeObjectURL(url);
    const cleanupTimer = window.setTimeout(cleanup, 60000);
    try {
      popup.addEventListener('beforeunload', () => {
        window.clearTimeout(cleanupTimer);
        cleanup();
      });
    } catch (error) {
      window.setTimeout(() => {
        window.clearTimeout(cleanupTimer);
        cleanup();
      }, 60000);
    }

    return true;
  };

  const downloadHtmlDocument = (html, filename = 'contrato-hidrapink.html') => {
    if (!html) return false;
    const url = createBlobUrl(html, 'text/html');
    if (!url) return false;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'contrato-hidrapink.html';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  };

  const formatPercentage = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return `${number.toFixed(2)}%`;
  };

  const createSummaryItemElement = ({ label, value, helper, icon = 'info' }) => {
    const item = document.createElement('div');
    item.className = 'summary-item';

    const iconEl = document.createElement('span');
    iconEl.className = `summary-icon summary-icon--${icon}`;
    item.appendChild(iconEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'summary-content';

    const labelEl = document.createElement('span');
    labelEl.className = 'summary-label';
    labelEl.textContent = label;
    contentEl.appendChild(labelEl);

    const valueEl = document.createElement('strong');
    valueEl.className = 'summary-value';
    valueEl.textContent = value;
    contentEl.appendChild(valueEl);

    if (helper) {
      const helperEl = document.createElement('span');
      helperEl.className = 'summary-helper';
      helperEl.textContent = helper;
      contentEl.appendChild(helperEl);
    }

    item.appendChild(contentEl);
    return item;
  };

  const renderSummaryMetrics = (container, metrics = []) => {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return;
    }
    const fragment = document.createDocumentFragment();
    metrics.forEach((metric) => {
      fragment.appendChild(createSummaryItemElement(metric));
    });
    container.appendChild(fragment);
  };

  const buildSalesSummaryMetrics = (summary, totalSales = 0) => {
    let safeTotalSales = Number(totalSales);
    if (!Number.isFinite(safeTotalSales) || safeTotalSales < 0) {
      safeTotalSales = 0;
    }

    const salesHelper =
      safeTotalSales === 0
        ? 'Nenhuma venda registrada ainda'
        : safeTotalSales === 1
        ? 'venda concluída'
        : 'vendas concluídas';

    const metrics = [
      {
        label: 'Pedidos registrados',
        value: formatInteger(safeTotalSales),
        helper: salesHelper,
        icon: 'orders'
      }
    ];

    if (summary) {
      metrics.push(
        {
          label: 'Total em vendas',
          value: formatCurrency(summary.total_net),
          helper: 'Valor líquido acumulado',
          icon: 'revenue'
        },
        {
          label: 'Sua comissão',
          value: formatCurrency(summary.total_commission),
          helper: 'Estimativa atual',
          icon: 'commission'
        }
      );
    }

    return metrics;
  };

  const session = {
    get token() {
      return storage.getItem(storageKeys.token);
    },
    set token(value) {
      value ? storage.setItem(storageKeys.token, value) : storage.removeItem(storageKeys.token);
    },
    get role() {
      return storage.getItem(storageKeys.role);
    },
    set role(value) {
      value ? storage.setItem(storageKeys.role, value) : storage.removeItem(storageKeys.role);
    },
    get userId() {
      return storage.getItem(storageKeys.userId);
    },
    set userId(value) {
      value ? storage.setItem(storageKeys.userId, value) : storage.removeItem(storageKeys.userId);
    },
    get userEmail() {
      return storage.getItem(storageKeys.userEmail);
    },
    set userEmail(value) {
      value ? storage.setItem(storageKeys.userEmail, value) : storage.removeItem(storageKeys.userEmail);
    },
    clear() {
      Object.values(storageKeys).forEach((key) => storage.removeItem(key));
    }
  };

  const redirectTo = (page) => window.location.replace(page);

  const logout = () => {
    session.clear();
    redirectTo('login.html');
  };
  window.logout = logout;

  const setMessage = (element, message = '', type = 'info') => {
    if (!element) return;
    const text = message == null ? '' : String(message);
    element.textContent = text;
    if (type) {
      element.dataset.type = type;
    } else {
      delete element.dataset.type;
    }
    const hasContent = text.trim().length > 0;
    const shouldAutoHide =
      element.dataset.autoHide === 'true' ||
      element.hasAttribute('data-auto-hide') ||
      element.hasAttribute('hidden');
    if (shouldAutoHide) {
      if (hasContent) {
        element.removeAttribute('hidden');
      } else {
        element.setAttribute('hidden', '');
      }
    }
  };

  const flagInvalidField = (field, isValid) => {
    if (!field) return;
    if (isValid) {
      field.removeAttribute('aria-invalid');
    } else {
      field.setAttribute('aria-invalid', 'true');
    }
  };

  const focusFirstInvalidField = (form) => {
    if (!form) return;
    const invalid = form.querySelector('[aria-invalid="true"]');
    if (invalid && typeof invalid.focus === 'function') {
      invalid.focus();
    }
  };

  const parseResponse = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    const text = await response.text();
    return text ? { message: text } : {};
  };

  const apiFetch = async (endpoint, { method = 'GET', body, headers = {}, auth = true } = {}) => {
    const requestHeaders = { 'Content-Type': 'application/json', ...headers };
    if (auth) {
      const token = session.token;
      if (!token) {
        throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
      }
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
      });
    } catch (networkError) {
      const error = new Error('Nao foi possivel conectar ao servidor.');
      error.cause = networkError;
      throw error;
    }

    const data = await parseResponse(response);
    if (!response.ok) {
      const error = new Error(data?.error || data?.message || 'Erro inesperado.');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  };

  const fetchAcceptanceStatus = async () => {
    if (session.role !== 'influencer') {
      return { aceito: true };
    }

    try {
      return await apiFetch('/api/verificar-aceite');
    } catch (error) {
      if (error.status === 428) {
        return { aceito: false, redirect: error.data?.redirect || '/aceite-termos' };
      }
      throw error;
    }
  };

  const enforceTermAcceptance = async () => {
    if (session.role !== 'influencer') {
      return true;
    }

    try {
      const status = await fetchAcceptanceStatus();
      if (!status?.aceito) {
        redirectTo(status?.redirect || '/aceite-termos');
        return false;
      }
      return true;
    } catch (error) {
      if (error.status === 428) {
        redirectTo(error.data?.redirect || '/aceite-termos');
        return false;
      }
      if (error.status === 401) {
        logout();
        return false;
      }
      console.error('Erro ao verificar aceite do termo de parceria:', error);
      return true;
    }
  };

  const ensureAuth = (requiredRole) => {
    const token = session.token;
    const role = session.role;
    if (!token) {
      redirectTo('login.html');
      return false;
    }
    if (requiredRole && role !== requiredRole) {
      redirectTo('login.html');
      return false;
    }
    return true;
  };

  const attachLogoutButtons = () => {
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        logout();
      });
    });

  };

  const addRealtimeValidation = (form) => {
    if (!form) return;
    form.querySelectorAll('input, textarea, select').forEach((field) => {
      field.addEventListener('input', () => field.removeAttribute('aria-invalid'));
      field.addEventListener('blur', () => {
        if (!field.value) field.removeAttribute('aria-invalid');
      });
    });

  };

  const isEmail = (value) =>
    /^(?:[\w!#$%&'*+/=?^`{|}~-]+(?:\.[\w!#$%&'*+/=?^`{|}~-]+)*)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(
      String(value).trim()
    );

  const validators = {
    email: isEmail,
    password: (value) => typeof value === 'string' && value.length >= 6,
    loginIdentifier: (value) => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) return false;
      if (isEmail(trimmed)) return true;
      const digits = digitOnly(trimmed);
      return digits.length === 11 || digits.length === 10;
    }
  };

  const isValidCPF = (value) => {
    const digits = digitOnly(value);
    if (!digits) return true;
    if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
    const calc = (len) => {
      let sum = 0;
      for (let i = 0; i < len; i += 1) sum += Number(digits[i]) * (len + 1 - i);
      const result = (sum * 10) % 11;
      return result === 10 ? 0 : result;
    };
    return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
  };

  const isValidPhone = (value) => {
    const digits = digitOnly(value);
    if (!digits) return false;
    return digits.length === 10 || digits.length === 11;
  };

  const isValidCep = (value) => {
    const digits = digitOnly(value);
    if (!digits) return true;
    return digits.length === 8;
  };

  const gatherInfluencerPayloadFromForm = (form) => {
    if (!form) return {};
    const getValue = (name) => (form.elements[name]?.value || '').trim();
    return {
      nome: getValue('nome'),
      instagram: getValue('instagram'),
      cpf: digitOnly(getValue('cpf')),
      email: getValue('email'),
      contato: digitOnly(getValue('contato')),
      cupom: getValue('cupom'),
      commissionPercent: getValue('commissionPercent'),
      cep: digitOnly(getValue('cep')),
      numero: getValue('numero'),
      complemento: getValue('complemento'),
      logradouro: getValue('logradouro'),
      bairro: getValue('bairro'),
      cidade: getValue('cidade'),
      estado: getValue('estado'),
      loginEmail: getValue('loginEmail'),
      loginPassword: getValue('loginPassword'),
      contractSignatureWaived: Boolean(form.elements.contractSignatureWaived?.checked)
    };
  };

  const validateInfluencerPayload = (form, payload, options = {}) => {
    const requireCredentials = options.requireCredentials ?? true;
    const errors = [];
    const mark = (name, condition, message) => {
      const field = form?.elements?.[name];
      flagInvalidField(field, condition);
      if (!condition && message) errors.push(message);
    };

    const nome = (payload.nome || '').trim();
    const instagram = (payload.instagram || '').trim();
    const email = (payload.email || '').trim();
    const loginEmail = (payload.loginEmail || '').trim();
    const loginPassword = payload.loginPassword || '';
    const estado = (payload.estado || '').trim();
    const commissionPercent = payload.commissionPercent;

    mark('nome', Boolean(nome), 'Informe o nome.');
    mark('instagram', Boolean(instagram), 'Informe o Instagram.');

    mark('cpf', isValidCPF(payload.cpf), 'CPF invalido.');
    mark('email', Boolean(email) && validators.email(email), 'Informe um email valido.');
    mark('contato', isValidPhone(payload.contato), 'Informe um contato com DDD e numero.');
    mark('cep', isValidCep(payload.cep), 'CEP invalido.');

    mark('estado', !estado || estado.length === 2, 'Estado deve ter 2 letras.');

    if (commissionPercent) {
      const parsedCommission = Number(commissionPercent);
      mark('commissionPercent', Number.isFinite(parsedCommission) && parsedCommission >= 0 && parsedCommission <= 100, 'Comissao deve estar entre 0 e 100.');
    } else {
      mark('commissionPercent', true);
    }

    if (requireCredentials || loginEmail) {
      mark('loginEmail', validators.email(loginEmail), 'Informe um email de acesso valido.');
    } else {
      mark('loginEmail', true);
    }

    if (requireCredentials || loginPassword) {
      mark('loginPassword', validators.password(loginPassword), 'Informe uma senha de acesso com ao menos 6 caracteres.');
    } else {
      mark('loginPassword', true);
    }

    return { isValid: errors.length === 0, errors };
  };

  const normalizeInfluencerForSubmit = (payload) => {
    const trimmed = { ...payload };
    trimmed.nome = (trimmed.nome || '').trim();
    trimmed.instagram = (trimmed.instagram || '').trim();
    if (trimmed.instagram && !trimmed.instagram.startsWith('@')) {
      trimmed.instagram = `@${trimmed.instagram}`;
    }
    trimmed.email = (trimmed.email || '').trim();
    trimmed.cupom = (trimmed.cupom || '').trim();
    trimmed.commissionPercent = (trimmed.commissionPercent || '').trim();
    trimmed.numero = (trimmed.numero || '').trim();
    trimmed.complemento = (trimmed.complemento || '').trim();
    trimmed.logradouro = (trimmed.logradouro || '').trim();
    trimmed.bairro = (trimmed.bairro || '').trim();
    trimmed.cidade = (trimmed.cidade || '').trim();
    trimmed.estado = (trimmed.estado || '').trim().toUpperCase();
    trimmed.loginEmail = (trimmed.loginEmail || '').trim();
    trimmed.loginPassword = trimmed.loginPassword || '';
    trimmed.contractSignatureWaived = parseBooleanFlag(trimmed.contractSignatureWaived);
    return trimmed;
  };

  const formatInfluencerDetails = (data) => {
    const coupon = (data.cupom || '').trim();
    const discountLink = coupon ? `https://www.hidrapink.com.br/discount/${encodeURIComponent(coupon)}` : '';
    return {
      nome: data.nome || '-',
      cupom: coupon || '-',
      discountLink: discountLink || '-'
    };
  };

  const setupInfluencerFormHelpers = (form, messageEl) => {
    const cpfInput = form?.elements?.cpf || null;
    const contatoInput = form?.elements?.contato || null;
    const cepInput = form?.elements?.cep || null;
    const logradouroInput = form?.elements?.logradouro || null;
    const bairroInput = form?.elements?.bairro || null;
    const cidadeInput = form?.elements?.cidade || null;
    const estadoInput = form?.elements?.estado || null;

    const applyMasks = () => {
      if (cpfInput) cpfInput.value = maskCPF(cpfInput.value);
      if (contatoInput) contatoInput.value = maskPhone(contatoInput.value);
      if (cepInput) cepInput.value = maskCEP(cepInput.value);
    };

    cpfInput?.addEventListener('input', () => {
      applyMaskWithCaret(cpfInput, maskCPF);
    });

    contatoInput?.addEventListener('input', () => {
      applyMaskWithCaret(contatoInput, maskPhone);
    });

    let lastCepLookup = '';

    const applyCepData = (data) => {
      if (!data) return;
      if (data.logradouro && logradouroInput && !logradouroInput.value) logradouroInput.value = data.logradouro;
      if (data.bairro && bairroInput && !bairroInput.value) bairroInput.value = data.bairro;
      if (data.localidade && cidadeInput && !cidadeInput.value) cidadeInput.value = data.localidade;
      if (data.uf && estadoInput && !estadoInput.value) estadoInput.value = data.uf;
    };

    const fetchCep = async (digits) => {
      if (!digits || digits.length !== 8 || digits === lastCepLookup) return;
      try {
        if (messageEl) setMessage(messageEl, 'Consultando CEP...', 'info');
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (!response.ok) throw new Error('CEP nao encontrado.');
        const data = await response.json();
        if (data.erro) {
          if (messageEl) setMessage(messageEl, 'CEP nao encontrado.', 'error');
          lastCepLookup = '';
          return;
        }
        applyCepData(data);
        if (messageEl) setMessage(messageEl, 'Endereco preenchido automaticamente.', 'success');
        lastCepLookup = digits;
      } catch (error) {
        if (messageEl) setMessage(messageEl, error.message || 'Nao foi possivel consultar o CEP.', 'error');
        lastCepLookup = '';
      }
    };

    cepInput?.addEventListener('input', () => {
      applyMaskWithCaret(cepInput, maskCEP);
      if (digitOnly(cepInput.value).length < 8) lastCepLookup = '';
    });

    cepInput?.addEventListener('blur', () => {
      const digits = digitOnly(cepInput.value);
      if (digits.length === 8) fetchCep(digits);
    });

    return { applyMasks };
  };

  const fillInfluencerFormFields = (form, data) => {
    if (!form || !data) return;
    const setValue = (name, value) => {
      if (form.elements[name]) {
        form.elements[name].value = value ?? '';
        form.elements[name].removeAttribute('aria-invalid');
      }
    };
    setValue('nome', data.nome);
    setValue('instagram', data.instagram);
    setValue('cpf', digitOnly(data.cpf || ''));
    setValue('email', data.email);
    setValue('contato', digitOnly(data.contato || ''));
    setValue('cupom', data.cupom);
    setValue('commissionPercent', data.commission_rate != null ? String(Number(data.commission_rate)) : '');
    setValue('cep', digitOnly(data.cep || ''));
    setValue('numero', data.numero);
    setValue('complemento', data.complemento);
    setValue('logradouro', data.logradouro);
    setValue('bairro', data.bairro);
    setValue('cidade', data.cidade);
    setValue('estado', data.estado);
    setValue('loginEmail', data.login_email || '');
    if (form.elements.contractSignatureWaived) {
      form.elements.contractSignatureWaived.checked = parseBooleanFlag(
        data.contract_signature_waived ?? data.contractSignatureWaived
      );
    }
    if (form.elements.loginPassword) {
      form.elements.loginPassword.value = '';
      form.elements.loginPassword.removeAttribute('aria-invalid');
    }
  };

  const fetchAllInfluencers = async () => {
    const data = await apiFetch('/influenciadoras');
    return Array.isArray(data) ? data : [];
  };

  const fetchInfluencerById = async (id) => {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
      throw new Error('ID invalido.');
    }
    return apiFetch(`/influenciadora/${Number(id)}`);
  };

  const fetchInfluencerSummaries = async () => {
    const data = await apiFetch('/influenciadoras/consulta');
    return Array.isArray(data) ? data : [];
  };

  const fetchScripts = async () => {
    const data = await apiFetch('/scripts');
    return Array.isArray(data) ? data : [];
  };

  const createScript = async ({ title, description }) =>
    apiFetch('/scripts', { method: 'POST', body: { title, description } });

  const formatAccount = (instagram) => {
    if (!instagram) return '-';
    return instagram.replace(/^@/, '').trim() || '-';
  };

  const redirectToInfluencerEdit = (id) => {
    window.location.href = `master-create.html?id=${id}`;
  };

  const initLoginPage = () => {
    if (session.token && session.role) {
      if (session.role === 'master') {
        redirectTo('master.html');
        return;
      }
      if (session.role === 'influencer') {
        redirectTo('influencer.html');
        return;
      }
    }

    const form = document.getElementById('loginForm');
    const messageEl = document.getElementById('loginMessage');
    addRealtimeValidation(form);

    const loginIdentifierInput = form?.elements?.email || null;
    const loginIdentifierMask = createLoginIdentifierMask();

    const applyLoginIdentifierMask = (options = {}) => {
      if (!loginIdentifierInput) return;
      const { preserveCaret = true } = options;
      const rawValue = String(loginIdentifierInput.value || '');
      const formattedValue = loginIdentifierMask(rawValue);
      if (formattedValue === rawValue) return;

      const selectionStart =
        typeof loginIdentifierInput.selectionStart === 'number'
          ? loginIdentifierInput.selectionStart
          : rawValue.length;

      loginIdentifierInput.value = formattedValue;

      if (!preserveCaret || typeof loginIdentifierInput.setSelectionRange !== 'function') {
        return;
      }

      const mode = loginIdentifierMask.getMode();
      if (mode === 'cpf' || mode === 'phone') {
        const digitsBeforeCaret = digitOnly(rawValue.slice(0, selectionStart)).length;
        const caretPosition = getCaretPositionFromDigits(formattedValue, digitsBeforeCaret);
        loginIdentifierInput.setSelectionRange(caretPosition, caretPosition);
      } else {
        const caretPosition = Math.max(0, selectionStart + (formattedValue.length - rawValue.length));
        loginIdentifierInput.setSelectionRange(caretPosition, caretPosition);
      }
    };

    loginIdentifierInput?.addEventListener('input', () => {
      if (!loginIdentifierInput) return;
      if (!loginIdentifierInput.value) {
        loginIdentifierMask.reset();
        return;
      }
      applyLoginIdentifierMask();
    });

    loginIdentifierInput?.addEventListener('blur', () => {
      if (!loginIdentifierInput) return;
      applyLoginIdentifierMask({ preserveCaret: false });
      if (!loginIdentifierInput.value.trim()) {
        loginIdentifierMask.reset();
        loginIdentifierInput.value = '';
      }
    });

    loginIdentifierInput?.addEventListener('focus', () => {
      if (!loginIdentifierInput) return;
      if (!loginIdentifierInput.value.trim()) {
        loginIdentifierMask.reset();
      }
    });

    const params = (() => {
      try {
        return new URLSearchParams(window.location.search);
      } catch (error) {
        return null;
      }
    })();
    const presetIdentifier = params?.get('email')?.trim() || '';
    const presetPassword = params?.get('password') || '';
    let autoLoginTriggered = false;

    const setFieldValue = (name, value) => {
      const field = form?.elements?.[name];
      if (!field || typeof value !== 'string') return;
      field.value = value;
      field.removeAttribute('aria-invalid');
    };

    if (presetIdentifier) setFieldValue('email', presetIdentifier);
    if (presetPassword) setFieldValue('password', presetPassword);

    if (loginIdentifierInput && loginIdentifierInput.value) {
      loginIdentifierInput.value = loginIdentifierMask(loginIdentifierInput.value);
    }

    const clearLoginQueryParams = () => {
      if (!params || !window.history || typeof window.history.replaceState !== 'function') return;
      const url = new URL(window.location.href);
      url.searchParams.delete('email');
      url.searchParams.delete('password');
      const newSearch = url.searchParams.toString();
      const newUrl = newSearch ? url.pathname + '?' + newSearch : url.pathname;
      window.history.replaceState({}, '', newUrl);
    };

    const maybeAutoLogin = () => {
      if (autoLoginTriggered || !form) return;
      if (!presetIdentifier || !presetPassword) return;
      if (!validators.loginIdentifier(presetIdentifier) || !validators.password(presetPassword)) return;
      autoLoginTriggered = true;
      setMessage(messageEl, 'Entrando automaticamente...', 'info');
      clearLoginQueryParams();
      const submit = () => {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      };
      window.setTimeout(submit, 120);
    };

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearLoginQueryParams();
      if (!form) return;

      const identifier = (form.elements.email?.value || '').trim();
      const password = (form.elements.password?.value || '').trim();

      flagInvalidField(form.elements.email, validators.loginIdentifier(identifier));
      flagInvalidField(form.elements.password, validators.password(password));

      if (!validators.loginIdentifier(identifier) || !validators.password(password)) {
        setMessage(
          messageEl,
          'Informe um email ou telefone valido e uma senha (minimo 6 caracteres).',
          'error'
        );
        focusFirstInvalidField(form);
        return;
      }

      setMessage(messageEl, 'Entrando...', 'info');

      try {
        const data = await apiFetch('/login', {
          method: 'POST',
          body: { identifier, password },
          auth: false
        });

        session.token = data.token;
        session.role = data.user?.role || '';
        session.userEmail = data.user?.email || identifier;
        session.userId = data.user?.id != null ? String(data.user.id) : '';

        setMessage(messageEl, 'Login realizado com sucesso! Redirecionando...', 'success');

        setTimeout(() => {
          if (session.role === 'master') {
            redirectTo('master.html');
          } else {
            redirectTo('influencer.html');
          }
        }, 600);
      } catch (error) {
        if (error.status === 401) {
          setMessage(messageEl, 'Credenciais invalidas. Verifique e tente novamente.', 'error');
        } else {
          setMessage(messageEl, error.message || 'Nao foi possivel realizar o login.', 'error');
        }
      }
    });

    maybeAutoLogin();

  };


  const initMasterHomePage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();
  };

  const initMasterCreatePage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const form = document.getElementById('createInfluencerForm');
    const messageEl = document.getElementById('masterMessage');
    const cancelBtn = document.getElementById('cancelEditButton');

    const credentialsBox = document.getElementById('generatedCredentials');
    const credentialCodeField = document.getElementById('generatedSignatureCode');
    const credentialEmailField = document.getElementById('generatedLoginEmail');
    const credentialPasswordField = document.getElementById('generatedPassword');

    const contractSection = document.getElementById('contractRecordSection');
    const contractMessageEl = document.getElementById('contractRecordMessage');
    const contractDetailsEl = document.getElementById('contractRecordDetails');
    const viewContractRecordBtn = document.getElementById('viewContractRecordButton');
    const downloadContractRecordBtn = document.getElementById('downloadContractRecordButton');

    addRealtimeValidation(form);

    const { applyMasks } = setupInfluencerFormHelpers(form, messageEl);
    applyMasks();

    const passwordInput = form?.elements?.loginPassword || null;
    const emailInput = form?.elements?.email || null;
    const loginEmailInput = form?.elements?.loginEmail || null;
    const cpfInput = form?.elements?.cpf || null;
    const signatureCodeInput = form?.elements?.signatureCode || null;
    const contractWaiverInput = form?.elements?.contractSignatureWaived || null;
    const generatePasswordBtn = document.getElementById('generatePasswordButton');
    const regeneratePasswordBtn = document.getElementById('regeneratePasswordButton');
    const whatsappPreview = document.getElementById('whatsappMessagePreview');
    const whatsappHint = document.getElementById('whatsappMessageHint');
    const copyWhatsappMessageBtn = document.getElementById('copyWhatsappMessageButton');
    const openWhatsappBtn = document.getElementById('openWhatsappButton');
    const defaultWhatsappHint = whatsappHint?.textContent?.trim() ||
      'Revise os dados antes de enviar. O link abaixo abre o WhatsApp com a mensagem preenchida.';
    const copyWhatsappDefaultLabel = copyWhatsappMessageBtn?.textContent?.trim() || 'Copiar mensagem';

    let currentContractDocument = null;
    let editingId = null;
    let lastCredentialsPayload = null;
    let lastWhatsappContext = { message: '', url: '', contactDigits: '' };
    let copyWhatsappResetTimeout = null;

    if (loginEmailInput) {
      loginEmailInput.setAttribute('readonly', '');
    }

    const assignGeneratedPassword = () => {
      if (!passwordInput) return '';
      const nameValue = form?.elements?.nome?.value ?? '';
      const contactValue = form?.elements?.contato?.value ?? '';
      const newValue = deriveFixedPassword({ name: nameValue, contact: contactValue });
      passwordInput.value = newValue;
      passwordInput.removeAttribute('aria-invalid');
      return newValue;
    };

    const resetCopyWhatsappButton = (enabled) => {
      if (!copyWhatsappMessageBtn) return;
      if (copyWhatsappResetTimeout) {
        window.clearTimeout(copyWhatsappResetTimeout);
        copyWhatsappResetTimeout = null;
      }
      copyWhatsappMessageBtn.textContent = copyWhatsappDefaultLabel;
      if (enabled) {
        copyWhatsappMessageBtn.removeAttribute('disabled');
      } else {
        copyWhatsappMessageBtn.setAttribute('disabled', '');
      }
    };

    const clearWhatsappMessage = () => {
      lastWhatsappContext = { message: '', url: '', contactDigits: '' };
      if (whatsappPreview) whatsappPreview.value = '';
      if (openWhatsappBtn) {
        openWhatsappBtn.setAttribute('disabled', '');
        delete openWhatsappBtn.dataset.whatsappUrl;
      }
      if (whatsappHint) whatsappHint.textContent = defaultWhatsappHint;
      resetCopyWhatsappButton(false);
    };

    const updateWhatsappMessage = (payload = {}) => {
      if (!whatsappPreview) return;

      const name = (payload.nome ?? payload.name ?? form?.elements?.nome?.value ?? '').toString().trim();
      const contactValue = payload.contato ?? payload.contact ?? form?.elements?.contato?.value ?? '';
      const loginEmailValue = (payload.login_email ?? payload.loginEmail ?? loginEmailInput?.value ?? '').trim();
      const provisionalPasswordValue = (
        payload.senha_provisoria ??
        payload.provisionalPassword ??
        payload.loginPassword ??
        passwordInput?.value ??
        ''
      ).toString();

      const context = buildWhatsappMessageContext({
        name,
        contact: contactValue,
        password: provisionalPasswordValue,
        loginOverride: loginEmailValue
      });

      whatsappPreview.value = context.message;
      lastWhatsappContext = {
        message: context.message,
        url: context.url,
        contactDigits: context.contactDigits
      };

      if (openWhatsappBtn) {
        if (context.url) {
          openWhatsappBtn.removeAttribute('disabled');
          openWhatsappBtn.dataset.whatsappUrl = context.url;
        } else {
          openWhatsappBtn.setAttribute('disabled', '');
          delete openWhatsappBtn.dataset.whatsappUrl;
        }
      }

      if (whatsappHint) {
        if (!context.message) {
          whatsappHint.textContent = defaultWhatsappHint;
        } else if (context.contactDigits) {
          whatsappHint.textContent = `O link abrirá uma conversa com ${maskPhone(
            context.contactDigits
          )}. Revise antes de enviar.`;
        } else if (loginEmailValue) {
          whatsappHint.textContent =
            'Inclua um telefone em "Contato" para abrir a conversa automaticamente ou copie a mensagem para enviar.';
        } else {
          whatsappHint.textContent = defaultWhatsappHint;
        }
      }

      resetCopyWhatsappButton(Boolean(context.message));
    };

    const applyFixedPasswordRule = () => {
      const newPassword = assignGeneratedPassword();
      if (!credentialsBox?.hasAttribute('hidden') && credentialPasswordField) {
        credentialPasswordField.value = newPassword;
      }
      updateWhatsappMessage({ ...(lastCredentialsPayload || {}), senha_provisoria: newPassword });
      return newPassword;
    };

    const handleWhatsappCopy = async () => {
      const message = lastWhatsappContext?.message;
      if (!message) return;
      try {
        await copyTextToClipboard(message);
        if (!copyWhatsappMessageBtn) return;
        if (copyWhatsappResetTimeout) {
          window.clearTimeout(copyWhatsappResetTimeout);
          copyWhatsappResetTimeout = null;
        }
        copyWhatsappMessageBtn.textContent = 'Mensagem copiada!';
        copyWhatsappMessageBtn.setAttribute('disabled', '');
        copyWhatsappResetTimeout = window.setTimeout(() => {
          copyWhatsappMessageBtn.textContent = copyWhatsappDefaultLabel;
          copyWhatsappMessageBtn.removeAttribute('disabled');
          copyWhatsappResetTimeout = null;
        }, 2000);
      } catch (error) {
        resetCopyWhatsappButton(Boolean(lastWhatsappContext?.message));
        setMessage(messageEl, error.message || 'Não foi possível copiar a mensagem.', 'error');
      }
    };

    const handleWhatsappOpen = () => {
      const url = openWhatsappBtn?.dataset?.whatsappUrl || lastWhatsappContext?.url;
      if (!url) return;
      const popup = window.open(url, '_blank', 'noopener');
      if (!popup) {
        setMessage(
          messageEl,
          'Não foi possível abrir o WhatsApp automaticamente. Verifique o bloqueio de pop-ups e tente novamente.',
          'error'
        );
      }
    };

    const hideGeneratedCredentials = () => {
      if (credentialsBox) {
        credentialsBox.setAttribute('hidden', 'hidden');
      }
      if (credentialCodeField) credentialCodeField.value = '';
      if (credentialEmailField) credentialEmailField.value = '';
      if (credentialPasswordField) credentialPasswordField.value = '';
      if (signatureCodeInput) signatureCodeInput.value = '';
      lastCredentialsPayload = null;
      clearWhatsappMessage();
    };

    const updateContractWaiverUI = ({ preserveMessage = false } = {}) => {
      const waived = Boolean(contractWaiverInput?.checked);
      if (signatureCodeInput) {
        signatureCodeInput.placeholder = waived
          ? editingId
            ? 'Dispensado para esta influenciadora'
            : 'Dispensado após o cadastro'
          : 'Gerado automaticamente após o cadastro';
        if (waived && (!editingId || !signatureCodeInput.value)) {
          signatureCodeInput.value = '';
        }
      }
      if (!waived) {
        if (!preserveMessage && editingId && contractMessageEl) {
          setMessage(contractMessageEl, '');
        }
        return;
      }
      if (contractMessageEl && !preserveMessage && editingId) {
        setMessage(contractMessageEl, 'Assinatura do contrato dispensada para esta influenciadora.', 'info');
      }
      setMasterContractButtonsEnabled(false);
    };

    const showGeneratedCredentials = (payload = {}) => {
      if (!credentialsBox) return;
      const waived = parseBooleanFlag(
        payload.contract_signature_waived ?? payload.contractSignatureWaived ?? payload.dispensaAssinaturaContrato
      );
      const signatureValue = waived ? 'Dispensado' : payload.codigo_assinatura || payload.contractSignatureCode || '';
      if (credentialCodeField) {
        credentialCodeField.value = signatureValue;
      }
      if (signatureCodeInput) {
        signatureCodeInput.value = signatureValue;
      }
      if (credentialEmailField) {
        credentialEmailField.value = payload.login_email || payload.email_acesso || payload.loginEmail || '';
      }
      if (credentialPasswordField) {
        credentialPasswordField.value = payload.senha_provisoria || payload.provisionalPassword || '';
      }
      credentialsBox.removeAttribute('hidden');
      lastCredentialsPayload = { ...payload };
      updateWhatsappMessage({ ...payload });
      rememberInfluencerCredentials({
        ...payload,
        contato: payload.contato ?? form?.elements?.contato?.value ?? ''
      });
    };

    const setMasterContractButtonsEnabled = (enabled) => {
      if (viewContractRecordBtn) {
        if (enabled) viewContractRecordBtn.removeAttribute('disabled');
        else viewContractRecordBtn.setAttribute('disabled', '');
      }
      if (downloadContractRecordBtn) {
        if (enabled) downloadContractRecordBtn.removeAttribute('disabled');
        else downloadContractRecordBtn.setAttribute('disabled', '');
      }
    };

    const resetContractRecord = ({ hide = false } = {}) => {
      currentContractDocument = null;
      if (contractDetailsEl) contractDetailsEl.innerHTML = '';
      if (contractMessageEl) setMessage(contractMessageEl, '');
      setMasterContractButtonsEnabled(false);
      if (contractSection) {
        if (hide) {
          contractSection.setAttribute('hidden', 'hidden');
        } else {
          contractSection.removeAttribute('hidden');
        }
      }
    };

    const renderContractRecordDetails = (record) => {
      if (!contractDetailsEl) return;
      contractDetailsEl.innerHTML = '';
      if (!record) return;

      const influencerData = record.influencer || {};
      const items = [
        { label: 'Nome', value: influencerData.nome || '-' },
        { label: 'CPF', value: maskCPF(influencerData.cpf || '') || '-' },
        { label: 'E-mail de acesso', value: influencerData.loginEmail || '-' },
        { label: 'E-mail de contato', value: influencerData.emailContato || '-' },
        { label: 'Cupom', value: influencerData.cupom || '-' },
        { label: 'Versão do termo', value: record.versao || '-' },
        { label: 'Assinado em (Brasília)', value: record.datasAceite?.br || formatDateTimeDetailed(record.datasAceite) },
        { label: 'Assinado em (UTC)', value: record.datasAceite?.utc || record.datasAceite?.iso || '-' },
        { label: 'Hash SHA-256', value: record.hashTermo || '-', type: 'code' },
        { label: 'Endereço IP', value: record.ipUsuario || '-' },
        { label: 'Canal de autenticação', value: record.canalDescricao || record.canalAutenticacao || '-' },
        { label: 'Status do aceite', value: record.status || '-' },
        {
          label: 'Código de assinatura gerado em',
          value: record.datasCodigoAssinatura?.br || formatDateTimeDetailed(record.datasCodigoAssinatura)
        },
        { label: 'User agent registrado', value: record.userAgent || '-', type: 'pre' }
      ];

      const fragment = document.createDocumentFragment();
      items.forEach((item) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'contract-summary__item';

        const labelEl = document.createElement('span');
        labelEl.className = 'contract-summary__label';
        labelEl.textContent = item.label;
        wrapper.appendChild(labelEl);

        const elementTag = item.type === 'pre' ? 'pre' : 'span';
        const valueContainer = document.createElement(elementTag);
        valueContainer.className = 'contract-summary__value';

        if (item.type === 'code') {
          const codeEl = document.createElement('code');
          codeEl.textContent = item.value ?? '-';
          valueContainer.appendChild(codeEl);
        } else {
          valueContainer.textContent = item.value ?? '-';
        }

        wrapper.appendChild(valueContainer);
        fragment.appendChild(wrapper);
      });

      contractDetailsEl.appendChild(fragment);
    };

    const loadContractRecordForMaster = async (influencerId) => {
      if (!contractSection) return;
      contractSection.removeAttribute('hidden');
      if (contractDetailsEl) contractDetailsEl.innerHTML = '';
      setMasterContractButtonsEnabled(false);
      if (contractWaiverInput?.checked) {
        updateContractWaiverUI({ preserveMessage: true });
        if (contractMessageEl) {
          setMessage(contractMessageEl, 'Assinatura do contrato dispensada para esta influenciadora.', 'info');
        }
        currentContractDocument = null;
        return;
      }
      if (contractMessageEl) setMessage(contractMessageEl, 'Verificando contrato assinado...', 'info');
      currentContractDocument = null;
      try {
        const data = await apiFetch(`/api/contrato-assinado/influenciadora/${influencerId}`);
        currentContractDocument = data;
        renderContractRecordDetails(data);
        setMessage(contractMessageEl, 'Contrato assinado disponível.', 'success');
        setMasterContractButtonsEnabled(Boolean(data?.html));
      } catch (error) {
        currentContractDocument = null;
        if (error.status === 401) {
          logout();
          return;
        }
        if (error.status === 404) {
          setMessage(
            contractMessageEl,
            error.message || 'A influenciadora ainda não concluiu o aceite eletrônico.',
            'info'
          );
          return;
        }
        setMessage(contractMessageEl, error.message || 'Não foi possível carregar o contrato assinado.', 'error');
      }
    };

    const syncLoginEmail = () => {
      if (!loginEmailInput) return;
      const emailValue = (emailInput?.value || '').trim();
      loginEmailInput.value = emailValue;
      loginEmailInput.removeAttribute('aria-invalid');
    };

    syncLoginEmail();
    applyFixedPasswordRule();
    updateContractWaiverUI({ preserveMessage: true });

    resetContractRecord({ hide: true });

    contractWaiverInput?.addEventListener('change', () => {
      const waived = Boolean(contractWaiverInput.checked);
      if (editingId) {
        resetContractRecord({ hide: false });
      }
      updateContractWaiverUI();
      if (!waived && editingId) {
        loadContractRecordForMaster(editingId);
      }
    });

    emailInput?.addEventListener('input', syncLoginEmail);
    form?.elements?.nome?.addEventListener('input', applyFixedPasswordRule);
    form?.elements?.contato?.addEventListener('input', applyFixedPasswordRule);

    const handlePasswordRegeneration = () => {
      const newPassword = applyFixedPasswordRule();
      if (form?.dataset?.mode === 'edit') {
        setMessage(
          messageEl,
          'Senha atualizada com a regra fixa. Salve as alterações para aplicá-la.',
          'info'
        );
      }
    };

    generatePasswordBtn?.addEventListener('click', handlePasswordRegeneration);
    regeneratePasswordBtn?.addEventListener('click', handlePasswordRegeneration);
    copyWhatsappMessageBtn?.addEventListener('click', handleWhatsappCopy);
    openWhatsappBtn?.addEventListener('click', handleWhatsappOpen);

    const clearQueryId = () => {
      if (!window.history || !window.location) return;
      const url = new URL(window.location.href);
      if (url.searchParams.has('id')) {
        url.searchParams.delete('id');
        window.history.replaceState({}, '', url.pathname);
      }
    };

    const resetForm = ({ clearMessage = false, preserveSummary = false } = {}) => {
      editingId = null;
      if (form) {
        form.reset();
        form.dataset.mode = 'create';
        delete form.dataset.editId;
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Cadastrar';
        form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
      }
      if (passwordInput) {
        passwordInput.placeholder = 'Senha fixa: 3 primeiras letras do nome + 4 últimos dígitos do telefone';
        passwordInput.setAttribute('required', '');
        applyFixedPasswordRule();
      }
      if (signatureCodeInput) {
        signatureCodeInput.placeholder = 'Gerado automaticamente após o cadastro';
        signatureCodeInput.value = '';
      }
      if (contractWaiverInput) {
        contractWaiverInput.checked = false;
      }
      if (regeneratePasswordBtn) {
        regeneratePasswordBtn.setAttribute('hidden', 'hidden');
      }
      applyMasks();
      syncLoginEmail();
      updateContractWaiverUI({ preserveMessage: true });
      if (clearMessage) setMessage(messageEl, '');
      clearQueryId();
      if (!preserveSummary) hideGeneratedCredentials();
      resetContractRecord({ hide: true });
    };

    const loadInfluencerForEdit = async (id) => {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        setMessage(messageEl, 'ID de influenciadora invalido.', 'error');
        return;
      }
      setMessage(messageEl, 'Carregando influenciadora...', 'info');
      try {
        const target = await fetchInfluencerById(numericId);
        fillInfluencerFormFields(form, target);
        applyMasks();
        syncLoginEmail();
        hideGeneratedCredentials();
        editingId = numericId;
        if (form) {
          form.dataset.mode = 'edit';
          form.dataset.editId = String(numericId);
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.textContent = 'Salvar alteracoes';
        }
        if (passwordInput) {
          passwordInput.placeholder =
            'Clique em "Aplicar regra da senha provisória" para aplicar novamente a regra fixa.';
          passwordInput.removeAttribute('required');
          passwordInput.value = '';
        }
        if (signatureCodeInput) {
          signatureCodeInput.value = '';
        }
        updateContractWaiverUI();
        resetContractRecord({ hide: false });
        await loadContractRecordForMaster(numericId);
        setMessage(messageEl, 'Editando influenciadora selecionada.', 'info');
        if (regeneratePasswordBtn) {
          regeneratePasswordBtn.removeAttribute('hidden');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(messageEl, error.message || 'Nao foi possivel carregar a influenciadora.', 'error');
      }
    };

    viewContractRecordBtn?.addEventListener('click', () => {
      if (!currentContractDocument?.html) {
        setMessage(contractMessageEl, 'Contrato indisponível para visualização no momento.', 'error');
        return;
      }
      const opened = openHtmlDocument(currentContractDocument.html);
      if (!opened) {
        setMessage(
          contractMessageEl,
          'Não foi possível abrir o contrato em uma nova aba. Verifique o bloqueio de pop-ups e tente novamente.',
          'error'
        );
      }
    });

    downloadContractRecordBtn?.addEventListener('click', () => {
      if (!currentContractDocument?.html) {
        setMessage(contractMessageEl, 'Contrato indisponível para download no momento.', 'error');
        return;
      }
      const filename = currentContractDocument.filename || 'contrato-hidrapink.html';
      const success = downloadHtmlDocument(currentContractDocument.html, filename);
      if (!success) {
        setMessage(contractMessageEl, 'Não foi possível gerar o arquivo do contrato.', 'error');
      }
    });

    cancelBtn?.addEventListener('click', () => {
      resetForm({ clearMessage: true });
      setMessage(messageEl, 'Edicao cancelada.', 'info');
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const payload = gatherInfluencerPayloadFromForm(form);
      const normalized = normalizeInfluencerForSubmit(payload);
      const currentEditId = editingId ?? Number(form?.dataset?.editId || 0);
      editingId = currentEditId || null;
      const requireCredentials = !currentEditId;

      const validation = validateInfluencerPayload(form, normalized, { requireCredentials });
      if (!validation.isValid) {
        setMessage(messageEl, validation.errors.join(' '), 'error');
        focusFirstInvalidField(form);
        return;
      }

      const body = {
        ...normalized,
        commissionPercent: normalized.commissionPercent !== '' ? Number(normalized.commissionPercent) : undefined,
        loginEmail: normalized.loginEmail || undefined,
        loginPassword: normalized.loginPassword || undefined,
        contractSignatureWaived: normalized.contractSignatureWaived
      };

      const endpoint = currentEditId ? `/influenciadora/${currentEditId}` : '/influenciadora';
      const method = currentEditId ? 'PUT' : 'POST';

      try {
        const response = await apiFetch(endpoint, { method, body });
        if (currentEditId) {
          const successMessage = response?.codigo_assinatura
            ? `Influenciadora atualizada com sucesso. Novo código de assinatura: ${response.codigo_assinatura}.`
            : 'Influenciadora atualizada com sucesso.';
          setMessage(messageEl, successMessage, 'success');
          resetForm({ clearMessage: false });
          if (response?.senha_provisoria || response?.codigo_assinatura || response?.login_email) {
            showGeneratedCredentials(response || {});
          } else {
            hideGeneratedCredentials();
          }
        } else {
          setMessage(
            messageEl,
            'Influenciadora cadastrada com sucesso. Compartilhe as credenciais geradas abaixo.',
            'success'
          );
          resetForm({ clearMessage: false, preserveSummary: true });
          showGeneratedCredentials(response || {});
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(messageEl, error.message || 'Nao foi possivel salvar a influenciadora.', 'error');
      }
    });

    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) {
      const parsed = Number(idParam);
      if (Number.isInteger(parsed) && parsed > 0) {
        loadInfluencerForEdit(parsed);
      } else {
        setMessage(messageEl, 'ID de influenciadora invalido.', 'error');
      }
    } else {
      resetForm();
    }
  };

  const initMasterConsultPage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const tableBody = document.querySelector('#consultTable tbody');
    const messageEl = document.getElementById('consultMessage');
    const reloadBtn = document.getElementById('reloadConsultButton');

    const renderTable = (rows) => {
      if (!tableBody) return;
      tableBody.innerHTML = '';
      if (!Array.isArray(rows) || rows.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 5;
        emptyCell.className = 'empty';
        emptyCell.textContent = 'Nenhuma influenciadora encontrada.';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
      }
      const fragment = document.createDocumentFragment();
      rows.forEach((item) => {
        const tr = document.createElement('tr');
        tr.dataset.id = String(item.id);
        tr.dataset.clickable = 'true';
        const cells = [
          formatAccount(item.instagram || ''),
          item.nome || '-',
          item.cupom || '-',
          String(item.vendas_count ?? 0),
          formatCurrency(item.vendas_total ?? 0)
        ];
        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      });
      tableBody.appendChild(fragment);
    };

    const load = async () => {
      setMessage(messageEl, 'Carregando consulta...', 'info');
      try {
        const data = await fetchInfluencerSummaries();
        renderTable(data);
        if (!data.length) {
          setMessage(messageEl, 'Nenhuma influenciadora cadastrada.', 'info');
        } else {
          setMessage(messageEl, `${data.length} influenciadora(s) listada(s).`, 'success');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        renderTable([]);
        setMessage(messageEl, error.message || 'Nao foi possivel consultar as influenciadoras.', 'error');
      }
    };

    tableBody?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-id]');
      if (!row) return;
      const id = Number(row.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      redirectToInfluencerEdit(id);
    });

    reloadBtn?.addEventListener('click', load);

    load();
  };

  const initMasterListPage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const listContainer = document.getElementById('influencersList');
    const messageEl = document.getElementById('listMessage');
    const reloadBtn = document.getElementById('reloadInfluencers');

    let influencers = [];

    const normalizeString = (value) => {
      if (value == null) return '';
      const stringValue = String(value).trim();
      return stringValue;
    };

    const renderList = () => {
      if (!listContainer) return;
      listContainer.innerHTML = '';
      if (!influencers.length) {
        listContainer.innerHTML = '<p class="empty">Nenhuma influenciadora cadastrada.</p>';
        return;
      }
      const fragment = document.createDocumentFragment();
      influencers.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'influencer-card';
        card.innerHTML = `
          <strong>${item.nome || '-'}</strong>
          <p>Email de contato: ${item.email ?? '-'} | Cupom: ${item.cupom ?? '-'} | Login: ${item.login_email ?? '-'} | Comissao: ${item.commission_rate != null ? formatPercentage(item.commission_rate) : '-'}</p>
          <div class="actions">
            <button type="button" data-action="edit" data-id="${item.id}">Editar</button>
            <button type="button" data-action="delete" data-id="${item.id}">Excluir</button>
            <button type="button" data-action="whatsapp" data-id="${item.id}">WhatsApp</button>
          </div>
        `;
        fragment.appendChild(card);
      });
      listContainer.appendChild(fragment);
    };

    const buildUpdatePayloadFromInfluencer = (item, overrides = {}) => {
      if (!item) return null;
      const payload = {
        nome: item.nome ?? '',
        instagram: item.instagram ?? '',
        cpf: item.cpf ?? '',
        email: item.email ?? '',
        contato: item.contato ?? '',
        cupom: item.cupom ?? '',
        vendasQuantidade:
          item.vendas_quantidade != null && item.vendas_quantidade !== ''
            ? String(item.vendas_quantidade)
            : '',
        vendasValor:
          item.vendas_valor != null && item.vendas_valor !== ''
            ? String(item.vendas_valor)
            : '',
        cep: item.cep ?? '',
        numero: item.numero ?? '',
        complemento: item.complemento ?? '',
        logradouro: item.logradouro ?? '',
        bairro: item.bairro ?? '',
        cidade: item.cidade ?? '',
        estado: item.estado ?? '',
        commissionPercent:
          item.commission_rate != null && item.commission_rate !== ''
            ? String(item.commission_rate)
            : '',
        contractSignatureWaived: Number(item.contract_signature_waived) === 1
      };
      return { ...payload, ...overrides };
    };

    const openWhatsappForInfluencer = (item) => {
      if (!item) return;

      const storedCredentials = influencerCredentialsStore.get(item.id);
      const storedContact = normalizeString(storedCredentials?.contato);
      const storedPassword = normalizeString(storedCredentials?.senha_provisoria);
      const storedLogin = normalizeString(storedCredentials?.login_email);
      const storedName = normalizeString(storedCredentials?.nome);

      const contactValue = normalizeString(item.contato) || storedContact;
      const currentPassword = normalizeString(item.senha_provisoria) || storedPassword;
      const loginOverride = normalizeString(item.login_email) || storedLogin;
      const displayName = normalizeString(item.nome) || storedName;

      if (!currentPassword) {
        setMessage(
          messageEl,
          'Senha provisória não encontrada. Gere uma nova na edição do cadastro antes de enviar a mensagem.',
          'error'
        );
        return;
      }

      rememberInfluencerCredentials({
        id: item.id,
        nome: displayName,
        contato: contactValue,
        login_email: loginOverride,
        senha_provisoria: currentPassword
      });

      const context = buildWhatsappMessageContext({
        name: displayName,
        contact: contactValue,
        password: currentPassword,
        loginOverride
      });

      if (!context.message) {
        setMessage(messageEl, 'Não foi possível montar a mensagem para o WhatsApp.', 'error');
        return;
      }

      const url = context.url || 'https://wa.me/';
      const popup = window.open(url, '_blank', 'noopener');
      if (!popup) {
        setMessage(
          messageEl,
          'Não foi possível abrir o WhatsApp automaticamente. Verifique o bloqueio de pop-ups e tente novamente.',
          'error'
        );
        return;
      }

      setMessage(messageEl, 'Mensagem pronta! O WhatsApp abrirá em uma nova aba.', 'success');
    };

    const load = async () => {
      setMessage(messageEl, 'Carregando influenciadoras...', 'info');
      try {
        const data = await fetchAllInfluencers();
        influencers = data.map((item) => {
          if (!item || item.id == null) return item;
          const remembered = influencerCredentialsStore.set(item.id, {
            contato: item.contato,
            login_email: item.login_email,
            nome: item.nome
          });
          const storedPassword = normalizeString(remembered?.senha_provisoria);
          if (!normalizeString(item.senha_provisoria) && storedPassword) {
            return { ...item, senha_provisoria: storedPassword };
          }
          return item;
        });
        renderList();
        if (!influencers.length) {
          setMessage(messageEl, 'Nenhuma influenciadora cadastrada ainda.', 'info');
        } else {
          setMessage(messageEl, 'Lista carregada com sucesso.', 'success');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(messageEl, error.message || 'Nao foi possivel carregar as influenciadoras.', 'error');
      }
    };

    listContainer?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const action = button.dataset.action;
      if (action === 'edit') {
        redirectToInfluencerEdit(id);
      } else if (action === 'delete') {
        if (!window.confirm('Deseja realmente excluir esta influenciadora?')) return;
        (async () => {
          try {
            await apiFetch(`/influenciadora/${id}`, { method: 'DELETE' });
            setMessage(messageEl, 'Influenciadora removida com sucesso.', 'success');
            influencerCredentialsStore.remove(id);
            await load();
          } catch (error) {
            if (error.status === 401) {
              logout();
              return;
            }
            setMessage(messageEl, error.message || 'Nao foi possivel excluir a influenciadora.', 'error');
          }
        })();
      } else if (action === 'whatsapp') {
        const target = influencers.find((entry) => entry.id === id);
        if (!target) {
          setMessage(messageEl, 'Não foi possível localizar esta influenciadora.', 'error');
          return;
        }
        openWhatsappForInfluencer(target);
      }
    });

    reloadBtn?.addEventListener('click', load);

    load();
  };

  const initMasterSalesPage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const form = document.getElementById('createSaleForm');
    const messageEl = document.getElementById('salesMessage');
    const saleOrderInput = form?.elements.orderNumber || form?.elements.order_number || null;
    const saleCouponSelect = document.getElementById('saleCouponSelect');
    const saleDateInput = form?.elements.saleDate || null;
    const saleGrossInput = form?.elements.grossValue || null;
    const saleDiscountInput = form?.elements.discountValue || null;
    const saleNetInput = form?.elements.netValue || null;
    const saleCommissionInput = form?.elements.commissionValue || null;
    const cancelSaleEditButton = document.getElementById('cancelSaleEditButton');
    const reloadSalesButton = document.getElementById('reloadSalesButton');
    const salesTableBody = document.querySelector('#salesTable tbody');
    const salesSummaryEl = document.getElementById('salesSummary');
    const salesImportFileInput = document.getElementById('salesImportFile');
    const salesImportTextarea = document.getElementById('salesImportInput');
    const analyzeSalesImportButton = document.getElementById('analyzeSalesImportButton');
    const clearSalesImportButton = document.getElementById('clearSalesImportButton');
    const confirmSalesImportButton = document.getElementById('confirmSalesImportButton');
    const salesImportMessage = document.getElementById('salesImportMessage');
    const salesImportTableBody = document.querySelector('#salesImportTable tbody');
    const salesImportSummaryEl = document.getElementById('salesImportSummary');

    addRealtimeValidation(form);

    let influencers = [];
    let sales = [];
    let currentSalesInfluencerId = null;
    let saleEditingId = null;
    let lastImportText = '';
    let lastImportAnalysis = null;

    const getInfluencerByCoupon = (coupon) => {
      if (!coupon) return undefined;
      const normalized = coupon.trim().toLowerCase();
      return influencers.find((item) => (item.cupom || '').trim().toLowerCase() === normalized);
    };

    const updateSaleComputedFields = () => {
      if (!saleGrossInput || !saleDiscountInput || !saleNetInput || !saleCommissionInput) return;
      const gross = Number(saleGrossInput.value || 0);
      const discount = Number(saleDiscountInput.value || 0);
      const influencer = getInfluencerByCoupon(saleCouponSelect?.value || '');
      const commissionRate = influencer?.commission_rate != null ? Number(influencer.commission_rate) : 0;
      const net = Math.max(0, gross - Math.max(0, discount));
      const commission = net * (commissionRate / 100);
      saleNetInput.value = net ? net.toFixed(2) : '';
      saleCommissionInput.value = commission ? commission.toFixed(2) : '';
    };

    const renderSalesTable = () => {
      if (!salesTableBody) return;
      salesTableBody.innerHTML = '';
      if (!Array.isArray(sales) || sales.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 8;
        emptyCell.className = 'empty';
        emptyCell.textContent = 'Nenhuma venda cadastrada.';
        emptyRow.appendChild(emptyCell);
        salesTableBody.appendChild(emptyRow);
        return;
      }
      const fragment = document.createDocumentFragment();
      sales.forEach((sale) => {
        const tr = document.createElement('tr');
        tr.dataset.id = String(sale.id);
        const cells = [
          sale.order_number || sale.orderNumber || '-',
          sale.cupom || '-',
          sale.date || '-',
          formatCurrency(sale.gross_value),
          formatCurrency(sale.discount),
          formatCurrency(sale.net_value),
          formatCurrency(sale.commission)
        ];
        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        const actionTd = document.createElement('td');
        actionTd.className = 'actions';
        actionTd.innerHTML = `
          <button type="button" data-action="edit">Editar</button>
          <button type="button" data-action="delete">Excluir</button>
        `;
        tr.appendChild(actionTd);
        fragment.appendChild(tr);
      });
      salesTableBody.appendChild(fragment);
    };

    const renderSalesSummary = (summary, { totalSales } = {}) => {
      const metrics = buildSalesSummaryMetrics(
        summary,
        typeof totalSales === 'number' ? totalSales : Array.isArray(sales) ? sales.length : 0
      );
      renderSummaryMetrics(salesSummaryEl, metrics);
    };

    const updateImportConfirmState = () => {
      if (!confirmSalesImportButton) return;
      const canConfirm = lastImportAnalysis && lastImportAnalysis.validCount > 0;
      if (canConfirm) {
        confirmSalesImportButton.removeAttribute('disabled');
      } else {
        confirmSalesImportButton.setAttribute('disabled', 'disabled');
      }
    };

    const renderSalesImportTable = (rows) => {
      if (!salesImportTableBody) return;
      salesImportTableBody.innerHTML = '';
      if (!Array.isArray(rows) || !rows.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 9;
        emptyCell.className = 'empty';
        emptyCell.textContent = 'Nenhuma linha analisada.';
        emptyRow.appendChild(emptyCell);
        salesImportTableBody.appendChild(emptyRow);
        return;
      }

      const fragment = document.createDocumentFragment();
      rows.forEach((row) => {
        const isValid = !row.errors?.length;
        const tr = document.createElement('tr');
        tr.dataset.status = isValid ? 'ok' : 'error';

        const statusTd = document.createElement('td');
        statusTd.textContent = isValid ? `Linha ${row.line}: Pronto` : `Linha ${row.line}: Erro`;
        tr.appendChild(statusTd);

        const dateToDisplay = isValid ? formatDateToBR(row.date) : row.rawDate || '-';
        const grossToDisplay = isValid
          ? formatCurrency(row.grossValue)
          : row.rawGross || (row.rawGross === '' ? '0' : '-');
        const discountToDisplay = isValid
          ? formatCurrency(row.discount)
          : row.rawDiscount || (row.rawDiscount === '' ? '0' : '-');
        const netToDisplay = isValid ? formatCurrency(row.netValue) : '-';
        const commissionToDisplay = isValid ? formatCurrency(row.commission) : '-';

        const cells = [
          row.orderNumber || '-',
          row.cupom || '-',
          dateToDisplay,
          grossToDisplay,
          discountToDisplay,
          netToDisplay,
          commissionToDisplay
        ];

        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value == null || value === '' ? '-' : String(value);
          tr.appendChild(td);
        });

        const observationsTd = document.createElement('td');
        observationsTd.textContent = row.errors?.length ? row.errors.join(' ') : '-';
        tr.appendChild(observationsTd);

        fragment.appendChild(tr);
      });

      salesImportTableBody.appendChild(fragment);
    };

    const renderSalesImportSummary = (analysis) => {
      if (!salesImportSummaryEl) return;
      salesImportSummaryEl.innerHTML = '';
      if (!analysis || !analysis.totalCount) {
        return;
      }

      const summaryItems = [
        `Linhas analisadas: ${analysis.totalCount}`,
        `Prontas: ${analysis.validCount}`
      ];
      if (analysis.errorCount) {
        summaryItems.push(`Com erros (serao ignorados): ${analysis.errorCount}`);
      }
      if (analysis.validCount) {
        summaryItems.push(`Valor bruto: ${formatCurrency(analysis.summary?.totalGross)}`);
        summaryItems.push(`Descontos: ${formatCurrency(analysis.summary?.totalDiscount)}`);
        summaryItems.push(`Liquido: ${formatCurrency(analysis.summary?.totalNet)}`);
        summaryItems.push(`Comissao: ${formatCurrency(analysis.summary?.totalCommission)}`);
      }

      summaryItems.forEach((text) => {
        const span = document.createElement('span');
        span.textContent = text;
        salesImportSummaryEl.appendChild(span);
      });
    };

    const analyzeSalesImportText = async (text, { loadingMessage } = {}) => {
      const normalizedText = (text || '').trim();
      if (!normalizedText) {
        resetSalesImport({ clearText: false, clearMessage: false });
        setMessage(salesImportMessage, 'Cole os dados das vendas para analisar.', 'info');
        return;
      }

      setMessage(salesImportMessage, loadingMessage || 'Analisando dados...', 'info');
      updateImportConfirmState();

      try {
        const analysis = await apiFetch('/sales/import/preview', {
          method: 'POST',
          body: { text: normalizedText }
        });
        lastImportText = normalizedText;
        lastImportAnalysis = analysis;
        renderSalesImportTable(analysis.rows);
        renderSalesImportSummary(analysis);
        if (!analysis.totalCount) {
          setMessage(salesImportMessage, 'Nenhuma linha de venda foi encontrada.', 'info');
        } else if (analysis.hasErrors) {
          const errorsCount = analysis.errorCount ?? Math.max(analysis.totalCount - analysis.validCount, 0);
          setMessage(
            salesImportMessage,
            `Encontramos ${errorsCount} linha(s) com problema. Elas serao ignoradas ao salvar os pedidos prontos.`,
            'warning'
          );
        } else {
          setMessage(
            salesImportMessage,
            `Todos os ${analysis.validCount} pedidos estao prontos para importacao.`,
            'success'
          );
        }
      } catch (error) {
        lastImportAnalysis = null;
        renderSalesImportTable([]);
        renderSalesImportSummary(null);
        setMessage(
          salesImportMessage,
          error.message || 'Nao foi possivel analisar os dados para importacao.',
          'error'
        );
      }

      updateImportConfirmState();
    };

    const resetSalesImport = ({ clearText = false, clearMessage = true } = {}) => {
      lastImportAnalysis = null;
      lastImportText = '';
      if (clearText && salesImportTextarea) {
        salesImportTextarea.value = '';
      }
      if (salesImportFileInput) {
        salesImportFileInput.value = '';
      }
      if (clearMessage) {
        setMessage(salesImportMessage, '');
      }
      renderSalesImportTable([]);
      renderSalesImportSummary(null);
      updateImportConfirmState();
    };

    const resetSaleForm = ({ clearMessage = false, keepCoupon = true } = {}) => {
      saleEditingId = null;
      if (!form) return;
      const currentCoupon = saleCouponSelect?.value || '';
      form.reset();
      if (keepCoupon && saleCouponSelect) saleCouponSelect.value = currentCoupon;
      form.dataset.mode = 'create';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Registrar venda';
      form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
      updateSaleComputedFields();
      if (clearMessage) setMessage(messageEl, '');
    };

    const loadSalesForInfluencer = async (influencerId, { showStatus = true } = {}) => {
      if (!influencerId) {
        sales = [];
        renderSalesTable();
        renderSalesSummary(null, { totalSales: 0 });
        return;
      }
      if (showStatus) setMessage(messageEl, 'Carregando vendas...', 'info');
      try {
        const salesData = await apiFetch(`/sales/${influencerId}`);
        sales = Array.isArray(salesData) ? salesData : [];
        renderSalesTable();
        try {
          const summary = await apiFetch(`/sales/summary/${influencerId}`);
          renderSalesSummary(summary, { totalSales: sales.length });
        } catch (summaryError) {
          if (summaryError.status === 401) {
            logout();
            return;
          }
          renderSalesSummary(null, { totalSales: sales.length });
        }
        if (!sales.length) {
          if (showStatus) setMessage(messageEl, 'Nenhuma venda cadastrada para este cupom.', 'info');
        } else if (showStatus) {
          setMessage(messageEl, 'Vendas carregadas com sucesso.', 'success');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        sales = [];
        renderSalesTable();
        renderSalesSummary(null, { totalSales: 0 });
        setMessage(messageEl, error.message || 'Nao foi possivel carregar as vendas.', 'error');
      }
    };

    const populateCouponSelect = () => {
      if (!saleCouponSelect) return;
      const previous = saleCouponSelect.value;
      saleCouponSelect.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Selecione um cupom';
      saleCouponSelect.appendChild(defaultOption);

      const influencersWithCoupon = influencers.filter((inf) => (inf.cupom || '').trim());
      influencersWithCoupon.forEach((inf) => {
        const option = document.createElement('option');
        const coupon = (inf.cupom || '').trim();
        option.value = coupon;
        option.textContent = `${coupon} - ${inf.nome || ''}`;
        saleCouponSelect.appendChild(option);
      });

      if (previous && getInfluencerByCoupon(previous)) {
        saleCouponSelect.value = previous;
      } else {
        saleCouponSelect.value = '';
      }
    };

    const handleCouponChange = () => {
      const influencer = getInfluencerByCoupon(saleCouponSelect?.value || '');
      if (!influencer) {
        currentSalesInfluencerId = null;
        sales = [];
        renderSalesTable();
        renderSalesSummary(null, { totalSales: 0 });
        updateSaleComputedFields();
        setMessage(messageEl, 'Selecione um cupom para visualizar e registrar as vendas.', 'info');
        return;
      }
      currentSalesInfluencerId = influencer.id;
      updateSaleComputedFields();
      loadSalesForInfluencer(influencer.id, { showStatus: true });
    };

    const loadInfluencersForSales = async () => {
      setMessage(messageEl, 'Carregando influenciadoras...', 'info');
      try {
        influencers = await fetchAllInfluencers();
        populateCouponSelect();
        handleCouponChange();
        if (!influencers.length) {
          setMessage(messageEl, 'Cadastre uma influenciadora com cupom para registrar vendas.', 'info');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(messageEl, error.message || 'Nao foi possivel carregar as influenciadoras.', 'error');
      }
    };

    saleCouponSelect?.addEventListener('change', handleCouponChange);
    saleGrossInput?.addEventListener('input', updateSaleComputedFields);
    saleDiscountInput?.addEventListener('input', updateSaleComputedFields);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const orderNumber = (saleOrderInput?.value || '').trim();
      const coupon = (saleCouponSelect?.value || '').trim();
      const date = saleDateInput?.value || '';
      const gross = Number(saleGrossInput?.value || 0);
      const discount = Number(saleDiscountInput?.value || 0);

      flagInvalidField(saleOrderInput, Boolean(orderNumber));
      flagInvalidField(saleCouponSelect, Boolean(coupon));
      flagInvalidField(saleDateInput, Boolean(date));
      flagInvalidField(saleGrossInput, Number.isFinite(gross) && gross >= 0);
      flagInvalidField(saleDiscountInput, Number.isFinite(discount) && discount >= 0 && discount <= gross);

      const hasInvalidNumbers = !Number.isFinite(gross) || gross < 0 || !Number.isFinite(discount) || discount < 0 || discount > gross;

      if (!orderNumber || !coupon || !date || hasInvalidNumbers) {
        setMessage(
          messageEl,
          'Verifique os campos da venda. Pedido é obrigatório e o desconto nao pode ser maior que o valor bruto.',
          'error'
        );
        focusFirstInvalidField(form);
        return;
      }

      const payload = { orderNumber, cupom: coupon, date, grossValue: gross, discount };
      const endpoint = saleEditingId ? `/sales/${saleEditingId}` : '/sales';
      const method = saleEditingId ? 'PUT' : 'POST';

      try {
        await apiFetch(endpoint, { method, body: payload });
        await loadSalesForInfluencer(currentSalesInfluencerId, { showStatus: false });
        setMessage(messageEl, saleEditingId ? 'Venda atualizada com sucesso.' : 'Venda registrada com sucesso.', 'success');
        resetSaleForm({ clearMessage: false });
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(messageEl, error.message || 'Nao foi possivel salvar a venda.', 'error');
      }
    });

    salesTableBody?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = button.closest('tr[data-id]');
      const id = Number(row?.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const action = button.dataset.action;
      if (action === 'edit') {
        const sale = sales.find((item) => item.id === id);
        if (!sale) return;
        saleEditingId = sale.id;
        form.dataset.mode = 'edit';
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Salvar venda';
        if (saleOrderInput) {
          const orderValue =
            sale.order_number != null
              ? String(sale.order_number)
              : sale.orderNumber != null
                ? String(sale.orderNumber)
                : '';
          saleOrderInput.value = orderValue;
        }
        if (saleCouponSelect) saleCouponSelect.value = sale.cupom || '';
        if (saleDateInput) saleDateInput.value = sale.date || '';
        if (saleGrossInput) saleGrossInput.value = sale.gross_value != null ? String(sale.gross_value) : '';
        if (saleDiscountInput) saleDiscountInput.value = sale.discount != null ? String(sale.discount) : '';
        updateSaleComputedFields();
        setMessage(messageEl, 'Editando venda selecionada.', 'info');
      } else if (action === 'delete') {
        if (!window.confirm('Deseja realmente excluir esta venda?')) return;
        (async () => {
          try {
            await apiFetch(`/sales/${id}`, { method: 'DELETE' });
            if (saleEditingId === id) resetSaleForm({ clearMessage: true });
            await loadSalesForInfluencer(currentSalesInfluencerId, { showStatus: false });
            setMessage(messageEl, 'Venda removida com sucesso.', 'success');
          } catch (error) {
            if (error.status === 401) {
              logout();
              return;
            }
            setMessage(messageEl, error.message || 'Nao foi possivel excluir a venda.', 'error');
          }
        })();
      }
    });

    cancelSaleEditButton?.addEventListener('click', () => {
      resetSaleForm({ clearMessage: true });
      setMessage(messageEl, 'Edicao de venda cancelada.', 'info');
    });

    reloadSalesButton?.addEventListener('click', () => {
      loadSalesForInfluencer(currentSalesInfluencerId, { showStatus: true });
    });

    analyzeSalesImportButton?.addEventListener('click', () => {
      if (!salesImportTextarea) return;
      analyzeSalesImportText(salesImportTextarea.value || '');
    });

    salesImportFileInput?.addEventListener('change', async (event) => {
      if (!salesImportTextarea) return;
      const file = event.target?.files?.[0];
      if (!file) {
        return;
      }

      resetSalesImport({ clearText: true, clearMessage: false });
      setMessage(salesImportMessage, 'Lendo arquivo selecionado...', 'info');

      try {
        const text = await file.text();
        const normalized = text.replace(/\r\n/g, '\n');
        if (!normalized.trim()) {
          setMessage(salesImportMessage, 'O arquivo selecionado nao possui dados para analisar.', 'info');
          return;
        }
        salesImportTextarea.value = normalized;
        await analyzeSalesImportText(normalized, {
          loadingMessage: 'Analisando pedidos do arquivo...'
        });
      } catch (error) {
        console.error('Erro ao ler arquivo de importacao:', error);
        setMessage(salesImportMessage, 'Nao foi possivel ler o arquivo selecionado.', 'error');
      } finally {
        event.target.value = '';
      }
    });

    confirmSalesImportButton?.addEventListener('click', async () => {
      if (!salesImportTextarea) return;
      const text = (lastImportText || salesImportTextarea.value || '').trim();
      if (!text) {
        setMessage(salesImportMessage, 'Analise os dados antes de confirmar a importacao.', 'info');
        updateImportConfirmState();
        return;
      }

      confirmSalesImportButton.setAttribute('disabled', 'disabled');
      setMessage(salesImportMessage, 'Salvando pedidos importados...', 'info');

      try {
        const result = await apiFetch('/sales/import/confirm', {
          method: 'POST',
          body: { text }
        });
        const ignoredMessage = result.ignored ? ` ${result.ignored} linha(s) foram ignoradas.` : '';
        setMessage(
          salesImportMessage,
          `Importacao concluida! ${result.inserted} venda(s) foram cadastradas.${ignoredMessage}`,
          'success'
        );
        resetSalesImport({ clearText: true, clearMessage: false });
        await loadSalesForInfluencer(currentSalesInfluencerId, { showStatus: true });
      } catch (error) {
        const analysis = error.data?.analysis;
        if (analysis) {
          lastImportAnalysis = analysis;
          renderSalesImportTable(analysis.rows);
          renderSalesImportSummary(analysis);
        }
        setMessage(
          salesImportMessage,
          error.message || 'Nao foi possivel concluir a importacao.',
          'error'
        );
      } finally {
        updateImportConfirmState();
      }
    });

    clearSalesImportButton?.addEventListener('click', () => {
      resetSalesImport({ clearText: true });
      setMessage(salesImportMessage, 'Area de importacao limpa.', 'info');
    });

    loadInfluencersForSales();
  };


  const initMasterScriptsPage = () => {
    if (!ensureAuth('master')) return;
    attachLogoutButtons();

    const form = document.getElementById('scriptForm');
    const formMessageEl = document.getElementById('scriptFormMessage');
    const listMessageEl = document.getElementById('scriptListMessage');
    const listContainer = document.getElementById('scriptList');

    const renderScriptManagementList = (scripts) => {
      if (!listContainer) return;
      listContainer.innerHTML = '';
      if (!Array.isArray(scripts) || scripts.length === 0) {
        return;
      }

      const fragment = document.createDocumentFragment();

      scripts.forEach((script) => {
        const item = document.createElement('article');
        item.className = 'script-management-item';

        const titleEl = document.createElement('h3');
        const rawTitle = toTrimmedString(script?.titulo ?? script?.title ?? '');
        titleEl.textContent = rawTitle || 'Roteiro sem título';
        item.appendChild(titleEl);

        const descriptionEl = document.createElement('div');
        descriptionEl.className = 'script-management-description rich-text';
        setRichTextContent(descriptionEl, script?.descricao ?? script?.description ?? '');
        item.appendChild(descriptionEl);

        const createdAt = script?.created_at ?? script?.createdAt ?? null;
        const updatedAt = script?.updated_at ?? script?.updatedAt ?? null;
        const hasDifferentDates = createdAt && updatedAt && createdAt !== updatedAt;
        const referenceDate = hasDifferentDates ? updatedAt : updatedAt || createdAt;

        if (referenceDate) {
          const meta = document.createElement('span');
          meta.className = 'script-meta';
          const label = hasDifferentDates ? 'Atualizado em' : 'Criado em';
          meta.textContent = `${label} ${formatDateTimeDetailed(referenceDate)}`;
          item.appendChild(meta);
        }

        fragment.appendChild(item);
      });

      listContainer.appendChild(fragment);
    };

    const loadScriptsList = async ({ showStatus = true } = {}) => {
      if (showStatus) {
        setMessage(listMessageEl, 'Carregando roteiros...', 'info');
      } else {
        setMessage(listMessageEl, '', '');
      }
      try {
        const scripts = await fetchScripts();
        renderScriptManagementList(scripts);
        if (!Array.isArray(scripts) || scripts.length === 0) {
          setMessage(listMessageEl, 'Nenhum roteiro cadastrado até o momento.', 'info');
        } else {
          setMessage(listMessageEl, '', '');
        }
      } catch (error) {
        renderScriptManagementList([]);
        setMessage(listMessageEl, error.message || 'Nao foi possivel carregar os roteiros.', 'error');
      }
    };

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const titleInput = form.elements.title || form.elements.titulo;
      const descriptionInput = form.elements.description || form.elements.descricao;

      const title = toTrimmedString(titleInput?.value || '');
      const description = toTrimmedString(descriptionInput?.value || '');

      if (!title || title.length < 3) {
        setMessage(formMessageEl, 'Informe um título com pelo menos 3 caracteres.', 'error');
        titleInput?.focus();
        return;
      }

      if (!description || description.length < 10) {
        setMessage(formMessageEl, 'Informe uma descrição com pelo menos 10 caracteres.', 'error');
        descriptionInput?.focus();
        return;
      }

      setMessage(formMessageEl, 'Salvando roteiro...', 'info');

      try {
        await createScript({ title, description });
        setMessage(formMessageEl, 'Roteiro cadastrado com sucesso!', 'success');
        form.reset();
        titleInput?.focus();
        await loadScriptsList({ showStatus: false });
      } catch (error) {
        setMessage(formMessageEl, error.message || 'Nao foi possivel cadastrar o roteiro.', 'error');
      }
    });

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

    const detailsEl = document.getElementById('influencerDetails');
    const greetingEl = document.getElementById('influencerGreeting');

    const salesMessageEl = document.getElementById('influencerSalesMessage');
    const salesSummaryEl = document.getElementById('influencerSalesSummary');
    const salesTableBody = document.querySelector('#influencerSalesTable tbody');

    const contractInfoEl = document.getElementById('influencerContractInfo');
    const contractMessageEl = document.getElementById('influencerContractMessage');
    const viewContractBtn = document.getElementById('viewSignedContractButton');
    const downloadContractBtn = document.getElementById('downloadSignedContractButton');

    const mainDashboardSection = document.getElementById('mainDashboard');
    const sectionNodes = Array.from(document.querySelectorAll('.influencer-section'));
    const dashboardOptions = document.querySelectorAll('.dashboard-option');
    const backButtons = document.querySelectorAll('.btn-back');
    const scriptsListEl = document.getElementById('influencerScriptsList');
    const scriptsMessageEl = document.getElementById('influencerScriptsMessage');
    const planCyclePeriodEl = document.getElementById('planCyclePeriod');
    const planScheduledCountEl = document.getElementById('planScheduledCount');
    const planValidatedCountEl = document.getElementById('planValidatedCount');
    const planMessageEl = document.getElementById('planMessage');
    const planEntriesListEl = document.getElementById('planEntriesList');

    const sectionsMap = sectionNodes.reduce((acc, section) => {
      if (section?.id) {
        acc[section.id] = section;
      }
      return acc;
    }, {});

    let scriptsLoaded = false;
    let scriptsLoading = false;

    const planStatusLabels = {
      scheduled: 'Pendente',
      validated: 'Validado',
      posted: 'Em validação',
      missed: 'Não entregue'
    };

    const planState = {
      cycle: null,
      plans: [],
      scripts: [],
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
      if (planCyclePeriodEl) {
        if (planState.cycle) {
          const month = String(planState.cycle.cycle_month).padStart(2, '0');
          planCyclePeriodEl.textContent = `${month}/${planState.cycle.cycle_year}`;
        } else {
          planCyclePeriodEl.textContent = '–';
        }
      }

      const plans = Array.isArray(planState.plans) ? planState.plans : [];
      const scheduledCount = plans.filter((plan) => plan.status === 'scheduled').length;
      const validatedCount = plans.filter((plan) => plan.status === 'validated').length;

      if (planScheduledCountEl) {
        planScheduledCountEl.textContent = String(scheduledCount);
      }
      if (planValidatedCountEl) {
        planValidatedCountEl.textContent = String(validatedCount);
      }
    };

    const renderPlanEntries = () => {
      if (!planEntriesListEl) return;
      planEntriesListEl.innerHTML = '';

      const plans = Array.isArray(planState.plans) ? planState.plans : [];
      if (!plans.length) {
        const empty = document.createElement('li');
        empty.className = 'plan-entry empty';
        empty.textContent = 'Nenhum agendamento cadastrado.';
        planEntriesListEl.appendChild(empty);
        return;
      }

      plans.forEach((plan) => {
        const item = document.createElement('li');
        item.className = 'plan-entry';

        const header = document.createElement('div');
        header.className = 'plan-entry-header';

        const dateEl = document.createElement('span');
        dateEl.className = 'plan-entry-date';
        dateEl.textContent = formatDateToBR(plan.scheduled_date);
        header.appendChild(dateEl);

        const statusEl = document.createElement('span');
        statusEl.className = 'plan-entry-status';
        statusEl.textContent = formatPlanStatus(plan.status);
        header.appendChild(statusEl);

        item.appendChild(header);

        const scriptInfo = document.createElement('div');
        scriptInfo.className = 'plan-entry-script';
        scriptInfo.textContent = plan.content_script_id
          ? `Roteiro: ${resolveScriptTitle(plan)}`
          : 'Roteiro: a definir';
        item.appendChild(scriptInfo);

        if (plan.notes) {
          const note = document.createElement('div');
          note.className = 'plan-entry-note';
          note.textContent = plan.notes;
          item.appendChild(note);
        }

        planEntriesListEl.appendChild(item);
      });
    };

    const renderScriptsList = (rows = planState.scripts) => {
      if (!scriptsListEl) return;
      scriptsListEl.innerHTML = '';

      const scripts = Array.isArray(rows) ? rows : [];
      if (!scripts.length) {
        return;
      }

      const fragment = document.createDocumentFragment();

      scripts.forEach((script, index) => {
        if (!script) return;
        const item = document.createElement('article');
        item.className = 'script-item';

        const headerButton = document.createElement('button');
        headerButton.type = 'button';
        headerButton.className = 'script-header';
        headerButton.setAttribute('aria-expanded', 'false');

        const titleSpan = document.createElement('span');
        titleSpan.className = 'script-title';
        const rawTitle = toTrimmedString(script?.titulo ?? script?.title ?? '');
        titleSpan.textContent = rawTitle || `Roteiro ${index + 1}`;
        headerButton.appendChild(titleSpan);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'script-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = '+';
        headerButton.appendChild(iconSpan);

        const content = document.createElement('div');
        content.className = 'script-content';
        content.hidden = true;

        const descriptionWrapper = document.createElement('div');
        descriptionWrapper.className = 'script-body rich-text';
        setRichTextContent(descriptionWrapper, script?.descricao ?? script?.description ?? '');
        content.appendChild(descriptionWrapper);

        const createdAt = script?.created_at ?? script?.createdAt ?? null;
        const updatedAt = script?.updated_at ?? script?.updatedAt ?? null;
        const hasDifferentDates = createdAt && updatedAt && createdAt !== updatedAt;
        const referenceDate = hasDifferentDates ? updatedAt : updatedAt || createdAt;
        if (referenceDate) {
          const meta = document.createElement('span');
          meta.className = 'script-meta';
          const label = hasDifferentDates ? 'Atualizado em' : 'Criado em';
          meta.textContent = `${label} ${formatDateTimeDetailed(referenceDate)}`;
          content.appendChild(meta);
        }

        const scheduledForScript = Array.isArray(planState.plans)
          ? planState.plans.filter((plan) => plan.content_script_id === script.id)
          : [];
        if (scheduledForScript.length) {
          const scheduledWrapper = document.createElement('div');
          scheduledWrapper.className = 'script-scheduled-dates';
          const label = document.createElement('span');
          label.textContent = 'Datas agendadas:';
          label.style.fontWeight = '600';
          scheduledWrapper.appendChild(label);
          scheduledForScript.forEach((plan) => {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = formatDateToBR(plan.scheduled_date);
            scheduledWrapper.appendChild(chip);
          });
          content.appendChild(scheduledWrapper);
        }

        const plannerHint = document.createElement('div');
        plannerHint.className = 'script-planner-hint';
        const plannerLink = document.createElement('a');
        plannerLink.className = 'link-button';
        plannerLink.href = 'influencer-plan.html';
        plannerLink.textContent = 'Abrir planejador para agendar';
        plannerHint.appendChild(plannerLink);
        content.appendChild(plannerHint);

        const contentId = `script-content-${script?.id ?? index}`;
        content.id = contentId;
        headerButton.setAttribute('aria-controls', contentId);

        headerButton.addEventListener('click', () => {
          const isOpen = item.classList.contains('open');
          scriptsListEl.querySelectorAll('.script-item.open').forEach((openItem) => {
            if (openItem === item) return;
            openItem.classList.remove('open');
            const openButton = openItem.querySelector('.script-header');
            const openContent = openItem.querySelector('.script-content');
            const openIcon = openItem.querySelector('.script-icon');
            openButton?.setAttribute('aria-expanded', 'false');
            if (openContent) openContent.hidden = true;
            if (openIcon) openIcon.textContent = '+';
          });

          if (isOpen) {
            item.classList.remove('open');
            headerButton.setAttribute('aria-expanded', 'false');
            content.hidden = true;
            iconSpan.textContent = '+';
          } else {
            item.classList.add('open');
            headerButton.setAttribute('aria-expanded', 'true');
            content.hidden = false;
            iconSpan.textContent = '–';
          }
        });

        item.appendChild(headerButton);
        item.appendChild(content);
        fragment.appendChild(item);
      });

      scriptsListEl.appendChild(fragment);
    };

    const loadPlan = async ({ silent = false } = {}) => {
      if (planState.loading) return;
      planState.loading = true;
      if (!silent) {
        setMessage(planMessageEl, 'Carregando sua agenda...', 'info');
      }
      try {
        const data = await apiFetch('/influencer/plan');
        planState.cycle = data?.cycle ?? null;
        planState.plans = Array.isArray(data?.plans) ? data.plans : [];
        planState.scripts = Array.isArray(data?.scripts) ? data.scripts : [];
        renderPlanOverview();
        renderPlanEntries();
        renderScriptsList(planState.scripts);
        scriptsLoaded = true;
        if (!silent) {
          setMessage(planMessageEl, '', '');
        }
        if (!planState.scripts.length) {
          setMessage(
            scriptsMessageEl,
            'Nenhum roteiro disponível por enquanto. Assim que houver novidades você verá tudo aqui. 💗',
            'info'
          );
        } else {
          setMessage(scriptsMessageEl, '', '');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        if (!silent) {
          setMessage(planMessageEl, error.message || 'Não foi possível carregar sua agenda.', 'error');
        }
        throw error;
      } finally {
        planState.loading = false;
      }
    };

    const loadScripts = async ({ force = false } = {}) => {
      if (!scriptsListEl || scriptsLoading) return;
      if (!force && scriptsLoaded && planState.scripts.length) {
        renderPlanOverview();
        renderPlanEntries();
        renderScriptsList(planState.scripts);
        return;
      }
      scriptsLoading = true;
      if (!force) {
        setMessage(scriptsMessageEl, 'Carregando roteiros...', 'info');
      }
      try {
        await loadPlan({ silent: true });
        if (!planState.scripts.length) {
          setMessage(
            scriptsMessageEl,
            'Nenhum roteiro disponível por enquanto. Assim que houver novidades você verá tudo aqui. 💗',
            'info'
          );
        } else {
          setMessage(scriptsMessageEl, '', '');
        }
      } catch (error) {
        if (error.status === 401) {
          logout();
          return;
        }
        setMessage(
          scriptsMessageEl,
          error.message || 'Nao foi possivel carregar os roteiros. Tente novamente em instantes.',
          'error'
        );
      } finally {
        scriptsLoading = false;
      }
    };

    const showSection = (sectionId = '') => {
      const targetId = sectionId && sectionsMap[sectionId] ? sectionId : '';

      if (mainDashboardSection) {
        if (!targetId) {
          mainDashboardSection.removeAttribute('hidden');
          mainDashboardSection.classList.add('active');
        } else {
          mainDashboardSection.setAttribute('hidden', '');
          mainDashboardSection.classList.remove('active');
        }
      }

      sectionNodes.forEach((section) => {
        if (!section) return;
        const isTarget = section.id === targetId;
        section.hidden = !isTarget;
        section.classList.toggle('active', isTarget);
      });

      if (!targetId) {
        return;
      }

      if (targetId === 'scriptsSection') {
        if (!scriptsLoaded && !scriptsLoading) {
          loadScripts();
        } else if (!planState.loading) {
          loadPlan({ silent: true }).catch(() => {});
        }
      }

      const targetSection = sectionsMap[targetId];
      if (targetSection) {
        targetSection.classList.add('active');
        window.requestAnimationFrame(() => {
          targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
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

    dashboardOptions.forEach((option) => {
      option.addEventListener('click', () => {
        const targetSection = option.dataset.section;
        if (targetSection) {
          showSection(targetSection);
        }
      });
    });

    backButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetSection = button.dataset.target;
        if (targetSection && targetSection !== 'main') {
          showSection(targetSection);
        } else {
          showSection('');
        }
        if (mainDashboardSection) {
          window.requestAnimationFrame(() => {
            mainDashboardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      });
    });

    showSection('');

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

    const renderSalesSummary = (rows) => {
      if (!salesSummaryEl) return;
      salesSummaryEl.innerHTML = '';
      if (!Array.isArray(rows) || rows.length === 0) {
        return;
      }

      const totalOrders = rows.length;
      const totalCommission = rows.reduce((sum, sale) => {
        const candidates = [
          sale.commission,
          sale.commission_value,
          sale.valor_comissao,
          sale.comissao,
          sale.commissionValue,
          sale.commissionAmount
        ];
        const commissionValue = candidates.find((candidate) => candidate != null && candidate !== '');
        return sum + parseToNumber(commissionValue);
      }, 0);

      const fragment = document.createDocumentFragment();

      const ordersMetric = document.createElement('div');
      ordersMetric.className = 'metric-card';
      const ordersLabel = document.createElement('h4');
      ordersLabel.textContent = 'Quantidade de vendas';
      const ordersValue = document.createElement('p');
      ordersValue.textContent = formatInteger(totalOrders);
      ordersMetric.appendChild(ordersLabel);
      ordersMetric.appendChild(ordersValue);
      fragment.appendChild(ordersMetric);

      const commissionMetric = document.createElement('div');
      commissionMetric.className = 'metric-card';
      const commissionLabel = document.createElement('h4');
      commissionLabel.textContent = 'Total de comissão';
      const commissionValueEl = document.createElement('p');
      commissionValueEl.textContent = formatCurrency(totalCommission);
      commissionMetric.appendChild(commissionLabel);
      commissionMetric.appendChild(commissionValueEl);
      fragment.appendChild(commissionMetric);

      salesSummaryEl.appendChild(fragment);
    };

    const renderSalesTable = (rows) => {
      if (!salesTableBody) return;
      salesTableBody.innerHTML = '';
      renderSalesSummary(rows);
      if (!Array.isArray(rows) || rows.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 4;
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

        const netCandidates = [
          sale.net_value,
          sale.netValue,
          sale.valor_liquido,
          sale.valorLiquidado,
          sale.net,
          sale.total_liquido,
          sale.valor,
          sale.value,
          sale.amount,
          sale.total,
          sale.gross_value
        ];
        const netRaw = netCandidates.find((candidate) => candidate != null && candidate !== '');
        const netDisplay = netRaw != null && netRaw !== '' ? formatCurrency(netRaw) : '-';

        const commissionCandidates = [
          sale.commission,
          sale.commission_value,
          sale.valor_comissao,
          sale.comissao,
          sale.commissionValue,
          sale.commissionAmount
        ];
        const commissionRaw = commissionCandidates.find((candidate) => candidate != null && candidate !== '');
        const commissionDisplay = commissionRaw != null && commissionRaw !== '' ? formatCurrency(commissionRaw) : '-';

        const cells = [
          { label: 'Número do pedido', value: orderDisplay },
          { label: 'Data', value: dateDisplay },
          { label: 'Valor líquido', value: netDisplay },
          { label: 'Comissão', value: commissionDisplay }
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
        setMessage(salesMessageEl, '', '');
        return;
      }
      setMessage(salesMessageEl, 'Carregando vendas...', 'info');
      try {
        const salesData = await apiFetch(`/sales/${influencerId}`);
        const rows = Array.isArray(salesData) ? salesData : [];
        renderSalesTable(rows);
        setMessage(salesMessageEl, '', '');
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
          setMessage(salesMessageEl, '', '');
          if (greetingEl) {
            greetingEl.textContent = 'Bem vinda, Pinklover.';
          }
          await loadContractRecord();
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
        if (!contractWaived) {
          setMessage(contractMessageEl, '', '');
        } else {
          applyContractWaiverState();
        }
        await loadInfluencerSales(influencer.id);
        await loadContractRecord();
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
        setContractButtonsEnabled(false);
        if (contractMessageEl) {
          setMessage(contractMessageEl, 'Não foi possível carregar o contrato assinado.', 'error');
        }
      }
    };

    enforceTermAcceptance().then(async (allowed) => {
      if (!allowed) return;
      await loadInfluencer();
    });
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
      'master-scripts': initMasterScriptsPage,
      influencer: initInfluencerPage,
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
