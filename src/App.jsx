import { useEffect, useRef, useState } from "react";
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseLandmarker } from "./lib/usePoseLandmarker";
import { useSquatDetector } from "./lib/useSquatDetector";
import { LM, computeSquatMetrics } from "./lib/angles";

// Palette — deliberately restrained: neutrals do almost everything,
// color is reserved for exactly two states (perfect / missed).
const INK = "#F3F1EC";
const MUTED = "#9AA0A8";
const LINE = "#B7A88C"; // skeleton stroke — warm, muted, not neon
const GOOD = "#8CA88F"; // sage
const WARN = "#C79A66"; // bronze

// Draws text that reads correctly even though the canvas is mirrored via
// CSS (scaleX(-1)) to match the selfie-view video feed.
function drawMirroredLabel(ctx, text, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.font = "600 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingX = 7;
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + paddingX * 2;
  ctx.fillStyle = "rgba(18, 19, 22, 0.82)";
  ctx.strokeStyle = "rgba(183, 168, 140, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-boxWidth / 2, -11, boxWidth, 22, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

function AlignMark({ className }) {
  // Simple plumb-bob glyph: a line down to a point — a nod to what "aligned"
  // actually means here (perfectly vertical), even under the new name.
  return (
    <svg viewBox="0 0 16 20" className={className} fill="none">
      <line x1="8" y1="0" x2="8" y2="12" stroke={INK} strokeWidth="1.4" />
      <path d="M8 12 L11.5 16.5 A4 4 0 1 1 4.5 16.5 Z" fill={INK} />
    </svg>
  );
}

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [goal, setGoal] = useState(15);
  const { landmarks, status } = usePoseLandmarker(videoRef);
  const squat = useSquatDetector(goal);

  useEffect(() => {
    if (status === "ready") {
      squat.processFrame(landmarks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarks, status]);

  useEffect(() => {
    let stream;
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 960, height: 720, facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera access failed", err);
        setCameraError(
          "Couldn't access your camera. Check that you've granted camera permission to this site."
        );
      }
    }
    startCamera();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth || 960;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const metrics = computeSquatMetrics(landmarks);

    // Signature element: a literal plumb line through the hip, showing
    // vertical alignment — the thing this app (and its name) is about.
    if (metrics) {
      const hipIdx = metrics.side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP;
      const hip = landmarks[hipIdx];
      const x = hip.x * canvas.width;
      ctx.save();
      ctx.strokeStyle = "rgba(243, 241, 236, 0.28)";
      ctx.setLineDash([2, 7]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
      ctx.restore();
    }

    const drawer = new DrawingUtils(ctx);
    drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
      color: LINE,
      lineWidth: 2,
    });
    drawer.drawLandmarks(landmarks, {
      radius: 3,
      color: INK,
      fillColor: INK,
    });

    if (metrics && metrics.kneeAngle != null) {
      const kneeIdx = metrics.side === "left" ? LM.LEFT_KNEE : LM.RIGHT_KNEE;
      const knee = landmarks[kneeIdx];
      drawMirroredLabel(
        ctx,
        `${Math.round(metrics.kneeAngle)}°`,
        knee.x * canvas.width,
        knee.y * canvas.height - 26
      );

      const hipIdx = metrics.side === "left" ? LM.LEFT_HIP : LM.RIGHT_HIP;
      const hip = landmarks[hipIdx];
      drawMirroredLabel(
        ctx,
        `${Math.round(metrics.backAngle)}° lean`,
        hip.x * canvas.width,
        hip.y * canvas.height - 26
      );
    }
  }, [landmarks]);

  const isPerfect = squat.feedback.startsWith("Perfect rep");
  const isMiss = squat.feedback.startsWith("Didn't count");
  const statusColor = isPerfect ? GOOD : isMiss ? WARN : MUTED;
  const isTracking = status === "ready" && !!landmarks;

  return (
    <div className="h-screen w-screen bg-[#121316] text-[#F3F1EC] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-[#22252A]">
        <div className="flex items-center gap-2">
          <AlignMark className="w-3.5 h-4.5" />
          <span className="font-display font-semibold text-lg tracking-tight">
            Align
          </span>
          <span className="hidden sm:inline text-xs text-[#9AA0A8] ml-2 tracking-wide">
            form, measured
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: isTracking ? GOOD : "#5A5F66" }}
          />
          <span className="text-xs uppercase tracking-widest text-[#9AA0A8]">
            {isTracking ? "Tracking" : status === "loading" ? "Loading" : "Idle"}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row gap-3 px-3 pt-3 pb-3 min-h-0">
        {/* LEFT — camera */}
        <div className="relative flex-1 md:w-1/2 overflow-hidden border border-[#22252A] bg-black min-h-[40vh]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full -scale-x-100"
          />

          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-[#9AA0A8]">
              Loading pose model…
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-[#C79A66] text-center px-6">
              Couldn't load the pose model. Check your internet connection and refresh.
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-[#C79A66] text-center px-6">
              {cameraError}
            </div>
          )}
          {status === "ready" && !landmarks && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-[#F3F1EC] text-sm px-4 py-2">
              Step back so your full body is visible.
            </div>
          )}
        </div>

        {/* RIGHT — readable-at-distance stats panel */}
        <div className="flex-1 md:w-1/2 border border-[#22252A] bg-[#17181C] p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Goal row */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2 text-sm text-[#9AA0A8]">
              <span className="uppercase tracking-widest text-xs">Goal</span>
              <input
                type="number"
                min={1}
                max={100}
                value={goal}
                onChange={(e) => setGoal(Math.max(1, Number(e.target.value) || 1))}
                className="w-12 bg-transparent border-b border-[#33363C] text-[#F3F1EC] text-center font-display font-semibold focus:outline-none focus:border-[#F3F1EC]"
              />
              <span className="uppercase tracking-widest text-xs">perfect reps</span>
            </div>
            <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-[#9AA0A8]">
              <button
                onClick={squat.endSet}
                className="hover:text-[#F3F1EC] transition-colors"
              >
                End Set
              </button>
              <span className="text-[#33363C]">·</span>
              <button
                onClick={squat.reset}
                className="hover:text-[#F3F1EC] transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Progress — monochrome, restrained */}
          <div className="h-[2px] bg-[#22252A]">
            <div
              className="h-full bg-[#F3F1EC] transition-all duration-300"
              style={{ width: `${Math.min(100, (squat.perfectRepCount / goal) * 100)}%` }}
            />
          </div>

          {/* Counts */}
          <div className="flex items-baseline gap-8 py-1">
            <div>
              <div className="font-display text-7xl font-semibold tabular-nums leading-none">
                {squat.perfectRepCount}
              </div>
              <div className="text-xs uppercase tracking-widest text-[#9AA0A8] mt-2">
                Perfect
              </div>
            </div>
            <div className="border-l border-[#22252A] pl-8">
              <div className="font-display text-3xl font-medium tabular-nums leading-none text-[#9AA0A8]">
                {squat.repCount}
              </div>
              <div className="text-xs uppercase tracking-widest text-[#5A5F66] mt-2">
                Attempted
              </div>
            </div>
          </div>

          {/* Feedback — status conveyed by a left rule + label, not a color block */}
          <div
            className="flex-1 border-l-2 pl-5 py-2 flex flex-col justify-center"
            style={{ borderColor: statusColor }}
          >
            <div
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: statusColor }}
            >
              {isPerfect ? "Perfect" : isMiss ? "Missed" : "Status"}
            </div>
            <p className="text-2xl font-medium leading-snug">{squat.feedback}</p>
          </div>

          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[#9AA0A8] border-t border-[#22252A] pt-4">
            <span>Phase</span>
            <span className="text-[#F3F1EC]">{squat.phase}</span>
          </div>

          {squat.setSummary && (
            <div className="border-t border-[#22252A] pt-4">
              <div className="text-xs uppercase tracking-widest text-[#9AA0A8] mb-1">
                Set summary
              </div>
              <p className="text-sm text-[#D8D5CE]">{squat.setSummary}</p>
            </div>
          )}

          {squat.liveMetrics?.kneeAngle != null && (
            <div className="text-xs text-[#5A5F66] tabular-nums">
              knee {Math.round(squat.liveMetrics.kneeAngle)}°
              {squat.liveMetrics.kneeCaveRatio != null &&
                ` · knee/ankle ${squat.liveMetrics.kneeCaveRatio.toFixed(2)}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
