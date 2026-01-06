// Studio page rendering for SOR database viewer

export function renderStudioLandingPage(apiKey: string, studioUrl: string): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SOR Studio - Databases</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 2rem;
      background: #f5f5f5;
    }
    h1 { margin: 0 0 1.5rem 0; color: #333; }
    .db-list { display: grid; gap: 1rem; max-width: 800px; }
    .db-card {
      background: white;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      cursor: pointer;
      transition: box-shadow 0.2s;
      text-decoration: none;
      color: inherit;
    }
    .db-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .db-name { font-weight: 600; font-size: 1.1rem; margin: 0 0 0.25rem 0; }
    .db-desc { color: #666; font-size: 0.9rem; margin: 0; }
    .db-date { color: #999; font-size: 0.8rem; margin-top: 0.5rem; }
    .loading { color: #666; }
    .error { color: #c00; }
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>SOR Databases</h1>
  <div id="db-list" class="db-list">
    <div class="loading">Loading databases...</div>
  </div>
  <script>
    const API_KEY = ${JSON.stringify(apiKey)};

    async function loadDatabases() {
      const container = document.getElementById('db-list');
      try {
        const response = await fetch('/dbs', {
          headers: { 'X-API-Key': API_KEY }
        });
        const data = await response.json();

        if (data.error) {
          container.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
          return;
        }

        if (!data.dbs || data.dbs.length === 0) {
          container.innerHTML = '<div class="empty">No databases found. Create one using the CLI.</div>';
          return;
        }

        container.innerHTML = data.dbs.map(db => \`
          <a href="/studio?db=\${encodeURIComponent(db.name)}" class="db-card">
            <p class="db-name">\${db.name}</p>
            \${db.description ? '<p class="db-desc">' + db.description + '</p>' : ''}
            <p class="db-date">Created: \${new Date(db.created_at).toLocaleDateString()}</p>
          </a>
        \`).join('');
      } catch (err) {
        container.innerHTML = '<div class="error">Failed to load databases: ' + err.message + '</div>';
      }
    }

    loadDatabases();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function renderStudioDatabasePage(
  dbName: string,
  apiKey: string,
  studioUrl: string
): Response {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SOR Studio - ${dbName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    .container { display: flex; flex-direction: column; height: 100%; }
    nav {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: #1a1a2e;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 0.875rem;
    }
    nav a {
      color: #88f;
      text-decoration: none;
    }
    nav a:hover { text-decoration: underline; }
    .db-name { font-weight: 600; }
    iframe {
      flex: 1;
      width: 100%;
      border: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="/studio">&larr; All Databases</a>
      <span class="db-name">${dbName}</span>
    </nav>
    <iframe id="editor" allow="clipboard-read; clipboard-write"
            src="${studioUrl}/embed/sqlite?name=${encodeURIComponent(dbName)}"></iframe>
  </div>
  <script>
    const DB_NAME = ${JSON.stringify(dbName)};
    const API_KEY = ${JSON.stringify(apiKey)};

    function transformResponse(sor, startTime) {
      const headers = (sor.columns || []).map(colName => ({
        name: colName,
        displayName: colName,
        type: 1, // TEXT - SQLite doesn't provide type info in cursor result
        originalType: null
      }));

      return {
        rows: sor.rows || [],
        headers,
        stat: {
          rowsAffected: sor.rowsWritten || 0,
          rowsRead: sor.rowsRead || null,
          rowsWritten: sor.rowsWritten || null,
          queryDurationMs: Date.now() - startTime
        }
      };
    }

    async function executeQuery(statement) {
      const startTime = Date.now();
      const response = await fetch('/db/' + encodeURIComponent(DB_NAME) + '/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ sql: statement })
      });
      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      return transformResponse(result, startTime);
    }

    async function executeTransaction(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await executeQuery(stmt));
      }
      return results;
    }

    window.addEventListener('message', async (e) => {
      const iframe = document.getElementById('editor');
      if (e.source !== iframe.contentWindow) return;

      if (e.data.type === 'query' && e.data.statement) {
        try {
          const data = await executeQuery(e.data.statement);
          iframe.contentWindow.postMessage({
            type: 'query',
            id: e.data.id,
            data
          }, '*');
        } catch (err) {
          iframe.contentWindow.postMessage({
            type: 'query',
            id: e.data.id,
            error: err.message
          }, '*');
        }
      } else if (e.data.type === 'transaction' && e.data.statements) {
        try {
          const data = await executeTransaction(e.data.statements);
          iframe.contentWindow.postMessage({
            type: 'transaction',
            id: e.data.id,
            data
          }, '*');
        } catch (err) {
          iframe.contentWindow.postMessage({
            type: 'transaction',
            id: e.data.id,
            error: err.message
          }, '*');
        }
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
