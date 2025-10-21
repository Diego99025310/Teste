require('./config/env');
const express = require('express');
const path = require('path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const createAceiteRouter = require('./routes/aceite');
const verificarAceite = require('./middlewares/verificarAceite');
const { calculateCommissionMultiplier, summarizePoints } = require('./utils/multiplier');
const { pointsToBrl, POINT_VALUE_BRL, roundCurrency, roundPoints } = require('./utils/points');

const app = express();

const candidateStaticDirs = ['frontend', 'public']
  .map((dir) => path.join(__dirname, '..', dir))
  .filter((dir) => {
    try {
      return fs.existsSync(dir);
    } catch (error) {
      console.warn('Nao foi possivel verificar o diretorio estatico ' + dir + ':', error);
      return false;
    }
  });

const fallbackStaticDir = path.join(__dirname, '..', 'public');
const staticDirs = candidateStaticDirs.length ? candidateStaticDirs : [fallbackStaticDir];
const primaryStaticDir = staticDirs[0];

app.use(express.json());
staticDirs.forEach((dir) => app.use(express.static(dir)));

app.get('/aceite-termos', (req, res) => {
  const filePath = path.join(primaryStaticDir, 'aceite-termos.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(err.status || 500).end();
    }
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRATION = process.env.JWT_EXPIRATION || '1d';

const validators = {
  email: (value) => /^(?:[\w!#$%&'*+/=?^`{|}~-]+(?:\.[\w!#$%&'*+/=?^`{|}~-]+)*)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(value),
  password: (value) => typeof value === 'string' && value.length >= 6
};

const PASSWORD_CHARSET = '0123456789';

const generateRandomPassword = (length = 6) => {
  let result = '';
  const bytes = crypto.randomBytes(length);
  for (let index = 0; index < length; index += 1) {
    const randomIndex = bytes[index] % PASSWORD_CHARSET.length;
    result += PASSWORD_CHARSET[randomIndex];
  }
  return result;
};

const parseCurrency = (value, fieldLabel) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { error: `${fieldLabel} deve ser um numero maior ou igual a zero.` };
  }
  return { value: roundCurrency(num) };
};

const parsePointsValue = (value, fieldLabel) => {
  if (value == null || value === '') {
    return { error: `${fieldLabel} deve ser informado.` };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: `${fieldLabel} deve ser um numero inteiro maior ou igual a zero.` };
  }
  const rounded = roundPoints(parsed);
  if (Math.abs(rounded - parsed) > 0.0001) {
    return { error: `${fieldLabel} deve ser um numero inteiro.` };
  }
  return { value: rounded };
};

const trimString = (value) => (typeof value === 'string' ? value.trim() : value);

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
  if (!trimmedLines.length) {
    return '';
  }

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
  const trimmed = trimString(value) || '';
  if (!trimmed) {
    return '';
  }

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

const HTML_CONTENT_PATTERN = /<\s*(?:p|ul|ol|li|br|strong|em|b|i|u|a|blockquote|code|pre|h[1-6])\b[^>]*>/i;

const normalizeScriptDescription = (value = '') => {
  const trimmed = trimString(value) || '';
  if (!trimmed) {
    return '';
  }
  if (HTML_CONTENT_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return convertPlainTextToHtml(trimmed);
};

const isValidDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const findUserByEmailStmt = db.prepare(
  'SELECT id, email, phone, phone_normalized, password_hash, role FROM users WHERE LOWER(email) = LOWER(?)'
);
const findUserByPhoneStmt = db.prepare(
  'SELECT id, email, phone, phone_normalized, password_hash, role FROM users WHERE phone_normalized = ?'
);
const findUserByIdStmt = db.prepare('SELECT id, email, phone, phone_normalized, password_hash, role FROM users WHERE id = ?');
const insertUserStmt = db.prepare(
  'INSERT INTO users (email, phone, phone_normalized, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)'
);
const updateUserPasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const updateUserEmailStmt = db.prepare('UPDATE users SET email = ? WHERE id = ?');
const updateUserPhoneStmt = db.prepare('UPDATE users SET phone = ?, phone_normalized = ? WHERE id = ?');
const ensureSingleMasterStmt = db.prepare('SELECT id, email, password_hash FROM users WHERE role = ? LIMIT 1');
const deleteUserByIdStmt = db.prepare('DELETE FROM users WHERE id = ?');

const influencerBaseQuery = `
  SELECT i.id,
         i.nome,
         i.instagram,
         i.cpf,
         i.email,
         i.contato,
         i.cupom,
         i.vendas_quantidade,
         i.vendas_valor,
         i.cep,
         i.numero,
         i.complemento,
         i.logradouro,
         i.bairro,
         i.cidade,
         i.estado,
         i.commission_rate,
         i.contract_signature_code_generated_at,
         i.contract_signature_waived,
         i.user_id,
         i.created_at,
         u.email AS login_email,
         u.phone AS login_phone
  FROM influenciadoras i
  LEFT JOIN users u ON u.id = i.user_id
`;

const insertInfluencerStmt = db.prepare(`
  INSERT INTO influenciadoras (
    nome,
    instagram,
    cpf,
    email,
    contato,
    cupom,
    vendas_quantidade,
    vendas_valor,
    cep,
    numero,
    complemento,
    logradouro,
    bairro,
    cidade,
    estado,
    commission_rate,
    contract_signature_code_hash,
    contract_signature_code_generated_at,
    contract_signature_waived,
    user_id
  ) VALUES (
    @nome,
    @instagram,
    @cpf,
    @email,
    @contato,
    @cupom,
    @vendas_quantidade,
    @vendas_valor,
    @cep,
    @numero,
    @complemento,
    @logradouro,
    @bairro,
    @cidade,
    @estado,
    @commission_rate,
    @contract_signature_code_hash,
    @contract_signature_code_generated_at,
    @contract_signature_waived,
    @user_id
  )
`);

const updateInfluencerStmt = db.prepare(`
  UPDATE influenciadoras SET
    nome = @nome,
    instagram = @instagram,
    cpf = @cpf,
    email = @email,
    contato = @contato,
    cupom = @cupom,
    vendas_quantidade = @vendas_quantidade,
    vendas_valor = @vendas_valor,
    cep = @cep,
    numero = @numero,
    complemento = @complemento,
    logradouro = @logradouro,
    bairro = @bairro,
    cidade = @cidade,
    estado = @estado,
    commission_rate = @commission_rate,
    contract_signature_waived = @contract_signature_waived
  WHERE id = @id
`);

const deleteInfluencerByIdStmt = db.prepare('DELETE FROM influenciadoras WHERE id = ?');
const listInfluencersStmt = db.prepare(`${influencerBaseQuery} ORDER BY i.created_at DESC`);
const findInfluencerByIdStmt = db.prepare(`${influencerBaseQuery} WHERE i.id = ?`);
const findInfluencerByUserIdStmt = db.prepare(`${influencerBaseQuery} WHERE i.user_id = ?`);
const findInfluencerSignatureStmt = db.prepare(
  'SELECT contract_signature_code_hash, contract_signature_code_generated_at FROM influenciadoras WHERE user_id = ?'
);
const listInfluencerLoginIdentifiersStmt = db.prepare(
  'SELECT user_id, contato, cpf FROM influenciadoras WHERE user_id IS NOT NULL'
);
const findInfluencerByCouponStmt = db.prepare(`${influencerBaseQuery} WHERE i.cupom IS NOT NULL AND LOWER(i.cupom) = LOWER(?) LIMIT 1`);
const findInfluencerIdByInstagramStmt = db.prepare(
  'SELECT id FROM influenciadoras WHERE instagram IS NOT NULL AND LOWER(instagram) = LOWER(?) LIMIT 1'
);
const findInfluencerIdByCpfStmt = db.prepare(
  "SELECT id FROM influenciadoras WHERE cpf IS NOT NULL AND REPLACE(REPLACE(cpf, '.', ''), '-', '') = ? LIMIT 1"
);
const findInfluencerIdByEmailStmt = db.prepare(
  'SELECT id FROM influenciadoras WHERE email IS NOT NULL AND LOWER(email) = LOWER(?) LIMIT 1'
);
const findInfluencerIdByContatoStmt = db.prepare(
  "SELECT id FROM influenciadoras WHERE contato IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(contato, '(', ''), ')', ''), '-', ''), ' ', '') = ? LIMIT 1"
);
const findInfluencerIdByCupomStmt = db.prepare(
  'SELECT id FROM influenciadoras WHERE cupom IS NOT NULL AND LOWER(cupom) = LOWER(?) LIMIT 1'
);

const updateInfluencerSignatureStmt = db.prepare(
  'UPDATE influenciadoras SET contract_signature_code_hash = ?, contract_signature_code_generated_at = ? WHERE id = ?'
);

const listSkuPointsStmt = db.prepare(
  `SELECT id, sku, description, points_per_unit, active, created_at, updated_at
     FROM sku_points
    ORDER BY LOWER(sku)`
);
const listActiveSkuPointsStmt = db.prepare(
  'SELECT sku, points_per_unit FROM sku_points WHERE active = 1'
);
const findSkuPointByIdStmt = db.prepare(
  'SELECT id, sku, description, points_per_unit, active, created_at, updated_at FROM sku_points WHERE id = ?'
);
const findSkuPointBySkuStmt = db.prepare(
  'SELECT id, sku, description, points_per_unit, active FROM sku_points WHERE LOWER(sku) = LOWER(?)'
);
const insertSkuPointStmt = db.prepare(
  `INSERT INTO sku_points (sku, description, points_per_unit, active)
   VALUES (@sku, @description, @points_per_unit, @active)`
);
const updateSkuPointStmt = db.prepare(
  `UPDATE sku_points
      SET sku = @sku,
          description = @description,
          points_per_unit = @points_per_unit,
          active = @active,
          updated_at = CURRENT_TIMESTAMP
    WHERE id = @id`
);
const deleteSkuPointStmt = db.prepare('DELETE FROM sku_points WHERE id = ?');

const insertSaleStmt = db.prepare(`
  INSERT INTO sales (
    influencer_id,
    order_number,
    date,
    gross_value,
    discount,
    net_value,
    commission,
    points
  ) VALUES (
    @influencer_id,
    @order_number,
    @date,
    @gross_value,
    @discount,
    @net_value,
    @commission,
    @points
  )
`);

const updateSaleStmt = db.prepare(`
  UPDATE sales SET
    influencer_id = @influencer_id,
    order_number = @order_number,
    date = @date,
    gross_value = @gross_value,
    discount = @discount,
    net_value = @net_value,
    commission = @commission,
    points = @points
  WHERE id = @id
`);

const deleteSaleStmt = db.prepare('DELETE FROM sales WHERE id = ?');
const findSaleByOrderNumberStmt = db.prepare('SELECT id FROM sales WHERE order_number = ?');
const findSaleByIdStmt = db.prepare(`
  SELECT s.id,
         s.influencer_id,
         s.order_number,
         s.date,
         s.gross_value,
         s.discount,
         s.net_value,
         s.commission,
         s.points,
         s.created_at,
         i.cupom,
         i.nome,
         i.commission_rate
  FROM sales s
  JOIN influenciadoras i ON i.id = s.influencer_id
  WHERE s.id = ?
`);
const listSalesByInfluencerStmt = db.prepare(`
  SELECT s.id,
         s.influencer_id,
         s.order_number,
         s.date,
         s.gross_value,
         s.discount,
         s.net_value,
         s.commission,
         s.points,
         s.created_at,
         i.cupom,
         i.nome,
         i.commission_rate
  FROM sales s
  JOIN influenciadoras i ON i.id = s.influencer_id
  WHERE s.influencer_id = ?
  ORDER BY s.date DESC, s.id DESC
`);
const salesSummaryStmt = db.prepare(
  'SELECT COALESCE(SUM(points), 0) AS total_points FROM sales WHERE influencer_id = ?'
);
const listInfluencerSummaryStmt = db.prepare(`
  SELECT i.id,
         i.nome,
         i.instagram,
         i.cupom,
         i.commission_rate,
         COALESCE(COUNT(s.id), 0) AS vendas_count,
         COALESCE(SUM(s.points), 0) AS vendas_total
  FROM influenciadoras i
  LEFT JOIN sales s ON s.influencer_id = i.id
  GROUP BY i.id
  ORDER BY LOWER(i.nome)
`);

const insertContentScriptStmt = db.prepare(
  'INSERT INTO content_scripts (titulo, descricao, created_by) VALUES (?, ?, ?)'
);
const listContentScriptsStmt = db.prepare(
  'SELECT id, titulo, descricao, created_at, updated_at FROM content_scripts ORDER BY datetime(created_at) DESC, id DESC'
);
const findContentScriptByIdStmt = db.prepare(
  'SELECT id, titulo, descricao, created_at, updated_at FROM content_scripts WHERE id = ?'
);
const listContentScriptsForMigrationStmt = db.prepare('SELECT id, descricao FROM content_scripts');
const updateContentScriptDescriptionStmt = db.prepare('UPDATE content_scripts SET descricao = ? WHERE id = ?');

const findCycleByIdStmt = db.prepare(
  'SELECT id, cycle_year, cycle_month, status, started_at, closed_at, created_at, updated_at FROM monthly_cycles WHERE id = ?'
);
const findCycleByYearMonthStmt = db.prepare(
  'SELECT id, cycle_year, cycle_month, status, started_at, closed_at, created_at, updated_at FROM monthly_cycles WHERE cycle_year = ? AND cycle_month = ? LIMIT 1'
);
const listCyclesStmt = db.prepare(
  'SELECT id, cycle_year, cycle_month, status, started_at, closed_at, created_at, updated_at FROM monthly_cycles ORDER BY cycle_year DESC, cycle_month DESC'
);
const listOpenCyclesStmt = db.prepare(
  "SELECT id, cycle_year, cycle_month, status, started_at, closed_at FROM monthly_cycles WHERE status = 'open' ORDER BY cycle_year DESC, cycle_month DESC"
);
const insertMonthlyCycleStmt = db.prepare(
  "INSERT INTO monthly_cycles (cycle_year, cycle_month, status, started_at, created_at, updated_at) VALUES (?, ?, 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
);
const closeCycleStmt = db.prepare(
  "UPDATE monthly_cycles SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
);
const touchCycleStmt = db.prepare('UPDATE monthly_cycles SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');

const deletePlansByScriptStmt = db.prepare(
  'DELETE FROM influencer_plans WHERE cycle_id = ? AND influencer_id = ? AND content_script_id = ?'
);
const deletePlanByIdStmt = db.prepare(
  'DELETE FROM influencer_plans WHERE id = ? AND cycle_id = ? AND influencer_id = ?'
);
const insertInfluencerPlanStmt = db.prepare(
  `INSERT INTO influencer_plans (cycle_id, influencer_id, scheduled_date, content_script_id, notes, status, created_at, updated_at)
   VALUES (@cycle_id, @influencer_id, @scheduled_date, @content_script_id, @notes, COALESCE(@status, 'scheduled'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
);
const updateInfluencerPlanStmt = db.prepare(
  `UPDATE influencer_plans
      SET scheduled_date = @scheduled_date,
          content_script_id = @content_script_id,
          notes = @notes,
          updated_at = CURRENT_TIMESTAMP
    WHERE id = @id`
);
const updateInfluencerPlanStatusStmt = db.prepare(
  "UPDATE influencer_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
);
const findPlanByScriptStmt = db.prepare(
  `SELECT id, status, scheduled_date
     FROM influencer_plans
    WHERE cycle_id = ? AND influencer_id = ? AND content_script_id = ?
 ORDER BY updated_at DESC, id DESC
    LIMIT 1`
);
const markMissedPlansStmt = db.prepare(
  `UPDATE influencer_plans
      SET status = 'missed', updated_at = CURRENT_TIMESTAMP
    WHERE cycle_id = ?
      AND influencer_id = ?
      AND status = 'scheduled'
      AND scheduled_date <= ?`
);
const listPlansByInfluencerStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.content_script_id,
          p.notes,
          p.status,
          p.created_at,
          p.updated_at,
          s.titulo AS script_title,
          s.descricao AS script_description
     FROM influencer_plans p
     LEFT JOIN content_scripts s ON s.id = p.content_script_id
    WHERE p.cycle_id = ?
      AND p.influencer_id = ?
    ORDER BY p.scheduled_date ASC, p.id ASC`
);
const listPlansForCycleStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.status,
          p.content_script_id,
          i.nome AS influencer_name,
          i.instagram,
          s.titulo AS script_title
     FROM influencer_plans p
     JOIN influenciadoras i ON i.id = p.influencer_id
     LEFT JOIN content_scripts s ON s.id = p.content_script_id
    WHERE p.cycle_id = ?
    ORDER BY p.scheduled_date ASC, LOWER(i.nome)`
);
const findPlanByIdStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.content_script_id,
          p.notes,
          p.status,
          p.created_at,
          p.updated_at
     FROM influencer_plans p
    WHERE p.id = ?`
);
const findPlanByDateStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.content_script_id,
          p.notes,
          p.status,
          p.created_at,
          p.updated_at
     FROM influencer_plans p
    WHERE p.cycle_id = ?
      AND p.influencer_id = ?
      AND p.scheduled_date = ?
    LIMIT 1`
);
const countPlansByInfluencerStmt = db.prepare(
  'SELECT COUNT(*) AS total FROM influencer_plans WHERE cycle_id = ? AND influencer_id = ?'
);
const countValidatedPlansStmt = db.prepare(
  "SELECT COUNT(*) AS total FROM influencer_plans WHERE cycle_id = ? AND influencer_id = ? AND status = 'validated'"
);
const listPendingPlanValidationsStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.status,
          i.nome AS influencer_name,
          i.instagram,
          s.titulo AS script_title
     FROM influencer_plans p
     JOIN influenciadoras i ON i.id = p.influencer_id
     LEFT JOIN content_scripts s ON s.id = p.content_script_id
    WHERE p.cycle_id = ?
      AND p.status = 'scheduled'
    ORDER BY p.scheduled_date ASC, LOWER(i.nome)`
);
const findPlanWithInfluencerStmt = db.prepare(
  `SELECT p.id,
          p.cycle_id,
          p.influencer_id,
          p.scheduled_date,
          p.status,
          p.content_script_id,
          p.notes,
          p.created_at,
          p.updated_at,
          i.nome AS influencer_name,
          i.instagram,
          s.titulo AS script_title
     FROM influencer_plans p
     JOIN influenciadoras i ON i.id = p.influencer_id
     LEFT JOIN content_scripts s ON s.id = p.content_script_id
    WHERE p.id = ?`
);
const listValidatedPlansStmt = db.prepare(
  `SELECT scheduled_date,
          content_script_id,
          notes
     FROM influencer_plans
    WHERE cycle_id = ?
      AND influencer_id = ?
      AND status = 'validated'
    ORDER BY scheduled_date`
);

const insertMonthlyCommissionStmt = db.prepare(
  `INSERT INTO monthly_commissions (
      cycle_id,
      influencer_id,
      validated_days,
      multiplier,
      base_commission,
      total_commission,
      base_points,
      total_points,
      deliveries_planned,
      deliveries_completed,
      validation_summary,
      closed_at
    ) VALUES (@cycle_id, @influencer_id, @validated_days, @multiplier, @base_commission, @total_commission, @base_points, @total_points, @deliveries_planned, @deliveries_completed, @validation_summary, CURRENT_TIMESTAMP)
    ON CONFLICT(cycle_id, influencer_id) DO UPDATE SET
      validated_days = excluded.validated_days,
      multiplier = excluded.multiplier,
      base_commission = excluded.base_commission,
      total_commission = excluded.total_commission,
      base_points = excluded.base_points,
      total_points = excluded.total_points,
      deliveries_planned = excluded.deliveries_planned,
      deliveries_completed = excluded.deliveries_completed,
      validation_summary = excluded.validation_summary,
      closed_at = CURRENT_TIMESTAMP`
);
const listMonthlyCommissionsByInfluencerStmt = db.prepare(
  `SELECT mc.id,
          mc.cycle_id,
          mc.validated_days,
          mc.multiplier,
          mc.base_commission,
          mc.total_commission,
          mc.base_points,
          mc.total_points,
          mc.deliveries_planned,
          mc.deliveries_completed,
          mc.validation_summary,
          mc.closed_at,
          c.cycle_year,
          c.cycle_month
     FROM monthly_commissions mc
     JOIN monthly_cycles c ON c.id = mc.cycle_id
    WHERE mc.influencer_id = ?
    ORDER BY c.cycle_year DESC, c.cycle_month DESC`
);
const listMonthlyRankingStmt = db.prepare(
  `SELECT mc.id,
          mc.cycle_id,
          mc.influencer_id,
          mc.validated_days,
          mc.multiplier,
          mc.total_commission,
          mc.base_commission,
          mc.total_points,
          mc.base_points,
          mc.deliveries_completed,
          i.nome,
          i.instagram,
          c.cycle_year,
          c.cycle_month
     FROM monthly_commissions mc
     JOIN influenciadoras i ON i.id = mc.influencer_id
     JOIN monthly_cycles c ON c.id = mc.cycle_id
    ORDER BY c.cycle_year DESC, c.cycle_month DESC, mc.total_commission DESC, mc.validated_days DESC`
);

const MASTER_DEFAULT_EMAIL = process.env.MASTER_EMAIL || 'master@example.com';
const MASTER_DEFAULT_PASSWORD = process.env.MASTER_PASSWORD || 'master123';

const ensureMasterUser = () => {
  const existingMaster = ensureSingleMasterStmt.get('master');
  if (existingMaster) {
    if (!existingMaster.password_hash) {
      const hash = bcrypt.hashSync(MASTER_DEFAULT_PASSWORD, 10);
      updateUserPasswordStmt.run(hash, existingMaster.id);
      console.log('Senha do master atualizada para padrao pois nao havia hash.');
    }
    return;
  }

  const hashedPassword = bcrypt.hashSync(MASTER_DEFAULT_PASSWORD, 10);
  insertUserStmt.run(MASTER_DEFAULT_EMAIL, null, null, hashedPassword, 'master', 0);
  console.log('--- Usuario master inicial criado ---');
  console.log(`Email: ${MASTER_DEFAULT_EMAIL}`);
  console.log(`Senha inicial: ${MASTER_DEFAULT_PASSWORD}`);
  console.log('Altere a senha quando desejar.');
};

ensureMasterUser();

const migrateContentScriptsToHtml = () => {
  const rows = listContentScriptsForMigrationStmt.all();
  let updatedCount = 0;

  rows.forEach((row) => {
    const current = trimString(row?.descricao) || '';
    if (!current) {
      return;
    }

    if (HTML_CONTENT_PATTERN.test(current)) {
      return;
    }

    const html = convertPlainTextToHtml(current);
    if (html && html !== current) {
      updateContentScriptDescriptionStmt.run(html, row.id);
      updatedCount += 1;
    }
  });

  if (updatedCount > 0) {
    console.log(`Atualizados ${updatedCount} roteiros para o formato HTML padrao.`);
  }
};

migrateContentScriptsToHtml();

const getCurrentCycleParts = (referenceDate = new Date()) => {
  const date = referenceDate instanceof Date ? referenceDate : new Date();
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return { year, month };
};

const formatCycleMonthStart = (year, month) => {
  const normalizedMonth = String(month).padStart(2, '0');
  return `${year}-${normalizedMonth}-01`;
};

const ensureMonthlyCycle = () => {
  const { year, month } = getCurrentCycleParts();
  let cycle = findCycleByYearMonthStmt.get(year, month);
  if (cycle && cycle.status === 'open') {
    return cycle;
  }

  db.exec('BEGIN');
  try {
    const openCycles = listOpenCyclesStmt.all();
    for (const openCycle of openCycles) {
      if (!openCycle) continue;
      if (openCycle.cycle_year === year && openCycle.cycle_month === month) {
        cycle = findCycleByIdStmt.get(openCycle.id);
        continue;
      }
      closeCycleStmt.run(openCycle.id);
    }

    if (!cycle) {
      const startedAt = formatCycleMonthStart(year, month);
      const result = insertMonthlyCycleStmt.run(year, month, startedAt);
      cycle = findCycleByIdStmt.get(result.lastInsertRowid);
    } else if (cycle.status !== 'open') {
      db.prepare(
        "UPDATE monthly_cycles SET status = 'open', closed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(cycle.id);
      cycle = findCycleByIdStmt.get(cycle.id);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return cycle;
};

const getCycleByIdOrCurrent = (cycleId) => {
  if (cycleId != null) {
    const id = Number(cycleId);
    if (Number.isInteger(id) && id > 0) {
      const cycle = findCycleByIdStmt.get(id);
      if (cycle) {
        return cycle;
      }
    }
  }
  return ensureMonthlyCycle();
};

const computeCycleEndDate = (cycle) => {
  if (!cycle) return null;
  const year = Number(cycle.cycle_year);
  const month = Number(cycle.cycle_month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }
  const nextMonthDate = new Date(Date.UTC(year, month, 0));
  const day = String(nextMonthDate.getUTCDate()).padStart(2, '0');
  const normalizedMonth = String(month).padStart(2, '0');
  return `${year}-${normalizedMonth}-${day}`;
};

ensureMonthlyCycle();

const normalizeDigits = (value) => (value || '').replace(/\D/g, '');

const extractUserPhoneData = (value) => {
  const trimmed = trimString(value);
  if (!trimmed) {
    return { phone: null, phoneNormalized: null };
  }

  const digits = normalizeDigits(trimmed);
  if (!digits) {
    return { phone: trimmed, phoneNormalized: null };
  }

  return { phone: trimmed, phoneNormalized: digits };
};

const isLikelyPhone = (value) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const digits = normalizeDigits(trimmed);
  if (digits.length < 10) return false;
  return /^[+\d()[\]\s-]+$/.test(trimmed);
};

const findUserByIdentifier = (identifier) => {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const digits = normalizeDigits(trimmed);
  const hasPhoneLength = digits.length >= 10;

  if (hasPhoneLength && (isLikelyPhone(trimmed) || !validators.email(trimmed))) {
    const phoneMatch = findUserByPhoneStmt.get(digits);
    if (phoneMatch) {
      return phoneMatch;
    }
  }

  if (validators.email(trimmed)) {
    const user = findUserByEmailStmt.get(trimmed);
    if (user) return user;
  }

  if (hasPhoneLength) {
    const phoneFallback = findUserByPhoneStmt.get(digits);
    if (phoneFallback) {
      return phoneFallback;
    }

    const identifiers = listInfluencerLoginIdentifiersStmt.all();
    const contactMatch = identifiers.find((row) => normalizeDigits(row.contato) === digits);
    if (contactMatch?.user_id) {
      return findUserByIdStmt.get(contactMatch.user_id) || null;
    }
  }

  return findUserByEmailStmt.get(trimmed) || null;
};

const generateToken = (user) => jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao informado.' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = findUserByIdStmt.get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuario nao encontrado.' });
    }
    req.auth = { token, user };
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
};

