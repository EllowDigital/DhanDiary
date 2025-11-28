import { Pool } from '@neondatabase/serverless';
import Constants from 'expo-constants';

// Read NEON_URL from Expo config (app.config.js) -> Constants.expoConfig?.extra
const NEON_URL = (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

const pool = NEON_URL ? new Pool({ connectionString: NEON_URL }) : null;

export const query = async (text: string, params: any[] = []) => {
  if (!pool) {
    throw new Error('Neon requires internet + NEON_URL');
  }

  try {
    const result = await pool.query(text, params);
    return result.rows;
  } catch (error) {
    // Avoid noisy logs for expected unique-constraint collisions (handled by callers)
    try {
      const e: any = error;
      const msg = String(e && e.message ? e.message : '');
      const code = e && e.code ? String(e.code) : '';
      if (
        code === '23505' ||
        msg.toLowerCase().includes('duplicate key') ||
        msg.includes('idx_cash_entries_client_id')
      ) {
        // log at debug level to avoid flooding runtime logs
        console.warn('Neon Query duplicate key (suppressed):', msg);
      } else {
        console.error('Neon Query Error:', error);
      }
    } catch (e) {
      console.error('Neon Query Error (logging failed):', error);
    }
    throw error;
  }
};
