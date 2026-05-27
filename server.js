/* ============================================================
   AR EMBROIDERY — Backend Server (Resend Version)
   Uses Resend API for reliable email delivery on Render free tier
   ============================================================ */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===== CONFIG =====
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'Khan.saquib006@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// Serve uploaded reference images
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ref-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|jpg|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ===== DATA STORE (JSON files) =====
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  inquiries: path.join(DATA_DIR, 'inquiries.json'),
  feedback: path.join(DATA_DIR, 'feedback.json'),
  newsletter: path.join(DATA_DIR, 'newsletter.json')
};

function readData(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  } catch (e) {
    console.error('readData error:', e);
    return [];
  }
}

function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== EMAIL VIA RESEND =====
async function sendInquiryEmail(inquiry, refImagePath) {
  if (!RESEND_API_KEY) {
    console.warn('⚠️  RESEND_API_KEY missing — email not sent');
    return { sent: false, reason: 'Resend API key not configured' };
  }

  const html = `
    <div style="font-family: Georgia, serif; max-width: 640px; margin: 0 auto; background: #faf6ef; padding: 40px;">
      <div style="border-bottom: 1px solid #a8864f; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-family: Georgia, serif; color: #1a3a32; letter-spacing: 4px; font-weight: 400; font-size: 22px; margin: 0;">A<span style="color: #a8864f;">R</span> EMBROIDERY</h1>
        <p style="color: #8b6f3c; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin: 4px 0 0;">New Custom Order Inquiry</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; color: #2a241e; font-size: 14px;">
        <tr><td style="padding: 10px 0; font-weight: bold; width: 30%;">Name:</td><td>${inquiry.name}</td></tr>
        <tr><td style="padding: 10px 0; font-weight: bold;">Phone:</td><td><a href="tel:${inquiry.phone}" style="color: #1a3a32;">${inquiry.phone}</a></td></tr>
        <tr><td style="padding: 10px 0; font-weight: bold;">Email:</td><td><a href="mailto:${inquiry.email}" style="color: #1a3a32;">${inquiry.email}</a></td></tr>
        <tr><td style="padding: 10px 0; font-weight: bold;">Budget:</td><td>${inquiry.budget || 'Not specified'}</td></tr>
        <tr><td style="padding: 10px 0; font-weight: bold;">Deadline:</td><td>${inquiry.deadline || 'Not specified'}</td></tr>
      </table>
      <div style="margin-top: 24px; padding: 20px; background: #f3ecdf; border-left: 3px solid #a8864f;">
        <p style="font-weight: bold; color: #1a3a32; margin: 0 0 10px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase;">Design Requirement</p>
        <p style="white-space: pre-wrap; line-height: 1.7; margin: 0; color: #2a241e;">${inquiry.requirement}</p>
      </div>
      ${refImagePath ? `<p style="margin-top: 20px; color: #8b6f3c; font-size: 12px;">📎 Reference image attached to this email</p>` : ''}
      <p style="margin-top: 40px; font-size: 11px; color: #8b6f3c; letter-spacing: 2px; text-transform: uppercase; text-align: center;">— Atelier Mumbai —</p>
      <p style="margin-top: 16px; font-size: 11px; color: #8b6f3c; text-align: center;">Reply to this email to respond directly to ${inquiry.name}</p>
    </div>
  `;

  const payload = {
    from: 'AR Embroidery <onboarding@resend.dev>',
    to: [CONTACT_EMAIL],
    reply_to: inquiry.email,
    subject: `New Inquiry — ${inquiry.name}`,
    html: html
  };

  // Attach reference image if provided
  if (refImagePath && fs.existsSync(refImagePath)) {
    try {
      const fileContent = fs.readFileSync(refImagePath);
      payload.attachments = [{
        filename: path.basename(refImagePath),
        content: fileContent.toString('base64')
      }];
    } catch (e) {
      console.warn('Could not attach image:', e.message);
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (response.ok) {
      console.log('✓ Email sent via Resend:', result.id);
      return { sent: true, id: result.id };
    } else {
      console.error('Resend API error:', result);
      return { sent: false, reason: result.message || 'Unknown error' };
    }
  } catch (e) {
    console.error('Email send failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

// ===== AUTH MIDDLEWARE (admin) =====
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ============================================================
// PUBLIC ROUTES
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    resend: !!RESEND_API_KEY,
    time: new Date().toISOString()
  });
});

