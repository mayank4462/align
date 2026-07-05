import { useRef, useState } from "react";
import { computeSquatMetrics } from "./angles";

// Tunable thresholds — starting points, expect to adjust these after testing
// on yourself across a few sessions.
const STANDING_KNEE_ANGLE = 160; // knee considered "straight" above this
const GOOD_DEPTH_KNEE_ANGLE = 100; // knee angle at/below this = good depth
const SHALLOW_DEPTH_KNEE_ANGLE = 120; // above this at the bottom = too shallow
const MAX_BACK_LEAN = 45; // degrees from vertical before we flag forward lean
const MIN_KNEE_CAVE_RATIO = 0.65; // knee-gap/ankle-gap below this = caving in

// How many consecutive missed-tracking frames we tolerate before treating
// the person as actually out of frame. A stray occlusion (arm swinging past
// the hip, etc.) shouldn't blow away the rep we're mid-way through.
const MAX_DROPOUT_FRAMES = 12;

// How long a "Perfect rep!" / "Didn't count" result stays on screen before
// routine phase text ("Ready…") is allowed to overwrite it.
const RESULT_HOLD_MS = 1500;

const PHASES = {
  STANDING: "standing",
  DESCENDING: "descending",
  BOTTOM: "bottom",
  ASCENDING: "ascending",
};

function freshRepState() {
  return {
    phase: PHASES.STANDING,
    minKneeAngle: 180,
    maxBackAngle: 0,
    minKneeCaveRatio: 1,
    dropoutFrames: 0,
    lastGoodMetrics: null,
    resultHoldUntil: 0,
  };
}