const authorizeMaster = (req, res, next) => {
  if (req.auth?.user?.role !== 'master') {
    return res.status(403).json({ error: 'Acesso restrito ao usuario master.' });
  }
  return next();
};

const aceiteRouter = createAceiteRouter({ authenticate });
app.use('/api', aceiteRouter);

const truthyBooleanValues = new Set(['1', 'true', 'on', 'yes', 'sim', 'y', 's', 'dispensa', 'dispensado', 'dispensada']);
const falsyBooleanValues = new Set(['0', 'false', 'off', 'no', 'nao', 'não', 'n']);

const normalizeBooleanInput = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const asciiNormalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (truthyBooleanValues.has(asciiNormalized) || truthyBooleanValues.has(normalized)) {
      return true;
    }
    if (falsyBooleanValues.has(asciiNormalized) || falsyBooleanValues.has(normalized)) {
      return false;
    }
    return undefined;
  }
  return undefined;
};

const pickBooleanValue = (source, keys) => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
};

const normalizeInfluencerPayload = (body) => {
  const contractWaiverRaw = pickBooleanValue(body, [
    'contractSignatureWaived',
    'contract_signature_waived',
    'contractWaived',
    'waiveContractSignature',
    'dispensaAssinaturaContrato',
    'dispensaAssinatura',
    'dispensaContrato',
    'dispensarContrato'
  ]);
  const contractSignatureWaived = normalizeBooleanInput(contractWaiverRaw);

  const normalized = {
    nome: trimString(body.nome),
    instagram: trimString(body.instagram),
    cpf: trimString(body.cpf),
    email: trimString(body.email),
    contato: trimString(body.contato),
    cupom: trimString(body.cupom),
    vendasQuantidade: trimString(body.vendasQuantidade),
    vendasValor: trimString(body.vendasValor),
    cep: trimString(body.cep),
    numero: trimString(body.numero),
    complemento: trimString(body.complemento),
    logradouro: trimString(body.logradouro),
    bairro: trimString(body.bairro),
    cidade: trimString(body.cidade),
    estado: trimString(body.estado),
    commissionPercent: trimString(body.commissionPercent ?? body.commission_rate ?? body.commission),
    contractSignatureWaived
  };

  const missing = [];
  if (!normalized.nome) missing.push('nome');
  if (!normalized.instagram) missing.push('instagram');
  if (missing.length) {
    return { error: { error: 'Campos obrigatorios faltando.', campos: missing } };
  }

  const cpfDigits = normalizeDigits(normalized.cpf);
  let formattedCpf = null;
  if (cpfDigits) {
    if (cpfDigits.length !== 11 || /^(\d)\1{10}$/.test(cpfDigits)) {
      return { error: { error: 'CPF invalido.' } };
    }
    const calc = (len) => {
      let sum = 0;
      for (let i = 0; i < len; i += 1) sum += Number(cpfDigits[i]) * (len + 1 - i);
      const result = (sum * 10) % 11;
      return result === 10 ? 0 : result;
    };
    if (calc(9) !== Number(cpfDigits[9]) || calc(10) !== Number(cpfDigits[10])) {
      return { error: { error: 'CPF invalido.' } };
    }
    formattedCpf = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
  }

  const contatoDigits = normalizeDigits(normalized.contato);
  let formattedContato = null;
  if (contatoDigits) {
    if (contatoDigits.length !== 10 && contatoDigits.length !== 11) {
      return { error: { error: 'Contato deve conter DDD + numero (10 ou 11 digitos).' } };
    }
    const ddd = contatoDigits.slice(0, 2);
    const middleLen = contatoDigits.length === 11 ? 5 : 4;
    const middle = contatoDigits.slice(2, 2 + middleLen);
    const suffix = contatoDigits.slice(2 + middleLen);
    formattedContato = `(${ddd}) ${middle}${suffix ? `-${suffix}` : ''}`;
  }

  const cepDigits = normalizeDigits(normalized.cep);
  let formattedCep = null;
  if (cepDigits) {
    if (cepDigits.length !== 8) {
      return { error: { error: 'CEP invalido.' } };
    }
    formattedCep = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;
  }

  let vendasQuantidade = 0;
  if (normalized.vendasQuantidade) {
    const parsed = Number(normalized.vendasQuantidade);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: { error: 'VendasQuantidade precisa ser um numero inteiro maior ou igual a zero.' } };
    }
    vendasQuantidade = parsed;
  }

  let vendasValor = 0;
  if (normalized.vendasValor) {
    const parsed = Number(normalized.vendasValor);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: { error: 'VendasValor precisa ser um numero maior ou igual a zero.' } };
    }
    vendasValor = Number(parsed.toFixed(2));
  }

  let commissionRate = 0;
  if (normalized.commissionPercent) {
    const parsed = Number(normalized.commissionPercent);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { error: { error: 'Comissao deve estar entre 0 e 100.' } };
    }
    commissionRate = Number(parsed.toFixed(2));
  }

  const estadoValue = normalized.estado ? normalized.estado.toUpperCase() : null;

  const data = {
    nome: normalized.nome,
    instagram: normalized.instagram.startsWith('@') ? normalized.instagram : `@${normalized.instagram}`,
    cpf: formattedCpf,
    email: normalized.email || null,
    contato: formattedContato,
    cupom: normalized.cupom || null,
    vendas_quantidade: vendasQuantidade,
    vendas_valor: vendasValor,
    cep: formattedCep,
    numero: normalized.numero || null,
    complemento: normalized.complemento || null,
    logradouro: normalized.logradouro || null,
    bairro: normalized.bairro || null,
    cidade: normalized.cidade || null,
    estado: estadoValue || null,
    commission_rate: commissionRate
  };

  if (contractSignatureWaived != null) {
    data.contract_signature_waived = contractSignatureWaived ? 1 : 0;
  }

  return { data };
};