// --- Submit Inquiry ---
app.post('/api/inquiry', upload.single('reference'), async (req, res) => {
  try {
    const { name, phone, email, requirement, budget, deadline } = req.body;
    if (!name || !phone || !email || !requirement) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inquiry = {
      id: crypto.randomUUID(),
      name, phone, email, requirement,
      budget: budget || '',
      deadline: deadline || '',
      referenceImage: req.file ? `/uploads/${req.file.filename}` : null,
      timestamp: new Date().toISOString(),
      status: 'new'
    };

    const list = readData(FILES.inquiries);
    list.unshift(inquiry);
    writeData(FILES.inquiries, list);

    const refPath = req.file ? path.join(UPLOADS_DIR, req.file.filename) : null;
    const emailResult = await sendInquiryEmail(inquiry, refPath);

    res.json({ ok: true, id: inquiry.id, email: emailResult });
  } catch (e) {
    console.error('Inquiry error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Submit Feedback ---
app.post('/api/feedback', (req, res) => {
  try {
    const { name, role, message, rating } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'Missing fields' });

    const fb = {
      id: crypto.randomUUID(),
      name, role: role || '',
      message,
      rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
      approved: false,
      timestamp: new Date().toISOString(),
      date: 'Just now'
    };
    const list = readData(FILES.feedback);
    list.unshift(fb);
    writeData(FILES.feedback, list);
    res.json({ ok: true, id: fb.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Get approved feedback (public) ---
app.get('/api/feedback', (req, res) => {
  const list = readData(FILES.feedback);
  res.json(list.filter(f => f.approved).slice(0, 6));
});

// --- Newsletter ---
app.post('/api/newsletter', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const list = readData(FILES.newsletter);
  if (!list.find(s => s.email === email)) {
    list.push({ email, timestamp: new Date().toISOString() });
    writeData(FILES.newsletter, list);
  }
  res.json({ ok: true });
});

// ============================================================
// ADMIN ROUTES
// ============================================================

app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
  res.json(readData(FILES.inquiries));
});

app.get('/api/admin/feedback', requireAdmin, (req, res) => {
  res.json(readData(FILES.feedback));
});

app.post('/api/admin/feedback/:id/approve', requireAdmin, (req, res) => {
  const list = readData(FILES.feedback);
  const fb = list.find(f => f.id === req.params.id);
  if (!fb) return res.status(404).json({ error: 'Not found' });
  fb.approved = true;
  writeData(FILES.feedback, list);
  res.json({ ok: true });
});

app.delete('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  let list = readData(FILES.feedback);
  list = list.filter(f => f.id !== req.params.id);
  writeData(FILES.feedback, list);
  res.json({ ok: true });
});

app.post('/api/admin/inquiry/:id/status', requireAdmin, (req, res) => {
  const list = readData(FILES.inquiries);
  const inq = list.find(i => i.id === req.params.id);
  if (!inq) return res.status(404).json({ error: 'Not found' });
  inq.status = req.body.status || 'new';
  writeData(FILES.inquiries, list);
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const inquiries = readData(FILES.inquiries);
  const feedback = readData(FILES.feedback);
  const newsletter = readData(FILES.newsletter);
  res.json({
    totalInquiries: inquiries.length,
    newInquiries: inquiries.filter(i => i.status === 'new').length,
    totalFeedback: feedback.length,
    pendingFeedback: feedback.filter(f => !f.approved).length,
    newsletterSubscribers: newsletter.length
  });
});

// Serve admin panel
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ============================================================
app.listen(PORT, () => {
  console.log(`\n  ╔════════════════════════════════════════════╗`);
  console.log(`  ║   AR EMBROIDERY BACKEND (Resend)           ║`);
  console.log(`  ║   Running on port ${PORT}                      ║`);
  console.log(`  ╚════════════════════════════════════════════╝`);
  if (RESEND_API_KEY) {
    console.log(`  ✓ Resend API ready`);
  } else {
    console.log(`  ⚠️  RESEND_API_KEY missing — set in environment`);
  }
});
