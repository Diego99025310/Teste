const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const { gerarHashTermo } = require('../src/utils/hash');

const tempDbPath = path.join(__dirname, '..', 'test.sqlite');

if (fs.existsSync(tempDbPath)) {
  fs.unlinkSync(tempDbPath);
}
process.env.DATABASE_PATH = tempDbPath;
process.env.JWT_SECRET = 'test-secret';

const app = require('../src/server');
const db = require('../src/database');

const selectSaleOrderNumberStmt = db.prepare('SELECT order_number FROM sales WHERE id = ?');

const MASTER_EMAIL = process.env.MASTER_EMAIL || 'master@example.com';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'master123';

const resetDb = () => {
  db.exec('DELETE FROM story_submissions;');
  db.exec('DELETE FROM influencer_plans;');
  db.exec('DELETE FROM monthly_commissions;');
  db.exec('DELETE FROM monthly_cycles;');
  db.exec('DELETE FROM sales;');
  db.exec('DELETE FROM aceite_termos;');
  db.exec('DELETE FROM influenciadoras;');
  db.prepare('DELETE FROM users WHERE email != ?').run(MASTER_EMAIL);
};

const termoPath = path.join(__dirname, '..', 'public', 'termos', 'parceria-v1.html');

const registrarAceiteTeste = (userId) => {
  if (!userId) return;
  const hash = gerarHashTermo(termoPath);
  db.prepare(
    `INSERT INTO aceite_termos (
      user_id,
      versao_termo,
      hash_termo,
      data_aceite,
      ip_usuario,
      user_agent,
      canal_autenticacao,
      status
    ) VALUES (?, '1.0', ?, datetime('now'), '127.0.0.1', 'test-runner', 'token_email', 'aceito')`
  ).run(userId, hash);
};

const login = (identifier, password) =>
  request(app)
    .post('/login')
    .send({ identifier, email: identifier, password });

const authenticateMaster = async () => {
  const response = await login(MASTER_EMAIL, MASTER_PASSWORD);
  assert.strictEqual(response.status, 200, 'Master login deve retornar 200');
  assert.ok(response.body.token, 'Master login deve retornar token');
  return response.body.token;
};

test('master pode registrar novo usuario e realizar login', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const registerResponse = await request(app)
    .post('/register')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ email: 'novo.master@example.com', password: 'novaSenha123', role: 'master' });

  assert.strictEqual(registerResponse.status, 201);
  assert.strictEqual(registerResponse.body.email, 'novo.master@example.com');
  assert.strictEqual(registerResponse.body.role, 'master');
  assert.ok(registerResponse.body.id);

  const newLogin = await login('novo.master@example.com', 'novaSenha123');
  assert.strictEqual(newLogin.status, 200);
  assert.strictEqual(newLogin.body.user.role, 'master');
  assert.ok(newLogin.body.token);
});

const influencerPayload = {
  nome: 'Influencer 1',
  instagram: '@influencer',
  cpf: '52998224725',
  email: 'influencer@example.com',
  contato: '11988887777',
  cupom: 'CUPOM10',
  commissionPercent: 12.5,
  cep: '01001000',
  numero: '123',
  complemento: 'Apto 42',
  logradouro: 'Rua Teste',
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  estado: 'SP'
};

