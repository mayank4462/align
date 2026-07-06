import { EXERCISES } from "./exercises";

function ExerciseCard({ exercise, onSelect }) {
  return (
    <button
      onClick={() => exercise.available && onSelect(exercise.id)}
      disabled={!exercise.available}
      className={`text-left border border-[#22252A] bg-[#17181C] p-5 transition-colors ${
        exercise.available
          ? "hover:border-[#F3F1EC] cursor-pointer"
          : "opacity-40 cursor-not-allowed"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-xl font-semibold">{exercise.name}</span>
        {!exercise.available && (
          <span className="text-[10px] uppercase tracking-widest text-[#5A5F66] border border-[#33363C] px-2 py-0.5 shrink-0">
            Coming soon
          </span>
        )}
      </div>
      <p className="text-sm text-[#9AA0A8] mt-2">{exercise.description}</p>
    </button>
  );
}

export default function ExerciseList({ onSelect }) {
  return (
    <div className="flex-1 flex flex-col items-center px-6 py-12 overflow-y-auto">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-3xl font-semibold mb-1">
          Choose an exercise
        </h1>
        <p className="text-[#9AA0A8] mb-8">Pick what you're training today.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {EXERCISES.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
