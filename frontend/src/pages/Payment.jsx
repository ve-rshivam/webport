import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import RefundRules from './RefundRules';
import { PageShell, buttonClass } from '../components/Editorial';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js"; 

const Payment = () => {
  const location = useLocation(); 
  const navigate = useNavigate();
  
  
  const portalData = location.state || {};
  const preSelectedService = portalData.preSelectedService || '';
  const isRemainingPayment = portalData.isRemainingPayment || false;

 
  const [step, setStep] = useState(isRemainingPayment ? 2 : 1);
  const [verifyStatus, setVerifyStatus] = useState("");
  const [servicesList, setServicesList] = useState([]); 
  
  
  const [paymentPercent, setPaymentPercent] = useState(100);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState(''); 
  
 
  const [clientDetails, setClientDetails] = useState({
    name: portalData.clientName || '', 
    email: portalData.clientEmail || '', 
    phone: portalData.clientPhone || '', 
    service: portalData.service || preSelectedService || 'Full-Stack Web Development',
    projectId: portalData.projectId || null
  });

  
  
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch("https://webport-5ru9.onrender.com/api/services");
        if (res.ok) {
          const data = await res.json();
          setServicesList(data);
          
          if (data && data.length > 0 && !preSelectedService && !isRemainingPayment) {
            setClientDetails(prev => ({ ...prev, service: data[0].title }));
          }
        }
      } catch (err) {
        console.error("Failed to load dynamic services", err);
      }
    };
    fetchServices();
  }, [preSelectedService, isRemainingPayment]);

 
  const fieldClass =
    'w-full border border-[var(--rule)] bg-transparent px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-soft)] focus:border-[var(--signal)]';

  const selectedSrvForMath = servicesList.find(s => s.title === clientDetails.service);
  const baseTotal = selectedSrvForMath ? parseInt(selectedSrvForMath.price.replace(/\D/g, "") || "100", 10) : 100;
  
 
  const totalAmount = isRemainingPayment ? portalData.remainingAmount : baseTotal;
  const amountToPay = isRemainingPayment ? totalAmount : Math.round((totalAmount * paymentPercent) / 100);
  const remainingAmount = isRemainingPayment ? 0 : (totalAmount - amountToPay);

  const handleProceedToPay = (e) => {
    e.preventDefault();

    const clientName = clientDetails.name.trim();
    const clientEmail = clientDetails.email.trim();
    const clientPhone = clientDetails.phone.trim();

    if (!clientName || !clientEmail || !clientPhone) {
      alert("Error: All fields in Step 1 are mandatory!");
      return;
    }
    if (!clientEmail.includes("@") || !clientEmail.includes(".")) {
      alert("Error: Please enter a valid email address!");
      return;
    }
    if (clientPhone.length < 10) {
      alert("Error: Please enter a valid 10-digit mobile number!");
      return;
    }

    try {
      fetch("https://webport-5ru9.onrender.com/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          message: `Checkout initiated for: ${clientDetails.service} (payment pending)`,
          type: 'contact'
        })
      });
    } catch {
      console.log("Silent lead capture failed.");
    }

    setClientDetails({ ...clientDetails, name: clientName, email: clientEmail, phone: clientPhone });
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault(); 
    setVerifyStatus("Processing data...");
    
    const formElement = e.target;
    const formData = new FormData(formElement);
    const imageFile = formData.get('attachment');
    
    const convertToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsDataURL(file);
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = (error) => reject(error);
      });
    };

    let base64Image = "";
    if (imageFile && imageFile.size > 0) {
      if (imageFile.size > 5 * 1024 * 1024) { 
        setVerifyStatus("Image size must be less than 5MB.");
        return; 
      }
      try {
        base64Image = await convertToBase64(imageFile);
        setVerifyStatus("Sending to server...");
      } catch {
        setVerifyStatus("Error: Failed to read image file.");
        return;
      }
    }

    const dataForDB = {
      name: clientDetails.name,
      email: clientDetails.email,
      phone: clientDetails.phone,
      transaction_id: formData.get('transaction_id'),
      message: `Service: ${clientDetails.service} | Transaction ID: ${formData.get('transaction_id')}`,
      type: 'payment',
      attachment: base64Image,
      
      projectId: clientDetails.projectId,
      isRemainingPayment: isRemainingPayment,
      amountPaid: amountToPay
    };

    try {
      const dbRes = await fetch("https://webport-5ru9.onrender.com/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataForDB)
      });

      if (dbRes.ok) {
        setVerifyStatus("Payment Proof Submitted & Admin Notified!");
        formElement.reset(); 
        setTimeout(() => {
          if(isRemainingPayment) {
            navigate('/portal');
          } else {
            setStep(1); 
            setVerifyStatus("");
            const firstService = servicesList.length > 0 ? servicesList[0].title : 'Full-Stack Web Development';
            setClientDetails({name: '', email: '', phone: '', service: firstService});
          }
        }, 3000);
      } else {
        const errorText = await dbRes.text();
        setVerifyStatus(`Server Rejected. Details: ${errorText}`);
      }
    } catch (dbErr) {
      console.error("DB Fetch Error:", dbErr);
      setVerifyStatus(`Network Error: Backend is completely offline.`);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayPayment = async () => {
    setPaymentStatusMessage("Initializing secure payment...");
    
    const isScriptLoaded = await loadRazorpayScript();
    if (!isScriptLoaded) {
      setPaymentStatusMessage("Failed to load Razorpay. Check your internet connection or adblocker.");
      return;
    }
    
    const selectedSrv = servicesList.find(s => s.title === clientDetails.service);
    
    
    const requestBody = {
        amount: amountToPay,
        totalAmount: totalAmount,
        currency: "INR",
        serviceName: clientDetails.service,
        projectId: clientDetails.projectId,
        isRemainingPayment: isRemainingPayment
    };
    
    if (selectedSrv && selectedSrv._id && !isRemainingPayment) {
        requestBody.serviceId = selectedSrv._id;
    }

    try {
      const orderRes = await fetch("https://webport-5ru9.onrender.com/api/payment/razorpay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody) 
      });
      const orderData = await orderRes.json();

      if (!orderData.success) { 
        setPaymentStatusMessage("");
        alert("Server error: " + (orderData.message || orderData.error)); 
        return; 
      }

      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        alert("Frontend VITE_RAZORPAY_KEY_ID is missing in .env");
        setPaymentStatusMessage("Payment setup incomplete.");
        return;
      }

      const options = {
        key: razorpayKey, 
        amount: orderData.order.amount,
        currency: "INR",
        name: "Shivam Portfolio",
        description: isRemainingPayment ? `Remaining Balance: ${clientDetails.service}` : clientDetails.service,
        order_id: orderData.order.id, 
        handler: async function (response) {
          setPaymentStatusMessage("Verifying transaction securely on server...");
          try {
            const verifyRes = await fetch("https://webport-5ru9.onrender.com/api/payment/gateway-success", {
              method: "POST", 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: clientDetails.name, 
                email: clientDetails.email,
                serviceName: clientDetails.service, 
                transactionId: response.razorpay_payment_id,
                gateway: 'razorpay',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amountPaid: amountToPay,
                totalAmount: isRemainingPayment ? portalData.originalTotal : totalAmount,
                projectId: clientDetails.projectId,
                isRemainingPayment: isRemainingPayment
              })
            });
            const backendData = await verifyRes.json();
            
            if(backendData.success) {
              setPaymentStatusMessage("Payment Verified!");
              if (isRemainingPayment) {
                alert("Remaining Dues Cleared! Project updated to 100% Paid.");
                navigate('/portal');
              } else {
                alert(`Payment Success! Your Portal Access Key is: ${backendData.accessKey}`);
                navigate('/portal');
              }
            } else {
              setPaymentStatusMessage(`Verification failed: ${backendData.message}`);
            }
          } catch(verifyErr) {
            console.error("Verification Error:", verifyErr);
            setPaymentStatusMessage("Failed to verify with server.");
          }
        },
        prefill: { name: clientDetails.name, email: clientDetails.email, contact: clientDetails.phone },
        theme: { color: "#3399cc" },
        config: {
          display: {
            blocks: {
              upi: { name: "Pay via UPI", instruments: [{ method: "upi" }] },
              card: { name: "Pay via Card", instruments: [{ method: "card" }] }
            },
            sequence: ["block.upi", "block.card"],
            preferences: { show_default_blocks: true }
          }
        }
      };

      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        console.error("Payment Failed:", response.error);
        alert("Payment failed: " + response.error.description);
        setPaymentStatusMessage("");
      });

      rzp.open();
      
    } catch (err) {
      console.error("🔥 Frontend Razorpay Error:", err);
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

            <form onSubmit={handleProceedToPay} className="mt-8 grid grid-cols-12 gap-6">
              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Full name</span>
                <input
                  type="text"
                  required
                  className={fieldClass}
                  value={clientDetails.name}
                  onChange={(e) => setClientDetails({ ...clientDetails, name: e.target.value })}
                  placeholder="Your name"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Email address</span>
                <input
                  type="email"
                  required
                  className={fieldClass}
                  value={clientDetails.email}
                  onChange={(e) => setClientDetails({ ...clientDetails, email: e.target.value })}
                  placeholder="you@example.com"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Mobile number</span>
                <input
                  type="tel"
                  required
                  className={fieldClass}
                  value={clientDetails.phone}
                  onChange={(e) => setClientDetails({ ...clientDetails, phone: e.target.value })}
                  placeholder="+91 00000 00000"
                />
              </label>

              <label className="col-span-12 block md:col-span-6">
                <span className="eyebrow mb-2 block text-[var(--ink-soft)]">Type of service</span>
                <select
                  required
                  className={`${fieldClass} cursor-pointer`}
                  value={clientDetails.service}
                  onChange={(e) => setClientDetails({ ...clientDetails, service: e.target.value })}
                >
                  {servicesList.length > 0 ? (
                    servicesList.map((srv) => (
                      <option key={srv._id} value={srv.title}>
                        {srv.title}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Full-Stack Web Development">Full-Stack Web Development</option>
                      <option value="AI/ML Integration">AI/ML Integration</option>
                    </>
                  )}
                  {preSelectedService && !servicesList.some((s) => s.title === preSelectedService) && (
                    <option value={preSelectedService}>{preSelectedService}</option>
                  )}
                  <option value="Other Custom Service">Other Custom Service</option>
                </select>
              </label>

              <div className="col-span-12 mt-2">
                <button type="submit" className={buttonClass}>
                  Continue to payment →
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
                        ₹{amountToPay}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <p className="font-display text-[clamp(2.4rem,6vw,4rem)] leading-none text-[var(--signal)]">
                          ₹{amountToPay}
                        </p>
                        <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                          {paymentPercent}% of ₹{totalAmount}
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
                        <strong className="font-medium text-[var(--ink)]">₹{remainingAmount}</strong>
                      </div>
                    </>
                  )}
                </div>

                {paymentStatusMessage && (
                  <p className="mt-6 border-l-2 border-[var(--signal)] pl-3 text-sm leading-6 text-[var(--signal)]">
                    {paymentStatusMessage}
                  </p>
                )}

                <div className="mt-8 border border-[var(--rule)] p-6">
                  <p className="eyebrow text-[var(--ink-soft)]">UPI / QR</p>
                  <div className="mt-4 flex flex-wrap items-center gap-6">
                    <img
                      src="/qr_code.png"
                      alt="Payment QR code"
                      className="h-40 w-40 border border-[var(--rule)] object-cover"
                    />
                    <div>
                      <p className="font-mono-ui text-sm tracking-[0.04em] text-[var(--ink)]">
                        paytmqr6ex9gc@ptys
                      </p>
                      <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                        Shivam Kumar
                      </p>
                      <a
                        href={`upi://pay?pa=paytmqr6ex9gc@ptys&pn=SHIVAM%20KUMAR&cu=INR&am=${amountToPay}`}
                        className="mt-4 inline-flex items-center gap-2 border-b border-[var(--ink)] pb-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                      >
                        Pay via UPI app ↗
                      </a>
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
                      className={`${buttonClass} mt-4 w-full`}
                    >
                      Pay with Razorpay
                    </button>
                  </div>

                  <div className="border border-[var(--rule)] p-6">
                    <p className="eyebrow text-[var(--ink-soft)]">International</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                      Pay in USD through PayPal.
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
                            return actions.order.create({
                              application_context: { shipping_preference: 'NO_SHIPPING' },
                              purchase_units: [
                                {
                                  description: clientDetails.service,
                                  amount: { value: amountToPay.toString() },
                                },
                              ],
                            });
                          }}
                          onApprove={async (data, actions) => {
                            setPaymentStatusMessage('Verifying PayPal transaction on server...');
                            try {
                              const details = await actions.order.capture();
                              const res = await fetch(
                                'https://webport-5ru9.onrender.com/api/payment/gateway-success',
                                {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    name: clientDetails.name,
                                    email: clientDetails.email,
                                    serviceName: clientDetails.service,
                                    transactionId: details.id,
                                    gateway: 'paypal',
                                    amountPaid: amountToPay,
                                    totalAmount: isRemainingPayment
                                      ? portalData.originalTotal
                                      : totalAmount,
                                    projectId: clientDetails.projectId,
                                    isRemainingPayment: isRemainingPayment,
                                  }),
                                }
                              );
                              const backendData = await res.json();
                              if (backendData.success) {
                                setPaymentStatusMessage('Payment verified.');
                                if (isRemainingPayment) {
                                  alert('Remaining dues cleared. Project updated to 100% paid.');
                                  navigate('/portal');
                                } else {
                                  alert(
                                    `Payment success. Your portal access key is: ${backendData.accessKey}`
                                  );
                                  setTimeout(() => navigate('/portal'), 2000);
                                }
                              }
                            } catch {
                              setPaymentStatusMessage('Payment capture failed on server.');
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

                  <form onSubmit={handleVerifySubmit} className="mt-5 flex flex-col gap-4">
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
                        Screenshot — JPG or PNG, max 5MB
                      </span>
                      <input
                        type="file"
                        name="attachment"
                        accept="image/png, image/jpeg"
                        required
                        className={`${fieldClass} cursor-pointer file:mr-3 file:border-0 file:bg-[var(--ink)] file:px-3 file:py-1.5 file:font-mono-ui file:text-[10px] file:uppercase file:tracking-[0.14em] file:text-[var(--paper)]`}
                      />
                    </label>

                    <button type="submit" className={`${buttonClass} w-full`}>
                      Submit details ↗
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
