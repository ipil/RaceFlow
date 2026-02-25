# RaceFlow

RaceFlow is a browser-only React app that simulates and animates ~1000 runners moving along a GPX route on a Leaflet map, rendered with a single canvas overlay.

## Run

1. Install Node.js 18+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Open the local Vite URL in your browser.

## Usage

1. The app auto-loads a built-in default route and lets you switch between two built-in maps in the **Default map** dropdown. You can also use **Upload GPX**.
2. Edit waves (start time, runner count, min/max pace in min/mile via minutes + seconds dropdowns).
3. Click **Play** to auto-generate runners from the current wave settings and start the simulation.
4. Use **Pause**, **Reset**, slider scrub, playback speed, density radius (2-20m), max-density color threshold, segment length, and route heat-map metric (average or maximum density) to inspect movement and congestion.

## Notes

- Runners are rendered on one canvas overlay (no per-runner Leaflet markers).
- Density colors are computed in 50m route bins with neighbor smoothing.
