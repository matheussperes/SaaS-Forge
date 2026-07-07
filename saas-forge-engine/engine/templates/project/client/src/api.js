// Helper de API — as páginas geradas consomem api('/rota', { method, body }).
const BASE = '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `Erro ${response.status} em ${path}`);
  }
  return data;
}
