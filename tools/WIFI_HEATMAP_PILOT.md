# AHT Wi-Fi Heat Map — preview pilot v0.2.0

This tool is intentionally a **preview**, not an RF prediction or survey instrument.
Do not infer dBm, throughput, roaming performance, channel contention, or compliance
from its colored illustration.

## Open and test

1. Serve the repository on an HTTP port and open **Tools & Utilities → Wi-Fi Heat Map · Pilot**.
2. Open the same PDF used in the CCTV tool. Select the drawing scale.
3. **Place AP:** select indoor ceiling/wall or outdoor omni/directional mount, then click the plan.
4. **Select/Adjust:** the menu is on the right, with Select/Undo/Redo and Place Multiple
   pinned at the top. Drag an AP center to move it. Select the AP or click **Reshape**
   and drag yellow handles on the dashed outline (including handles clipped to the PDF edge).
   Change range, facing and make/model/notes
   in the sidebar. `Reset coverage shape` restores the default for its mount type.
5. **Walls:** choose approximate attenuation, then click-and-drag one line **or** click
   two endpoints. A live preview follows the pointer. Esc/Cancel abandons an unfinished
   line; click the completed line to drag its ends, delete it, or change attenuation.
6. **CCTV:** in the CCTV tool, use its review section to **Copy selected poles for Wi-Fi**
   (or **Copy all poles**). Return to Wi-Fi, open the same PDF and click **Paste CCTV poles**.
   Alternatively import the existing CCTV work JSON, selecting this page or all pages.
   Multi-head arms and devices are shown; viewing cones and standalone cameras are not.
   CCTV-specific PDF rotations are converted on import. PDFs with different filenames,
   page counts, sizes or available content hashes are blocked rather than guessed.
7. Save the **editable Wi-Fi JSON**. Export the marked-up PDF to get all pages, or
   reopen matching PDF and JSON to continue later.
8. Right-click an item for **Copy / Paste Here / Duplicate / Delete**, or use
   Cmd/Ctrl+C/V, Delete, Undo and Redo. CCTV poles can be selected and deleted in Wi-Fi.

## Color and geometry

- Default color: **red** strongest nearest AP, **orange** moderate, **yellow** at the
  outer estimated edge, then transparent. Opacity and each AP's visibility are editable.
- Indoor ceiling and outdoor pole omni start with equal all-around radius.
- Wall-facing and pole directional begin with different forward-focused profiles.
- All shapes are composed of 24 editable radial sectors; each edge handle can move.
- An obstruction shortens rays that cross its line. The attenuation percentage is a
  deliberately simple planning assumption, not a material-characterization database.
- A full-page CCTV pole import replaces the imported poles on that page; **All pages**
  replaces the imported pole set. AP layouts and obstruction lines remain intact.

## Guardrails and limitations

- Import is blocked when PDF filenames differ. Modern clipboard copies also verify
  page counts, sizes and content fingerprints to prevent silent cross-drawing shifts.
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
node --test tools/tests/aht-wifi-ui-behavior.test.cjs
node --check tools/aht-wifi-coverage-core-v1.js
node --check tools/aht-wifi-heatmap-ui-v1.js
node --check tools/aht-cctv-wifi-bridge-v1.js
```