test('fluxo simples de influenciadora com login e exclusao', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const createResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(influencerPayload);

  assert.strictEqual(createResponse.status, 201);
  const influencerId = createResponse.body.id;
  assert.ok(influencerId);
  assert.strictEqual(Number(createResponse.body.commission_rate), influencerPayload.commissionPercent);
  assert.strictEqual(createResponse.body.login_email, influencerPayload.email);
  assert.ok(createResponse.body.senha_provisoria);
  assert.strictEqual(createResponse.body.senha_provisoria.length, 6);
  assert.match(createResponse.body.senha_provisoria, /^\d{6}$/);
  assert.ok(createResponse.body.codigo_assinatura);
  assert.strictEqual(createResponse.body.codigo_assinatura.length, 6);
  assert.strictEqual(Number(createResponse.body.contract_signature_waived), 0);

  const influencerLogin = await login(createResponse.body.login_email, createResponse.body.senha_provisoria);
  assert.strictEqual(influencerLogin.status, 200);
  assert.strictEqual(influencerLogin.body.user.role, 'influencer');
  assert.ok(influencerLogin.body.token);

  const phoneLogin = await login(influencerPayload.contato, createResponse.body.senha_provisoria);
  assert.strictEqual(phoneLogin.status, 200);
  assert.strictEqual(phoneLogin.body.user.role, 'influencer');
  assert.strictEqual(phoneLogin.body.user.phone, '(11) 98888-7777');
  assert.ok(phoneLogin.body.token);

  const updateResponse = await request(app)
    .put(`/influenciadora/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      ...influencerPayload,
      contato: '21991234567',
      commissionPercent: 15,
      loginPassword: 'NovaSenha456'
    });

  assert.strictEqual(updateResponse.status, 200);
  assert.strictEqual(updateResponse.body.contato, '(21) 99123-4567');
  assert.strictEqual(Number(updateResponse.body.commission_rate), 15);
  assert.strictEqual(Number(updateResponse.body.contract_signature_waived), 0);

  const newLogin = await login(influencerPayload.email, 'NovaSenha456');
  assert.strictEqual(newLogin.status, 200);
  assert.ok(newLogin.body.token);

  const newPhoneLogin = await login('21991234567', 'NovaSenha456');
  assert.strictEqual(newPhoneLogin.status, 200);
  assert.strictEqual(newPhoneLogin.body.user.phone, '(21) 99123-4567');
  assert.ok(newPhoneLogin.body.token);

  const oldPhoneLogin = await login(influencerPayload.contato, 'NovaSenha456');
  assert.strictEqual(oldPhoneLogin.status, 401);

  const deleteResponse = await request(app)
    .delete(`/influenciadora/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(deleteResponse.status, 200);
});

test('nao permite duplicar campos unicos no cadastro de influenciadoras', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const basePayload = {
    ...influencerPayload,
    nome: 'Primeira Influencer',
    instagram: '@primeira',
    cpf: '39053344705',
    email: 'primeira.contato@example.com',
    loginEmail: 'primeira.login@example.com',
    contato: '11999990000',
    cupom: 'PRIMEIRA'
  };

  const primeiraResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(basePayload);

  assert.strictEqual(primeiraResponse.status, 201);

  const duplicateCpfPayload = {
    ...influencerPayload,
    nome: 'Duplicada CPF',
    instagram: '@duplicadacpf',
    cpf: basePayload.cpf,
    email: 'duplicada.cpf@example.com',
    loginEmail: 'duplicada.cpf@login.com',
    contato: '11999990001',
    cupom: 'DUPCPF'
  };

  const duplicateCpfResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(duplicateCpfPayload);

  assert.strictEqual(duplicateCpfResponse.status, 409);
  assert.strictEqual(duplicateCpfResponse.body.error, 'CPF ja cadastrado.');

  const duplicateEmailPayload = {
    ...influencerPayload,
    nome: 'Duplicada Email',
    instagram: '@duplicadaemail',
    cpf: '15350946056',
    email: basePayload.email,
    loginEmail: 'duplicada.email@login.com',
    contato: '11999990002',
    cupom: 'DUPEMAIL'
  };

  const duplicateEmailResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(duplicateEmailPayload);

  assert.strictEqual(duplicateEmailResponse.status, 409);
  assert.strictEqual(duplicateEmailResponse.body.error, 'Email de contato ja cadastrado.');

  const duplicatePhonePayload = {
    ...influencerPayload,
    nome: 'Duplicada Telefone',
    instagram: '@duplicadatelefone',
    cpf: '11144477735',
    email: 'duplicada.telefone@example.com',
    loginEmail: 'duplicada.telefone@login.com',
    contato: basePayload.contato,
    cupom: 'DUPFONE'
  };

  const duplicatePhoneResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(duplicatePhonePayload);

  assert.strictEqual(duplicatePhoneResponse.status, 409);
  assert.strictEqual(duplicatePhoneResponse.body.error, 'Telefone ja cadastrado.');

  const duplicateCupomPayload = {
    ...influencerPayload,
    nome: 'Duplicada Cupom',
    instagram: '@duplicadacupom',
    cpf: '98765432100',
    email: 'duplicada.cupom@example.com',
    loginEmail: 'duplicada.cupom@login.com',
    contato: '11999990003',
    cupom: basePayload.cupom
  };

  const duplicateCupomResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(duplicateCupomPayload);

  assert.strictEqual(duplicateCupomResponse.status, 409);
  assert.strictEqual(duplicateCupomResponse.body.error, 'Cupom ja cadastrado.');

  const uniquePayload = {
    ...influencerPayload,
    nome: 'Segunda Influencer',
    instagram: '@segunda',
    cpf: '56803325741',
    email: 'segunda.contato@example.com',
    loginEmail: 'segunda.login@example.com',
    contato: '21988880000',
    cupom: 'SEGUNDA'
  };

  const uniqueResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(uniquePayload);

  assert.strictEqual(uniqueResponse.status, 201);
});

