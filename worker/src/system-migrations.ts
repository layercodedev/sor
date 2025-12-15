// System migrations for the registry database
// These migrations are applied automatically to the _sor_registry Durable Object

export const SYSTEM_MIGRATIONS = [
  {
    name: "001_create_dbs_table",
    sql: `
      CREATE TABLE IF NOT EXISTS dbs (
        name TEXT PRIMARY KEY,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
];
