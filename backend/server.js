import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Resend } from 'resend';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Razorpay from 'razorpay'; 
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
  console.error(`❌ CRITICAL STARTUP ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1); 
}

const app = express();
app.set('trust proxy', 1);
app.get('/', (req, res) => {
    res.status(200).send("Portfolio Backend is Awake and Running!");
});

app.use(helmet()); 
app.use(mongoSanitize());

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL, 
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin === allowed || origin.endsWith('.vercel.app'))) {
      callback(null, true);
    } else {
      callback(null, true); 
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.get('/ping', (req, res) => {
    res.status(200).send('Server is healthy and alive!');
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5000, 
  message: { success: false, message: "Too many requests, try again later." }
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 5000, 
  skipFailedRequests: true, // NAYA UPDATE: Agar server error (500) aata hai, toh attempt count nahi hoga
  message: { success: false, message: "Too many authentication attempts. Locked for 1 hour." }
});

const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Access Denied. No token provided." });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded; 
    next(); 
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid or Expired Token!" });
  }
};


const checkPerm = (validSections) => (req, res, next) => {
  if (req.admin.role === 'superadmin') return next();
  
  if (req.admin.permissions && validSections.some(sec => req.admin.permissions.includes(sec))) {
    return next();
  }
  
  return res.status(403).json({ success: false, message: `Access Denied. Requires one of: ${validSections.join(', ')}` });
};

mongoose.connect(process.env.MONGO_URI, { family: 4, socketTimeoutMS: 45000, serverSelectionTimeoutMS: 45000 })
  .then(() => console.log('✅ Cloud MongoDB Connected Successfully'))
  .catch(err => console.log('❌ MongoDB Connection Error:', err));

// 3 ALAG RESEND SETUP (Tumhari request ke according)
// Resend email setup — only create instances when API keys are available
// Server starts fine without keys; email endpoints return errors gracefully
let adminResend = null;
let clientResend = null;
let teamResend = null;

if (process.env.RESEND_API_KEY_ADMIN) adminResend = new Resend(process.env.RESEND_API_KEY_ADMIN);
if (process.env.RESEND_API_KEY_CLIENT) clientResend = new Resend(process.env.RESEND_API_KEY_CLIENT);
if (process.env.RESEND_API_KEY_TEAM) teamResend = new Resend(process.env.RESEND_API_KEY_TEAM);

// Sender email — use your verified Resend domain when ready
const senderEmail = process.env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';

// Helper: safely send email, returns null if Resend not configured
async function safeSend(resendInstance, params) {
  if (!resendInstance) return null;
  try {
    return await resendInstance.emails.send(params);
  } catch (err) {
    console.log('Resend send error:', err.message);
    return null;
  }
}

const messageSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxLength: 100 }, 
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  message: { type: String, trim: true, maxLength: 1000 },
  type: { type: String, default: 'contact' },
  transaction_id: { type: String, trim: true },
  attachment: String,
  projectId: { type: String, trim: true },
  
  date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const skillSchema = new mongoose.Schema({ name: String, category: String, icon: String, description: String, proficiency: Number });
const Skill = mongoose.model('Skill', skillSchema);

const experienceSchema = new mongoose.Schema({ role: String, company: String, duration: String, description: String });
const Experience = mongoose.model('Experience', experienceSchema);
const educationSchema = new mongoose.Schema({ degree: String, institution: String, duration: String, score: String, description: String, location: { type: String, default: '' } });
const Education = mongoose.model('Education', educationSchema);

const contentSchema = new mongoose.Schema({
  homeData: { heroTitle: { type: String, default: "Hi, I am Shivam Singh" }, heroSubtitle: { type: String, default: "Full-Stack Web Developer" } },
  aboutData: { description: { type: String, default: "I am a passionate developer..." } },
  contactData: [{ title: String, url: String, icon: String }],
  policyData: { privacy: { type: String, default: "" }, terms: { type: String, default: "" }, refund: { type: String, default: "" } }
});
const Content = mongoose.model('Content', contentSchema);

const reviewSchema = new mongoose.Schema({
  name: String, role: String, rating: Number, text: String, 
  adminReply: { type: String, default: "" }, 
  isPinned: { type: Boolean, default: false }, date: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const adminSchema = new mongoose.Schema({
  name: { type: String, default: "System Admin" }, 
  identifier: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "team" }, 
  permissions: { type: [String], default: [] }, 
  twoFactorPin: { type: String, required: true }, 
  resetOtp: { type: String, default: '' },
  otpExpiry: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  otpLastAttempt: { type: Date, default: Date.now }
});
const AdminUser = mongoose.model('AdminUser', adminSchema);

const serviceSchema = new mongoose.Schema({ 
  title: { type: String, required: true, trim: true }, 
  description: { type: String, required: true, trim: true }, 
  icon: { type: String, default: '🔧' }, 
  price: { type: String, default: 'Contact for pricing' } 
});
const Service = mongoose.model('Service', serviceSchema);

const projectSchema = new mongoose.Schema({
  clientEmail: String,
  clientName: String,
  projectTitle: String,
  hashedAccessKey: String,
  isPaymentVerified: { type: Boolean, default: false },
  progress: { type: Number, default: 10 }, 
  status: { type: String, default: 'Pending Verification' }, 
  paymentStatus: { type: String, default: 'Pending' }, 
  deliveryDate: String,
  notes: String,
  isTemporaryKey: { type: Boolean, default: false }, 
  
  totalCost: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  lastPasswordReset: { type: Date }, 

  lastUpdated: { type: Date, default: Date.now }
});
const ClientProject = mongoose.model('ClientProject', projectSchema);

const pinnedProjectSchema = new mongoose.Schema({
  repoId: { type: String, required: true, unique: true }, 
  
  name: String,
  description: String,
  html_url: String,
  techStack: { type: String, default: '' },   
  dateRange: { type: String, default: '' },    
  pinnedAt: { type: Date, default: Date.now }
});
const PinnedProject = mongoose.model('PinnedProject', pinnedProjectSchema);


const createDefaultAdmin = async () => {
  try {
    
    const defaultEmail = process.env.ADMIN_DEFAULT_EMAIL;
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
    const defaultPin = process.env.ADMIN_DEFAULT_PIN;

    if(!defaultEmail || !defaultPassword || !defaultPin) {
      console.log("⚠️ Superadmin init skipped: Missing ADMIN_DEFAULT_EMAIL, ADMIN_DEFAULT_PASSWORD or ADMIN_DEFAULT_PIN in .env");
      return;
    }

    const adminExists = await AdminUser.findOne({ identifier: defaultEmail });

    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      const hashedPin = await bcrypt.hash(defaultPin, salt); 

      await AdminUser.create({
        name: "Shivam (Superadmin)",
        identifier: defaultEmail,
        password: hashedPassword,
        role: "superadmin",
        permissions: ["all"],
        twoFactorPin: hashedPin 
      });
      console.log("✅ Secure Military-Grade Default Superadmin Created entirely from .env!");
    } else {
      let updated = false;
      if (adminExists.role !== 'superadmin') {
        adminExists.role = 'superadmin';
        adminExists.permissions = ['all'];
        adminExists.name = "Shivam (Superadmin)";
        updated = true;
      }
      
      if (!adminExists.twoFactorPin.startsWith('$2a$')) {
        const salt = await bcrypt.genSalt(10);
        adminExists.twoFactorPin = await bcrypt.hash(defaultPin, salt);
        updated = true;
      }

      if (updated) {
        await adminExists.save();
        console.log("✅ Existing Admin successfully upgraded and secured!");
      } else {
        console.log("✅ Superadmin is ready and secure.");
      }
    }
  } catch (err) {
    console.log("❌ Admin init error:", err.message);
  }
};
createDefaultAdmin();


app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const admin = await AdminUser.findOne({ identifier });
    if (!admin) return res.status(401).json({ success: false, message: "Invalid Credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (isMatch) res.json({ success: true, message: "Step 1 cleared" });
    else res.status(401).json({ success: false, message: "Invalid Credentials" });
  } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

app.post('/api/admin/verify-2fa', authLimiter, async (req, res) => {
  try {
    const { identifier, pin } = req.body; 
    const admin = await AdminUser.findOne({ identifier }); 
    
    if (!admin) return res.status(404).json({ success: false, message: "User not found!" });

    const isMatch = await bcrypt.compare(pin, admin.twoFactorPin);

    if (isMatch) {
      const token = jwt.sign({ id: admin._id, role: admin.role, permissions: admin.permissions }, process.env.JWT_SECRET, { expiresIn: '1d' });
      res.json({ success: true, token: token, role: admin.role, permissions: admin.permissions, name: admin.name });
    } else {
      res.status(401).json({ success: false, message: "Incorrect Backup PIN!" });
    }
  } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

app.post('/api/admin/update-security', verifyAdminToken, async (req, res) => {
  try {
    const { oldPassword, newPassword, newPin } = req.body;
    const admin = await AdminUser.findById(req.admin.id);
    if (!admin) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect Current Password!" });

    const salt = await bcrypt.genSalt(10);
    
    if (newPassword) admin.password = await bcrypt.hash(newPassword, salt);
    if (newPin) {
      if(newPin.length !== 4) return res.status(400).json({ success: false, message: "PIN must be 4 digits!"});
      admin.twoFactorPin = await bcrypt.hash(newPin, salt);
    }

    await admin.save();
    res.json({ success: true, message: "Security Credentials Updated Successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

app.post('/api/admin/forgot-password', authLimiter, async (req, res) => {
  let otp = "";
  try {
    const { identifier } = req.body;
    const admin = await AdminUser.findOne({ identifier });
    if (!admin) return res.status(404).json({ success: false, message: "User not found!" });

    const timeSinceLastAttempt = Date.now() - admin.otpLastAttempt.getTime();
    if (admin.otpAttempts >= 100) {
      if (timeSinceLastAttempt < 24 * 60 * 60 * 1000) {
        const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - timeSinceLastAttempt) / (1000 * 60 * 60));
        return res.status(429).json({ success: false, message: `Max attempts reached. Try again in ${hoursLeft} hours.` });
      } else {
        admin.otpAttempts = 0; 
      }
    }

    otp = Math.floor(100000 + Math.random() * 900000).toString();
    admin.resetOtp = otp;
    admin.otpExpiry = Date.now() + 10 * 60 * 1000; 
    admin.otpAttempts += 1;
    admin.otpLastAttempt = Date.now();
    await admin.save();

    const activeResend = admin.role === 'superadmin' ? adminResend : teamResend;

    await safeSend(activeResend, {
      from: senderEmail,
      to: admin.identifier,
      subject: "Secure System Access - 6-Digit OTP",
      text: `Hello ${admin.name},\nYour security OTP for password reset is: ${otp}.\nValid for 10 mins. Attempts: ${admin.otpAttempts}/3 today.`
    });
    res.json({ success: true, message: "OTP sent to your email!" });
    console.timeEnd("⏱️ API Time");

  } catch (error) { 
    
    console.log("🔥 ASLI ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP email. Please check server settings." }); 
  }
});

app.post('/api/admin/reset-password', authLimiter, async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    if(newPassword.length < 8) return res.status(400).json({success: false, message: "Password must be at least 8 chars"});

    const admin = await AdminUser.findOne({ identifier });
    if (!admin || admin.resetOtp !== otp || admin.otpExpiry < Date.now()) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    const salt = await bcrypt.genSalt(10);
    admin.password = await bcrypt.hash(newPassword, salt);
    admin.resetOtp = ''; 
    admin.otpAttempts = 0; 
    await admin.save();
    
    res.json({ success: true, message: "Password Reset Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { name, email, phone, message, type, transaction_id, attachment, projectId, isRemainingPayment, amountPaid } = req.body;
    
    if(type === 'payment' && (!name || !email || !phone || !transaction_id)) {
      return res.status(400).json({success: false, message: "Incomplete payment details provided."});
    }

    let finalMessage = message;
    if (isRemainingPayment) {
        finalMessage = `[REMAINING BALANCE PAYMENT] Claimed Amount: $${amountPaid}\n\n${message}`;
    }

    const newMessage = new Message({ name, email, phone, message: finalMessage, type, transaction_id, attachment, projectId });
    await newMessage.save();

    if (type === 'payment') {
      try {
        const authorizedAdmins = await AdminUser.find({
          $or: [{ role: 'superadmin' }, { permissions: 'payments' }]
        });
        
        for (const adminUser of authorizedAdmins) {
          const mailOptions = {
            from: senderEmail, 
            to: adminUser.identifier, 
            subject: `💰 New Payment Received from ${name}`,
            html: `
              <h2>New Payment Verification Submitted</h2>
              <p><strong>Client Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Transaction ID:</strong> ${transaction_id}</p>
              ${isRemainingPayment ? `<p style="color:red; font-weight:bold;">This is a Remaining Balance Clearance Request.</p>` : ''}
              <p>Please check your Admin Dashboard to verify the payment and generate an Access Key for the client.</p>
            `
          };
          await safeSend(teamResend, mailOptions);
        }
      } catch (mailError) { console.log("Mail setup error:", mailError); }
      
    } else if (type === 'contact' || !type) {
      
      try {
        const authorizedAdmins = await AdminUser.find({
          $or: [{ role: 'superadmin' }, { permissions: 'messages' }]
        });

        for (const adminUser of authorizedAdmins) {
          const contactMailOptions = {
            from: senderEmail, 
            to: adminUser.identifier, 
            reply_to: email, 
            subject: `📬 New Contact Inquiry from ${name}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 10px; border: 1px solid #ddd;">
                <h2 style="color: #333; border-bottom: 2px solid #00e5ff; padding-bottom: 10px;">New Contact Message Received</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                
                <div style="background: #fff; padding: 15px; border-left: 4px solid #00e5ff; margin-top: 20px;">
                  <p style="margin: 0; font-size: 14px; color: #777;">Message:</p>
                  <p style="margin: 5px 0 0 0; color: #333; font-size: 16px; white-space: pre-wrap;">${message}</p>
                </div>
                <br/>
                <p style="color: #888; font-size: 12px;">This message was sent from your website's contact form.</p>
              </div>
            `
          };
          await safeSend(teamResend, contactMailOptions);
        }
      } catch (mailError) { console.log("Contact Mail setup error:", mailError); }
    }

    res.status(200).json({ success: true, message: "Message saved!" });
  } catch (err) { 
    res.status(500).json({ success: false, message: "Server Error" }); 
  }
});

app.post('/api/payment/razorpay-order', async (req, res) => {
  try {
      
    const { serviceId, amount, totalAmount, projectId, isRemainingPayment } = req.body; 

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, message: "Razorpay keys missing in .env" });
    }

    let numericPrice = 100; 
    
    if (isRemainingPayment && projectId) {
        
        const project = await ClientProject.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });
        
        numericPrice = project.balanceDue || 100;  
        if (numericPrice <= 0) {
            return res.status(400).json({ success: false, message: "Project is already fully paid." });
        }
    }
    else if (serviceId && mongoose.Types.ObjectId.isValid(serviceId)) {
          
        const service = await Service.findById(serviceId);
        if (service && service.price) {
            const dbPrice = parseInt(service.price.replace(/\D/g, "")) || 100; 
            
            if (amount && amount >= (dbPrice * 0.40)) {
                numericPrice = parseInt(amount, 10);  
            } else {
                numericPrice = dbPrice; 
            }
        }
    } else if (amount) {
        numericPrice = parseInt(amount, 10);
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: numericPrice * 100, 
      currency: "INR",
      receipt: "receipt_" + crypto.randomBytes(8).toString('hex'),
    };

    const order = await instance.orders.create(options);
    
    if (!order) return res.status(500).json({ success: false, message: "Razorpay order creation failed" });
    
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/payment/gateway-success', async (req, res) => {
  try {
    const { name, email, serviceName, transactionId, gateway, razorpay_order_id, razorpay_payment_id, razorpay_signature, amountPaid, totalAmount, projectId, isRemainingPayment } = req.body;
    
    if (gateway === 'razorpay') {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
         return res.status(400).json({ success: false, message: "Missing Razorpay verification parameters." });
      }
      const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                                        .update(razorpay_order_id + "|" + razorpay_payment_id)
                                        .digest('hex');
      
      if (generated_signature !== razorpay_signature) {
         console.warn(`🚨 SECURITY ALERT: Invalid Razorpay signature from ${email}`);
         return res.status(400).json({ success: false, message: "Invalid payment signature. Verification failed." });
      }
    } else if (gateway === 'paypal') {
      console.warn(`ℹ️ Notice: PayPal transaction ${transactionId} received. Ensure webhook/API verification is implemented.`);
    } else {
      return res.status(400).json({ success: false, message: "Unknown or missing payment gateway provider." });
    }

    if (isRemainingPayment && projectId) {
        
        const project = await ClientProject.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        project.amountPaid += Number(amountPaid);
        project.balanceDue = project.totalCost - project.amountPaid;

        if (project.balanceDue <= 0) {
            project.balanceDue = 0;
            project.paymentStatus = 'Fully Paid';
        } else {
            const percentage = Math.round((project.amountPaid / project.totalCost) * 100);
            project.paymentStatus = `Partial (${percentage}%)`;
        }
        
        project.lastUpdated = Date.now();
        await project.save();

        try {
          await safeSend(clientResend, {
            from: senderEmail,
            to: email,
            subject: "🎉 Remaining Balance Received",
            html: `<h3>Hi ${name},</h3><p>Your remaining payment of $${amountPaid} for <strong>${project.projectTitle}</strong> has been received successfully.</p><p>Project Payment Status: <b style="color:#00f5a0;">${project.paymentStatus}</b></p><p>Login to Portal: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Client Portal</a></p><br><p><em>Forgot or want to change your Access Key? <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Click here to Reset Password</a></em></p>`
          });
        } catch(e) {}

        return res.json({ success: true, message: "Remaining balance updated" });

    } else {

        let hashedKey = "";
        let rawAccessKey = "";
        
        const existingProject = await ClientProject.findOne({ clientEmail: email });
        if (existingProject) {
            hashedKey = existingProject.hashedAccessKey;
            rawAccessKey = "Same as your existing Portal Access Key"; 
        } else {
            rawAccessKey = crypto.randomBytes(6).toString('hex').toUpperCase();
            const salt = await bcrypt.genSalt(10);
            hashedKey = await bcrypt.hash(rawAccessKey, salt);
        }

        const safeAmountPaid = Number(amountPaid) || 100;
        const safeTotalAmount = Number(totalAmount) || 100;
        const safeBalanceDue = safeTotalAmount - safeAmountPaid;

        let dynamicPaymentStatus = 'Paid';
        if (safeAmountPaid && safeTotalAmount) {
            const percentage = Math.round((safeAmountPaid / safeTotalAmount) * 100);
            dynamicPaymentStatus = percentage >= 100 ? 'Fully Paid' : `Partial (${percentage}%)`;
        }

        const newProject = new ClientProject({
          clientEmail: email,
          clientName: name,
          projectTitle: serviceName || "Automated Purchase",
          hashedAccessKey: hashedKey,
          isPaymentVerified: true,
          paymentStatus: dynamicPaymentStatus,
          status: 'Development Started',
          progress: 10,
          totalCost: safeTotalAmount,
          amountPaid: safeAmountPaid,
          balanceDue: safeBalanceDue > 0 ? safeBalanceDue : 0
        });
        await newProject.save();

        try {
          await safeSend(clientResend, {
            from: senderEmail,
            to: email,
            subject: "🎉 Payment Verified - Portal Login Details",
            html: `<h3>Hi ${name},</h3>
                   <p>Your payment via gateway is verified.</p>
                   <p>Login URL: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Client Portal</a></p>
                   <p>Email: <b>${email}</b></p>
                   <p>Access Key: <b style="color:#00e5ff; font-size:20px;">${rawAccessKey}</b></p>
                   <br><p><em>Forgot or want to change your Access Key? <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Click here to Reset Password</a></em></p>`
          });
        } catch(mailErr) {
          console.log("Email sending failed, but project auto-created.");
        }

        return res.json({ success: true, accessKey: rawAccessKey, email: email });
    }
  } catch(err) {
    res.status(500).json({ success: false, message: "Automation failed." });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { name, role, rating, text } = req.body;
    const newReview = new Review({ name, role, rating, text });
    await newReview.save();
    res.status(200).json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/content', async (req, res) => {
  try {
    let content = await Content.findOne();
    if (!content) content = await Content.create({});
    res.json(content);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get('/api/reviews', async (req, res) => {
  try { res.json(await Review.find().sort({ date: -1 })); } 
  catch (err) { res.status(500).json({ message: "Error" }); }
});

app.get('/api/skill', async (req, res) => {
  try { res.json(await Skill.find()); } 
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/services', async (req, res) => {
  try { res.json(await Service.find()); } 
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.get('/api/pinned-projects', async (req, res) => {
  try { res.json(await PinnedProject.find().sort({ pinnedAt: -1 })); } 
  catch (err) { res.status(500).json({ message: "Error" }); }
});

app.get('/api/resume-data', async (req, res) => {
  try {
    const skills = await Skill.find();
    const experiences = await Experience.find().sort({ _id: -1 });
    const education = await Education.find().sort({ _id: -1 }); 
    res.status(200).json({ skills, experiences, education });
  } catch (err) { res.status(500).json({ message: "Error fetching resume data" }); }
});

app.post('/api/client/login', authLimiter, async (req, res) => {
  try {
    const { email, accessKey } = req.body;

    const projects = await ClientProject.find({ clientEmail: email }).sort({ _id: -1 });
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: "Email not found." });

  
    let isValid = false;
    for (let proj of projects) {
        if (await bcrypt.compare(accessKey, proj.hashedAccessKey)) {
            isValid = true;
            break;
        }
    }

    if (!isValid) return res.status(401).json({ success: false, message: "Invalid Access Key." });

  
    const mappedProjects = projects.map(p => ({
        _id:            p._id, 
        clientName:     p.clientName,
        clientEmail:    p.clientEmail,
        projectTitle:   p.projectTitle,
        status:         p.status,
        progress:       p.progress,
        paymentStatus:  p.paymentStatus,
        deliveryDate:   p.deliveryDate,
        lastUpdated:    p.lastUpdated,
        notes:          p.notes,
        isTemporaryKey: p.isTemporaryKey || false,
        totalCost:      p.totalCost || 0,
        amountPaid:     p.amountPaid || 0,
        balanceDue:     p.balanceDue || 0
    }));

    return res.json({
      success: true,
      projects: mappedProjects
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post('/api/client/change-password', async (req, res) => {
  try {
    const { email, oldKey, newKey } = req.body;

    const projects = await ClientProject.find({ clientEmail: email });
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: "Projects not found." });

  
    const isMatch = await bcrypt.compare(oldKey, projects[0].hashedAccessKey);
    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect current Access Key." });

    const salt = await bcrypt.genSalt(10);
    const hashedNewKey = await bcrypt.hash(newKey, salt);

  
    await ClientProject.updateMany(
      { clientEmail: email }, 
      { $set: { hashedAccessKey: hashedNewKey, isTemporaryKey: false } }
    );

    res.json({ success: true, message: "Access Key updated successfully for all your projects!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/client/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
  
    const projects = await ClientProject.find({ clientEmail: email });
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: "Yeh email registered nahi hai." });

    if (projects[0].lastPasswordReset) {
      const timeSinceLastReset = Date.now() - new Date(projects[0].lastPasswordReset).getTime();
      if (timeSinceLastReset < 24 * 60 * 60 * 1000) {
        return res.status(429).json({ success: false, message: "Please wait 24 hours before requesting another password reset." });
      }
    }

    const tempPassword = "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const salt = await bcrypt.genSalt(10);
    const hashedTemp = await bcrypt.hash(tempPassword, salt);
    

    await ClientProject.updateMany(
      { clientEmail: email }, 
      { $set: { hashedAccessKey: hashedTemp, isTemporaryKey: true, lastPasswordReset: Date.now() } }
    );

    try {
      await safeSend(clientResend, {
        from: senderEmail,
        to: email, 
        subject: "🔐 Password Reset - Your New Portal Access Key",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f9; border-radius: 10px;">
            <h2 style="color: #333;">Hi ${projects[0].clientName},</h2>
            <p style="color: #555; font-size: 16px;">Your request to reset your Portal Access Key was successful. This key will work for all your projects.</p>
            <div style="background: #fff; padding: 15px; border-left: 4px solid #00e5ff; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #777;">Your Temporary Access Key is:</p>
              <h1 style="margin: 5px 0 0 0; color: #000; letter-spacing: 2px;">${tempPassword}</h1>
            </div>
            <p style="color: #ff4d4d; font-size: 14px; font-weight: bold;">⚠️ For security reasons, please login and change this temporary key immediately from your portal dashboard.</p>
            <br/>
            <p style="color: #555; font-size: 14px;">Regards,<br/><strong>Shivam Web Studio</strong></p>
          </div>
        `
      });
      
      res.json({ success: true, message: "Naya Access Key email par bhej diya gaya hai!" });

    } catch (mailErr) {
      res.status(500).json({ success: false, message: "Password reset ho gaya, par email bhejne mein error aayi." });
    }

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/client/get-projects', async (req, res) => {

  try {
    const { email } = req.body;
    const projects = await ClientProject.find({ clientEmail: email }).sort({ _id: -1 });
    if (!projects || projects.length === 0) return res.status(404).json({ success: false, message: "Projects not found." });

    const mappedProjects = projects.map(p => ({
        _id:            p._id, 
        clientName:     p.clientName,
        clientEmail:    p.clientEmail,
        projectTitle:   p.projectTitle,
        status:         p.status,
        progress:       p.progress,
        paymentStatus:  p.paymentStatus,
        deliveryDate:   p.deliveryDate,
        lastUpdated:    p.lastUpdated,
        notes:          p.notes,
        isTemporaryKey: p.isTemporaryKey || false,
        totalCost:      p.totalCost || 0,
        amountPaid:     p.amountPaid || 0,
        balanceDue:     p.balanceDue || 0
    }));

    return res.json({
      success: true,
      projects: mappedProjects 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/client/send-message', async (req, res) => {
  try {
    const { email, projectId, message } = req.body;

    if (!projectId || !message) {
      return res.status(400).json({ success: false, message: "Project ID and Message are required." });
    }

    const project = await ClientProject.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

   
    const newMessage = new Message({
      name: project.clientName,
      email: project.clientEmail,
      message: `[Reply from Project: ${project.projectTitle}]\n\n${message}`,
      type: 'contact', 
      date: Date.now()
    });
    await newMessage.save();


    try {
      const adminEmails = [
        process.env.SUPER_ADMIN_EMAIL, 
        process.env.ADMIN_EMAIL
      ].filter(Boolean).join(', '); 

      await safeSend(adminResend, {
        from: senderEmail, 
        to: adminEmails || process.env.TEAM_EMAIL_USER, 
        subject: `📩 Portal Reply: ${project.clientName} (${project.projectTitle})`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f9; border-radius: 10px;">
            <h2 style="color: #333;">New Message from Client Portal</h2>
            <p style="color: #555;"><strong>Client:</strong> ${project.clientName} (${project.clientEmail})</p>
            <p style="color: #555;"><strong>Project:</strong> ${project.projectTitle}</p>
            
            <div style="background: #fff; padding: 15px; border-left: 4px solid #00e5ff; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #777;">Message:</p>
              <p style="margin: 5px 0 0 0; color: #333; font-size: 15px; white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #555; font-size: 14px;">You can view and delete this message from your Admin Dashboard Inbox.</p>
          </div>
        `
      });
    } catch(mailErr) {
      console.log("Admin alert email failed, but message saved to DB.", mailErr);
    }

    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("Client to Admin Message Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


app.post('/api/pinned-projects', verifyAdminToken, checkPerm(['cms']), async (req, res) => {
  try {
    const { repoId, name, description, html_url, techStack, dateRange } = req.body;
    const existing = await PinnedProject.findOne({ repoId });

    if (existing) {
      await PinnedProject.deleteOne({ repoId });
      res.json({ success: true, isPinned: false, message: "Project hidden from Home/Resume!" });
    } else {
      await PinnedProject.create({ repoId, name, description, html_url, techStack: techStack || '', dateRange: dateRange || '' });
      res.json({ success: true, isPinned: true, message: "Project displayed on Home/Resume!" });
    }
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message }); 
  }
});

app.put('/api/pinned-projects/:id', verifyAdminToken, checkPerm(['cms']), async (req, res) => {
  try {
    const { techStack, dateRange, description } = req.body;
    const project = await PinnedProject.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Pinned project not found" });

    if (techStack !== undefined) project.techStack = techStack;
    if (dateRange !== undefined) project.dateRange = dateRange;
    if (description !== undefined) project.description = description;
    await project.save();

    res.json({ success: true, message: "Project resume details updated!" });
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message }); 
  }
});

app.get('/api/admin/team', verifyAdminToken, checkPerm(['team']), async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: "Superadmin only." });
  try {
    const team = await AdminUser.find({ role: 'team' }, '-password -twoFactorPin');
    res.json(team);
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/admin/team', verifyAdminToken, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: "Superadmin only." });
  try {
    const { name, identifier, permissions } = req.body;
    let member = await AdminUser.findOne({ identifier });
    
    if (member) {
      member.name = name;
      member.permissions = permissions;
      await member.save();
      return res.json({ success: true, message: "Team member updated!" });
    } else {
      const rawPassword = crypto.randomBytes(4).toString('hex'); 
      const rawPin = Math.floor(1000 + Math.random() * 9000).toString(); 
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(rawPassword, salt);
      const hashedPin = await bcrypt.hash(rawPin, salt);
      
      await AdminUser.create({
        name, identifier, password: hashedPassword, role: 'team', permissions, twoFactorPin: hashedPin 
      });
      
      try {
        await safeSend(teamResend, {
          from: senderEmail,
          to: identifier,
          subject: "🎉 Welcome to Shivam Web Studio Team",
          html: `<p>Hi ${name},</p><p>You've been granted access to the Admin Dashboard.</p><p><b>Login Email:</b> ${identifier}<br><b>Password:</b> ${rawPassword}<br><b>2FA PIN:</b> ${rawPin}</p><p><em>For security, please login and change your Password and PIN immediately.</em></p><p>Login here: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin">Admin Panel</a></p>`
        });
      } catch(e) { console.log("Team email failed", e.message); }

      return res.json({ success: true, message: "Team member added and emailed!" });
    }
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/team/:id', verifyAdminToken, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false });
  try {
    await AdminUser.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});


app.get('/api/messages', verifyAdminToken, checkPerm(['messages', 'payments']), async (req, res) => {
  try { res.json(await Message.find().sort({ date: -1 })); } 
  catch (err) { res.status(500).json({ message: "Error" }); }
});

app.delete('/api/messages/:id', verifyAdminToken, checkPerm(['messages', 'payments']), async (req, res) => {
  try { await Message.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});

app.put('/api/reviews/:id/pin', verifyAdminToken, checkPerm(['reviews']), async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" }); 
    review.isPinned = !review.isPinned; 
    await review.save();
    res.json({ success: true, isPinned: review.isPinned });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put('/api/reviews/:id/edit', verifyAdminToken, checkPerm(['reviews']), async (req, res) => {
  try {
    await Review.findByIdAndUpdate(req.params.id, { text: req.body.text });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put('/api/reviews/:id/reply', verifyAdminToken, checkPerm(['reviews']), async (req, res) => {
  try {
    await Review.findByIdAndUpdate(req.params.id, { adminReply: req.body.adminReply });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/reviews/:id', verifyAdminToken, checkPerm(['reviews']), async (req, res) => {
  try { await Review.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/content/update', verifyAdminToken, checkPerm(['cms']), async (req, res) => {
  try {
    const { homeData, aboutData, contactData, policyData } = req.body;
    await Content.findOneAndUpdate({}, { homeData, aboutData, contactData, policyData }, { upsert: true, new: true });
    res.json({ success: true, message: "Website Updated!" });
  } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

app.post('/api/skill', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try {
    const { name, category, icon, description, proficiency } = req.body;
    const newSkill = new Skill({ name, category, icon, description, proficiency });
    await newSkill.save();
    res.status(200).json({ success: true, message: "Skill added!" });
  } catch (err) { res.status(500).json({ success: false }); }
});
app.delete('/api/skill/:id', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try { 
    await Skill.findByIdAndDelete(req.params.id); 
    res.json({ success: true, message: "Skill deleted!" }); 
  } catch (err) { 
    res.status(500).json({ success: false, message: "Delete failed" }); 
  }
});
app.put('/api/skill/:id', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try {
    await Skill.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: "Skill updated successfully!" });
  } catch (err) { 
    res.status(500).json({ success: false, message: "Update failed" }); 
  }
});
app.put('/api/services/:id', verifyAdminToken, checkPerm(['services']), async (req, res) => {
  try {
    await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: "Service updated successfully!" });
  } catch (err) { 
    res.status(500).json({ success: false, message: "Update failed" }); 
  }
});


app.post('/api/education', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try {
    const { degree, institution, duration, score, description } = req.body;
    const newEdu = new Education({ degree, institution, duration, score, description });
    await newEdu.save();
    res.status(200).json({ success: true, message: "Education added!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/education/:id', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try { await Education.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/experience', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try {
    const { role, company, duration, description } = req.body;
    const newExp = new Experience({ role, company, duration, description });
    await newExp.save();
    res.status(200).json({ success: true, message: "Experience added!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/experience/:id', verifyAdminToken, checkPerm(['skills']), async (req, res) => {
  try { await Experience.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});


app.post('/api/services', verifyAdminToken, checkPerm(['services']), async (req, res) => {
  try {
    const { title, description, icon, price } = req.body;
    const newService = new Service({ title, description, icon, price });
    await newService.save();
    res.status(200).json({ success: true, message: "Service added!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/services/:id', verifyAdminToken, checkPerm(['services']), async (req, res) => {
  try { await Service.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/client-projects', verifyAdminToken, checkPerm(['projects', 'payments']), async (req, res) => {
  try { const projects = await ClientProject.find().sort({ _id: -1 }); res.json(projects); } 
  catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/client-projects', verifyAdminToken, checkPerm(['projects']), async (req, res) => {
  try {
    req.body.lastUpdated = Date.now();
    
    if (req.body.amountPaid && req.body.totalCost) {
        req.body.balanceDue = req.body.totalCost - req.body.amountPaid;
        if (req.body.balanceDue < 0) req.body.balanceDue = 0;
        
        const percentage = Math.round((req.body.amountPaid / req.body.totalCost) * 100);
        req.body.paymentStatus = percentage >= 100 ? 'Fully Paid' : `Partial (${percentage}%)`;
    }

    if(req.body._id) {
      await ClientProject.findByIdAndUpdate(req.body._id, req.body); 
    } else {
      await new ClientProject(req.body).save(); 
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/client-projects/:id', verifyAdminToken, checkPerm(['projects']), async (req, res) => {
  try { await ClientProject.findByIdAndDelete(req.params.id); res.json({ success: true }); } 
  catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/client-projects/:id/message', verifyAdminToken, checkPerm(['projects']), async (req, res) => {
  try {
    const project = await ClientProject.findById(req.params.id);
    if(!project) return res.status(404).json({ success: false, message: "Project not found" });
    
   
    project.notes = req.body.message;
    project.lastUpdated = Date.now();
    await project.save();

   
    try {
      await safeSend(clientResend, {
        from: senderEmail,
        to: project.clientEmail,
        subject: `📩 Important Message regarding ${project.projectTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 10px;">
            <h2 style="color: #333; border-bottom: 2px solid #00e5ff; padding-bottom: 10px;">Update from Developer</h2>
            <p style="font-size: 16px; color: #444; white-space: pre-wrap;">${req.body.message}</p>
            <br>
            <p style="color: #777; font-size: 14px;">Log in to your portal to see live progress and reply directly.</p>
          </div>
        `
      });
    } catch(mailErr) {
      console.log("Failed to send email to client, but portal was updated.");
    }

    res.json({ success: true, message: "Message updated on portal and emailed to client!" });
  } catch (err) { 
    console.error("Admin to Client Message Error:", err);
    res.status(500).json({ success: false, message: "Server error" }); 
  }
});

app.post('/api/admin/verify-client-payment/:id', verifyAdminToken, checkPerm(['payments']), async (req, res) => {
  try {
    const project = await ClientProject.findById(req.params.id);
    if(!project) return res.status(404).json({ success: false, message: "Project not found" });

    
    let rawAccessKey = "Same as existing Access Key";
    
    const otherProjects = await ClientProject.find({ clientEmail: project.clientEmail, _id: { $ne: project._id } });
    if (otherProjects && otherProjects.length > 0) {
        
        project.hashedAccessKey = otherProjects[0].hashedAccessKey;
    } else {
        rawAccessKey = crypto.randomBytes(6).toString('hex').toUpperCase();
        const salt = await bcrypt.genSalt(10);
        project.hashedAccessKey = await bcrypt.hash(rawAccessKey, salt);
    }

    project.isPaymentVerified = true;
    project.paymentStatus = req.body.paymentStatus || 'Verified/Paid';
    project.status = 'Development Phase';
    await project.save();

    try {
      await safeSend(clientResend, {
        from: senderEmail,
        to: project.clientEmail,
        subject: "🎉 Payment Verified - Your Project Access Key",
        html: `<h3>Hi ${project.clientName},</h3><p>Your payment for <strong>${project.projectTitle}</strong> has been successfully verified.</p><p>You can now track your project's live progress on our portal.</p><br><p><strong>Login Email:</strong> ${project.clientEmail}</p><p><strong>Secure Access Key:</strong> <span style="font-size:24px; color:#00e5ff; font-weight:bold; letter-spacing: 4px;">${rawAccessKey}</span></p><br><p><em>Note: For security reasons, do not share it with anyone!</em></p><br><p><em>Forgot or want to change your Access Key? <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Click here to Reset Password</a></em></p>`
      });
    } catch(mailErr) {
       console.log("Email failed, but key was generated.");
    }

    res.json({ success: true, message: "Payment Verified & Access Key Generated!" });
  } catch(err) {
    res.status(500).json({ success: false, message: "Verification failed." });
  }
});

app.post('/api/admin/approve-payment-message/:msgId', verifyAdminToken, checkPerm(['payments']), async (req, res) => {
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

    const customPaymentStatus = req.body.paymentStatus || 'Fully Paid';

  
    if (msg.projectId) {
        const project = await ClientProject.findById(msg.projectId);
        if (project) {
            project.paymentStatus = customPaymentStatus;
            project.balanceDue = 0;
            await project.save();
            await Message.findByIdAndDelete(req.params.msgId);
            
            try {
              await safeSend(clientResend, {
                from: senderEmail,
                to: msg.email,
                subject: "🎉 Remaining Balance Verified",
                html: `<h3>Hi ${msg.name},</h3><p>Your remaining balance payment is verified. Project status is now ${customPaymentStatus}.</p><br><p><em>Forgot or want to change your Access Key? <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Click here to Reset Password</a></em></p>`
              });
            } catch(e) {}

            return res.json({ success: true, message: "Remaining Balance Verified Successfully!" });
        }
    }

   
    let rawAccessKey = "Same as existing Access Key";
    let hashedKey = "";
    
    const existingProject = await ClientProject.findOne({ clientEmail: msg.email });
    if (existingProject) {
        hashedKey = existingProject.hashedAccessKey;
    } else {
        rawAccessKey = crypto.randomBytes(6).toString('hex').toUpperCase();
        const salt = await bcrypt.genSalt(10);
        hashedKey = await bcrypt.hash(rawAccessKey, salt);
    }

    const newProject = new ClientProject({
      clientEmail: msg.email,
      clientName: msg.name,
      projectTitle: msg.message.split('|')[0] || "Custom Project",
      hashedAccessKey: hashedKey,
      isPaymentVerified: true,
      paymentStatus: customPaymentStatus, 
      status: 'Development Started',
      progress: 10
    });
    await newProject.save();

    try {
      await safeSend(clientResend, {
        from: senderEmail,
        to: msg.email,
        subject: "🎉 Payment Verified - Portal Login Details",
        html: `<h3>Hi ${msg.name},</h3><p>Your payment is verified. Track your project here: <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Client Portal</a></p><p>Email: <b>${msg.email}</b></p><p>Access Key: <b style="color:#00e5ff; font-size:20px;">${rawAccessKey}</b></p><br><p><em>Forgot or want to change your Access Key? <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal">Click here to Reset Password</a></em></p>`
      });
    } catch(mailErr) {
      console.log("Email failed, but Project Created. Raw Key:", rawAccessKey);
    }

    await Message.findByIdAndDelete(req.params.msgId);
    res.json({ success: true, message: "Payment Verified, Project Created & Key Sent!" });
  } catch(err) {
    res.status(500).json({ success: false, message: "Server error during verification." });
  }
});

app.post('/api/admin/reject-payment-message/:msgId', verifyAdminToken, checkPerm(['payments']), async (req, res) => {
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

    const rejectReason = req.body.reason || "Invalid Transaction ID or Unclear Screenshot";

    try {
      await safeSend(clientResend, {
        from: senderEmail,
        to: msg.email,
        subject: "⚠️ Action Required: Payment Verification Failed",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background: #fffcfc; border-radius: 10px; border: 1px solid #ffcccc;">
            <h2 style="color: #ff4d4d; margin-top: 0;">Payment Verification Failed</h2>
            <p style="color: #333; font-size: 16px;">Hi ${msg.name},</p>
            <p style="color: #555; font-size: 15px;">We were unable to verify your recent manual payment for <strong>${msg.message.split('|')[0] || "your project"}</strong> (Transaction ID: ${msg.transaction_id}).</p>
            
            <div style="background: #fff; padding: 15px; border-left: 4px solid #ff4d4d; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #777;">Reason for rejection:</p>
              <p style="margin: 5px 0 0 0; color: #333; font-weight: bold;">${rejectReason}</p>
            </div>

            <h3 style="color: #333;">What to do next?</h3>
            <p style="color: #555; font-size: 15px;">Please contact our support team immediately with a valid payment proof (clear screenshot) so we can resolve this issue.</p>
            
            <a href="mailto:${process.env.CLIENT_EMAIL_USER || process.env.EMAIL_USER}" style="display: inline-block; padding: 10px 20px; background: #ff4d4d; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Contact Support</a>
            
            <br/><br/>
            <p style="color: #555; font-size: 14px;">Regards,<br/><strong>Shivam Web Studio</strong></p>
          </div>
        `
      });
    } catch(mailErr) {
      console.log("Failed to send rejection email.", mailErr);
    }

    await Message.findByIdAndDelete(req.params.msgId);
    res.json({ success: true, message: "Payment Rejected & Client Emailed Successfully!" });
  } catch(err) {
    res.status(500).json({ success: false, message: "Server error during rejection." });
  }
});


app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const systemPrompt = `You are an AI for Shivam Singh. Answer professionally. User: ${message}`;
    const result = await model.generateContent(systemPrompt);
    res.status(200).json({ reply: result.response.text() });
  } catch (error) { res.status(500).json({ reply: "AI offline." }); }
});

app.get('/api/linkedin-skills', async (req, res) => {
  try {
    const linkedinUsername = "ve-rshivam"; 
    const url = `https://linkedin-data-api.p.rapidapi.com/get-profile-skills?username=${linkedinUsername}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, 'X-RapidAPI-Host': 'linkedin-data-api.p.rapidapi.com' }
    });
    const data = await response.json();
    if (data?.skills) {
      return res.status(200).json(data.skills.map(s => ({ name: s.name || s, icon: '🔗', proficiency: 80 })));
    }
    return res.status(200).json([]); 
  } catch (error) { res.status(200).json([]); }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});