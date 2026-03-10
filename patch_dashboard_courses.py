#!/usr/bin/env python3
"""
Fixes the Dashboard Courses tab infinite spinner.

Root cause: Dashboard fetches GET /courses but either:
  a) The endpoint returns a different shape than expected
  b) The loading state never resets on error
  c) The courses array is never set

Run from: ~/Downloads/mentorix-ai/
"""
import os, sys, re

path = "src/pages/Dashboard.jsx"
if not os.path.exists(path):
    print(f"ERROR: {path} not found"); sys.exit(1)

with open(path, encoding="utf-8") as f:
    c = f.read()

original = c

# ── 1. Find the courses fetch and fix it ─────────────────────────────────────
# Look for patterns like fetch('/courses') or fetch(`${API}/courses`)
course_fetch_patterns = [
    # Pattern A: simple fetch
    (r"fetch\([`'\"].*?/courses[`'\"]\)", "courses_fetch_found"),
    # Pattern B: fetch with API var
    (r"fetch\(`\$\{API\}/courses`\)", "courses_fetch_found"),
    (r"fetch\(`\$\{API\}\/courses`\)", "courses_fetch_found"),
]

courses_section = None
for pat, _ in course_fetch_patterns:
    m = re.search(pat, c)
    if m:
        courses_section = m.start()
        print(f"✓ Found courses fetch at position {courses_section}")
        break

if courses_section is None:
    print("⚠ Could not find courses fetch — will add robust fetch block")

# ── 2. Find the setCourses / setLoading / courses state ──────────────────────
has_set_courses = "setCourses" in c
has_courses_loading = "coursesLoading" in c or ("loading" in c.lower() and "courses" in c.lower())

print(f"  setCourses found: {has_set_courses}")
print(f"  courses loading state: {has_courses_loading}")

# ── 3. Fix the courses fetch block to handle all response shapes ──────────────
# Find the useEffect or function that fetches courses
# Replace any existing courses fetch with a robust version

OLD_FETCHES = [
    # Pattern 1: arrow function fetch
    """const fetchCourses = async () => {
      try {
        const r = await fetch(`${API}/courses`, { headers: hdr() })
        const d = await r.json()
        setCourses(d.courses || d || [])
      } catch {
        setCourses([])
      }""",
    # Pattern 2: inline fetch in useEffect
]

ROBUST_FETCH = """const fetchCourses = async () => {
      try {
        const r = await fetch(`${API}/courses`, { headers: hdr() })
        if (!r.ok) { setCourses([]); setCoursesLoading(false); return }
        const d = await r.json()
        // Handle both { courses: [...] } and direct array responses
        const list = Array.isArray(d) ? d : (d.courses || d.data || [])
        setCourses(list)
      } catch (e) {
        console.warn('Courses fetch failed:', e)
        setCourses([])
      } finally {
        setCoursesLoading(false)
      }"""

# Try to find and replace existing fetchCourses
if "fetchCourses" in c:
    # Find the function body
    idx = c.find("fetchCourses = async")
    if idx == -1:
        idx = c.find("async function fetchCourses")
    if idx > 0:
        # Find start of function (go back to find const/let/function keyword)
        start = max(0, idx - 10)
        # Find end of function by matching braces
        brace_start = c.find("{", idx)
        if brace_start > 0:
            depth = 0
            end = brace_start
            for i, ch in enumerate(c[brace_start:], brace_start):
                if ch == '{': depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            old_fn = c[start:end]
            # Replace just the inner try block
            if "try {" in old_fn:
                # Replace the whole fetch function content
                new_fn = old_fn
                # Find try block in old function
                try_start = old_fn.find("try {")
                try_end = old_fn.rfind("}") # end of try/catch
                if try_start > 0:
                    new_fn = old_fn[:try_start] + ROBUST_FETCH.strip() + "\n    " + old_fn[try_end:]
                    c = c[:start] + new_fn + c[end:]
                    print("✓ Replaced fetchCourses try block")
            else:
                print("⚠ Could not find try block in fetchCourses")
    else:
        print("⚠ Could not locate fetchCourses body")
else:
    print("⚠ fetchCourses not found — checking for inline fetch in courses tab")
    # Try to find inline fetch for courses
    courses_tab_fetch = re.search(r"(fetch\([`'\"].*?/courses.*?\).*?\.json\(\))", c, re.DOTALL)
    if courses_tab_fetch:
        print(f"✓ Found inline courses fetch")
    else:
        print("⚠ No courses fetch found at all — Dashboard may use different pattern")

# ── 4. Ensure setCoursesLoading(false) is called in all paths ────────────────
# Find any loading state for courses and ensure it's always cleared
if "setCoursesLoading" not in c and "setLoading" in c:
    # The component uses a generic loading state — ensure it resets
    # Find all catch blocks that might be missing setLoading(false)
    fixed = re.sub(
        r"(catch\s*\([^)]*\)\s*\{)(\s*)(setCourses\([^)]*\))",
        r"\1\2\3\n        setCoursesLoading(false)",
        c
    )
    if fixed != c:
        c = fixed
        print("✓ Added setCoursesLoading(false) to catch block")

# ── 5. Add empty state message so spinner never shows forever ─────────────────
# Find where courses spinner is rendered and ensure it has a timeout fallback
# Look for the spinner JSX
spinner_pattern = r'(\{.*?loading.*?&&.*?<.*?spinner.*?>.*?\})'

# Simpler approach: find the courses loading render and add a timeout
if 'coursesLoading' in c or ('loading' in c and 'Courses' in c):
    # Find the loading spinner in courses tab and wrap it with a max wait
    # Add a useEffect that clears loading after 8s max
    if "coursesLoadTimeout" not in c:
        # Find where courses loading state is initialized
        loading_init = re.search(r"(const\s+\[coursesLoading.*?useState\(true\))", c)
        if loading_init:
            # Add timeout to auto-clear after 8s
            old_init = loading_init.group(0)
            # Find the fetchCourses call in useEffect
            if "fetchCourses()" in c:
                old_call = "fetchCourses()"
                new_call = """fetchCourses()
    // Safety net: never spin forever — clear loading after 8s
    const coursesLoadTimeout = setTimeout(() => setCoursesLoading(false), 8000)
    return () => clearTimeout(coursesLoadTimeout)"""
                if old_call in c and new_call not in c:
                    c = c.replace(old_call, new_call, 1)  # only first occurrence
                    print("✓ Added 8s timeout safety net for courses loading")

if c != original:
    with open(path, "w", encoding="utf-8") as f:
        f.write(c)
    print("\n✅ Dashboard.jsx patched")
else:
    print("\n⚠ No changes made — Dashboard.jsx structure may differ")
    print("  If Courses tab still spins, check the fetchCourses function manually")
    print("  The backend fix (patch_courses_fix.py) is more important — run that first")
