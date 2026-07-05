import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

/**
 * Loads MediaPipe's PoseLandmarker (free, Apache-2.0, runs fully client-side)
 * and continuously runs pose detection against a given <video> element.
 *
 * Returns:
 *  - landmarks: the latest set of 33 pose landmarks (or null if none detected)
 *  - status: "loading" | "ready" | "error"
 */
export function usePoseLandmarker(videoRef) {
  const [status, setStatus] = useState("loading");
  const [landmarks, setLandmarks] = useState(null);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        // WASM runtime + the pose model itself are fetched from MediaPipe's
        // public CDN the first time this loads, then cached by the browser.
        // No API key, no account, no payment involved.
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });

        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setStatus("ready");
        loop();
      } catch (err) {
        console.error("Failed to load pose landmarker", err);
        if (!cancelled) setStatus("error");
      }
    }

    function loop() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.readyState >= 2) {
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          if (result.landmarks && result.landmarks.length > 0) {
            setLandmarks(result.landmarks[0]);
          } else {
            setLandmarks(null);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    setup();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
    };
    // videoRef is a stable ref object; effect should only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { landmarks, status };
}
