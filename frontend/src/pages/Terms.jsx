import LegalPage from '../components/LegalPage';

const Terms = () => {
  return (
    <LegalPage
      index="07"
      label="Terms"
      title="Terms and conditions."
      intro="The working agreement that keeps a freelance project predictable for both sides."
      policyKey="terms"
    >
      <div className="space-y-8">
        <p className="text-base leading-8 text-[var(--ink-soft)]">
          These terms govern all freelance projects. They exist to prevent misunderstandings, not
          to create friction.
        </p>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Scope of work</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            Features and requirements are documented before work begins. Additions requested during
            development are evaluated and billed as separate add-ons.
          </p>
        </section>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Revisions</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            Up to three rounds of revisions are included for minor design or development changes.
            Complete redesigns or work outside the agreed scope are charged separately.
          </p>
        </section>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Ownership and handover</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            I retain ownership of source code, design assets and API configurations until the final
            invoice is cleared. After the final payment, the agreed IP and credentials transfer to
            you.
          </p>
        </section>

        <section className="border-t border-[var(--rule)] pt-5">
          <h2 className="font-display text-2xl text-[var(--ink)]">Communication</h2>
          <p className="mt-2 text-base leading-8 text-[var(--ink-soft)]">
            Prompt feedback keeps a project moving. If a client is unresponsive for more than 14
            calendar days without notice, the project is paused and a reinstatement fee may apply.
          </p>
        </section>
      </div>
    </LegalPage>
  );
};

export default Terms;
