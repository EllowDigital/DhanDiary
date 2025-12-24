// Migrations disabled when SQLite is removed. Keep API for compatibility.
export const runMigrations = async () => {
  // No-op
  return;
};

export default { runMigrations };