const normalizeOrderNumber = (value) => {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const stripBom = (value) => {
  if (!value) return '';
  return value.replace(/^[\uFEFF\u200B]+/, '');
};

const normalizeImportHeader = (header) =>
  stripBom(String(header || '')).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

const detectImportDelimiter = (line) => {
  const tab = '\t';
  if (line.includes(tab)) return tab;
  if (line.includes(';')) return ';';
  if (line.includes(',')) return ',';
  return null;
};

const parseImportDecimal = (value) => {
  if (value == null) return { value: 0 };
  const trimmed = stripBom(String(value)).trim();
  if (!trimmed) return { value: 0 };
  let normalized = trimmed.replace(/\s+/g, '');
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { error: 'Valor numerico invalido.' };
  }
  return { value: roundCurrency(parsed) };
};

const parseImportDate = (value) => {
  if (!value) {
    return { error: 'Informe a data da venda.' };
  }
  const trimmed = stripBom(String(value)).trim();
  if (!trimmed) {
    return { error: 'Informe a data da venda.' };
  }
  const match = trimmed.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/
  );
  if (!match) {
    return { error: 'Data invalida. Use o formato DD/MM/AAAA.' };
  }
  let [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 100) {
    year += 2000;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
    return { error: 'Data invalida. Use o formato DD/MM/AAAA.' };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return { error: 'Data invalida. Use o formato DD/MM/AAAA.' };
  }
  const iso = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { value: iso };
};

const splitDelimitedLine = (line, delimiter) => {
  if (!delimiter) {
    return line.split(',').map((value) => stripBom(value).trim());
  }
  const result = [];
  let current = '';
  let insideQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (!insideQuotes && char === delimiter) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((value) => stripBom(value).trim());
};

const parseDelimitedRows = (text, delimiter) => {
  const rows = [];
  let current = '';
  let row = [];
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (!insideQuotes && char === delimiter) {
      row.push(current);
      current = '';
    } else if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  if (row.length || current) {
    row.push(current);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((value) => stripBom(value).trim()));
};

const influencerImportColumnAliases = {
  nome: ['nome', 'name', 'nomecompleto'],
  instagram: ['instagram', 'perfil', 'usuarioinstagram', 'handle'],
  emailContato: ['email', 'emailcontato', 'emailprincipal', 'contatoemail'],
  loginEmail: ['emailacesso', 'emaillogin', 'loginemail', 'emaillogin'],
  cpf: ['cpf', 'documento', 'cpfapenasnumeros', 'cpfdigitos'],
  contato: ['contato', 'telefone', 'celular', 'whatsapp', 'telefonecontato'],
  cupom: ['cupom', 'coupon', 'codigo'],
  commissionPercent: ['comissao', 'comissaopercentual', 'percentualcomissao', 'comission'],
  cep: ['cep', 'codigopostal'],
  numero: ['numero', 'num', 'n'],
  complemento: ['complemento', 'compl'],
  logradouro: ['logradouro', 'endereco', 'rua'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio'],
  estado: ['estado', 'uf'],
  vendasQuantidade: ['vendasquantidade', 'quantidadevendas', 'qtdvendas'],
  vendasValor: ['vendasvalor', 'valorvendas', 'totalvendas'],
  contractSignatureWaived: [
    'dispensacontrato',
    'dispensaassinatura',
    'dispensa',
    'waivecontract',
    'contractwaived',
    'dispensarcontrato'
  ]
};

const analyzeInfluencerImport = (rawText) => {
  const text = stripBom(trimString(rawText || ''));
  if (!text) {
    return { error: 'Envie o conteúdo do CSV para realizar a importação.' };
  }

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripBom(line).replace(/[\u0000-\u0008\u000B-\u001F]+/g, '').trimEnd());

  const defaultColumns = [
    'nome',
    'instagram',
    'emailContato',
    'loginEmail',
    'cpf',
    'contato',
    'cupom',
    'commissionPercent',
    'cep',
    'numero',
    'complemento',
    'logradouro',
    'bairro',
    'cidade',
    'estado',
    'vendasQuantidade',
    'vendasValor',
    'contractSignatureWaived'
  ];

  let delimiter = ',';
  let headerProcessed = false;
  const columnIndexes = {};
  defaultColumns.forEach((column, index) => {
    columnIndexes[column] = index;
  });

  const rows = [];
  const seenInstagram = new Set();
  const seenLoginEmail = new Set();
  const seenCpf = new Set();
  const seenEmailContato = new Set();
  const seenContato = new Set();
  const seenCupom = new Set();

  let lineNumber = 0;

  for (const originalLine of lines) {
    lineNumber += 1;
    const line = originalLine.trim();
    if (!line) {
      continue;
    }

    if (!headerProcessed) {
      delimiter = detectImportDelimiter(line) || delimiter;
      const tokens = splitDelimitedLine(line, delimiter);
      const normalizedTokens = tokens.map((token) => normalizeImportHeader(token));
      let recognized = 0;
      normalizedTokens.forEach((token, index) => {
        for (const [key, aliases] of Object.entries(influencerImportColumnAliases)) {
          if (aliases.includes(token)) {
            columnIndexes[key] = index;
            recognized += 1;
            break;
          }
        }
      });
      if (recognized >= 2) {
        headerProcessed = true;
        continue;
      }
      headerProcessed = true;
    }

    delimiter = detectImportDelimiter(line) || delimiter;
    const cells = splitDelimitedLine(line, delimiter);

    const getCell = (key) => {
      const index = columnIndexes[key];
      if (index == null || index >= cells.length) return '';
      return stripBom(cells[index]).trim();
    };

    const raw = {
      nome: getCell('nome'),
      instagram: getCell('instagram'),
      emailContato: getCell('emailContato'),
      loginEmail: getCell('loginEmail'),
      cpf: getCell('cpf'),
      contato: getCell('contato'),
      cupom: getCell('cupom'),
      commissionPercent: getCell('commissionPercent'),
      cep: getCell('cep'),
      numero: getCell('numero'),
      complemento: getCell('complemento'),
      logradouro: getCell('logradouro'),
      bairro: getCell('bairro'),
      cidade: getCell('cidade'),
      estado: getCell('estado'),
      vendasQuantidade: getCell('vendasQuantidade'),
      vendasValor: getCell('vendasValor'),
      contractSignatureWaived: getCell('contractSignatureWaived')
    };

    const displayRow = {
      line: lineNumber,
      nome: trimString(raw.nome) || '',
      instagram: trimString(raw.instagram) || '',
      emailContato: trimString(raw.emailContato) || '',
      loginEmail: '',
      cpf: trimString(raw.cpf) || '',
      cupom: trimString(raw.cupom) || '',
      cidade: trimString(raw.cidade) || '',
      estado: trimString(raw.estado) || '',
      errors: [],
      normalized: null
    };

    const payload = {
      nome: raw.nome,
      instagram: raw.instagram,
      email: raw.emailContato,
      contato: raw.contato,
      cpf: raw.cpf,
      cupom: raw.cupom,
      commissionPercent: raw.commissionPercent,
      vendasQuantidade: raw.vendasQuantidade,
      vendasValor: raw.vendasValor,
      cep: raw.cep,
      numero: raw.numero,
      complemento: raw.complemento,
      logradouro: raw.logradouro,
      bairro: raw.bairro,
      cidade: raw.cidade,
      estado: raw.estado,
      contractSignatureWaived: raw.contractSignatureWaived
    };

    const { data, error } = normalizeInfluencerPayload(payload);
    if (error) {
      displayRow.errors.push(error.error || 'Dados inválidos.');
    }

    const loginEmail = trimString(raw.loginEmail) || trimString(raw.emailContato) || '';
    displayRow.loginEmail = loginEmail;
    let normalizedLoginEmail = null;
    if (loginEmail) {
      if (!validators.email(loginEmail)) {
        displayRow.errors.push('Email de acesso inválido.');
      } else {
        normalizedLoginEmail = loginEmail;
      }
    }

    if (!displayRow.errors.length && data) {
      const normalizedInstagram = data.instagram ? data.instagram.toLowerCase() : null;
      if (normalizedInstagram) {
        if (seenInstagram.has(normalizedInstagram)) {
          displayRow.errors.push('Instagram duplicado no arquivo.');
        } else {
          seenInstagram.add(normalizedInstagram);
          const existing = findInfluencerIdByInstagramStmt.get(data.instagram);
          if (existing) {
            displayRow.errors.push('Instagram já cadastrado.');
          }
        }
      }

      if (normalizedLoginEmail) {
        const normalizedEmail = normalizedLoginEmail.toLowerCase();
        if (seenLoginEmail.has(normalizedEmail)) {
          displayRow.errors.push('Email de acesso duplicado no arquivo.');
        } else {
          seenLoginEmail.add(normalizedEmail);
          if (findUserByEmailStmt.get(normalizedLoginEmail)) {
            displayRow.errors.push('Email de acesso já cadastrado.');
          }
        }
      }

      const normalizedCpfDigits = data.cpf ? normalizeDigits(data.cpf) : null;
      if (normalizedCpfDigits) {
        if (seenCpf.has(normalizedCpfDigits)) {
          displayRow.errors.push('CPF duplicado no arquivo.');
        } else {
          seenCpf.add(normalizedCpfDigits);
          if (findInfluencerIdByCpfStmt.get(normalizedCpfDigits)) {
            displayRow.errors.push('CPF já cadastrado.');
          }
        }
      }

      if (data.email) {
        const normalizedEmailContato = data.email.toLowerCase();
        if (seenEmailContato.has(normalizedEmailContato)) {
          displayRow.errors.push('Email de contato duplicado no arquivo.');
        } else {
          seenEmailContato.add(normalizedEmailContato);
          if (findInfluencerIdByEmailStmt.get(data.email)) {
            displayRow.errors.push('Email de contato já cadastrado.');
          }
        }
      }

      const normalizedContatoDigits = data.contato ? normalizeDigits(data.contato) : null;
      if (normalizedContatoDigits) {
        if (seenContato.has(normalizedContatoDigits)) {
          displayRow.errors.push('Telefone duplicado no arquivo.');
        } else {
          seenContato.add(normalizedContatoDigits);
          if (findInfluencerIdByContatoStmt.get(normalizedContatoDigits)) {
            displayRow.errors.push('Telefone já cadastrado.');
          }
        }
      }

      if (data.cupom) {
        const normalizedCupom = data.cupom.toLowerCase();
        if (seenCupom.has(normalizedCupom)) {
          displayRow.errors.push('Cupom duplicado no arquivo.');
        } else {
          seenCupom.add(normalizedCupom);
          if (findInfluencerIdByCupomStmt.get(data.cupom)) {
            displayRow.errors.push('Cupom já cadastrado.');
          }
        }
      }
    }

    if (data) {
      displayRow.nome = data.nome;
      displayRow.instagram = data.instagram;
      displayRow.cpf = data.cpf || '';
      displayRow.cupom = data.cupom || '';
      displayRow.cidade = data.cidade || '';
      displayRow.estado = data.estado || '';
    }

    if (!displayRow.errors.length && data) {
      const normalizedCpfDigits = data.cpf ? normalizeDigits(data.cpf) : null;
      displayRow.normalized = {
        data,
        loginEmail: normalizedLoginEmail,
        provisionalPassword: normalizedCpfDigits || null
      };
    }

    rows.push(displayRow);
  }

  if (!rows.length) {
    return { error: 'Nenhuma influenciadora foi encontrada no arquivo informado.' };
  }

  const validRows = rows.filter((row) => !row.errors.length && row.normalized);

  return {
    rows,
    totalCount: rows.length,
    validCount: validRows.length,
    errorCount: rows.length - validRows.length,
    hasErrors: rows.some((row) => row.errors.length > 0)
  };
};

