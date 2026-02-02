import pandas as pd
import pickle
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# Load data
df = pd.read_csv("data/student_data.csv")

X = df.drop("risk", axis=1)
y = df["risk"]

# Train model
model = RandomForestClassifier(
    n_estimators=100,
    random_state=42
)
model.fit(X, y)

# Save model
with open("model/risk_model.pkl", "wb") as f:
    pickle.dump(model, f)

print("✅ Risk model trained and saved")
