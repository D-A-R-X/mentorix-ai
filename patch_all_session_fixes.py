"""
Run from ~/Downloads/mentorix-ai:
  python patch_all_session_fixes.py

Fixes:
1. Honor score: Skip with 0 exchanges = -3 (currently gives 0 because forced_end check uses <3 but 0<3 so it should work — but 100 score seen = honor_events not being called at all when exchange_count=0)
2. HR tab switch: stricter — every switch = -2 (no 3-limit), session force-ends at 3 switches
3. Add cgpa + backlogs columns to user_profiles table
4. Session log: return honor events in /user/sessions
"""

with open('backend/app.py', encoding='utf-8') as f:
    c = f.read()

changes = 0

# ── Fix 1: Honor score for 0-exchange skip (make sure it triggers) ────────────
# The issue: forced_end may not be sent as True when user clicks Skip with 0 exchanges
# Fix: if exchange_count == 0, ALWAYS apply early_session_exit regardless of forced_end
old_voice_honor = '''            if data.forced_end and exchanges < 3:
                add_honor_event(current_user, "early_session_exit",
                                f"voice abandoned after {exchanges} exchanges", override_delta=-3)
            elif exchanges >= 3:
                d = +2 if overall >= 70 else +1
                add_honor_event(current_user, "voice_session_complete",
                                f"overall={overall}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "tab_switch_voice", "tab switch during voice")'''

new_voice_honor = '''            if exchanges == 0:
                # Zero exchanges = pure skip — always penalise
                add_honor_event(current_user, "early_session_exit",
                                "voice skipped with 0 exchanges", override_delta=-3)
            elif data.forced_end or exchanges < 3:
                add_honor_event(current_user, "early_session_exit",
                                f"voice abandoned after {exchanges} exchanges", override_delta=-3)
            else:
                d = +2 if overall >= 70 else +1
                add_honor_event(current_user, "voice_session_complete",
                                f"overall={overall}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "tab_switch_voice", "tab switch during voice")'''

if old_voice_honor in c:
    c = c.replace(old_voice_honor, new_voice_honor)
    changes += 1
    print('✓ Fix 1: Voice honor — 0-exchange skip always penalised')

# ── Fix 2: HR tab switch — stricter, every switch -2, force-end at 3 ──────────
old_hr_honor = '''            if exchanges < 4:
                add_honor_event(current_user, "early_session_exit",
                                f"only {exchanges} exchanges in HR", override_delta=-3)
            else:
                d = +4 if overall >= 80 else (+3 if overall >= 65 else (+2 if overall >= 50 else -1))
                add_honor_event(current_user, "hr_session_complete",
                                f"overall={overall} exchanges={exchanges}", override_delta=d)
            for _ in range(min(tab_warn, 3)):
                add_honor_event(current_user, "hr_tab_violation", "tab switch during HR")'''

new_hr_honor = '''            if exchanges == 0:
                add_honor_event(current_user, "early_session_exit",
                                "HR skipped with 0 exchanges", override_delta=-3)
            elif data.forced_end or exchanges < 4:
                add_honor_event(current_user, "early_session_exit",
                                f"only {exchanges} exchanges in HR", override_delta=-3)
            else:
                d = +4 if overall >= 80 else (+3 if overall >= 65 else (+2 if overall >= 50 else -1))
                add_honor_event(current_user, "hr_session_complete",
                                f"overall={overall} exchanges={exchanges}", override_delta=d)
            # HR: every tab switch penalised (no cap), session force-ends at 3
            for _ in range(tab_warn):
                add_honor_event(current_user, "hr_tab_violation", "tab switch during HR interview")'''

if old_hr_honor in c:
    c = c.replace(old_hr_honor, new_hr_honor)
    changes += 1
    print('✓ Fix 2: HR honor — stricter tab switch, 0-exchange check')

