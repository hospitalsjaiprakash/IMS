const { query } = require('./config/database');
async function test() {
  try {
    const res = await query("SELECT * FROM role_credentials");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
test();
