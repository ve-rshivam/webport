import express from 'express';
import { asyncRoute } from '../../lib/crm/errors.js';
import { requirePermission } from '../../lib/crm/permissions.js';
import {
  archiveCustomer,
  changeStage,
  createCustomer,
  getCustomer360,
  listCustomers,
  updateCustomer,
} from '../../services/crm/customers.service.js';
import { createActivity, listActivity } from '../../services/crm/activity.service.js';

export const customersRouter = express.Router();

customersRouter.get(
  '/',
  requirePermission('CUSTOMERS_READ'),
  asyncRoute(async (req, res) => {
    const result = await listCustomers(req.actor, req.query);
    return res.json({ success: true, ...result });
  })
);

customersRouter.post(
  '/',
  requirePermission('CUSTOMERS_WRITE'),
  asyncRoute(async (req, res) => {
    const customer = await createCustomer(req.actor, req.body, req);
    return res.status(201).json({ success: true, data: customer });
  })
);

customersRouter.get(
  '/:id',
  requirePermission('CUSTOMERS_READ'),
  asyncRoute(async (req, res) => {
    const customer = await getCustomer360(req.actor, req.params.id);
    return res.json({ success: true, data: customer });
  })
);

customersRouter.patch(
  '/:id',
  requirePermission('CUSTOMERS_WRITE'),
  asyncRoute(async (req, res) => {
    const customer = await updateCustomer(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: customer });
  })
);

customersRouter.post(
  '/:id/stage',
  requirePermission('PIPELINE_WRITE'),
  asyncRoute(async (req, res) => {
    const customer = await changeStage(req.actor, req.params.id, req.body, req);
    return res.json({ success: true, data: customer });
  })
);

customersRouter.delete(
  '/:id',
  requirePermission('CUSTOMERS_WRITE'),
  asyncRoute(async (req, res) => {
    const customer = await archiveCustomer(req.actor, req.params.id, req);
    return res.json({ success: true, data: customer });
  })
);

customersRouter.get(
  '/:id/activity',
  requirePermission('ACTIVITY_READ'),
  asyncRoute(async (req, res) => {
    const result = await listActivity(req.actor, { ...req.query, customerId: req.params.id });
    return res.json({ success: true, ...result });
  })
);

customersRouter.post(
  '/:id/activity',
  requirePermission('ACTIVITY_WRITE'),
  asyncRoute(async (req, res) => {
    const activity = await createActivity(req.actor, req.params.id, req.body, req);
    return res.status(201).json({ success: true, data: activity });
  })
);
