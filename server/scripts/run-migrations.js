/**
 * JPHRC IMS - Automated Non-Interactive Database Migration Runner
 * 
 * Tracks applied migrations in the `schema_migrations` table.
 * Scans `server/migrations/*.sql` and executes unapplied migrations in alphanumeric order.
 * 
 * Usage:
 *   node scripts/run-migrations.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const poolConfig = {
  max: 5,
  connectionTimeoutMillis: 10000,
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
} else {
  poolConfig.host = process.env.DB_HOST || 'localhost';
  poolConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
  poolConfig.database = process.env.DB_NAME || 'jaiprakash_ims';
  poolConfig.user = process.env.DB_USER || 'ims_app_user';
  poolConfig.password = process.env.DB_PASSWORD;

  if (process.env.DB_HOST && process.env.DB_HOST.includes('supabase.co')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

async function initMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query('SELECT filename FROM schema_migrations ORDER BY id ASC');
  return new Set(res.rows.map(r => r.filename));
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  const cleanedLines = [];
  for (let line of lines) {
    if (line.trim().startsWith('--')) continue;
    cleanedLines.push(line);
  }
  const cleanedSql = cleanedLines.join('\n');

  for (let i = 0; i < cleanedSql.length; i++) {
    const char = cleanedSql[i];
    const nextChar = cleanedSql[i + 1] || '';

    if (!inSingleQuote && !inDollarQuote && char === '-' && nextChar === '-') {
      while (i < cleanedSql.length && cleanedSql[i] !== '\n') i++;
      current += '\n';
      continue;
    }

    if (!inDollarQuote && char === "'" && (i === 0 || cleanedSql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && char === '$') {
      const match = cleanedSql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (match) {
        const tag = match[1];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
        }
        current += tag;
        i += tag.length - 1;
        continue;
      }
    }

    if (!inSingleQuote && !inDollarQuote && char === ';') {
      const stmt = current.trim();
      if (stmt.length > 3) statements.push(stmt);
      current = '';
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing.length > 3) statements.push(trailing);
  return statements;
}

async function runMigrationFile(client, filename, filepath) {
  const sql = fs.readFileSync(filepath, 'utf8');
  const statements = splitSqlStatements(sql);

  console.log(`  ▶ Running ${filename} (${statements.length} statements)...`);

  await client.query('BEGIN');
  try {
    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        const msg = err.message.toLowerCase();
        // Skip idempotent issues like "already exists" for existing legacy databases
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('multiple primary')
        ) {
          // Warning only
          continue;
        }
        throw err;
      }
    }

    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [filename]
    );

    await client.query('COMMIT');
    console.log(`  ✅ Successfully applied ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ❌ Failed running ${filename}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('       JPHRC IMS Database Migration Runner');
  console.log('======================================================\n');

  const migrationsDir = path.resolve(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found at: ${migrationsDir}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await initMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    const allFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const pending = allFiles.filter(f => !applied.has(f));

    console.log(`Total migrations found: ${allFiles.length}`);
    console.log(`Already applied:        ${applied.size}`);
    console.log(`Pending migrations:     ${pending.length}\n`);

    if (pending.length === 0) {
      console.log('✅ Database schema is completely up-to-date. No migrations to apply.\n');
      return;
    }

    for (const file of pending) {
      const fullPath = path.join(migrationsDir, file);
      await runMigrationFile(client, file, fullPath);
    }

    console.log('\n✅ All migrations applied successfully!\n');
  } catch (err) {
    console.error('\n❌ Migration process aborted due to an error:\n', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error in migration runner:', err);
  process.exit(1);
});
