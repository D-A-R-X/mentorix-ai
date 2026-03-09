"""Run this script from ~/Downloads/mentorix-ai to patch app.py"""
with open('backend/app.py', encoding='utf-8') as f:
    c = f.read()

# ── 1. Return is_admin in login response ──────────────────────────────────────
old_login_return = '    return {"token": token, "name": user.get("name") or data.email.split("@")[0], "email": data.email}'
new_login_return = '''    _name = user.get("name") or data.email.split("@")[0]
    _is_admin = (
        data.email.lower() == "admin@mentorix.ai"
        or _name.lower() == "admin"
        or data.email.lower().startswith("admin@")
    )
    return {"token": token, "name": _name, "email": data.email, "is_admin": _is_admin}'''

if old_login_return in c:
    c = c.replace(old_login_return, new_login_return)
    print("✓ Login now returns is_admin flag")
else:
    print("⚠ Login return line not found — check manually")

# ── 2. Fix honor: incomplete sessions (forced_end but exchanges < 4) deduct score ─
# The current code only deducts for hr_interview early exit, not voice
# Find the voice session honor block and add incomplete penalty
old_voice_honor = '''        else:
            if exchanges >= 3:
                d = +6 if overall >= 70 else +2
                add_honor_event(current_user, "voice_session_complete",
                                f"overall={overall}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "tab_switch_voice", "tab switch during voice")'''

new_voice_honor = '''        else:
            if data.forced_end and exchanges < 3:
                # Incomplete voice session penalty
                add_honor_event(current_user, "early_session_exit",
                                f"voice abandoned after {exchanges} exchanges", override_delta=-4)
            elif exchanges >= 3:
                d = +6 if overall >= 70 else +2
                add_honor_event(current_user, "voice_session_complete",
                                f"overall={overall}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "tab_switch_voice", "tab switch during voice")'''

if old_voice_honor in c:
    c = c.replace(old_voice_honor, new_voice_honor)
    print("✓ Incomplete voice session now deducts honor score")
else:
    print("⚠ Voice honor block not found — check manually")

with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print("\nDone! Now commit and push.")