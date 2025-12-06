// api/crm-backend.js

import { dispatchAction } from './pipedrive';

function nowISO() {
  return new Date().toISOString();
}

function buildOk(intent, datos, red_flags = [], alertas = [], extraMeta = {}) {
  return {
    ok: true,
    intent,
    datos,
    red_flags,
    alertas,
    metadata: {
      fuente: 'pipedrive',
      generado_en: nowISO(),
      ...extraMeta
    }
  };
}

function buildError(intent, error) {
  return {
    ok: false,
    intent: intent || null,
    codigo: 'ERROR_BACKEND_CRM',
    mensaje_usuario: 'Ocurrió un error en el backend CRM. Intenta de nuevo o contacta soporte.',
    detalle_tecnico: error?.message || String(error),
    metadata: {
      fuente: 'pipedrive',
      generado_en: nowISO()
    }
  };
}

async function fetchAllDeals(params = {}) {
  const status = params.status || 'all_not_deleted';
  const pageSize = params.pageSize || 500;

  let start = 0;
  let items = [];
  let more = true;

  while (more) {
    const page = await dispatchAction('listDeals', {
      status,
      limit: pageSize,
      start
    });

    const pageItems = page.items || [];
    items = items.concat(pageItems);

    const pagination = page.pagination || {};
    if (pagination.more_items_in_collection) {
      start = pagination.next_start ?? (start + pageSize);
    } else {
      more = false;
    }
  }

  return items;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json(buildError(null, new Error('Método no permitido. Usa POST.')));
  }

  const body = req.body || {};
  const intent = body.intent;
  const contexto_usuario = body.contexto_usuario || {};
  const parametros = body.parametros || {};

  if (!intent) {
    return res
      .status(400)
      .json(buildError(null, new Error('Falta "intent" en el body')));
  }

  try {
    switch (intent) {
      case 'conteo_simple': {
        const pipeline = await dispatchAction('analyzePipeline');
        const datos = {
          totals: pipeline.totals,
          meta: pipeline.meta
        };
        return res.status(200).json(buildOk(intent, datos));
      }

      case 'lista_datos': {
        const status = parametros.status || 'open';
        const limit = parametros.limit || 50;
        const start = parametros.start || 0;

        const page = await dispatchAction('listDeals', {
          status,
          limit,
          start
        });

        const datos = {
          deals: page.items,
          pagination: page.pagination
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      case 'analisis':
      case 'auditoria_crm_pwc': {
        const deals = await fetchAllDeals({
          status: parametros.status || 'all_not_deleted'
        });

        const datos = {
          deals,
          contexto_usuario
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      case 'riesgo': {
        const deals = await fetchAllDeals({
          status: parametros.status || 'open'
        });

        const datos = {
          deals,
          contexto_usuario
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      case 'productividad': {
        const limit = parametros.limit || 100;
        const start = parametros.start || 0;
        const user_id = parametros.user_id || undefined;

        const activities = await dispatchAction('listActivities', {
          user_id,
          limit,
          start
        });

        const datos = {
          activities: activities.items,
          pagination: activities.pagination,
          contexto_usuario
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      case 'dashboard': {
        const pipeline = await dispatchAction('analyzePipeline');
        const datos = {
          totals: pipeline.totals,
          meta: pipeline.meta
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      case 'modificacion': {
        const tipo = parametros.tipo;
        if (!tipo) {
          throw new Error('Falta "tipo" en parametros para modificacion');
        }

        let action;
        switch (tipo) {
          case 'create_deal':
            action = 'createDeal';
            break;
          case 'update_deal':
            action = 'updateDeal';
            break;
          case 'move_deal':
            action = 'moveDeal';
            break;
          case 'add_note':
            action = 'addNote';
            break;
          default:
            throw new Error(`Tipo de modificacion no soportado: ${tipo}`);
        }

        const data = await dispatchAction(action, {
          ...parametros,
          confirmado: parametros.confirmado === true
        });

        const datos = {
          resultado: data
        };

        return res.status(200).json(buildOk(intent, datos));
      }

      default:
        throw new Error(`Intent no soportado en backend CRM: ${intent}`);
    }
  } catch (error) {
    console.error('Error en api/crm-backend:', error);
    const statusCode = 500;
    return res.status(statusCode).json(buildError(intent, error));
  }
}
