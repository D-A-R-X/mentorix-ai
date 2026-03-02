import pandas as pd
import numpy as np
import pickle
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

np.random.seed(42)
N = 1500


def assign_risk(row):
    score = 0

    if row['cgpa'] >= 8.0:    score -= 2
    elif row['cgpa'] >= 7.0:  score -= 1
    elif row['cgpa'] < 6.0:   score += 2
    else:                      score += 1

    if row['backlogs'] == 0:   score -= 1
    elif row['backlogs'] >= 3: score += 2
    else:                      score += 1

    if row['confidence'] >= 4:   score -= 2
    elif row['confidence'] <= 2: score += 2

    if row['career_changes'] == 0:   score -= 1
    elif row['career_changes'] >= 3: score += 2
    else:                             score += 1

    if row['decision_time'] >= 12: score -= 1
    elif row['decision_time'] <= 4: score += 1

    max_interest = max(row['tech_interest'], row['core_interest'], row['management_interest'])
    if max_interest >= 4: score -= 1
    elif max_interest <= 2: score += 1

    if score <= -2:  return 'Low'
    elif score >= 3: return 'High'
    else:            return 'Medium'


def normalize(df):
    """Must match normalize_input() in app.py exactly."""
    out = pd.DataFrame()
    out['cgpa']                = df['cgpa'] / 10
    out['backlogs']            = df['backlogs'].apply(lambda x: min(float(np.log1p(x)), 3.0))
    out['tech_interest']       = df['tech_interest'] / 5
    out['core_interest']       = df['core_interest'] / 5
    out['management_interest'] = df['management_interest'] / 5
    out['confidence']          = df['confidence'] / 5
    out['career_changes']      = df['career_changes'].astype(float)
    out['decision_time']       = df['decision_time'].apply(lambda x: min(x / 24, 1))
    return out


# ── Generate synthetic dataset ───────────────────────────────
data = pd.DataFrame({
    'cgpa':                np.round(np.random.uniform(4.5, 10.0, N), 1),
    'backlogs':            np.random.choice([0, 0, 0, 1, 1, 2, 3, 4], N),
    'tech_interest':       np.random.randint(1, 6, N),
    'core_interest':       np.random.randint(1, 6, N),
    'management_interest': np.random.randint(1, 6, N),
    'confidence':          np.random.randint(1, 6, N),
    'career_changes':      np.random.choice([0, 0, 1, 1, 2, 3, 4], N),
    'decision_time':       np.random.choice([3, 4, 6, 8, 10, 12, 16, 18, 24], N),
})

data['risk'] = data.apply(assign_risk, axis=1)

print('Dataset shape:', data.shape)
print('\nRisk distribution:')
print(data['risk'].value_counts())

# ── Normalize features ───────────────────────────────────────
features = [
    'cgpa', 'backlogs', 'tech_interest', 'core_interest',
    'management_interest', 'confidence', 'career_changes', 'decision_time'
]

X = normalize(data[features])
y = data['risk']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=8,
    min_samples_split=10,
    class_weight='balanced',
    random_state=42
)
model.fit(X_train, y_train)

print('\nAccuracy:', round(model.score(X_test, y_test), 3))
print('\nClassification Report:')
print(classification_report(y_test, model.predict(X_test)))

# ── Save model ───────────────────────────────────────────────
model_path = '../model/risk_model.pkl'
with open(model_path, 'wb') as f:
    pickle.dump(model, f)
print('\nModel saved to', model_path)

# ── Sanity check with normalized values ─────────────────────
good = pd.DataFrame([{
    'cgpa': 8.5, 'backlogs': 0, 'tech_interest': 5,
    'core_interest': 2, 'management_interest': 1,
    'confidence': 4, 'career_changes': 0, 'decision_time': 12
}])
bad = pd.DataFrame([{
    'cgpa': 5.5, 'backlogs': 3, 'tech_interest': 2,
    'core_interest': 2, 'management_interest': 2,
    'confidence': 1, 'career_changes': 4, 'decision_time': 3
}])

print('\nSanity check (normalized):')
print('Good student ->', model.predict(normalize(good))[0])
print('Bad student  ->', model.predict(normalize(bad))[0])