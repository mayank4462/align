# Align — posture & form coaching

This is the first working piece of the project: it opens your laptop camera,
runs Google's MediaPipe Pose Landmarker model fully in your browser, and draws
a live skeleton over your body.

Everything here is free and open-source:
- React + Vite (MIT)
- Tailwind CSS (MIT)
- MediaPipe Pose Landmarker (Apache 2.0, by Google) — the model file and WASM
  runtime are fetched from MediaPipe's public CDN the first time you load the
  page, then cached by your browser. No account, no API key, no payment.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually http://localhost:5173) in your
browser and allow camera access when prompted.

Stand back far enough that your whole body is visible — you should see a
teal-and-blue skeleton tracking your joints in real time.

## What's next

This is Phase 0 from the roadmap: pose detection is working. Next we'll turn
the raw joint positions into angles (knee, hip, back-lean) and build the
squat rep counter + form-checking rules on top of this.
