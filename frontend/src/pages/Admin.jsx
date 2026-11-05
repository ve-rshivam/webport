import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PageShell, buttonClass } from '../components/Editorial';
import { writeCachedRoles } from '../lib/roleCache';

import { apiRequest, apiUrl } from '../lib/api';
import { adminSession } from '../lib/authSession';
import LivePreviewTab from '../components/LivePreviewTab';

const PROJECT_TYPES = [
  'SaaS Web Platform',
  'Full-Stack Web Application (React + Node)',
  'AI Agent & Automation Pipeline',
  'E-Commerce & Custom Checkout Portal',
  'REST API & Database Architecture',
  'Custom Tailored Solution',
];

const PROJECT_FEATURES = [
  'User Auth & RBAC',
  'Dual-Database Setup',
  'Razorpay / PayPal Gateway',
  'Automated Email Fallback Engine',
  'Real-Time WebSockets',
  'Cloudflare R2 Asset Storage',
  'AI LLM Assistant',
  'SEO & Performance Optimization',
  'Docker & CI/CD Deployment',
];

const EMPTY_PROJECT_DRAFT = {
  clientName: '',
  clientEmail: '',
  projectTitle: '',
  previewUrl: '',
  projectType: '',
  estimatedDays: '',
  totalCost: '',
  amountPaid: '',
  progress: 10,
  status: 'Started',
  paymentStatus: 'Pending',
  deliveryDate: '',
  notes: '',
  featuresText: '',
};

function upsertPortalUserProject(users, project, user = {}) {
  if (!project?.id) return users;
  const userId = project.clientUserId || user.id;
  const email = project.clientEmail || user.email;
  const index = users.findIndex((entry) =>
    (userId && entry.id === userId) || (email && entry.email?.toLowerCase() === email.toLowerCase())
  );
  if (index < 0) {
    return [{
      id: userId || `realtime:${email || project.id}`,
      email: email || '',
      name: project.clientName || user.name || '',
      role: 'client',
      projects: [project],
    }, ...users];
  }
  return users.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const projects = entry.projects || [];
    const projectIndex = projects.findIndex((item) => item.id === project.id);
    const nextProjects = projectIndex < 0
      ? [project, ...projects]
      : projects.map((item, itemIndex) => itemIndex === projectIndex ? { ...item, ...project } : item);
    return {
      ...entry,
      ...(user.name || project.clientName ? { name: user.name || project.clientName } : {}),
      ...(user.email || project.clientEmail ? { email: user.email || project.clientEmail } : {}),
      projects: nextProjects,
    };
  });
}

function projectDraftFromRecord(project = {}) {
  return {
    ...EMPTY_PROJECT_DRAFT,
    clientName: project.clientName || '',
    clientEmail: project.clientEmail || '',
    projectTitle: project.projectTitle || project.serviceName || '',
    previewUrl: project.previewUrl || '',
    projectType: project.projectType || '',
    estimatedDays: project.estimatedDays ?? '',
    totalCost: project.totalCost ?? '',
    amountPaid: project.amountPaid ?? '',
    progress: project.progress ?? 10,
    status: project.status || 'Started',
    paymentStatus: project.paymentStatus || 'Pending',
    deliveryDate: project.deliveryDate || '',
    notes: project.notes || '',
    featuresText: Array.isArray(project.features) ? project.features.join('\n') : '',
  };
}

