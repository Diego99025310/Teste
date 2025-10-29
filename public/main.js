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

  const htmlToPlainText = (value = '', { preserveLineBreaks = false } = {}) => {
    if (value == null || value === '') {
      return '';
    }

    let text = String(value).replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');

    if (preserveLineBreaks) {
      text = text
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
    } else {
      text = text.replace(/<br\s*\/?>/gi, ' ');
    }

    text = text.replace(/<[^>]+>/g, preserveLineBreaks ? '\n' : ' ');

    if (preserveLineBreaks) {
      return text.replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+\\n/g, '\\n').trim();
    }

    return text.replace(/\\s+/g, ' ').trim();
  };

  const htmlToTextareaValue = (value = '') => htmlToPlainText(value, { preserveLineBreaks: true });

  const buildScriptPreview = (sections = [], maxLength = 200) => {
    const source = Array.isArray(sections) ? sections : [sections];
    const plainText = source
      .filter((section) => section)
      .map((section) => htmlToPlainText(section))
      .filter((section) => section && section.trim().length > 0)
      .join(' ')
      .trim();

    if (!plainText) return '';
    if (plainText.length <= maxLength) {
      return plainText;
    }
    return `${plainText.slice(0, maxLength - 1).trim()}…`;
  };

  const createSectionElement = (label, html, { optional = false } = {}) => {
    const section = document.createElement('section');
    section.className = 'script-section';

    const titleEl = document.createElement('h4');
    titleEl.className = 'script-section__title';
    titleEl.textContent = label;
    section.appendChild(titleEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'script-section__content rich-text';
    if (html) {
      setRichTextContent(contentEl, html);
    } else if (!optional) {
      const emptyParagraph = document.createElement('p');
      emptyParagraph.textContent = 'Sem conteúdo informado.';
      contentEl.appendChild(emptyParagraph);
    }
    section.appendChild(contentEl);

    return section;
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

  const parseToNumberOrNull = (value) => {
    if (value == null || value === '') {
      return null;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/\./g, '').replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatCurrency = (value) => currencyFormatter.format(parseToNumber(value));

  const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const formatInteger = (value) => integerFormatter.format(parseToNumber(value));

  const formatMultiplierDisplay = (value) => {
    const numeric = parseToNumberOrNull(value);
    if (numeric == null) return '–';
    if (Number.isInteger(numeric)) {
      return `${numeric}x`;
    }
    return `${numeric.toFixed(2).replace('.', ',')}x`;
  };

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
      const totalPoints = Number(summary.total_points || 0);
      const totalValue = Number(summary.total_points_value || 0);
      metrics.push(
        {
          label: 'Pontos acumulados',
          value: formatInteger(totalPoints),
          helper: 'Antes do multiplicador',
          icon: 'revenue'
        },
        {
          label: 'Valor estimado',
          value: formatCurrency(totalValue),
          helper: `Cada ponto vale ${formatCurrency(POINT_VALUE_BRL)}`,
          icon: 'commission'
        }
      );
    }

    return metrics;
  };

  const session = {
    get token() {
      const sessionToken = getStorageItem(storage, storageKeys.token);
      const persistentToken = getStorageItem(persistentStorage, storageKeys.token);
      const token = sessionToken || persistentToken || null;

      if (token) {
        if (sessionToken !== token) {
          setStorageItem(storage, storageKeys.token, token);
        }
        if (persistentToken !== token) {
          setStorageItem(persistentStorage, storageKeys.token, token);
        }
      }

      return token;
    },
    set token(value) {
      if (value) {
        setStorageItem(storage, storageKeys.token, value);
        setStorageItem(persistentStorage, storageKeys.token, value);
      } else {
        removeStorageItem(storage, storageKeys.token);
        removeStorageItem(persistentStorage, storageKeys.token);
      }
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
      Object.values(storageKeys).forEach((key) => {
        removeStorageItem(storage, key);
        removeStorageItem(persistentStorage, key);
      });
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
    const hideOnSuccess = element.dataset.hideOnSuccess === 'true';
    const shouldAutoHide =
      element.dataset.autoHide === 'true' ||
      element.hasAttribute('data-auto-hide') ||
      element.hasAttribute('hidden');
    const shouldStayHidden = hideOnSuccess && type === 'success';
    if (shouldAutoHide || hideOnSuccess) {
      if (hasContent && !shouldStayHidden) {
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

  const createScript = async ({
    title,
    duration,
    context,
    task,
    importantPoints,
    closing,
    additionalNotes
  }) =>
    apiFetch('/scripts', {
      method: 'POST',
      body: {
        title,
        duration,
        context,
        task,
        importantPoints,
        closing,
        additionalNotes
      }
    });

  const updateScript = async ({
    id,
    title,
    duration,
    context,
    task,
    importantPoints,
    closing,
    additionalNotes
  }) => {
    const scriptId = Number(id);
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      throw new Error('Identificador de roteiro invalido.');
    }
    return apiFetch(`/scripts/${scriptId}`, {
      method: 'PUT',
      body: {
        title,
        duration,
        context,
        task,
        importantPoints,
        closing,
        additionalNotes
      }
    });
  };

  const deleteScript = async (id) => {
    const scriptId = Number(id);
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      throw new Error('Identificador de roteiro invalido.');
    }
    return apiFetch(`/scripts/${scriptId}`, { method: 'DELETE' });
  };

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
    const salePointsInput =
      form?.elements.points || form?.elements.pontos || form?.elements.salePoints || null;
    const salePointsValueInput =
      form?.elements.pointsValue || form?.elements.points_value || form?.elements.valor || null;
    const cancelSaleEditButton = document.getElementById('cancelSaleEditButton');
    const reloadSalesButton = document.getElementById('reloadSalesButton');
    const salesTableBody = document.querySelector('#salesTable tbody');
    const salesSummaryEl = document.getElementById('salesSummary');
    const saleItemsTableBody = document.querySelector('#saleItemsTable tbody');
    const addSaleItemButton = document.getElementById('addSaleItemButton');
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
    let skuCatalog = [];
    let saleItems = [];
    let nextSaleItemId = 1;
    let lastImportText = '';
    let lastImportAnalysis = null;

    const getInfluencerByCoupon = (coupon) => {
      if (!coupon) return undefined;
      const normalized = coupon.trim().toLowerCase();
      return influencers.find((item) => (item.cupom || '').trim().toLowerCase() === normalized);
    };

    const updateSaleComputedFields = () => {
      if (!salePointsInput || !salePointsValueInput) return;
      const totalPoints = saleItems.reduce(
        (sum, item) => sum + (Number.isFinite(Number(item.points)) ? Number(item.points) : 0),
        0
      );
      if (totalPoints > 0) {
        salePointsInput.value = String(totalPoints);
        salePointsValueInput.value = (totalPoints * POINT_VALUE_BRL).toFixed(2);
      } else {
        salePointsInput.value = '';
        salePointsValueInput.value = '';
      }
    };

    const findSkuByCode = (code) => {
      if (!code) return null;
      const normalized = String(code).trim().toLowerCase();
      return (
        skuCatalog.find((entry) => String(entry?.sku || '').trim().toLowerCase() === normalized) || null
      );
    };

    const updateAddItemButtonState = () => {
      if (!addSaleItemButton) return;
      const hasActiveSku = skuCatalog.some((entry) => entry && entry.active);
      addSaleItemButton.disabled = !hasActiveSku;
    };

    const recalcSaleItem = (item) => {
      if (!item) return;
      const quantityNumber = Number(item.quantity);
      item.quantity = Number.isFinite(quantityNumber) && quantityNumber > 0 ? Math.round(quantityNumber) : 0;
      const pointsPerUnitNumber = Number(item.pointsPerUnit);
      item.pointsPerUnit =
        Number.isFinite(pointsPerUnitNumber) && pointsPerUnitNumber >= 0
          ? Math.round(pointsPerUnitNumber)
          : 0;
      item.points = item.quantity > 0 && item.pointsPerUnit > 0 ? item.quantity * item.pointsPerUnit : 0;
    };

    const applySkuToItem = (item, skuCode) => {
      if (!item) return;
      const trimmedSku = typeof skuCode === 'string' ? skuCode.trim() : '';
      item.sku = trimmedSku;
      const skuInfo = findSkuByCode(trimmedSku);
      if (skuInfo) {
        item.description = skuInfo.description || '';
        item.pointsPerUnit = Number(skuInfo.points_per_unit ?? skuInfo.pointsPerUnit ?? 0);
      } else {
        item.description = '';
      }
      if (!item.quantity || item.quantity <= 0) {
        item.quantity = 1;
      }
      recalcSaleItem(item);
    };

    const createSaleItem = (overrides = {}) => {
      const item = {
        id: nextSaleItemId,
        sku: '',
        description: '',
        quantity: 1,
        pointsPerUnit: 0,
        points: 0,
        ...overrides
      };
      nextSaleItemId += 1;

      if (item.sku) {
        const skuInfo = findSkuByCode(item.sku);
        if (skuInfo) {
          if (!overrides.description) {
            item.description = skuInfo.description || '';
          }
          if (overrides.pointsPerUnit == null) {
            item.pointsPerUnit = Number(skuInfo.points_per_unit ?? skuInfo.pointsPerUnit ?? 0);
          }
        }
      }

      if (overrides.pointsPerUnit != null) {
        item.pointsPerUnit = Number(overrides.pointsPerUnit);
      }

      recalcSaleItem(item);

      if (overrides.points != null && Number.isFinite(Number(overrides.points))) {
        item.points = Number(overrides.points);
      }

      return item;
    };

    const renderSaleItemsTable = () => {
      if (!saleItemsTableBody) return;
      saleItemsTableBody.innerHTML = '';

      if (!saleItems.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
        emptyCell.className = 'empty';
        emptyCell.textContent = skuCatalog.some((entry) => entry && entry.active)
          ? 'Nenhum item adicionado.'
          : 'Cadastre os SKUs para adicionar itens.';
        emptyRow.appendChild(emptyCell);
        saleItemsTableBody.appendChild(emptyRow);
        updateSaleComputedFields();
        return;
      }

      const activeSkus = skuCatalog.filter((entry) => entry && entry.active);
      const fragment = document.createDocumentFragment();

      saleItems.forEach((item) => {
        const tr = document.createElement('tr');
        tr.dataset.id = String(item.id);

        const skuTd = document.createElement('td');
        const skuSelect = document.createElement('select');
        skuSelect.innerHTML = '<option value="">Selecione</option>';
        activeSkus
          .slice()
          .sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || '')))
          .forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.sku;
            option.textContent = entry.sku;
            skuSelect.appendChild(option);
          });
        if (item.sku && !activeSkus.some((entry) => entry.sku === item.sku)) {
          const inactiveOption = document.createElement('option');
          inactiveOption.value = item.sku;
          inactiveOption.textContent = `${item.sku} (inativo)`;
          inactiveOption.disabled = true;
          skuSelect.appendChild(inactiveOption);
        }
        skuSelect.value = item.sku || '';
        skuTd.appendChild(skuSelect);

        const descriptionTd = document.createElement('td');
        const quantityTd = document.createElement('td');
        const pointsPerUnitTd = document.createElement('td');
        const pointsTd = document.createElement('td');

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.step = '1';
        qtyInput.value = item.quantity > 0 ? String(item.quantity) : '';
        quantityTd.appendChild(qtyInput);

        const actionsTd = document.createElement('td');
        actionsTd.className = 'actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'Remover';
        actionsTd.appendChild(removeButton);

        const updateRowDisplay = () => {
          const skuInfo = findSkuByCode(item.sku);
          const description = item.description || skuInfo?.description || '';
          descriptionTd.textContent = description || '-';
          pointsPerUnitTd.textContent = item.pointsPerUnit ? formatInteger(item.pointsPerUnit) : '-';
          pointsTd.textContent = item.points ? formatInteger(item.points) : '0';
        };

        skuSelect.addEventListener('change', () => {
          applySkuToItem(item, skuSelect.value);
          if (item.quantity <= 0) {
            item.quantity = 1;
            qtyInput.value = '1';
          }
          updateRowDisplay();
          updateSaleComputedFields();
        });

        qtyInput.addEventListener('input', () => {
          const value = Number(qtyInput.value);
          if (Number.isFinite(value) && value > 0) {
            item.quantity = Math.round(value);
          } else {
            item.quantity = 0;
          }
          recalcSaleItem(item);
          updateRowDisplay();
          updateSaleComputedFields();
        });

        removeButton.addEventListener('click', () => {
          saleItems = saleItems.filter((entry) => entry.id !== item.id);
          renderSaleItemsTable();
          updateSaleComputedFields();
        });

        tr.appendChild(skuTd);
        tr.appendChild(descriptionTd);
        tr.appendChild(quantityTd);
        tr.appendChild(pointsPerUnitTd);
        tr.appendChild(pointsTd);
        tr.appendChild(actionsTd);

        updateRowDisplay();

        fragment.appendChild(tr);
      });

      saleItemsTableBody.appendChild(fragment);
      updateSaleComputedFields();
    };

    const resetSaleItems = () => {
      saleItems = [];
      nextSaleItemId = 1;
      renderSaleItemsTable();
      updateSaleComputedFields();
    };

    const setSaleItemsFromDetails = (details) => {
      nextSaleItemId = 1;
      saleItems = [];
      if (Array.isArray(details) && details.length) {
        details.forEach((detail) => {
          const item = createSaleItem({
            sku: detail.sku,
            quantity: Number(detail.quantity ?? detail.qty ?? detail.quantidade) || 1,
            pointsPerUnit: Number(detail.points_per_unit ?? detail.pointsPerUnit ?? detail.unitPoints ?? 0),
            points: Number(detail.points ?? detail.totalPoints ?? detail.pontos ?? 0)
          });
          saleItems.push(item);
        });
      }
      renderSaleItemsTable();
      updateSaleComputedFields();
    };

    const getSaleItemsPayload = () =>
      saleItems
        .filter((item) => item && item.sku && item.quantity > 0)
        .map((item) => ({ sku: item.sku, quantity: item.quantity }));

    const validateSaleItems = () => {
      if (!saleItems.length) {
        return { valid: false, message: 'Adicione ao menos um item com SKU cadastrado.' };
      }
      for (const item of saleItems) {
        if (!item.sku) {
          return { valid: false, message: 'Informe o SKU de todos os itens da venda.' };
        }
        if (!item.quantity || item.quantity <= 0) {
          return { valid: false, message: 'Informe uma quantidade válida para cada item.' };
        }
        if (!findSkuByCode(item.sku)) {
          return {
            valid: false,
            message: `O SKU ${item.sku} não está cadastrado ou está inativo. Ajuste os itens antes de salvar.`
          };
        }
      }
      return { valid: true };
    };

    const loadSkuCatalog = async () => {
      try {
        const rows = await apiFetch('/sku-points');
        skuCatalog = Array.isArray(rows)
          ? rows.map((row) => ({
              ...row,
              points_per_unit: Number(row.points_per_unit ?? row.pointsPerUnit ?? 0)
            }))
          : [];
      } catch (error) {
        skuCatalog = [];
        setMessage(
          messageEl,
          error?.message || 'Nao foi possivel carregar os SKUs cadastrados. Verifique e tente novamente.',
          'error'
        );
      }
      updateAddItemButtonState();
      renderSaleItemsTable();
    };

    const renderSalesTable = () => {
      if (!salesTableBody) return;
      salesTableBody.innerHTML = '';
      if (!Array.isArray(sales) || sales.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
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
          formatInteger(sale.points),
          formatCurrency(sale.points_value ?? sale.pointsValue ?? 0)
        ];
        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        if (Array.isArray(sale.sku_details) && sale.sku_details.length) {
          const summary = sale.sku_details
            .map((detail) => {
              const quantity = Number(detail.quantity ?? detail.qty ?? detail.quantidade ?? 0);
              return `${detail.sku || '-'} × ${formatInteger(quantity)}`;
            })
            .join('; ');
          tr.title = `SKUs: ${summary}`;
        }
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
        emptyCell.colSpan = 7;
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
        const pointsToDisplay = isValid
          ? formatInteger(row.points)
          : row.rawPoints || (row.rawPoints === '' ? '0' : '-');
        const valueToDisplay = isValid
          ? formatCurrency(row.points_value ?? row.pointsValue ?? (Number(row.points || 0) * POINT_VALUE_BRL))
          : '-';

        const cells = [
          row.orderNumber || '-',
          row.cupom || '-',
          dateToDisplay,
          pointsToDisplay,
          valueToDisplay
        ];

        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value == null || value === '' ? '-' : String(value);
          tr.appendChild(td);
        });

        const observationsTd = document.createElement('td');
        const messages = [];
        if (row.errors?.length) {
          messages.push(row.errors.join(' '));
        }
        const skuDetailsSummary = Array.isArray(row.skuDetails) && row.skuDetails.length
          ? row.skuDetails
              .map((detail) => {
                const quantity =
                  detail.quantity != null
                    ? formatInteger(detail.quantity)
                    : detail.quantityRaw != null
                      ? String(detail.quantityRaw)
                      : '?';
                const pointsValue =
                  detail.points != null
                    ? `${formatInteger(detail.points)} pts`
                    : detail.pointsPerUnit != null && detail.quantity != null
                      ? `${formatInteger(detail.quantity * detail.pointsPerUnit)} pts`
                      : '?';
                return `${detail.sku || '(sem SKU)'} × ${quantity} (${pointsValue})`;
              })
              .join('; ')
          : null;
        if (skuDetailsSummary) {
          messages.push(`SKUs: ${skuDetailsSummary}`);
        }
        if (!messages.length) {
          observationsTd.textContent = '-';
        } else {
          observationsTd.innerHTML = '';
          messages.forEach((text, index) => {
            const block = document.createElement('div');
            block.textContent = text;
            if (index > 0) block.className = 'note';
            observationsTd.appendChild(block);
          });
        }
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
        summaryItems.push(`Pontos acumulados: ${formatInteger(analysis.summary?.total_points || 0)}`);
        summaryItems.push(
          `Valor estimado: ${formatCurrency(analysis.summary?.total_points_value || 0)}`
        );
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
          const summaryPoints = parseToNumber(analysis.summary?.total_points ?? 0);
          const summaryValue = parseToNumber(
            analysis.summary?.total_points_value ?? summaryPoints * POINT_VALUE_BRL
          );
          setMessage(
            salesImportMessage,
            `Todos os ${analysis.validCount} pedidos estao prontos para importacao. Pontos acumulados: ${formatInteger(
              summaryPoints
            )} (≈ ${formatCurrency(summaryValue)}).`,
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
      if (salePointsValueInput) salePointsValueInput.value = '';
      if (salePointsInput) salePointsInput.value = '';
      resetSaleItems();
      form.dataset.mode = 'create';
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Registrar venda';
      form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
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
        resetSaleForm({ clearMessage: false, keepCoupon: false });
        renderSalesTable();
        renderSalesSummary(null, { totalSales: 0 });
        setMessage(messageEl, 'Selecione um cupom para visualizar e registrar as vendas.', 'info');
        return;
      }
      currentSalesInfluencerId = influencer.id;
      resetSaleForm({ clearMessage: false, keepCoupon: true });
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
    addSaleItemButton?.addEventListener('click', () => {
      if (!skuCatalog.some((entry) => entry && entry.active)) {
        setMessage(
          messageEl,
          'Cadastre ao menos um SKU ativo para adicionar itens à venda.',
          'warning'
        );
        return;
      }
      saleItems.push(createSaleItem());
      renderSaleItemsTable();
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form) return;

      const orderNumber = (saleOrderInput?.value || '').trim();
      const coupon = (saleCouponSelect?.value || '').trim();
      const date = saleDateInput?.value || '';

      flagInvalidField(saleOrderInput, Boolean(orderNumber));
      flagInvalidField(saleCouponSelect, Boolean(coupon));
      flagInvalidField(saleDateInput, Boolean(date));

      const { valid: itemsValid, message: itemsError } = validateSaleItems();

      if (!orderNumber || !coupon || !date || !itemsValid) {
        if (!itemsValid && itemsError) {
          setMessage(messageEl, itemsError, 'error');
        } else {
          setMessage(
            messageEl,
            'Verifique os campos da venda. Pedido, cupom, data e itens com SKU são obrigatórios.',
            'error'
          );
        }
        focusFirstInvalidField(form);
        return;
      }

      const itemsPayload = getSaleItemsPayload();
      if (!itemsPayload.length) {
        setMessage(
          messageEl,
          'Adicione ao menos um item com quantidade válida antes de salvar a venda.',
          'error'
        );
        return;
      }

      const totalPoints = saleItems.reduce(
        (sum, item) => sum + (Number.isFinite(Number(item.points)) ? Number(item.points) : 0),
        0
      );

      const payload = { orderNumber, cupom: coupon, date, items: itemsPayload, points: totalPoints };
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
        if (salePointsInput) salePointsInput.value = '';
        const details = Array.isArray(sale.sku_details)
          ? sale.sku_details
          : Array.isArray(sale.skuDetails)
            ? sale.skuDetails
            : [];
        setSaleItemsFromDetails(details);
        if (!details.length) {
          setMessage(
            messageEl,
            'Venda sem detalhamento de SKUs. Adicione os itens antes de salvar.',
            'warning'
          );
        } else {
          setMessage(messageEl, 'Editando venda selecionada.', 'info');
        }
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

    const initialize = async () => {
      await loadSkuCatalog();
      await loadInfluencersForSales();
    };

    initialize();

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
    const cancelEditButton = document.getElementById('cancelScriptEditButton');
    const newScriptShortcutButton = document.getElementById('newScriptShortcutButton');
    const submitButton = form?.querySelector('button[type="submit"]');

    const titleInput = form?.elements.title || form?.elements.titulo || null;
    const durationInput = form?.elements.duration || form?.elements.duracao || null;
    const contextInput = form?.elements.context || form?.elements.contexto || null;
    const taskInput = form?.elements.task || form?.elements.tarefa || null;
    const importantPointsInput =
      form?.elements.importantPoints || form?.elements.pontos_importantes || null;
    const closingInput = form?.elements.closing || form?.elements.finalizacao || null;
    const notesInput = form?.elements.additionalNotes || form?.elements.notas_adicionais || null;

    addRealtimeValidation(form);

    let cachedScripts = [];
    let editingScriptId = null;
    const scriptExpansionState = new Map();

    const normalizeScriptRecord = (script) => {
      const id = Number(script?.id ?? script?.script_id ?? script?.scriptId);
      if (!Number.isInteger(id) || id <= 0) return null;

      const rawTitle = toTrimmedString(script?.titulo ?? script?.title ?? '');
      const durationHtml = script?.duracao ?? script?.duration ?? '';
      const contextHtml = script?.contexto ?? script?.context ?? '';
      const taskHtml = script?.tarefa ?? script?.task ?? '';
      const importantPointsHtml =
        script?.pontos_importantes ?? script?.importantPoints ?? script?.important_points ?? '';
      const closingHtml = script?.finalizacao ?? script?.closing ?? '';
      const notesHtml =
        script?.notas_adicionais ?? script?.additionalNotes ?? script?.notes ?? '';

      const preview =
        toTrimmedString(script?.preview ?? '') ||
        buildScriptPreview([contextHtml, taskHtml, importantPointsHtml, closingHtml]);

      return {
        id,
        title: rawTitle || 'Roteiro sem título',
        rawTitle,
        duration: durationHtml,
        context: contextHtml,
        task: taskHtml,
        importantPoints: importantPointsHtml,
        closing: closingHtml,
        additionalNotes: notesHtml,
        durationText: htmlToPlainText(durationHtml) || '',
        contextText: htmlToTextareaValue(contextHtml),
        taskText: htmlToTextareaValue(taskHtml),
        importantPointsText: htmlToTextareaValue(importantPointsHtml),
        closingText: htmlToTextareaValue(closingHtml),
        additionalNotesText: htmlToTextareaValue(notesHtml),
        preview,
        createdAt: script?.created_at ?? script?.createdAt ?? null,
        updatedAt: script?.updated_at ?? script?.updatedAt ?? null
      };
    };

    const applyScriptExpansionToItem = (item, script, expanded) => {
      if (!item || !script) return;
      item.dataset.expanded = expanded ? 'true' : 'false';
      const toggleButton = item.querySelector('.script-management-toggle');
      if (toggleButton instanceof HTMLButtonElement) {
        toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggleButton.setAttribute(
          'aria-label',
          `${expanded ? 'Recolher' : 'Expandir'} detalhes do roteiro ${script.title}`
        );
      }
    };

    const updateScriptExpansion = (script, expanded) => {
      if (!script) return;
      scriptExpansionState.set(script.id, expanded);
      const item = listContainer?.querySelector(
        `.script-management-item[data-id='${String(script.id)}']`
      );
      if (item) {
        applyScriptExpansionToItem(item, script, expanded);
      }
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
          const meta = document.createElement('span');
          meta.className = 'script-meta';
          const createdAt = script.createdAt ? formatDateTimeDetailed(script.createdAt) : null;
          const updatedAt =
            script.updatedAt && script.updatedAt !== script.createdAt
              ? formatDateTimeDetailed(script.updatedAt)
              : null;
          meta.textContent = updatedAt
            ? `Atualizado em ${updatedAt}`
            : createdAt
            ? `Criado em ${createdAt}`
            : '';
          if (meta.textContent) {
            bodyInner.appendChild(meta);
          }
        }

        body.appendChild(bodyInner);
        item.appendChild(body);

        const storedExpanded = scriptExpansionState.get(script.id);
        const expanded = editingScriptId === script.id || storedExpanded === true;
        scriptExpansionState.set(script.id, expanded);
        applyScriptExpansionToItem(item, script, expanded);

        fragment.appendChild(item);
      });

      listContainer.appendChild(fragment);
    };

    const loadScriptsList = async ({ showStatus = true } = {}) => {
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
          const wasExpanded =
            editingScriptId === script.id || previousExpansion.get(script.id) === true;
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
      ].forEach((input) => input?.removeAttribute('aria-invalid'));
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