test('dispensa de contrato permite acesso sem aceite', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const createResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ ...influencerPayload, contractSignatureWaived: true });

  assert.strictEqual(createResponse.status, 201);
  const influencerId = createResponse.body.id;
  assert.ok(influencerId);
  assert.strictEqual(Number(createResponse.body.contract_signature_waived), 1);
  assert.ok(!createResponse.body.codigo_assinatura);

  const provisionalPassword = createResponse.body.senha_provisoria;
  assert.ok(provisionalPassword);
  assert.strictEqual(provisionalPassword.length, 6);
  assert.match(provisionalPassword, /^\d{6}$/);

  const influencerLogin = await login(createResponse.body.login_email, provisionalPassword);
  assert.strictEqual(influencerLogin.status, 200);
  const influencerToken = influencerLogin.body.token;
  assert.ok(influencerToken);

  const profileResponse = await request(app)
    .get(`/influenciadora/${influencerId}`)
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(profileResponse.status, 200);

  const acceptanceStatus = await request(app)
    .get('/api/verificar-aceite')
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(acceptanceStatus.status, 200);
  assert.strictEqual(acceptanceStatus.body.aceito, true);
  assert.strictEqual(acceptanceStatus.body.dispensado, true);

  const contractResponse = await request(app)
    .get('/api/contrato-assinado')
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(contractResponse.status, 404);
  assert.match(contractResponse.body.error, /dispensad/i);

  const updateResponse = await request(app)
    .put(`/influenciadora/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      ...influencerPayload,
      contractSignatureWaived: false,
      commissionPercent: influencerPayload.commissionPercent,
      loginEmail: influencerPayload.email
    });

  assert.strictEqual(updateResponse.status, 200);
  assert.strictEqual(Number(updateResponse.body.contract_signature_waived), 0);
  assert.ok(updateResponse.body.codigo_assinatura);
  assert.strictEqual(updateResponse.body.codigo_assinatura.length, 6);

  const restrictedAccess = await request(app)
    .get(`/influenciadora/${influencerId}`)
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(restrictedAccess.status, 428);
  assert.match(restrictedAccess.body.error, /Aceite do termo/i);

  const pendingAcceptance = await request(app)
    .get('/api/verificar-aceite')
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(pendingAcceptance.status, 200);
  assert.strictEqual(pendingAcceptance.body.aceito, false);
  assert.ok(!pendingAcceptance.body.dispensado);
});

test('fluxo completo de ciclo mensal com agendamento, validacao e fechamento', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const createResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      ...influencerPayload,
      cupom: 'CICLOPINK',
      email: 'ciclo@example.com',
      loginEmail: 'ciclo.login@example.com'
    });

  assert.strictEqual(createResponse.status, 201);
  const influencerId = createResponse.body.id;
  const provisionalPassword = createResponse.body.senha_provisoria;
  const loginEmail = createResponse.body.login_email;
  assert.ok(influencerId);

  const influencerLogin = await login(loginEmail, provisionalPassword);
  assert.strictEqual(influencerLogin.status, 200);
  const influencerToken = influencerLogin.body.token;
  const influencerUserId = influencerLogin.body.user.id;
  assert.ok(influencerToken);

  registrarAceiteTeste(influencerUserId);

  const planOverview = await request(app)
    .get('/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`);

  assert.strictEqual(planOverview.status, 200);
  const cycle = planOverview.body.cycle;
  assert.ok(cycle);
  const cycleMonth = String(cycle.cycle_month).padStart(2, '0');
  const dates = [1, 2, 3, 4, 5].map((day) =>
    `${cycle.cycle_year}-${cycleMonth}-${String(day).padStart(2, '0')}`
  );

  const planCreate = await request(app)
    .post('/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`)
    .send({ days: dates });

  assert.strictEqual(planCreate.status, 201);
  assert.strictEqual(planCreate.body.plans.length, dates.length);
  const pendingValidations = await request(app)
    .get('/master/validations')
    .set('Authorization', `Bearer ${masterToken}`);

  assert.strictEqual(pendingValidations.status, 200);
  assert.strictEqual(pendingValidations.body.pending.length, dates.length);

  for (const item of pendingValidations.body.pending) {
    const approve = await request(app)
      .post(`/master/validations/${item.id}/approve`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send();
    assert.strictEqual(approve.status, 200);
  }

  const remainingValidations = await request(app)
    .get('/master/validations')
    .set('Authorization', `Bearer ${masterToken}`);

  assert.strictEqual(remainingValidations.status, 200);
  assert.strictEqual(remainingValidations.body.pending.length, 0);

  const dashboard = await request(app)
    .get('/influencer/dashboard')
    .set('Authorization', `Bearer ${influencerToken}`);

  assert.strictEqual(dashboard.status, 200);
  assert.strictEqual(dashboard.body.progress.validatedDays, 5);
  assert.strictEqual(dashboard.body.progress.multiplier, 1.25);
  assert.strictEqual(dashboard.body.progress.pendingValidations, 0);

  const saleResponse = await request(app)
    .post('/sales')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PINK-001',
      cupom: 'CICLOPINK',
      date: dates[0],
      grossValue: 1000,
      discount: 0
    });

  assert.strictEqual(saleResponse.status, 201);

  const closeResponse = await request(app)
    .post(`/master/cycles/${cycle.id}/close`)
    .set('Authorization', `Bearer ${masterToken}`)
    .send();

  assert.strictEqual(closeResponse.status, 200);
  const summary = closeResponse.body.summaries.find(
    (row) => Number(row.influencer_id) === Number(influencerId)
  );
  assert.ok(summary);
  assert.strictEqual(Number(summary.validated_days), 5);
  assert.strictEqual(Number(summary.multiplier), 1.25);
  assert.strictEqual(Number(summary.deliveries_planned), 5);
  assert.strictEqual(Number(summary.deliveries_completed), 5);
  assert.strictEqual(Number(summary.base_commission) > 0, true);
  assert.strictEqual(Number(summary.total_commission) > Number(summary.base_commission), true);

  const historyResponse = await request(app)
    .get('/influencer/history')
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(historyResponse.status, 200);
  assert.ok(historyResponse.body.history.length >= 1);

  const rankingResponse = await request(app)
    .get('/master/ranking')
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(rankingResponse.status, 200);
  const rankingMatch = rankingResponse.body.ranking.find(
    (row) => Number(row.influencer_id) === Number(influencerId)
  );
  assert.ok(rankingMatch);
});

