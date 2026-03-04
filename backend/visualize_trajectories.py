import pandas as pd
import matplotlib.pyplot as plt
import os

DATA_PATH = "backend/data/synthetic_dataset.csv"
OUTPUT_PATH = "backend/data/trajectories.png"

COLOR       = "#6c3bce"
COLOR_MID   = "#9a7ce6"
COLOR_LIGHT = "#cbb6f6"


def infer_archetype(email):
    try:
        num = int(email.replace("student", "").split("@")[0])
    except:
        return None
    if 1   <= num <= 333: return "stable_achiever"
    if 334 <= num <= 666: return "confused_explorer"
    if 667 <= num <= 999: return "late_stabilizer"
    return None


def prepare_dataset():
    df = pd.read_csv(DATA_PATH)
    df["archetype"] = df["email"].apply(infer_archetype)
    df["session"]   = df.groupby("email").cumcount() + 1
    return df


def plot_stability(ax, df, archetype):
    subset = df[df["archetype"] == archetype]
    stability = subset.groupby("session")["stability_score"].mean().reindex(range(1, 11))
    ax.plot(stability.index, stability.values, marker="o", color=COLOR, linewidth=2)
    ax.set_title(f"{archetype}\nStability Trend", fontsize=10, fontweight="bold")
    ax.set_xlabel("Session"); ax.set_ylabel("Stability Score")
    ax.set_ylim(0, 1); ax.set_xlim(1, 10)
    ax.grid(True, alpha=0.3)


def plot_track_distribution(ax, df, archetype):
    subset = df[df["archetype"] == archetype]
    counts = subset["track"].value_counts()
    bars = ax.bar(range(len(counts)), counts.values, color=COLOR)
    ax.set_title(f"{archetype}\nTrack Distribution", fontsize=10, fontweight="bold")
    ax.set_ylabel("Count")
    ax.set_xticks(range(len(counts)))
    ax.set_xticklabels(
        [t.replace("_track", "").replace("_", " ") for t in counts.index],
        rotation=30, ha="right", fontsize=8
    )


def plot_risk_distribution(ax, df, archetype):
    subset = df[df["archetype"] == archetype]
    counts = subset["risk_level"].value_counts()
    colors = {"Low": COLOR_LIGHT, "Medium": COLOR_MID, "High": COLOR}
    pie_colors = [colors.get(l, COLOR) for l in counts.index]
    ax.pie(counts.values, labels=counts.index, autopct="%1.0f%%", colors=pie_colors)
    ax.set_title(f"{archetype}\nRisk Distribution", fontsize=10, fontweight="bold")


def generate_visualization():
    df = prepare_dataset()
    archetypes = ["stable_achiever", "confused_explorer", "late_stabilizer"]
    fig, axes = plt.subplots(3, 3, figsize=(18, 12))
    fig.suptitle("Mentorix AI — Behavioral Trajectory Analysis", fontsize=14, fontweight="bold", color=COLOR)
    for row, archetype in enumerate(archetypes):
        plot_stability(axes[row, 0], df, archetype)
        plot_track_distribution(axes[row, 1], df, archetype)
        plot_risk_distribution(axes[row, 2], df, archetype)
    plt.tight_layout()
    os.makedirs("backend/data", exist_ok=True)
    plt.savefig(OUTPUT_PATH, dpi=150, bbox_inches="tight")
    print("Saved to:", OUTPUT_PATH)


if __name__ == "__main__":
    generate_visualization()
