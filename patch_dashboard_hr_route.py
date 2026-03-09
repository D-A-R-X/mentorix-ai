"""
Run from ~/Downloads/mentorix-ai:
  python patch_dashboard_hr_route.py

Adds /hr route to App.jsx and updates Dashboard to link to it.
"""
import os, re

# ── Patch App.jsx ─────────────────────────────────────────────────────────────
app_path = 'src/App.jsx'
if os.path.exists(app_path):
    with open(app_path, encoding='utf-8') as f:
        c = f.read()

    changes = 0

    # Add HR import if not present
    if "import HR from './pages/HR'" not in c and "import HR from './pages/Hr'" not in c:
        # Add after last page import
        last_import_pat = re.compile(r"(import \w+ from '\./pages/\w+'[^\n]*\n)(?!import \w+ from '\./pages/)")
        # Just add before the export default or first Route
        c = c.replace(
            "import Voice from './pages/Voice'",
            "import Voice from './pages/Voice'\nimport HR    from './pages/HR'"
        )
        if "import HR" not in c:
            # Try another common pattern
            for page in ['Voice', 'Dashboard', 'Admin', 'Login']:
                old = f"import {page} from './pages/{page}'"
                if old in c:
                    c = c.replace(old, f"import HR from './pages/HR'\n{old}")
                    break
        changes += 1
        print('✓ HR import added to App.jsx')

    # Add /hr route
    if '"/hr"' not in c and "'/hr'" not in c:
        # Find voice route and add after it
        for pattern in [
            '<Route path="/voice"',
            '<Route path=\'/voice\'',
        ]:
            if pattern in c:
                c = c.replace(
                    pattern,
                    '<Route path="/hr" element={<PrivateRoute><HR /></PrivateRoute>} />\n        ' + pattern
                )
                changes += 1
                print('✓ /hr route added to App.jsx')
                break
        if '"/hr"' not in c:
            print('⚠ Could not auto-add /hr route — add manually:')
            print('  <Route path="/hr" element={<PrivateRoute><HR /></PrivateRoute>} />')

    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(c)
    print(f'✓ App.jsx: {changes} change(s)')
else:
    print('⚠ App.jsx not found at', app_path)

# ── Patch Dashboard.jsx to link to /hr ────────────────────────────────────────
dash_path = 'src/pages/Dashboard.jsx'
if os.path.exists(dash_path):
    with open(dash_path, encoding='utf-8') as f:
        dc = f.read()

    changes = 0

    # Fix any old HTML links to hr-mode.html
    if 'hr-mode.html' in dc:
        dc = dc.replace("href='/hr-mode.html'", "onClick={() => nav('/hr')}")
        dc = dc.replace('href="/hr-mode.html"', "onClick={() => nav('/hr')}")
        dc = dc.replace("window.location.href = '/hr-mode.html'", "nav('/hr')")
        dc = dc.replace('window.location.href = "/hr-mode.html"', "nav('/hr')")
        changes += 1
        print('✓ Dashboard: hr-mode.html links updated to /hr')

    # Also fix window.location for voice
    if 'voice.html' in dc:
        dc = dc.replace("window.location.href = '/voice.html'", "nav('/voice')")
        dc = dc.replace('window.location.href = "/voice.html"', "nav('/voice')")
        dc = dc.replace("href='/voice.html'", "onClick={() => nav('/voice')}")
        changes += 1
        print('✓ Dashboard: voice.html links updated to /voice')

    with open(dash_path, 'w', encoding='utf-8') as f:
        f.write(dc)
    print(f'✓ Dashboard.jsx: {changes} change(s)')
else:
    print('⚠ Dashboard.jsx not found — update HR link manually to navigate to /hr')

print('\nDeploy all:')
print('  git add src/pages/HR.jsx src/App.jsx src/pages/Dashboard.jsx backend/app.py src/pages/Onboarding.jsx src/pages/Login.jsx src/components/ui/LogoMark.jsx')
print('  git commit -m "feat: HR camera+analysis, streaming AI text, CGPA/backlogs, logo, honor fixes"')
print('  git push origin version-2-dev')
print('  git checkout main && git merge version-2-dev --no-ff -m "feat: major session upgrade" && git push origin main')
print('  git checkout version-2-dev')
