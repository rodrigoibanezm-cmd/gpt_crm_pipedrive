// api/pipedrive.js

const BASE_URL = process.env.PIPEDRIVE_BASE_URL || 'https://api.pipedrive.com/v1';
const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;

async function pipedriveRequest(path, options = {}) {
  if (!API_TOKEN) {
    throw new Error('PIPEDRIVE_API_TOKEN no está configurado');
  }

  const url = new URL(path, BASE_URL);
  url.searchParams.set('api_token', API_TOKEN);

  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOptions);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    const msg = data.error || data.message || `Error Pipedrive ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// --- Acciones de dominio mínimo ---

async function listDeals(params = {}) {
  const {
    status = 'open',
    limit = 50,
    start = 0,
    filter_id
  } = params;

  const url = new URL('/deals', BASE_URL);
  url.searchParams.set('status', status);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('start', String(start));
  if (filter_id) url.searchParams.set('filter_id', String(filter_id));
  url.searchParams.set('api_token', API_TOKEN);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    const msg = data.error || data.message || `Error Pipedrive ${res.status}`;
    throw new Error(msg);
  }

  return {
    items: data.data || [],
    pagination: data.additional_data?.pagination || null
  };
}

async function getDeal(params = {}) {
  const { id } = params;
  if (!id) throw new Error('id es obligatorio para getDeal');

  const data = await pipedriveRequest(`/deals/${id}`);
  return data.data || null;
}

async function createDeal(params = {}) {
  const body = params || {};
  const data = await pipedriveRequest('/deals', {
    method: 'POST',
    body
  });
  return data.data || null;
}

async function updateDeal(params = {}) {
  const { id, ...fields } = params;
  if (!id) throw new Error('id es obligatorio para updateDeal');

  const data = await pipedriveRequest(`/deals/${id}`, {
    method: 'PUT',
    body: fields
  });
  return data.data || null;
}

async function moveDeal(params = {}) {
  const { id, stage_id, ...fields } = params;
  if (!id || !stage_id) {
    throw new Error('id y stage_id son obligatorios para moveDeal');
  }

  const data = await pipedriveRequest(`/deals/${id}`, {
    method: 'PUT',
    body: { stage_id, ...fields }
  });
  return data.data || null;
}

async function addNote(params = {}) {
  const { deal_id, content, ...rest } = params;
  if (!deal_id || !content) {
    throw new Error('deal_id y content son obligatorios para addNote');
  }

  const body = { deal_id, content, ...rest };
  const data = await pipedriveRequest('/notes', {
    method: 'POST',
    body
  });
  return data.data || null;
}

async function listActivities(params = {}) {
  const {
    deal_id,
    user_id,
    limit = 100,
    start = 0
  } = params;

  const url = new URL('/activities', BASE_URL);
  if (deal_id) url.searchParams.set('deal_id', String(deal_id));
  if (user_id) url.searchParams.set('user_id', String(user_id));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('start', String(start));
  url.searchParams.set('api_token', API_TOKEN);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    const msg = data.error || data.message || `Error Pipedrive ${res.status}`;
    throw new Error(msg);
  }

  return {
    items: data.data || [],
    pagination: data.additional_data?.pagination || null
  };
}

// Conteos deterministas usando total_items por status
async function analyzePipeline() {
  const statuses = ['open', 'won', 'lost'];
  const totals = {
    open: 0,
    won: 0,
    lost: 0,
    all: 0
  };

  for (const status of statuses) {
    const url = new URL('/deals', BASE_URL);
    url.searchParams.set('status', status);
    url.searchParams.set('limit', '1');
    url.searchParams.set('start', '0');
    url.searchParams.set('api_token', API_TOKEN);

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      const msg = data.error || data.message || `Error Pipedrive ${res.status}`;
      throw new Error(msg);
    }

    const totalItems = data.additional_data?.pagination?.total_items ?? 0;
    totals[status] = totalItems;
  }

  totals.all = totals.open + totals.won + totals.lost;

  return {
    totals,
    meta: {
      source: 'pipedrive.deals (pagination.total_items)',
      deterministic: true
    }
  };
}

// --- Router principal ---

async function dispatchAction(action, params) {
  switch (action) {
    case 'listDeals':
      return await listDeals(params);
    case 'getDeal':
      return await getDeal(params);
    case 'createDeal':
      return await createDeal(params);
    case 'updateDeal':
      return await updateDeal(params);
    case 'moveDeal':
      return await moveDeal(params);
    case 'addNote':
      return await addNote(params);
    case 'listActivities':
      return await listActivities(params);
    case 'analyzePipeline':
      return await analyzePipeline();
    default:
      throw new Error(`Acción no soportada: ${action}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ status: 'error', message: 'Método no permitido. Usa POST.' });
  }

  try {
    const { action, params } = req.body || {};

    if (!action) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta parámetro "action" en el body'
      });
    }

    const data = await dispatchAction(action, params || {});

    return res.status(200).json({
      status: 'success',
      action,
      data
    });
  } catch (error) {
    console.error('Error en api/pipedrive:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error interno en api/pipedrive'
    });
  }
}
