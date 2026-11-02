import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PageShell, buttonClass } from '../components/Editorial';

const Admin = () => {

  const getSafePerms = () => {
    try {
      const perms = localStorage.getItem("adminPerms");
      return perms ? JSON.parse(perms) : [];
    } catch(e) { return []; }
  };


  const [authStep, setAuthStep] = useState(localStorage.getItem("adminToken") ? 2 : 0);
  const [loginData, setLoginData] = useState({ identifier: '', password: '' });
  const [backupPin, setBackupPin] = useState('');
  const [loginError, setLoginError] = useState('');



  const [adminRole, setAdminRole] = useState(localStorage.getItem("adminRole") || "team");
  const [adminPerms, setAdminPerms] = useState(getSafePerms());
  const [adminName, setAdminName] = useState(localStorage.getItem("adminName") || "");


  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);



  const [activeTab, setActiveTab] = useState('dashboard');


  const [inboxData, setInboxData] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [services, setServices] = useState([]);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
  const [education, setEducation] = useState([]);


  const [githubProjects, setGithubProjects] = useState([]);
  const [pinnedProjects, setPinnedProjects] = useState([]);


  const [newEdu, setNewEdu] = useState({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
  const [newExp, setNewExp] = useState({ duration: '', role: '', company: '', description: '' });
  const [newService, setNewService] = useState({ title: '', description: '', icon: '', price: '' });
  const [newSkill, setNewSkill] = useState({ name: '', description: '', icon: '', proficiency: 50, category: 'Tech' });


  const [teamList, setTeamList] = useState([]);
  const [newTeamMember, setNewTeamMember] = useState({ name: '', identifier: '', permissions: [] });

  const [newProject, setNewProject] = useState({
    clientName: '', clientEmail: '', projectTitle: '', trackingId: '',
    progress: 10, status: 'Started', paymentStatus: 'Pending', deliveryDate: '', notes: ''
  });


  const [cmsStatus, setCmsStatus] = useState('');
  const [homeData, setHomeData] = useState({ heroTitle: '', heroSubtitle: '' });
  const [aboutData, setAboutData] = useState({ description: '' });
  const [contactData, setContactData] = useState([]);
  const [policyData, setPolicyData] = useState({ privacy: '', terms: '', refund: '' });


  const [securityData, setSecurityData] = useState({ oldPassword: '', newPassword: '', newPin: '' });
  const [securityMsg, setSecurityMsg] = useState('');

  const hasPerm = (perm) => adminRole === 'superadmin' || adminPerms.includes(perm);


  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const headers = { "Authorization": `Bearer ${token}` };


      const srvRes = await fetch("https://webport-5ru9.onrender.com/api/services");
      if(srvRes.ok) setServices(await srvRes.json());

      const skillRes = await fetch("https://webport-5ru9.onrender.com/api/resume-data");
      if(skillRes.ok) {
        const skillData = await skillRes.json();
        setSkills(skillData.skills || []);
        setEducation(skillData.education || []);
        setExperiences(skillData.experiences || []);
      }


      if (hasPerm('messages') || hasPerm('payments')) {
        const msgRes = await fetch("https://webport-5ru9.onrender.com/api/messages", { headers });
        if(msgRes.ok) setInboxData(await msgRes.json());
      }

      if (hasPerm('reviews')) {
        const revRes = await fetch("https://webport-5ru9.onrender.com/api/reviews");
        if(revRes.ok) setReviews(await revRes.json());
      }

      if (hasPerm('projects') || hasPerm('payments')) {
        const projRes = await fetch("https://webport-5ru9.onrender.com/api/client-projects", { headers });
        if(projRes.ok) setClientProjects(await projRes.json());
      }

      if (hasPerm('cms')) {
        const contentRes = await fetch("https://webport-5ru9.onrender.com/api/content");
        if(contentRes.ok) {
          const content = await contentRes.json();
          setHomeData(content.homeData || {});
          setAboutData(content.aboutData || {});
          setContactData(Array.isArray(content.contactData) ? content.contactData : []);
          setPolicyData(content.policyData || {});
        }

        const pinRes = await fetch("https://webport-5ru9.onrender.com/api/pinned-projects");
        if (pinRes.ok) setPinnedProjects(await pinRes.json());

        const githubUser = "ve-rshivam";
        const ghRes = await fetch(`https://api.github.com/users/${githubUser}/repos?sort=updated&per_page=100`);
        if (ghRes.ok) setGithubProjects(await ghRes.json());
      }

      if (adminRole === 'superadmin') {
        const teamRes = await fetch("https://webport-5ru9.onrender.com/api/admin/team", { headers });
        if(teamRes.ok) setTeamList(await teamRes.json());
      }

    } catch (err) { console.error("Fetch Data Error:", err); }
  };

  useEffect(() => {
    if (authStep === 2) fetchDashboardData();
  }, [authStep, adminRole]);


  const deleteInboxItem = async (id) => {
    if (window.confirm("Delete this permanently?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/messages/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
        fetchDashboardData();
      } catch(err) { alert("Failed to delete"); }
    }
  };

  const saveContent = async (e) => {
    e.preventDefault();
    setCmsStatus("Saving changes to database...");
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/content/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ homeData, aboutData, contactData, policyData })
      });
      const data = await res.json();
      if (data.success) setCmsStatus("Changes are now live on the website.");
    } catch (err) { setCmsStatus("Error connecting to database."); }
  };

  const toggleGitHubPin = async (repo) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/pinned-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          repoId: repo.id.toString(),
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchDashboardData();
      }
    } catch (err) {
      alert("Failed to update project visibility.");
    }
  };

  const togglePinReview = async (id) => {
    try {
      const token = localStorage.getItem("adminToken");
      await fetch(`https://webport-5ru9.onrender.com/api/reviews/${id}/pin`, {
        method: 'PUT', headers: { "Authorization": `Bearer ${token}` }
      });
      fetchDashboardData();
    } catch(err) { console.log(err); }
  };

  const deleteReview = async (id) => {
    if(window.confirm("Delete this review forever?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/reviews/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
        fetchDashboardData();
      } catch(err) { console.log(err); }
    }
  };

  const editReviewText = async (id, currentText) => {
    const newText = window.prompt("Edit Review Text:", currentText);
    if(newText && newText !== currentText) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/reviews/${id}/edit`, {
          method: 'PUT',
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ text: newText })
        });
        fetchDashboardData();
      } catch(err) { alert("Failed to edit review"); }
    }
  };

  const replyToReview = async (id, currentReply) => {
    const reply = window.prompt("Enter your public reply to this review:", currentReply || "");
    if(reply !== null) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/reviews/${id}/reply`, {
          method: 'PUT',
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ adminReply: reply })
        });
        fetchDashboardData();
      } catch(err) { alert("Failed to reply to review"); }
    }
  };


  const handleAddService = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const isEditing = !!newService._id;
      const url = isEditing ? `https://webport-5ru9.onrender.com/api/services/${newService._id}` : "https://webport-5ru9.onrender.com/api/services";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newService)
      });
      if(res.ok) {
        setNewService({ title: '', description: '', icon: '', price: '' });
        fetchDashboardData();
        alert(`Service ${isEditing ? 'Updated' : 'Added'} Successfully!`);
      }
    } catch(err) { alert("Failed to save service"); }
  };

  const deleteService = async (id) => {
    if(window.confirm("Delete this service?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/services/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
        fetchDashboardData();
      } catch(err) { alert("Failed to delete service"); }
    }
  };



  const handleAddEdu = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/education", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newEdu)
      });
      if(res.ok) {
        setNewEdu({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
        fetchDashboardData();
      } else alert("Failed to add education");
    } catch(err) { alert("Failed to add education"); }
  };

  const deleteEdu = async (id) => {
    if(window.confirm("Delete this education record?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/education/${id}`, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` } });
        fetchDashboardData();
      } catch(err) { alert("Failed to delete"); }
    }
  };


  const handleAddSkill = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const isEditing = !!newSkill._id;
      const url = isEditing ? `https://webport-5ru9.onrender.com/api/skill/${newSkill._id}` : "https://webport-5ru9.onrender.com/api/skill";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newSkill)
      });
      if(res.ok) {
        setNewSkill({ name: '', description: '', icon: '', proficiency: 50, category: 'Tech' });
        fetchDashboardData();
        alert(`Skill ${isEditing ? 'Updated' : 'Added'} Successfully!`);
      } else {
        alert("Failed to save skill");
      }
    } catch(err) { alert("Failed to save skill"); }
  };
  const deleteSkill = async (id) => {
    if (!id) {
      alert("Cannot delete: this skill has no ID.");
      return;
    }
    if (window.confirm("Delete this skill? It will be removed from the Skills page.")) {
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch(`https://webport-5ru9.onrender.com/api/skill/${id}`, {
          method: 'DELETE',
          headers: { "Authorization": `Bearer ${token}` }
        });


        if (res.ok) {
          alert("Skill deleted.");
          fetchDashboardData();
        } else {
          alert(`Delete failed. Status: ${res.status}`);
        }
      } catch (err) {
        alert("Server offline or network error.");
        console.error(err);
      }
    }
  };


  const handleAddExp = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newExp)
      });
      if(res.ok) {
        setNewExp({ duration: '', role: '', company: '', description: '' });
        fetchDashboardData();
        alert("Experience Added to Timeline!");
      } else {
        alert("Failed to add experience");
      }
    } catch(err) { alert("Failed to add experience"); }
  };

  const deleteExp = async (id) => {
    if(window.confirm("Delete this experience record from Timeline?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/experience/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
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
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/experience/" + (newExp._id || ''), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ duration: newExp.duration, role: newExp.role, company: newExp.company, description: newExp.description })
      });
      if (res.ok) {
        setNewExp({ duration: '', role: '', company: '', description: '' });
        fetchDashboardData();
        alert("Experience Updated!");
      } else {
        alert("Failed to update experience");
      }
    } catch (err) { alert("Failed to update experience"); }
  };

  const editEdu = (edu) => {
    setNewEdu({ degree: edu.degree, institution: edu.institution, duration: edu.duration, score: edu.score, description: edu.description, location: edu.location || '' });
    setActiveTab('education');
  };

  const updateEdu = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/education/" + (newEdu._id || ''), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ degree: newEdu.degree, institution: newEdu.institution, duration: newEdu.duration, score: newEdu.score, description: newEdu.description, location: newEdu.location || '' })
      });
      if (res.ok) {
        setNewEdu({ degree: '', institution: '', duration: '', score: '', description: '', location: '' });
        fetchDashboardData();
        alert("Education Updated!");
      } else {
        alert("Failed to update education");
      }
    } catch (err) { alert("Failed to update education"); }
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/client-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newProject)
      });
      if(res.ok) {
        setNewProject({ clientName: '', clientEmail: '', projectTitle: '', trackingId: '', progress: 10, status: 'Started', paymentStatus: 'Pending', deliveryDate: '', notes: '' });
        fetchDashboardData();
        alert("Project Updated Successfully!");
      }
    } catch(err) { alert("Failed to save project"); }
  };

  const deleteProject = async (id) => {
    if(window.confirm("Delete this client project tracking?")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/client-projects/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
        fetchDashboardData();
      } catch(err) { alert("Failed to delete project"); }
    }
  };

  const sendMessageToClient = async (projectId) => {
    const msg = window.prompt("Type your message to the client (This will be emailed to them and shown on their portal):");
    if(msg) {
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch(`https://webport-5ru9.onrender.com/api/client-projects/${projectId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ message: msg })
        });
        if(res.ok) {
          alert("Message sent and emailed to the client.");
          fetchDashboardData();
        } else {
          alert("Failed to send message.");
        }
      } catch(err) { alert("Server error."); }
    }
  };

  const verifyAndSendKey = async (projectId) => {
    if(window.confirm("Are you sure? This will generate a secure access key and email it to the client immediately.")) {
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch(`https://webport-5ru9.onrender.com/api/admin/verify-client-payment/${projectId}`, {
          method: "POST", headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();


        if (data.success) {
          alert("Payment verified and access key emailed.");
          fetchDashboardData();
        } else { alert("Error: " + data.message); }
      } catch (err) { alert("Server error during verification."); }
    }
  };

  const verifyPaymentFromInbox = async (msgId) => {
    const customStatus = window.prompt("Enter exact payment received (e.g., 'Advance ₹5000' or 'Fully Paid'):", "Fully Paid");
    if (customStatus === null) return;



    if(window.confirm(`Auto-create project with payment status: "${customStatus}"?`)) {
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch(`https://webport-5ru9.onrender.com/api/admin/approve-payment-message/${msgId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ paymentStatus: customStatus })
        });
        const data = await res.json();
        if (data.success) {
          alert("Success: " + data.message);
          fetchDashboardData();
        } else { alert("Error: " + data.message); }
      } catch (err) { alert("Server error during verification."); }
    }
  };

  const rejectPaymentFromInbox = async (msgId) => {
    const reason = window.prompt("Enter reason for rejection (This will be emailed to the client):", "Screenshot is unclear or Transaction ID does not match our bank records.");
    if (reason === null) return;

    if(window.confirm("Are you sure? This will delete the request and email the client that verification failed.")) {
      try {
        const token = localStorage.getItem("adminToken");
        const res = await fetch(`https://webport-5ru9.onrender.com/api/admin/reject-payment-message/${msgId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ reason: reason })
        });
        const data = await res.json();
        if (data.success) {
          alert("" + data.message);
          fetchDashboardData();
        } else { alert("Error: " + data.message); }
      } catch (err) { alert("Server error during rejection."); }
    }
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(newTeamMember)
      });
      const data = await res.json();
      if(data.success) {
        alert("" + data.message);
        setNewTeamMember({ name: '', identifier: '', permissions: [] });
        fetchDashboardData();
      } else { alert("Error: " + data.message); }
    } catch(err) { alert("Server Error"); }
  };

  const deleteTeamMember = async (id) => {
    if(window.confirm("Remove this member from the team? They will lose dashboard access immediately.")) {
      try {
        const token = localStorage.getItem("adminToken");
        await fetch(`https://webport-5ru9.onrender.com/api/admin/team/${id}`, {
          method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }
        });
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
      const token = localStorage.getItem("adminToken");
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/update-security", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(securityData)
      });
      const data = await res.json();
      if (data.success) {
        setSecurityMsg("" + data.message);
        setSecurityData({ oldPassword: '', newPassword: '', newPin: '' });
      } else {
        setSecurityMsg("Error: " + data.message);
      }
    } catch (err) {
      setSecurityMsg("Server Error.");
    }
  };

  const handleStep1Login = async (e) => {
    e.preventDefault();
    setLoginError("Verifying...");
    try {
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loginData)
      });
      const data = await res.json();
      if (data.success) {
        setAuthStep(1);
        setLoginError('');
      } else {
        setLoginError(data.message || "Invalid Credentials");
      }
    } catch (err) { setLoginError("Server offline!"); }
  };

  const handleStep2FA = async (e) => {
    e.preventDefault();
    setLoginError("Checking PIN...");
    try {
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/verify-2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginData.identifier, pin: backupPin })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminRole", data.role);
        localStorage.setItem("adminPerms", JSON.stringify(data.permissions || []));
        localStorage.setItem("adminName", data.name);


        setAdminRole(data.role);
        setAdminPerms(data.permissions || []);
        setAdminName(data.name);

        setAuthStep(2);
        setLoginError('');
      } else {
        setLoginError(data.message);
      }
    } catch (err) { setLoginError("Server offline!"); }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoginError("Sending OTP...");
    try {
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: resetIdentifier })
      });
      const data = await res.json();
      if (data.success) {
        setAuthStep(4);
        setLoginError('');
        if(data.devOtp) alert(`TESTING OTP: ${data.devOtp}`);
      } else {
        setLoginError(data.message);
      }
    } catch (err) { setLoginError("Server offline!"); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoginError("Resetting Password...");
    try {
      const res = await fetch("https://webport-5ru9.onrender.com/api/admin/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: resetIdentifier, otp: resetOtp, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setAuthStep(0);
        setLoginError('');
      } else {
        setLoginError(data.message);
      }
    } catch (err) { setLoginError("Server offline!"); }
  };

  const handleLogout = () => {
    localStorage.clear();
    setAuthStep(0);
    setLoginData({ identifier: '', password: '' });
    setBackupPin('');
  };


  const contactMessages = (inboxData || []).filter(msg => msg?.type === 'contact' || !msg?.type);
  const paymentMessages = (inboxData || []).filter(msg => msg?.type === 'payment');

  const sidebarItems = [
    { id: 'dashboard', label: 'Overview', perm: null },
    { id: 'messages', label: 'Messages', perm: 'messages' },
    { id: 'payments', label: 'Payments', perm: 'payments' },
    { id: 'projects', label: 'Client Projects', perm: 'projects' },
    { id: 'services', label: 'Services', perm: 'services' },
    { id: 'skills', label: 'Skills', perm: 'skills' },
    { id: 'experience', label: 'Timeline', perm: 'skills' },
    { id: 'education', label: 'Education', perm: 'skills' },
    { id: 'reviews', label: 'Reviews', perm: 'reviews' },
    { id: 'cms', label: 'Website Content', perm: 'cms' },
    { id: 'github', label: 'GitHub Projects', perm: 'cms' },
    { id: 'security', label: 'Security', perm: null },
    { id: 'team', label: 'Team Access', perm: null, superadminOnly: true },
  ];

  const visibleItems = sidebarItems.filter(item =>
    item.superadminOnly ? (adminRole === 'superadmin' || hasPerm('team')) : (item.perm === null || hasPerm(item.perm))
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
                      Continue →
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
                      ← Back to sign in
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
                      placeholder="New password"
                      required
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={authField}
                    />
                    <button type="submit" className={`${buttonClass} w-full`}>
                      Save and sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthStep(3)}
                      className="text-left font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
                    >
                      ← Resend code
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
    <div className="flex min-h-screen bg-[var(--bg-main)]">
      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar { display: none; }
          .admin-main { padding-left: 0; }
          .admin-mobile-header { display: flex; }
        }
        @media (min-width: 769px) {
          .admin-mobile-header { display: none; }
        }
      `}</style>

      {/* Mobile top bar */}
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

      <div className="admin-main flex-1 p-8 md:p-10 overflow-y-auto border-b border-[var(--rule)] bg-[var(--bg-main)]">

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl font-display text-[var(--ink)] mb-8">Dashboard Overview</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {(hasPerm('messages') || hasPerm('payments')) && <StatCard title="Unread Messages" value={contactMessages?.length || 0} color="var(--signal)" />}
              {hasPerm('payments') && <StatCard title="Payment Verifications" value={paymentMessages?.length || 0} color="#ffb84d" />}
              {hasPerm('projects') && <StatCard title="Active Projects" value={clientProjects?.length || 0} color="#9b59b6" />}
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
                  <div key={msg._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] border-l-4 border-l-[#ffb84d] relative">
                    <h3 className="text-[#ffb84d] m-0 mb-2">{msg.name}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">Email: {msg.email}</p>
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
                      <button onClick={() => verifyPaymentFromInbox(msg._id)} className="px-5 py-2.5 bg-[#00f5a0] text-[#000] border-none rounded font-bold cursor-pointer hover:opacity-90 transition-opacity">
                        Verify & send access key
                      </button>
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
                        <div className="mt-3 p-3 bg-[var(--accent)]/5 border-l-2 border-[var(--accent)] rounded" style={{ borderRadius: '0 8px 8px 0' }}>
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
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Price Description</label><input type="text" required value={newService?.price || ''} onChange={e => setNewService({...newService, price: e.target.value})} placeholder="e.g. Starting from $100" className={inputClass} /></div>
                  <div><label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Short Description</label><textarea rows="3" required value={newService?.description || ''} onChange={e => setNewService({...newService, description: e.target.value})} placeholder="Describe..." className={`${inputClass} resize-none`}></textarea></div>

                  <button type="submit" className={buttonClass}>{newService._id ? 'Update Service' : 'Publish Service'}</button>
                  {newService._id && (
                    <button type="button" onClick={() => setNewService({ title: '', description: '', icon: '', price: '' })} className="text-left text-sm text-[#ff4d4d] border border-[#ff4d4d] rounded px-4 py-2 hover:bg-[#ff4d4d]/10 transition-colors">
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
                    <p className="text-[var(--accent)] font-bold text-lg m-0">{srv.price}</p>

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
            <h1 className="text-3xl font-display text-[var(--ink)] mb-2">Client Project Tracking</h1>
            <p className="text-[var(--text-dim)] mb-8">Create or update projects. Send direct messages to clients from here.</p>

            <div className="flex flex-wrap gap-8" style={{ alignItems: 'flex-start' }}>
              <div className="flex-1 min-w-[320px]" style={{ ...cmsCardStyle }}>
                <h3 className="text-[var(--accent)] m-0 mb-6">Add / update client project</h3>
                <form onSubmit={handleAddProject} className="flex flex-col gap-4">
                  <input type="text" required value={newProject?.clientName || ''} onChange={e => setNewProject({...newProject, clientName: e.target.value})} placeholder="Client Name" className={inputClass} />
                  <input type="email" required value={newProject?.clientEmail || ''} onChange={e => setNewProject({...newProject, clientEmail: e.target.value})} placeholder="Client Email (For Login)" className={inputClass} disabled={newProject._id ? true : false} />
                  <input type="text" required value={newProject?.projectTitle || ''} onChange={e => setNewProject({...newProject, projectTitle: e.target.value})} placeholder="Project Title" className={inputClass} />

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Progress (%)</label>
                      <input type="number" min="0" max="100" value={newProject?.progress || 0} onChange={e => setNewProject({...newProject, progress: e.target.value})} className={inputClass} />
                    </div>
                    <div className="flex-1">
                      <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Current Phase</label>
                      <input type="text" value={newProject?.status || ''} onChange={e => setNewProject({...newProject, status: e.target.value})} placeholder="e.g. UI Design" className={inputClass} />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Payment Status</label>
                      <input type="text" value={newProject?.paymentStatus || ''} onChange={e => setNewProject({...newProject, paymentStatus: e.target.value})} placeholder="e.g. 50% Advance Paid" className={inputClass} />
                    </div>
                    <div className="flex-1">
                      <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold">Expected Delivery</label>
                      <input type="text" value={newProject?.deliveryDate || ''} onChange={e => setNewProject({...newProject, deliveryDate: e.target.value})} placeholder="e.g. 25 Oct 2024" className={inputClass} />
                    </div>
                  </div>

                  <button type="submit" className={buttonClass}>Save Project to Tracker</button>
                </form>
              </div>

              <div className="flex-1.5 min-w-[320px] flex flex-col gap-4">
                <h3 className="text-[var(--text-main)] m-0 mb-1">Active Projects ({clientProjects?.length || 0})</h3>
                {clientProjects?.length === 0 ? <p className="text-[var(--text-dim)]">No projects tracked yet.</p> : null}

                {clientProjects?.map((proj, idx) => {
                  if(!proj) return null;
                  return (
                  <div key={proj._id || idx} className="bg-[var(--bg-card)] p-5 rounded-lg border border-[var(--border)] relative">
                    <h3 className="text-[var(--accent)] m-0 mb-2">{proj.projectTitle}</h3>
                    <p className="text-[var(--text-dim)] text-sm m-0 mb-3">Client: {proj.clientName} | Email: {proj.clientEmail}</p>

                    <div className="flex justify-between bg-[var(--bg-main)] p-3 rounded-lg mb-3">
                      <span className="text-sm">Progress: <strong className="text-[var(--text-main)]">{proj.progress}%</strong></span>
                      <span className="text-sm">Phase: <strong className="text-[var(--text-main)]">{proj.status}</strong></span>
                      <span className="text-sm">Pay: <strong className={proj.paymentStatus === 'Pending' ? 'text-[#ffbd2e]' : 'text-[#00f5a0]'}>{proj.paymentStatus}</strong></span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={() => sendMessageToClient(proj._id)} className="px-3 py-2 bg-[#3399cc] text-[#fff] border-none rounded font-bold text-xs cursor-pointer hover:opacity-90 transition-opacity">
                        Email & message client
                      </button>
                      <button onClick={() => setNewProject(proj)} className="px-3 py-2 bg-transparent text-[var(--text-main)] border border-[var(--border)] rounded text-xs hover:bg-[var(--bg-main)] transition-colors">Edit Tracker</button>
                      <button onClick={() => deleteProject(proj._id)} className="px-3 py-2 bg-transparent text-[#ff4d4d] border border-[#ff4d4d] rounded text-xs hover:bg-[#ff4d4d]/10 transition-colors">Delete</button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
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
                <label className="block m-0 mb-2 text-[var(--text-dim)] text-sm font-bold mt-4">Hero Subtitle</label>
                <input type="text" value={homeData?.heroSubtitle || ''} onChange={e => setHomeData({...homeData, heroSubtitle: e.target.value})} className={inputClass} />
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
                      <a href={repo.html_url} target="_blank" rel="noreferrer" className="text-[var(--accent)] text-sm no-underline">View Repo ↗</a>

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
                    <div className="grid grid-cols-2 gap-2">
                      {['messages', 'payments', 'projects', 'services', 'reviews', 'skills', 'cms'].map(perm => (
                        <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer text-[var(--text-dim)]">
                          <input
                            type="checkbox"
                            checked={newTeamMember?.permissions?.includes(perm) || false}
                            onChange={() => togglePermission(perm)}
                            className="cursor-pointer"
                          />
                          {perm.charAt(0).toUpperCase() + perm.slice(1)}
                        </label>
                      ))}
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
  <div style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: `4px solid ${color}` }}>
    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-dim)', fontWeight: 'normal' }}>{title}</h4>
    <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '30px' }}>{value}</h2>
  </div>
);

const inputClass =
  'w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';
const cmsCardStyle = { background: 'var(--bg-card)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border-color)' };