const buildSalesImportAnalysis = (entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    return { error: 'Nenhuma venda encontrada nos dados informados.' };
  }

  const rows = entries.map((entry) => ({
    line: entry.line,
    orderNumber: entry.orderNumber ?? '',
    cupom: entry.cupom ?? '',
    rawDate: entry.rawDate ?? '',
    rawPoints: entry.rawPoints ?? (entry.totalPoints != null ? String(entry.totalPoints) : ''),
    skuDetails: Array.isArray(entry.skuDetails) ? entry.skuDetails : [],
    errors: [],
    source: entry
  }));

  rows.forEach((row) => {
    const normalizedOrder = normalizeOrderNumber(row.orderNumber);
    const normalizedCupom = trimString(row.cupom) || '';

    const { value: isoDate, error: dateError } = parseImportDate(row.rawDate);
    if (dateError) {
      row.errors.push(dateError);
    }

    let points = null;
    if (row.source && row.source.totalPoints != null) {
      points = roundPoints(row.source.totalPoints);
    } else {
      const parsedPoints = parsePointsValue(row.rawPoints, 'Pontos');
      if (parsedPoints.error) {
        row.errors.push(parsedPoints.error);
      } else {
        points = parsedPoints.value;
      }
    }

    const normalizedDetails = row.skuDetails.map((detail) => {
      const sku = trimString(detail?.sku) || '';
      const quantityValue = Number(detail?.quantity ?? detail?.quantityRaw);
      const quantity = Number.isFinite(quantityValue) ? quantityValue : null;
      const pointsPerUnit = detail?.pointsPerUnit != null ? Number(detail.pointsPerUnit) : null;
      const lineNumber = detail?.line != null ? detail.line : row.line;

      if (!sku) {
        row.errors.push(`SKU nao informado na linha ${lineNumber}.`);
      }

      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        row.errors.push(`Quantidade invalida para SKU ${sku || '(sem SKU)'} na linha ${lineNumber}.`);
      }

      if (pointsPerUnit == null || pointsPerUnit < 0) {
        row.errors.push(`SKU ${sku || '(sem SKU)'} nao possui pontuacao cadastrada.`);
      }

      const computedPoints =
        pointsPerUnit != null && quantity != null && quantity > 0 ? roundPoints(quantity * pointsPerUnit) : null;

      return {
        sku,
        quantity,
        line: lineNumber,
        pointsPerUnit,
        points: computedPoints
      };
    });

    let influencer = null;
    if (!normalizedCupom) {
      row.errors.push('Cupom nao cadastrado.');
    } else {
      influencer = findInfluencerByCouponStmt.get(normalizedCupom);
      if (!influencer) {
        row.errors.push('Cupom nao cadastrado.');
      }
    }

    row.normalized = {
      orderNumber: normalizedOrder,
      cupom: normalizedCupom,
      date: isoDate,
      points,
      skuDetails: normalizedDetails,
      influencer
    };
  });

  const orderOccurrences = new Map();
  rows.forEach((row) => {
    const order = row.normalized?.orderNumber ?? normalizeOrderNumber(row.orderNumber);
    if (!order) return;
    if (!orderOccurrences.has(order)) {
      orderOccurrences.set(order, []);
    }
    orderOccurrences.get(order).push(row);
  });

  rows.forEach((row) => {
    const normalizedOrder = row.normalized?.orderNumber ?? null;
    const duplicates = normalizedOrder ? orderOccurrences.get(normalizedOrder) || [] : [];
    if (duplicates.length > 1) {
      row.errors.push('Numero de pedido repetido nos dados importados.');
    }

    const existingSale = normalizedOrder ? findSaleByOrderNumberStmt.get(normalizedOrder) : null;
    if (existingSale) {
      row.errors.push('Numero de pedido ja cadastrado.');
    }

    if (!normalizedOrder) {
      row.errors.push('Informe o numero do pedido.');
    }

    if (!row.normalized?.date) {
      row.errors.push('Informe a data da venda.');
    }

    if (row.normalized?.points == null && row.normalized?.skuDetails?.length) {
      const hasAllDetails = row.normalized.skuDetails.every((detail) => detail.points != null);
      if (hasAllDetails) {
        const totalFromSkus = row.normalized.skuDetails.reduce((sum, detail) => sum + (detail.points || 0), 0);
        row.normalized.points = roundPoints(totalFromSkus);
      }
    }

    if (row.normalized?.points == null) {
      row.errors.push('Informe a pontuacao da venda.');
    }
  });

  const results = rows.map((row) => {
    const influencer = row.normalized?.influencer;
    const points = row.normalized?.points != null ? roundPoints(row.normalized.points) : 0;
    const pointsValue = pointsToBrl(points);
    const normalizedOrder = row.normalized?.orderNumber ?? normalizeOrderNumber(row.orderNumber);

    return {
      line: row.line,
      orderNumber: normalizedOrder,
      cupom: row.normalized?.cupom || '',
      date: row.normalized?.date || null,
      points,
      pointsValue,
      points_value: pointsValue,
      influencerId: influencer?.id ?? null,
      influencerName: influencer?.nome ?? null,
      errors: row.errors,
      rawDate: row.rawDate,
      rawPoints: row.rawPoints,
      skuDetails: row.normalized?.skuDetails || []
    };
  });

  const validRows = results.filter((row) => row && !row.errors.length && row.influencerId);
  const totalPoints = validRows.reduce((sum, row) => sum + (row.points || 0), 0);
  const summary = {
    count: validRows.length,
    total_points: totalPoints,
    total_points_value: pointsToBrl(totalPoints),
    point_value_brl: POINT_VALUE_BRL
  };

  return {
    rows: results,
    summary,
    totalCount: results.length,
    validCount: validRows.length,
    errorCount: results.length - validRows.length,
    hasErrors: results.some((row) => row.errors.length > 0)
  };
};

const parseManualSalesImport = (text) => {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      stripBom(line)
        .replace(/[\u0000-\u0008\u000A-\u001F]+/g, '')
        .trimEnd()
    );

  const columnAliases = {
    orderNumber: ['pedido', 'numero', 'ordem', 'ordernumber', 'numeropedido'],
    cupom: ['cupom', 'coupon'],
    date: ['data', 'date'],
    points: ['pontos', 'points', 'pontuacao', 'pontuacoes', 'pontuacao_total']
  };

  const columnIndexes = { orderNumber: 0, cupom: 1, date: 2, points: 3 };
  let delimiter = null;
  let dataStarted = false;
  let lineNumber = 0;

  const rows = [];

  for (const originalLine of lines) {
    lineNumber += 1;
    const line = originalLine.trim();
    if (!line) {
      continue;
    }

    if (!dataStarted) {
      delimiter = detectImportDelimiter(line) || delimiter;
      const tokens = delimiter ? line.split(delimiter) : line.split(/\s{2,}|\s/);
      const normalizedTokens = tokens.map((token) => normalizeImportHeader(token));
      const hasHeaderKeywords = normalizedTokens.some((token) => token.includes('pedido'));
      if (hasHeaderKeywords) {
        normalizedTokens.forEach((token, index) => {
          for (const [key, aliases] of Object.entries(columnAliases)) {
            if (aliases.includes(token)) {
              columnIndexes[key] = index;
              break;
            }
          }
        });
        dataStarted = true;
        continue;
      }
      dataStarted = true;
    }

    delimiter = detectImportDelimiter(line) || delimiter;
    const cells = delimiter ? line.split(delimiter) : line.split(/\s{2,}|\s/);

    const getCell = (column) => {
      const index = columnIndexes[column];
      if (index == null || index >= cells.length) return '';
      return stripBom(cells[index]).trim();
    };

    rows.push({
      line: lineNumber,
      orderNumber: getCell('orderNumber'),
      cupom: getCell('cupom'),
      rawDate: getCell('date'),
      rawPoints: getCell('points')
    });
  }

  return { rows };
};

const formatShopifyPaidAtDate = (value) => {
  const trimmed = stripBom(String(value || '')).trim();
  if (!trimmed) return '';
  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!isoMatch) {
    return trimmed;
  }
  const [, year, month, day] = isoMatch;
  return `${day}/${month}/${year}`;
};

const tryParseShopifySalesImport = (text) => {
  const firstLineBreak = text.indexOf('\n');
  const headerLine = firstLineBreak >= 0 ? text.slice(0, firstLineBreak) : text;
  const normalizedHeaderLine = normalizeImportHeader(headerLine);
  const requiredHeaders = ['name', 'paidat', 'discountcode', 'lineitemquantity', 'lineitemsku'];
  const isShopifyExport = requiredHeaders.every((header) => normalizedHeaderLine.includes(header));
  if (!isShopifyExport) {
    return null;
  }

  const delimiter = detectImportDelimiter(headerLine) || ',';
  const rows = parseDelimitedRows(text, delimiter);
  if (!rows.length) {
    return { error: 'Arquivo CSV sem conteudo.' };
  }

  const header = rows[0];
  const normalizedHeader = header.map((cell) => normalizeImportHeader(cell));

  const resolveIndex = (aliases) => {
    for (const alias of aliases) {
      const index = normalizedHeader.indexOf(alias);
      if (index >= 0) {
        return index;
      }
    }
    return -1;
  };

  const nameIndex = resolveIndex(['name']);
  const paidAtIndex = resolveIndex(['paidat']);
  const couponIndex = resolveIndex(['discountcode', 'discountcodes']);
  const quantityIndex = resolveIndex(['lineitemquantity']);
  const skuIndex = resolveIndex(['lineitemsku']);

  if (nameIndex < 0 || paidAtIndex < 0 || couponIndex < 0 || quantityIndex < 0 || skuIndex < 0) {
    return { error: 'Nao foi possivel identificar as colunas obrigatorias do CSV.' };
  }

  const skuPointsMap = new Map();
  listActiveSkuPointsStmt
    .all()
    .filter((row) => row && row.sku)
    .forEach((row) => {
      const skuKey = String(row.sku).trim().toLowerCase();
      if (!skuKey) {
        return;
      }
      const points = Number(row.points_per_unit);
      skuPointsMap.set(skuKey, Number.isFinite(points) && points >= 0 ? points : 0);
    });

  const entryMap = new Map();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    if (!cells || !cells.length) {
      continue;
    }

    const hasData = cells.some((cell) => stripBom(cell || '').trim().length > 0);
    if (!hasData) {
      continue;
    }

    const orderRaw = stripBom(cells[nameIndex] || '').trim();
    if (!orderRaw) {
      continue;
    }

    const paidAtRaw = stripBom(cells[paidAtIndex] || '').trim();
    const couponRaw = stripBom(cells[couponIndex] || '').trim();
    const quantityRaw = stripBom(cells[quantityIndex] || '').trim();
    const skuRaw = stripBom(cells[skuIndex] || '').trim();

    const key = orderRaw;
    if (!entryMap.has(key)) {
      entryMap.set(key, {
        line: rowIndex + 1,
        orderNumber: orderRaw,
        rawDate: paidAtRaw ? formatShopifyPaidAtDate(paidAtRaw) : '',
        cupom: couponRaw,
        skuDetails: []
      });
    }

    const entry = entryMap.get(key);
    if (!entry) {
      continue;
    }

    if (paidAtRaw && !entry.rawDate) {
      entry.rawDate = formatShopifyPaidAtDate(paidAtRaw);
    }
    if (couponRaw && !entry.cupom) {
      entry.cupom = couponRaw;
    }

    if (!skuRaw && !quantityRaw) {
      continue;
    }

    const quantity = Number(quantityRaw);
    const skuKey = skuRaw ? skuRaw.toLowerCase() : '';
    const pointsPerUnit = skuKey ? skuPointsMap.get(skuKey) ?? null : null;

    entry.skuDetails.push({
      sku: skuRaw,
      quantityRaw,
      quantity: Number.isFinite(quantity) ? quantity : null,
      pointsPerUnit,
      points:
        Number.isFinite(quantity) && pointsPerUnit != null
          ? roundPoints(quantity * pointsPerUnit)
          : null,
      line: rowIndex + 1
    });
  }

  const entries = Array.from(entryMap.values()).map((entry) => {
    const details = entry.skuDetails.map((detail) => {
      let quantity = detail.quantity;
      if (quantity == null) {
        const parsed = Number(String(detail.quantityRaw || '').replace(',', '.'));
        quantity = Number.isFinite(parsed) ? parsed : null;
      }
      const pointsPerUnit = detail.pointsPerUnit != null ? Number(detail.pointsPerUnit) : null;
      const computedPoints =
        pointsPerUnit != null && quantity != null ? roundPoints(quantity * pointsPerUnit) : null;
      return {
        sku: detail.sku,
        quantity,
        quantityRaw: detail.quantityRaw,
        pointsPerUnit,
        points: computedPoints,
        line: detail.line
      };
    });

    const allPointsKnown = details.length > 0 && details.every((detail) => detail.points != null);
    const totalPoints = allPointsKnown
      ? details.reduce((sum, detail) => sum + (detail.points || 0), 0)
      : null;

    return {
      line: entry.line,
      orderNumber: entry.orderNumber,
      cupom: entry.cupom || '',
      rawDate: entry.rawDate || '',
      rawPoints: totalPoints != null ? String(totalPoints) : '',
      totalPoints,
      skuDetails: details
    };
  });

  const filteredEntries = entries.filter((entry) => entry && entry.orderNumber);
  if (!filteredEntries.length) {
    return { error: 'Nenhum pedido valido foi encontrado no arquivo CSV informado.' };
  }

  return { rows: filteredEntries };
};

const analyzeSalesImport = (rawText) => {
  const text = stripBom(trimString(rawText || ''));
  if (!text) {
    return { error: 'Cole os dados das vendas para realizar a importacao.' };
  }

  const shopifyResult = tryParseShopifySalesImport(text);
  if (shopifyResult) {
    if (shopifyResult.error) {
      return shopifyResult;
    }
    return buildSalesImportAnalysis(shopifyResult.rows);
  }

  const manualResult = parseManualSalesImport(text);
  return buildSalesImportAnalysis(manualResult.rows);
};

const insertImportedSales = db.transaction((rows) => {
  const created = [];
  rows
    .filter((row) => row && !row.errors?.length && row.influencerId)
    .forEach((row) => {
      const result = insertSaleStmt.run({
        influencer_id: row.influencerId,
        order_number: row.orderNumber,
        date: row.date,
        gross_value: 0,
        discount: 0,
        net_value: 0,
        commission: pointsToBrl(row.points),
        points: row.points
      });
      const sale = findSaleByIdStmt.get(result.lastInsertRowid);
      created.push(formatSaleRow(sale));
    });
  return created;
});

const insertImportedInfluencers = db.transaction((rows) => {
  const created = [];
  rows.forEach((row) => {
    const mustChange = row.mustChange ?? 0;
    let userId = null;
    if (row.loginEmail && row.passwordHash) {
      const phoneData = extractUserPhoneData(row.data?.contato);
      const userResult = insertUserStmt.run(
        row.loginEmail,
        phoneData.phone,
        phoneData.phoneNormalized,
        row.passwordHash,
        'influencer',
        mustChange
      );
      userId = userResult.lastInsertRowid;
    }
    const influencerResult = insertInfluencerStmt.run({
      ...row.data,
      contract_signature_code_hash: row.signatureHash || null,
      contract_signature_code_generated_at: row.generatedAt || null,
      user_id: userId
    });
    created.push({
      influencerId: influencerResult.lastInsertRowid,
      userId,
      loginEmail: row.loginEmail || null,
      provisionalPassword: row.provisionalPassword || null,
      signatureCode: row.signatureCode || null
    });
  });
  return created;
});

