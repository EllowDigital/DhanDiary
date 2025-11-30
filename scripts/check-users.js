try {
  require('dotenv').config({ quiet: true });
} catch (e) {
  try {
    require('dotenv').config();
  } catch (ee) {}
}
const { Pool } = require('@neondatabase/serverless');

const checkUsers = async () => {
  if (!process.env.NEON_URL) {
    console.error('Error: NEON_URL is not defined in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.NEON_URL });

  try {
    console.log('Fetching users from NeonDB...');
    const result = await pool.query(
      'SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 5'
    );
    console.table(result.rows);
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    await pool.end();
  }
};

checkUsers();
