# INSTRUÇÕES PARA MELHORIA DO AGENDAMENTO DE ROTEIROS - HIDRAPINK

## CONTEXTO DO PROJETO
Sistema HidraPink para gestão de influenciadoras com backend Node.js + Express + SQLite.
Repositório: https://github.com/Diego99025310/Teste

## OBJETIVO
Melhorar a interface de agendamento de roteiros (content planning) para influenciadoras, com foco em **mobile-first** (95% dos usuários usam celular), mantendo responsividade para desktop.

## FLUXO ATUAL
- GET /influencer/plan → retorna ciclo mensal + roteiros disponíveis
- POST /influencer/plan → envia agendamentos
- PUT /influencer/plan/:id → edita agendamento específico

## FLUXO PROPOSTO (MOBILE-FIRST)

### Tela Principal de Agendamento
1. **Lista vertical de roteiros** disponíveis (scroll infinito)
2. Cada card de roteiro mostra:
   - Título do roteiro
   - Preview do conteúdo (primeiras 2 linhas)
   - Botão grande "📅 Agendar" (se não agendado)
   - Data agendada + botão "Editar" (se já agendado)
3. **Botão fixo no rodapé**: "Salvar Agendamentos" (verde, sempre visível)
4. Ao clicar "Agendar":
   - Abre date picker nativo do navegador (input type="date")
   - Usuária seleciona data
   - Card atualiza visualmente mostrando a data escolhida
5. Ao clicar "Salvar Agendamentos":
   - Envia todos os agendamentos via POST /influencer/plan (batch)
   - Mostra feedback de sucesso/erro

---

## CÓDIGO SUGERIDO

### 1. HTML - influencer-plan.html

