"""
Run from ~/Downloads/mentorix-ai:
  pip install resend --break-system-packages
  python patch_otp.py
"""

with open('backend/app.py', encoding='utf-8') as f:
    c = f.read()

changes = 0

# ── 1. Add imports + OTP store after existing imports ─────────────────────────
otp_imports = '''
import resend, random, time
from typing import Dict

# ── In-memory OTP store: { email: { otp, name, password_hash, expires_at } } ──
_otp_store: Dict[str, dict] = {}
OTP_TTL = 300  # 5 minutes

RESEND_API_KEY   = os.getenv("RESEND_API_KEY", "")
RESEND_FROM      = os.getenv("RESEND_FROM", "Mentorix AI <onboarding@resend.dev>")
'''

# Insert after the last import block (before the first @app route or class)
if 'import resend' not in c:
    # Find a good insertion point — after FRONTEND_URL line
    insert_after = 'from llm_client import'
    idx = c.find(insert_after)
    if idx != -1:
        end = c.find('\n', idx) + 1
        c = c[:end] + otp_imports + c[end:]
        changes += 1
        print('✓ OTP imports + store added')
    else:
        print('⚠ Could not find import insertion point — add otp_imports manually')
else:
    print('✓ OTP imports already present')

# ── 2. New endpoints: send-otp and verify-otp ─────────────────────────────────
otp_endpoints = '''

# ════════════════════════════════════════════════════════════════════════════════
# EMAIL OTP VERIFICATION
# ════════════════════════════════════════════════════════════════════════════════

class SendOtpRequest(BaseModel):
    email:    EmailStr
    name:     str
    password: str

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp:   str

@app.post("/auth/send-otp")
async def send_otp(data: SendOtpRequest):
    """Step 1 of registration: validate inputs, send OTP email, store pending user."""
    import bcrypt

    email = data.email.strip().lower()

    # Check already registered
    if get_user_by_email(email):
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please sign in.")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len((data.name or "").strip()) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name.")

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))

    # Hash password now so we don't store plaintext
    pw_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    # Store pending registration
    _otp_store[email] = {
        "otp":       otp,
        "name":      (data.name or "").strip(),
        "pw_hash":   pw_hash,
        "expires_at": time.time() + OTP_TTL,
    }

    # Send email via Resend
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — OTP not sent (dev mode)")
        logger.info(f"DEV OTP for {email}: {otp}")
        return {"sent": True, "dev_otp": otp}  # dev only — remove in prod

    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from":    RESEND_FROM,
            "to":      [email],
            "subject": "Your Mentorix AI verification code",
            "html": f"""
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #E2E8F0">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
                <div style="width:36px;height:36px;background:#2563EB;border-radius:8px;display:flex;align-items:center;justify-content:center">
                  <span style="color:#fff;font-weight:800;font-size:18px">M</span>
                </div>
                <span style="font-weight:800;font-size:16px;color:#0F172A;letter-spacing:-0.02em">Mentorix<span style="color:#2563EB">.</span>AI</span>
              </div>
              <h2 style="font-size:20px;font-weight:700;color:#0F172A;margin:0 0 8px">Verify your email</h2>
              <p style="color:#64748B;font-size:14px;line-height:1.6;margin:0 0 24px">
                Hi {(data.name or "").strip().split()[0]}, use this code to complete your Mentorix AI registration. It expires in 5 minutes.
              </p>
              <div style="background:#F8F9FC;border:2px dashed #BFDBFE;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#2563EB">{otp}</span>
              </div>
              <p style="color:#94A3B8;font-size:12px;margin:0">
                If you didn't request this, you can safely ignore this email.<br>
                This code expires in 5 minutes.
              </p>
            </div>
            """,
        })
        logger.info(f"OTP sent to {email}")
    except Exception as e:
        logger.error(f"Resend error: {e}")
        raise HTTPException(status_code=503, detail="Could not send verification email. Try again.")

    return {"sent": True}


@app.post("/auth/verify-otp")
async def verify_otp(data: VerifyOtpRequest):
    """Step 2 of registration: verify OTP, create account, return token."""
    email = data.email.strip().lower()
    pending = _otp_store.get(email)

    if not pending:
        raise HTTPException(status_code=400, detail="No pending verification for this email. Please register again.")

    if time.time() > pending["expires_at"]:
        del _otp_store[email]
        raise HTTPException(status_code=400, detail="Verification code expired. Please register again.")

    if data.otp.strip() != pending["otp"]:
        raise HTTPException(status_code=400, detail="Incorrect verification code. Please try again.")

    # OTP correct — create the account
    created = create_user(
        email=email,
        password_hash=pending["pw_hash"],
        name=pending["name"],
        auth_provider="email"
    )
    del _otp_store[email]

    if not created:
        raise HTTPException(status_code=500, detail="Could not create account. Try again.")

    token = create_token(email)
    name  = pending["name"]
    _is_admin = email == "admin@mentorix.ai" or email.startswith("admin@")

    logger.info(f"new verified user registered email={email}")
    return {"token": token, "name": name, "email": email, "is_admin": _is_admin}

'''

# Insert just before @app.post("/auth/register")
if '/auth/send-otp' not in c:
    marker = '@app.post("/auth/register")'
    if marker in c:
        c = c.replace(marker, otp_endpoints + marker)
        changes += 1
        print('✓ /auth/send-otp and /auth/verify-otp endpoints added')
    else:
        print('⚠ Could not find /auth/register — add otp_endpoints manually')
else:
    print('✓ OTP endpoints already present')

with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\n✓ Done — {changes} change(s) applied')
print('\nNext steps:')
print('1. pip install resend --break-system-packages')
print('2. Add to Render environment:')
print('   RESEND_API_KEY = re_your_key_here')
print('   RESEND_FROM = Mentorix AI <you@yourdomain.com>  (or leave for onboarding@resend.dev)')
print('3. git add backend/app.py')
print('4. git commit -m "feat: email OTP verification on register"')
print('5. git push + merge to main')
print('6. Then update Login.jsx (see frontend changes needed)')