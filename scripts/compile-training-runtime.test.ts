import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { allConceptExercises } from "../src/domain/training/library";

// Run the existing, unchanged qualification/annotation pipeline once at build
// time, not synchronously on every visitor's UI thread before React hydrates.
it("compiles the exact active bank for the browser", () => {
  const exercises = allConceptExercises();
  expect(exercises.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(exercises);
  expect(JSON.parse(serialized)).toEqual(exercises);
  // Parsing JSON data avoids compiling 20 MB of object-literal JavaScript on
  // mobile. The generated module contains no inferred giant TypeScript type.
  writeFileSync("src/domain/training/runtime-bank.generated.ts", `// Generated; do not edit.\nexport default JSON.parse(${JSON.stringify(serialized)}) as unknown[];\n`);
  console.info(`Runtime bank: ${exercises.length} unchanged exercises, ${serialized.length} bytes`);
}, 30_000);