\`\`\`html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>Agendar Roteiros - HidraPink</title>
    <link rel="stylesheet" href="/styles/plan.css">
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <h1>Agendamento de Roteiros</h1>
            <p class="subtitle">Ciclo: <span id="cycle-name">Carregando...</span></p>
        </header>

        <!-- Filtros rápidos (opcional, mas útil) -->
        <div class="filters">
            <button class="filter-btn active" data-filter="all">Todos</button>
            <button class="filter-btn" data-filter="scheduled">Agendados</button>
            <button class="filter-btn" data-filter="available">Disponíveis</button>
        </div>

        <!-- Lista de Roteiros -->
        <div id="roteiros-list" class="roteiros-list">
            <!-- Cards serão injetados via JS -->
        </div>

        <!-- Mensagem de lista vazia -->
        <div id="empty-state" class="empty-state" style="display: none;">
            <p>📋 Nenhum roteiro disponível no momento</p>
        </div>

        <!-- Botão flutuante de salvar -->
        <button id="save-btn" class="save-btn" style="display: none;">
            <span class="save-icon">💾</span>
            <span class="save-text">Salvar Agendamentos</span>
        </button>
    </div>

    <!-- Input de data oculto (reutilizável) -->
    <input type="date" id="date-picker" style="display: none;">

    <script src="/main.js"></script>
    <script src="/scripts/plan.js"></script>
</body>
</html>
\`\`\`

---

### 2. CSS - styles/plan.css

\`\`\`css
/* Reset e configurações base */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: #f5f5f5;
    color: #333;
    padding-bottom: 80px; /* Espaço para botão fixo */
}

.container {
    max-width: 100%;
    margin: 0 auto;
}

/* Header */
.header {
    background: linear-gradient(135deg, #FF69B4 0%, #FF1493 100%);
    color: white;
    padding: 20px 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.header h1 {
    font-size: 22px;
    margin-bottom: 4px;
}

.subtitle {
    font-size: 14px;
    opacity: 0.9;
}

/* Filtros */
.filters {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: white;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}

.filter-btn {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 20px;
    background: white;
    color: #666;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-btn.active {
    background: #FF69B4;
    color: white;
    border-color: #FF69B4;
}

/* Lista de roteiros */
.roteiros-list {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

/* Card de roteiro */
.roteiro-card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.2s, box-shadow 0.2s;
}

.roteiro-card:active {
    transform: scale(0.98);
}

.roteiro-card.scheduled {
    border-left: 4px solid #4CAF50;
}

.roteiro-card.pending {
    border-left: 4px solid #FF9800;
}

.roteiro-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.roteiro-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
    flex: 1;
}

.roteiro-badge {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 12px;
    background: #e3f2fd;
    color: #1976d2;
    white-space: nowrap;
    margin-left: 8px;
}

.roteiro-preview {
    font-size: 14px;
    color: #666;
    line-height: 1.5;
    margin-bottom: 16px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.roteiro-actions {
    display: flex;
    gap: 8px;
}

/* Botões de ação */
.btn-primary {
    flex: 1;
    padding: 14px 20px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px; /* Área mínima de toque */
}

.btn-schedule {
    background: #FF69B4;
    color: white;
}

.btn-schedule:active {
    background: #FF1493;
    transform: scale(0.97);
}

.btn-scheduled {
    background: #4CAF50;
    color: white;
}

.btn-edit {
    flex: 0 0 auto;
    padding: 14px 20px;
    background: #f5f5f5;
    color: #666;
    border: 1px solid #ddd;
}

.btn-edit:active {
    background: #e0e0e0;
}

.scheduled-date {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: #e8f5e9;
    border-radius: 8px;
    margin-bottom: 12px;
}

.scheduled-date-text {
    flex: 1;
    font-size: 14px;
    color: #2e7d32;
    font-weight: 500;
}

/* Botão flutuante de salvar */
.save-btn {
    position: fixed;
    bottom: 20px;
    left: 16px;
    right: 16px;
    padding: 16px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    z-index: 1000;
    animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
    from {
        transform: translateY(100px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.save-btn:active {
    transform: scale(0.97);
    background: #45a049;
}

.save-icon {
    font-size: 24px;
}

/* Estado vazio */
.empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #999;
    font-size: 16px;
}

/* Loading spinner */
.loading {
    text-align: center;
    padding: 40px;
    color: #999;
}

/* Toast de feedback */
.toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2000;
    animation: fadeInOut 3s ease-in-out;
}

.toast.success {
    background: #4CAF50;
}

.toast.error {
    background: #f44336;
}

@keyframes fadeInOut {
    0%, 100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    10%, 90% { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* RESPONSIVIDADE DESKTOP */
@media (min-width: 768px) {
    .container {
        max-width: 768px;
    }

    .header h1 {
        font-size: 28px;
    }

    .roteiros-list {
        padding: 24px;
        gap: 20px;
    }

    .roteiro-card {
        padding: 20px;
    }

    .roteiro-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }

    .save-btn {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        max-width: 400px;
    }

    .save-btn:hover {
        background: #45a049;
        transform: translateX(-50%) translateY(-2px);
        box-shadow: 0 6px 16px rgba(76, 175, 80, 0.5);
    }
}

@media (min-width: 1024px) {
    .container {
        max-width: 900px;
    }

    .roteiros-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
    }
}
\`\`\`

---

### 3. JAVASCRIPT - scripts/plan.js

\`\`\`javascript
// Estado da aplicação
let currentCycle = null;
let roteiros = [];
let scheduledItems = {}; // {roteiroId: date}
let pendingChanges = false;

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    await loadPlanData();
    setupEventListeners();
});

// Carregar dados do backend
async function loadPlanData() {
    try {
        showLoading();

        const response = await fetch('/api/influencer/plan', {
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Erro ao carregar dados');

        const data = await response.json();
        currentCycle = data.cycle;
        roteiros = data.roteiros || [];

        // Carregar agendamentos existentes
        if (data.scheduled) {
            data.scheduled.forEach(item => {
                scheduledItems[item.roteiro_id] = item.scheduled_date;
            });
        }

        renderCycleInfo();
        renderRoteiros();

    } catch (error) {
        console.error(error);
        showToast('Erro ao carregar roteiros', 'error');
    }
}

// Renderizar informações do ciclo
function renderCycleInfo() {
    const cycleName = document.getElementById('cycle-name');
    if (currentCycle) {
        cycleName.textContent = `${currentCycle.month}/${currentCycle.year}`;
    }
}

// Renderizar lista de roteiros
function renderRoteiros(filter = 'all') {
    const container = document.getElementById('roteiros-list');
    const emptyState = document.getElementById('empty-state');

    if (!roteiros || roteiros.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    // Filtrar roteiros
    let filteredRoteiros = roteiros;
    if (filter === 'scheduled') {
        filteredRoteiros = roteiros.filter(r => scheduledItems[r.id]);
    } else if (filter === 'available') {
        filteredRoteiros = roteiros.filter(r => !scheduledItems[r.id]);
    }

    // Renderizar cards
    container.innerHTML = filteredRoteiros.map(roteiro => {
        const isScheduled = scheduledItems[roteiro.id];
        const dateFormatted = isScheduled ? formatDate(isScheduled) : null;

        return `
            <div class="roteiro-card ${isScheduled ? 'scheduled' : ''}" data-id="${roteiro.id}">
                <div class="roteiro-header">
                    <h3 class="roteiro-title">${roteiro.title || 'Roteiro #' + roteiro.id}</h3>
                    ${roteiro.product ? `<span class="roteiro-badge">${roteiro.product}</span>` : ''}
                </div>

                <div class="roteiro-preview">${roteiro.content || roteiro.script || 'Sem preview disponível'}</div>

                ${isScheduled ? `
                    <div class="scheduled-date">
                        <span class="scheduled-date-text">📅 Agendado para ${dateFormatted}</span>
                    </div>
                ` : ''}

                <div class="roteiro-actions">
                    ${!isScheduled ? `
                        <button class="btn-primary btn-schedule" onclick="scheduleRoteiro(${roteiro.id})">
                            📅 Agendar
                        </button>
                    ` : `
                        <button class="btn-primary btn-scheduled" onclick="scheduleRoteiro(${roteiro.id})">
                            ✓ ${dateFormatted}
                        </button>
                        <button class="btn-primary btn-edit" onclick="removeSchedule(${roteiro.id})">
                            ✕
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Agendar roteiro
function scheduleRoteiro(roteiroId) {
    const datePicker = document.getElementById('date-picker');

    // Configurar date picker
    const today = new Date().toISOString().split('T')[0];
    const cycleStart = `${currentCycle.year}-${String(currentCycle.month).padStart(2, '0')}-01`;
    const cycleEnd = getLastDayOfMonth(currentCycle.year, currentCycle.month);

    datePicker.min = cycleStart;
    datePicker.max = cycleEnd;
    datePicker.value = scheduledItems[roteiroId] || today;

    // Abrir date picker
    datePicker.onchange = function() {
        const selectedDate = this.value;
        if (selectedDate) {
            scheduledItems[roteiroId] = selectedDate;
            pendingChanges = true;
            renderRoteiros();
            showSaveButton();
            showToast('Data selecionada! Clique em "Salvar" para confirmar', 'success');
        }
    };

    datePicker.click();
}

// Remover agendamento
function removeSchedule(roteiroId) {
    delete scheduledItems[roteiroId];
    pendingChanges = true;
    renderRoteiros();

    if (Object.keys(scheduledItems).length === 0) {
        hideSaveButton();
    }
}

// Salvar agendamentos
async function saveSchedules() {
    if (!pendingChanges || Object.keys(scheduledItems).length === 0) {
        showToast('Nenhuma alteração para salvar', 'error');
        return;
    }

    try {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="save-icon">⏳</span><span class="save-text">Salvando...</span>';

        const payload = Object.entries(scheduledItems).map(([roteiroId, date]) => ({
            roteiro_id: parseInt(roteiroId),
            scheduled_date: date
        }));

        const response = await fetch('/api/influencer/plan', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedules: payload })
        });

        if (!response.ok) throw new Error('Erro ao salvar agendamentos');

        pendingChanges = false;
        hideSaveButton();
        showToast('✓ Agendamentos salvos com sucesso!', 'success');

        // Recarregar dados
        await loadPlanData();

    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar. Tente novamente.', 'error');

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="save-icon">💾</span><span class="save-text">Salvar Agendamentos</span>';
    }
}

// Configurar listeners
function setupEventListeners() {
    // Botão salvar
    document.getElementById('save-btn')?.addEventListener('click', saveSchedules);

    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderRoteiros(this.dataset.filter);
        });
    });
}

// Mostrar/esconder botão de salvar
function showSaveButton() {
    const btn = document.getElementById('save-btn');
    if (btn) btn.style.display = 'flex';
}

function hideSaveButton() {
    const btn = document.getElementById('save-btn');
    if (btn) btn.style.display = 'none';
}

// Utilitários
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function getLastDayOfMonth(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
}

function showLoading() {
    document.getElementById('roteiros-list').innerHTML = '<div class="loading">Carregando roteiros...</div>';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}
\`\`\`

---

## 4. ALTERAÇÕES NO BACKEND (src/server.js)

### Modificar endpoint POST /influencer/plan para aceitar batch:

\`\`\`javascript
// Substituir o endpoint existente por este:
app.post('/api/influencer/plan', authenticate, verificarAceite, async (req, res) => {
  try {
    const userId = req.auth.user.id;
    const { schedules } = req.body; // Array de {roteiro_id, scheduled_date}

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({ error: 'Envie um array de agendamentos' });
    }

    // Buscar influenciadora
    const influencer = db.prepare('SELECT id FROM influenciadoras WHERE user_id = ?').get(userId);
    if (!influencer) {
      return res.status(404).json({ error: 'Influenciadora não encontrada' });
    }

    // Buscar ciclo ativo
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let cycle = db.prepare(
      'SELECT * FROM monthly_cycles WHERE month = ? AND year = ? LIMIT 1'
    ).get(currentMonth, currentYear);

    // Criar ciclo se não existir
    if (!cycle) {
      const insertCycle = db.prepare(
        'INSERT INTO monthly_cycles (month, year) VALUES (?, ?)'
      );
      const result = insertCycle.run(currentMonth, currentYear);
      cycle = { id: result.lastInsertRowid, month: currentMonth, year: currentYear };
    }

    // Validar e inserir agendamentos em transação
    const transaction = db.transaction((schedulesToInsert) => {
      const deleteStmt = db.prepare(
        'DELETE FROM content_plans WHERE influencer_id = ? AND cycle_id = ?'
      );
      deleteStmt.run(influencer.id, cycle.id);

      const insertStmt = db.prepare(`
        INSERT INTO content_plans (influencer_id, cycle_id, roteiro_id, scheduled_date, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);

      for (const schedule of schedulesToInsert) {
        // Validar que o roteiro existe
        const roteiro = db.prepare('SELECT id FROM content_scripts WHERE id = ?').get(schedule.roteiro_id);
        if (!roteiro) {
          throw new Error(\`Roteiro \${schedule.roteiro_id} não encontrado\`);
        }

        // Validar data dentro do ciclo
        const scheduleDate = new Date(schedule.scheduled_date);
        if (scheduleDate.getMonth() + 1 !== currentMonth || scheduleDate.getFullYear() !== currentYear) {
          throw new Error('Data fora do ciclo atual');
        }

        insertStmt.run(influencer.id, cycle.id, schedule.roteiro_id, schedule.scheduled_date);
      }
    });

    transaction(schedules);

    res.json({ 
      success: true, 
      message: \`\${schedules.length} agendamento(s) salvos com sucesso\`,
      cycle_id: cycle.id
    });

  } catch (error) {
    console.error('Erro ao salvar agendamentos:', error);
    res.status(500).json({ error: error.message || 'Erro ao salvar agendamentos' });
  }
});
\`\`\`

### Modificar endpoint GET /influencer/plan para retornar roteiros + agendamentos:

\`\`\`javascript
// Substituir ou adicionar:
app.get('/api/influencer/plan', authenticate, verificarAceite, async (req, res) => {
  try {
    const userId = req.auth.user.id;

    // Buscar influenciadora
    const influencer = db.prepare('SELECT id, nome FROM influenciadoras WHERE user_id = ?').get(userId);
    if (!influencer) {
      return res.status(404).json({ error: 'Influenciadora não encontrada' });
    }

    // Buscar ciclo ativo
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let cycle = db.prepare(
      'SELECT * FROM monthly_cycles WHERE month = ? AND year = ? LIMIT 1'
    ).get(currentMonth, currentYear);

    // Criar ciclo se não existir
    if (!cycle) {
      const insertCycle = db.prepare('INSERT INTO monthly_cycles (month, year) VALUES (?, ?)');
      const result = insertCycle.run(currentMonth, currentYear);
      cycle = { id: result.lastInsertRowid, month: currentMonth, year: currentYear };
    }

    // Buscar roteiros disponíveis (ordenar por mais recentes)
    const roteiros = db.prepare(`
      SELECT id, title, content, script, product, created_at
      FROM content_scripts
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    // Buscar agendamentos existentes da influenciadora neste ciclo
    const scheduled = db.prepare(`
      SELECT roteiro_id, scheduled_date
      FROM content_plans
      WHERE influencer_id = ? AND cycle_id = ?
    `).all(influencer.id, cycle.id);

    res.json({
      cycle: {
        id: cycle.id,
        month: cycle.month,
        year: cycle.year
      },
      roteiros: roteiros,
      scheduled: scheduled
    });

  } catch (error) {
    console.error('Erro ao carregar plano:', error);
    res.status(500).json({ error: 'Erro ao carregar plano' });
  }
});
\`\`\`

---

## 5. CHECKLIST DE IMPLEMENTAÇÃO

### Estrutura de arquivos:
- [ ] Criar `/public/influencer-plan.html`
- [ ] Criar `/public/styles/plan.css`
- [ ] Criar `/public/scripts/plan.js`

### Backend (src/server.js):
- [ ] Modificar GET /api/influencer/plan (retornar roteiros + agendamentos)
- [ ] Modificar POST /api/influencer/plan (aceitar array batch)
- [ ] Testar endpoints com Postman/Insomnia

### Frontend:
- [ ] Implementar carregamento de dados via fetch
- [ ] Implementar seleção de data com input nativo
- [ ] Implementar salvamento em batch
- [ ] Testar responsividade (Chrome DevTools mobile)
- [ ] Testar em dispositivo móvel real

### Testes:
- [ ] Testar fluxo completo: carregar → agendar → salvar → recarregar
- [ ] Testar filtros (Todos/Agendados/Disponíveis)
- [ ] Testar validação de datas fora do ciclo
- [ ] Testar feedback visual (toasts, loading)

---

## 6. OBSERVAÇÕES IMPORTANTES

### Mobile-First:
- Todos os botões têm **mínimo 48px de altura** (área de toque)
- Espaçamento generoso entre elementos (16px+)
- Usa **date picker nativo** do navegador (melhor UX mobile)
- Scroll vertical natural (sem horizontal)
- Feedback visual imediato em todas as ações

### Responsividade Desktop:
- Container com max-width para não ficar muito largo
- Grid de 2 colunas em telas grandes (1024px+)
- Hover effects nos botões (apenas desktop)
- Transições suaves

### Performance:
- Sem bibliotecas pesadas (apenas vanilla JS)
- Renderização eficiente (innerHTML única)
- Debounce em ações quando necessário

### Acessibilidade:
- Cores com contraste adequado
- Textos legíveis (mínimo 16px)
- Feedback visual e textual em todas as ações

---

## 7. PRÓXIMOS PASSOS (FUTURO)

Após implementar esta versão base, considerar:
- [ ] Notificações push 1 dia antes da data agendada
- [ ] Visualização de histórico de posts anteriores
- [ ] Sugestões automáticas de datas baseadas em engajamento
- [ ] Modo offline com sincronização posterior

---

## CONTATO E SUPORTE

Repositório: https://github.com/Diego99025310/Teste
Qualquer dúvida na implementação, consulte a documentação do projeto existente.