const formatSaleRow = (row) => {
  const orderNumber = normalizeOrderNumber(
    row?.order_number ?? row?.orderNumber ?? row?.pedido ?? null
  );

  const points = row?.points != null ? Number(row.points) : 0;
  const pointsValue = pointsToBrl(points);

  return {
    id: row.id,
    influencer_id: row.influencer_id,
    order_number: orderNumber,
    orderNumber,
    cupom: row.cupom || null,
    nome: row.nome || null,
    date: row.date,
    gross_value: Number(row.gross_value),
    discount: Number(row.discount),
    net_value: Number(row.net_value),
    commission: Number(row.commission),
    points,
    points_value: pointsValue,
    pointsValue,
    commission_rate: row.commission_rate != null ? Number(row.commission_rate) : 0,
    created_at: row.created_at
  };
};

const formatSkuPointRow = (row) => {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    sku: row.sku,
    description: row.description || null,
    points_per_unit: row.points_per_unit != null ? Number(row.points_per_unit) : 0,
    active: row.active ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const createInfluencerTransaction = db.transaction((influencerPayload, userPayload) => {
  const mustChange = userPayload.mustChange ?? 0;
  const userResult = insertUserStmt.run(
    userPayload.email,
    userPayload.phone ?? null,
    userPayload.phoneNormalized ?? null,
    userPayload.passwordHash,
    'influencer',
    mustChange
  );
  const userId = userResult.lastInsertRowid;
  const influencerResult = insertInfluencerStmt.run({ ...influencerPayload, user_id: userId });
  return { influencerId: influencerResult.lastInsertRowid, userId };
});

const formatUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  phone: user.phone || null,
  role: user.role
});

const ensureInfluencerAccess = (req, influencerId) => {
  const id = Number(influencerId);
  if (!Number.isInteger(id) || id <= 0) {
    return { status: 400, message: 'ID invalido.' };
  }
  const influencer = findInfluencerByIdStmt.get(id);
  if (!influencer) {
    return { status: 404, message: 'Influenciadora nao encontrada.' };
  }
  if (req.auth.user.role === 'master') {
    return { influencer };
  }
  if (req.auth.user.role === 'influencer') {
    const own = findInfluencerByUserIdStmt.get(req.auth.user.id);
    if (!own || own.id !== id) {
      return { status: 403, message: 'Acesso negado.' };
    }
    return { influencer: own };
  }
  return { status: 403, message: 'Acesso negado.' };
};

const getAuthenticatedInfluencer = (req) => {
  if (!req?.auth?.user || req.auth.user.role !== 'influencer') {
    return null;
  }
  const influencer = findInfluencerByUserIdStmt.get(req.auth.user.id);
  return influencer || null;
};

const resolveInfluencerForRequest = (req, influencerId) => {
  if (req.auth?.user?.role === 'master') {
    if (influencerId == null) {
      return { status: 400, message: 'Informe o ID da influenciadora.' };
    }
    return ensureInfluencerAccess(req, influencerId);
  }
  if (req.auth?.user?.role === 'influencer') {
    const influencer = getAuthenticatedInfluencer(req);
    if (!influencer) {
      return { status: 404, message: 'Cadastro da influenciadora nao encontrado.' };
    }
    return { influencer };
  }
  return { status: 403, message: 'Acesso negado.' };
};

const normalizePlanEntriesPayload = (body, cycle) => {
  if (!cycle) {
    return { error: 'Ciclo mensal nao encontrado.' };
  }

  const candidateArrays = [
    body?.entries,
    body?.schedules,
    body?.agendamentos,
    body?.days,
    body?.dates
  ];

  const removalSources = [
    body?.removedScripts,
    body?.removedScriptIds,
    body?.removed_ids,
    body?.removed,
    body?.removals
  ];
  const removedScriptsSet = new Set();
  removalSources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((value) => {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) {
          removedScriptsSet.add(parsed);
        }
      });
    } else if (source != null && source !== '') {
      const parsed = Number(source);
      if (Number.isInteger(parsed) && parsed > 0) {
        removedScriptsSet.add(parsed);
      }
    }
  });

  const removedPlanSources = [body?.removedPlans, body?.removedPlanIds, body?.removedOccurrences, body?.removed_occurrences];
  const removedPlanIdsSet = new Set();
  removedPlanSources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((value) => {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) {
          removedPlanIdsSet.add(parsed);
        }
      });
    } else if (source != null && source !== '') {
      const parsed = Number(source);
      if (Number.isInteger(parsed) && parsed > 0) {
        removedPlanIdsSet.add(parsed);
      }
    }
  });

  const candidates = candidateArrays.find((value) => Array.isArray(value)) || [];

  if (!candidates.length && removedScriptsSet.size === 0 && removedPlanIdsSet.size === 0) {
    return { error: 'Informe ao menos um dia para agendar.' };
  }

  const cycleYear = Number(cycle.cycle_year);
  const cycleMonth = String(cycle.cycle_month).padStart(2, '0');
  const expectedPrefix = `${cycleYear}-${cycleMonth}-`;

  const result = [];
  const seenPairs = new Set();
  const seenPlanIds = new Set();

  const parseBooleanFlag = (value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return false;
      return ['1', 'true', 'yes', 'y', 'on', 'add', 'append', 'novo', 'nova', 'create'].includes(normalized);
    }
    return false;
  };

  candidates.forEach((entry) => {
    let dateValue = null;
    let scriptId = null;
    let notes = null;
    let planId = null;
    let append = false;

    if (typeof entry === 'string') {
      dateValue = entry;
    } else if (entry && typeof entry === 'object') {
      dateValue = entry.date ?? entry.day ?? entry.scheduled_date ?? entry.scheduledDate ?? entry.data;
      scriptId =
        entry.scriptId ??
        entry.contentScriptId ??
        entry.content_script_id ??
        entry.roteiro_id ??
        entry.roteiroId ??
        entry.script?.id ??
        entry.roteiro?.id ??
        null;
      notes = trimString(entry.notes ?? entry.observacao ?? entry.obs ?? entry.annotation ?? '') || null;
      planId = entry.id ?? entry.planId ?? entry.plan_id ?? null;
      append =
        parseBooleanFlag(entry.append ?? entry.add ?? entry.create ?? entry.novo) ||
        parseBooleanFlag(entry.action ?? entry.acao);
    }

    if (typeof dateValue !== 'string' || !isValidDate(dateValue)) {
      return;
    }

    const normalizedDate = dateValue.trim();
    if (!normalizedDate.startsWith(expectedPrefix)) {
      return;
    }

    let numericPlanId = null;
    if (planId != null && planId !== '') {
      const parsedPlan = Number(planId);
      if (Number.isInteger(parsedPlan) && parsedPlan > 0) {
        numericPlanId = parsedPlan;
        if (seenPlanIds.has(numericPlanId)) {
          return;
        }
        seenPlanIds.add(numericPlanId);
      }
    }

    let contentScriptId = null;
    if (scriptId != null) {
      const parsed = Number(scriptId);
      if (Number.isInteger(parsed) && parsed > 0) {
        const script = findContentScriptByIdStmt.get(parsed);
        if (script) {
          contentScriptId = parsed;
        }
      }
    }

    if (!contentScriptId && numericPlanId) {
      const existing = findPlanByIdStmt.get(numericPlanId);
      if (existing?.content_script_id) {
        contentScriptId = existing.content_script_id;
      }
    }

    const pairKey = `${contentScriptId ?? 'null'}|${normalizedDate}`;
    if (!numericPlanId && seenPairs.has(pairKey)) {
      return;
    }
    seenPairs.add(pairKey);

    result.push({
      id: numericPlanId,
      scheduled_date: normalizedDate,
      content_script_id: contentScriptId,
      notes,
      append: Boolean(append)
    });
  });

  if (!result.length && removedScriptsSet.size === 0 && removedPlanIdsSet.size === 0) {
    return { error: 'Nao foi possivel identificar dias validos para o agendamento.' };
  }

  result.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  return {
    entries: result,
    removedScriptIds: Array.from(removedScriptsSet),
    removedPlanIds: Array.from(removedPlanIdsSet)
  };
};

