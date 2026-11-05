import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import RefundRules from './RefundRules';
import { PageShell, buttonClass } from '../components/Editorial';
import { apiRequest, apiUrl } from '../lib/api';
import { SUPPORT_EMAIL } from '../lib/contact';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { QRCodeSVG } from 'qrcode.react';

const INR_PER_USD = Number(import.meta.env.VITE_INR_PER_USD) || 88;
const UPI_ID = String(import.meta.env.VITE_UPI_ID || '').trim();
const UPI_NAME = String(import.meta.env.VITE_UPI_NAME || '').trim();

const formatInr = (value) =>
  `\u20b9${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const inrToUsd = (value) => Math.max(0.01, Math.round((Number(value || 0) / INR_PER_USD) * 100) / 100);

const formatUsd = (value) =>
  `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const Payment = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const portalData = location.state || {};
  const preSelectedService = portalData.preSelectedService || '';
  const isRemainingPayment = portalData.isRemainingPayment || false;

  const [step, setStep] = useState(isRemainingPayment ? 2 : 1);
  const [verifyStatus, setVerifyStatus] = useState('');
  const [servicesList, setServicesList] = useState([]);

  const [paymentPercent, setPaymentPercent] = useState(100);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState('');
  const [verificationPending, setVerificationPending] = useState(false);

  const [clientDetails, setClientDetails] = useState({
    name: portalData.clientName || '',
    email: portalData.clientEmail || '',
    phone: portalData.clientPhone || '',
    service: portalData.service || preSelectedService || 'Full-Stack Web Development',
    projectId: portalData.projectId || null,
  });

  const [isVerifySubmitting, setIsVerifySubmitting] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(apiUrl('/api/services'));
        if (res.ok) {
          const data = await res.json();
          setServicesList(data);

          if (data && data.length > 0 && !preSelectedService && !isRemainingPayment) {
            setClientDetails((prev) => ({ ...prev, service: data[0].title }));
          }
        }
      } catch (err) {
        console.error('Failed to load dynamic services', err);
      }
    };
    fetchServices();
  }, [preSelectedService, isRemainingPayment]);

  const fieldClass =
    'w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

  const selectedSrvForMath = servicesList.find((s) => s.title === clientDetails.service);
  const baseTotal = selectedSrvForMath
    ? Number(String(selectedSrvForMath.price ?? '').replace(/[^0-9.]/g, '')) || 99
    : 99;

  const totalAmount = isRemainingPayment ? Number(portalData.remainingAmount || 0) : baseTotal;
  const amountToPay = isRemainingPayment
    ? Math.round(totalAmount)
    : Math.round((totalAmount * paymentPercent) / 100);
  const remainingAmount = isRemainingPayment
    ? 0
    : Math.max(totalAmount - amountToPay, 0);
  const upiPaymentUrl = UPI_ID && UPI_NAME && amountToPay > 0
    ? `upi://pay?${new URLSearchParams({
      pa: UPI_ID,
      pn: UPI_NAME,
      am: Number(amountToPay).toFixed(2),
      cu: 'INR',
    }).toString()}`
    : '';

  const serviceUsdPrice =
    Number(String(selectedSrvForMath?.priceUsd ?? '').replace(/[^0-9.]/g, '')) || 0;
  const hasServiceUsdPrice = serviceUsdPrice > 0 && baseTotal > 0;
  const toUsd = (inrAmount) =>
    hasServiceUsdPrice
      ? Math.max(0.01, Math.round(((inrAmount * serviceUsdPrice) / baseTotal) * 100) / 100)
      : inrToUsd(inrAmount);
  const amountToPayUsd = toUsd(amountToPay);
  const remainingAmountUsd = hasServiceUsdPrice
    ? Math.round(((remainingAmount * serviceUsdPrice) / baseTotal) * 100) / 100
    : inrToUsd(remainingAmount);

  const handleProceedToPay = (e) => {
    e.preventDefault();

    const clientName = clientDetails.name.trim();
    const clientEmail = clientDetails.email.trim();
    const clientPhone = clientDetails.phone.trim();

    if (!clientName || !clientEmail || !clientPhone) {
      alert('Error: All fields in Step 1 are mandatory!');
      return;
    }
    if (!clientEmail.includes('@') || !clientEmail.includes('.')) {
      alert('Error: Please enter a valid email address!');
      return;
    }
    if (clientPhone.length < 10) {
      alert('Error: Please enter a valid 10-digit mobile number!');
      return;
    }

    try {
      fetch(apiUrl('/api/alerts/abandoned-checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientName,
          email: clientEmail,
          serviceName: clientDetails.service,
          amount: amountToPay,
        }),
      });
    } catch {
      console.log('Silent abandoned-checkout alert failed.');
    }

    setClientDetails({
      ...clientDetails,
      name: clientName,
      email: clientEmail,
      phone: clientPhone,
    });
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleServiceChange = (service) => {
    setClientDetails((current) => ({ ...current, service }));
    setPaymentPercent(100);
  };

  const convertToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsDataURL(file);
      fileReader.onload = () => resolve(fileReader.result);
      fileReader.onerror = reject;
    });

  const handleVerifySubmit = async (e) => {
    e.preventDefault();

    const formElement = e.target;
    const formData = new FormData(formElement);
    const imageFile = formData.get('attachment');
    const transactionRef = String(formData.get('transaction_id') || '').trim();

    const clientName = String(clientDetails.name || '').trim();
    const amount = Number(amountToPay);

    if (!clientName.trim()) {
      setVerifyStatus('Please enter the client name.');
      return;
    }
    if (!transactionRef.trim()) {
      setVerifyStatus('Please enter the transaction ID / UTR.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setVerifyStatus('Please enter an amount greater than 0.');
      return;
    }
    if (isVerifySubmitting) return;
    setIsVerifySubmitting(true);
    setVerifyStatus('Reading your payment proof…');

    let screenshotUrl;
    if (imageFile && imageFile.size > 0) {
      if (imageFile.size > 3 * 1024 * 1024) {
        setVerifyStatus('Screenshot must be smaller than 3MB.');
        setIsVerifySubmitting(false);
        return;
      }
      try {
        screenshotUrl = await convertToBase64(imageFile);
      } catch {
        setVerifyStatus('Could not read the screenshot. Try another image.');
        setIsVerifySubmitting(false);
        return;
      }
    }

    try {
      await apiRequest('/api/qr/submit', {
        method: 'POST',
        body: {
          clientName,
          email: clientDetails.email,
          amount,
          transactionRef,
          screenshotUrl,
          notes: `Service: ${clientDetails.service}${
            clientDetails.phone ? ` | Phone: ${clientDetails.phone}` : ''
          }${isRemainingPayment ? ' | Remaining balance' : ''}`,
          serviceName: clientDetails.service,
          currency: 'INR',
        },
      });

      setVerifyStatus(
        'Payment proof submitted! We will verify within 1-2 hours and send your portal login credentials via email.'
      );
      formElement.reset();
    } catch (err) {
      setVerifyStatus(
        err.message || 'The payment proof could not be submitted. Please try again.'
      );
    } finally {
      setIsVerifySubmitting(false);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const waitForProvisioning = (message) => {
    setVerificationPending(true);
    setPaymentStatusMessage(message);
    window.setTimeout(() => {
      navigate('/portal', {
        state: { email: clientDetails.email, paymentSubmitted: true },
      });
    }, 6000);
  };

  const handleRazorpayPayment = async () => {
    setPaymentStatusMessage('Initializing secure payment...');

    const isScriptLoaded = await loadRazorpayScript();
    if (!isScriptLoaded) {
      setPaymentStatusMessage(
        'Failed to load Razorpay. Check your internet connection or adblocker.'
      );
      return;
    }

    const selectedSrv = servicesList.find((s) => s.title === clientDetails.service);

    const requestBody = {
      amount: amountToPay,
      totalAmount: totalAmount,
      currency: 'INR',
      serviceName: clientDetails.service,
      projectId: clientDetails.projectId,
      isRemainingPayment: isRemainingPayment,
                  name: clientDetails.name,
      email: clientDetails.email,
    };

    if (selectedSrv && selectedSrv._id && !isRemainingPayment) {
      requestBody.serviceId = selectedSrv._id;
    }

    try {
      const orderRes = await fetch(apiUrl('/api/payment/razorpay-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        setPaymentStatusMessage('');
        alert('Server error: ' + (orderData.message || orderData.error));
        return;
      }

      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        alert('Frontend VITE_RAZORPAY_KEY_ID is missing in .env');
        setPaymentStatusMessage('Payment setup incomplete.');
        return;
      }

      const options = {
        key: razorpayKey,
        amount: orderData.order.amount,
        currency: 'INR',
        name: 'Shivam Portfolio',
        description: isRemainingPayment
          ? `Remaining Balance: ${clientDetails.service}`
          : clientDetails.service,
        order_id: orderData.order.id,
        handler: async function (response) {
                                        setPaymentStatusMessage('Verifying your payment with Razorpay…');

          try {
            const verifyRes = await fetch(apiUrl('/api/payment/razorpay-verify'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response?.razorpay_order_id,
                razorpay_payment_id: response?.razorpay_payment_id,
                razorpay_signature: response?.razorpay_signature,
              }),
            });
            const data = await verifyRes.json().catch(() => ({}));

            if (!verifyRes.ok || !data.success) {
              setPaymentStatusMessage(
                data.message ||
                  `Payment received, but it could not be confirmed automatically. Contact support${SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ''} with your payment ID so we can provision your portal access.`
              );
              return;
            }

            waitForProvisioning(
              data.emailSent
                ? `Payment verified. Your portal login has been emailed to ${data.userEmail || clientDetails.email}.`
                : `Payment verified for ${data.userEmail || clientDetails.email}. The credentials email could not be sent — write to support${SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ''} and we will send your login manually.`
            );
          } catch (err) {
            setPaymentStatusMessage(
              `Payment received, but confirmation failed (${err.message}). Contact support${SUPPORT_EMAIL ? ` at ${SUPPORT_EMAIL}` : ''} with your payment ID.`
            );
          }
        },
        prefill: {
          name: clientDetails.name,
          email: clientDetails.email,
          contact: clientDetails.phone,
        },
        theme: { color: '#3399cc' },
        config: {
          display: {
            blocks: {
              upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
              card: { name: 'Pay via Card', instruments: [{ method: 'card' }] },
            },
            sequence: ['block.upi', 'block.card'],
            preferences: { show_default_blocks: true },
          },
        },
      };

      if (typeof window.Razorpay !== 'function') {
        setPaymentStatusMessage('Razorpay checkout unavailable.');
        return;
      }

      const rzp = new window.Razorpay(options);

      rzp.on('payment.failed', function (response) {
        console.error('Payment Failed:', response.error);
        setVerificationPending(false);
        alert('Payment failed: ' + response.error.description);
        setPaymentStatusMessage('');
      });

      rzp.open();
    } catch (err) {
      console.error('🔥 Frontend Razorpay Error:', err);
      setPaymentStatusMessage(`Error: ${err.message}`);
    }
  };

  return (
    <PageShell>
      <header className="border-b border-[var(--rule)] pb-8 pt-8 md:pb-10 md:pt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="eyebrow text-[var(--signal)]">Secure checkout</p>
          <p className="eyebrow text-[var(--ink-soft)]">
            {isRemainingPayment ? 'Balance payment' : `Step 0${step} of 02`}
          </p>
        </div>

        <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.92] tracking-[-0.02em] text-[var(--ink)]">
          {step === 1 ? 'Project details.' : 'Payment.'}
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-soft)]">
          {step === 1
            ? 'A few details first, so the payment and the project record match.'
            : 'Choose a payment method below. Every transaction is verified before portal access is issued.'}
        </p>
      </header>

      <AnimatePresence mode="wait">
        {step === 1 && !isRemainingPayment && (
          <motion.section
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="border-b border-[var(--rule)] py-10 md:py-14"
          >
            <p className="eyebrow text-[var(--ink-soft)]">01 — Project requirements</p>

            <form
              onSubmit={handleProceedToPay}
              className="mt-8 grid grid-cols-12 gap-6"
            >
              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                  Full name
                </span>
                <input
                  type="text"
                  required
                  className={fieldClass}
                  value={clientDetails.name}
                  onChange={(e) =>
                    setClientDetails({ ...clientDetails, name: e.target.value })
                  }
                  placeholder="Your name"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                  Email address
                </span>
                <input
                  type="email"
                  required
                  className={fieldClass}
                  value={clientDetails.email}
                  onChange={(e) =>
                    setClientDetails({ ...clientDetails, email: e.target.value })
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                  Mobile number
                </span>
                <input
                  type="tel"
                  required
                  className={fieldClass}
                  value={clientDetails.phone}
                  onChange={(e) =>
                    setClientDetails({ ...clientDetails, phone: e.target.value })
                  }
                  placeholder="+91 00000 00000"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                  Type of service
                </span>
                <select
                  required
                  className={`${fieldClass} cursor-pointer [&>option]:bg-[var(--paper)] [&>option]:text-[var(--ink)]`}
                  value={clientDetails.service}
                  onChange={(e) => handleServiceChange(e.target.value)}
                >
                  {servicesList.length > 0 ? (
                    servicesList.map((srv) => (
                      <option
                        key={srv._id || srv.id || srv.title}
                        value={srv.title}
                        className="bg-[var(--paper)] py-2 text-[var(--ink)]"
                      >
                        {srv.title} — {formatInr(Number(String(srv.price ?? '').replace(/[^0-9.]/g, '')) || 99)}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Full-Stack Web Development" className="bg-[var(--paper)] text-[var(--ink)]">
                        Full-Stack Web Development — {formatInr(99)}
                      </option>
                      <option value="AI/ML Integration" className="bg-[var(--paper)] text-[var(--ink)]">AI/ML Integration — {formatInr(99)}</option>
                    </>
                  )}
                  {preSelectedService &&
                    !servicesList.some((s) => s.title === preSelectedService) && (
                      <option value={preSelectedService} className="bg-[var(--paper)] text-[var(--ink)]">
                        {preSelectedService} — {formatInr(99)}
                      </option>
                    )}
                  <option value="Other Custom Service" className="bg-[var(--paper)] text-[var(--ink)]">
                    Other Custom Service — {formatInr(99)}
                  </option>
                </select>
              </label>

              <div className="col-span-12 mt-2">
                <button type="submit" className={buttonClass}>
                  Continue to payment 
                </button>
              </div>
            </form>
          </motion.section>
        )}

        {step === 2 && (
          <motion.section
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="py-10 md:py-14"
          >
            {!isRemainingPayment && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--signal)]"
              >
                ← Edit details
              </button>
            )}

            {verificationPending && (
              <div className="mt-6 border border-[var(--rule)] bg-[var(--paper-2)] p-6">
                <p className="eyebrow text-[var(--signal)]">Payment received</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink)]">
                  {paymentStatusMessage}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
                  We verify the payment on the server and email your portal password to{' '}
                  <strong className="font-medium text-[var(--ink)]">
                    {clientDetails.email || 'your address'}
                  </strong>
                  . You will be taken to the portal sign-in shortly.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    navigate('/portal', {
                      state: { email: clientDetails.email, paymentSubmitted: true },
                    })
                  }
                  className={`${buttonClass} mt-4`}
                >
                  Go to portal sign-in
                </button>
              </div>
            )}

            <div className="mt-8 grid grid-cols-12 gap-x-10 gap-y-12">
              <div className="col-span-12 lg:col-span-7">
                <p className="eyebrow text-[var(--ink-soft)]">02 — Amount</p>
                <h2 className="mt-3 font-display text-3xl leading-tight text-[var(--ink)]">
                  {clientDetails.service}
                </h2>

                <div className="mt-6 border-y border-[var(--rule)] py-6">
                  {isRemainingPayment ? (
                    <>
                      <p className="text-sm leading-7 text-[var(--ink-soft)]">
                        You are clearing the remaining balance on this project.
                      </p>
                      <p className="mt-4 font-display text-[clamp(2.4rem,6vw,4rem)] leading-none text-[var(--signal)]">
                        {formatInr(amountToPay)}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <p className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-none text-[var(--signal)]">
                          {formatInr(amountToPay)}
                        </p>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {paymentPercent}% of {formatInr(totalAmount)}
                        </p>
                      </div>

                      <label className="mt-6 block">
                        <span className="mb-3 flex items-baseline justify-between font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          <span>Payment now</span>
                          <span>Minimum 40%</span>
                        </span>
                        <input
                          type="range"
                          min="40"
                          max="100"
                          step="1"
                          value={paymentPercent}
                          onChange={(e) => setPaymentPercent(Number(e.target.value))}
                          className="w-full cursor-pointer accent-[var(--signal)]"
                        />
                      </label>

                      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-t border-[var(--rule)] pt-4 text-sm">
                        <span className="text-[var(--ink-soft)]">
                          Remaining after this payment
                        </span>
                        <strong className="font-medium text-[var(--ink)]">
                          {formatInr(remainingAmount)}
                        </strong>
                      </div>
                    </>
                  )}
                </div>

                {paymentStatusMessage && !verificationPending && (
                  <p className="mt-6 border-l-2 border-[var(--signal)] pl-3 text-sm leading-6 text-[var(--signal)]">
                    {paymentStatusMessage}
                  </p>
                )}

                <div className="mt-8 border border-[var(--rule)] p-6">
                  <p className="eyebrow text-[var(--ink-soft)]">UPI / QR</p>
                  <div className="mt-4 flex flex-wrap items-center gap-6">
                    {upiPaymentUrl ? (
                      <div className="border border-[var(--rule)] bg-white p-3">
                        <QRCodeSVG
                          value={upiPaymentUrl}
                          size={160}
                          level="M"
                          includeMargin
                          aria-label={`UPI payment QR for ${formatInr(amountToPay)}`}
                        />
                      </div>
                    ) : (
                      <div className="flex h-40 w-40 items-center justify-center border border-[var(--rule)] p-4 text-center text-xs leading-5 text-[var(--ink-soft)]">
                        UPI QR is unavailable. Please use another payment method.
                      </div>
                    )}
                    <div>
                      <p className="font-mono-ui text-sm tracking-[0.04em] text-[var(--ink)]">
                        {UPI_ID || 'UPI ID not configured'}
                      </p>
                      <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        {UPI_NAME || 'UPI payee not configured'}
                      </p>
                      {upiPaymentUrl && (
                        <a
                          href={upiPaymentUrl}
                          className="mt-4 inline-flex items-center gap-2 border-b border-[var(--ink)] pb-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                        >
                          Pay via UPI app
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="border border-[var(--rule)] p-6">
                    <p className="eyebrow text-[var(--ink-soft)]">Cards / netbanking</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                      Secured by Razorpay. UPI and cards supported.
                    </p>
                    <button
                      type="button"
                      onClick={handleRazorpayPayment}
                      disabled={verificationPending}
                      className={`${buttonClass} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {verificationPending ? 'Verifying payment…' : 'Pay with Razorpay'}
                    </button>
                  </div>

                  <div className="border border-[var(--rule)] p-6">
                    <p className="eyebrow text-[var(--ink-soft)]">International</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                      Pay in USD through PayPal.
                    </p>
                    <p className="mt-3 font-mono-ui text-base tracking-[0.04em] text-[var(--ink)]">
                      {formatUsd(amountToPayUsd)} USD
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                      {hasServiceUsdPrice
                        ? `Listed at $${formatUsd(serviceUsdPrice)} USD · ${formatInr(amountToPay)} equivalent`
                        : `${formatInr(amountToPay)} at 1 USD = ${INR_PER_USD} INR`}
                      {!isRemainingPayment && (
                        <>
                          {' '}· {formatUsd(remainingAmountUsd)} USD remains after this payment
                        </>
                      )}
                    </p>
                    <div className="mt-4">
                      <PayPalScriptProvider
                        options={{
                          'client-id': import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb',
                          currency: 'USD',
                        }}
                      >
                        <PayPalButtons
                          style={{ layout: 'horizontal', height: 40 }}
                          createOrder={(data, actions) => {
                            const paypalService = servicesList.find((service) => service.title === clientDetails.service);
                            return actions.order.create({
                              application_context: { shipping_preference: 'NO_SHIPPING' },
                              purchase_units: [
                                {
                                  description: clientDetails.service,
                                  custom_id: JSON.stringify({
                                    s: isRemainingPayment ? '' : paypalService?._id || '',
                                    r: isRemainingPayment ? 1 : 0,
                                    p: isRemainingPayment ? clientDetails.projectId || '' : '',
                                    n: paypalService ? '' : clientDetails.service === 'Other Custom Service' ? 'Other Custom Service' : '',
                                  }),
                                  amount: {
                                    currency_code: 'USD',
                                    value: amountToPayUsd.toFixed(2),
                                  },
                                },
                              ],
                            });
                          }}
                          onApprove={async (data) => {
                            setPaymentStatusMessage('Verifying and capturing your PayPal payment…');
                            try {
                              await apiRequest('/api/payment/paypal-verify', {
                                method: 'POST',
                                body: {
                                  orderID: data.orderID,
                                  serviceId: selectedSrvForMath?._id ?? null,
                                  projectId: clientDetails.projectId ?? portalData.projectId ?? null,
                                  serviceName: clientDetails.service,
                                  name: clientDetails.name,
                                  email: clientDetails.email,
                                  isRemainingPayment,
                                },
                              });
                                                                                          waitForProvisioning(
                                'Payment received. Verifying and preparing your portal access…'
                              );
                            } catch {
                              setVerificationPending(false);
                              setPaymentStatusMessage(
                                'PayPal capture failed. No charge was completed.'
                              );
                            }
                          }}
                        />
                      </PayPalScriptProvider>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-12 lg:col-span-5">
                <div className="border border-[var(--rule)] p-6">
                  <p className="eyebrow text-[var(--ink-soft)]">Already paid by UPI?</p>
                  <h2 className="mt-3 font-display text-2xl leading-tight text-[var(--ink)]">
                    Submit the transaction.
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    Upload the payment screenshot so the transfer can be confirmed and access
                    issued.
                  </p>

                  <form
                    onSubmit={handleVerifySubmit}
                    className="mt-5 flex flex-col gap-4"
                  >
                    <label className="block">
                      <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                        Client name
                      </span>
                      <input
                        type="text"
                        name="client_name"
                        value={clientDetails.name}
                        onChange={(e) => setClientDetails((current) => ({ ...current, name: e.target.value }))}
                        placeholder="e.g. Raghav Sharma"
                        required
                        className={fieldClass}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                        Amount to pay (INR)
                      </span>
                      <input
                        type="number"
                        name="amount"
                        min={amountToPay}
                        step="1.00"
                        value={amountToPay}
                        readOnly
                        required
                        className={`${fieldClass} cursor-not-allowed opacity-85`}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                        Transaction ID / UTR
                      </span>
                      <input
                        type="text"
                        name="transaction_id"
                        placeholder="e.g. 1234567890"
                        required
                        className={fieldClass}
                      />
                    </label>

                    <label className="block">
                      <span className="eyebrow mb-2 block text-[var(--ink-soft)]">
                        Screenshot — JPG or PNG, max 3MB
                      </span>
                      <input
                        type="file"
                        name="attachment"
                        accept="image/png, image/jpeg"
                        required
                        className={`${fieldClass} cursor-pointer file:mr-3 file:border-0 file:bg-[var(--ink)] file:px-3 file:py-1.5 file:font-mono-ui file:text-[10px] file:uppercase file:tracking-[0.14em] file:text-[var(--paper)]`}
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={isVerifySubmitting}
                      className={`${buttonClass} w-full disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {isVerifySubmitting ? 'Submitting…' : 'Submit details'}
                    </button>

                    {verifyStatus && (
                      <p
                        className={`border-l-2 pl-3 text-sm leading-6 ${
                          /error|rejected|failed|offline/i.test(verifyStatus)
                            ? 'border-[var(--signal)] text-[var(--signal)]'
                            : 'border-[var(--ink)] text-[var(--ink)]'
                        }`}
                      >
                        {verifyStatus}
                      </p>
                    )}
                  </form>
                </div>

                <div className="mt-8 border-t border-[var(--rule)] pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="eyebrow text-[var(--ink-soft)]">Cancellation & refund</p>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      Auto-synced policy
                    </p>
                  </div>
                  <div className="mt-4">
                    <RefundRules />
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </PageShell>
  );
};

export default Payment;
