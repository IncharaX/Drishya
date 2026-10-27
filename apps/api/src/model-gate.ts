import { HttpError } from "./http-error";

let occupied = false;
// Both outline and storyboard generation share one local model slot.
export function reserveModel() {
  if (occupied)
    throw new HttpError(
      429,
      "Local generation is working on another outline, storyboard, or voiceover. Wait for it to finish, then retry.",
      "MODEL_BUSY",
    );
  occupied = true;
  let released = false;
  return () => {
    if (!released) {
      occupied = false;
      released = true;
    }
  };
}
