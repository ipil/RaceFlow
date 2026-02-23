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

1. Load a route via **Upload GPX** or **Load sample route**.
2. Edit waves (start time, runner count, min/max pace sec/km).
3. Click **Generate runners**.
4. Use **Play/Pause**, **Reset**, slider scrub, and playback speed to inspect movement and density coloring.

## Notes

- Runners are rendered on one canvas overlay (no per-runner Leaflet markers).
- Density colors are computed in 50m route bins with neighbor smoothing.
