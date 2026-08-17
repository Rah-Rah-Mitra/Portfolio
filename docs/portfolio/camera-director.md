# Camera director workflow

The camera director is a development-only authoring surface. Start the local site and open `/?director=1` in Guided mode. Production builds remove the director import and UI; the public Engineer View is a separate semantic readout.

1. Navigate to the shared optical test bench.
2. Tune the active shot's FOV, clipping planes, and transition duration.
3. Use **Copy shot JSON** or **Download shot JSON**.
4. Validate the export before merging it:

   ```powershell
   npm run camera:merge-shots -- .\shot.camera-shot.json
   ```

5. Review the resulting diff in `world/narrativeManifest.json`, which is imported by the typed `world/narrativeManifest.ts` runtime. Camera positions, targets, focus/exposure, scroll ranges, responsive overrides, lighting, safe-text regions, and character framing belong in that consumed manifest—not in React components.

The validator rejects missing IDs/chapters, invalid clipping planes, FOV outside 5–120 degrees, and story-camera transitions longer than 450ms.