function targetCompletionDate(days) {
  const count = Number(days);
  if (!Number.isInteger(count) || count < 1) return 'Enter a valid number of days';
  const target = new Date(Date.now() + count * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(target);
}

function paymentStatusForAmounts(totalCost, amountPaid) {
  if (totalCost > 0 && amountPaid >= totalCost) return 'FULLY_PAID';
  if (amountPaid > 0) return 'PARTIALLY_PAID';
  return 'PENDING';
}

function paymentStatusLabel(status) {
  return ({
    FULLY_PAID: 'Fully paid',
    PARTIALLY_PAID: 'Partially paid',
    PENDING: 'Pending',
  })[status] || status || 'Pending';
}

function formatProjectCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const Admin = () => {

  const activeSession = adminSession.get();

  const [authStep, setAuthStep] = useState(activeSession ? 2 : 0);
  const [loginData, setLoginData] = useState({ identifier: '', password: '' });
  // [C1] Password step ke baad sirf scoped challenge token milta hai, full JWT nahi.
  const [loginChallenge, setLoginChallenge] = useState('');
  const [backupPin, setBackupPin] = useState('');
  const [loginError, setLoginError] = useState(() =>
    new URLSearchParams(window.location.search).has('sessionExpired')
      ? 'Session expired due to inactivity.'
      : ''
  );



  const [adminRole, setAdminRole] = useState(activeSession?.role || "team");
  const [adminPerms, setAdminPerms] = useState(activeSession?.permissions || []);
  const [adminName, setAdminName] = useState(activeSession?.name || "");


  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newResetPin, setNewResetPin] = useState('');
  const [resetPinEnabled, setResetPinEnabled] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);



  const [activeTab, setActiveTab] = useState('dashboard');


  const [inboxData, setInboxData] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [services, setServices] = useState([]);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
  const [editingProject, setEditingProject] = useState(null);
  const formRef = useRef(null);
  const [education, setEducation] = useState([]);


  const [qrSubmissions, setQrSubmissions] = useState([]);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState('');
  const [selectedQrForApproval, setSelectedQrForApproval] = useState(null);
  const [projectApprovalLoading, setProjectApprovalLoading] = useState(false);
  const [projectApprovalForm, setProjectApprovalForm] = useState({
    projectType: PROJECT_TYPES[0],
    estimatedDays: '14',
    features: [],
    customFeature: '',
    totalCost: '',
    amountPaid: '',
    transactionRef: '',
  });

  useEffect(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return undefined;
    const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!dialog.contains(document.activeElement)) focusable[0]?.focus();
    const onDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedQrForApproval && !projectApprovalLoading) setSelectedQrForApproval(null);
      } else if (event.key === 'Tab' && focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', onDialogKeyDown);
    return () => dialog.removeEventListener('keydown', onDialogKeyDown);
  }, [selectedQrForApproval, projectApprovalLoading]);
  const [manualDispatches, setManualDispatches] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);
  const [portalUserQuery, setPortalUserQuery] = useState('');
  const [portalUsersLoading, setPortalUsersLoading] = useState(false);
  const [portalStatus, setPortalStatus] = useState('');
  const [activeThread, setActiveThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadReply, setThreadReply] = useState('');
  const [threadSending, setThreadSending] = useState(false);


  const [githubProjects, setGithubProjects] = useState([]);
  const [pinnedProjects, setPinnedProjects] = useState([]);


  const [newEdu, setNewEdu] = useState({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
  const [newExp, setNewExp] = useState({ duration: '', role: '', company: '', description: '' });
  const [newService, setNewService] = useState({ title: '', description: '', icon: '', price: '', priceUsd: '' });
  const [newSkill, setNewSkill] = useState({ name: '', description: '', icon: '', proficiency: 50, category: 'Tech' });


  const [teamList, setTeamList] = useState([]);
  const [newTeamMember, setNewTeamMember] = useState({ name: '', identifier: '', permissions: [] });

  const [newProject, setNewProject] = useState({ ...EMPTY_PROJECT_DRAFT });


  const [cmsStatus, setCmsStatus] = useState('');
  const [homeData, setHomeData] = useState({ heroTitle: '', heroSubtitle: '', roles: [] });
  const [aboutData, setAboutData] = useState({ description: '' });
  const [contactData, setContactData] = useState([]);
  const [policyData, setPolicyData] = useState({ privacy: '', terms: '', refund: '' });


  const [securityData, setSecurityData] = useState({ oldPassword: '', newPassword: '', newPin: '' });
  const [securityMsg, setSecurityMsg] = useState('');
  const [logoutAllMsg, setLogoutAllMsg] = useState('');

  const hasPerm = (perm) => adminRole === 'superadmin' || adminPerms.includes(perm);

    const adminTokenHeaders = () => ({
    Authorization: `Bearer ${adminSession.token()}`,
  });


  const adminAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminSession.token()}`,
  });

  const loadQrSubmissions = async () => {
    setQrLoading(true);
    setQrStatus('');
    try {
      const res = await fetch(apiUrl('/api/qr/pending'), { headers: adminAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load QR submissions.');
      setQrSubmissions(data.submissions || []);

            try {
        const failedRes = await fetch(apiUrl('/api/qr/failed-emails'), { headers: adminAuthHeaders() });
        const failedData = await failedRes.json();
        if (failedRes.ok && Array.isArray(failedData.alerts)) {
          setManualDispatches((prev) => {
            const map = new Map();
            failedData.alerts.forEach((item) => map.set(item.id || item.email, item));
            prev.forEach((item) => {
              const key = item.id || item.email;
              if (!map.has(key)) map.set(key, item);
            });
            return Array.from(map.values());
          });
        }
      } catch (fErr) {
        console.warn('Could not load failed email dispatches:', fErr);
      }
    } catch (err) {
      setQrStatus(err.message || 'Could not load QR submissions.');
    } finally {
      setQrLoading(false);
    }
  };

  const dismissManualDispatch = async (dispatchItem) => {
    if (dispatchItem.id && !dispatchItem.id.startsWith('local-')) {
      try {
        await fetch(apiUrl(`/api/qr/failed-emails/${dispatchItem.id}`), {
          method: 'DELETE',
          headers: adminAuthHeaders(),
        });
      } catch (err) {
        console.warn('Failed to dismiss alert on server:', err);
      }
    }
    setManualDispatches((prev) => prev.filter((item) => item !== dispatchItem && item.id !== dispatchItem.id));
  };

  const loadPortalUsers = async (search) => {
    const query = typeof search === 'string' ? search : portalUserQuery;
    setPortalUsersLoading(true);
    setPortalStatus('');
    try {
      const endpoint = query.trim()
        ? `/api/portal/admin/users?q=${encodeURIComponent(query.trim())}`
        : '/api/portal/admin/users';
      const res = await fetch(apiUrl(endpoint), { headers: adminAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load portal accounts.');
      setPortalUsers(data.users || []);
    } catch (err) {
      setPortalStatus(err.message || 'Could not load portal accounts.');
    } finally {
      setPortalUsersLoading(false);
    }
  };

  const approveQr = (submission) => {
    const amount = Number(submission?.amount || 0);
    setSelectedQrForApproval(submission);
    setProjectApprovalForm({
      projectType: PROJECT_TYPES[0],
      estimatedDays: '14',
      features: [],
      customFeature: '',
      totalCost: String(amount || ''),
      amountPaid: String(amount || ''),
      transactionRef: submission?.transactionRef || '',
    });
    setQrStatus('');
  };

  const toggleApprovalFeature = (feature) => {
    setProjectApprovalForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((item) => item !== feature)
        : [...current.features, feature],
    }));
  };

  const addCustomProjectFeature = (event) => {
    event.preventDefault();
    const feature = projectApprovalForm.customFeature.trim();
    if (!feature) return;
    setProjectApprovalForm((current) => ({
      ...current,
      features: current.features.includes(feature) ? current.features : [...current.features, feature],
      customFeature: '',
    }));
  };

  const submitProjectApproval = async (event) => {
    event.preventDefault();
    if (!selectedQrForApproval || projectApprovalLoading) return;
    setProjectApprovalLoading(true);
    setQrStatus('Approving the project and preparing its invoice…');
    try {
      const features = [...new Set([
        ...projectApprovalForm.features,
        ...(projectApprovalForm.customFeature.trim() ? [projectApprovalForm.customFeature.trim()] : []),
      ])];
      const res = await fetch(apiUrl(`/api/admin/projects/${encodeURIComponent(selectedQrForApproval.id)}/approve-and-invoice`), {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({
          projectType: projectApprovalForm.projectType,
          estimatedDays: Number(projectApprovalForm.estimatedDays),
          features,
          totalCost: Number(projectApprovalForm.totalCost),
          amountPaid: Number(projectApprovalForm.amountPaid),
          transactionRef: projectApprovalForm.transactionRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Project approval failed.');

      if (data.emailSent === false || data.credentialsManualRequired) {
        const statusMessage = data.emailSent === false
          ? `Project approved and invoice ${data.invoiceNumber || ''} created, but the invoice email failed.`
          : `Invoice ${data.invoiceNumber || ''} emailed; portal credentials need manual delivery.`;
        setQrStatus(`${statusMessage} Check Manual Dispatches below.`);
        if (data.manualPasscode) {
          const newDispatch = {
            id: `local-${Date.now()}`,
            email: selectedQrForApproval.email,
            passcode: data.manualPasscode,
            reason: 'Invoice or portal credentials require manual delivery.',
            createdAt: new Date().toISOString(),
          };
          setManualDispatches((prev) => [newDispatch, ...prev.filter((item) => item.email !== newDispatch.email)]);
        }
      } else {
        setQrStatus(`Project approved. Invoice ${data.invoiceNumber} emailed to ${selectedQrForApproval.email}.`);
      }
      setSelectedQrForApproval(null);
      await loadPortalUsers();
      await loadQrSubmissions();
    } catch (err) {
      setQrStatus(err.message || 'Project approval failed.');
    } finally {
      setProjectApprovalLoading(false);
    }
  };

  const rejectQr = async (qrPaymentId) => {
    const reason = window.prompt('Reason for rejecting this payment proof:', '');
    if (reason === null) return;
    try {
      const res = await fetch(apiUrl('/api/qr/reject'), {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ qrPaymentId, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Rejection failed.');
      setQrStatus('Submission rejected.');
      await loadQrSubmissions();
    } catch (err) {
      setQrStatus(err.message || 'Rejection failed.');
    }
  };

  const loadThread = async (projectId) => {
    setThreadLoading(true);
    setActiveThread({ projectId, project: null, messages: [] });
    try {
      const res = await fetch(
        apiUrl(`/api/portal/admin/messages?projectId=${encodeURIComponent(projectId)}`),
        { headers: adminAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not load the conversation.');
      setActiveThread({ projectId, project: data.project, messages: data.messages || [] });
    } catch (err) {
      setPortalStatus(err.message || 'Could not load the conversation.');
      setActiveThread(null);
    } finally {
      setThreadLoading(false);
    }
  };

  const closeThread = () => {
    setActiveThread(null);
    setThreadLoading(false);
    setThreadReply('');
    setThreadSending(false);
  };

  useEffect(() => {
    if (!activeThread) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeThread();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeThread]);

  const sendThreadReply = async (e) => {
    e.preventDefault();
    if (!activeThread?.projectId || !threadReply.trim()) return;
    setThreadSending(true);
    setPortalStatus('');
    try {
      const res = await fetch(apiUrl('/api/portal/admin/messages'), {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ projectId: activeThread.projectId, body: threadReply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not send the reply.');
      setThreadReply('');
      setPortalStatus(
        data.emailSent
          ? `Reply saved and emailed to ${data.sentTo || 'the client'}.`
          : 'Reply saved, but the notification email could not be sent.'
      );
      await loadThread(activeThread.projectId);
    } catch (err) {
      setPortalStatus(err.message || 'Could not send the reply.');
    } finally {
      setThreadSending(false);
    }
  };

  const reissueCredentials = async (userId) => {
    if (!window.confirm('Issue a new temporary password and email it to this account?')) return;
    setPortalStatus('Sending credentials…');
    try {
      const res = await fetch(apiUrl('/api/portal/admin/reissue-credentials'), {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not re-issue credentials.');

      if (data.emailSent === false || data.manualPasscode || data.manualRequired) {
        setPortalStatus(`Credentials generated for ${data.sentTo}, but email delivery failed (quota reached). Manual dispatch required.`);
        const newDispatch = {
          id: `local-${Date.now()}`,
          email: data.sentTo,
          // [H1] Plaintext credential React state me bhi nahi rakhte — sirf reference id.
          credentialReference: data.credentialReference || null,
          credentialType: 'temporary_password',
          reason: 'Resend daily limit reached',
          createdAt: new Date().toISOString(),
        };
        setManualDispatches((prev) => [newDispatch, ...prev.filter((p) => p.email !== data.sentTo)]);
      } else {
        setPortalStatus(`Temporary credentials emailed to ${data.sentTo}.`);
      }
    } catch (err) {
      setPortalStatus(err.message || 'Could not re-issue credentials.');
    }
  };

  const sendRoleReset = async (user) => {
    const scope =
      user.role === 'superadmin'
        ? 'superadmin'
        : user.role === 'team' || user.role === 'support'
          ? 'team'
          : 'client';
    try {
      setPortalStatus(`Sending ${scope} reset code…`);
      const res = await fetch(apiUrl(`/api/portal/admin/reset-password/${scope}`), {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not send the reset code.');
      setPortalStatus(`Reset code emailed to ${data.sentTo}.`);
    } catch (err) {
      setPortalStatus(err.message || 'Could not send the reset code.');
    }
  };

  const fetchDashboardData = async () => {
    try {
      const token = adminSession.token();
      const headers = { "Authorization": `Bearer ${token}` };


      const srvRes = await apiRequest('/api/services');
      if (srvRes) setServices(srvRes);

      const skillRes = await apiRequest('/api/resume-data');
      if (skillRes) {
        const sd = skillRes;
        setSkills(sd.skills || []);
        setEducation(sd.education || []);
        setExperiences(sd.experiences || []);
      }


      if (hasPerm('messages') || hasPerm('payments')) {
        const msgRes = await apiRequest('/api/messages', { headers });
        if (msgRes) setInboxData(msgRes);
      }

      if (hasPerm('reviews')) {
        const revRes = await apiRequest('/api/reviews');
        if (revRes) setReviews(revRes);
      }

      if (hasPerm('projects')) {
        const projRes = await apiRequest('/api/client-projects', { headers });
        if (projRes) setClientProjects(projRes);
      }

      if (hasPerm('projects')) {
                await loadPortalUsers();
      }

      if (hasPerm('cms')) {
        const contentRes = await apiRequest('/api/content');
        if (contentRes) {
          const content = contentRes;
          setHomeData({
            ...content.homeData,
            roles: Array.isArray(content.homeData?.roles) ? content.homeData.roles : [],
          });
          setAboutData(content.aboutData || {});
          setContactData(Array.isArray(content.contactData) ? content.contactData : []);
          setPolicyData(content.policyData || {});
        }

        const pinRes = await apiRequest('/api/pinned-projects');
        if (pinRes) setPinnedProjects(pinRes);

        const githubUser = "ve-rshivam";
        const ghRes = await fetch(`https://api.github.com/users/${githubUser}/repos?sort=updated&per_page=100`);
        if (ghRes.ok) setGithubProjects(await ghRes.json());
      }

      if (adminRole === 'superadmin') {
        const teamRes = await apiRequest('/api/admin/team', { headers });
        if (teamRes) setTeamList(teamRes);
      }

    } catch (err) {
      console.error("Fetch Data Error:", err);
                  if (err?.status === 401 || err?.status === 403) {
        adminSession.clear();
        import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
        setAuthStep(0);
        setLoginError('Your session expired. Sign in again to continue.');
      }
    }
  };

  useEffect(() => {
    if (authStep === 2) fetchDashboardData();
  }, [authStep, adminRole]);

  useEffect(() => {
    if (authStep !== 2) return undefined;
    let disposed = false;
    let socket = null;

    const onProjectMutated = ({ action, source, project, user } = {}) => {
      const id = project?.id || project?._id;
      if (!project || !id) return;
      if (source === 'legacy') {
        setClientProjects((current) => action === 'deleted'
          ? current.filter((item) => (item?._id || item?.id) !== id)
          : current.some((item) => (item?._id || item?.id) === id)
            ? current.map((item) => (item?._id || item?.id) === id ? { ...item, ...project } : item)
            : [project, ...current]);
        return;
      }
      setPortalUsers((current) => action === 'deleted'
        ? current.map((entry) => ({
            ...entry,
            projects: (entry.projects || []).filter((item) => item.id !== id),
          }))
        : upsertPortalUserProject(current, project, user));
    };

    const onPaymentReceived = ({ submission, message } = {}) => {
      if (submission?.id) {
        setQrSubmissions((current) => [
          submission,
          ...current.filter((item) => item.id !== submission.id),
        ]);
      }
      if (message) {
        const messageId = message._id || message.id;
        setInboxData((current) => [
          message,
          ...current.filter((item) => (item._id || item.id) !== messageId),
        ]);
      }
    };

    const onMessageNew = ({ source, message } = {}) => {
      if (!message) return;
      if (source === 'legacy' && message.type) {
        const messageId = message._id || message.id;
        setInboxData((current) => [
          message,
          ...current.filter((item) => (item._id || item.id) !== messageId),
        ]);
      }
      if (message.projectId) {
        setActiveThread((current) => {
          if (!current || current.projectId !== message.projectId) return current;
          if ((current.messages || []).some((item) => item.id === message.id)) return current;
          return { ...current, messages: [...(current.messages || []), message] };
        });
      }
    };

    import('../lib/socket').then(({ connectRealtimeSocket }) => {
      if (disposed) return;
      socket = connectRealtimeSocket(adminSession.token());
      if (!socket) return;
      socket.on('project:mutated', onProjectMutated);
      socket.on('payment:received', onPaymentReceived);
      socket.on('message:new', onMessageNew);
    }).catch((err) => console.warn('Could not connect to live admin updates:', err));
    return () => {
      disposed = true;
      if (!socket) return;
      socket.off('project:mutated', onProjectMutated);
      socket.off('payment:received', onPaymentReceived);
      socket.off('message:new', onMessageNew);
    };
  }, [authStep]);

  useEffect(() => {
    if (authStep !== 2 || activeTab !== 'portal') return undefined;
    const timer = window.setTimeout(() => {
      loadQrSubmissions();
      if (hasPerm('projects')) loadPortalUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authStep, activeTab]);


  const deleteInboxItem = async (id) => {
    if (window.confirm("Delete this permanently?")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/messages/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { alert("Failed to delete"); }
    }
  };

  const saveContent = async (e) => {
    e.preventDefault();
    setCmsStatus("Saving changes to database...");
    try {
      const token = adminSession.token();
      const data = await apiRequest('/api/content/update', {
        method: 'POST',
        headers: { "Content-Type": 'application/json', Authorization: `Bearer ${token}` },
        body: { homeData, aboutData, contactData, policyData }
      });

      writeCachedRoles(homeData.roles);
      setCmsStatus(data?.message ? `Saved. ${data.message}` : "Changes are now live on the website.");
    } catch (err) {
      setCmsStatus(err?.message ? `Error: ${err.message}` : "Error connecting to database.");
    }
  };

  const toggleGitHubPin = async (repo) => {
    try {
      const token = adminSession.token();
      const data = await apiRequest('/api/pinned-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: {
          repoId: repo.id.toString(),
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url
        }
      });

      if (data?.success) {
        fetchDashboardData();
      }
    } catch (err) {
      alert("Failed to update project visibility.");
    }
  };

  const togglePinReview = async (id) => {
    try {
      const token = adminSession.token();
      await apiRequest(`/api/reviews/${id}/pin`, { method: 'PUT', headers: adminTokenHeaders() });

      fetchDashboardData();
    } catch(err) { console.log(err); }
  };

  const deleteReview = async (id) => {
    if(window.confirm("Delete this review forever?")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/reviews/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { console.log(err); }
    }
  };

  const editReviewText = async (id, currentText) => {
    const newText = window.prompt("Edit Review Text:", currentText);
    if(newText && newText !== currentText) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/reviews/${id}/edit`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: { text: newText }
        });

        fetchDashboardData();
      } catch(err) { alert("Failed to edit review"); }
    }
  };

  const replyToReview = async (id, currentReply) => {
    const reply = window.prompt("Enter your public reply to this review:", currentReply || "");
    if(reply !== null) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/reviews/${id}/reply`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: { adminReply: reply }
        });

        fetchDashboardData();
      } catch(err) { alert("Failed to reply to review"); }
    }
  };


  const handleAddService = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      const isEditing = !!newService._id;
      const url = isEditing ? `/api/services/${newService._id}` : '/api/services';
      const method = isEditing ? 'PUT' : 'POST';

      await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: newService
      });

      setNewService({ title: '', description: '', icon: '', price: '', priceUsd: '' });
      fetchDashboardData();
      alert(`Service ${isEditing ? 'Updated' : 'Added'} Successfully!`);
    } catch(err) { alert(err?.message || "Failed to save service"); }
  };

  const deleteService = async (id) => {
    if(window.confirm("Delete this service?")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/services/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { alert(err?.message || "Failed to delete service"); }
    }
  };



  const handleAddEdu = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      await apiRequest('/api/education', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: newEdu
      });

      setNewEdu({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
      fetchDashboardData();
    } catch(err) { alert(err?.message || "Failed to add education"); }
  };

  const deleteEdu = async (id) => {
    if(window.confirm("Delete this education record?")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/education/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { alert("Failed to delete"); }
    }
  };


  const handleAddSkill = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      const isEditing = !!newSkill._id;
      const url = isEditing ? `/api/skill/${newSkill._id}` : '/api/skill';
      const method = isEditing ? 'PUT' : 'POST';

      await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: newSkill
      });

      setNewSkill({ name: '', description: '', icon: '', proficiency: 50, category: 'Tech' });
      fetchDashboardData();
      alert(`Skill ${isEditing ? 'Updated' : 'Added'} Successfully!`);
    } catch(err) { alert(err?.message || "Failed to save skill"); }
  };
  const deleteSkill = async (id) => {
    if (!id) {
      alert("Cannot delete: this skill has no ID.");
      return;
    }
    if (window.confirm("Delete this skill? It will be removed from the Skills page.")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/skill/${id}`, {
          method: 'DELETE',
          headers: adminTokenHeaders()
        });

        alert("Skill deleted.");
        fetchDashboardData();
      } catch (err) {
        alert(err?.message || "Server offline or network error.");
        console.error(err);
      }
    }
  };


  const handleAddExp = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      await apiRequest('/api/experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: newExp
      });

      setNewExp({ duration: '', role: '', company: '', description: '' });
      fetchDashboardData();
      alert("Experience Added to Timeline!");
    } catch(err) { alert(err?.message || "Failed to add experience"); }
  };

  const deleteExp = async (id) => {
    if(window.confirm("Delete this experience record from Timeline?")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/experience/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { alert("Failed to delete experience"); }
    }
  };



  const editExp = (exp) => {
    setNewExp({ duration: exp.duration, role: exp.role, company: exp.company, description: exp.description });
    setActiveTab('experience');
  };

  const updateExp = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();      await apiRequest(`/api/experience/${newExp._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: { duration: newExp.duration, role: newExp.role, company: newExp.company, description: newExp.description }
      });

      setNewExp({ duration: '', role: '', company: '', description: '' });
      fetchDashboardData();
      alert("Experience Updated!");
    } catch (err) { alert(err?.message || "Failed to update experience"); }
  };

  const editEdu = (edu) => {
    setNewEdu({ degree: edu.degree, institution: edu.institution, duration: edu.duration, score: edu.score, description: edu.description, location: edu.location || '' });
    setActiveTab('education');
  };

  const updateEdu = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      await apiRequest(`/api/education/${newEdu._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: {
          degree: newEdu.degree,
          institution: newEdu.institution,
          duration: newEdu.duration,
          score: newEdu.score,
          description: newEdu.description,
          location: newEdu.location || ''
        }
      });

      setNewEdu({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
      fetchDashboardData();
      alert("Education Updated!");
    } catch (err) { alert(err?.message || "Failed to update education"); }
  };

  const beginEditProject = (project, source) => {
    const id = project?.id || project?._id;
    if (!id) return;
    setEditingProject({ id, source });
    setNewProject(projectDraftFromRecord(project));
    setPortalStatus('');
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const cancelProjectEdit = () => {
    setEditingProject(null);
    setNewProject({ ...EMPTY_PROJECT_DRAFT });
    setPortalStatus('');
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...newProject,
        clientEmail: newProject.clientEmail.trim().toLowerCase(),
        estimatedDays: newProject.estimatedDays === '' ? null : Number(newProject.estimatedDays),
        progress: Number(newProject.progress),
        features: newProject.featuresText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
      };
      if (hasPerm('payments')) {
        body.totalCost = Number(newProject.totalCost || 0);
        body.amountPaid = Number(newProject.amountPaid || 0);
      } else {
        delete body.totalCost;
        delete body.amountPaid;
      }
      const editingId = editingProject?.id;
      const data = await apiRequest(
        editingProject ? `/api/admin/client-projects/${encodeURIComponent(editingId)}` : '/api/admin/client-projects',
        {
          method: editingProject ? 'PUT' : 'POST',
          headers: adminAuthHeaders(),
          body,
        }
      );

      if (data.project && data.source === 'legacy') {
        setClientProjects((current) => current.some((item) => (item._id || item.id) === editingId)
          ? current.map((item) => (item._id || item.id) === editingId ? { ...item, ...data.project } : item)
          : [data.project, ...current]);
      } else if (data.project) {
        setPortalUsers((current) => upsertPortalUserProject(current, data.project, data.user));
      }
      if (data.manualPasscode && !data.credentialsEmailed) {
        setPortalStatus(`Project saved. Email delivery failed; temporary password: ${data.manualPasscode}`);
      } else if (editingProject) {
        setPortalStatus('Project details updated. Changes are visible in the client portal.');
      } else {
        setPortalStatus(data.credentialsEmailed
          ? 'Project created and portal onboarding email sent.'
          : 'Project created. The existing client can sign in with their current portal password.');
      }

      setEditingProject(null);
      setNewProject({ ...EMPTY_PROJECT_DRAFT });
      if (!data.project) fetchDashboardData();
    } catch(err) { setPortalStatus(err?.message || 'Failed to save project.'); }
  };

  const deleteProject = async (id) => {
    if(!id) return;
    if(!window.confirm("Delete this client project tracking?")) return;

    try {
      await apiRequest(`/api/client-projects/${id}`, {
        method: 'DELETE',
        headers: adminTokenHeaders(),
      });

            setClientProjects((prev) => prev.filter((p) => (p?._id || p?.id) !== id));
      setPortalUsers((prev) => prev.map((user) => ({
        ...user,
        projects: (user.projects || []).filter((project) => project.id !== id),
      })));
    } catch(err) {
      alert(err?.message || "Failed to delete project");
    }
  };

  const sendMessageToClient = async (projectId) => {
    const msg = window.prompt("Type your message to the client (This will be emailed to them and shown on their portal):");
    if(msg) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/client-projects/${projectId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: { message: msg }
        });

        alert("Message sent and emailed to the client.");
        fetchDashboardData();
      } catch(err) { alert(err?.message || "Server error."); }
    }
  };

  const verifyAndSendKey = async (projectId) => {
    if(window.confirm("Are you sure? This will generate a secure access key and email it to the client immediately.")) {
      try {
        const token = adminSession.token();
        const data = await apiRequest(`/api/admin/verify-client-payment/${projectId}`, {
          method: 'POST', headers: adminTokenHeaders()
        });

        const accessKeyNotice = data?.manualPasscode
          ? `\n\nManual access key: ${data.manualPasscode}`
          : '';
        alert(`${data?.message || 'Payment verified and access key emailed.'}${accessKeyNotice}`);
        fetchDashboardData();
      } catch (err) { alert(err?.message || "Server error during verification."); }
    }
  };

  const verifyPaymentFromInbox = async (msgId) => {
    const paymentMessage = paymentMessages.find((item) => String(item?._id) === String(msgId));
    const amountPaid = Number(paymentMessage?.amountPaid || 0);
    const isRemainingPayment = Boolean(paymentMessage?.isRemainingPayment || paymentMessage?.projectId)
      || /\[REMAINING BALANCE PAYMENT\]/i.test(String(paymentMessage?.message || ''));
    let totalCost;
    if (!isRemainingPayment) {
      const totalCostInput = window.prompt(
        `Enter the total project valuation (received advance: ₹${amountPaid.toLocaleString('en-IN')}):`,
        String(amountPaid || '')
      );
      if (totalCostInput === null) return;
      totalCost = Number(totalCostInput);
      if (!Number.isFinite(totalCost) || totalCost <= 0 || totalCost < amountPaid) {
        alert('Total valuation must be at least the verified payment amount.');
        return;
      }
    }

    const confirmation = isRemainingPayment
      ? `Apply the verified ₹${amountPaid.toLocaleString('en-IN')} payment to the linked project balance?`
      : `Create the project with ₹${amountPaid.toLocaleString('en-IN')} received against a ₹${totalCost.toLocaleString('en-IN')} valuation?`;
    if (window.confirm(confirmation)) {
      try {
        const token = adminSession.token();
        const data = await apiRequest(`/api/admin/approve-payment-message/${msgId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: isRemainingPayment ? {} : { totalCost }
        });

        if (data?.emailSent === false) {
          const manualKey = data?.manualPasscode ? `\n\nManual access key: ${data.manualPasscode}` : '';
          alert(`${data?.message || 'Payment applied, but the client email could not be sent.'}${manualKey}`);
        } else {
          alert(data?.message || 'Payment approved and client notified.');
        }
        await fetchDashboardData();
      } catch (err) { alert(err?.message || "Server error during verification."); }
    }
  };

  const rejectPaymentFromInbox = async (msgId) => {
    const reason = window.prompt("Enter reason for rejection (This will be emailed to the client):", "Screenshot is unclear or Transaction ID does not match our bank records.");
    if (reason === null) return;

    if(window.confirm("Are you sure? This will delete the request and email the client that verification failed.")) {
      try {
        const token = adminSession.token();
        const data = await apiRequest(`/api/admin/reject-payment-message/${msgId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: { reason }
        });

        if (data?.emailSent === false) {
          alert(data?.message || 'The client could not be notified. This payment request remains available for retry.');
          return;
        }
        alert(data?.message || 'Payment rejected and client notified.');
        await fetchDashboardData();
      } catch (err) { alert(err?.message || "Server error during rejection."); }
    }
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = adminSession.token();
      const data = await apiRequest('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: newTeamMember
      });

      alert("" + (data?.message || 'Team member saved.'));
      setNewTeamMember({ name: '', identifier: '', permissions: [] });
      fetchDashboardData();
    } catch(err) { alert(err?.message || "Server Error"); }
  };

  const deleteTeamMember = async (id) => {
    if(window.confirm("Remove this member from the team? They will lose dashboard access immediately.")) {
      try {
        const token = adminSession.token();
        await apiRequest(`/api/admin/team/${id}`, { method: 'DELETE', headers: adminTokenHeaders() });

        fetchDashboardData();
      } catch(err) { alert("Server Error"); }
    }
  };

  const togglePermission = (perm) => {
    setNewTeamMember(prev => {
      const has = prev.permissions.includes(perm);
      if (has) return { ...prev, permissions: prev.permissions.filter(p => p !== perm) };
      return { ...prev, permissions: [...prev.permissions, perm] };
    });
  };

  const handleUpdateSecurity = async (e) => {
    e.preventDefault();
    setSecurityMsg("Updating...");
    try {
      const token = adminSession.token();
      const data = await apiRequest('/api/admin/update-security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: securityData
      });

      adminSession.clear();
      import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
      try {
        ['adminToken', 'adminRole', 'adminPerms', 'adminName'].forEach((key) => localStorage.removeItem(key));
      } catch {
        // The persisted session store is already cleared above.
      }
      setAdminRole('team');
      setAdminPerms([]);
      setAdminName('');
      setAuthStep(0);
      setLoginData({ identifier: '', password: '' });
      setLoginChallenge('');
      setLoginError('Credentials updated. Sign in again with your new credentials.');
      setSecurityMsg("" + (data?.message || 'Security credentials updated. Please sign in again.'));
      setSecurityData({ oldPassword: '', newPassword: '', newPin: '' });
    } catch (err) {
      setSecurityMsg("Error: " + (err?.message || "Server Error."));
    }
  };

  // [SESSION CONTROL] tokenVersion bump hone se har device ka purana admin JWT invalid ho jata hai.
  const handleLogoutAll = async () => {
    if (!window.confirm('Sign out of admin on every device? Every active session will be revoked.')) return;
    setLogoutAllMsg('Signing out…');
    try {
      await apiRequest('/api/admin/logout-all', {
        method: 'POST',
        headers: adminTokenHeaders(),
      });
    } catch (err) {
      setLogoutAllMsg('Error: ' + (err?.message || 'Server Error.'));
      return;
    }

    adminSession.clear();
    import('../lib/socket')
      .then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket())
      .catch(() => {});
    try {
      ['adminToken', 'adminRole', 'adminPerms', 'adminName'].forEach((key) => localStorage.removeItem(key));
    } catch {
          }
    setLogoutAllMsg('Signed out of every device. Redirecting to login…');
    window.location.href = '/admin';
  };

  const handleStep1Login = async (e) => {
    e.preventDefault();
    setLoginError('Verifying...');
    try {
      const data = await apiRequest('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: loginData,
      });

      if (data?.success && data?.challenge) {
        setLoginChallenge(data.challenge);
        setAuthStep(1);
        setLoginError('');
      } else if (data?.success) {
        setLoginError('Security challenge missing. Start the sign-in again.');
      } else {
        setLoginError(data?.message || 'Invalid Credentials');
      }
    } catch (err) {
      console.error('Admin login error:', err);
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStep2FA = async (e) => {
    e.preventDefault();
    setLoginError('Checking PIN...');
    try {
      if (!loginChallenge) {
        setAuthStep(0);
        setLoginError('Your sign-in session expired. Enter your password again.');
        return;
      }

      const data = await apiRequest('/api/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { identifier: loginData.identifier, pin: backupPin, challenge: loginChallenge },
      });

      adminSession.save({
        token: data.token,
        role: data.role,
        permissions: data.permissions || [],
        name: data.name || '',
      });

      setAdminRole(data.role);
      setAdminPerms(data.permissions || []);
      setAdminName(data.name || '');

      setAuthStep(2);
      setLoginChallenge('');
      setLoginError('');
    } catch (err) {
      console.error('Admin 2FA error:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (/challenge|sign in with your password/i.test(message)) {
        setAuthStep(0);
        setLoginChallenge('');
      }
      setLoginError(message);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoginError('Sending OTP...');
    try {
      const data = await apiRequest('/api/admin/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { identifier: resetIdentifier },
      });

      if (data?.success) {
        setAuthStep(4);
        setLoginError('');
        if (data.devOtp) alert(`TESTING OTP: ${data.devOtp}`);
      } else {
        setLoginError(data?.message || 'Request failed.');
      }
    } catch (err) {
      console.error('Admin forgot-password error:', err);
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
        if (resetPinEnabled && !/^\d{4}$/.test(newResetPin)) {
      setLoginError('PIN must be exactly 4 digits.');
      return;
    }
    setLoginError('Resetting password...');
    try {
      const body = { identifier: resetIdentifier, otp: resetOtp, newPassword };
      if (resetPinEnabled && newResetPin) body.newPin = newResetPin;

      const data = await apiRequest('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (data?.success) {
        alert(data?.message || 'Reset successful.');
        setAuthStep(0);
        setLoginError('');
        setNewResetPin('');
        setResetPinEnabled(false);
      } else {
        setLoginError(data?.message || 'Request failed.');
      }
    } catch (err) {
      console.error('Admin reset-password error:', err);
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogout = () => {
    adminSession.clear();
    import('../lib/socket').then(({ disconnectRealtimeSocket }) => disconnectRealtimeSocket());
    setAdminRole('team');
    setAdminPerms([]);
    setAdminName('');
    setAuthStep(0);
    setActiveTab('dashboard');
    setLoginData({ identifier: '', password: '' });
    setBackupPin('');
    setNewResetPin('');
    setResetPinEnabled(false);
  };

    useEffect(() => {
    const onExpired = () => {
      setAdminRole('team');
      setAdminPerms([]);
      setAdminName('');
      setAuthStep(0);
      setActiveTab('dashboard');
      setBackupPin('');
      setLoginError('Your session ended. Sign in again to continue.');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);


  const contactMessages = (inboxData || []).filter(msg => msg?.type === 'contact' || !msg?.type);
  const paymentMessages = (inboxData || []).filter(msg => msg?.type === 'payment');

        const provisionedProjects = (portalUsers || [])
    .flatMap((user) => (user.projects || []).map((project) => ({ user, project })))
    .filter(({ user, project }) => {
      const q = portalUserQuery.trim().toLowerCase();
      if (!q) return true;
      return [user?.name, user?.email, project?.projectTitle, project?.serviceName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

  const projectSearch = portalUserQuery.trim().toLowerCase();
  const allClientProjectRecords = [
    ...(clientProjects || [])
      .filter(Boolean)
      .filter((project) => !projectSearch || [project.clientName, project.clientEmail, project.projectTitle, project.serviceName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(projectSearch)))
      .map((project) => ({ source: 'legacy', id: project._id || project.id, project, user: null })),
    ...provisionedProjects.map(({ user, project }) => ({ source: 'portal', id: project.id, project, user })),
  ];

  const money = (project) => {
    const symbol = (project?.currency || 'INR').toUpperCase() === 'INR' ? '₹' : '$';
    const paid = Number(project?.amountPaid || 0).toLocaleString('en-IN');
    const total = Number(project?.totalCost || 0).toLocaleString('en-IN');
    return `${symbol}${paid} of ${symbol}${total}`;
  };

  const draftTotalCost = Math.max(Number(newProject.totalCost) || 0, 0);
  const draftAmountPaid = Math.max(Number(newProject.amountPaid) || 0, 0);
  const draftRemainingBalance = Math.max(draftTotalCost - draftAmountPaid, 0);
  const draftPaymentStatus = paymentStatusForAmounts(draftTotalCost, draftAmountPaid);

  const sidebarItems = [
    { id: 'dashboard', label: 'Overview', perm: null },
    { id: 'messages', label: 'Messages', perm: 'messages' },
    { id: 'payments', label: 'Payments', perm: 'payments' },
    { id: 'projects', label: 'Client Projects', perm: 'projects' },
    { id: 'services', label: 'Services', perm: 'services' },
    { id: 'skills', label: 'Skills', perm: 'skills' },
    { id: 'experience', label: 'Timeline', perm: 'skills' },
    { id: 'education', label: 'Education', perm: 'skills' },
    { id: 'portal', label: 'Manual payments (QR)', perm: 'payments' },
    { id: 'reviews', label: 'Reviews', perm: 'reviews' },
    { id: 'cms', label: 'Website Content', perm: 'cms' },
    { id: 'github', label: 'GitHub Projects', perm: 'cms' },
    { id: 'security', label: 'Security', perm: null },
    { id: 'team', label: 'Team Access', perm: null, superadminOnly: true },
  ];

  const visibleItems = sidebarItems.filter(item =>
    item.superadminOnly
      ? adminRole === 'superadmin'
      : item.perms
        ? item.perms.some(perm => hasPerm(perm))
        : (item.perm === null || hasPerm(item.perm))
  );

  const authField =
    'w-full border border-[var(--rule)] bg-transparent px-3 py-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

  if (authStep !== 2) {
    const stepTitle =
      authStep === 1
        ? 'Two-step verification.'
        : authStep === 3
          ? 'Reset password.'
          : authStep === 4
            ? 'Verify the code.'
            : 'Admin access.';

    return (
      <PageShell>
        <header className="border-b border-[var(--rule)] pb-8 pt-8 md:pb-10 md:pt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="eyebrow text-[var(--signal)]">Restricted</p>
            <p className="eyebrow text-[var(--ink-soft)]">Staff record</p>
          </div>

          <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.92] tracking-[-0.02em] text-[var(--ink)]">
            {stepTitle}
          </h1>
        </header>

        <div className="grid grid-cols-12 gap-x-8 gap-y-10 py-10 md:py-14">
          <div className="col-span-12 md:col-span-5">
            <p className="eyebrow text-[var(--ink-soft)]">Notice</p>
            <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--ink-soft)]">
              This area manages live content, payments and client records. Every sign-in is logged.
            </p>
            <ul className="mt-6 border-t border-[var(--rule)] font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
              <li className="border-b border-[var(--rule)] py-3">01 — Identifier check</li>
              <li className="border-b border-[var(--rule)] py-3">02 — Security PIN</li>
              <li className="border-b border-[var(--rule)] py-3">03 — Full dashboard</li>
            </ul>
          </div>

          <div className="col-span-12 md:col-span-6 md:col-start-7">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-[var(--rule)] p-6 md:p-8"
            >
              {authStep === 0 && (
                <>
                  <p className="eyebrow text-[var(--ink-soft)]">Sign in</p>
                  <form onSubmit={handleStep1Login} className="mt-5 flex flex-col gap-4">
                    <input
                      type="text"
                      placeholder="Email or identifier"
                      required
                      onChange={(e) => setLoginData({ ...loginData, identifier: e.target.value })}
                      className={authField}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      required
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className={authField}
                    />
                    <button type="submit" className={`${buttonClass} w-full`}>
                      Continue 
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthStep(3)}
                      className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      Forgot password?
                    </button>
                  </form>
                </>
              )}

              {authStep === 1 && (
                <>
                  <p className="eyebrow text-[var(--ink-soft)]">Second factor</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                    Enter the security PIN for this account.
                  </p>
                  <form onSubmit={handleStep2FA} className="mt-5 flex flex-col gap-4">
                    <input
                      type="password"
                      placeholder="4-digit PIN"
                      maxLength="4"
                      required
                      onChange={(e) => setBackupPin(e.target.value)}
                      className={`${authField} text-center font-mono-ui text-xl tracking-[0.6em]`}
                    />
                    <button type="submit" className={`${buttonClass} w-full`}>
                      Unlock dashboard
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthStep(0)}
                      className="text-left font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      ← Back to sign in
                    </button>
                  </form>
                </>
              )}

              {authStep === 3 && (
                <>
                  <p className="eyebrow text-[var(--ink-soft)]">Recovery</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                    Enter the registered email to receive a one-time code.
                  </p>
                  <form onSubmit={handleSendOtp} className="mt-5 flex flex-col gap-4">
                    <input
                      type="text"
                      placeholder="Registered email"
                      required
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      className={authField}
                    />
                    <button type="submit" className={`${buttonClass} w-full`}>
                      Send code
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthStep(0)}
                      className="text-left font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      Back to sign in
                    </button>
                  </form>
                </>
              )}

              {authStep === 4 && (
                <>
                  <p className="eyebrow text-[var(--ink-soft)]">One-time code</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                    Sent to {resetIdentifier}. It expires shortly.
                  </p>
                  <form onSubmit={handleResetPassword} className="mt-5 flex flex-col gap-4">
                    <input
                      type="text"
                      placeholder="6-digit code"
                      maxLength="6"
                      required
                      onChange={(e) => setResetOtp(e.target.value)}
                      className={`${authField} font-mono-ui text-lg tracking-[0.3em]`}
                    />
                    <input
                      type="password"
                      placeholder="New password (min. 8 chars)"
                      required
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={authField}
                    />

                    { }
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-soft)]">
                      <input
                        type="checkbox"
                        checked={resetPinEnabled}
                        onChange={(e) => {
                          setResetPinEnabled(e.target.checked);
                          if (!e.target.checked) setNewResetPin('');
                        }}
                        className="accent-[var(--signal)]"
                      />
                      Also reset my 2-step PIN
                    </label>

                    {resetPinEnabled && (
                      <input
                        type="password"
                        placeholder="New 4-digit PIN"
                        maxLength="4"
                        inputMode="numeric"
                        pattern="\d{4}"
                        required={resetPinEnabled}
                        value={newResetPin}
                        onChange={(e) => setNewResetPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className={`${authField} text-center font-mono-ui text-xl tracking-[0.6em]`}
                      />
                    )}

                    <button type="submit" className={`${buttonClass} w-full`}>
                      Save and sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthStep(3)}
                      className="text-left font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      Resend code
                    </button>
                  </form>
                </>
              )}

              {loginError && (
                <p className="mt-5 border-l-2 border-[var(--signal)] pl-3 text-sm leading-6 text-[var(--signal)]">
                  {loginError}
                </p>
              )}
            </motion.div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-main)] md:flex-row">
      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar { display: none; }
          .admin-mobile-header { display: flex; }
        }
        @media (min-width: 769px) {
          .admin-mobile-header { display: none; }
        }
      `}</style>

      { }
      <div className="admin-mobile-header border-b border-[var(--rule)] bg-[var(--bg-card)] px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="text-sm font-bold text-[var(--text-main)]"
          >
            Shivam.Admin
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="p-2 text-[var(--text-dim)] hover:text-[var(--accent)]"
              aria-label="Toggle menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                {showMobileMenu ? (
                  <><path d="M5 5l10 10M15 5L5 15" /></>
                ) : (
                  <><path d="M3 5h14M3 10h14M3 15h14" /></>
                )}
              </svg>
            </button>
            <span className="text-xs text-[var(--text-dim)] hidden sm:inline">
              {adminName} ({adminRole?.toUpperCase()})
            </span>
          </div>
        </div>
        {showMobileMenu && (
          <div className="mt-3 flex flex-wrap gap-2 pb-3">
            {visibleItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setShowMobileMenu(false); }}
                className={`px-3 py-1.5 text-xs font-mono-ui uppercase tracking-[0.14em] border rounded ${
                  activeTab === item.id
                    ? 'border-[var(--signal)] text-[var(--signal)] bg-[var(--signal)]/10'
                    : 'border-[var(--rule)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="admin-sidebar flex flex-col gap-1.5 w-64 min-h-[calc(100vh-120px)] bg-[var(--bg-card)] border-r border-[var(--rule)] p-5">
        <h2 className="text-lg font-bold font-mono-ui text-[var(--accent)] mb-4">
          Shivam<span className="text-[var(--text-main)]">.Admin</span>
        </h2>
        <div className="px-3 py-2 bg-[var(--bg-main)] rounded text-[11px] text-[var(--text-dim)] text-center border border-dashed border-[var(--rule)] mb-6">
          Log in as: <strong className={adminRole === 'superadmin' ? 'text-[#ff4d6d]' : 'text-[var(--accent)]'}>
            {adminName} ({adminRole?.toUpperCase()})
          </strong>
        </div>

        {visibleItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`admin-sidebar-btn w-full text-left px-4 py-2.5 text-sm rounded-lg border transition-all ${
              activeTab === item.id
                ? 'bg-[var(--accent-glow)]/40 border-[var(--accent)] text-[var(--accent)] font-bold'
                : 'border-transparent text-[var(--text-dim)] hover:bg-[var(--bg-main)] hover:text-[var(--ink)]'
            }`}
          >
            {item.label}
          </button>
        ))}

        <button
          onClick={handleLogout}
          className="mt-4 w-full px-4 py-2.5 text-sm font-bold rounded-lg border border-[var(--signal)] text-[var(--signal)] hover:bg-[var(--signal)]/10 transition-colors"
        >
          Log out
        </button>
      </div>

      <div className="admin-main flex-1 p-5 md:p-10 overflow-y-auto border-b border-[var(--rule)] bg-[var(--bg-main)]">

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-8">Dashboard Overview</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {(hasPerm('messages') || hasPerm('payments')) && <StatCard title="Unread Messages" value={contactMessages?.length || 0} color="var(--signal)" />}
              {hasPerm('payments') && <StatCard title="Payment Verifications" value={paymentMessages?.length || 0} color="#ffb84d" />}
              {hasPerm('projects') && <StatCard title="Active Projects" value={allClientProjectRecords.length} color="#9b59b6" />}
              {hasPerm('services') && <StatCard title="Active Services" value={services?.length || 0} color="#ff4d6d" />}
              {hasPerm('skills') && <StatCard title="Total Skills" value={skills?.length || 0} color="#00f5a0" />}
              {hasPerm('skills') && <StatCard title="Education Records" value={education?.length || 0} color="var(--accent)" />}
              {hasPerm('skills') && <StatCard title="Experience Records" value={experiences?.length || 0} color="var(--ink)" />}
              {hasPerm('skills') && <StatCard title="Pinned Projects" value={pinnedProjects?.length || 0} color="var(--text-dim)" />}
            </div>
          </motion.div>
        )}

        {activeTab === 'messages' && hasPerm('messages') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-8">Contact Form Inbox</h1>
            {contactMessages?.length === 0 ? (
              <p className="text-[var(--text-dim)]">No new contact messages.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {contactMessages?.map((msg, idx) => {
                  if(!msg) return null;
                  return (
                  <div key={msg._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <h3 className="text-[var(--accent)] m-0 mb-2">{msg.name}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-4">Email: {msg.email} | Phone: {msg.phone || 'N/A'}</p>
                    <p className="m-0">"{msg.message}"</p>
                    <button onClick={() => deleteInboxItem(msg._id)} className="absolute top-4 right-4 px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                  </div>
                )})}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'payments' && hasPerm('payments') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-8">Payment Verifications</h1>
            {paymentMessages?.length === 0 ? (
              <p className="text-[var(--text-dim)]">No pending payment verifications.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {paymentMessages?.map((msg, idx) => {
                  if(!msg) return null;
                  return (
                  <div key={msg._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <h3 className="text-[#ffb84d] m-0 mb-2">{msg.name}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">Email: {msg.email}</p>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">Amount received: {msg.amountPaid ? `₹${Number(msg.amountPaid).toLocaleString('en-IN')}` : 'not provided'}</p>
                    <div className="bg-[var(--bg-main)] p-3 rounded border border-dashed border-[var(--border)] inline-block">
                      <strong className="text-[var(--text-main)]">Transaction ID: </strong>
                      <span className="text-[var(--accent)] font-mono">{msg.transaction_id}</span>
                    </div>

                    {msg.attachment && (
                      <div className="mt-4">
                        <p className="text-[var(--text-dim)] text-sm m-0 mb-2">Screenshot Attached:</p>
                        <img
                          src={msg.attachment}
                          alt="Payment Proof"
                          className="max-w-full max-h-[300px] rounded-lg border border-[var(--border)] object-contain bg-[var(--bg-main)]"
                        />
                      </div>
                    )}

                    <div className="mt-5 flex gap-3">
                      {(msg.isRemainingPayment || msg.projectId || /\[REMAINING BALANCE PAYMENT\]/i.test(String(msg.message || '')) || hasPerm('client_access')) && (
                        <button onClick={() => verifyPaymentFromInbox(msg._id)} className="px-5 py-2.5 bg-[#00f5a0] text-[#000] border-none rounded font-bold cursor-pointer hover:opacity-90 transition-opacity">
                          {msg.isRemainingPayment || msg.projectId || /\[REMAINING BALANCE PAYMENT\]/i.test(String(msg.message || ''))
                            ? 'Verify balance payment'
                            : 'Verify & send access key'}
                        </button>
                      )}
                      <button onClick={() => rejectPaymentFromInbox(msg._id)} className="px-5 py-2.5 bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded font-bold cursor-pointer hover:bg-[#ff4d4d]/10 transition-colors">
                        Reject & email client
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'portal' && hasPerm('payments') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manual payment access</h1>
            <p className="mb-8 text-[var(--text-dim)]">
              Review UPI/QR proofs here. Approving one creates the client account and emails login
              credentials. Everything after that — messages, progress, payment updates — is handled
              in Client Projects.
            </p>

            {(qrStatus || portalStatus) && (
              <div className="p-4 bg-[var(--signal)]/10 text-[var(--accent)] rounded-lg mb-6 border border-[var(--accent)]">
                {qrStatus || portalStatus}
              </div>
            )}

            { }
            {manualDispatches.length > 0 && (
              <div className="mb-8 p-6 bg-[#ff4d4d]/10 border-2 border-[#ff4d4d] rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">⚠️</span>
                  <h3 className="text-lg font-bold text-[#ff4d4d] m-0">
                    Action Required: Manual Credential Dispatch ({manualDispatches.length})
                  </h3>
                </div>
                <p className="text-sm text-[var(--text-dim)] mb-4">
                  Email delivery failed (Resend quota reached). Temporary passwords are no longer
                  stored in the database, so they cannot be recovered here — use a one-time reset
                  link from the client account instead:
                </p>
                <div className="flex flex-col gap-3">
                  {manualDispatches.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="bg-[var(--bg-card)] p-4 rounded-lg border border-[#ff4d4d]/40 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="flex flex-col gap-1 min-w-[240px]">
                        <span className="text-sm font-semibold text-[var(--text-main)]">
                          Client: <span className="font-mono text-[var(--accent)]">{item.email}</span>
                        </span>
                        <span className="text-sm text-[var(--text-main)]">
                          Credential reference:{' '}
                          <span className="font-mono bg-[var(--bg-main)] px-2 py-0.5 rounded border border-[var(--rule)] text-[var(--accent)] text-xs select-all">
                            {item.credentialReference || 'not issued'}
                          </span>{' '}
                          <span className="text-xs text-[var(--text-dim)]">
                            (reference only — no plaintext credential is stored)
                          </span>
                        </span>
                        <span className="text-xs text-[var(--text-dim)]">
                          Reason: {item.reason || 'Resend daily limit reached'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(
                            'Your Portfolio Portal Access'
                          )}&body=${encodeURIComponent(
                            `Hi,\n\nYour portfolio portal access is ready.\n\nPortal: https://rshivam.dev/portal\nEmail: ${item.email}\n\nOpen the portal and choose \"Forgot your password?\" to receive a secure one-time reset link.\n\nBest regards,\nShivam Web Studio\nhttps://rshivam.dev`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-[#00f5a0] text-black font-bold text-xs rounded hover:opacity-90 transition-opacity no-underline inline-block cursor-pointer"
                        >
                          Send via Webmail
                        </a>
                        <button
                          onClick={() => dismissManualDispatch(item)}
                          className="px-3 py-2 bg-transparent text-[var(--text-dim)] hover:text-[var(--text-main)] text-xs rounded border border-[var(--border)] transition-colors cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section className="mb-12">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
                <h2 className="text-xl font-display text-[var(--text-main)] m-0">
                  QR payment proofs ({qrSubmissions.length})
                </h2>
                <button
                  onClick={loadQrSubmissions}
                  disabled={qrLoading}
                  className="px-4 py-2 text-xs font-mono-ui uppercase tracking-[0.14em] border border-[var(--rule)] rounded hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  {qrLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {qrLoading ? (
                <p className="text-[var(--text-dim)]">Loading pending proofs…</p>
              ) : qrSubmissions.length === 0 ? (
                <p className="text-[var(--text-dim)]">No pending QR payment proofs.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {qrSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)]"
                    >
                      <h3 className="text-[#ffb84d] m-0 mb-2">{sub.clientName || 'Unknown client'}</h3>
                      <p className="text-[var(--text-dim)] text-sm m-0 mb-1">
                        {sub.email} · {sub.currency} {sub.amount}
                      </p>
                      <p className="text-[var(--text-dim)] text-sm m-0 mb-3">
                        Ref: <span className="text-[var(--accent)] font-mono">{sub.transactionRef || 'n/a'}</span>
                      </p>
                      {sub.notes && (
                        <p className="text-[var(--text-dim)] text-sm m-0 mb-3 whitespace-pre-wrap">{sub.notes}</p>
                      )}
                      {sub.screenshotUrl && (
                        <img
                          src={sub.screenshotUrl}
                          alt="Payment proof"
                          className="max-w-full max-h-[240px] rounded-lg border border-[var(--border)] object-contain bg-[var(--bg-main)]"
                        />
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {hasPerm('projects') && hasPerm('payments') && hasPerm('client_access') && (
                          <button
                            onClick={() => approveQr(sub)}
                            className="px-4 py-2 bg-[#00f5a0] text-[#000] border-none rounded font-bold text-xs cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            Configure scope & approve
                          </button>
                        )}
                        <button
                          onClick={() => rejectQr(sub.id)}
                          className="px-4 py-2 bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded font-bold text-xs hover:bg-[#ff4d4d]/10 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </motion.div>
        )}

        {activeTab === 'reviews' && hasPerm('reviews') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-8">Manage Reviews</h1>
            <div className="flex flex-col gap-5">
              {reviews?.map((review, idx) => {
                if(!review) return null;
                return (
                <div key={review._id || idx} className="flex flex-col bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)]">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-[var(--accent)] m-0 mb-1">{review.name} <span className="text-[var(--text-dim)] text-sm">({"★".repeat(review.rating || 5)})</span></h3>
                      <p className="text-[var(--text-dim)] m-0">"{review.text}"</p>
                      {review.adminReply && (
                        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] p-3">
                          <span className="text-[var(--accent)] font-bold text-xs">Your Reply:</span>
                          <p className="text-[var(--text-main)] text-sm mt-1 m-0">{review.adminReply}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end max-w-[250px]">
                      <button onClick={() => togglePinReview(review._id)} className={`px-3 py-1.5 text-xs rounded border font-bold ${review.isPinned ? 'bg-[var(--accent)] text-[#000] border-[var(--accent)]' : 'bg-transparent text-[var(--text-main)] border-[var(--border)]'}`}>
                        {review.isPinned ? 'Pinned' : 'Pin'}
                      </button>
                      <button onClick={() => editReviewText(review._id, review.text)} className="px-3 py-1.5 text-xs bg-transparent text-[var(--text-main)] border border-[var(--border)] rounded hover:bg-[var(--bg-main)] transition-colors">Edit</button>
                      <button onClick={() => replyToReview(review._id, review.adminReply)} className="px-3 py-1.5 text-xs bg-transparent text-[var(--accent)] border border-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors">Reply</button>
                      <button onClick={() => deleteReview(review._id)} className="px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </motion.div>
        )}

        {activeTab === 'services' && hasPerm('services') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manage Services</h1>
            <p className="text-[var(--text-dim)] mb-8">Add or edit services. Changes will auto-sync to the Services & Payment pages.</p>
            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[300px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">
                  {newService._id ? 'Edit service' : 'Add new service'}
                </h3>
                <form onSubmit={handleAddService} className="flex flex-col gap-4">
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Service Title</label><input type="text" required value={newService?.title || ''} onChange={e => setNewService({...newService, title: e.target.value})} placeholder="e.g. AI/ML Integration" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Price (INR)</label><input type="text" inputMode="decimal" required value={newService?.price || ''} onChange={e => setNewService({...newService, price: e.target.value})} placeholder="e.g. 4999" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Price (USD)</label><input type="text" inputMode="decimal" value={newService?.priceUsd || ''} onChange={e => setNewService({...newService, priceUsd: e.target.value})} placeholder="e.g. 59 (optional, used for PayPal)" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Short Description</label><textarea rows="3" required value={newService?.description || ''} onChange={e => setNewService({...newService, description: e.target.value})} placeholder="Describe..." className={`${inputClass} resize-none`}></textarea></div>

                  <button type="submit" className={buttonClass}>{newService._id ? 'Update Service' : 'Publish Service'}</button>
                  {newService._id && (
                    <button type="button" onClick={() => setNewService({ title: '', description: '', icon: '', price: '', priceUsd: '' })} className="text-left text-sm text-[#ff4d4d] border border-[#ff4d4d] rounded px-4 py-2 hover:bg-[#ff4d4d]/10 transition-colors">
                      Cancel Edit
                    </button>
                  )}
                </form>
              </div>

              <div className="flex-1.5 min-w-[300px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Live Services ({services?.length || 0})</h3>
                {services?.length === 0 ? <p className="text-[var(--text-dim)]">No services added yet.</p> : null}
                {services?.map((srv, idx) => {
                  if(!srv) return null;
                  return (
                  <div key={srv._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{srv.icon}</span>
                      <h3 className="text-[var(--text-main)] m-0">{srv.title}</h3>
                    </div>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">{srv.description}</p>
                    <p className="text-[var(--accent)] font-bold text-lg m-0">{srv.price}{srv.priceUsd ? ` · $${srv.priceUsd}` : ''}</p>

                    <button onClick={() => setNewService(srv)} className="absolute top-4 right-4 px-3 py-1.5 text-xs bg-transparent text-[var(--accent)] border border-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors">Edit</button>
                    <button onClick={() => deleteService(srv._id)} className="absolute top-4 right-14 px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                  </div>
                )})}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'skills' && hasPerm('skills') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manage Skills</h1>
            <p className="text-[var(--text-dim)] mb-8">Add or modify skills. Changes will auto-sync to the Skills page.</p>

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[300px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">
                  {newSkill._id ? 'Edit skill' : 'Add new skill'}
                </h3>
                <form onSubmit={handleAddSkill} className="flex flex-col gap-4">
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Skill Name</label><input type="text" required value={newSkill?.name || ''} onChange={e => setNewSkill({...newSkill, name: e.target.value})} placeholder="e.g. React.js" className={inputClass} /></div>
                  <div className="flex gap-4">
                      <div className="flex-1"><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Proficiency (%)</label><input type="number" required min="1" max="100" value={newSkill?.proficiency || 50} onChange={e => setNewSkill({...newSkill, proficiency: e.target.value})} placeholder="80" className={inputClass} /></div>
                  </div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Category</label><input type="text" required value={newSkill?.category || ''} onChange={e => setNewSkill({...newSkill, category: e.target.value})} placeholder="e.g. Frontend" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Description</label><textarea rows="3" required value={newSkill?.description || ''} onChange={e => setNewSkill({...newSkill, description: e.target.value})} placeholder="Describe..." className={`${inputClass} resize-none`}></textarea></div>

                  <button type="submit" className={buttonClass}>{newSkill._id ? 'Update Skill' : 'Publish Skill'}</button>
                  {newSkill._id && (
                    <button type="button" onClick={() => setNewSkill({ name: '', description: '', icon: '', proficiency: 50, category: 'Tech' })} className="text-left text-sm text-[#ff4d4d] border border-[#ff4d4d] rounded px-4 py-2 hover:bg-[#ff4d4d]/10 transition-colors">
                      Cancel Edit
                    </button>
                  )}
                </form>
              </div>

              <div className="flex-1.5 min-w-[300px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Live Skills ({skills?.length || 0})</h3>
                {skills?.length === 0 ? <p className="text-[var(--text-dim)]">No skills added yet.</p> : null}
                {skills?.map((skill, idx) => {
                  if(!skill) return null;
                  return (
                  <div key={skill._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-[var(--text-main)] m-0">{skill.name || 'Unknown Skill'} <span className="text-[var(--text-dim)] text-sm">({skill.proficiency || 0}%)</span></h3>
                    </div>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">{skill.description || 'No description'}</p>
                    <span className="bg-[var(--signal)]/10 text-[var(--accent)] px-2 py-1 rounded text-xs">{skill.category || 'Tech'}</span>

                    <button onClick={() => setNewSkill(skill)} className="absolute top-4 right-4 px-3 py-1.5 text-xs bg-transparent text-[var(--accent)] border border-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors" disabled={!skill._id} style={{ opacity: skill._id ? 1 : 0.4 }}>Edit</button>
                    <button onClick={() => deleteSkill(skill._id)} className="absolute top-4 right-14 px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors" disabled={!skill._id} style={{ opacity: skill._id ? 1 : 0.4 }}>Delete</button>
                  </div>
                )})}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'education' && hasPerm('skills') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manage Education</h1>
            <p className="text-[var(--text-dim)] mb-8">Add or remove education details. Syncs to the Resume page.</p>

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[300px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">{newEdu._id ? 'Update education' : 'Add education'}</h3>
                <form onSubmit={handleAddEdu} className="flex flex-col gap-4">
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Degree / Course</label><input type="text" required value={newEdu?.degree || ''} onChange={e => setNewEdu({...newEdu, degree: e.target.value})} placeholder="e.g. B.Tech Computer Science" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Institution</label><input type="text" required value={newEdu?.institution || ''} onChange={e => setNewEdu({...newEdu, institution: e.target.value})} placeholder="e.g. Gurukula Kangri Vishwavidyalaya" className={inputClass} /></div>
                  <div className="flex gap-4">
                      <div className="flex-1"><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Duration</label><input type="text" required value={newEdu?.duration || ''} onChange={e => setNewEdu({...newEdu, duration: e.target.value})} placeholder="e.g. 2022-2025" className={inputClass} /></div>
                      <div className="flex-1"><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Score (%)</label><input type="text" value={newEdu?.score || ''} onChange={e => setNewEdu({...newEdu, score: e.target.value})} placeholder="e.g. 79.2%" className={inputClass} /></div>
                  </div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Location (Optional)</label><input type="text" value={newEdu?.location || ''} onChange={e => setNewEdu({...newEdu, location: e.target.value})} placeholder="e.g. Haridwar, India" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Description (Optional)</label><textarea rows="3" value={newEdu?.description || ''} onChange={e => setNewEdu({...newEdu, description: e.target.value})} placeholder="Any additional details..." className={`${inputClass} resize-none`}></textarea></div>
                  <button type="submit" className={buttonClass}>{newEdu._id ? 'Update Education' : 'Publish Education'}</button>
                </form>
              </div>

              <div className="flex-1.5 min-w-[300px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Live Education ({education?.length || 0})</h3>
                {education?.map((edu, idx) => {
                  if(!edu) return null;
                  return (
                  <div key={edu._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[var(--text-main)] m-0">{edu.degree || 'Unknown'}</h3>
                      <span className="text-[var(--text-dim)] text-sm">{edu.duration}</span>
                    </div>
                    <p className="text-[var(--accent)] text-lg m-0 mb-1">{edu.institution}</p>
                    {edu.location && <p className="text-[var(--text-dim)] text-sm m-0 mb-1">{edu.location}</p>}
                    {edu.score && <p className="text-[var(--text-dim)] text-sm m-0 mb-3">Score: {edu.score}</p>}
                    <div className="absolute top-3 right-4 flex gap-2">
                      <button onClick={() => editEdu(edu)} className="px-3 py-1.5 text-xs bg-transparent text-[var(--accent)] border border-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors">Edit</button>
                      <button onClick={() => deleteEdu(edu._id)} className="px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'experience' && hasPerm('skills') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manage Timeline & Experience</h1>
            <p className="text-[var(--text-dim)] mb-8">Add milestones, work experience, and educational background here.</p>

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[300px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">{newExp._id ? 'Update experience' : 'Add experience'}</h3>
                <form onSubmit={handleAddExp} className="flex flex-col gap-4">
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Time/Duration</label><input type="text" required value={newExp?.duration || ''} onChange={e => setNewExp({...newExp, duration: e.target.value})} placeholder="e.g. 2022 - Present" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Role/Title</label><input type="text" required value={newExp?.role || ''} onChange={e => setNewExp({...newExp, role: e.target.value})} placeholder="e.g. Full Stack Developer" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Company/Client</label><input type="text" required value={newExp?.company || ''} onChange={e => setNewExp({...newExp, company: e.target.value})} placeholder="e.g. TechCorp or Freelance" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Description</label><textarea rows="4" required value={newExp?.description || ''} onChange={e => setNewExp({...newExp, description: e.target.value})} placeholder="What did you do?" className={`${inputClass} resize-none`}></textarea></div>
                  <button type="submit" className={buttonClass}>{newExp._id ? 'Update Experience' : 'Add to Timeline'}</button>
                </form>
              </div>

              <div className="flex-1.5 min-w-[300px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Live Timeline Records ({experiences?.length || 0})</h3>
                {experiences?.length === 0 ? <p className="text-[var(--text-dim)]">No experience added yet.</p> : null}
                {experiences?.map((exp, idx) => {
                  if(!exp) return null;
                  return (
                  <div key={exp._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <div className="inline-block px-3 py-1 bg-[var(--signal)]/10 text-[var(--accent)] rounded-full text-xs font-bold mb-3">
                      {exp.duration}
                    </div>
                    <h3 className="text-[var(--text-main)] m-0 mb-1">{exp.role}</h3>
                    <h4 className="text-[var(--text-dim)] text-sm m-0 mb-3">@ {exp.company}</h4>
                    <p className="text-[var(--text-dim)] text-sm m-0 white-space-pre-wrap">{exp.description}</p>
                    <div className="absolute top-3 right-4 flex gap-2">
                      <button onClick={() => editExp(exp)} className="px-3 py-1.5 text-xs bg-transparent text-[var(--accent)] border border-[var(--accent)] rounded hover:bg-[var(--accent)]/10 transition-colors">Edit</button>
                      <button onClick={() => deleteExp(exp._id)} className="px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'projects' && hasPerm('projects') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Client Projects</h1>
            <p className="text-[var(--text-dim)] mb-8">
              One place for every project — paid automatically through Razorpay/PayPal or manually
              through UPI/QR. Message clients, reissue access, update progress and delete records.
            </p>

            {(portalStatus || qrStatus) && (
              <div className="p-4 bg-[var(--signal)]/10 text-[var(--accent)] rounded-lg mb-6 border border-[var(--accent)]">
                {portalStatus || qrStatus}
              </div>
            )}

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div ref={formRef} className="flex-1 min-w-[320px] scroll-mt-24" style={{ ...cmsCardStyle }}>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="m-0 text-[var(--accent)]">
                    {editingProject ? `Updating: ${newProject.projectTitle || 'Client Project'}` : 'Add / update client project'}
                  </h3>
                  {editingProject && (
                    <button type="button" onClick={cancelProjectEdit} className="rounded border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-main)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      Cancel Edit
                    </button>
                  )}
                </div>
                <form onSubmit={handleAddProject} className="flex flex-col gap-4">
                  <input type="text" required value={newProject.clientName} onChange={(e) => setNewProject({ ...newProject, clientName: e.target.value })} placeholder="Client Name" className={inputClass} />
                  <input type="email" required value={newProject.clientEmail} onChange={(e) => setNewProject({ ...newProject, clientEmail: e.target.value })} placeholder="Client Email (For Login)" className={inputClass} disabled={Boolean(editingProject)} />
                  <input type="text" required value={newProject.projectTitle} onChange={(e) => setNewProject({ ...newProject, projectTitle: e.target.value })} placeholder="Project Title" className={inputClass} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Project type
                      <input type="text" value={newProject.projectType} onChange={(e) => setNewProject({ ...newProject, projectType: e.target.value })} placeholder="e.g. Full-Stack Web Application" className={`${inputClass} mt-2`} />
                    </label>
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Estimated days
                      <input type="number" min="1" max="730" value={newProject.estimatedDays} onChange={(e) => setNewProject({ ...newProject, estimatedDays: e.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                  </div>

                  {hasPerm('payments') && <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Total Valuation (₹)
                      <input type="number" min="0" step="0.01" value={newProject.totalCost} onChange={(e) => setNewProject({ ...newProject, totalCost: e.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Amount Paid So Far (₹)
                      <input type="number" min="0" step="0.01" value={newProject.amountPaid} onChange={(e) => setNewProject({ ...newProject, amountPaid: e.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                  </div>}

                  {hasPerm('payments') && <div className="border-y border-[var(--rule)] py-3 text-sm text-[var(--text-dim)]">
                    <p className="m-0 flex flex-wrap justify-between gap-2">
                      <span>Remaining balance</span>
                      <strong className="font-medium text-[var(--text-main)]">{formatProjectCurrency(draftRemainingBalance)}</strong>
                    </p>
                    <p className="m-0 mt-2 flex flex-wrap justify-between gap-2">
                      <span>Payment status</span>
                      <strong className="font-medium text-[var(--text-main)]">{paymentStatusLabel(draftPaymentStatus)}</strong>
                    </p>
                    {draftAmountPaid > draftTotalCost && (
                      <p className="m-0 mt-3 text-xs text-red-500">
                        Amount paid cannot exceed the total valuation.
                      </p>
                    )}
                  </div>}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Progress (%)
                      <input type="number" min="0" max="100" value={newProject.progress} onChange={(e) => setNewProject({ ...newProject, progress: e.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                    <label className="block text-sm font-bold text-[var(--text-dim)]">Current phase
                      <input type="text" value={newProject.status} onChange={(e) => setNewProject({ ...newProject, status: e.target.value })} placeholder="e.g. UI Design" className={`${inputClass} mt-2`} />
                    </label>
                  </div>

                  <label className="block text-sm font-bold text-[var(--text-dim)]">Expected delivery
                    <input type="text" value={newProject.deliveryDate} onChange={(e) => setNewProject({ ...newProject, deliveryDate: e.target.value })} placeholder="e.g. 25 Oct 2026" className={`${inputClass} mt-2`} />
                  </label>
                  <label className="block text-sm font-bold text-[var(--text-dim)]">Live Staging / Preview URL (Optional)
                    <input
                      type="url"
                      value={newProject.previewUrl || ''}
                      onChange={(e) => setNewProject({ ...newProject, previewUrl: e.target.value })}
                      placeholder="https://client-staging.vercel.app"
                      className={`${inputClass} mt-2`}
                    />
                  </label>
                  <label className="block text-sm font-bold text-[var(--text-dim)]">Features & deliverables (one per line)
                    <textarea rows="4" value={newProject.featuresText} onChange={(e) => setNewProject({ ...newProject, featuresText: e.target.value })} className={`${inputClass} mt-2 resize-y`} />
                  </label>
                  <label className="block text-sm font-bold text-[var(--text-dim)]">Project notes
                    <textarea rows="3" value={newProject.notes} onChange={(e) => setNewProject({ ...newProject, notes: e.target.value })} className={`${inputClass} mt-2 resize-y`} />
                  </label>

                  <button type="submit" disabled={draftAmountPaid > draftTotalCost} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}>
                    {editingProject
                      ? 'Save Project Changes'
                      : hasPerm('client_access')
                        ? 'Create Project & Send Portal Access'
                        : 'Create Project'}
                  </button>
                </form>
              </div>

            </div>

            <section className="mt-14">
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="m-0 text-xl font-display text-[var(--text-main)]">
                  All client projects ({allClientProjectRecords.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    loadPortalUsers();
                    apiRequest('/api/client-projects', { headers: adminTokenHeaders() })
                      .then((projects) => setClientProjects(Array.isArray(projects) ? projects : []))
                      .catch((err) => setPortalStatus(err.message || 'Could not refresh legacy project records.'));
                  }}
                  disabled={portalUsersLoading}
                  className="rounded border border-[var(--rule)] px-4 py-2 text-xs font-mono-ui uppercase tracking-[0.14em] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                >
                  {portalUsersLoading ? 'Loading…' : 'Refresh projects'}
                </button>
              </div>

              <p className="mb-4 text-sm text-[var(--text-dim)]">
                Legacy tracker entries and portal projects are listed together. Editing a portal project updates its scope, billing, schedule, and client-facing details.
              </p>

              <input
                type="search"
                value={portalUserQuery}
                onChange={(e) => setPortalUserQuery(e.target.value)}
                placeholder="Filter by client name, email or project"
                className={`${inputClass} mb-4 max-w-[360px]`}
              />

              {portalUsersLoading && <p className="text-[var(--text-dim)]">Loading project records…</p>}
              {!portalUsersLoading && allClientProjectRecords.length === 0 && (
                <p className="text-[var(--text-dim)]">
                  No matching projects found.
                </p>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {allClientProjectRecords.map(({ source, id, user, project }) => (
                  <div
                    key={`${source}:${id}`}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="m-0 text-[var(--accent)]">
                        {project.projectTitle || project.serviceName || 'Untitled project'}
                      </h4>
                      <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
                        {source === 'legacy' ? 'Tracker record' : project.status || 'Portal project'}
                      </span>
                    </div>
                    <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
                      {project.clientName || user?.name || project.clientEmail || user?.email} · {project.clientEmail || user?.email}
                    </p>
                    <p className="m-0 mt-1 text-xs text-[var(--text-dim)]">
                      {project.status && source === 'legacy' ? `${project.status} · ` : ''}{paymentStatusLabel(project.paymentStatus)} · {money(project)} · {Number(project.progress || 0)}% complete
                    </p>
                    {(project.projectType || project.invoiceNumber || project.deliveryDate) && (
                      <p className="m-0 mt-2 text-xs text-[var(--text-dim)]">
                        {[project.projectType, project.invoiceNumber && `Invoice ${project.invoiceNumber}`, project.deliveryDate && `Due ${project.deliveryDate}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {Array.isArray(project.features) && project.features.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {project.features.slice(0, 5).map((feature) => (
                          <span key={`${id}:${feature}`} className="rounded border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-dim)]">{feature}</span>
                        ))}
                        {project.features.length > 5 && <span className="px-1 py-1 text-[10px] text-[var(--text-dim)]">+{project.features.length - 5} more</span>}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {source === 'legacy' ? (
                        <>
                          <button type="button" onClick={() => sendMessageToClient(id)} className="rounded bg-[#3399cc] px-3 py-2 text-xs font-bold text-[#fff] transition-opacity hover:opacity-90">Email & message client</button>
                          <button type="button" onClick={() => beginEditProject(project, source)} className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] transition-colors hover:bg-[var(--bg-main)]">Edit ✎</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => loadThread(project.id)} className="rounded bg-[#3399cc] px-3 py-2 text-xs font-bold text-[#fff] transition-opacity hover:opacity-90">Messages</button>
                          <button type="button" onClick={() => beginEditProject(project, source)} className="rounded border border-[var(--accent)] bg-transparent px-3 py-2 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10">Edit ✎</button>
                          {user?.role === 'client' && hasPerm('client_access') && (
                            <>
                              <button type="button" onClick={() => reissueCredentials(user.id)} className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] transition-colors hover:bg-[var(--bg-main)]">Re-issue access</button>
                              <button type="button" onClick={() => sendRoleReset(user)} className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] transition-colors hover:bg-[var(--bg-main)]">Send reset code</button>
                            </>
                          )}
                          {((['team', 'support'].includes(user?.role) && hasPerm('team'))
                            || (user?.role === 'superadmin' && adminRole === 'superadmin')) && (
                            <button type="button" onClick={() => sendRoleReset(user)} className="rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text-main)] transition-colors hover:bg-[var(--bg-main)]">Send reset code</button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteProject(id)}
                        className="rounded border border-[#ff4d4d] bg-transparent px-3 py-2 text-xs text-[#ff4d4d] transition-colors hover:bg-[#ff4d4d]/10"
                      >
                        Delete
                      </button>
                    </div>
                    {project.previewUrl && (
                      <div className="mt-4 border-t border-[var(--border)] pt-4">
                        <LivePreviewTab
                          previewUrl={project.previewUrl}
                          projectTitle={project.projectTitle || project.serviceName}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-14">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h3 className="m-0 mb-1 text-[var(--text-main)]">
                  {activeThread?.project?.projectTitle || 'Project conversation'}
                </h3>
                <p className="m-0 mb-4 text-sm text-[var(--text-dim)]">
                  {activeThread?.project
                    ? `${activeThread.project.clientName || ''} (${activeThread.project.clientEmail || ''})`
                    : 'Choose “Messages” on a project to read and reply.'}
                </p>

                {threadLoading && <p className="text-[var(--text-dim)]">Loading conversation…</p>}

                {!threadLoading && activeThread && (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                      <p className="m-0 text-sm text-[var(--text-dim)]">
                        Conversation with {activeThread?.project?.clientName || 'the client'}
                      </p>
                      <button
                        type="button"
                        onClick={closeThread}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--rule)] text-[var(--ink-soft)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                        aria-label="Close conversation"
                      >
                        ✕
                      </button>
                    </div>

                    <ul className="m-0 flex max-h-[380px] list-none flex-col gap-3 overflow-y-auto p-0">
                      {(activeThread.messages || []).length === 0 && (
                        <li className="text-sm text-[var(--text-dim)]">No messages yet.</li>
                      )}
                      {(activeThread.messages || []).map((msg) => (
                        <li
                          key={msg.id}
                          className={`rounded border p-3 ${msg.senderType === 'developer' ? 'border-[var(--accent)] bg-[var(--bg-main)]' : 'border-[var(--border)] bg-[var(--bg-main)]'}`}
                        >
                          <div className="flex justify-between gap-2">
                            <strong className="text-sm text-[var(--text-main)]">
                              {msg.senderType === 'developer' ? 'You' : msg.senderName || 'Client'}
                            </strong>
                            <span className="text-[10px] text-[var(--text-dim)]">
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {msg.subject && (
                            <p className="m-0 mt-1 text-sm text-[var(--text-main)]">{msg.subject}</p>
                          )}
                          <p className="m-0 mt-1 whitespace-pre-wrap text-sm text-[var(--text-dim)]">
                            {msg.body}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <form onSubmit={sendThreadReply} className="mt-4 flex flex-col gap-3">
                      <textarea
                        rows="3"
                        required
                        value={threadReply}
                        onChange={(e) => setThreadReply(e.target.value)}
                        placeholder="Write a reply to the client…"
                        className={inputClass}
                      />
                      <button type="submit" disabled={threadSending} className={buttonClass}>
                        {threadSending ? 'Sending…' : 'Send reply & email client'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'cms' && hasPerm('cms') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Global Website Editor</h1>
            <p className="text-[var(--text-dim)] mb-8">Change text, contact details, and policies across your website in one click.</p>

            {cmsStatus && <div className="p-4 bg-[var(--signal)]/10 text-[var(--accent)] rounded-lg mb-5 border border-[var(--accent)]">{cmsStatus}</div>}

            <form onSubmit={saveContent} className="flex flex-col gap-8 max-w-[800px]">
              <div className={cmsCardStyle}>
                <h3 className="text-[var(--accent)] m-0 mb-4">Home & about info</h3>
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Hero Title</label>
                <input type="text" value={homeData?.heroTitle || ''} onChange={e => setHomeData({...homeData, heroTitle: e.target.value})} className={inputClass} />
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">Hero Subtitle (used only when no roles are set)</label>
                <input type="text" value={homeData?.heroSubtitle || ''} onChange={e => setHomeData({...homeData, heroSubtitle: e.target.value})} className={inputClass} />
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">Roles / Titles</label>
                <p className="m-0 mb-3 text-xs text-[var(--text-dim)]">These rotate through the home hero and appear under “Currently” and “Disciplines”. Add, edit or remove any role.</p>
                {(homeData.roles || []).map((role, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={role}
                      onChange={e => {
                        const nextRoles = [...(homeData.roles || [])];
                        nextRoles[idx] = e.target.value;
                        setHomeData({ ...homeData, roles: nextRoles });
                      }}
                      placeholder="e.g. Full-Stack Web Developer"
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                    <button
                      type="button"
                      onClick={() => setHomeData({ ...homeData, roles: (homeData.roles || []).filter((_, i) => i !== idx) })}
                      aria-label={`Delete role ${role || idx + 1}`}
                      className="shrink-0 flex h-[42px] w-[42px] items-center justify-center text-sm bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors"
                    >
                      X
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setHomeData({ ...homeData, roles: [...(homeData.roles || []), ''] })}
                  className="w-full sm:w-auto text-left text-sm text-[var(--accent)] border border-[var(--accent)] rounded px-4 py-2.5 hover:bg-[var(--accent)]/10 transition-colors"
                >
                  + Add role
                </button>
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">About Main Description</label>
                <textarea rows="4" value={aboutData?.description || ''} onChange={e => setAboutData({...aboutData, description: e.target.value})} className={`${inputClass} resize-none`}></textarea>
              </div>

              <div className={cmsCardStyle}>
                <h3 className="text-[var(--accent)] m-0 mb-4">Contact details & links</h3>
                {contactData.map((link, idx) => (
                  <div key={idx} className="flex gap-2 mb-3">
                    <input type="text" value={link.icon || ''} onChange={e => { const newLinks=[...contactData]; newLinks[idx].icon=e.target.value; setContactData(newLinks); }} placeholder="Emoji" className={`${inputClass} flex-0.5`} />
                    <input type="text" value={link.title || ''} onChange={e => { const newLinks=[...contactData]; newLinks[idx].title=e.target.value; setContactData(newLinks); }} placeholder="Link Title" className={`${inputClass} flex-1`} />
                    <input type="text" value={link.url || ''} onChange={e => { const newLinks=[...contactData]; newLinks[idx].url=e.target.value; setContactData(newLinks); }} placeholder="URL" className={`${inputClass} flex-2`} />
                    <button type="button" onClick={() => { const newLinks=[...contactData]; newLinks.splice(idx,1); setContactData(newLinks); }} className="px-2 py-1 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">X</button>
                  </div>
                ))}
                <button type="button" onClick={() => setContactData([...contactData, { title: '', url: '', icon: '' }])} className="text-left text-sm text-[var(--accent)] border border-[var(--accent)] rounded px-4 py-2 hover:bg-[var(--accent)]/10 transition-colors mt-2">+ Add Link</button>
              </div>

              <div className={cmsCardStyle}>
                <h3 className="text-[var(--accent)] m-0 mb-4">Legal policies</h3>
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Privacy Policy Text</label>
                <textarea rows="5" value={policyData?.privacy || ''} onChange={e => setPolicyData({...policyData, privacy: e.target.value})} placeholder="Enter full privacy policy..." className={`${inputClass} resize-vertical`}></textarea>

                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">Terms & Conditions</label>
                <textarea rows="5" value={policyData?.terms || ''} onChange={e => setPolicyData({...policyData, terms: e.target.value})} placeholder="Enter full terms and conditions..." className={`${inputClass} resize-vertical`}></textarea>

                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">Refund Policy</label>
                <textarea rows="5" value={policyData?.refund || ''} onChange={e => setPolicyData({...policyData, refund: e.target.value})} placeholder="Enter full refund policy..." className={`${inputClass} resize-vertical`}></textarea>
              </div>

              <button type="submit" className={`${buttonClass} px-6 py-3 text-base`}>Apply changes to website</button>
            </form>
          </motion.div>
        )}

        {activeTab === 'github' && hasPerm('cms') && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Manage GitHub Projects</h1>
            <p className="text-[var(--text-dim)] mb-8">Select which GitHub repositories should be displayed on your Home and Resume pages.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {githubProjects.length === 0 ? <p className="text-[var(--text-dim)]">Loading GitHub projects...</p> : null}
              {githubProjects.map(repo => {
                const isPinned = pinnedProjects.some(p => p.repoId === repo.id.toString());
                return (
                  <div key={repo.id} className={`p-5 rounded-lg border ${isPinned ? 'border-[#00f5a0]' : 'border-[var(--border)]'} relative`}>
                    <h3 className="text-[var(--text-main)] m-0 mb-2 text-transform:capitalize">{repo.name.replace(/-/g, ' ')}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-5 min-h-[40px]">{repo.description || "No description available."}</p>

                    <div className="flex justify-between items-center">
                      <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] text-sm no-underline">View Repo</a>

                      <button
                        onClick={() => toggleGitHubPin(repo)}
                        className={`px-3 py-2 rounded text-xs font-bold transition-all ${
                          isPinned
                            ? 'bg-[var(--accent)]/10 text-[#00f5a0] border border-[#00f5a0] hover:bg-[var(--accent)]/20'
                            : 'bg-transparent text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                        }`}
                      >
                        {isPinned ? 'Shown on website' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Security Settings</h1>
            <p className="text-[var(--text-dim)] mb-8">Update your own dashboard login password and 2FA PIN.</p>

            <div className="max-w-[500px]" style={{ ...cmsCardStyle }}>
              <form onSubmit={handleUpdateSecurity} className="flex flex-col gap-4">
                <input type="password" required placeholder="Current Password" value={securityData.oldPassword} onChange={e => setSecurityData({...securityData, oldPassword: e.target.value})} className={inputClass} />
                <div className="border-t border-[var(--border)] my-1"></div>
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Set New Security Details</label>
                <input type="password" placeholder="New Password" value={securityData.newPassword} onChange={e => setSecurityData({...securityData, newPassword: e.target.value})} className={inputClass} />
                <input type="text" placeholder="New 4-Digit PIN" maxLength="4" value={securityData.newPin} onChange={e => setSecurityData({...securityData, newPin: e.target.value})} className={inputClass} />
                <button type="submit" className="w-full px-4 py-2.5 bg-[#00f5a0] text-[#000] border-none rounded font-bold cursor-pointer hover:opacity-90 transition-opacity">Update Security Credentials</button>
              </form>
              {securityMsg && <p className={`mt-4 font-bold ${securityMsg.includes('Error') ? 'text-[#ff4d4d]' : 'text-[#00f5a0]'}`}>{securityMsg}</p>}
            </div>

            <div className="max-w-[500px] mt-6" style={{ ...cmsCardStyle }}>
              <h3 className="text-[var(--ink)] m-0 mb-2">Session control</h3>
              <p className="text-[var(--text-dim)] text-sm mb-4">
                Revokes every admin session on every device, including this browser. You will need to sign in again with your password and PIN.
              </p>
              <button
                type="button"
                onClick={handleLogoutAll}
                className="w-full px-4 py-2.5 bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded font-bold cursor-pointer transition-colors hover:bg-[#ff4d4d]/10"
              >
                Sign Out of All Devices
              </button>
              {logoutAllMsg && <p className="mt-4 font-bold text-[var(--text-dim)]">{logoutAllMsg}</p>}
            </div>
          </motion.div>
        )}

        {activeTab === 'team' && adminRole === 'superadmin' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Team Role Management</h1>
            <p className="text-[var(--text-dim)] mb-8">Add team members and assign specific permissions. They will receive an email with auto-generated credentials.</p>

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[320px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">Add / edit team member</h3>
                <form onSubmit={handleTeamSubmit} className="flex flex-col gap-4">
                  <input type="text" required value={newTeamMember?.name || ''} onChange={e => setNewTeamMember({...newTeamMember, name: e.target.value})} placeholder="Member Name" className={inputClass} />
                  <input type="email" required value={newTeamMember?.identifier || ''} onChange={e => setNewTeamMember({...newTeamMember, identifier: e.target.value})} placeholder="Email (Used for Login)" className={inputClass} />

                  <div className="p-4 bg-[var(--bg-main)] rounded-lg border border-[var(--border)]">
                    <label className="block m-0 mb-3 text-[var(--text-main)]">Assign Section Permissions:</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {TEAM_PERMISSIONS.map(({ id, label, hint }) => (
                        <label key={id} className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text-dim)]">
                          <input
                            type="checkbox"
                            checked={newTeamMember?.permissions?.includes(id) || false}
                            onChange={() => togglePermission(id)}
                            className="mt-1 cursor-pointer"
                          />
                          <span>
                            <span className="block text-[var(--text-main)]">{label}</span>
                            <span className="block text-xs text-[var(--text-dim)]">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setNewTeamMember(prev => ({ ...prev, permissions: TEAM_PERMISSIONS.map(p => p.id) }))}
                        className="rounded border border-[var(--accent)] px-3 py-1.5 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
                      >
                        Select all sections
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTeamMember(prev => ({ ...prev, permissions: [] }))}
                        className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-main)] transition-colors hover:bg-[var(--bg-main)]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="w-full px-4 py-2.5 bg-[#ff4d6d] text-[#000] border-none rounded font-bold cursor-pointer hover:opacity-90 transition-opacity">Grant Access & Email Credentials</button>
                </form>
              </div>

              <div className="flex-1.5 min-w-[320px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Active Team Members ({teamList?.length || 0})</h3>
                {teamList?.length === 0 ? <p className="text-[var(--text-dim)]">No team members added yet.</p> : null}

                {teamList?.map((member, idx) => {
                  if(!member) return null;
                  return (
                  <div key={member._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <h3 className="text-[var(--accent)] m-0 mb-1">{member.name}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">{member.identifier}</p>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {member.permissions?.length === 0 ? <span className="text-[#ff4d4d] text-xs">No Permissions Assigned</span> : null}
                      {member.permissions?.map(p => (
                        <span key={p} className="bg-[var(--signal)]/20 text-[#ff4d6d] px-2 py-1 rounded text-xs font-bold">
                          {p.toUpperCase()}
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => setNewTeamMember({ name: member.name, identifier: member.identifier, permissions: member.permissions })} className="px-3 py-1.5 text-xs bg-transparent text-[var(--text-main)] border border-[var(--border)] rounded hover:bg-[var(--bg-main)] transition-colors">Edit Perms</button>
                      <button onClick={() => deleteTeamMember(member._id)} className="px-3 py-1.5 text-xs bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded hover:bg-[#ff4d4d]/10 transition-colors">Revoke Access</button>
                    </div>
                  </div>
                )})}
              </div>

            </div>
          </motion.div>
        )}

        {selectedQrForApproval && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-config-title"
              className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-5 text-[var(--ink)] shadow-2xl sm:p-8"
            >
              <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--rule)] pb-5">
                <div>
                  <h2 id="project-config-title" className="font-display text-2xl">Configure Project &amp; Scope</h2>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    {selectedQrForApproval.clientName || 'Client'} · {selectedQrForApproval.email} · {selectedQrForApproval.currency} {Number(selectedQrForApproval.amount || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedQrForApproval(null)} disabled={projectApprovalLoading} aria-label="Close project scope dialog" className="rounded border border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink-soft)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)] disabled:opacity-50">Close</button>
              </div>

              <form onSubmit={submitProjectApproval} className="space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Project type
                    <select autoFocus required value={projectApprovalForm.projectType} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, projectType: event.target.value })} className={`${inputClass} mt-2 bg-[var(--paper)]`}>
                      {PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Estimated days to build
                    <input type="number" required min="1" max="730" step="1" value={projectApprovalForm.estimatedDays} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, estimatedDays: event.target.value })} className={`${inputClass} mt-2`} />
                    <span className="mt-2 block text-xs text-[var(--ink-soft)]">Target completion: {targetCompletionDate(projectApprovalForm.estimatedDays)}</span>
                  </label>
                </div>

                <fieldset className="border-t border-[var(--rule)] pt-5">
                  <legend className="px-1 text-sm font-semibold">Included features &amp; modules</legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {PROJECT_FEATURES.map((feature) => (
                      <label key={feature} className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--rule)] px-3 py-2.5 text-sm transition-colors hover:border-[var(--signal)]">
                        <input type="checkbox" checked={projectApprovalForm.features.includes(feature)} onChange={() => toggleApprovalFeature(feature)} className="mt-1 accent-[var(--signal)]" />
                        <span>{feature}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {projectApprovalForm.features.filter((feature) => !PROJECT_FEATURES.includes(feature)).map((feature) => (
                      <span key={feature} className="inline-flex items-center gap-2 rounded-full border border-[var(--signal)]/50 bg-[var(--signal)]/10 px-3 py-1 text-xs">
                        {feature}
                        <button type="button" onClick={() => toggleApprovalFeature(feature)} aria-label={`Remove ${feature}`} className="font-bold text-[var(--signal)]">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="text" value={projectApprovalForm.customFeature} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, customFeature: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') addCustomProjectFeature(event); }} placeholder="Add a custom feature module" className={inputClass} />
                    <button type="button" onClick={addCustomProjectFeature} className="shrink-0 rounded border border-[var(--rule)] px-4 py-2 text-sm transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]">Add module</button>
                  </div>
                </fieldset>

                <fieldset className="border-t border-[var(--rule)] pt-5">
                  <legend className="px-1 text-sm font-semibold">Financial sanity check</legend>
                  <div className="mt-3 grid gap-5 sm:grid-cols-3">
                    <label className="block text-sm font-medium">
                      Total valuation ({selectedQrForApproval.currency || 'INR'})
                      <input type="number" required min="0.01" step="0.01" value={projectApprovalForm.totalCost} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, totalCost: event.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                    <label className="block text-sm font-medium">
                      Advance paid ({selectedQrForApproval.currency || 'INR'})
                      <input type="number" required min="0" step="0.01" value={projectApprovalForm.amountPaid} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, amountPaid: event.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                    <label className="block text-sm font-medium">
                      Transaction reference / UTR
                      <input type="text" value={projectApprovalForm.transactionRef} onChange={(event) => setProjectApprovalForm({ ...projectApprovalForm, transactionRef: event.target.value })} className={`${inputClass} mt-2`} />
                    </label>
                  </div>
                  {Number(projectApprovalForm.amountPaid) > Number(projectApprovalForm.totalCost) && <p className="mt-3 text-sm text-red-700">Advance paid cannot exceed the total valuation.</p>}
                  <p className="mt-3 text-xs text-[var(--ink-soft)]">The advance must match the amount on this verified payment proof.</p>
                </fieldset>

                <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--rule)] pt-5">
                  <button type="button" onClick={() => setSelectedQrForApproval(null)} disabled={projectApprovalLoading} className="rounded border border-[var(--rule)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--ink)] disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={projectApprovalLoading || !Number.isInteger(Number(projectApprovalForm.estimatedDays)) || Number(projectApprovalForm.amountPaid) > Number(projectApprovalForm.totalCost)} className={`${buttonClass} disabled:cursor-wait disabled:opacity-50`}>
                    {projectApprovalLoading ? 'Approving & generating PDF…' : <>Approve Project &amp; Email Invoice <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-2 h-3.5 w-3.5" fill="none"><path d="M4 12 12 4M5 4h7v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

      </div>

      <style>{`
        .admin-sidebar-btn:hover {
          background: var(--bg-main) !important;
          color: var(--ink) !important;
        }
      `}</style>
      </div>
   );
};

export default Admin;


const SidebarBtn = ({ children, active, onClick, style }) => (
  <button onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: '15px', background: active ? 'var(--accent-glow)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-dim)', border: active ? '1px solid var(--accent)' : '1px solid transparent', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: active ? 'bold' : 'normal', fontSize: '15px', ...style }}>
    {children}
  </button>
);

const StatCard = ({ title, value, color }) => (
  <div style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-dim)', fontWeight: 'normal' }}>{title}</h4>
    <h2 style={{ margin: 0, color, fontSize: '30px' }}>{value}</h2>
  </div>
);

const inputClass =
  'w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

const TEAM_PERMISSIONS = [
  { id: 'messages', label: 'Messages', hint: 'Inbox, contact and payment messages' },
  { id: 'payments', label: 'Payments', hint: 'Verify or reject payment messages' },
  { id: 'projects', label: 'Client projects', hint: 'Projects, trackers and client threads' },
  { id: 'services', label: 'Services', hint: 'Service catalogue and pricing' },
  { id: 'reviews', label: 'Reviews', hint: 'Approve, pin, reply and delete reviews' },
  { id: 'skills', label: 'Skills & timeline', hint: 'Skills, experience and education' },
  { id: 'cms', label: 'Website content', hint: 'Site copy, policies and payment settings' },
  { id: 'team', label: 'Team access', hint: 'Manage team accounts and team reset codes' },
  { id: 'client_access', label: 'Client access', hint: 'Generate or reissue client credentials and reset codes' },
];
const cmsCardStyle = { background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border-color)' };
