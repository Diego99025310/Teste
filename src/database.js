require('./config/env');
const path = require('path');
const { brlToPoints } = require('./utils/points');

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
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
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

  const hasPointsColumn = tableInfo.some((column) => column.name === 'points');
  if (!hasPointsColumn) {
    db.exec('ALTER TABLE sales ADD COLUMN points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0);');
    tableInfo = db.prepare('PRAGMA table_info(sales)').all();

    const selectExistingSales = db.prepare('SELECT id, commission FROM sales');
    const updatePointsStmt = db.prepare('UPDATE sales SET points = ? WHERE id = ?');
    const rows = selectExistingSales.all();
    rows.forEach((row) => {
      if (!row || row.id == null) {
        return;
      }
      const points = brlToPoints(row.commission || 0);
      updatePointsStmt.run(points, row.id);
    });
  }

  sanitizeSqliteOrderNumbers();
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uniq_sales_order_number ON sales(order_number);');
};

const createSaleSkuPointsTable = (tableName = 'sale_sku_points') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    points_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (points_per_unit >= 0),
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const ensureSaleSkuPointsTable = () => {
  const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sale_sku_points'").get();
  if (!tableInfo) {
    db.exec(createSaleSkuPointsTable());
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_sale_sku_points_sale_id ON sale_sku_points(sale_id);');
};

const createSkuPointsTable = (tableName = 'sku_points') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    description TEXT,
    points_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (points_per_unit >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const ensureSkuPointsTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(sku_points)').all();
  if (!tableInfo.length) {
    db.exec(createSkuPointsTable());
    tableInfo = db.prepare('PRAGMA table_info(sku_points)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);

  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE sku_points ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(sku_points)').all();
    }
  };

  ensureColumn('description', 'description TEXT');
  ensureColumn('points_per_unit', 'points_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (points_per_unit >= 0)');
  ensureColumn('active', 'active INTEGER NOT NULL DEFAULT 1');
  ensureColumn('created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uniq_sku_points_sku ON sku_points(LOWER(sku));');
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

const createContentScriptsTable = (tableName = 'content_scripts') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    video_url TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );
`;

const ensureContentScriptsTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(content_scripts)').all();
  if (!tableInfo.length) {
    db.exec(createContentScriptsTable());
    tableInfo = db.prepare('PRAGMA table_info(content_scripts)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);

  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE content_scripts ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(content_scripts)').all();
    }
  };

  ensureColumn('titulo', 'titulo TEXT NOT NULL DEFAULT ""');
  ensureColumn('descricao', 'descricao TEXT NOT NULL DEFAULT ""');
  ensureColumn('video_url', 'video_url TEXT');
  ensureColumn('created_by', 'created_by INTEGER');
  ensureColumn('created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  db.exec('CREATE INDEX IF NOT EXISTS idx_content_scripts_created_at ON content_scripts(created_at DESC);');
};

const createMonthlyCyclesTable = (tableName = 'monthly_cycles') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_year INTEGER NOT NULL,
    cycle_month INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const ensureMonthlyCyclesTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(monthly_cycles)').all();
  if (!tableInfo.length) {
    db.exec(createMonthlyCyclesTable());
    tableInfo = db.prepare('PRAGMA table_info(monthly_cycles)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);

  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE monthly_cycles ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(monthly_cycles)').all();
    }
  };

  ensureColumn('status', "status TEXT NOT NULL DEFAULT 'open'");
  ensureColumn('started_at', 'started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('closed_at', 'closed_at DATETIME');
  ensureColumn('created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uniq_monthly_cycles_year_month ON monthly_cycles(cycle_year, cycle_month);'
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_monthly_cycles_status ON monthly_cycles(status, cycle_year DESC, cycle_month DESC);"
  );
};

const createInfluencerPlansTable = (tableName = 'influencer_plans') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    influencer_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    content_script_id INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posted', 'validated', 'missed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cycle_id) REFERENCES monthly_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY(influencer_id) REFERENCES influenciadoras(id) ON DELETE CASCADE,
    FOREIGN KEY(content_script_id) REFERENCES content_scripts(id) ON DELETE SET NULL
  );
`;

const ensureInfluencerPlansTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(influencer_plans)').all();
  if (!tableInfo.length) {
    db.exec(createInfluencerPlansTable());
    tableInfo = db.prepare('PRAGMA table_info(influencer_plans)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);

  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE influencer_plans ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(influencer_plans)').all();
    }
  };

  ensureColumn('status', "status TEXT NOT NULL DEFAULT 'scheduled'");
  ensureColumn('notes', 'notes TEXT');
  ensureColumn('content_script_id', 'content_script_id INTEGER');
  ensureColumn('updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uniq_influencer_plans_cycle_influencer_date ON influencer_plans(cycle_id, influencer_id, scheduled_date);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_influencer_plans_influencer ON influencer_plans(influencer_id, scheduled_date);'
  );
};

