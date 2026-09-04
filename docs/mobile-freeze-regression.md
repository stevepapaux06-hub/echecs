# Mobile startup regression

## Cause and scope

On production commit `c261c01`, the client entry imported `training/library.ts`
directly, and indirectly through `analyze -> generate`. Module initialization
rebuilt annotations, classified and validated thousands of bank/reference
positions synchronously before React could hydrate the navigation.

Production reproduction (cold browser contexts):

- Chromium, Pixel 7 profile, 390 × 844, touch, CPU ×4: a **116,022 ms** main-thread
  task; the initial Analyser tap did not activate the screen. The regression's
  real touch swipe also timed out at 10 seconds.
- WebKit, iPhone 13 profile, 390 × 844, touch: Analyser did not respond within
  15 seconds; the regression subsequently failed on navigation as well.
- Desktop Chromium also missed early navigation during initialization.
- No page exceptions or fullscreen event interceptor were found. After loading,
  native Android touch scrolling worked with `overflow: hidden` both enabled and
  disabled on the main container. No CSS, global event or chessboard gesture
  change was needed.

## Fix

The existing library remains the authoritative, unchanged build/audit pipeline.
`pnpm bank:compile` serializes its exact 5,068 active exercises (including their
solutions, annotations and assessments). The generated, ignored runtime module
uses JSON parsing instead of a giant object literal. `dev` and `build` regenerate
it automatically; run `pnpm bank:compile` before standalone tests/typecheck in a
fresh checkout. No source bank content or pedagogical rules were edited.

The client imports this runtime library only when training is opened. Analysis
code is likewise imported at the existing analysis entry point. Navigation and
forms stay independent of the bank. Loading has a visible status, a retry state,
and no modal or scroll lock. Successful imports are cached across navigation.

## Repeatable checks

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm build
pnpm typecheck
pnpm exec vitest run src/domain/training/library-runtime.test.ts src/domain/training/session.test.ts src/domain/training/sequence.test.ts src/domain/training/generate.test.ts
pnpm start --port 3012
pnpm test:mobile
```

Set `CHESSPATH_TEST_URL` to test a deployment; `CHESSPATH_TEST_DEVICE` optionally
filters iPhone, Android or Desktop. Tests use isolated unauthenticated contexts.
The analysis request is intercepted only to prove the form submits exactly once,
without analysing or modifying a user's games. Training uses real Stockfish.

Checks cover scrollY, all five navigation tabs, actual hit targets, form focus,
submit, training launch/reset/return, document scroll locks, fullscreen interceptors
and unhandled exceptions. Host-side deadlines also detect a frozen page thread.
Android uses native touch start/move/end; WebKit uses touch taps and native
scroll-into-view because Playwright does not implement mobile WebKit swipes.
These are device simulations, not tests on physical phones.

The unit regression compares the entire compiled runtime bank to the original
pipeline, plus exact transfer/difficulty ordering. Session and sequence tests
protect the existing progression. Generated screenshots remain in ignored
`outputs/` and are not deployed.
