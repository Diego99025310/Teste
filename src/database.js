require('./config/env');
const path = require('path');

const normalizeDigits = (value) => (value || '').replace(/\D/g, '');
const trimString = (value) => (typeof value === 'string' ? value.trim() : value);

const Database = require('better-sqlite3');

const selectedClient = (process.env.DATABASE_CLIENT || process.env.DB_CLIENT || 'sqlite').toLowerCase();
if (selectedClient !== 'sqlite') {
  throw new Error('A aplicação agora suporta apenas SQLite. Ajuste DATABASE_CLIENT/DB_CLIENT para `sqlite`.');
}

const resolveDatabasePath = () => {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }
  return path.join(__dirname, '..', 'database.sqlite');
};

const dbPath = resolveDatabasePath();
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const mutatingStatementPattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i;
const mutatingCommandPattern = /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i;

let checkpointScheduled = false;

const runWalCheckpoint = () => {
  checkpointScheduled = false;
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (error) {
    console.error('Erro ao executar checkpoint WAL:', error);
  }
};

const scheduleCheckpoint = () => {
  if (checkpointScheduled) {
    return;
  }
  checkpointScheduled = true;
  setImmediate(runWalCheckpoint);
};

const originalPrepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const statement = originalPrepare(sql);
  if (typeof sql === 'string' && mutatingStatementPattern.test(sql) && typeof statement.run === 'function') {
    const originalRun = statement.run.bind(statement);
    statement.run = (...args) => {
      const result = originalRun(...args);
      scheduleCheckpoint();
      return result;
    };
  }
  return statement;
};

const originalExec = db.exec.bind(db);
db.exec = (sql) => {
  const result = originalExec(sql);
  if (typeof sql === 'string' && mutatingCommandPattern.test(sql)) {
    scheduleCheckpoint();
  }
  return result;
};

