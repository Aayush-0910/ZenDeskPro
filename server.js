require('dotenv').config();
const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory token store: token → { email, name }
const pendingVerifications = new Map();

app.use(express.json());
app.use(express.static(__dirname));

// Lazy-create the transporter so missing creds don't crash startup
function createTransporter() {
    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

function buildConfirmationEmail(name, verifyUrl) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to ZenDesk Pro</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #060b18; padding: 40px 20px; }
  .wrapper { max-width: 580px; margin: 0 auto; }
  .card { background: #0f172a; border: 1px solid rgba(0,246,255,0.25); border-radius: 16px; overflow: hidden; }
  .header { padding: 40px 40px 32px; text-align: center; background: linear-gradient(180deg, #0a0f1e 0%, #0f172a 100%); border-bottom: 1px solid rgba(0,246,255,0.15); }
  .logo { font-size: 1.75rem; font-weight: 700; color: #00f6ff; letter-spacing: 1px; text-shadow: 0 0 12px rgba(0,246,255,0.5); }
  .tagline { color: #6b7fa3; font-size: 0.85rem; margin-top: 6px; }
  .body { padding: 36px 40px; }
  .greeting { font-size: 1.3rem; font-weight: 700; color: #e6f1ff; margin-bottom: 12px; }
  .text { color: #8a9dc0; line-height: 1.75; font-size: 0.95rem; margin-bottom: 24px; }
  .features { list-style: none; margin-bottom: 32px; }
  .features li { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #8a9dc0; font-size: 0.9rem; line-height: 1.5; }
  .features li:last-child { border-bottom: none; }
  .feat-label { color: #00f6ff; font-weight: 600; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #00f6ff; flex-shrink: 0; margin-top: 7px; box-shadow: 0 0 6px #00f6ff; }
  .cta { text-align: center; margin-top: 8px; }
  .btn { display: inline-block; padding: 14px 40px; background: #00f6ff; color: #060b18; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.95rem; letter-spacing: 0.5px; }
  .footer { padding: 20px 40px; text-align: center; border-top: 1px solid rgba(0,246,255,0.1); }
  .footer p { color: #4a5a78; font-size: 0.78rem; line-height: 1.7; }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">ZenDesk Pro</div>
        <div class="tagline">Your Personal Productivity Dashboard</div>
      </div>
      <div class="body">
        <div class="greeting">Welcome aboard, ${name}!</div>
        <p class="text">Your account has been created successfully. Here is everything waiting for you on your new dashboard:</p>
        <ul class="features">
          <li><span class="dot"></span><div><span class="feat-label">Task Manager</span> — Organize and prioritize your daily tasks</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Quick Notes</span> — Capture ideas before they slip away</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Pomodoro Timer</span> — Stay in deep focus with timed sessions</div></li>
          <li><span class="dot"></span><div><span class="feat-label">AI Assistant</span> — Powered by Gemini, manages your dashboard by voice or text</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Weather + Quotes</span> — Start every session informed and motivated</div></li>
        </ul>
        <div class="cta">
          <a href="${verifyUrl}" class="btn">Verify Email &amp; Sign In</a>
          <p style="color:#4a5a78;font-size:0.78rem;margin-top:12px">This link expires in 24 hours.</p>
        </div>
      </div>
      <div class="footer">
        <p>You received this email because an account was created at ZenDesk Pro.<br>If this was not you, you can safely ignore this message.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Expose non-secret config to the frontend
app.get('/config', (_req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Send signup confirmation email with verification link
app.post('/api/send-confirmation', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Email service not configured. Add EMAIL_USER and EMAIL_PASS to .env' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    pendingVerifications.set(token, { email, name, createdAt: Date.now() });

    const verifyUrl = `http://localhost:${PORT}/verify?token=${token}`;

    try {
        const transporter = createTransporter();
        const info = await transporter.sendMail({
            from: `"ZenDesk Pro" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your ZenDesk Pro account',
            html: buildConfirmationEmail(name, verifyUrl),
        });
        console.log(`Verification email sent to ${email} | MessageId: ${info.messageId}`);
        res.json({ success: true });
    } catch (err) {
        pendingVerifications.delete(token);
        console.error('Email send error:', err.message);
        res.status(500).json({ error: 'Failed to send confirmation email.', details: err.message });
    }
});

// Handle email verification link click
app.get('/verify', (req, res) => {
    const { token } = req.query;
    const data = pendingVerifications.get(token);

    if (!data) {
        return res.send(verifyPage(null, 'This verification link is invalid or has already been used.'));
    }

    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - data.createdAt > ONE_DAY) {
        pendingVerifications.delete(token);
        return res.send(verifyPage(null, 'This verification link has expired. Please sign up again.'));
    }

    pendingVerifications.delete(token);
    res.send(verifyPage(data.email));
});

function verifyPage(email, errorMsg) {
    if (errorMsg) {
        return `<!DOCTYPE html><html><head><title>Verification Failed</title>
        <style>body{font-family:Arial,sans-serif;background:#0a0f1e;color:#e6f1ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
        .box{background:#0f172a;border:1px solid rgba(255,0,193,0.3);border-radius:16px;padding:3rem;text-align:center;max-width:420px;}
        h2{color:#ff00c1;margin-bottom:1rem;}p{color:#a7b7d0;}a{color:#00f6ff;}</style></head>
        <body><div class="box"><h2>Verification Failed</h2><p>${errorMsg}</p><br><a href="/">Back to ZenDesk Pro</a></div></body></html>`;
    }
    return `<!DOCTYPE html><html><head><title>Email Verified</title>
    <style>body{font-family:Arial,sans-serif;background:#0a0f1e;color:#e6f1ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head>
    <body><script>
    try {
        var s = JSON.parse(localStorage.getItem('zenDeskProState_v3') || '{"users":[]}');
        var u = (s.users || []).find(function(u){ return u.email === ${JSON.stringify(email)}; });
        if (u) { u.verified = true; localStorage.setItem('zenDeskProState_v3', JSON.stringify(s)); }
    } catch(e){}
    window.location.href = '/?verified=1';
    </script></body></html>`;
}

// Verify Google credential and return user info
app.post('/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Credential required.' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured in .env' });

    try {
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
        const { name, email, picture, sub: googleId } = ticket.getPayload();
        res.json({ name, email, picture, googleId });
    } catch (err) {
        console.error('Google auth error:', err.message);
        res.status(401).json({ error: 'Invalid Google credential.' });
    }
});

app.post('/chat', async (req, res) => {
<<<<<<< Updated upstream
    const userMessage = req.body.message;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'AIzaSyDBNVaJKPdKs9MbZYMx5z38vPQsNnHQ4S0') {
        return res.status(500).json({ error: 'API key not configured.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: [{
                parts: [{
                    text: userMessage
                }]
            }]
        });

        const botResponse = response.data.candidates[0].content.parts[0].text;
        res.json({ message: botResponse });
=======
    const { message, history } = req.body;

    if (!message && !history) {
        return res.status(400).json({ error: 'Message or history is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured. Please add your GEMINI_API_KEY to the .env file.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await axios.post(apiUrl, {
            contents: history || [{ parts: [{ text: message }] }],
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            }
        });

        const botResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!botResponse) throw new Error('Invalid response format from Gemini API');
>>>>>>> Stashed changes

        res.json({ message: botResponse });
    } catch (error) {
<<<<<<< Updated upstream
        console.error("Error fetching Gemini response:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Sorry, I encountered an error.' });
=======
        const details = error.response?.data ?? error.message;
        console.error('Gemini API error:', details);
        res.status(502).json({ error: 'AI communication error.', details });
>>>>>>> Stashed changes
    }
});

app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`);
});
