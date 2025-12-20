require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');

const connectionString = process.env.NEON_URL;

if (!connectionString) {
    console.error('Error: NEON_URL is not set in environment (or .env file)');
    process.exit(1);
}

// Mask the password for display
const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
console.log(`Testing connection to: ${masked}`);

const pool = new Pool({ connectionString });

(async () => {
    try {
        const start = Date.now();
        const res = await pool.query('SELECT 1 as result');
        const duration = Date.now() - start;
        console.log(`Connection successful! Result: ${JSON.stringify(res.rows[0])}`);
        console.log(`Latency: ${duration}ms`);
        process.exit(0);
    } catch (err) {
        console.error('Connection failed:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
})();