test('endpoints mobile-first de agendamento retornam dados completos', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const scriptResponse = await request(app)
    .post('/scripts')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ title: 'Roteiro Mobile', description: 'Demonstre o uso do HidraPink em uma rotina diária.' });

  assert.strictEqual(scriptResponse.status, 201);
  const scriptId = scriptResponse.body.id;
  assert.ok(scriptId);

  const createResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      ...influencerPayload,
      cupom: 'PLANPINK',
      email: 'planner@example.com',
      loginEmail: 'planner.login@example.com'
    });

  assert.strictEqual(createResponse.status, 201);
  const influencerId = createResponse.body.id;
  assert.ok(influencerId);
  const provisionalPassword = createResponse.body.senha_provisoria;
  const loginEmail = createResponse.body.login_email;
  assert.ok(loginEmail);

  const influencerLogin = await login(loginEmail, provisionalPassword);
  assert.strictEqual(influencerLogin.status, 200);
  const influencerToken = influencerLogin.body.token;
  const influencerUserId = influencerLogin.body.user.id;
  assert.ok(influencerToken);

  registrarAceiteTeste(influencerUserId);

  const planOverview = await request(app)
    .get('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`);

  assert.strictEqual(planOverview.status, 200);
  assert.ok(planOverview.body.cycle);
  assert.ok(Array.isArray(planOverview.body.scripts));
  assert.ok(Array.isArray(planOverview.body.plans));
  const availableScript = planOverview.body.scripts.find((item) => Number(item.id) === Number(scriptId));
  assert.ok(availableScript, 'roteiro criado deve aparecer na listagem');

  const cycleInfo = planOverview.body.cycle;
  const scheduleDate = cycleInfo.startDate
    || `${cycleInfo.year}-${String(cycleInfo.month).padStart(2, '0')}-01`;

  const saveResponse = await request(app)
    .post('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`)
    .send({ schedules: [{ scriptId, date: scheduleDate }] });

  assert.strictEqual(saveResponse.status, 201);
  assert.ok(Array.isArray(saveResponse.body.plans));
  const savedPlan = saveResponse.body.plans.find((plan) => Number(plan.scriptId) === Number(scriptId));
  assert.ok(savedPlan);
  assert.strictEqual(savedPlan.date, scheduleDate);

  const refreshed = await request(app)
    .get('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`);

  assert.strictEqual(refreshed.status, 200);
  const scheduledPlan = refreshed.body.plans.find((plan) => Number(plan.scriptId) === Number(scriptId));
  assert.ok(scheduledPlan);
  assert.strictEqual(scheduledPlan.date, scheduleDate);

  const planRow = db
    .prepare(
      'SELECT id, status, scheduled_date FROM influencer_plans WHERE influencer_id = ? AND content_script_id = ? LIMIT 1'
    )
    .get(influencerId, scriptId);
  assert.ok(planRow?.id);

  db.prepare("UPDATE influencer_plans SET status = 'validated' WHERE id = ?").run(planRow.id);

  const cyclePrefix = `${cycleInfo.year}-${String(cycleInfo.month).padStart(2, '0')}-`;
  const nextDayCandidate = new Date(`${scheduleDate}T12:00:00Z`);
  nextDayCandidate.setUTCDate(nextDayCandidate.getUTCDate() + 1);
  let rescheduleDate = nextDayCandidate.toISOString().slice(0, 10);
  if (!rescheduleDate.startsWith(cyclePrefix)) {
    const previousDayCandidate = new Date(`${scheduleDate}T12:00:00Z`);
    previousDayCandidate.setUTCDate(previousDayCandidate.getUTCDate() - 1);
    const fallback = previousDayCandidate.toISOString().slice(0, 10);
    rescheduleDate = fallback.startsWith(cyclePrefix) ? fallback : scheduleDate;
  }

  const rescheduleResponse = await request(app)
    .post('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`)
    .send({ schedules: [{ scriptId, date: rescheduleDate }] });

  assert.strictEqual(rescheduleResponse.status, 201);
  const rescheduledPlan = rescheduleResponse.body.plans.find((plan) => Number(plan.scriptId) === Number(scriptId));
  assert.ok(rescheduledPlan);
  assert.strictEqual(rescheduledPlan.date, rescheduleDate);
  assert.strictEqual(rescheduledPlan.status, 'scheduled');

  const persistedPlan = db
    .prepare('SELECT status, scheduled_date FROM influencer_plans WHERE id = ?')
    .get(planRow.id);
  assert.strictEqual(persistedPlan.status, 'scheduled');
  assert.strictEqual(persistedPlan.scheduled_date, rescheduleDate);

  const removalResponse = await request(app)
    .post('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`)
    .send({ schedules: [], removedScripts: [scriptId] });

  assert.strictEqual(removalResponse.status, 201);
  const postRemoval = await request(app)
    .get('/api/influencer/plan')
    .set('Authorization', `Bearer ${influencerToken}`);

  assert.strictEqual(postRemoval.status, 200);
  const afterRemovalPlan = postRemoval.body.plans.find((plan) => Number(plan.scriptId) === Number(scriptId));
  assert.strictEqual(afterRemovalPlan, undefined);

  const remainingCount = db
    .prepare('SELECT COUNT(*) as total FROM influencer_plans WHERE influencer_id = ? AND content_script_id = ?')
    .get(influencerId, scriptId);
  assert.strictEqual(Number(remainingCount.total), 0);
});

test('gestao de vendas vinculada a influenciadora', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const createInfluencer = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(influencerPayload);

  assert.strictEqual(createInfluencer.status, 201);
  const influencerId = createInfluencer.body.id;

  const saleResponse = await request(app)
    .post('/sales')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PED-001',
      cupom: influencerPayload.cupom,
      date: '2025-10-01',
      grossValue: 1000,
      discount: 100
    });

  assert.strictEqual(saleResponse.status, 201);
  assert.strictEqual(saleResponse.body.order_number, 'PED-001');
  assert.strictEqual(Number(saleResponse.body.net_value), 900);
  assert.strictEqual(Number(saleResponse.body.commission), 112.5);
  const saleId = saleResponse.body.id;

  const createdSaleRecord = selectSaleOrderNumberStmt.get(saleId);
  assert.ok(createdSaleRecord, 'Venda deve ser persistida no banco de dados.');
  assert.strictEqual(createdSaleRecord.order_number, 'PED-001');

  const listSales = await request(app)
    .get(`/sales/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(listSales.status, 200);
  assert.strictEqual(listSales.body.length, 1);

  const summaryInitial = await request(app)
    .get(`/sales/summary/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(summaryInitial.status, 200);
  assert.strictEqual(Number(summaryInitial.body.total_net), 900);
  assert.strictEqual(Number(summaryInitial.body.total_commission), 112.5);

  const consultResponse = await request(app)
    .get('/influenciadoras/consulta')
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(consultResponse.status, 200);
  const consultRow = consultResponse.body.find((row) => row.id === influencerId);
  assert.ok(consultRow, 'Resumo deve incluir influenciadora criada');
  assert.strictEqual(Number(consultRow.vendas_count), 1);
  assert.strictEqual(Number(consultRow.vendas_total), 900);

  const duplicateSale = await request(app)
    .post('/sales')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PED-001',
      cupom: influencerPayload.cupom,
      date: '2025-10-04',
      grossValue: 800,
      discount: 0
    });
  assert.strictEqual(duplicateSale.status, 409);
  assert.match(duplicateSale.body.error, /numero de pedido/i);

  const secondSaleResponse = await request(app)
    .post('/sales')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PED-002',
      cupom: influencerPayload.cupom,
      date: '2025-10-05',
      grossValue: 500,
      discount: 0
    });
  assert.strictEqual(secondSaleResponse.status, 201);
  const secondSaleId = secondSaleResponse.body.id;
  const secondSaleRecord = selectSaleOrderNumberStmt.get(secondSaleId);
  assert.ok(secondSaleRecord, 'Segunda venda deve ser persistida.');
  assert.strictEqual(secondSaleRecord.order_number, 'PED-002');

  const conflictingUpdate = await request(app)
    .put(`/sales/${saleId}`)
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PED-002',
      cupom: influencerPayload.cupom,
      date: '2025-10-06',
      grossValue: 1000,
      discount: 50
    });
  assert.strictEqual(conflictingUpdate.status, 409);
  assert.match(conflictingUpdate.body.error, /numero de pedido/i);

  const updateSale = await request(app)
    .put(`/sales/${saleId}`)
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      orderNumber: 'PED-001-ALT',
      cupom: influencerPayload.cupom,
      date: '2025-10-02',
      grossValue: 1000,
      discount: 50
    });
  assert.strictEqual(updateSale.status, 200);
  assert.strictEqual(updateSale.body.order_number, 'PED-001-ALT');
  assert.strictEqual(Number(updateSale.body.net_value), 950);
  assert.strictEqual(Number(updateSale.body.commission), 118.75);

  const updatedSaleRecord = selectSaleOrderNumberStmt.get(saleId);
  assert.ok(updatedSaleRecord, 'Venda atualizada deve existir no banco de dados.');
  assert.strictEqual(updatedSaleRecord.order_number, 'PED-001-ALT');

  const consultAfterUpdate = await request(app)
    .get('/influenciadoras/consulta')
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(consultAfterUpdate.status, 200);
  const consultRowUpdated = consultAfterUpdate.body.find((row) => row.id === influencerId);
  assert.ok(consultRowUpdated);
  assert.strictEqual(Number(consultRowUpdated.vendas_count), 2);
  assert.strictEqual(Number(consultRowUpdated.vendas_total), 1450);

  const influencerLogin = await login(
    createInfluencer.body.login_email,
    createInfluencer.body.senha_provisoria
  );
  assert.strictEqual(influencerLogin.status, 200);
  const influencerToken = influencerLogin.body.token;
  registrarAceiteTeste(influencerLogin.body.user?.id);

  const unauthorizedConsult = await request(app)
    .get('/influenciadoras/consulta')
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(unauthorizedConsult.status, 403);

  const unauthorizedSale = await request(app)
    .post('/sales')
    .set('Authorization', `Bearer ${influencerToken}`)
    .send({ cupom: influencerPayload.cupom, date: '2025-10-03', grossValue: 500, discount: 0 });
  assert.strictEqual(unauthorizedSale.status, 403);

  const influencerSalesView = await request(app)
    .get(`/sales/${influencerId}`)
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(influencerSalesView.status, 200);
  assert.strictEqual(influencerSalesView.body.length, 2);

  const summaryAfterUpdate = await request(app)
    .get(`/sales/summary/${influencerId}`)
    .set('Authorization', `Bearer ${influencerToken}`);
  assert.strictEqual(summaryAfterUpdate.status, 200);
  assert.strictEqual(Number(summaryAfterUpdate.body.total_net), 1450);
  assert.strictEqual(Number(summaryAfterUpdate.body.total_commission), 181.25);

  const deleteSale = await request(app)
    .delete(`/sales/${saleId}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(deleteSale.status, 200);

  const summaryAfterDelete = await request(app)
    .get(`/sales/summary/${influencerId}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(summaryAfterDelete.status, 200);
  assert.strictEqual(Number(summaryAfterDelete.body.total_net), 500);
  assert.strictEqual(Number(summaryAfterDelete.body.total_commission), 62.5);

  const consultAfterDelete = await request(app)
    .get('/influenciadoras/consulta')
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(consultAfterDelete.status, 200);
  const consultRowAfterDelete = consultAfterDelete.body.find((row) => row.id === influencerId);
  assert.ok(consultRowAfterDelete);
  assert.strictEqual(Number(consultRowAfterDelete.vendas_count), 1);
  assert.strictEqual(Number(consultRowAfterDelete.vendas_total), 500);
});