const buildScriptPreview = (html = '', maxLength = 200) => {
  if (!html) return '';
  const plain = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength - 1).trim()}…`;
};

const buildCycleSummary = (cycle) => {
  if (!cycle) return null;
  const year = Number(cycle.cycle_year ?? cycle.year ?? new Date().getFullYear());
  const month = Number(cycle.cycle_month ?? cycle.month ?? new Date().getMonth() + 1);
  const monthLabel = String(month).padStart(2, '0');
  const startDateSource = cycle.startDate ?? cycle.started_at ?? formatCycleMonthStart(year, month);
  const startDate = typeof startDateSource === 'string' ? startDateSource.slice(0, 10) : formatCycleMonthStart(year, month);
  const endDate = computeCycleEndDate({ ...cycle, cycle_year: year, cycle_month: month }) || startDate;

  return {
    id: cycle.id ?? null,
    year,
    month,
    status: cycle.status ?? 'open',
    label: `${monthLabel}/${year}`,
    startDate,
    endDate
  };
};

const collectInfluencerPlanData = (cycle, influencer, { scriptLimit = 15 } = {}) => {
  const scripts = listContentScriptsStmt
    .all()
    .slice(0, scriptLimit);
  const plans = listPlansByInfluencerStmt.all(cycle.id, influencer.id);
  return { cycle, influencer, scripts, plans };
};

const serializePlanForExtendedResponse = (plan) => {
  if (!plan) return null;
  return {
    id: plan.id,
    cycleId: plan.cycle_id,
    influencerId: plan.influencer_id,
    date: plan.scheduled_date,
    status: plan.status,
    notes: plan.notes,
    scriptId: plan.content_script_id,
    scriptTitle: plan.script_title,
    scriptDescription: plan.script_description,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
    canEdit: plan.status === 'scheduled' || plan.status === 'posted',
    script: plan.content_script_id
      ? {
          id: plan.content_script_id,
          title: plan.script_title,
          description: plan.script_description
        }
      : null
  };
};

const serializeScriptForExtendedResponse = (script) => {
  if (!script) return null;
  return {
    id: script.id,
    title: script.titulo,
    description: script.descricao,
    preview: buildScriptPreview(script.descricao),
    createdAt: script.created_at,
    updatedAt: script.updated_at
  };
};

const buildExtendedPlanResponse = (cycle, influencer, options = {}) => {
  const { scripts, plans } = collectInfluencerPlanData(cycle, influencer, options);
  const extendedScripts = scripts.map((script) => serializeScriptForExtendedResponse(script)).filter(Boolean);
  const extendedPlans = plans.map((plan) => serializePlanForExtendedResponse(plan)).filter(Boolean);

  return {
    cycle: buildCycleSummary(cycle),
    influencer: {
      id: influencer.id,
      name: influencer.nome
    },
    scripts: extendedScripts,
    plans: extendedPlans
  };
};

const normalizeSaleBody = (body) => {
  const orderNumberRaw = body?.orderNumber ?? body?.order_number ?? body?.pedido ?? body?.order;
  const orderNumber = orderNumberRaw == null ? '' : String(trimString(orderNumberRaw)).trim();
  const cupom = trimString(body?.cupom);
  const date = trimString(body?.date);
  const pointsRaw =
    body?.points ??
    body?.pointsValue ??
    body?.points_value ??
    body?.pontuacao ??
    body?.pontuacaoTotal ??
    body?.salePoints;

  if (!orderNumber) {
    return { error: { error: 'Informe o numero do pedido.' } };
  }
  if (orderNumber.length > 100) {
    return { error: { error: 'Numero do pedido deve ter no maximo 100 caracteres.' } };
  }
  if (!cupom) {
    return { error: { error: 'Informe o cupom da influenciadora.' } };
  }
  if (!date || !isValidDate(date)) {
    return { error: { error: 'Informe uma data valida (YYYY-MM-DD).' } };
  }

  const pointsParsed = parsePointsValue(pointsRaw, 'Pontos');
  if (pointsParsed.error) {
    return { error: { error: pointsParsed.error } };
  }

  return {
    data: {
      orderNumber,
      cupom,
      date,
      points: pointsParsed.value
    }
  };
};

const normalizeSkuPointsPayload = (body) => {
  const skuRaw = body?.sku ?? body?.SKU ?? body?.code;
  const sku = trimString(skuRaw);
  if (!sku) {
    return { error: { error: 'Informe o SKU.' } };
  }

  const description = trimString(body?.description ?? body?.descricao ?? body?.name) || null;
  const pointsRaw =
    body?.points_per_unit ??
    body?.pointsPerUnit ??
    body?.points ??
    body?.pontuacao ??
    body?.pontuacao_por_unidade;
  const pointsParsed = parsePointsValue(pointsRaw, 'Pontos por unidade');
  if (pointsParsed.error) {
    return { error: { error: pointsParsed.error } };
  }

  let active = 1;
  if (body?.active != null) {
    active = body.active ? 1 : 0;
  } else if (body?.ativo != null) {
    active = body.ativo ? 1 : 0;
  }

  return {
    data: {
      sku,
      description,
      points_per_unit: pointsParsed.value,
      active
    }
  };
};

app.post('/register', authenticate, authorizeMaster, async (req, res) => {
  const { email, password, role = 'influencer' } = req.body || {};
  const rawPhone = req.body?.phone ?? req.body?.telefone ?? req.body?.phoneNumber;
  const phoneData = extractUserPhoneData(rawPhone);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha sao obrigatorios.' });
  }

  if (!['master', 'influencer'].includes(role)) {
    return res.status(400).json({ error: 'Role invalido. Use "master" ou "influencer".' });
  }

  if (findUserByEmailStmt.get(email)) {
    return res.status(409).json({ error: 'Email ja cadastrado.' });
  }

  if (phoneData.phoneNormalized) {
    const existingPhoneUser = findUserByPhoneStmt.get(phoneData.phoneNormalized);
    if (existingPhoneUser) {
      return res.status(409).json({ error: 'Telefone ja cadastrado.' });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = insertUserStmt.run(
    email,
    phoneData.phone,
    phoneData.phoneNormalized,
    hashedPassword,
    role,
    0
  );

  return res.status(201).json({
    id: result.lastInsertRowid,
    email,
    phone: phoneData.phone || null,
    role
  });
});

app.post('/login', async (req, res) => {
  const identifier = trimString(req.body?.identifier ?? req.body?.email);
  const password = req.body?.password;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Informe email ou telefone e a senha.' });
  }

  const user = findUserByIdentifier(identifier);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Credenciais invalidas.' });
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Credenciais invalidas.' });
  }

  const token = generateToken(user);
  return res.status(200).json({ token, user: formatUserResponse(user) });
});

app.post('/influenciadora', authenticate, authorizeMaster, async (req, res) => {
  const { data, error } = normalizeInfluencerPayload(req.body || {});

  if (error) {
    return res.status(400).json(error);
  }

  const loginEmail = trimString(req.body?.loginEmail) || data.email;
  if (!loginEmail || !validators.email(loginEmail)) {
    return res.status(400).json({ error: 'Informe um email valido para acesso.' });
  }

  if (findUserByEmailStmt.get(loginEmail)) {
    return res.status(409).json({ error: 'Email de login ja cadastrado.' });
  }

  const providedPasswordRaw =
    req.body?.loginPassword ?? req.body?.provisionalPassword ?? req.body?.senha ?? req.body?.password;
  const providedPassword = providedPasswordRaw == null ? '' : String(providedPasswordRaw).trim();
  if (providedPassword && !validators.password(providedPassword)) {
    return res.status(400).json({ error: 'Senha de acesso deve ter ao menos 6 caracteres.' });
  }

  const normalizedCpfDigits = data.cpf ? normalizeDigits(data.cpf) : null;
  if (normalizedCpfDigits) {
    const existingCpf = findInfluencerIdByCpfStmt.get(normalizedCpfDigits);
    if (existingCpf) {
      return res.status(409).json({ error: 'CPF ja cadastrado.' });
    }
  }

  if (data.email) {
    const existingEmail = findInfluencerIdByEmailStmt.get(data.email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email de contato ja cadastrado.' });
    }
  }

  const contatoDigits = data.contato ? normalizeDigits(data.contato) : null;
  if (contatoDigits) {
    const existingContato = findInfluencerIdByContatoStmt.get(contatoDigits);
    if (existingContato) {
      return res.status(409).json({ error: 'Telefone ja cadastrado.' });
    }
  }

  const phoneData = extractUserPhoneData(data.contato);
  if (phoneData.phoneNormalized) {
    const existingPhoneUser = findUserByPhoneStmt.get(phoneData.phoneNormalized);
    if (existingPhoneUser) {
      return res.status(409).json({ error: 'Telefone ja cadastrado.' });
    }
  }

  if (data.cupom) {
    const existingCupom = findInfluencerIdByCupomStmt.get(data.cupom);
    if (existingCupom) {
      return res.status(409).json({ error: 'Cupom ja cadastrado.' });
    }
  }

  const provisionalPassword = providedPassword || generateRandomPassword(6);
  const passwordHash = await bcrypt.hash(provisionalPassword, 10);
  const contractSignatureWaivedValue = Number(data.contract_signature_waived ?? 0) === 1 ? 1 : 0;
  data.contract_signature_waived = contractSignatureWaivedValue;
  const waiveContract = contractSignatureWaivedValue === 1;

  let signatureCode = null;
  let signatureCodeHash = null;
  let generatedAt = null;

  if (!waiveContract) {
    signatureCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    signatureCodeHash = await bcrypt.hash(signatureCode, 10);
    generatedAt = new Date().toISOString();
  }

  try {
    const { influencerId } = createInfluencerTransaction(
      {
        ...data,
        contract_signature_code_hash: signatureCodeHash,
        contract_signature_code_generated_at: generatedAt
      },
      {
        email: loginEmail,
        passwordHash,
        mustChange: 0,
        phone: phoneData.phone,
        phoneNormalized: phoneData.phoneNormalized
      }
    );
    const influencer = findInfluencerByIdStmt.get(influencerId);
    return res.status(201).json({
      ...influencer,
      login_email: loginEmail,
      senha_provisoria: provisionalPassword,
      codigo_assinatura: waiveContract ? null : signatureCode
    });
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'ER_DUP_ENTRY')) {
      return res
        .status(409)
        .json({ error: 'Registro duplicado. Verifique Instagram, CPF, email, telefone ou cupom.' });
    }
    console.error('Erro ao cadastrar influenciadora:', err);
    return res.status(500).json({ error: 'Nao foi possivel cadastrar a influenciadora.' });
  }
});
app.get('/influenciadora/:id', authenticate, verificarAceite, (req, res) => {
  const { influencer, status, message } = ensureInfluencerAccess(req, req.params.id);
  if (!influencer) {
    return res.status(status).json({ error: message });
  }
  return res.status(200).json(influencer);
});



app.put('/influenciadora/:id', authenticate, verificarAceite, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const influencer = findInfluencerByIdStmt.get(id);
  if (!influencer) {
    return res.status(404).json({ error: 'Influenciadora nao encontrada.' });
  }

  if (req.auth.user.role !== 'master' && influencer.user_id !== req.auth.user.id) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const { data, error } = normalizeInfluencerPayload(req.body || {});
  if (error) {
    return res.status(400).json(error);
  }

  const contatoProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'contato');
  const phoneData = extractUserPhoneData(data.contato);

  if (data.contract_signature_waived == null) {
    data.contract_signature_waived = Number(influencer.contract_signature_waived) === 1 ? 1 : 0;
  }

  const loginEmail = trimString(req.body?.loginEmail);
  const loginPassword = req.body?.loginPassword;

  if (loginEmail && !validators.email(loginEmail)) {
    return res.status(400).json({ error: 'Informe um email de acesso valido.' });
  }

  if (loginPassword && !validators.password(loginPassword)) {
    return res.status(400).json({ error: 'Senha de acesso deve ter ao menos 6 caracteres.' });
  }

  const normalizedCpfDigits = data.cpf ? normalizeDigits(data.cpf) : null;
  if (normalizedCpfDigits) {
    const existingCpf = findInfluencerIdByCpfStmt.get(normalizedCpfDigits);
    if (existingCpf && existingCpf.id !== id) {
      return res.status(409).json({ error: 'CPF ja cadastrado.' });
    }
  }

  if (data.email) {
    const existingEmail = findInfluencerIdByEmailStmt.get(data.email);
    if (existingEmail && existingEmail.id !== id) {
      return res.status(409).json({ error: 'Email de contato ja cadastrado.' });
    }
  }

  const contatoDigits = data.contato ? normalizeDigits(data.contato) : null;
  if (contatoDigits) {
    const existingContato = findInfluencerIdByContatoStmt.get(contatoDigits);
    if (existingContato && existingContato.id !== id) {
      return res.status(409).json({ error: 'Telefone ja cadastrado.' });
    }
  }

  if (contatoProvided && phoneData.phoneNormalized) {
    const existingPhoneUser = findUserByPhoneStmt.get(phoneData.phoneNormalized);
    if (existingPhoneUser && existingPhoneUser.id !== influencer.user_id) {
      return res.status(409).json({ error: 'Telefone ja cadastrado.' });
    }
  }

  if (data.cupom) {
    const existingCupom = findInfluencerIdByCupomStmt.get(data.cupom);
    if (existingCupom && existingCupom.id !== id) {
      return res.status(409).json({ error: 'Cupom ja cadastrado.' });
    }
  }

  try {
    const previousWaived = Number(influencer.contract_signature_waived) === 1;
    const newWaived = Number(data.contract_signature_waived) === 1;
    let generatedSignatureCode = null;

    updateInfluencerStmt.run({ id, ...data });

    if (influencer.user_id) {
      if (loginEmail && loginEmail !== influencer.login_email) {
        if (findUserByEmailStmt.get(loginEmail)) {
          return res.status(409).json({ error: 'Email de login ja cadastrado.' });
        }
        updateUserEmailStmt.run(loginEmail, influencer.user_id);
      }
      if (contatoProvided) {
        updateUserPhoneStmt.run(phoneData.phone, phoneData.phoneNormalized, influencer.user_id);
      }
      if (loginPassword) {
        const hash = await bcrypt.hash(loginPassword, 10);
        updateUserPasswordStmt.run(hash, influencer.user_id);
      }
    }

    if (previousWaived && !newWaived) {
      const newCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const newHash = await bcrypt.hash(newCode, 10);
      const generatedAt = new Date().toISOString();
      updateInfluencerSignatureStmt.run(newHash, generatedAt, id);
      generatedSignatureCode = newCode;
    } else if (!previousWaived && newWaived) {
      updateInfluencerSignatureStmt.run(null, null, id);
    }

    const updated = findInfluencerByIdStmt.get(id);
    const responsePayload = { ...updated };
    if (generatedSignatureCode) {
      responsePayload.codigo_assinatura = generatedSignatureCode;
    } else if (newWaived) {
      responsePayload.codigo_assinatura = null;
    }
    if (loginEmail) {
      responsePayload.login_email = loginEmail;
    }
    if (loginPassword) {
      responsePayload.senha_provisoria = loginPassword;
    }
    return res.status(200).json(responsePayload);
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'ER_DUP_ENTRY')) {
      return res
        .status(409)
        .json({ error: 'Registro duplicado. Verifique Instagram, CPF, email, telefone ou cupom.' });
    }
    console.error('Erro ao atualizar influenciadora:', err);
    return res.status(500).json({ error: 'Nao foi possivel atualizar a influenciadora.' });
  }
});

app.delete('/influenciadora/:id', authenticate, authorizeMaster, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const influencer = findInfluencerByIdStmt.get(id);
  if (!influencer) {
    return res.status(404).json({ error: 'Influenciadora nao encontrada.' });
  }

  db.exec('BEGIN');
  try {
    deleteInfluencerByIdStmt.run(id);
    if (influencer.user_id) {
      deleteUserByIdStmt.run(influencer.user_id);
    }
    db.exec('COMMIT');
    return res.status(200).json({ message: 'Influenciadora removida com sucesso.' });
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Erro ao remover influenciadora:', error);
    return res.status(500).json({ error: 'Nao foi possivel remover a influenciadora.' });
  }
});

app.post('/influenciadoras/import/preview', authenticate, authorizeMaster, (req, res) => {
  const text = req.body?.text ?? req.body?.data ?? '';
  const analysis = analyzeInfluencerImport(text);
  if (analysis.error) {
    return res.status(400).json({ error: analysis.error });
  }
  return res.status(200).json(analysis);
});

app.post('/influenciadoras/import/confirm', authenticate, authorizeMaster, async (req, res) => {
  const text = req.body?.text ?? req.body?.data ?? '';
  const analysis = analyzeInfluencerImport(text);
  if (analysis.error) {
    return res.status(400).json({ error: analysis.error });
  }
  if (!analysis.totalCount) {
    return res.status(400).json({ error: 'Nenhuma influenciadora válida para importar.' });
  }
  if (analysis.hasErrors || analysis.validCount !== analysis.totalCount) {
    return res
      .status(409)
      .json({ error: 'Não foi possível importar. Corrija as pendências identificadas e tente novamente.', analysis });
  }

  const validRows = analysis.rows.filter((row) => row.normalized);
  if (!validRows.length) {
    return res.status(400).json({ error: 'Nenhuma influenciadora válida para importar.' });
  }

  try {
    const preparedRows = [];
    for (const row of validRows) {
      const dataRow = { ...row.normalized.data };
      if (dataRow.contract_signature_waived == null) {
        dataRow.contract_signature_waived = 0;
      }
      const waived = Number(dataRow.contract_signature_waived) === 1;
      const baseRow = {
        data: dataRow,
        loginEmail: row.normalized.loginEmail || null,
        provisionalPassword: row.normalized.provisionalPassword || null,
        passwordHash: null,
        signatureCode: null,
        signatureHash: null,
        generatedAt: null,
        mustChange: 0
      };

      if (baseRow.loginEmail) {
        const provisionalPassword =
          baseRow.provisionalPassword && baseRow.provisionalPassword.length >= 6
            ? baseRow.provisionalPassword
            : String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
        baseRow.provisionalPassword = provisionalPassword;
        baseRow.passwordHash = await bcrypt.hash(provisionalPassword, 10);
        if (!waived) {
          const signatureCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
          baseRow.signatureCode = signatureCode;
          baseRow.signatureHash = await bcrypt.hash(signatureCode, 10);
          baseRow.generatedAt = new Date().toISOString();
        }
      }

      preparedRows.push(baseRow);
    }

    const inserted = insertImportedInfluencers(preparedRows);
    const responseRows = inserted.map((entry) => {
      const influencer = findInfluencerByIdStmt.get(entry.influencerId);
      return {
        ...influencer,
        login_email: entry.loginEmail,
        senha_provisoria: entry.provisionalPassword,
        codigo_assinatura: entry.signatureCode
      };
    });

    return res.status(201).json({
      inserted: responseRows.length,
      rows: responseRows,
      summary: { count: responseRows.length }
    });
  } catch (error) {
    if (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({
        error:
          'Dados duplicados encontrados durante a importação. Verifique os logins, documentos, contatos ou cupons informados.',
        analysis
      });
    }
    console.error('Erro ao importar influenciadoras:', error);
    return res.status(500).json({ error: 'Não foi possível concluir a importação.' });
  }
});

app.post('/sales/import/preview', authenticate, authorizeMaster, (req, res) => {
  const text = req.body?.text ?? req.body?.data ?? '';
  const analysis = analyzeSalesImport(text);
  if (analysis.error) {
    return res.status(400).json({ error: analysis.error });
  }
  return res.status(200).json(analysis);
});

app.post('/sales/import/confirm', authenticate, authorizeMaster, (req, res) => {
  const text = req.body?.text ?? req.body?.data ?? '';
  const analysis = analyzeSalesImport(text);
  if (analysis.error) {
    return res.status(400).json({ error: analysis.error });
  }
  if (!analysis.totalCount) {
    return res.status(400).json({ error: 'Nenhuma venda encontrada para importar.' });
  }

  const validRows = analysis.rows.filter((row) => !row.errors?.length && row.influencerId);
  if (!validRows.length) {
    return res
      .status(409)
      .json({ error: 'Nenhum pedido pronto para importacao.', analysis });
  }

  try {
    const created = insertImportedSales(validRows);
    const ignored = Math.max(analysis.totalCount - validRows.length, 0);
    return res.status(201).json({
      inserted: created.length,
      ignored,
      rows: created,
      summary: analysis.summary
    });
  } catch (error) {
    if (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'Numero de pedido ja cadastrado.' });
    }
    console.error('Erro ao importar vendas:', error);
    return res.status(500).json({ error: 'Nao foi possivel concluir a importacao.' });
  }
});

app.get('/influencer/plan', authenticate, verificarAceite, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.query?.cycleId ?? req.query?.cycle_id);
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.query?.influencerId ?? req.query?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const { plans, scripts } = collectInfluencerPlanData(cycle, influencer, { scriptLimit: 15 });
  const legacyScripts = scripts.map((script) => ({
    id: script.id,
    titulo: script.titulo,
    descricao: script.descricao,
    created_at: script.created_at,
    updated_at: script.updated_at
  }));

  return res
    .status(200)
    .json({ cycle, influencer: { id: influencer.id, nome: influencer.nome }, plans, scripts: legacyScripts });
});

app.post('/influencer/plan', authenticate, verificarAceite, (req, res) => {
  const baseCycle = ensureMonthlyCycle();
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.body?.influencerId ?? req.body?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const cycle = req.body?.cycleId ? getCycleByIdOrCurrent(req.body.cycleId) : baseCycle;
  const { entries, removedScriptIds = [], removedPlanIds = [], error } = normalizePlanEntriesPayload(
    req.body || {},
    cycle
  );
  if (error) {
    return res.status(400).json({ error });
  }

  db.exec('BEGIN');
  try {
    const removedPlanSet = new Set(removedPlanIds);
    let touched = false;

    removedPlanIds.forEach((planId) => {
      const numericId = Number(planId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return;
      }
      const existingPlan = findPlanByIdStmt.get(numericId);
      if (existingPlan && existingPlan.cycle_id === cycle.id && existingPlan.influencer_id === influencer.id) {
        deletePlanByIdStmt.run(existingPlan.id, cycle.id, influencer.id);
        touched = true;
      }
    });

    removedScriptIds.forEach((scriptId) => {
      deletePlansByScriptStmt.run(cycle.id, influencer.id, scriptId);
      touched = true;
    });

    const processedPlanIds = new Set();

    entries.forEach((entry) => {
      if (!entry || !entry.scheduled_date) {
        return;
      }

      const planId = Number(entry.id);
      const notes = entry.notes ?? null;
      const append = Boolean(entry.append);

      if (Number.isInteger(planId) && planId > 0) {
        if (removedPlanSet.has(planId) || processedPlanIds.has(planId)) {
          return;
        }
        const existing = findPlanByIdStmt.get(planId);
        if (!existing || existing.cycle_id !== cycle.id || existing.influencer_id !== influencer.id) {
          return;
        }

        const nextScriptId = entry.content_script_id ?? existing.content_script_id ?? null;
        updateInfluencerPlanStmt.run({
          id: existing.id,
          scheduled_date: entry.scheduled_date,
          content_script_id: nextScriptId,
          notes
        });

        if (
          existing.scheduled_date !== entry.scheduled_date ||
          (existing.status && existing.status !== 'scheduled')
        ) {
          updateInfluencerPlanStatusStmt.run('scheduled', existing.id);
        }

        processedPlanIds.add(existing.id);
        touched = true;
        return;
      }

      const scriptId = entry.content_script_id ?? null;

      if (scriptId == null) {
        const existingByDate = findPlanByDateStmt.get(cycle.id, influencer.id, entry.scheduled_date);
        if (existingByDate?.id && !processedPlanIds.has(existingByDate.id) && !removedPlanSet.has(existingByDate.id)) {
          updateInfluencerPlanStmt.run({
            id: existingByDate.id,
            scheduled_date: entry.scheduled_date,
            content_script_id: null,
            notes
          });
          if (
            existingByDate.scheduled_date !== entry.scheduled_date ||
            (existingByDate.status && existingByDate.status !== 'scheduled')
          ) {
            updateInfluencerPlanStatusStmt.run('scheduled', existingByDate.id);
          }
          processedPlanIds.add(existingByDate.id);
          touched = true;
          return;
        }

        insertInfluencerPlanStmt.run({
          cycle_id: cycle.id,
          influencer_id: influencer.id,
          scheduled_date: entry.scheduled_date,
          content_script_id: null,
          notes,
          status: 'scheduled'
        });
        touched = true;
        return;
      }

      if (!append) {
        const existing = findPlanByScriptStmt.get(cycle.id, influencer.id, scriptId);
        if (existing?.id && !processedPlanIds.has(existing.id) && !removedPlanSet.has(existing.id)) {
          updateInfluencerPlanStmt.run({
            id: existing.id,
            scheduled_date: entry.scheduled_date,
            content_script_id: scriptId,
            notes
          });

          if (
            existing.scheduled_date !== entry.scheduled_date ||
            (existing.status && existing.status !== 'scheduled')
          ) {
            updateInfluencerPlanStatusStmt.run('scheduled', existing.id);
          }

          processedPlanIds.add(existing.id);
          touched = true;
          return;
        }
      }

      insertInfluencerPlanStmt.run({
        cycle_id: cycle.id,
        influencer_id: influencer.id,
        scheduled_date: entry.scheduled_date,
        content_script_id: scriptId,
        notes,
        status: 'scheduled'
      });
      touched = true;
    });

    if (touched) {
      touchCycleStmt.run(cycle.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Erro ao registrar agenda de stories:', err);
    return res.status(500).json({ error: 'Nao foi possivel salvar a agenda.' });
  }

  const plans = listPlansByInfluencerStmt.all(cycle.id, influencer.id);
  return res.status(201).json({ cycle, plans });
});

app.get('/api/influencer/plan', authenticate, verificarAceite, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.query?.cycleId ?? req.query?.cycle_id);
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.query?.influencerId ?? req.query?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const payload = buildExtendedPlanResponse(cycle, influencer, { scriptLimit: 50 });
  return res.status(200).json(payload);
});

app.post('/api/influencer/plan', authenticate, verificarAceite, (req, res) => {
  const baseCycle = ensureMonthlyCycle();
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.body?.influencerId ?? req.body?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const cycle = req.body?.cycleId ? getCycleByIdOrCurrent(req.body.cycleId) : baseCycle;
  const { entries, removedScriptIds = [], removedPlanIds = [], error } = normalizePlanEntriesPayload(
    req.body || {},
    cycle
  );
  if (error) {
    return res.status(400).json({ error });
  }

  db.exec('BEGIN');
  try {
    const removedPlanSet = new Set(removedPlanIds);
    let touched = false;

    removedPlanIds.forEach((planId) => {
      const numericId = Number(planId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return;
      }
      const existingPlan = findPlanByIdStmt.get(numericId);
      if (existingPlan && existingPlan.cycle_id === cycle.id && existingPlan.influencer_id === influencer.id) {
        deletePlanByIdStmt.run(existingPlan.id, cycle.id, influencer.id);
        touched = true;
      }
    });

    removedScriptIds.forEach((scriptId) => {
      deletePlansByScriptStmt.run(cycle.id, influencer.id, scriptId);
      touched = true;
    });

    const processedPlanIds = new Set();

    entries.forEach((entry) => {
      if (!entry || !entry.scheduled_date) {
        return;
      }

      const planId = Number(entry.id);
      const notes = entry.notes ?? null;
      const append = Boolean(entry.append);

      if (Number.isInteger(planId) && planId > 0) {
        if (removedPlanSet.has(planId) || processedPlanIds.has(planId)) {
          return;
        }
        const existing = findPlanByIdStmt.get(planId);
        if (!existing || existing.cycle_id !== cycle.id || existing.influencer_id !== influencer.id) {
          return;
        }

        const nextScriptId = entry.content_script_id ?? existing.content_script_id ?? null;
        updateInfluencerPlanStmt.run({
          id: existing.id,
          scheduled_date: entry.scheduled_date,
          content_script_id: nextScriptId,
          notes
        });

        if (
          existing.scheduled_date !== entry.scheduled_date ||
          (existing.status && existing.status !== 'scheduled')
        ) {
          updateInfluencerPlanStatusStmt.run('scheduled', existing.id);
        }

        processedPlanIds.add(existing.id);
        touched = true;
        return;
      }

      const scriptId = entry.content_script_id ?? null;

      if (scriptId == null) {
        const existingByDate = findPlanByDateStmt.get(cycle.id, influencer.id, entry.scheduled_date);
        if (existingByDate?.id && !processedPlanIds.has(existingByDate.id) && !removedPlanSet.has(existingByDate.id)) {
          updateInfluencerPlanStmt.run({
            id: existingByDate.id,
            scheduled_date: entry.scheduled_date,
            content_script_id: null,
            notes
          });
          if (
            existingByDate.scheduled_date !== entry.scheduled_date ||
            (existingByDate.status && existingByDate.status !== 'scheduled')
          ) {
            updateInfluencerPlanStatusStmt.run('scheduled', existingByDate.id);
          }
          processedPlanIds.add(existingByDate.id);
          touched = true;
          return;
        }

        insertInfluencerPlanStmt.run({
          cycle_id: cycle.id,
          influencer_id: influencer.id,
          scheduled_date: entry.scheduled_date,
          content_script_id: null,
          notes,
          status: 'scheduled'
        });
        touched = true;
        return;
      }

      if (!append) {
        const existing = findPlanByScriptStmt.get(cycle.id, influencer.id, scriptId);
        if (existing?.id && !processedPlanIds.has(existing.id) && !removedPlanSet.has(existing.id)) {
          updateInfluencerPlanStmt.run({
            id: existing.id,
            scheduled_date: entry.scheduled_date,
            content_script_id: scriptId,
            notes
          });

          if (
            existing.scheduled_date !== entry.scheduled_date ||
            (existing.status && existing.status !== 'scheduled')
          ) {
            updateInfluencerPlanStatusStmt.run('scheduled', existing.id);
          }

          processedPlanIds.add(existing.id);
          touched = true;
          return;
        }
      }

      insertInfluencerPlanStmt.run({
        cycle_id: cycle.id,
        influencer_id: influencer.id,
        scheduled_date: entry.scheduled_date,
        content_script_id: scriptId,
        notes,
        status: 'scheduled'
      });
      touched = true;
    });

    if (touched) {
      touchCycleStmt.run(cycle.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Erro ao registrar agenda de stories (API):', err);
    return res.status(500).json({ error: 'Nao foi possivel salvar a agenda.' });
  }

  const payload = buildExtendedPlanResponse(cycle, influencer, { scriptLimit: 50 });
  return res.status(201).json(payload);
});

app.put('/influencer/plan/:id', authenticate, verificarAceite, (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const plan = findPlanByIdStmt.get(planId);
  if (!plan) {
    return res.status(404).json({ error: 'Agendamento nao encontrado.' });
  }

  const { influencer, status, message } = resolveInfluencerForRequest(req, plan.influencer_id);
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const cycle = findCycleByIdStmt.get(plan.cycle_id) || ensureMonthlyCycle();
  const nextDate = req.body?.date ?? req.body?.scheduled_date ?? req.body?.scheduledDate;
  let scheduledDate = plan.scheduled_date;
  if (nextDate) {
    if (!isValidDate(nextDate)) {
      return res.status(400).json({ error: 'Informe uma data valida (YYYY-MM-DD).' });
    }
    const normalized = nextDate.trim();
    const cycleMonth = String(cycle.cycle_month).padStart(2, '0');
    const expectedPrefix = `${cycle.cycle_year}-${cycleMonth}-`;
    if (!normalized.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: 'Data precisa estar no mesmo ciclo mensal.' });
    }
    if (findPlanByDateStmt.get(cycle.id, influencer.id, normalized)?.id && normalized !== plan.scheduled_date) {
      return res.status(409).json({ error: 'Ja existe um agendamento para esta data.' });
    }
    scheduledDate = normalized;
  }

  let scriptId = plan.content_script_id;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'scriptId') || Object.prototype.hasOwnProperty.call(req.body || {}, 'contentScriptId')) {
    const rawScript = req.body?.scriptId ?? req.body?.contentScriptId;
    const parsed = Number(rawScript);
    if (rawScript == null || rawScript === '') {
      scriptId = null;
    } else if (Number.isInteger(parsed) && parsed > 0) {
      const script = findContentScriptByIdStmt.get(parsed);
      if (!script) {
        return res.status(404).json({ error: 'Roteiro nao encontrado.' });
      }
      scriptId = parsed;
    } else {
      return res.status(400).json({ error: 'Identificador de roteiro invalido.' });
    }
  }

  const notes = trimString(
    req.body?.notes ?? req.body?.observacao ?? req.body?.obs ?? req.body?.annotation ?? plan.notes ?? ''
  );

  try {
    updateInfluencerPlanStmt.run({
      id: plan.id,
      scheduled_date: scheduledDate,
      content_script_id: scriptId,
      notes: notes || null
    });
    updateInfluencerPlanStatusStmt.run('scheduled', plan.id);
    touchCycleStmt.run(plan.cycle_id);
  } catch (error) {
    console.error('Erro ao atualizar agendamento de story:', error);
    return res.status(500).json({ error: 'Nao foi possivel atualizar o agendamento.' });
  }

  const updated = findPlanByIdStmt.get(plan.id);
  return res.status(200).json(updated);
});

app.get('/influencer/dashboard', authenticate, verificarAceite, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.query?.cycleId ?? req.query?.cycle_id);
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.query?.influencerId ?? req.query?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const plans = listPlansByInfluencerStmt.all(cycle.id, influencer.id);
  const validatedDaysRow = countValidatedPlansStmt.get(cycle.id, influencer.id) || { total: 0 };
  const validatedDays = Number(validatedDaysRow.total) || 0;
  const plannedDays = plans.length;
  const pendingValidations = plans.filter((plan) => plan.status === 'scheduled').length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const alerts = plans
    .filter((plan) => plan.status !== 'validated' && plan.scheduled_date < todayIso)
    .map((plan) => ({ id: plan.id, date: plan.scheduled_date, status: plan.status }));
  const scripts = listContentScriptsStmt
    .all()
    .slice(0, 15)
    .map((script) => ({ id: script.id, titulo: script.titulo, descricao: script.descricao }));

  const salesSummary = salesSummaryStmt.get(influencer.id) || { total_points: 0 };
  const commissionSummary = summarizePoints(salesSummary.total_points || 0, validatedDays);
  const commission = {
    basePoints: commissionSummary.basePoints,
    totalPoints: commissionSummary.totalPoints,
    multiplier: commissionSummary.multiplier,
    label: commissionSummary.label,
    validatedDays: commissionSummary.validatedDays,
    baseValue: pointsToBrl(commissionSummary.basePoints),
    totalValue: pointsToBrl(commissionSummary.totalPoints),
    pointValue: POINT_VALUE_BRL
  };
  const nextPlan = plans.find((plan) => plan.scheduled_date >= todayIso) || null;

  return res.status(200).json({
    cycle,
    influencer: {
      id: influencer.id,
      nome: influencer.nome,
      instagram: influencer.instagram,
      commission_rate: influencer.commission_rate,
      vendas_valor: influencer.vendas_valor
    },
    plans,
    progress: {
      plannedDays,
      validatedDays,
      pendingValidations,
      multiplier: commission.multiplier,
      multiplierLabel: commission.label,
      estimatedCommission: commission.totalValue,
      estimatedPoints: commission.totalPoints
    },
    commission,
    alerts,
    suggestions: scripts,
    nextPlan
  });
});

app.get('/influencer/history', authenticate, verificarAceite, (req, res) => {
  const { influencer, status, message } = resolveInfluencerForRequest(
    req,
    req.query?.influencerId ?? req.query?.influencer_id
  );
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  const history = listMonthlyCommissionsByInfluencerStmt.all(influencer.id);
  return res.status(200).json({ influencer: { id: influencer.id, nome: influencer.nome }, history });
});

app.get('/master/validations', authenticate, authorizeMaster, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.query?.cycleId ?? req.query?.cycle_id);
  const pending = listPendingPlanValidationsStmt.all(cycle.id);
  return res.status(200).json({ cycle, pending });
});

app.post('/master/validations/:id/approve', authenticate, authorizeMaster, (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const plan = findPlanWithInfluencerStmt.get(planId);
  if (!plan) {
    return res.status(404).json({ error: 'Agendamento nao encontrado.' });
  }

  if (plan.status === 'validated') {
    return res.status(409).json({ error: 'Este dia ja foi validado.' });
  }

  try {
    updateInfluencerPlanStatusStmt.run('validated', plan.id);
    touchCycleStmt.run(plan.cycle_id);
  } catch (error) {
    console.error('Erro ao validar agendamento:', error);
    return res.status(500).json({ error: 'Nao foi possivel aprovar o story.' });
  }

  const updated = findPlanWithInfluencerStmt.get(plan.id);
  return res.status(200).json(updated);
});

app.post('/master/validations/:id/reject', authenticate, authorizeMaster, (req, res) => {
  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const plan = findPlanWithInfluencerStmt.get(planId);
  if (!plan) {
    return res.status(404).json({ error: 'Agendamento nao encontrado.' });
  }

  try {
    updateInfluencerPlanStatusStmt.run('scheduled', plan.id);
    touchCycleStmt.run(plan.cycle_id);
  } catch (error) {
    console.error('Erro ao reabrir agendamento:', error);
    return res.status(500).json({ error: 'Nao foi possivel rejeitar o story.' });
  }

  const updated = findPlanWithInfluencerStmt.get(plan.id);
  return res.status(200).json(updated);
});

app.get('/master/dashboard', authenticate, authorizeMaster, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.query?.cycleId ?? req.query?.cycle_id);
  const plans = listPlansForCycleStmt.all(cycle.id);
  const pending = listPendingPlanValidationsStmt.all(cycle.id);
  const influencers = listInfluencersStmt.all();
  const todayIso = new Date().toISOString().slice(0, 10);

  const influencersSummary = influencers.map((row) => {
    const validatedRow = countValidatedPlansStmt.get(cycle.id, row.id) || { total: 0 };
    const plannedRow = countPlansByInfluencerStmt.get(cycle.id, row.id) || { total: 0 };
    return {
      id: row.id,
      nome: row.nome,
      instagram: row.instagram,
      planned: Number(plannedRow.total) || 0,
      validated: Number(validatedRow.total) || 0
    };
  });

  const alerts = plans.filter(
    (plan) => plan.status !== 'validated' && plan.scheduled_date < todayIso
  );

  const stats = {
    totalInfluencers: influencersSummary.length,
    plannedPosts: plans.length,
    validatedPosts: influencersSummary.reduce((total, item) => total + item.validated, 0),
    pendingValidations: pending.length,
    alerts: alerts.length
  };

  return res.status(200).json({ cycle, plans, pendingValidations: pending, influencers: influencersSummary, stats });
});

app.get('/master/cycles', authenticate, authorizeMaster, (req, res) => {
  const cycles = listCyclesStmt.all();
  return res.status(200).json({ cycles });
});

app.get('/master/ranking', authenticate, authorizeMaster, (req, res) => {
  const cycleId = req.query?.cycleId ?? req.query?.cycle_id;
  const ranking = listMonthlyRankingStmt
    .all()
    .filter((row) => (cycleId ? Number(row.cycle_id) === Number(cycleId) : true));
  return res.status(200).json({ ranking });
});

app.post('/master/cycles/:id/close', authenticate, authorizeMaster, (req, res) => {
  const cycle = getCycleByIdOrCurrent(req.params.id);
  if (!cycle) {
    return res.status(404).json({ error: 'Ciclo nao encontrado.' });
  }

  const influencers = listInfluencersStmt.all();
  const cycleEnd = computeCycleEndDate(cycle) || formatCycleMonthStart(cycle.cycle_year, cycle.cycle_month);
  const summaries = [];

  db.exec('BEGIN');
  try {
    influencers.forEach((influencer) => {
      if (!influencer) return;
      const validatedRow = countValidatedPlansStmt.get(cycle.id, influencer.id) || { total: 0 };
      const plannedRow = countPlansByInfluencerStmt.get(cycle.id, influencer.id) || { total: 0 };
      const validatedDays = Number(validatedRow.total) || 0;
      const plannedDays = Number(plannedRow.total) || 0;

      const salesSummary = salesSummaryStmt.get(influencer.id) || { total_points: 0 };
      const commissionSummary = summarizePoints(salesSummary.total_points || 0, validatedDays);
      const baseValue = pointsToBrl(commissionSummary.basePoints);
      const totalValue = pointsToBrl(commissionSummary.totalPoints);
      const validatedPlans = listValidatedPlansStmt.all(cycle.id, influencer.id) || [];
      const validationSummary = validatedPlans.length ? JSON.stringify(validatedPlans) : null;

      insertMonthlyCommissionStmt.run({
        cycle_id: cycle.id,
        influencer_id: influencer.id,
        validated_days: validatedDays,
        multiplier: commissionSummary.multiplier,
        base_commission: baseValue,
        total_commission: totalValue,
        base_points: commissionSummary.basePoints,
        total_points: commissionSummary.totalPoints,
        deliveries_planned: plannedDays,
        deliveries_completed: validatedDays,
        validation_summary: validationSummary
      });

      if (plannedDays > 0) {
        markMissedPlansStmt.run(cycle.id, influencer.id, cycleEnd);
      }

      summaries.push({
        influencer_id: influencer.id,
        influencer_nome: influencer.nome,
        validated_days: validatedDays,
        multiplier: commissionSummary.multiplier,
        total_commission: totalValue,
        base_commission: baseValue,
        total_points: commissionSummary.totalPoints,
        base_points: commissionSummary.basePoints,
        deliveries_planned: plannedDays,
        deliveries_completed: validatedDays
      });
    });

    closeCycleStmt.run(cycle.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Erro ao fechar ciclo mensal:', error);
    return res.status(500).json({ error: 'Nao foi possivel fechar o ciclo mensal.' });
  }

  const updatedCycle = findCycleByIdStmt.get(cycle.id);
  return res.status(200).json({ cycle: updatedCycle, summaries });
});

app.get('/scripts', authenticate, verificarAceite, (req, res) => {
  try {
    const rows = listContentScriptsStmt.all();
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Erro ao listar roteiros:', error);
    return res.status(500).json({ error: 'Nao foi possivel carregar os roteiros.' });
  }
});

app.post('/scripts', authenticate, authorizeMaster, (req, res) => {
  const rawTitle = trimString(req.body?.titulo ?? req.body?.title);
  const rawDescription = trimString(req.body?.descricao ?? req.body?.description);

  if (!rawTitle || rawTitle.length < 3) {
    return res.status(400).json({ error: 'Informe um titulo com pelo menos 3 caracteres.' });
  }

  if (!rawDescription || rawDescription.length < 10) {
    return res.status(400).json({ error: 'Informe uma descricao com pelo menos 10 caracteres.' });
  }

  const titulo = rawTitle.slice(0, 180);
  const truncatedDescription = rawDescription.length > 6000 ? rawDescription.slice(0, 6000) : rawDescription;
  const descricao = normalizeScriptDescription(truncatedDescription);

  try {
    const result = insertContentScriptStmt.run(titulo, descricao, req.auth?.user?.id || null);
    const script = findContentScriptByIdStmt.get(result.lastInsertRowid);
    return res.status(201).json(script);
  } catch (error) {
    console.error('Erro ao cadastrar roteiro:', error);
    return res.status(500).json({ error: 'Nao foi possivel cadastrar o roteiro.' });
  }
});

app.get('/sku-points', authenticate, authorizeMaster, (req, res) => {
  try {
    const rows = listSkuPointsStmt.all().map((row) => formatSkuPointRow(row)).filter(Boolean);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('Erro ao listar pontos por SKU:', error);
    return res.status(500).json({ error: 'Nao foi possivel listar os pontos por SKU.' });
  }
});

app.post('/sku-points', authenticate, authorizeMaster, (req, res) => {
  const { data, error } = normalizeSkuPointsPayload(req.body || {});
  if (error) {
    return res.status(400).json(error);
  }

  const existing = findSkuPointBySkuStmt.get(data.sku);
  if (existing) {
    return res.status(409).json({ error: 'SKU ja cadastrado.' });
  }

  try {
    const result = insertSkuPointStmt.run({
      sku: data.sku,
      description: data.description,
      points_per_unit: data.points_per_unit,
      active: data.active ? 1 : 0
    });
    const row = findSkuPointByIdStmt.get(result.lastInsertRowid);
    return res.status(201).json(formatSkuPointRow(row));
  } catch (err) {
    console.error('Erro ao cadastrar pontos de SKU:', err);
    return res.status(500).json({ error: 'Nao foi possivel cadastrar o SKU.' });
  }
});

app.put('/sku-points/:id', authenticate, authorizeMaster, (req, res) => {
  const skuId = Number(req.params.id);
  if (!Number.isInteger(skuId) || skuId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const existing = findSkuPointByIdStmt.get(skuId);
  if (!existing) {
    return res.status(404).json({ error: 'Cadastro de pontos nao encontrado.' });
  }

  const { data, error } = normalizeSkuPointsPayload(req.body || {});
  if (error) {
    return res.status(400).json(error);
  }

  const duplicate = findSkuPointBySkuStmt.get(data.sku);
  if (duplicate && duplicate.id !== skuId) {
    return res.status(409).json({ error: 'SKU ja cadastrado.' });
  }

  try {
    updateSkuPointStmt.run({
      id: skuId,
      sku: data.sku,
      description: data.description,
      points_per_unit: data.points_per_unit,
      active: data.active ? 1 : 0
    });
    const row = findSkuPointByIdStmt.get(skuId);
    return res.status(200).json(formatSkuPointRow(row));
  } catch (err) {
    console.error('Erro ao atualizar pontos de SKU:', err);
    return res.status(500).json({ error: 'Nao foi possivel atualizar o SKU.' });
  }
});

app.delete('/sku-points/:id', authenticate, authorizeMaster, (req, res) => {
  const skuId = Number(req.params.id);
  if (!Number.isInteger(skuId) || skuId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const existing = findSkuPointByIdStmt.get(skuId);
  if (!existing) {
    return res.status(404).json({ error: 'Cadastro de pontos nao encontrado.' });
  }

  try {
    deleteSkuPointStmt.run(skuId);
    return res.status(200).json({ message: 'Cadastro de pontos removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao remover pontos de SKU:', err);
    return res.status(500).json({ error: 'Nao foi possivel remover o SKU.' });
  }
});

app.post('/sales', authenticate, authorizeMaster, (req, res) => {
  const { data, error } = normalizeSaleBody(req.body || {});
  if (error) {
    return res.status(400).json(error);
  }

  const influencer = findInfluencerByCouponStmt.get(data.cupom);
  if (!influencer) {
    return res.status(404).json({ error: 'Cupom nao encontrado.' });
  }

  const existingSale = findSaleByOrderNumberStmt.get(data.orderNumber);
  if (existingSale) {
    return res.status(409).json({ error: 'Ja existe uma venda com esse numero de pedido.' });
  }

  try {
    const result = insertSaleStmt.run({
      influencer_id: influencer.id,
      order_number: data.orderNumber,
      date: data.date,
      gross_value: 0,
      discount: 0,
      net_value: 0,
      commission: pointsToBrl(data.points),
      points: data.points
    });
    const created = findSaleByIdStmt.get(result.lastInsertRowid);
    return res.status(201).json(formatSaleRow(created));
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'Ja existe uma venda com esse numero de pedido.' });
    }
    console.error('Erro ao cadastrar venda:', err);
    return res.status(500).json({ error: 'Nao foi possivel cadastrar a venda.' });
  }
});

app.put('/sales/:id', authenticate, authorizeMaster, (req, res) => {
  const saleId = Number(req.params.id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const existingSale = findSaleByIdStmt.get(saleId);
  if (!existingSale) {
    return res.status(404).json({ error: 'Venda nao encontrada.' });
  }

  const { data, error } = normalizeSaleBody(req.body || {});
  if (error) {
    return res.status(400).json(error);
  }

  const influencer = findInfluencerByCouponStmt.get(data.cupom);
  if (!influencer) {
    return res.status(404).json({ error: 'Cupom nao encontrado.' });
  }

  const conflictingSale = findSaleByOrderNumberStmt.get(data.orderNumber);
  if (conflictingSale && conflictingSale.id !== saleId) {
    return res.status(409).json({ error: 'Ja existe uma venda com esse numero de pedido.' });
  }

  try {
    updateSaleStmt.run({
      id: saleId,
      influencer_id: influencer.id,
      order_number: data.orderNumber,
      date: data.date,
      gross_value: 0,
      discount: 0,
      net_value: 0,
      commission: pointsToBrl(data.points),
      points: data.points
    });

    const updated = findSaleByIdStmt.get(saleId);
    return res.status(200).json(formatSaleRow(updated));
  } catch (err) {
    if (err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ error: 'Ja existe uma venda com esse numero de pedido.' });
    }
    console.error('Erro ao atualizar venda:', err);
    return res.status(500).json({ error: 'Nao foi possivel atualizar a venda.' });
  }
});

app.delete('/sales/:id', authenticate, authorizeMaster, (req, res) => {
  const saleId = Number(req.params.id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const existingSale = findSaleByIdStmt.get(saleId);
  if (!existingSale) {
    return res.status(404).json({ error: 'Venda nao encontrada.' });
  }

  try {
    deleteSaleStmt.run(saleId);
    return res.status(200).json({ message: 'Venda removida com sucesso.' });
  } catch (err) {
    console.error('Erro ao remover venda:', err);
    return res.status(500).json({ error: 'Nao foi possivel remover a venda.' });
  }
});

app.get('/sales/summary/:influencerId', authenticate, verificarAceite, (req, res) => {
  const { influencer, status, message } = ensureInfluencerAccess(req, req.params.influencerId);
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  try {
    const summary = salesSummaryStmt.get(influencer.id) || { total_points: 0 };
    const totalPoints = Number(summary.total_points || 0);
    return res.status(200).json({
      influencer_id: influencer.id,
      cupom: influencer.cupom,
      commission_rate: influencer.commission_rate != null ? Number(influencer.commission_rate) : 0,
      total_points: totalPoints,
      total_points_value: pointsToBrl(totalPoints),
      point_value_brl: POINT_VALUE_BRL
    });
  } catch (err) {
    console.error('Erro ao obter resumo de vendas:', err);
    return res.status(500).json({ error: 'Nao foi possivel obter o resumo de vendas.' });
  }
});

app.get('/sales/:influencerId', authenticate, verificarAceite, (req, res) => {
  const { influencer, status, message } = ensureInfluencerAccess(req, req.params.influencerId);
  if (!influencer) {
    return res.status(status).json({ error: message });
  }

  try {
    const rows = listSalesByInfluencerStmt.all(influencer.id);
    return res.status(200).json(rows.map(formatSaleRow));
  } catch (err) {
    console.error('Erro ao listar vendas:', err);
    return res.status(500).json({ error: 'Nao foi possivel listar as vendas.' });
  }
});

app.get('/influenciadoras/consulta', authenticate, authorizeMaster, (req, res) => {
  try {
    const rows = listInfluencerSummaryStmt.all();
    const formatted = rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      instagram: row.instagram,
      cupom: row.cupom,
      commission_rate: row.commission_rate != null ? Number(row.commission_rate) : 0,
      vendas_count: Number(row.vendas_count || 0),
      vendas_total_points: Number(row.vendas_total || 0),
      vendas_total: pointsToBrl(row.vendas_total || 0)
    }));
    return res.status(200).json(formatted);
  } catch (error) {
    console.error('Erro ao consultar influenciadoras:', error);
    return res.status(500).json({ error: 'Nao foi possivel consultar as influenciadoras.' });
  }
});

app.get('/influenciadoras', authenticate, verificarAceite, (req, res) => {
  try {
    if (req.auth.user.role === 'master') {
      return res.status(200).json(listInfluencersStmt.all());
    }

    const own = findInfluencerByUserIdStmt.get(req.auth.user.id);
    if (!own) {
      return res.status(200).json([]);
    }
    return res.status(200).json([own]);
  } catch (error) {
    console.error('Erro ao listar influenciadoras:', error);
    return res.status(500).json({ error: 'Nao foi possivel listar as influenciadoras.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(primaryStaticDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
