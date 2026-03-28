const { pickAnimationFrame } = await import("../output/esm/app/animation-frame.js");

const frames = ["transform-0", "transform-1", "transform-2", "ice-block"];

const samples = {
  atStart: pickAnimationFrame(frames, 0, 100, "hold"),
  duringTransform: pickAnimationFrame(frames, 220, 100, "hold"),
  afterFreeze: pickAnimationFrame(frames, 900, 100, "hold"),
  walkingLoop: pickAnimationFrame(frames, 900, 100, "loop"),
};

const pass = samples.atStart === "transform-0"
  && samples.duringTransform === "transform-2"
  && samples.afterFreeze === "ice-block"
  && samples.walkingLoop === "transform-1";

console.log(JSON.stringify({
  samples,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