const createUsersTable = (tableName = 'users') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    phone TEXT UNIQUE,
    phone_normalized TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('master', 'influencer')),
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const ensureUsersTable = () => {
  const loadInfo = () => db.prepare('PRAGMA table_info(users)').all();
  let tableInfo = loadInfo();

  const needsMigration = !tableInfo.length
    || !tableInfo.some((column) => column.name === 'password_hash')
    || !tableInfo.some((column) => column.name === 'must_change_password');

  if (needsMigration) {
    db.exec('BEGIN');
    try {
      db.exec('DROP TABLE IF EXISTS users_new;');
      db.exec(createUsersTable('users_new'));

      if (tableInfo.length) {
        const hasPasswordHash = tableInfo.some((column) => column.name === 'password_hash');
        const hasPassword = tableInfo.some((column) => column.name === 'password');
        const hasPhone = tableInfo.some((column) => column.name === 'phone');
        const hasPhoneNormalized = tableInfo.some((column) => column.name === 'phone_normalized');

        const selectPasswordExpr = hasPasswordHash
          ? 'password_hash'
          : hasPassword
            ? 'password'
            : "''";

        const selectRoleExpr = tableInfo.some((column) => column.name === 'role')
          ? "CASE WHEN role IN ('master', 'influencer') THEN role ELSE 'master' END"
          : "'master'";

        const selectCreatedAtExpr = tableInfo.some((column) => column.name === 'created_at')
          ? 'created_at'
          : 'CURRENT_TIMESTAMP';

        const selectPhoneExpr = hasPhone ? "NULLIF(phone, '')" : 'NULL';
        const selectPhoneNormalizedExpr = hasPhoneNormalized ? "NULLIF(phone_normalized, '')" : 'NULL';

        db.exec(`
          INSERT INTO users_new (id, email, phone, phone_normalized, password_hash, role, must_change_password, created_at)
          SELECT
            id,
            email,
            ${selectPhoneExpr} AS phone,
            ${selectPhoneNormalizedExpr} AS phone_normalized,
            ${selectPasswordExpr} AS password_hash,
            ${selectRoleExpr} AS role,
            1 AS must_change_password,
            ${selectCreatedAtExpr} AS created_at
          FROM users;
        `);
      }

      db.exec('DROP TABLE IF EXISTS users;');
      db.exec('ALTER TABLE users_new RENAME TO users;');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    tableInfo = loadInfo();
  }

  const ensureColumn = (name, definition) => {
    if (!tableInfo.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${definition};`);
      tableInfo = loadInfo();
    }
  };

  ensureColumn('phone', 'phone TEXT');
  ensureColumn('phone_normalized', 'phone_normalized TEXT');

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone);');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_normalized ON users (phone_normalized);');

  const hasInfluenciadorasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='influenciadoras'")
    .get();

  let userPhoneRows = [];
  if (hasInfluenciadorasTable) {
    userPhoneRows = db
      .prepare(
        'SELECT u.id, u.phone, u.phone_normalized, i.contato FROM users u LEFT JOIN influenciadoras i ON i.user_id = u.id'
      )
      .all();
  } else {
    userPhoneRows = db
      .prepare('SELECT id, phone, phone_normalized FROM users')
      .all()
      .map((row) => ({ ...row, contato: null }));
  }
  const updateUserPhoneStmt = db.prepare('UPDATE users SET phone = ?, phone_normalized = ? WHERE id = ?');

  for (const row of userPhoneRows) {
    if (!row || row.id == null) {
      continue;
    }

    const currentPhone = trimString(row.phone) || null;
    const currentNormalized = trimString(row.phone_normalized) || null;

    let sourcePhone = currentPhone;
    if (!sourcePhone) {
      const contact = trimString(row.contato) || null;
      if (contact) {
        sourcePhone = contact;
      }
    }

    if (!sourcePhone) {
      if (currentPhone || currentNormalized) {
        updateUserPhoneStmt.run(null, null, row.id);
      }
      continue;
    }

    const normalizedDigits = normalizeDigits(sourcePhone);
    const nextPhone = sourcePhone;
    const nextNormalized = normalizedDigits ? normalizedDigits : null;

    if (nextPhone !== currentPhone || nextNormalized !== currentNormalized) {
      updateUserPhoneStmt.run(nextPhone, nextNormalized, row.id);
    }
  }
};

const createInfluenciadorasTable = (tableName = 'influenciadoras') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    instagram TEXT NOT NULL UNIQUE,
    cpf TEXT UNIQUE,
    email TEXT UNIQUE,
    contato TEXT UNIQUE,
    cupom TEXT UNIQUE,
    vendas_quantidade INTEGER DEFAULT 0,
    vendas_valor REAL DEFAULT 0,
    cep TEXT,
    numero TEXT,
    complemento TEXT,
    logradouro TEXT,
    bairro TEXT,
    cidade TEXT,
    estado TEXT,
    commission_rate REAL DEFAULT 0,
    contract_signature_code_hash TEXT,
    contract_signature_code_generated_at DATETIME,
    contract_signature_waived INTEGER DEFAULT 0,
    user_id INTEGER UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`;

const ensureInfluenciadorasTable = () => {
  const fetchInfo = () => db.prepare('PRAGMA table_info(influenciadoras)').all();
  let tableInfo = fetchInfo();

  if (!tableInfo.length) {
    db.exec(createInfluenciadorasTable());
    tableInfo = fetchInfo();
  }

  const hasColumn = (name, info = tableInfo) => info.some((column) => column.name === name);
  const emailColumn = tableInfo.find((column) => column.name === 'email');
  const hasLegacyColumns = ['conta', 'fone_ddd', 'fone_numero'].some((legacy) => hasColumn(legacy));
  const needsMigration = !hasColumn('contato') || !hasColumn('user_id') || !hasColumn('commission_rate') || hasLegacyColumns || (emailColumn && emailColumn.notnull === 1);

  if (needsMigration) {
    const stringExpression = (columnName) => (hasColumn(columnName) ? columnName : "''");
    const contatoExpression = hasColumn('contato')
      ? 'contato'
      : "TRIM(COALESCE(fone_ddd, '') || CASE WHEN TRIM(COALESCE(fone_ddd, '')) <> '' AND TRIM(COALESCE(fone_numero, '')) <> '' THEN ' ' ELSE '' END || COALESCE(fone_numero, ''))";
    const vendasQuantidadeExpression = hasColumn('vendas_quantidade') ? 'vendas_quantidade' : '0';
    const vendasValorExpression = hasColumn('vendas_valor') ? 'vendas_valor' : '0';
    const commissionExpression = hasColumn('commission_rate') ? 'commission_rate' : '0';

    db.exec('BEGIN');
    try {
      db.exec('DROP TABLE IF EXISTS influenciadoras_new;');
      db.exec(createInfluenciadorasTable('influenciadoras_new'));

      db.exec(`
        INSERT INTO influenciadoras_new (
          id,
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
          user_id,
          created_at
        )
        SELECT
          id,
          nome,
          instagram,
          NULLIF(${stringExpression('cpf')}, '') AS cpf,
          NULLIF(${stringExpression('email')}, '') AS email,
          NULLIF(${contatoExpression}, '') AS contato,
          NULLIF(${stringExpression('cupom')}, '') AS cupom,
          ${vendasQuantidadeExpression} AS vendas_quantidade,
          ${vendasValorExpression} AS vendas_valor,
          NULLIF(${stringExpression('cep')}, '') AS cep,
          NULLIF(${stringExpression('numero')}, '') AS numero,
          NULLIF(${stringExpression('complemento')}, '') AS complemento,
          NULLIF(${stringExpression('logradouro')}, '') AS logradouro,
          NULLIF(${stringExpression('bairro')}, '') AS bairro,
          NULLIF(${stringExpression('cidade')}, '') AS cidade,
          NULLIF(${stringExpression('estado')}, '') AS estado,
          ${commissionExpression} AS commission_rate,
          NULLIF(${stringExpression('contract_signature_code_hash')}, '') AS contract_signature_code_hash,
          NULLIF(${stringExpression('contract_signature_code_generated_at')}, '') AS contract_signature_code_generated_at,
          CASE WHEN TRIM(COALESCE(${stringExpression('contract_signature_waived')}, '')) IN ('1', 'true', 'TRUE') THEN 1 ELSE 0 END AS contract_signature_waived,
          CASE WHEN ${hasColumn('user_id') ? 'user_id' : 'NULL'} IS NOT NULL THEN ${hasColumn('user_id') ? 'user_id' : 'NULL'} ELSE NULL END AS user_id,
          created_at
        FROM influenciadoras;
      `);

      db.exec('DROP TABLE influenciadoras;');
      db.exec('ALTER TABLE influenciadoras_new RENAME TO influenciadoras;');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    tableInfo = fetchInfo();
  }

  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE influenciadoras ADD COLUMN ${definition};`);
      tableInfo = fetchInfo();
    }
  };

  ensureColumn('contract_signature_code_hash', 'contract_signature_code_hash TEXT');
  ensureColumn('contract_signature_code_generated_at', 'contract_signature_code_generated_at DATETIME');
  ensureColumn('contract_signature_waived', 'contract_signature_waived INTEGER DEFAULT 0');
};

const createSalesTable = (tableName = 'sales') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    influencer_id INTEGER NOT NULL,
    order_number TEXT,
    date TEXT NOT NULL,
    gross_value REAL NOT NULL CHECK (gross_value >= 0),
    discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
    net_value REAL NOT NULL CHECK (net_value >= 0),
    commission REAL NOT NULL CHECK (commission >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(influencer_id) REFERENCES influenciadoras(id) ON DELETE CASCADE
  );
`;

const sanitizeSqliteOrderNumbers = () => {
  db.exec('UPDATE sales SET order_number = TRIM(order_number) WHERE order_number IS NOT NULL;');
  db.exec("UPDATE sales SET order_number = NULL WHERE order_number IS NOT NULL AND order_number = '';");

  const duplicates = db
    .prepare(`SELECT order_number FROM sales WHERE order_number IS NOT NULL GROUP BY order_number HAVING COUNT(*) > 1;`)
    .all();

  if (!duplicates.length) {
    return;
  }

  const selectIds = db.prepare('SELECT id FROM sales WHERE order_number = ? ORDER BY id;');
  const clearOrderNumber = db.prepare('UPDATE sales SET order_number = NULL WHERE id = ?;');

  db.exec('BEGIN');
  try {
    for (const row of duplicates) {
      const orderNumber = row?.order_number;
      if (!orderNumber) {
        continue;
      }

      const rows = selectIds.all(orderNumber);
      if (!rows.length) {
        continue;
      }

      for (let index = 1; index < rows.length; index += 1) {
        const duplicateId = rows[index]?.id;
        if (duplicateId == null) {
          continue;
        }
        clearOrderNumber.run(duplicateId);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const ensureSalesTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(sales)').all();
  if (!tableInfo.length) {
    db.exec(createSalesTable());
    tableInfo = db.prepare('PRAGMA table_info(sales)').all();
  }

  const hasOrderNumber = tableInfo.some((column) => column.name === 'order_number');
  if (!hasOrderNumber) {
    db.exec('ALTER TABLE sales ADD COLUMN order_number TEXT;');
  }

  sanitizeSqliteOrderNumbers();
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_order_number ON sales(order_number);');
};

const ensurePasswordResetsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);');
};

const ensureAceiteTermosTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS aceite_termos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      versao_termo TEXT NOT NULL,
      hash_termo TEXT NOT NULL,
      data_aceite TEXT NOT NULL,
      ip_usuario TEXT,
      user_agent TEXT,
      canal_autenticacao TEXT DEFAULT 'token_email',
      status TEXT DEFAULT 'aceito',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_aceite_termos_user ON aceite_termos(user_id);');
};

const ensureTokensVerificacaoTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens_verificacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expira_em INTEGER NOT NULL,
      usado INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_tokens_verificacao_user ON tokens_verificacao(user_id);');
};

ensureUsersTable();
ensureInfluenciadorasTable();
ensureSalesTable();
ensurePasswordResetsTable();
ensureAceiteTermosTable();
ensureTokensVerificacaoTable();

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_instagram ON influenciadoras(instagram);');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_cpf ON influenciadoras(cpf) WHERE cpf IS NOT NULL;');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_email ON influenciadoras(email COLLATE NOCASE) WHERE email IS NOT NULL;');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_contato ON influenciadoras(contato) WHERE contato IS NOT NULL;');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_cupom ON influenciadoras(LOWER(cupom)) WHERE cupom IS NOT NULL;');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_influenciadoras_user_id ON influenciadoras(user_id) WHERE user_id IS NOT NULL;');
db.exec('CREATE INDEX IF NOT EXISTS idx_sales_influencer ON sales(influencer_id);');

module.exports = db;
module.exports.databasePath = dbPath;
module.exports.client = 'sqlite';
module.exports.ready = Promise.resolve();
