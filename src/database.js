require('./config/env');
const path = require('path');

const normalizeDigits = (value) => (value || '').replace(/\D/g, '');
const trimString = (value) => (typeof value === 'string' ? value.trim() : value);

const client = (process.env.DATABASE_CLIENT || process.env.DB_CLIENT || 'sqlite').toLowerCase();

if (client === 'mysql') {
  const mysql = require('mysql2/promise');

  const parseMysqlUrl = (url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mysql:') {
      throw new Error('DATABASE_URL deve usar o protocolo mysql://');
    }

    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'sistema'
    };
  };

  const getMysqlConfig = () => {
    if (process.env.DATABASE_URL) {
      const parsed = parseMysqlUrl(process.env.DATABASE_URL);
      return {
        ...parsed,
        connectionLimit: Number.parseInt(process.env.MYSQL_POOL_SIZE || '', 10) || 10
      };
    }

    return {
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number.parseInt(process.env.MYSQL_PORT || '', 10) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sistema',
      connectionLimit: Number.parseInt(process.env.MYSQL_POOL_SIZE || '', 10) || 10
    };
  };

  const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

  const transformNamedParameters = (sql) => {
    const paramOrder = [];
    const transformed = sql.replace(/@([A-Za-z0-9_]+)/g, (_, name) => {
      paramOrder.push(name);
      return '?';
    });
    return { sql: transformed, paramOrder };
  };

  const normalizeParams = (args, paramOrder) => {
    if (!args.length) {
      return [];
    }

    if (paramOrder && paramOrder.length) {
      if (args.length === 1) {
        const [single] = args;
        if (Array.isArray(single)) {
          return single;
        }
        if (isPlainObject(single)) {
          return paramOrder.map((key) => single[key]);
        }
      }
      const values = Array.from(args);
      return paramOrder.map((_, index) => values[index]);
    }

    if (args.length === 1) {
      const [single] = args;
      if (Array.isArray(single)) {
        return single;
      }
      return [single];
    }

    return Array.from(args);
  };

  const buildMysqlAdapter = (executor, options = {}) => {
    const { pool = null, isTransaction = false, database } = options;

    const adapter = { client: 'mysql', database };

    adapter.prepare = (sql) => {
      const { sql: transformedSql, paramOrder } = transformNamedParameters(sql);
      return {
        async run(...args) {
          const params = normalizeParams(args, paramOrder);
          const [result] = await executor.execute(transformedSql, params);
          return {
            changes: result?.affectedRows ?? 0,
            lastInsertRowid: result?.insertId ?? null
          };
        },
        async get(...args) {
          const params = normalizeParams(args, paramOrder);
          const [rows] = await executor.execute(transformedSql, params);
          return Array.isArray(rows) ? rows[0] ?? null : null;
        },
        async all(...args) {
          const params = normalizeParams(args, paramOrder);
          const [rows] = await executor.execute(transformedSql, params);
          return Array.isArray(rows) ? rows : [];
        }
      };
    };

    adapter.run = async (sql, params = []) => {
      const normalized = Array.isArray(params) ? params : [params];
      const [result] = await executor.execute(sql, normalized);
      return {
        changes: result?.affectedRows ?? 0,
        lastInsertRowid: result?.insertId ?? null
      };
    };

    adapter.get = async (sql, params = []) => {
      const normalized = Array.isArray(params) ? params : [params];
      const [rows] = await executor.execute(sql, normalized);
      return Array.isArray(rows) ? rows[0] ?? null : null;
    };

    adapter.all = async (sql, params = []) => {
      const normalized = Array.isArray(params) ? params : [params];
      const [rows] = await executor.execute(sql, normalized);
      return Array.isArray(rows) ? rows : [];
    };

    adapter.exec = async (sql) => {
      await executor.query(sql);
    };

    adapter.transaction = async (callback) => {
      if (isTransaction) {
        return callback(adapter);
      }
      if (!pool || typeof pool.getConnection !== 'function') {
        throw new Error('Transaction support requires a connection pool.');
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const transactionalAdapter = buildMysqlAdapter(connection, {
          pool,
          isTransaction: true,
          database
        });
        const result = await callback(transactionalAdapter);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    };

    adapter.close = async () => {
      if (isTransaction) {
        if (typeof executor.release === 'function') {
          executor.release();
        }
        return;
      }
      if (pool && typeof pool.end === 'function') {
        await pool.end();
      }
    };

    return adapter;
  };

  const sanitizeMysqlOrderNumbers = async (db) => {
    await db.run('UPDATE sales SET order_number = TRIM(order_number) WHERE order_number IS NOT NULL;');
    await db.run("UPDATE sales SET order_number = NULL WHERE order_number IS NOT NULL AND order_number = '';");

    const duplicates = await db.all(
      `SELECT order_number FROM sales WHERE order_number IS NOT NULL GROUP BY order_number HAVING COUNT(*) > 1`
    );

    if (!Array.isArray(duplicates) || duplicates.length === 0) {
      return;
    }

    await db.transaction(async (trx) => {
      for (const row of duplicates) {
        const orderNumber = row?.order_number;
        if (!orderNumber) {
          continue;
        }

        const rows = await trx.all(
          'SELECT id FROM sales WHERE order_number = ? ORDER BY id ASC',
          [orderNumber]
        );

        if (!Array.isArray(rows) || rows.length < 2) {
          continue;
        }

        const [, ...rest] = rows;
        for (const duplicate of rest) {
          const duplicateId = duplicate?.id;
          if (duplicateId == null) {
            continue;
          }

          await trx.run('UPDATE sales SET order_number = NULL WHERE id = ?', [duplicateId]);
        }
      }
    });
  };

  const ensureMysqlSchema = async (db) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50) UNIQUE,
        phone_normalized VARCHAR(50) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('master','influencer') NOT NULL,
        must_change_password TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS influenciadoras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        instagram VARCHAR(255) NOT NULL UNIQUE,
        cpf VARCHAR(20) UNIQUE,
        email VARCHAR(255) UNIQUE,
        contato VARCHAR(50) UNIQUE,
        cupom VARCHAR(50) UNIQUE,
        vendas_quantidade INT DEFAULT 0,
        vendas_valor DECIMAL(12,2) DEFAULT 0,
        cep VARCHAR(20),
        numero VARCHAR(20),
        complemento VARCHAR(100),
        logradouro VARCHAR(255),
        bairro VARCHAR(255),
        cidade VARCHAR(255),
        estado VARCHAR(20),
        commission_rate DECIMAL(5,2) DEFAULT 0,
        contract_signature_code_hash VARCHAR(255),
        contract_signature_code_generated_at DATETIME,
        contract_signature_waived TINYINT(1) DEFAULT 0,
        user_id INT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_influenciadoras_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        influencer_id INT NOT NULL,
        order_number VARCHAR(100),
        date DATE NOT NULL,
        gross_value DECIMAL(12,2) NOT NULL CHECK (gross_value >= 0),
        discount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        net_value DECIMAL(12,2) NOT NULL CHECK (net_value >= 0),
        commission DECIMAL(12,2) NOT NULL CHECK (commission >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sales_influencer FOREIGN KEY (influencer_id)
          REFERENCES influenciadoras(id) ON DELETE CASCADE,
        INDEX idx_sales_influencer (influencer_id),
        UNIQUE KEY uniq_sales_order_number (order_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        expires_at BIGINT NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP()),
        CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_password_resets_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS aceite_termos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        versao_termo VARCHAR(20) NOT NULL,
        hash_termo VARCHAR(255) NOT NULL,
        data_aceite DATETIME NOT NULL,
        ip_usuario VARCHAR(100),
        user_agent TEXT,
        canal_autenticacao VARCHAR(50) DEFAULT 'token_email',
        status VARCHAR(50) DEFAULT 'aceito',
        CONSTRAINT fk_aceite_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_aceite_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS tokens_verificacao (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(20) NOT NULL,
        expira_em BIGINT NOT NULL,
        usado TINYINT(1) DEFAULT 0,
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP()),
        CONSTRAINT fk_tokens_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tokens_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const userColumns = await db.all(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [config.database, 'users']
    );

    const userColumnNames = new Set(
      Array.isArray(userColumns) ? userColumns.map((column) => column.COLUMN_NAME) : []
    );

    if (!userColumnNames.has('phone')) {
      await db.exec('ALTER TABLE users ADD COLUMN phone VARCHAR(50);');
    }

    if (!userColumnNames.has('phone_normalized')) {
      await db.exec('ALTER TABLE users ADD COLUMN phone_normalized VARCHAR(50);');
    }

    const hasUniqueUserIndex = async (columnName) => {
      const row = await db.get(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND NON_UNIQUE = 0 LIMIT 1`,
        [config.database, 'users', columnName]
      );
      return Boolean(row);
    };

    if (!(await hasUniqueUserIndex('phone'))) {
      await db.exec('CREATE UNIQUE INDEX idx_users_phone ON users (phone);');
    }

    if (!(await hasUniqueUserIndex('phone_normalized'))) {
      await db.exec('CREATE UNIQUE INDEX idx_users_phone_normalized ON users (phone_normalized);');
    }

    const updateUserPhoneStmt = db.prepare('UPDATE users SET phone = ?, phone_normalized = ? WHERE id = ?');

    const hasInfluenciadorasTable = await db.get(
      `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
      [config.database, 'influenciadoras']
    );

    let selectUserPhoneRows = [];
    if (hasInfluenciadorasTable) {
      selectUserPhoneRows = await db.all(
        `SELECT u.id, u.phone, u.phone_normalized, i.contato
         FROM users u
         LEFT JOIN influenciadoras i ON i.user_id = u.id`
      );
    } else {
      selectUserPhoneRows = await db.all(
        `SELECT u.id, u.phone, u.phone_normalized FROM users u`
      );
    }

    if (Array.isArray(selectUserPhoneRows) && selectUserPhoneRows.length) {
      for (const row of selectUserPhoneRows) {
        if (!row || row.id == null) {
          continue;
        }

        const currentPhone = trimString(row.phone);
        const currentNormalized = trimString(row.phone_normalized) || null;

        let sourcePhone = currentPhone;
        if (!sourcePhone) {
          const contactValue = hasInfluenciadorasTable ? trimString(row.contato) || null : null;
          if (contactValue) {
            sourcePhone = contactValue;
          }
        }

        if (!sourcePhone) {
          if (currentPhone || currentNormalized) {
            await updateUserPhoneStmt.run(null, null, row.id);
          }
          continue;
        }

        const normalizedDigits = normalizeDigits(sourcePhone);
        const nextPhone = sourcePhone;
        const nextNormalized = normalizedDigits ? normalizedDigits : null;

        if (nextPhone !== currentPhone || nextNormalized !== currentNormalized) {
          await updateUserPhoneStmt.run(nextPhone, nextNormalized, row.id);
        }
      }
    }

    const influencerColumns = await db.all(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [config.database, 'influenciadoras']
    );

    const influencerColumnNames = new Set(
      Array.isArray(influencerColumns) ? influencerColumns.map((column) => column.COLUMN_NAME) : []
    );

    if (!influencerColumnNames.has('contract_signature_code_hash')) {
      await db.exec('ALTER TABLE influenciadoras ADD COLUMN contract_signature_code_hash VARCHAR(255);');
    }

    if (!influencerColumnNames.has('contract_signature_code_generated_at')) {
      await db.exec('ALTER TABLE influenciadoras ADD COLUMN contract_signature_code_generated_at DATETIME;');
    }
    if (!influencerColumnNames.has('contract_signature_waived')) {
      await db.exec('ALTER TABLE influenciadoras ADD COLUMN contract_signature_waived TINYINT(1) DEFAULT 0;');
    }

    const salesColumns = await db.all(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [config.database, 'sales']
    );
    const hasOrderNumberColumn = Array.isArray(salesColumns)
      ? salesColumns.some((column) => column.COLUMN_NAME === 'order_number')
      : false;
    if (!hasOrderNumberColumn) {
      await db.exec('ALTER TABLE sales ADD COLUMN order_number VARCHAR(100);');
    }

    const uniqueIndexRows = await db.all(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'order_number' AND NON_UNIQUE = 0`,
      [config.database, 'sales']
    );
    const hasUniqueOrderNumberIndex = Array.isArray(uniqueIndexRows) && uniqueIndexRows.length > 0;
    if (!hasUniqueOrderNumberIndex) {
      await sanitizeMysqlOrderNumbers(db);
      await db.exec('CREATE UNIQUE INDEX uniq_sales_order_number ON sales (order_number);');
    }

    const hasUniqueIndexForColumn = async (columnName) => {
      const row = await db.get(
        `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND NON_UNIQUE = 0 LIMIT 1`,
        [config.database, 'influenciadoras', columnName]
      );
      return Boolean(row);
    };

    const ensureUniqueIndex = async (columnName, indexName) => {
      if (!(await hasUniqueIndexForColumn(columnName))) {
        await db.exec(`CREATE UNIQUE INDEX ${indexName} ON influenciadoras (${columnName});`);
      }
    };

    await ensureUniqueIndex('cpf', 'idx_influenciadoras_cpf');
    await ensureUniqueIndex('email', 'idx_influenciadoras_email');
    await ensureUniqueIndex('contato', 'idx_influenciadoras_contato');
    await ensureUniqueIndex('cupom', 'idx_influenciadoras_cupom');
  };

  const config = getMysqlConfig();
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    charset: 'utf8mb4',
    decimalNumbers: true,
    dateStrings: true
  });

  const db = buildMysqlAdapter(pool, { pool, database: config.database });

  const ready = ensureMysqlSchema(db).catch((error) => {
    console.error('Erro ao inicializar schema MySQL:', error);
    throw error;
  });

  db.ready = ready;
  db.client = 'mysql';
  db.config = config;
  db.databasePath = null;

  module.exports = db;
} else {
  const Database = require('better-sqlite3');

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
}




