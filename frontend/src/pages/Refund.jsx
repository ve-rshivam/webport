import LegalPage from '../components/LegalPage';
import RefundRules from './RefundRules';

const Refund = () => {
  return (
    <LegalPage
      index="08"
      label="Refunds"
      title="Refund policy."
      intro="A plain-language description of deposits, cancellations and final settlement."
      policyKey="refund"
    >
      <RefundRules />
    </LegalPage>
  );
};

export default Refund;
