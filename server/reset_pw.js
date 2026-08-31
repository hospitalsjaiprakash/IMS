const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.rjoivyaihzcmlmmzzapf:Jaiprakash@07@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
  });
  try {
    await client.connect();
    const hash = await bcrypt.hash('Admin@123', 10);
    await client.query('UPDATE role_credentials SET password_hash = $1;', [hash]);
    console.log('Passwords updated to Admin@123');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