test('importacao em massa de vendas com validacao', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const biaPayload = {
    ...influencerPayload,
    nome: 'Bia Influencer',
    instagram: '@bia',
    email: 'bia.influencer@example.com',
    contato: '11999990000',
    cupom: 'BIA8',
    cpf: '39053344705',
    loginEmail: 'bia.login@example.com',
    loginPassword: 'SenhaBia123'
  };

  const ingridPayload = {
    ...influencerPayload,
    nome: 'Ingrid Influencer',
    instagram: '@ingrid',
    email: 'ingrid.influencer@example.com',
    contato: '11999990001',
    cupom: 'INGRID',
    cpf: '15350946056',
    loginEmail: 'ingrid.login@example.com',
    loginPassword: 'SenhaIngrid123'
  };

  const biaResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(biaPayload);
  assert.strictEqual(biaResponse.status, 201);

  const ingridResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(ingridPayload);
  assert.strictEqual(ingridResponse.status, 201);

  const textWithUnknownCoupon = [
    'Pedido\tCupom\tData\tValor bruto\tDesconto',
    '#1040\tBIA8\t02/08/2025 18:08\t62.47\t',
    '#1041\tINGRID\t02/08/2025 22:25\t62.47\t0',
    '#1042\tNAOEXISTE\t03/08/2025 10:00\t50,00\t0'
  ].join('\n');

  const previewWithError = await request(app)
    .post('/sales/import/preview')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: textWithUnknownCoupon });

  assert.strictEqual(previewWithError.status, 200);
  assert.strictEqual(previewWithError.body.hasErrors, true);
  const unknownRow = previewWithError.body.rows.find((row) => row.cupom === 'NAOEXISTE');
  assert.ok(unknownRow, 'Linha com cupom desconhecido deve ser retornada.');
  assert.ok(
    unknownRow.errors.some((message) => /cupom nao cadastrado/i.test(message)),
    'Mensagem deve indicar cupom nao cadastrado.'
  );

  const confirmWithErrors = await request(app)
    .post('/sales/import/confirm')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: textWithUnknownCoupon });

  assert.strictEqual(confirmWithErrors.status, 201);
  assert.strictEqual(confirmWithErrors.body.inserted, 2);
  assert.strictEqual(confirmWithErrors.body.ignored, 1);
  assert.strictEqual(confirmWithErrors.body.summary.count, 2);

  const validText = [
    'Pedido\tCupom\tData\tValor bruto\tDesconto',
    '#2040\tINGRID\t02/08/2025 18:08\t62.47\t',
    '#2041\tINGRID\t02/08/2025 22:25\t62.47\t0'
  ].join('\n');

  const validPreview = await request(app)
    .post('/sales/import/preview')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: validText });

  assert.strictEqual(validPreview.status, 200);
  assert.strictEqual(validPreview.body.hasErrors, false);
  assert.strictEqual(validPreview.body.validCount, 2);
  assert.strictEqual(Number(validPreview.body.summary.totalNet), 124.94);

  const confirmImport = await request(app)
    .post('/sales/import/confirm')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: validText });

  assert.strictEqual(confirmImport.status, 201);
  assert.strictEqual(confirmImport.body.inserted, 2);
  assert.strictEqual(confirmImport.body.ignored, 0);

  const biaSales = await request(app)
    .get(`/sales/${biaResponse.body.id}`)
    .set('Authorization', `Bearer ${masterToken}`);
  assert.strictEqual(biaSales.status, 200);
  assert.strictEqual(biaSales.body.length, 1);

  const duplicatePreview = await request(app)
    .post('/sales/import/preview')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: validText });

  assert.strictEqual(duplicatePreview.status, 200);
  assert.strictEqual(duplicatePreview.body.hasErrors, true);
  duplicatePreview.body.rows.forEach((row) => {
    assert.ok(row.errors.some((message) => /pedido ja cadastrado/i.test(message)));
  });

  const duplicateConfirm = await request(app)
    .post('/sales/import/confirm')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: validText });

  assert.strictEqual(duplicateConfirm.status, 409);
});