# ── Fix 3: Add cgpa + backlogs to user_profiles table ────────────────────────
old_profiles_table = '''"CREATE TABLE IF NOT EXISTS user_profiles (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, dept TEXT, year TEXT, sem TEXT, institution_id INT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())"'''

new_profiles_table = '''"CREATE TABLE IF NOT EXISTS user_profiles (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, dept TEXT, year TEXT, sem TEXT, institution_id INT, cgpa TEXT, backlogs INT DEFAULT 0, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cgpa TEXT",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS backlogs INT DEFAULT 0"'''

if old_profiles_table in c:
    c = c.replace(old_profiles_table, new_profiles_table)
    changes += 1
    print('✓ Fix 3: cgpa + backlogs columns in user_profiles')

# ── Fix 4: Update ProfileUpdate model ────────────────────────────────────────
old_profile_model = '''class ProfileUpdate(BaseModel):
    dept: Optional[str]  = None
    year: Optional[str]  = None
    sem:  Optional[str]  = None
    institution_id: Optional[int] = None'''

new_profile_model = '''class ProfileUpdate(BaseModel):
    dept:           Optional[str]  = None
    year:           Optional[str]  = None
    sem:            Optional[str]  = None
    institution_id: Optional[int]  = None
    cgpa:           Optional[str]  = None
    backlogs:       Optional[int]  = None'''

if old_profile_model in c:
    c = c.replace(old_profile_model, new_profile_model)
    changes += 1
    print('✓ Fix 4: ProfileUpdate model has cgpa + backlogs')

# ── Fix 5: Update profile upsert to save cgpa + backlogs ─────────────────────
old_upsert = '''        cur.execute("""
            INSERT INTO user_profiles (email, dept, year, sem, institution_id, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (email) DO UPDATE SET
                dept = EXCLUDED.dept, year = EXCLUDED.year,
                sem = EXCLUDED.sem, institution_id = EXCLUDED.institution_id,
                updated_at = NOW()
        """, (current_user, data.dept, data.year, data.sem, data.institution_id))'''

new_upsert = '''        cur.execute("""
            INSERT INTO user_profiles (email, dept, year, sem, institution_id, cgpa, backlogs, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (email) DO UPDATE SET
                dept = EXCLUDED.dept, year = EXCLUDED.year,
                sem = EXCLUDED.sem, institution_id = EXCLUDED.institution_id,
                cgpa = EXCLUDED.cgpa, backlogs = EXCLUDED.backlogs,
                updated_at = NOW()
        """, (current_user, data.dept, data.year, data.sem, data.institution_id,
              data.cgpa, data.backlogs))'''

if old_upsert in c:
    c = c.replace(old_upsert, new_upsert)
    changes += 1
    print('✓ Fix 5: Profile upsert saves cgpa + backlogs')

# ── Fix 6: Return honor_events in /user/sessions ─────────────────────────────
old_sessions_return = '''        return {
            "sessions": sessions,
            "profile":  profile
        }'''

new_sessions_return = '''        # Fetch honor events for this user
        honor_events_list = []
        try:
            cur.execute("""
                SELECT event_type, delta, running_score, note, created_at
                FROM honor_events WHERE email = %s ORDER BY created_at DESC LIMIT 20
            """, (current_user,))
            honor_events_list = [
                {"event": r[0], "delta": r[1], "score": r[2], "note": r[3],
                 "created_at": r[4].isoformat() if r[4] else ""}
                for r in (cur.fetchall() or [])
            ]
        except Exception as e:
            conn.rollback()
            logger.warning(f"Honor events fetch error: {e}")

        return {
            "sessions":     sessions,
            "profile":      profile,
            "honor_events": honor_events_list,
        }'''

if old_sessions_return in c:
    c = c.replace(old_sessions_return, new_sessions_return)
    changes += 1
    print('✓ Fix 6: /user/sessions returns honor_events')

with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\n✓ Done — {changes} fix(es) applied')
