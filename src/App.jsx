import { useState } from "react";
import ExerciseList from "./ExerciseList";
import SquatTracker from "./SquatTracker";
import { EXERCISES } from "./exercises";

const INK = "#F3F1EC";

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

// Maps an exercise id to the component that tracks it. Only squats exist
// right now — adding a new exercise later means adding a component here.
const TRACKERS = {
  squats: SquatTracker,
};

function App() {
  const [view, setView] = useState("home"); // "home" | an exercise id

  const activeExercise = EXERCISES.find((e) => e.id === view);
  const Tracker = TRACKERS[view];

  return (
    <div className="h-screen w-screen bg-[#121316] text-[#F3F1EC] flex flex-col overflow-hidden">
      <header className="flex items-center gap-4 px-6 py-4 shrink-0 border-b border-[#22252A]">
        {view !== "home" && (
          <button
            onClick={() => setView("home")}
            className="text-xs uppercase tracking-widest text-[#9AA0A8] hover:text-[#F3F1EC] transition-colors shrink-0"
          >
            ← Exercises
          </button>
        )}
        <div className="flex items-center gap-2">
          <AlignMark className="w-3.5 h-4.5" />
          <span className="font-display font-semibold text-lg tracking-tight">
            Align
          </span>
          <span className="hidden sm:inline text-xs text-[#9AA0A8] ml-2 tracking-wide">
            {activeExercise ? activeExercise.name : "form, measured"}
          </span>
        </div>
      </header>

      {/* The camera never loads on the home screen — only once an
          exercise is actually selected. */}
      {view === "home" && <ExerciseList onSelect={setView} />}
      {Tracker && <Tracker />}
    </div>
  );
}

export default App;
