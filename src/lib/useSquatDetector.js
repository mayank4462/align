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

// Smoothing factor for the exponential moving average applied to angles
// before they're used for anything. Lower = smoother but slower to react.
const SMOOTHING_ALPHA = 0.3;

// A phase transition only fires once its trigger condition has held true
// for this many consecutive frames — this is what stops a single noisy
// frame (or a stray body movement) from being read as a real rep.
const DEBOUNCE_FRAMES = 4;

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
    smoothKnee: null,
    smoothBack: null,
    debounceCounter: 0,
    currentSide: null,
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

  // Advances state.debounceCounter while `conditionMet` stays true; resets
  // it to 0 the moment it's false. Returns true only once the condition has
  // held for DEBOUNCE_FRAMES in a row — that's the actual transition trigger.
  function debounced(state, conditionMet) {
    if (conditionMet) {
      state.debounceCounter += 1;
      return state.debounceCounter >= DEBOUNCE_FRAMES;
    }
    state.debounceCounter = 0;
    return false;
  }

  function processFrame(landmarks) {
    const state = repState.current;
    let metrics = computeSquatMetrics(landmarks, state.currentSide);

    if (!metrics || metrics.kneeAngle === null) {
      // Brief occlusion — reuse the last known-good reading instead of
      // immediately abandoning the rep we're in the middle of.
      state.dropoutFrames += 1;
      if (state.lastGoodMetrics && state.dropoutFrames <= MAX_DROPOUT_FRAMES) {
        metrics = state.lastGoodMetrics;
      } else {
        // Tracking has been lost for real (too close, out of frame, etc).
        // Abandon whatever rep was in progress instead of freezing here and
        // later resuming with a completely different, unrelated pose — that
        // mismatch was producing fake "attempts" that were never real squats.
        if (state.phase !== PHASES.STANDING) {
          state.phase = PHASES.STANDING;
          setPhase(PHASES.STANDING);
        }
        state.minKneeAngle = 180;
        state.maxBackAngle = 0;
        state.minKneeCaveRatio = 1;
        state.smoothKnee = null;
        state.smoothBack = null;
        state.debounceCounter = 0;
        setLiveMetrics(null);
        setFeedback("Step back so your hips, knees, and ankles are all visible.");
        return;
      }
    } else {
      state.dropoutFrames = 0;
      state.lastGoodMetrics = metrics;
      state.currentSide = metrics.side;
    }

    // Smooth the angles with an exponential moving average so a single
    // noisy frame can't swing the reading. This is what fixes both random
    // movement being read as a rep, and real reps being falsely flagged.
    state.smoothKnee =
      state.smoothKnee === null
        ? metrics.kneeAngle
        : SMOOTHING_ALPHA * metrics.kneeAngle + (1 - SMOOTHING_ALPHA) * state.smoothKnee;
    state.smoothBack =
      state.smoothBack === null
        ? metrics.backAngle
        : SMOOTHING_ALPHA * metrics.backAngle + (1 - SMOOTHING_ALPHA) * state.smoothBack;

    const kneeAngle = state.smoothKnee;
    const backAngle = state.smoothBack;
    const { kneeCaveRatio } = metrics;

    setLiveMetrics({ ...metrics, kneeAngle, backAngle });

    // Track the worst values seen during the current rep.
    state.minKneeAngle = Math.min(state.minKneeAngle, kneeAngle);
    state.maxBackAngle = Math.max(state.maxBackAngle, backAngle);
    if (kneeCaveRatio !== null) {
      state.minKneeCaveRatio = Math.min(state.minKneeCaveRatio, kneeCaveRatio);
    }

    // State machine driven by the smoothed knee angle, with each transition
    // debounced so it only fires on a sustained movement, not a flicker.
    if (state.phase === PHASES.STANDING) {
      if (debounced(state, kneeAngle < STANDING_KNEE_ANGLE - 10)) {
        state.phase = PHASES.DESCENDING;
        setPhase(PHASES.DESCENDING);
        setSetSummary((s) => (s !== null ? null : s));
        console.log(`[squat] STANDING -> DESCENDING (knee=${Math.round(kneeAngle)}°, side=${metrics.side})`);
      } else if (Date.now() > state.resultHoldUntil) {
        // Don't stomp a just-shown "Perfect rep!" / "Didn't count" message.
        setFeedback("Ready — go ahead and squat.");
      }
    } else if (state.phase === PHASES.DESCENDING) {
      setFeedback("Descending…");
      if (debounced(state, kneeAngle <= SHALLOW_DEPTH_KNEE_ANGLE)) {
        state.phase = PHASES.BOTTOM;
        setPhase(PHASES.BOTTOM);
      }
    } else if (state.phase === PHASES.BOTTOM) {
      if (debounced(state, kneeAngle > SHALLOW_DEPTH_KNEE_ANGLE + 5)) {
        state.phase = PHASES.ASCENDING;
        setPhase(PHASES.ASCENDING);
      } else {
        setFeedback("Hold… now drive back up.");
      }
    } else if (state.phase === PHASES.ASCENDING) {
      setFeedback("Rising…");
      if (debounced(state, kneeAngle >= STANDING_KNEE_ANGLE)) {
        // Rep complete — evaluate it.
        // NOTE: depth is currently the only thing that blocks "Perfect" —
        // back-lean and knee-cave are shown as information but don't count
        // against you yet, since those two need real calibration data
        // before they're trustworthy enough to block a rep. Depth (knee
        // angle) is the most reliable signal we have right now.
        const faults = [];
        if (state.minKneeAngle > SHALLOW_DEPTH_KNEE_ANGLE) {
          faults.push("Go deeper — aim for thighs at least parallel.");
        } else if (state.minKneeAngle > GOOD_DEPTH_KNEE_ANGLE) {
          faults.push("Close — a little deeper for a full rep.");
        }

        const notes = [];
        if (state.maxBackAngle > MAX_BACK_LEAN) {
          notes.push("chest lean noted");
        }
        if (state.minKneeCaveRatio < MIN_KNEE_CAVE_RATIO) {
          notes.push("knees drifted in");
        }

        setRepCount((n) => n + 1);
        setRepHistory((h) => [...h, { faults, good: faults.length === 0 }]);

        // Diagnostic log — only visible in the browser console (F12), never
        // shown on screen. This is how we find the real numbers instead of
        // guessing at thresholds blind.
        console.log(
          `[squat] side=${metrics.side} minKnee=${Math.round(state.minKneeAngle)}° ` +
          `maxBack=${Math.round(state.maxBackAngle)}° kneeCave=${state.minKneeCaveRatio < 1 ? state.minKneeCaveRatio.toFixed(2) : "n/a"} ` +
          `result=${faults.length === 0 ? "PERFECT" : "FAULT: " + faults.join(" | ")}`
        );

        state.resultHoldUntil = Date.now() + RESULT_HOLD_MS;

        if (faults.length === 0) {
          setPerfectRepCount((n) => {
            const next = n + 1;
            const noteText = notes.length ? ` (${notes.join(", ")})` : "";
            setFeedback(
              next >= goal
                ? `Perfect rep! Goal reached — ${next}/${goal} perfect squats 🎉`
                : `Perfect rep! (${next}/${goal} perfect)${noteText}`
            );
            return next;
          });
        } else {
          setFeedback(`Didn't count — ${faults.join(" ")}`);
        }

        // Reset per-rep tracking (but keep dropout/lastGoodMetrics/smoothing state).
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

    const { dropoutFrames, lastGoodMetrics, smoothKnee, smoothBack, currentSide } = repState.current;
    repState.current = { ...freshRepState(), dropoutFrames, lastGoodMetrics, smoothKnee, smoothBack, currentSide };
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
