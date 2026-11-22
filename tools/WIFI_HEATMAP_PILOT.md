# AHT Wi-Fi Heat Map — preview pilot v0.1.0

This tool is intentionally a **preview**, not an RF prediction or survey instrument.
Do not infer dBm, throughput, roaming performance, channel contention, or compliance
from its colored illustration.

## Open and test

1. Serve the repository on an HTTP port and open **Tools & Utilities → Wi-Fi Heat Map · Pilot**.
2. Open the same PDF used in the CCTV tool. Select the drawing scale.
3. **Place AP:** select indoor ceiling/wall or outdoor omni/directional mount, then click the plan.
4. **Select/Adjust:** drag an AP center to move it. Select it and drag any yellow outline
   handle to change reach in that direction. Change range, facing and make/model/notes
   in the sidebar. `Reset coverage shape` restores the default for its mount type.
5. **Walls:** choose approximate attenuation, click two endpoints. Drag its endpoints
   after selection or use the obstruction attenuation slider.
6. **CCTV:** in the CCTV tool, use its review section to **Copy selected poles for Wi-Fi**
   (or **Copy all poles**). Return to Wi-Fi, open the same PDF and click **Paste CCTV poles**.
   Alternatively import the existing CCTV work JSON. Multi-head arms and devices are
   shown; viewing cones are not. CCTV-specific PDF rotations are converted on import.
7. Save the **editable Wi-Fi JSON**. Export the marked-up PDF to get all pages, or
   reopen matching PDF and JSON to continue later.

## Color and geometry

- Default color: **red** strongest nearest AP, **orange** moderate, **yellow** at the
  outer estimated edge, then transparent. Opacity and each AP's visibility are editable.
- Indoor ceiling and outdoor pole omni start with equal all-around radius.
- Wall-facing and pole directional begin with different forward-focused profiles.
- All shapes are composed of 24 editable radial sectors; each edge handle can move.
- An obstruction shortens rays that cross its line. The attenuation percentage is a
  deliberately simple planning assumption, not a material-characterization database.
- A CCTV pole import replaces the previous set of imported poles; AP layouts remain.

## Guardrails and limitations

- User is warned before importing positions from a PDF with a different filename.
- The local pole clipboard is per browser origin; JSON import is a portable alternative.
- Page positions are preserved in PDF viewport coordinates and editable work JSON.
- The tool does **not** read measurements from equipment catalogs or perform calibrated
  propagation, reflected multipath, floor-to-floor signal, power budgets, or RF survey.
- Server-side file permissions are unchanged; dashboard tool grants control UI visibility
  only, subject to the existing SharePoint/file authorization policy.
- Future iterations can add calibrated RF settings, a measurement overlay, a common
  customizable per-page Drawing Key, and other CCTV device symbols (siren/strobe/RF).

## Automated checks

```bash
node --test tools/tests/aht-wifi-coverage.test.cjs
node --check tools/aht-wifi-coverage-core-v1.js
node --check tools/aht-wifi-heatmap-ui-v1.js
node --check tools/aht-cctv-wifi-bridge-v1.js
```
