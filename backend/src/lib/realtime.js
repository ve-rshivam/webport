function getIo(req) {
  return req?.app?.get('io') ?? null;
}

function plainProject(project) {
  if (!project) return null;
  const record = typeof project.toObject === 'function' ? project.toObject() : { ...project };
  delete record.hashedAccessKey;
  delete record.resetOtp;
  delete record.otpExpiry;
  delete record.otpAttempts;
  delete record.lastPasswordReset;
  delete record.__v;
  return record;
}

export function emitProjectMutation(req, action, project, { source = 'portal', user } = {}) {
  const io = getIo(req);
  const record = plainProject(project);
  if (!io || !record) return;

  const owner = user ?? (record.clientUserId
    ? { id: record.clientUserId, email: record.clientEmail, name: record.clientName }
    : null);
  const event = {
    action,
    source,
    project: record,
    ...(owner ? { user: { id: owner.id, email: owner.email, name: owner.name ?? record.clientName ?? null } } : {}),
  };

  io.to('admins:projects').to('admins:payments').emit('project:mutated', event);
  const clientUserId = record.clientUserId ?? user?.id;
  if (clientUserId) io.to(`user:${clientUserId}`).emit('project:mutated', event);
}

export function emitPaymentReceived(req, paymentData) {
  getIo(req)?.to('admins:payments').emit('payment:received', paymentData);
}

export function emitMessageNew(req, messageData, { clientUserId } = {}) {
  const io = getIo(req);
  if (!io) return;
  io.to('admins:messages').to('admins:projects').emit('message:new', messageData);
  if (clientUserId) io.to(`user:${clientUserId}`).emit('message:new', messageData);
}
