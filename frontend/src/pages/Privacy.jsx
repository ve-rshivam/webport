import LegalPage from '../components/LegalPage';

const Privacy = () => {
  return (
    <LegalPage
      index="06"
      label="Privacy"
      title="Privacy policy."
      intro="What I collect, why I collect it, and what never leaves the project."
      policyKey="privacy"
    >
      <div className="space-y-8">
        <p className="text-base leading-8 text-[var(--ink-soft)]">
          Your privacy matters. This policy explains how your data is handled during a professional
          engagement.
        </p>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Information collection</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            I collect only what a project needs: your name, email address and project
            specifications, shared through the contact form or direct correspondence.
          </p>
        </section>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">How the data is used</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            Your information is used to deliver the requested work and to keep project
            correspondence clear. It is not used for unrelated marketing.
          </p>
        </section>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Confidentiality</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            Project concepts, proprietary source code and contact details are never sold, traded or
            disclosed to third parties without your explicit written consent.
          </p>
        </section>
      </div>
    </LegalPage>
  );
};

export default Privacy;
