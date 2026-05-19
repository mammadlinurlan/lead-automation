const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

async function jsonrpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: { service, method, args },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message);
  return data.result;
}

async function authenticate() {
  const uid = await jsonrpc('common', 'authenticate', [
    ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {},
  ]);
  if (!uid) throw new Error('Odoo autentifikasiyası uğursuz oldu');
  return uid;
}

async function findOrCreatePartner(uid, name, phone) {
  const existing = await jsonrpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    'res.partner', 'search_read',
    [[['phone', '=', phone]]],
    { fields: ['id'], limit: 1 },
  ]);

  if (existing.length > 0) return existing[0].id;

  return jsonrpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    'res.partner', 'create',
    [{ name, phone }],
  ]);
}

export async function createLead(lead, odooUserId = null) {
  const uid = await authenticate();

  const partnerId = await findOrCreatePartner(uid, lead.name, lead.phone);

  const values = {
    name: lead.interest,
    partner_id: partnerId,
    type: 'lead',
    description: lead.source ? `Mənbə: ${lead.source}` : '',
    ...(odooUserId && { user_id: odooUserId }),
  };

  const leadId = await jsonrpc('object', 'execute_kw', [
    ODOO_DB, uid, ODOO_API_KEY,
    'crm.lead', 'create',
    [values],
  ]);

  return leadId;
}
