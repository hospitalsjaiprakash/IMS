/**
 * JPHRC IMS - Database Setup Script (with superuser grant)
 * Run: node setup-db.js
 * 
 * Step 1: Grants schema privileges using postgres superuser
 * Step 2: Runs all migrations as ims_app_user
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const migrations = [
  '001_schema.sql',
  '002_designations.sql',
  '003_add_incident_category.sql',
  '004_security_and_employees.sql',
  '005_missing_features.sql',
  '006_password_auth.sql',
  '007_office_portal_mock.sql',
  '008_department_mappings.sql',
];

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

async function runStatements(pool, sql, label) {
  const statements = splitSqlStatements(sql);

  let ok = 0, warn = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      ok++;
    } catch (e) {
      const msg = e.message.toLowerCase();
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate key') ||
        msg.includes('multiple primary') ||
        msg.includes('no rows')
      ) {
        warn++;
      } else {
        console.warn(`    ⚠️  ${label}: ${e.message.split('\n')[0].substring(0, 100)}`);
        warn++;
      }
    }
  }
  console.log(`  ✅ ${label}: ${ok} statements ok, ${warn} skipped/warned`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   JPHRC IMS — Database Setup                 ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── Step 1: Grant privileges with superuser ───────────────────────────────
  console.log('Step 1: Grant schema privileges (requires postgres superuser)\n');

  const pgPass = await ask('Enter postgres superuser password (or press Enter to skip): ');
  rl.close();

  if (pgPass.trim()) {
    const superPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'jaiprakash_ims',
      user: 'postgres',
      password: pgPass.trim(),
    });

    try {
      await superPool.query(`GRANT ALL ON SCHEMA public TO ${process.env.DB_USER || 'ims_app_user'}`);
      await superPool.query(`ALTER USER ${process.env.DB_USER || 'ims_app_user'} CREATEDB`);
      console.log(`  ✅ Granted ALL on schema public to ${process.env.DB_USER}\n`);
    } catch (e) {
      console.warn(`  ⚠️  Grant failed: ${e.message} (continuing anyway...)\n`);
    } finally {
      await superPool.end();
    }
  } else {
    console.log('  Skipped — ensure ims_app_user has CREATE on public schema.\n');
  }

  // ── Step 2: Run migrations as app user ────────────────────────────────────
  console.log('Step 2: Running migrations as app user...\n');

  const appPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jaiprakash_ims',
    user: process.env.DB_USER || 'ims_app_user',
    password: process.env.DB_PASSWORD,
  });

  try {
    const conn = await appPool.query('SELECT current_user');
    console.log(`  Connected as: ${conn.rows[0].current_user}`);

    const perm = await appPool.query(
      "SELECT has_schema_privilege(current_user,'public','CREATE') as ok"
    );
    if (!perm.rows[0].ok) {
      console.error('\n❌ Still no CREATE privilege. Please run this SQL as postgres superuser:');
      console.error(`   GRANT ALL ON SCHEMA public TO ${process.env.DB_USER};\n`);
      process.exit(1);
    }

    console.log('  Privilege check: ✅\n');

    for (const m of migrations) {
      const filepath = path.join(__dirname, 'migrations', m);
      if (!fs.existsSync(filepath)) {
        console.log(`  ⚠️  Skipping ${m} (not found)`);
        continue;
      }
      const sql = fs.readFileSync(filepath, 'utf8');
      await runStatements(appPool, sql, m);
    }

    console.log('\n✅ Database setup complete! You can now start the server:\n   npm run dev\n');
  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  } finally {
    await appPool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
