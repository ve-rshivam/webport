import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageShell, buttonClass } from '../components/Editorial';

const Resume = () => {
  const [pinnedProjects, setPinnedProjects] = useState([]);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [homeContent, setHomeContent] = useState({ heroTitle: 'Shivam Kumar' });
  const [loading, setLoading] = useState(true);

  const githubUser = "ve-rshivam";

  useEffect(() => {
    // 1. Fetch Pinned Projects (same as Home page — NOT all GitHub repos)
    fetch(`https://webport-5ru9.onrender.com/api/pinned-projects`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPinnedProjects(data);
      })
      .catch(err => console.error("Pinned Projects Fetch Error:", err));

    // 2. Fetch Skills, Experience, Education from backend
    fetch("https://webport-5ru9.onrender.com/api/resume-data")
      .then(res => res.json())
      .then(data => {
        setSkills(data.skills || []);
        setExperiences(data.experiences || []);
        setEducation(data.education || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Backend Fetch Error:", err);
        setLoading(false);
      });

     
    fetch("https://webport-5ru9.onrender.com/api/content")
      .then(res => res.json())
      .then(data => {
        if (data?.homeData?.heroTitle) {
           
          const title = data.homeData.heroTitle;
          const nameMatch = title.match(/I\s*(?:am|'m)\s+(.+)/i);
          setHomeContent({ heroTitle: nameMatch ? nameMatch[1].trim() : title });
        }
      })
      .catch(err => console.log("Content fetch error", err));
  }, []);

  const handleDownloadPDF = () => {
    window.print();
  };
 
  const groupSkillsByCategory = (skillsList) => {
    const groups = {};
    skillsList.forEach(skill => {
      const cat = skill.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(skill.name);
    });
    return groups;
  };

  const skillGroups = groupSkillsByCategory(skills);
 
  const s = {
     
    sectionTitle: {
      fontSize: '11.5pt',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      color: '#000',
      borderBottom: '1.5px solid #000',
      paddingBottom: '3px',
      marginBottom: '8px',
      marginTop: '14px',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
     
    entryRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: '5px',
    },
    entryTitle: {
      fontSize: '10.5pt',
      fontWeight: 'bold',
      color: '#000',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
    entrySubtitle: {
      fontSize: '10pt',
      fontStyle: 'italic',
      color: '#333',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
    entryDate: {
      fontSize: '10pt',
      color: '#333',
      fontStyle: 'italic',
      textAlign: 'right',
      fontFamily: "'Times New Roman', 'Georgia', serif",
      whiteSpace: 'nowrap',
    },
    entryLocation: {
      fontSize: '10pt',
      color: '#333',
      textAlign: 'right',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
    bulletList: {
      margin: '3px 0 8px 0',
      paddingLeft: '18px',
      listStyleType: 'disc',
      fontSize: '10pt',
      lineHeight: '1.45',
      color: '#222',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
    bulletItem: {
      marginBottom: '1px',
    },
    techTag: {
      fontSize: '10pt',
      fontStyle: 'italic',
      color: '#444',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
    skillLine: {
      fontSize: '10pt',
      color: '#222',
      lineHeight: '1.55',
      marginBottom: '2px',
      fontFamily: "'Times New Roman', 'Georgia', serif",
    },
  };

  return (
    <PageShell>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          * {
            transition: none !important;
            animation: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
          }

          body > *:not(#root) {
            display: none !important;
          }

          #root,
          #root div:not(#printable-resume):not(#printable-resume *) {
            background: transparent !important;
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            overflow: visible !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            display: block !important;
            position: static !important;
            transform: none !important;
            opacity: 1 !important;
          }

          nav, footer, header,
          .no-print,
          [style*="position: fixed"],
          [style*="position:fixed"] {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }

          #printable-resume {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 12mm 15mm !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
            color: #000 !important;
            overflow: visible !important;
            transform: none !important;
            opacity: 1 !important;
            font-family: 'Times New Roman', 'Georgia', serif !important;
          }

          #printable-resume * {
            position: static !important;
            background: transparent !important;
            overflow: visible !important;
            transform: none !important;
            opacity: 1 !important;
            color: #000 !important;
          }

          #printable-resume h1 {
            color: #000 !important;
          }

          #printable-resume a {
            text-decoration: none !important;
            color: #000 !important;
          }

          /* Force proper section border visibility */
          #printable-resume .resume-section-title {
            border-bottom: 1.5px solid #000 !important;
          }
        }
      `}</style>

      <header className="no-print border-b border-[var(--rule)] pb-8 pt-8 md:pb-10 md:pt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="eyebrow text-[var(--signal)]">Résumé</p>
          <p className="eyebrow text-[var(--ink-soft)]">A4 / print ready</p>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.02em] text-[var(--ink)]">
            The record.
          </h1>
          <button type="button" onClick={handleDownloadPDF} className={buttonClass}>
            Download PDF
          </button>
        </div>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-soft)]">
          Education, experience, selected projects and tools on a single sheet. Printing produces
          an A4 PDF.
        </p>
      </header>

      <div className="no-print flex justify-center py-10 md:py-14">
      <motion.div
        id="printable-resume"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          position: 'relative',
          zIndex: 5,
          width: '100%',
          maxWidth: '800px',
          background: '#ffffff',
          color: '#000000',
          padding: '35px 45px',
          border: '1px solid #d8d2c4',
          fontFamily: "'Times New Roman', 'Georgia', serif",
          lineHeight: '1.3',
        }}
      >

        <div style={{ textAlign: 'center', marginBottom: '5px' }}>
          <h1 style={{
            fontSize: '22pt',
            fontWeight: 'bold',
            margin: '0 0 6px 0',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: '#000',
            fontFamily: "'Times New Roman', 'Georgia', serif",
            fontVariant: 'small-caps',
          }}>
            {homeContent.heroTitle}
          </h1>
          <p style={{
            margin: 0,
            fontSize: '9.5pt',
            color: '#333',
            fontFamily: "'Times New Roman', 'Georgia', serif",
            lineHeight: '1.5',
          }}>
            getus.shivam@gmail.com{' | '}
            +91 81028 69061{' | '}
            <a href={`https://github.com/${githubUser}`} style={{ color: '#333', textDecoration: 'none' }}>
              github.com/{githubUser}
            </a>{' | '}
            <a href="https://linkedin.com/in/ve-rshivam" style={{ color: '#333', textDecoration: 'none' }}>
              LinkedIn
            </a>
          </p>
        </div>

        
        {education.length > 0 && (
          <div>
            <div className="resume-section-title" style={s.sectionTitle}>Education</div>
            {education.map((edu) => (
              <div key={edu._id} style={{ marginBottom: '6px' }}>
                <div style={s.entryRow}>
                  <span style={s.entryTitle}>{edu.institution}</span>
                  <span style={s.entryLocation}>{edu.location || ''}</span>
                </div>
                <div style={s.entryRow}>
                  <span style={s.entrySubtitle}>
                    {edu.degree}{edu.score ? ` (${edu.score})` : ''}
                  </span>
                  <span style={s.entryDate}>{edu.duration}</span>
                </div>
                {edu.description && (
                  <ul style={s.bulletList}>
                    <li style={s.bulletItem}>{edu.description}</li>
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

         
        {experiences.length > 0 && (
          <div>
            <div className="resume-section-title" style={s.sectionTitle}>Experience</div>
            {experiences.map((exp) => {
              
              const descLines = exp.description
                ? exp.description.split(/\n|•|●/).map(l => l.trim()).filter(Boolean)
                : [];
              return (
                <div key={exp._id} style={{ marginBottom: '6px' }}>
                  <div style={s.entryRow}>
                    <span style={s.entryTitle}>{exp.role}{exp.company ? `, ${exp.company}` : ''}</span>
                    <span style={s.entryDate}>{exp.duration}</span>
                  </div>
                  {descLines.length > 0 && (
                    <ul style={s.bulletList}>
                      {descLines.map((line, idx) => (
                        <li key={idx} style={s.bulletItem}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        
        {pinnedProjects.length > 0 && (
          <div>
            <div className="resume-section-title" style={s.sectionTitle}>Projects</div>
            {pinnedProjects.map((repo) => {
              
              const descLines = repo.description
                ? repo.description.split(/\n|•|●/).map(l => l.trim()).filter(Boolean)
                : ['Developed and deployed a modern web application.'];
              return (
                <div key={repo._id || repo.repoId} style={{ marginBottom: '6px' }}>
                  <div style={s.entryRow}>
                    <span>
                      <span style={s.entryTitle}>
                        {repo.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      {repo.techStack && (
                        <span style={s.techTag}>{' | '}{repo.techStack}</span>
                      )}
                    </span>
                    <span style={s.entryDate}>{repo.dateRange || ''}</span>
                  </div>
                  <ul style={s.bulletList}>
                    {descLines.map((line, idx) => (
                      <li key={idx} style={s.bulletItem}>{line}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

         
        {skills.length > 0 && (
          <div>
            <div className="resume-section-title" style={s.sectionTitle}>Technical Skills</div>
            <div style={{ marginTop: '4px' }}>
              {Object.keys(skillGroups).length > 1 ? (
                 
                Object.entries(skillGroups).map(([category, skillNames]) => (
                  <div key={category} style={s.skillLine}>
                    <strong>{category}</strong>: {skillNames.join(', ')}
                  </div>
                ))
              ) : (
                 
                <div style={s.skillLine}>
                  <strong>Skills</strong>: {skills.map(sk => sk.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#888',
            fontSize: '14px',
            fontFamily: 'Inter, Arial, sans-serif',
          }}>
            Loading resume data...
          </div>
        )}

        
        {!loading && education.length === 0 && experiences.length === 0 &&
          pinnedProjects.length === 0 && skills.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999',
              fontSize: '15px',
              fontFamily: 'Inter, Arial, sans-serif',
            }}>
              <p style={{ margin: 0 }}>No resume data found. Add sections from the Admin Panel.</p>
            </div>
          )}

      </motion.div>
      </div>
    </PageShell>
  );
};

export default Resume;