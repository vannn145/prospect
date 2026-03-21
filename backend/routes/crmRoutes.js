const express = require('express');

const {
  getCrmOverview,
  listCrmPipeline,
  listCrmTasks,
  createCrmTask,
  updateCrmTask,
  listCrmCompanyTimeline,
  createCrmActivity,
  suggestCrmNextActions,
  recalculateCrmScores,
} = require('../services/crmService');

const router = express.Router();

router.get('/overview', async (req, res, next) => {
  try {
    const overview = await getCrmOverview();
    return res.json(overview);
  } catch (error) {
    return next(error);
  }
});

router.get('/pipeline', async (req, res, next) => {
  try {
    const { stage = '', search = '', limit = 300 } = req.query;

    const items = await listCrmPipeline({
      stage,
      search,
      limit: Number(limit || 300),
    });

    return res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/tasks', async (req, res, next) => {
  try {
    const {
      status = '',
      stage = '',
      search = '',
      limit = 200,
    } = req.query;

    const tasks = await listCrmTasks({
      status,
      stage,
      search,
      limit: Number(limit || 200),
    });

    return res.json({
      tasks,
      total: tasks.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const task = await createCrmTask(req.body || {}, {
      actorUsername: req.user?.username || null,
    });

    return res.status(201).json({
      message: 'Tarefa CRM criada com sucesso.',
      task,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/tasks/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const task = await updateCrmTask(id, req.body || {}, {
      actorUsername: req.user?.username || null,
    });

    if (!task) {
      return res.status(404).json({
        error: 'Tarefa CRM não encontrada.',
      });
    }

    return res.json({
      message: 'Tarefa CRM atualizada com sucesso.',
      task,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:id/timeline', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 120 } = req.query;

    const timeline = await listCrmCompanyTimeline({
      companyId: id,
      limit: Number(limit || 120),
    });

    return res.json({
      companyId: Number(id),
      timeline,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/companies/:id/activities', async (req, res, next) => {
  try {
    const { id } = req.params;

    const activity = await createCrmActivity(id, req.body || {}, {
      actorUsername: req.user?.username || null,
    });

    return res.status(201).json({
      message: 'Atividade registrada com sucesso.',
      activity,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/companies/:id/next-actions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 4 } = req.query;

    const result = await suggestCrmNextActions({
      companyId: id,
      limit: Number(limit || 4),
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/scores/recalculate', async (req, res, next) => {
  try {
    const { companyId, limit } = req.body || {};

    const result = await recalculateCrmScores({
      companyId,
      limit,
    });

    return res.json({
      message: 'Recalculo de score CRM concluído.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
