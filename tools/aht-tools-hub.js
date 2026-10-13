/* AHT Tool Hub — only the dashboard Tools view; no auth/router changes. */
(function () {
  'use strict';
  const hub = document.getElementById('aht-tools-hub');
  if (!hub) return;
  const menu = hub.querySelector('[data-aht-hub-menu]');
  const panel = hub.querySelector('[data-aht-hub-panel]');
  const frame = hub.querySelector('[data-aht-hub-frame]');
  const title = hub.querySelector('[data-aht-hub-title]');
  const back = hub.querySelector('[data-aht-hub-back]');
  const fitButton = hub.querySelector('[data-aht-hub-fit]');
  let originalPanelStyle = null;
  let editorTop = null;
  if (!(menu && panel && frame && title && back)) return;

  const tools = Object.freeze({
    lighting: {name: 'Lighting / Keypads / PIR', path: 'tools/AHT_pir_tool_flow_v9_8.html'},
    shades: {name: 'Shades & Drapery', path: 'tools/AHT_shades_tool_pilot_v2.html'},
    cctv: {name: 'CCTV Cameras', path: 'tools/AHT_cctv_workflow_pilot_v2.html'},
    speakers: {name: 'Speakers / Subwoofers', path: 'tools/AHT_speakers_workflow_pilot_v4.html'},
    access: {name: 'Access Control', path: 'tools/AHT_access_workflow_pilot_v2.html'},
    labels: {name: 'Wire Label Printer', path: 'tools/AHT_Wire_Label_Print_Tool.html'}
  });

  let current = null;

  // The dashboard's normal content column intentionally has a modest max-width.
  // A CSS-only breakout can be clipped by one of its scroll containers.
  // The editor therefore occupies the *main workspace* (beside sidebar,
  // below existing dashboard headings), without covering navigation or auth.
  function leftNavigationEdge() {
    const candidates = document.querySelectorAll(
      'aside, nav, #sidebar, .sidebar, .app-sidebar, .side-nav, [class*="sidebar"], [id*="sidebar"]'
    );
    let railRight = 0;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      const css = window.getComputedStyle(element);
      if (css.display === 'none' || css.visibility === 'hidden') continue;
      if (rect.left > 30 || rect.width < 96 || rect.width > 345) continue;
      if (rect.height < window.innerHeight * 0.48 || rect.right > window.innerWidth * 0.44) continue;
      railRight = Math.max(railRight, rect.right);
    }
    // Falls back to a conservative sidebar width in this dashboard layout.
    return railRight || (window.innerWidth > 780 ? 156 : 0);
  }
  function positionEditor() {
    if (!current || panel.hidden) return;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const rail = leftNavigationEdge();
    const left = Math.max(12, Math.round(rail + (rail ? 18 : 12)));
    const right = viewportWidth > 850 ? 20 : 12;
    const width = Math.max(320, viewportWidth - left - right);
    // Set when first opened, before fixed positioning removes it from flow.
    if (editorTop === null) editorTop = panel.getBoundingClientRect().top;
    const maxTop = Math.max(125, Math.round(window.innerHeight * 0.33));
    const top = Math.max(110, Math.min(Math.round(editorTop), maxTop));
    const bottom = 14;
    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('top', top + 'px', 'important');
    panel.style.setProperty('left', left + 'px', 'important');
    panel.style.setProperty('width', width + 'px', 'important');
    panel.style.setProperty('max-width', 'none', 'important');
    panel.style.setProperty('height', Math.max(390, window.innerHeight - top - bottom) + 'px', 'important');
    panel.style.setProperty('transform', 'none', 'important');
    panel.style.setProperty('z-index', '60', 'important');
    panel.style.setProperty('display', 'flex', 'important');
    panel.style.setProperty('flex-direction', 'column', 'important');
    panel.style.setProperty('overflow', 'hidden', 'important');
    panel.style.setProperty('min-height', '0', 'important');
    frame.style.setProperty('flex', '1 1 0', 'important');
    frame.style.setProperty('height', 'auto', 'important');
    frame.style.setProperty('min-height', '0', 'important');
    frame.style.setProperty('max-height', 'none', 'important');
  }
  function clearEditorLayout() {
    if (originalPanelStyle !== null) panel.setAttribute('style', originalPanelStyle);
    else panel.removeAttribute('style');
    frame.removeAttribute('style');
    originalPanelStyle = null;
    editorTop = null;
  }
  window.addEventListener('resize', () => { if (current) positionEditor(); });

  function confirmClose() {
    return window.confirm('Before leaving this tool, export your marked-up PDF and save your work (JSON), if needed. Any unsaved edits in the editor will be lost. Continue?');
  }
  function openTool(key) {
    if (!Object.prototype.hasOwnProperty.call(tools, key)) return;
    if (current && current !== key && !confirmClose()) return;
    if (current === key) return;
    current = key;
    title.textContent = tools[key].name;
    menu.hidden = true;
    panel.hidden = false;
    originalPanelStyle = panel.getAttribute('style') || '';
    editorTop = panel.getBoundingClientRect().top;
    positionEditor();
    if (fitButton) fitButton.hidden = key === 'labels';
    frame.src = tools[key].path;
  }
  function closeTool() {
    if (!current || !confirmClose()) return;
    frame.src = 'about:blank';
    clearEditorLayout();
    current = null;
    panel.hidden = true;
    menu.hidden = false;
  }
  hub.querySelectorAll('[data-aht-tool]').forEach(btn => {
    btn.addEventListener('click', () => openTool(btn.getAttribute('data-aht-tool')));
  });
  back.addEventListener('click', closeTool);
  if (fitButton) fitButton.addEventListener('click', () => {
    if (!current || current === 'labels') return;
    // All approved markup editors are same-origin local HTML pages.
    // Use the editor's existing Fit button; do not reset annotations or change zoom logic.
    try {
      const fit = frame.contentDocument && frame.contentDocument.getElementById('zFit');
      if (fit) fit.click();
    } catch (err) {
      // If the embedded tool is not ready, its own Fit control remains available.
    }
  });
})();