export function useSquatDetector(goal = 15) {
  const [repCount, setRepCount] = useState(0);
  const [perfectRepCount, setPerfectRepCount] = useState(0);
  const [phase, setPhase] = useState(PHASES.STANDING);
  const [feedback, setFeedback] = useState("Stand facing the camera to begin.");
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [repHistory, setRepHistory] = useState([]); // faults per rep in current set
  const [setSummary, setSetSummary] = useState(null);

  // Mutable rep-tracking state that persists across frames without
  // triggering re-renders on every single frame.
  const repState = useRef(freshRepState());

  function processFrame(landmarks) {
    const state = repState.current;
    let metrics = computeSquatMetrics(landmarks);

    if (!metrics || metrics.kneeAngle === null) {
      // Brief occlusion — reuse the last known-good reading instead of
      // immediately abandoning the rep we're in the middle of.
      state.dropoutFrames += 1;
      if (state.lastGoodMetrics && state.dropoutFrames <= MAX_DROPOUT_FRAMES) {
        metrics = state.lastGoodMetrics;
      } else {
        setLiveMetrics(null);
        setFeedback("Step back so your hips, knees, and ankles are all visible.");
        return;
      }
    } else {
      state.dropoutFrames = 0;
      state.lastGoodMetrics = metrics;
    }

    setLiveMetrics(metrics);

    const { kneeAngle, backAngle, kneeCaveRatio } = metrics;

    // Track the worst values seen during the current rep.
    state.minKneeAngle = Math.min(state.minKneeAngle, kneeAngle);
    state.maxBackAngle = Math.max(state.maxBackAngle, backAngle);
    if (kneeCaveRatio !== null) {
      state.minKneeCaveRatio = Math.min(state.minKneeCaveRatio, kneeCaveRatio);
    }

    // Simple state machine driven by knee angle.
    if (state.phase === PHASES.STANDING) {
      if (kneeAngle < STANDING_KNEE_ANGLE - 10) {
        state.phase = PHASES.DESCENDING;
        setPhase(PHASES.DESCENDING);
        setSetSummary((s) => (s !== null ? null : s));
      } else if (Date.now() > state.resultHoldUntil) {
        // Don't stomp a just-shown "Perfect rep!" / "Didn't count" message.
        setFeedback("Ready — go ahead and squat.");
      }
    } else if (state.phase === PHASES.DESCENDING) {
      setFeedback("Descending…");
      if (kneeAngle <= SHALLOW_DEPTH_KNEE_ANGLE) {
        state.phase = PHASES.BOTTOM;
        setPhase(PHASES.BOTTOM);
      }
    } else if (state.phase === PHASES.BOTTOM) {
      if (kneeAngle > SHALLOW_DEPTH_KNEE_ANGLE + 5) {
        state.phase = PHASES.ASCENDING;
        setPhase(PHASES.ASCENDING);
      } else {
        setFeedback("Hold… now drive back up.");
      }
    } else if (state.phase === PHASES.ASCENDING) {
      setFeedback("Rising…");
      if (kneeAngle >= STANDING_KNEE_ANGLE) {
        // Rep complete — evaluate it.
        const faults = [];
        if (state.minKneeAngle > SHALLOW_DEPTH_KNEE_ANGLE) {
          faults.push("Go deeper — aim for thighs at least parallel.");
        } else if (state.minKneeAngle > GOOD_DEPTH_KNEE_ANGLE) {
          faults.push("Close — a little deeper for a full rep.");
        }
        if (state.maxBackAngle > MAX_BACK_LEAN) {
          faults.push("Keep your chest up — you leaned too far forward.");
        }
        if (state.minKneeCaveRatio < MIN_KNEE_CAVE_RATIO) {
          faults.push("Push your knees out — they caved inward.");
        }

        setRepCount((n) => n + 1);
        setRepHistory((h) => [...h, { faults, good: faults.length === 0 }]);

        state.resultHoldUntil = Date.now() + RESULT_HOLD_MS;

        if (faults.length === 0) {
          setPerfectRepCount((n) => {
            const next = n + 1;
            setFeedback(
              next >= goal
                ? `Perfect rep! Goal reached — ${next}/${goal} perfect squats 🎉`
                : `Perfect rep! (${next}/${goal} perfect)`
            );
            return next;
          });
        } else {
          setFeedback(`Didn't count — ${faults.join(" ")}`);
        }

        // Reset per-rep tracking (but keep dropout/lastGoodMetrics state).
        state.phase = PHASES.STANDING;
        state.minKneeAngle = 180;
        state.maxBackAngle = 0;
        state.minKneeCaveRatio = 1;
        setPhase(PHASES.STANDING);
      }
    }
  }

  function endSet() {
    setRepHistory((history) => {
      if (history.length === 0) {
        setSetSummary("No reps recorded yet — do a few squats first.");
        return history;
      }

      const total = history.length;
      const goodCount = history.filter((r) => r.good).length;

      const faultCounts = {};
      history.forEach((r) =>
        r.faults.forEach((f) => {
          faultCounts[f] = (faultCounts[f] || 0) + 1;
        })
      );
      const topFault = Object.entries(faultCounts).sort((a, b) => b[1] - a[1])[0];

      let summary = `Set complete — ${goodCount}/${total} good reps.`;
      summary += topFault
        ? ` Most common issue (${topFault[1]}x): ${topFault[0]}`
        : " Great consistency — no repeated issues this set.";

      setSetSummary(summary);
      return []; // clear history for the next set
    });

    const dropoutFrames = repState.current.dropoutFrames;
    const lastGoodMetrics = repState.current.lastGoodMetrics;
    repState.current = { ...freshRepState(), dropoutFrames, lastGoodMetrics };
    setRepCount(0);
    setPhase(PHASES.STANDING);
    setFeedback("Stand facing the camera to begin your next set.");
  }

  function reset() {
    repState.current = freshRepState();
    setRepCount(0);
    setPhase(PHASES.STANDING);
    setFeedback("Stand facing the camera to begin.");
    setRepHistory([]);
    setSetSummary(null);
    setPerfectRepCount(0);
  }

  return {
    repCount,
    perfectRepCount,
    goal,
    phase,
    feedback,
    liveMetrics,
    setSummary,
    processFrame,
    endSet,
    reset,
  };
}
