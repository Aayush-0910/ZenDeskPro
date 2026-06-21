from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

# Allow importing sibling modules from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import aiosmtplib
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", os.urandom(32).hex())

app = FastAPI(title="ZenDesk Pro")


# ── Models ────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: Optional[str] = None
    history: Optional[list[Any]] = None

class ConfirmationRequest(BaseModel):
    name: str
    email: str

class GoogleAuthRequest(BaseModel):
    credential: str


# ── JWT helpers ───────────────────────────────────────────────────────────────

def _create_verify_token(email: str, name: str) -> str:
    payload = {
        "email": email,
        "name": name,
        "purpose": "email_verification",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode_verify_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


# ── Email helpers ─────────────────────────────────────────────────────────────

def _build_email_html(name: str, verify_url: str) -> str:
    return """
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
  .header { padding: 40px 40px 32px; text-align: center; background: linear-gradient(180deg,#0a0f1e 0%,#0f172a 100%); border-bottom: 1px solid rgba(0,246,255,0.15); }
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
        <div class="greeting">Welcome aboard, NAME_PLACEHOLDER!</div>
        <p class="text">Your account has been created. Click the button below to verify your email and access your dashboard.</p>
        <ul class="features">
          <li><span class="dot"></span><div><span class="feat-label">Task Manager</span> - Organize and prioritize your daily tasks</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Quick Notes</span> - Capture ideas before they slip away</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Pomodoro Timer</span> - Stay in deep focus with timed sessions</div></li>
          <li><span class="dot"></span><div><span class="feat-label">AI Assistant</span> - Powered by Gemini, manages your dashboard by voice or text</div></li>
          <li><span class="dot"></span><div><span class="feat-label">Weather + Quotes</span> - Start every session informed and motivated</div></li>
        </ul>
        <div class="cta">
          <a href="VERIFY_URL_PLACEHOLDER" class="btn">Verify Email &amp; Sign In</a>
          <p style="color:#4a5a78;font-size:0.78rem;margin-top:12px">This link expires in 24 hours.</p>
        </div>
      </div>
      <div class="footer">
        <p>You received this email because an account was created at ZenDesk Pro.<br>If this was not you, you can safely ignore this message.</p>
      </div>
    </div>
  </div>
</body>
</html>""".replace("NAME_PLACEHOLDER", name).replace("VERIFY_URL_PLACEHOLDER", verify_url)


def _verify_page(email: str) -> str:
    safe_email = json.dumps(email)
    return f"""<!DOCTYPE html>
<html>
<head><title>Email Verified</title>
<style>body{{font-family:Arial,sans-serif;background:#0a0f1e;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}</style>
</head>
<body>
<script>
try {{
  var s = JSON.parse(localStorage.getItem('zenDeskProState_v3') || '{{"users":[]}}');
  var u = (s.users || []).find(function(u) {{ return u.email === {safe_email}; }});
  if (u) {{ u.verified = true; localStorage.setItem('zenDeskProState_v3', JSON.stringify(s)); }}
}} catch(e) {{}}
window.location.href = '/?verified=1';
</script>
</body>
</html>"""


def _error_page(msg: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><title>Verification Failed</title>
<style>
  body{{font-family:Arial,sans-serif;background:#0a0f1e;color:#e6f1ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}}
  .box{{background:#0f172a;border:1px solid rgba(255,0,193,0.3);border-radius:16px;padding:3rem;text-align:center;max-width:420px;}}
  h2{{color:#ff00c1;margin-bottom:1rem;}}p{{color:#a7b7d0;}}a{{color:#00f6ff;text-decoration:none;}}
</style>
</head>
<body>
  <div class="box">
    <h2>Verification Failed</h2>
    <p>{msg}</p><br>
    <a href="/">Back to ZenDesk Pro</a>
  </div>
</body>
</html>"""


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/config")
async def get_config():
    return {"googleClientId": os.getenv("GOOGLE_CLIENT_ID")}


@app.post("/auth/google")
async def google_auth(body: GoogleAuthRequest):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": body.credential},
            )
        if resp.status_code != 200:
            raise ValueError("Token rejected by Google")
        info = resp.json()
        if "error_description" in info:
            raise ValueError(info["error_description"])
        if info.get("aud") != client_id:
            raise ValueError("Token audience mismatch")
        return {
            "name": info.get("name", ""),
            "email": info["email"],
            "picture": info.get("picture"),
            "googleId": info["sub"],
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google credential: {e}")


@app.post("/api/send-confirmation")
async def send_confirmation(body: ConfirmationRequest, request: Request):
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")
    if not email_user or not email_pass:
        raise HTTPException(status_code=500, detail="Email service not configured")

    token = _create_verify_token(body.email, body.name)
    base_url = str(request.base_url).rstrip("/")
    verify_url = f"{base_url}/verify?token={token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your ZenDesk Pro account"
    msg["From"] = f"ZenDesk Pro <{email_user}>"
    msg["To"] = body.email
    msg.attach(MIMEText(_build_email_html(body.name, verify_url), "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=email_user,
            password=email_pass,
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")


@app.get("/verify", response_class=HTMLResponse)
async def verify_email(token: str = Query(...)):
    try:
        payload = _decode_verify_token(token)
        email = payload.get("email")
        if not email or payload.get("purpose") != "email_verification":
            raise ValueError("Invalid token payload")
        return _verify_page(email)
    except jwt.ExpiredSignatureError:
        return _error_page("This verification link has expired. Please sign up again.")
    except Exception:
        return _error_page("This verification link is invalid or has already been used.")


@app.post("/chat")
async def chat(body: ChatRequest):
    if not body.message and not body.history:
        raise HTTPException(status_code=400, detail="Message or history is required.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": body.history or [{"parts": [{"text": body.message}]}],
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.95,
            "topK": 40,
            "maxOutputTokens": 2048,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
            return {"message": text}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Gemini API error: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI communication error: {e}")


# Mount static files for local dev only — Vercel serves public/ directly
if not os.getenv("VERCEL"):
    from fastapi.staticfiles import StaticFiles
    _public = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
    if os.path.isdir(_public):
        app.mount("/", StaticFiles(directory=_public, html=True), name="static")
