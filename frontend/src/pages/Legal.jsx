import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import RefundRules from './RefundRules'; 

const Legal = () => {
  const [policyData, setPolicyData] = useState({ privacy: null, terms: null });
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  
  useEffect(() => {
    fetch("https://webport-5ru9.onrender.com/api/content")
      .then(res => res.json())
      .then(data => {
        if (data && data.policyData) {
          setPolicyData({
            privacy: data.policyData.privacy || null,
            terms: data.policyData.terms || null
          });
        }
      })
      .catch(err => console.error("Failed to fetch legal content:", err));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [mouseX, mouseY]);

  const cursorGlowX = useTransform(mouseX, (x) => `${x - 200}px`);
  const cursorGlowY = useTransform(mouseY, (y) => `${y - 200}px`);

  const sectionStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '40px',
    marginBottom: '40px',
    transformStyle: 'preserve-3d',
    transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
    position: 'relative',
    zIndex: 2
  };

  const headingStyle = {
    fontFamily: 'monospace',
    fontSize: '24px',
    color: 'var(--accent)',
    marginBottom: '20px',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '10px'
  };

  const textStyle = {
    color: 'var(--text-dim)',
    fontSize: '15px',
    lineHeight: '1.8',
    marginBottom: '15px',
    whiteSpace: 'pre-wrap'
  };

  const highlightStyle = {
    color: '#00b8ff', 
    fontWeight: 'bold'
  };

  return (
    <div style={{ 
      position: 'relative', 
      minHeight: '100vh', 
      padding: '120px 8vw 80px 8vw', 
      background: 'var(--bg-main)', 
      color: 'var(--text-main)', 
      overflow: 'hidden', 
      fontFamily: 'IBM Plex Sans, sans-serif',
      transition: 'background 0.3s ease, color 0.3s ease'
    }}>
      
      <div style={{
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        background: `radial-gradient(circle at center, var(--accent-glow) 0%, transparent 70%)`,
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <motion.div style={{
        position: 'fixed',
        width: '400px', height: '400px',
        borderRadius: '50%',
        background: `radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)`,
        pointerEvents: 'none',
        left: cursorGlowX, top: cursorGlowY,
        zIndex: 1,
      }} />

      <div style={{ position: 'relative', zIndex: 5, maxWidth: '900px', margin: '0 auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
          <motion.h1 
            initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            style={{ fontSize: 'clamp(35px, 5vw, 50px)', fontWeight: 'bold', margin: 0 }}
          >
            Legal <span style={{ color: 'var(--accent)' }}>Information</span>
          </motion.h1>

          <motion.a 
            href="/"
            whileHover={{ scale: 1.05, borderColor: 'var(--accent)', color: 'var(--accent)' }}
            style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-main)', textDecoration: 'none', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '6px', transition: '0.3s' }}
          >
            ← Back to Home
          </motion.a>
        </div>

       
        <motion.section 
          id="privacy"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          whileHover={{ y: -5, scale: 1.02, rotateX: 2, rotateY: -2, boxShadow: "0px 20px 50px var(--accent-glow)", borderColor: "var(--accent)" }}
          style={sectionStyle}
        >
          <h2 style={headingStyle}>// Privacy Policy</h2>
          
          {policyData.privacy ? (
            <div style={textStyle}>{policyData.privacy}</div>
          ) : (
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '15px', lineHeight: '1.8', marginBottom: '15px' }}>Your privacy is of the utmost importance. This policy outlines how your data is managed securely during our professional engagement.</p>
              <ul style={{ ...textStyle, marginLeft: '25px', whiteSpace: 'normal' }}>
                <li style={{ marginBottom: '10px' }}><strong style={{ color: 'var(--text-main)' }}>Information Collection:</strong> I strictly collect only the necessary details required for project execution, such as your name, email address, and project specifications, via secure forms or direct communication.</li>
                <li style={{ marginBottom: '10px' }}><strong style={{ color: 'var(--text-main)' }}>Utilization of Data:</strong> Your information is utilized exclusively to deliver the requested digital services and to maintain seamless project correspondence.</li>
                <li><strong style={{ color: 'var(--text-main)' }}>Data Confidentiality:</strong> Your project concepts, proprietary source code (if provided), and contact details will never be sold, traded, or disclosed to third parties without your explicit written consent.</li>
              </ul>
            </>
          )}
        </motion.section>

       
        <motion.section 
          id="terms"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
          whileHover={{ y: -5, scale: 1.02, rotateX: 2, rotateY: -2, boxShadow: "0px 20px 50px var(--accent-glow)", borderColor: "var(--accent)" }}
          style={sectionStyle}
        >
          <h2 style={headingStyle}>// Terms & Conditions</h2>
          
          {policyData.terms ? (
            <div style={textStyle}>{policyData.terms}</div>
          ) : (
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '15px', lineHeight: '1.8', marginBottom: '15px' }}>To ensure a seamless workflow and prevent any misunderstandings, the following terms govern all freelance projects:</p>
              <ul style={{ ...textStyle, marginLeft: '25px', whiteSpace: 'normal' }}>
                <li style={{ marginBottom: '10px' }}><strong style={{ color: 'var(--text-main)' }}>Comprehensive Scope of Work:</strong> All desired features and project requirements must be thoroughly documented prior to commencement. If additional features are requested after development begins (Scope Creep), they will be <span style={highlightStyle}>evaluated and billed as separate add-ons</span>.</li>
                <li style={{ marginBottom: '10px' }}><strong style={{ color: 'var(--text-main)' }}>Revisions & Iterations:</strong> You are entitled to <span style={highlightStyle}>up to three rounds of revisions</span> for minor design or development adjustments. Complete architectural redesigns or modifications extending beyond the original scope will incur supplementary charges.</li>
                <li style={{ marginBottom: '10px' }}><strong style={{ color: 'var(--text-main)' }}>Intellectual Property (IP) & Asset Transfer:</strong> I retain full legal ownership of all source code, design assets, and API configurations <span style={highlightStyle}>until the final invoice is cleared</span>. Upon successful receipt of the final payment, all agreed-upon IP rights, ownership, and credentials will be permanently transferred to you.</li>
                <li><strong style={{ color: 'var(--text-main)' }}>Communication Guidelines:</strong> Prompt feedback ensures project momentum. Should a client remain unresponsive for a period exceeding 14 calendar days without prior notification, the project will be officially paused, and a reinstatement fee may apply to resume development.</li>
              </ul>
            </>
          )}
        </motion.section>

        
        <motion.section 
          id="refund"
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
          whileHover={{ y: -5, scale: 1.02, rotateX: 2, rotateY: -2, boxShadow: "0px 20px 50px var(--accent-glow)", borderColor: "var(--accent)" }}
          style={sectionStyle}
        >
          <h2 style={headingStyle}>// Refund & Payment Directives</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '15px', lineHeight: '1.8', marginBottom: '15px' }}>A fair and transparent payment structure is established to protect both the client's financial investment and the developer's dedicated time.</p>
          
          <RefundRules fontSize="15px" />

        </motion.section>

      </div>
    </div>
  );
};

export default Legal;