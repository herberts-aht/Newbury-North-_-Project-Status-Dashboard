# AHT Wi-Fi Heat Map — preview pilot v0.6.1 (`wifi-20261123-b`)

This tool is intentionally a **preview**, not an RF prediction or survey instrument.
Do not infer dBm, throughput, roaming performance, channel contention, or compliance
from its colored illustration.

## Open and test

1. Serve the repository on an HTTP port and open **Tools & Utilities → Wi-Fi Heat Map · Pilot**.
2. Open the same PDF used in the CCTV tool. Select the drawing scale.
3. **Place AP:** select indoor ceiling/wall or outdoor omni/directional mount, then click the plan.
4. **Select/Adjust:** the menu is on the right, with full-width Select/Adjust above
   Undo/Redo and Place Multiple pinned at the top. Drag an AP center to move it.
   Select the AP or click **Reshape**
   and drag yellow handles on the dashed outline (including handles clipped to the PDF edge).
   Change facing, make/model/notes, and the per-radio signal ranges
   in the sidebar. Neighboring directions deform softly as you drag; **Soften selected
   outline** rounds previously edited shapes. **Reset coverage shape** restores the mount default.
5. **Obstructions:** Step 2 only places APs; all obstructions are created in Step 4.
   Follow the four small steps: choose shape, choose material, click the full-width
   **Draw obstruction on PDF** button (green while drawing), then draw on the plan.
   - **Line**, **rectangle** and **circle/oval**: click and drag between opposite
     points, or click a start and end point.
   - **Freeform LINE**: click multiple bends and **press Enter** to finish. The
     line stays **open**; no segment joins the first and last points.
   - **Freeform AREA**: click around an irregular footprint and **press Enter**
     to finish. This intentionally closes to its starting point. A prominent
     overlay prompt, modeled after CCTV Senstar, reminds you to press Enter.
   - Select an existing freeform area to switch it to an **OPEN line** without
     redrawing or losing any vertices (or switch an open path back to an area).
   - **Esc** cancels drawing and returns the button to blue. The global Show
     Obstructions checkbox controls all items.
   - Select an obstruction on the PDF or in the **Edit a placed obstruction**
     dropdown (including hidden ones). Drag its outline to move, or its handles
     to reshape. Each has its own **color, transparency, outline visibility,
     editable text label, adjustable label text size (7–28 pt), label visibility, and independently draggable label**
     with a leader line. Undo/Redo, copy/paste, JSON and PDF export preserve them.
6. **CCTV:** in the CCTV tool, use its review section to **Copy selected poles for Wi-Fi**
   (or **Copy all poles**). Return to Wi-Fi, open the same PDF and click **Paste CCTV poles**.
   Alternatively import the existing CCTV work JSON, selecting this page or all pages.
   Multi-head arms and devices are shown; viewing cones and standalone cameras are not.
   CCTV-specific PDF rotations are converted on import. PDFs with different filenames,
   page counts, sizes or available content hashes are blocked rather than guessed.
7. **Drawing Key:** Step 6 automatically lists only actual visible device and obstruction
   symbol types on the current PDF sheet. Multiple matching APs produce one AP row,
   while different displayed obstruction types/materials get their own entries.
   Rename each row and customize its description. Show/hide the key globally or on
   individual sheets, drag it on the plan, scale it from 65–200%, and use X/Y for
   fine positioning. Settings are retained in Wi-Fi work JSON and included on the
   exported marked-up PDF when enabled.
8. Brief bottom-left drawing notices auto-hide after about six seconds (ten for
   errors) and can be dismissed immediately with ×.
9. Save the **editable Wi-Fi JSON**. Export the marked-up PDF to get all pages, or
   reopen matching PDF and JSON to continue later.
10. Right-click an item for **Copy / Paste Here / Duplicate / Delete**, or use
   Cmd/Ctrl+C/V, Delete, Undo and Redo. CCTV poles can be selected and deleted in Wi-Fi.

## Color and geometry

- Default color: **red** strongest nearest AP, **orange** moderate, **yellow** at the
  outer estimated edge, then transparent. Opacity and each AP's visibility are editable.
- Each AP can have **2.4 GHz, 5 GHz, or both** radios enabled. Select the radio being edited
  and independently set the reach of the **strong (red), moderate (orange), and marginal
  (yellow)** areas, in feet. The ranges remain ordered so the colors don't cross.
- New APs start at an illustrative **25 / 40 / 60 ft** for 2.4 GHz and
  **18 / 30 / 45 ft** for 5 GHz; these are editable planning defaults, not
  manufacturer-specific specifications. An older saved JSON without the radio settings
  uses matching defaults based on its original estimated AP range.
- The global **Display radio coverage** menu switches between 2.4 GHz only, 5 GHz
  only, and combined. Combined takes the longest estimated reach for each color from
  either enabled band instead of artificially stacking opacity. Exported PDF uses the
  same view that is shown in the editor, and JSON preserves the AP's independent settings.
- Indoor ceiling and outdoor pole omni start with equal all-around radius.
- Wall-facing and pole directional begin with different forward-focused profiles.
- Heat-map contours are rendered smoothly between the 24 editable radial handles.
- An obstruction shortens rays that cross an open line, polygon boundary, rectangle
  or ellipse. The attenuation percentage is a
  deliberately simple planning assumption, not a material-characterization database.
- A full-page CCTV pole import replaces the imported poles on that page; **All pages**
  replaces the imported pole set. AP layouts and obstructions remain intact.

## Keep the existing Codespace preview on port 8000

Save current work JSON before refreshing the browser. Leave the existing server
running, then update the **same preview folder** from its PowerShell terminal:

```powershell
git -C /workspaces/AHT-Wifi-Preview fetch origin codex/wifi-heatmap-pilot-20261122
git -C /workspaces/AHT-Wifi-Preview switch --detach FETCH_HEAD
```

Refresh the current port 8000 browser tab; no new port or server is required.
Do not merge the draft PR to main until the preview has been reviewed.

## Guardrails and limitations

- Import is blocked when PDF filenames differ. Modern clipboard copies also verify
  page counts, sizes and content fingerprints to prevent silent cross-drawing shifts.
- The local pole clipboard is per browser origin; JSON import is a portable alternative.
- Page positions are preserved in PDF viewport coordinates and editable work JSON.
- Wi-Fi JSON format v5 preserves the drawing key in addition to radio ranges, visible
  band and obstruction label text sizes. Existing v3/v4 files remain readable. Save your current JSON
  before testing a newer preview.
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