const createStorySubmissionsTable = (tableName = 'story_submissions') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    influencer_id INTEGER NOT NULL,
    plan_id INTEGER,
    scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    validation_type TEXT DEFAULT 'manual',
    auto_detected INTEGER DEFAULT 0,
    proof_url TEXT,
    proof_notes TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    validated_at DATETIME,
    validated_by INTEGER,
    rejection_reason TEXT,
    FOREIGN KEY(cycle_id) REFERENCES monthly_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY(influencer_id) REFERENCES influenciadoras(id) ON DELETE CASCADE,
    FOREIGN KEY(plan_id) REFERENCES influencer_plans(id) ON DELETE SET NULL,
    FOREIGN KEY(validated_by) REFERENCES users(id) ON DELETE SET NULL
  );
`;

const ensureStorySubmissionsTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(story_submissions)').all();
  if (!tableInfo.length) {
    db.exec(createStorySubmissionsTable());
    tableInfo = db.prepare('PRAGMA table_info(story_submissions)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);
  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE story_submissions ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(story_submissions)').all();
    }
  };

  ensureColumn('rejection_reason', 'rejection_reason TEXT');
  ensureColumn('auto_detected', 'auto_detected INTEGER DEFAULT 0');
  ensureColumn('validation_type', "validation_type TEXT DEFAULT 'manual'");

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_story_submissions_cycle_status ON story_submissions(cycle_id, status, scheduled_date);'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uniq_story_submissions_plan ON story_submissions(plan_id) WHERE plan_id IS NOT NULL;'
  );
};

const createMonthlyCommissionsTable = (tableName = 'monthly_commissions') => `
  CREATE TABLE ${tableName} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id INTEGER NOT NULL,
    influencer_id INTEGER NOT NULL,
    validated_days INTEGER NOT NULL DEFAULT 0,
    multiplier REAL NOT NULL DEFAULT 0,
    base_commission REAL NOT NULL DEFAULT 0,
    total_commission REAL NOT NULL DEFAULT 0,
    base_points INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    deliveries_planned INTEGER NOT NULL DEFAULT 0,
    deliveries_completed INTEGER NOT NULL DEFAULT 0,
    validation_summary TEXT,
    closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cycle_id) REFERENCES monthly_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY(influencer_id) REFERENCES influenciadoras(id) ON DELETE CASCADE
  );
`;

const ensureMonthlyCommissionsTable = () => {
  let tableInfo = db.prepare('PRAGMA table_info(monthly_commissions)').all();
  if (!tableInfo.length) {
    db.exec(createMonthlyCommissionsTable());
    tableInfo = db.prepare('PRAGMA table_info(monthly_commissions)').all();
  }

  const hasColumn = (name) => tableInfo.some((column) => column.name === name);
  const ensureColumn = (name, definition) => {
    if (!hasColumn(name)) {
      db.exec(`ALTER TABLE monthly_commissions ADD COLUMN ${definition};`);
      tableInfo = db.prepare('PRAGMA table_info(monthly_commissions)').all();
    }
  };

  ensureColumn('validation_summary', 'validation_summary TEXT');
  ensureColumn('deliveries_planned', 'deliveries_planned INTEGER NOT NULL DEFAULT 0');
  ensureColumn('deliveries_completed', 'deliveries_completed INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('base_points')) {
    db.exec('ALTER TABLE monthly_commissions ADD COLUMN base_points INTEGER NOT NULL DEFAULT 0');
    tableInfo = db.prepare('PRAGMA table_info(monthly_commissions)').all();
    const selectRows = db.prepare('SELECT id, base_commission, total_commission FROM monthly_commissions');
    const updateStmt = db.prepare('UPDATE monthly_commissions SET base_points = ?, total_points = ? WHERE id = ?');
    selectRows.all().forEach((row) => {
      if (!row || row.id == null) {
        return;
      }
      const basePoints = brlToPoints(row.base_commission || 0);
      const totalPoints = brlToPoints(row.total_commission || 0);
      updateStmt.run(basePoints, totalPoints, row.id);
    });
  }
  ensureColumn('total_points', 'total_points INTEGER NOT NULL DEFAULT 0');

  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uniq_monthly_commissions_cycle_influencer ON monthly_commissions(cycle_id, influencer_id);'
  );
};

ensureUsersTable();
ensureInfluenciadorasTable();
ensureSalesTable();
ensureSaleSkuPointsTable();
ensureSkuPointsTable();
ensureAceiteTermosTable();
ensureContentScriptsTable();
ensureMonthlyCyclesTable();
ensureInfluencerPlansTable();
ensureStorySubmissionsTable();
ensureMonthlyCommissionsTable();

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
