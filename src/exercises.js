// Central registry of exercises. Adding a new one later means adding an
// entry here (and building its tracker component) — the home screen and
// routing don't need to change.
export const EXERCISES = [
  {
    id: "squats",
    name: "Squats",
    description: "Depth, tempo, and perfect-rep tracking, live.",
    available: true,
  },
  {
    id: "pushups",
    name: "Push-ups",
    description: "Elbow angle and body-line alignment.",
    available: false,
  },
  {
    id: "lunges",
    name: "Lunges",
    description: "Front and back knee angle, per side.",
    available: false,
  },
  {
    id: "plank",
    name: "Plank",
    description: "Hold duration and hip sag detection.",
    available: false,
  },
];
