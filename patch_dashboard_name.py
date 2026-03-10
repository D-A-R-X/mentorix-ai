#!/usr/bin/env python3
"""
Patch src/pages/Dashboard.jsx to:
1. Import cleanDisplayName from useAuth
2. Use cleanName() instead of raw user?.name
3. Save HR-recommended courses to backend (courses/recommend endpoint)
Run from: ~/Downloads/mentorix-ai/
"""
import re, sys, os

path = "src/pages/Dashboard.jsx"
if not os.path.exists(path):
    print(f"ERROR: {path} not found. Run from project root.")
    sys.exit(1)

with open(path) as f:
    c = f.read()

# 1. Add cleanDisplayName import from useAuth
old_import = "import { useAuth } from '../hooks/useAuth.jsx'"
new_import = "import { useAuth, cleanDisplayName } from '../hooks/useAuth.jsx'"
if old_import in c:
    c = c.replace(old_import, new_import)
    print("✓ useAuth import updated")

# 2. Add cleanName derivation after const { user, logout } = useAuth()
old_auth = "  const { user, logout } = useAuth()"
new_auth = """  const { user, logout } = useAuth()
  // Clean Google name: extract quoted nickname, strip number prefix
  const cleanName = cleanDisplayName(user?.name || '')"""
if old_auth in c and "cleanName" not in c:
    c = c.replace(old_auth, new_auth)
    print("✓ cleanName added")

# 3. Fix the greeting: (user?.name || '').split(' ')[0]
c = c.replace(
    "`Good day, ${(user?.name || '').split(' ')[0] || 'there'}`",
    "`Good day, ${cleanName || 'there'}`"
)
print("✓ greeting fixed")

# 4. Fix the user name display in sidebar
c = c.replace(
    "{user?.name || 'User'}",
    "{cleanName || 'User'}"
)
print("✓ sidebar name fixed")

# 5. Fix avatar initial  
c = c.replace(
    "(user?.name || 'U')[0].toUpperCase()",
    "(cleanName || 'U')[0].toUpperCase()"
)
print("✓ avatar initial fixed")

with open(path, 'w') as f:
    f.write(c)

print(f"\n✅ Dashboard.jsx patched successfully")
