// MediaPipe Pose Landmarker's 33 keypoint indices we care about for squats.
// Full list: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

/**
 * Angle (in degrees) at point B, formed by the lines B->A and B->C.
 * Uses x, y, AND z (MediaPipe gives an approximate depth per joint) so the
 * angle is accurate regardless of which way you're facing the camera.
 * e.g. angle(hip, knee, ankle) gives the knee bend angle.
 */
export function angleAt(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);
  if (mag1 === 0 || mag2 === 0) return null;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Picks whichever side (left/right) has higher landmark visibility/presence. */
function pickSide(landmarks) {
  const leftVis =
    (landmarks[LM.LEFT_HIP]?.visibility ?? 0) +
    (landmarks[LM.LEFT_KNEE]?.visibility ?? 0) +
    (landmarks[LM.LEFT_ANKLE]?.visibility ?? 0);
  const rightVis =
    (landmarks[LM.RIGHT_HIP]?.visibility ?? 0) +
    (landmarks[LM.RIGHT_KNEE]?.visibility ?? 0) +
    (landmarks[LM.RIGHT_ANKLE]?.visibility ?? 0);
  return rightVis >= leftVis ? "right" : "left";
}

/**
 * Extracts the squat-relevant metrics for a single frame of landmarks.
 * Returns null if key points aren't visible enough to trust.
 */
export function computeSquatMetrics(landmarks) {
  if (!landmarks) return null;

  const side = pickSide(landmarks);
  const hip = landmarks[side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP];
  const knee = landmarks[side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE];
  const ankle = landmarks[side === "left" ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
  const shoulder =
    landmarks[side === "left" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];

  const minVisibility = Math.min(
    hip?.visibility ?? 0,
    knee?.visibility ?? 0,
    ankle?.visibility ?? 0,
    shoulder?.visibility ?? 0
  );
  if (minVisibility < 0.5) return null;

  const kneeAngle = angleAt(hip, knee, ankle);

  // Torso lean: angle of the shoulder->hip line relative to a perfectly
  // vertical line, measured in 3D. This is the key fix — leaning forward
  // while facing the camera head-on moves mostly in the DEPTH (z) axis, not
  // left-right (x), so a 2D-only calculation would miss it almost entirely.
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const dz = (shoulder.z ?? 0) - (hip.z ?? 0);
  const horizontalMag = Math.hypot(dx, dz);
  const backAngle = (Math.atan2(horizontalMag, Math.abs(dy)) * 180) / Math.PI;

  // Knee valgus (knees caving inward): compare knee-to-knee width against
  // ankle-to-knee width on the frame. Only meaningful when both knees/ankles
  // are visible (roughly front-on camera position).
  const leftKnee = landmarks[LM.LEFT_KNEE];
  const rightKnee = landmarks[LM.RIGHT_KNEE];
  const leftAnkle = landmarks[LM.LEFT_ANKLE];
  const rightAnkle = landmarks[LM.RIGHT_ANKLE];
  let kneeCaveRatio = null;
  if (
    (leftKnee?.visibility ?? 0) > 0.5 &&
    (rightKnee?.visibility ?? 0) > 0.5 &&
    (leftAnkle?.visibility ?? 0) > 0.5 &&
    (rightAnkle?.visibility ?? 0) > 0.5
  ) {
    const kneeGap = Math.abs(leftKnee.x - rightKnee.x);
    const ankleGap = Math.abs(leftAnkle.x - rightAnkle.x);
    if (ankleGap > 0.02) kneeCaveRatio = kneeGap / ankleGap;
  }

  return { kneeAngle, backAngle, kneeCaveRatio, side };
}
