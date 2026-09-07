export const REFERENCE_SEQUENCES = {};

function wristDisplacement(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function computeMotionEnergy(handFrames) {
  if (handFrames.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < handFrames.length; i++) {
    total += wristDisplacement(handFrames[i - 1].hands[0], handFrames[i].hands[0]);
  }
  return total / (handFrames.length - 1);
}

export function dtwDistance(seqA, seqB) {
  const a = seqA.filter((f) => f.hands).map((f) => f.hands[0]);
  const b = seqB.filter((f) => f.hands).map((f) => f.hands[0]);
  if (a.length === 0 || b.length === 0) return Infinity;

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(Infinity));
  dp[0][0] = 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = wristDisplacement(a[i - 1], b[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length] / (a.length + b.length);
}

// Used by Battle mode: grades a whole recorded round against a text prompt.
export function scoreRecordedSequence(sequence, prompt) {
  if (!sequence || sequence.length === 0) return 0;

  const reference = REFERENCE_SEQUENCES[prompt];
  if (reference && reference.length > 0) {
    const distance = dtwDistance(sequence, reference);
    const similarity = Math.max(0, 1 - distance / 0.15);
    return Math.round(Math.min(100, similarity * 100));
  }

  const handFrames = sequence.filter((f) => f.hands && f.hands.length > 0);
  const presenceRatio = handFrames.length / sequence.length;

  if (presenceRatio < 0.15) {
    return Math.round(presenceRatio * 100);
  }

  const motionEnergy = computeMotionEnergy(handFrames);
  const expectsMotion = (prompt || "").trim().split(/\s+/).length > 1;
  const motionScore = expectsMotion
    ? Math.min(1, motionEnergy / 0.02)
    : Math.max(0, 1 - motionEnergy / 0.01);

  const base = presenceRatio * 60 + motionScore * 35;
  const jitter = Math.random() * 5;
  return Math.min(100, Math.round(base + jitter));
}

/**
 * Used by Learn mode: grades a short recorded attempt (~3s) where the user
 * holds/performs a single sign. HONEST CAVEAT: still a heuristic, not a
 * trained per-sign classifier -- there's no labeled reference pose per
 * lesson yet. This rewards "a hand was clearly, steadily visible in frame,"
 * not "the shape was correct."
 */
export function scoreLessonAttempt(sequence) {
  if (!sequence || sequence.length === 0) {
    return { score: 0, detail: "No frames captured" };
  }

  const handFrames = sequence.filter((f) => f.hands && f.hands.length > 0);
  const presenceRatio = handFrames.length / sequence.length;

  if (presenceRatio < 0.15) {
    return { score: Math.round(presenceRatio * 100), detail: "Hand not detected for most of the attempt" };
  }

  const centeredness = handFrames.reduce((acc, f) => {
    const wrist = f.hands[0];
    const dx = wrist.x - 0.5;
    const dy = wrist.y - 0.5;
    return acc + Math.max(0, 1 - Math.hypot(dx, dy) * 1.5);
  }, 0) / handFrames.length;

  const base = presenceRatio * 55 + centeredness * 45;
  const jitter = Math.random() * 5;
  const score = Math.min(100, Math.round(base + jitter));

  return { score, detail: `${Math.round(presenceRatio * 100)}% hand visibility` };
}
