const { pipedriveRequest } = require("../lib/pipedriveClient");

async function getStageMap() {
  try {
    const r = await pipedriveRequest("GET", "/stages", {});
    const stages = r.data || [];
    const stageMap = {};
    for (const s of stages) {
      stageMap[s.id] = {
        name: s.name,
        pipeline_name: s.pipeline_name || "(Sin nombre)",
      };
    }
    return stageMap;
  } catch (err) {
    console.error("Error obteniendo stages:", err.message);
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  const {
    action,
    dealId,
    stageId,
    activityData,
    noteText,
    limit,
    status,
    term,
    dealData,
    pipeline_id,
  } = req.body || {};
  let fields = req.body?.fields || ["id", "title"];

  try {
    switch (action) {
      case "listDeals": {
        const limitVal = limit || 50;
        const statusVal = status || "open";

        const query = { status: statusVal, limit: limitVal };
        if (pipeline_id) {
          query.pipeline_id = pipeline_id;
        }

        const r = await pipedriveRequest("GET", "/deals", { query });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const stageMap = await getStageMap();

        const slimDeals = (r.data || []).map((deal) => {
          const clean = {};
          for (const k of fields) clean[k] = deal[k] ?? null;
          if ("stage_id" in clean) {
            clean["stage_name"] = stageMap[clean.stage_id]?.name || "—";
            clean["pipeline_name"] = stageMap[clean.stage_id]?.pipeline_name || null;
          }
          return clean;
        });

        return res.status(200).json({ status: "success", data: slimDeals });
      }

      case "listPipelines": {
        const r = await pipedriveRequest("GET", "/pipelines", {});
        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const pipelines = (r.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          url_title: p.url_title,
          active: p.active,
          order_nr: p.order_nr,
        }));

        return res.status(200).json({ status: "success", data: pipelines });
      }

      case "searchDeals": {
        const termVal = term || "";
        if (!termVal) {
          return res.status(400).json({
            status: "error",
            message: "term es obligatorio para searchDeals",
          });
        }

        const r = await pipedriveRequest("GET", "/deals/search", {
          query: {
            term: termVal,
            limit: limit || 50,
            fields: "title",
          },
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const results = (r.data?.items || []).map((item) => ({
          id: item.item?.id,
          title: item.item?.title,
          value: item.item?.value,
          currency: item.item?.currency,
          status: item.item?.status,
        }));

        return res.status(200).json({ status: "success", data: results });
      }

      case "getDeal": {
        if (!dealId) {
          return res.status(400).json({ status: "error", message: "dealId es obligatorio para getDeal" });
        }

        const r = await pipedriveRequest("GET", `/deals/${dealId}`, {});

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "createDeal": {
        if (!dealData || typeof dealData !== "object") {
          return res
            .status(400)
            .json({ status: "error", message: "dealData (objeto) es obligatorio para createDeal" });
        }

        const r = await pipedriveRequest("POST", "/deals", { body: dealData });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "updateDeal": {
        if (!dealId) {
          return res.status(400).json({ status: "error", message: "dealId es obligatorio para updateDeal" });
        }
        if (!dealData || typeof dealData !== "object") {
          return res
            .status(400)
            .json({ status: "error", message: "dealData (objeto) es obligatorio para updateDeal" });
        }

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, { body: dealData });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "deleteDeal": {
        if (!dealId) {
          return res.status(400).json({ status: "error", message: "dealId es obligatorio para deleteDeal" });
        }

        const r = await pipedriveRequest("DELETE", `/deals/${dealId}`, {});

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "moveDeal": {
        if (!dealId || !stageId) {
          return res
            .status(400)
            .json({ status: "error", message: "dealId y stageId son obligatorios para moveDeal" });
        }

        const r = await pipedriveRequest("PUT", `/deals/${dealId}`, {
          body: { stage_id: stageId },
        });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "createActivity": {
        if (!activityData || typeof activityData !== "object") {
          return res
            .status(400)
            .json({ status: "error", message: "activityData (objeto) es obligatorio para createActivity" });
        }

        const r = await pipedriveRequest("POST", "/activities", { body: activityData });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "updateActivity": {
        if (!activityData || typeof activityData !== "object" || !activityData.id) {
          return res.status(400).json({
            status: "error",
            message: "activityData con id es obligatorio para updateActivity",
          });
        }

        const { id, ...patch } = activityData;

        const r = await pipedriveRequest("PUT", `/activities/${id}`, { body: patch });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "deleteActivity": {
        if (!activityData || typeof activityData !== "object" || !activityData.id) {
          return res.status(400).json({
            status: "error",
            message: "activityData con id es obligatorio para deleteActivity",
          });
        }

        const r = await pipedriveRequest("DELETE", `/activities/${activityData.id}`, {});

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "addNote": {
        if (!dealId || !noteText) {
          return res
            .status(400)
            .json({ status: "error", message: "dealId y noteText son obligatorios para addNote" });
        }

        const body = {
          content: noteText,
          deal_id: dealId,
        };

        const r = await pipedriveRequest("POST", "/notes", { body });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "listActivities": {
        const query = {};
        if (dealId) {
          query.deal_id = dealId;
        }
        if (status) {
          query.done = status;
        }

        const r = await pipedriveRequest("GET", "/activities", { query });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        return res.status(200).json({ status: "success", data: r.data });
      }

      case "analyzePipeline": {
        const query = { status: "all", limit: 9999 };

        const r = await pipedriveRequest("GET", "/deals", { query });

        if (r.status === "error") {
          return res.status(500).json({ status: "error", message: r.message });
        }

        const deals = Array.isArray(r.data) ? r.data : [];

        const counts = { open: 0, won: 0, lost: 0 };

        for (const deal of deals) {
          const st = deal.status;
          if (st === "open") counts.open += 1;
          else if (st === "won") counts.won += 1;
          else if (st === "lost") counts.lost += 1;
        }

        return res.status(200).json({
          status: "success",
          message: "OK",
          data: {
            total_abiertos: counts.open,
            total_ganados: counts.won,
            total_perdidos: counts.lost,
          },
        });
      }

      default:
        return res.status(400).json({ status: "error", message: `Accion desconocida: ${action}` });
    }
  } catch (err) {
    return res
      .status(500)
      .json({ status: "error", message: err.message || "Error interno pipedrive.js" });
  }
};
