import express from 'express';
import { asyncRoute } from '../../lib/crm/errors.js';
import { requirePermission } from '../../lib/crm/permissions.js';
import {
  changeProjectStatus,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from '../../services/crm/projects.service.js';

export const projectsRouter = express.Router();

projectsRouter.get(
  '/',
  requirePermission('PROJECTS_READ'),
  asyncRoute(async (req, res) => {
    const result = await listProjects(req.actor, req.query);
    return res.json({ success: true, ...result });
  })
);

projectsRouter.post(
  '/',
  requirePermission('PROJECTS_WRITE'),
  asyncRoute(async (req, res) => {
    const project = await createProject(req.actor, req.body, req);
    return res.status(201).json({ success: true, data: project });
  })
);

projectsRouter.get(
  '/:id',
  requirePermission('PROJECTS_READ'),
  asyncRoute(async (req, res) => {
    const project = await getProject(req.actor, req.params.id);
    return res.json({ success: true, data: project });
  })
);

projectsRouter.patch(
  '/:id',
  requirePermission('PROJECTS_WRITE'),
  asyncRoute(async (req, res) => {
    const project = await updateProject(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: project });
  })
);

projectsRouter.post(
  '/:id/status',
  requirePermission('PROJECTS_WRITE'),
  asyncRoute(async (req, res) => {
    const project = await changeProjectStatus(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: project });
  })
);
