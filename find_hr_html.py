"""
Run from ~/Downloads/mentorix-ai:
  python find_hr_html.py
"""
import os, glob

# Find all hr-related HTML files
found = []
for pattern in ['**/hr*.html', '**/HR*.html']:
    found += glob.glob(pattern, recursive=True)

print('HTML files found:')
for f in found:
    print(f'  {f}')
    if 'node_modules' not in f and '.bak' not in f:
        os.rename(f, f + '.bak')
        print(f'    → renamed to {f}.bak')

if not found:
    print('  None found — old HTML may already be disabled')

# Check App.jsx for HR route
app = open('src/App.jsx', encoding='utf-8').read() if os.path.exists('src/App.jsx') else ''
print('\nApp.jsx HR check:')
print('  HR import:', 'import HR' in app)
print('  /hr route:', '"/hr"' in app or "'/hr'" in app)

if '"/hr"' not in app and "'/hr'" not in app:
    print('\n⚠ Add route manually in src/App.jsx:')
    print('  1. Near other imports add:  import HR from \'./pages/HR\'')
    print('  2. Near other routes add:   <Route path="/hr" element={<PrivateRoute><HR /></PrivateRoute>} />')

# Check netlify.toml / public/_redirects
if os.path.exists('public/_redirects'):
    print('\n_redirects:', open('public/_redirects').read().strip())