test('importacao de vendas a partir de csv do shopify', async () => {
  resetDb();

  const masterToken = await authenticateMaster();

  const deboraPayload = {
    ...influencerPayload,
    nome: 'Débora',
    instagram: '@debora',
    email: 'debora@example.com',
    contato: '11988880000',
    cupom: 'debora',
    cpf: '15350946056',
    loginEmail: 'debora.login@example.com',
    loginPassword: 'SenhaDebora123'
  };

  const ingridPayload = {
    ...influencerPayload,
    nome: 'Ingrid',
    instagram: '@ingrid',
    email: 'ingrid@example.com',
    contato: '11988880001',
    cupom: 'INGRID',
    cpf: '39053344705',
    loginEmail: 'ingrid.login@example.com',
    loginPassword: 'SenhaIngrid123'
  };

  const deboraResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(deboraPayload);
  assert.strictEqual(deboraResponse.status, 201);

  const ingridResponse = await request(app)
    .post('/influenciadora')
    .set('Authorization', `Bearer ${masterToken}`)
    .send(ingridPayload);
  assert.strictEqual(ingridResponse.status, 201);

  const csvLines = [
    'Name,Paid at,Subtotal,Discount Code,Discount Amount,Note Attributes',
    '#2001,2025-08-08 13:35:24 -0300,62.47,debora,5.43,"shipping_street_name: Rua Ciro Fernandes\\nshipping_street_number: 715"',
    '#2002,,67.90,debora,5.43,"linha ignorada sem pagamento"',
    '#2003,2025-08-09 15:56:55 -0300,62.47,NAOEXISTE,0,"linha ignorada cupom desconhecido"',
    '#2004,2025-08-10 10:00:00 -0300,50.00,INGRID,0,"linha valida sem desconto"'
  ];

  const csvContent = csvLines.join('\n');

  const preview = await request(app)
    .post('/sales/import/preview')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: csvContent });

  assert.strictEqual(preview.status, 200);
  assert.strictEqual(preview.body.hasErrors, false);
  assert.strictEqual(preview.body.totalCount, 2);
  assert.strictEqual(preview.body.validCount, 2);
  assert.strictEqual(Number(preview.body.summary.totalGross), 117.9);
  assert.strictEqual(Number(preview.body.summary.totalDiscount), 5.43);
  assert.strictEqual(Number(preview.body.summary.totalNet), 112.47);

  const row2001 = preview.body.rows.find((row) => row.orderNumber === '#2001');
  assert.ok(row2001, 'Pedido #2001 deve estar presente.');
  assert.strictEqual(row2001.cupom, 'debora');
  assert.strictEqual(Number(row2001.grossValue), 67.9);
  assert.strictEqual(Number(row2001.discount), 5.43);
  assert.strictEqual(row2001.date, '2025-08-08');

  const row2004 = preview.body.rows.find((row) => row.orderNumber === '#2004');
  assert.ok(row2004, 'Pedido #2004 deve estar presente.');
  assert.strictEqual(row2004.cupom, 'INGRID');
  assert.strictEqual(Number(row2004.grossValue), 50);
  assert.strictEqual(Number(row2004.discount), 0);
  assert.strictEqual(row2004.date, '2025-08-10');

  const confirm = await request(app)
    .post('/sales/import/confirm')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({ text: csvContent });

  assert.strictEqual(confirm.status, 201);
  assert.strictEqual(confirm.body.inserted, 2);
  assert.strictEqual(confirm.body.summary.count, 2);
});

after(() => {
  db.close();
  if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath);
  }
});
