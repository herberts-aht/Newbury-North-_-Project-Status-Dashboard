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
  const pageHeader = document.querySelector('#tools > .page-header');
  const toolbar = panel.querySelector('.aht-hub-toolbar');
  let originalPanelStyle = null;
  let originalHeaderStyle = null;
  let headerTop = null;
  if (!(menu && panel && frame && title && back && pageHeader && toolbar)) return;

  const tools = Object.freeze({
    lighting: {name: 'Lighting / Keypads / PIR', path: 'tools/AHT_pir_tool_flow_v9_9.html'},
    shades: {name: 'Shades & Drapery', path: 'tools/AHT_shades_tool_pilot_v3.html'},
    cctv: {name: 'CCTV Cameras', path: 'tools/AHT_cctv_workflow_pilot_v3.html'},
    speakers: {name: 'Speakers / Subwoofers', path: 'tools/AHT_speakers_workflow_pilot_v5.html'},
    access: {name: 'Access Control', path: 'tools/AHT_access_workflow_pilot_v3.html'},
    labels: {name: 'Wire Label Printer', path: 'tools/AHT_Wire_Label_Print_Tool.html'}
  });

  let current = null;

  // Dashboard capability check. Hiding navigation alone must never grant editor access.
  // This is a UI/session guard, not a replacement for SharePoint authorization.
  function canOpenToolHub() {
    try {
      return typeof currentUser !== 'undefined' && Boolean(currentUser && currentUser.canEdit);
    } catch (_) {
      return false;
    }
  }

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
    // Header and drawing use identical workspace edges, clear of the sidebar.
    // Capture the natural header position before taking it out of document flow.
    if (headerTop === null) headerTop = pageHeader.getBoundingClientRect().top;
    const maxHeaderTop = Math.max(100, Math.round(window.innerHeight * 0.27));
    const headingTop = Math.max(86, Math.min(Math.round(headerTop), maxHeaderTop));
    pageHeader.style.setProperty('position', 'fixed', 'important');
    pageHeader.style.setProperty('top', headingTop + 'px', 'important');
    pageHeader.style.setProperty('left', left + 'px', 'important');
    pageHeader.style.setProperty('width', width + 'px', 'important');
    pageHeader.style.setProperty('max-width', 'none', 'important');
    pageHeader.style.setProperty('margin', '0', 'important');
    pageHeader.style.setProperty('z-index', '61', 'important');
    pageHeader.style.setProperty('display', 'flex', 'important');
    pageHeader.style.setProperty('align-items', 'center', 'important');
    pageHeader.style.setProperty('justify-content', 'space-between', 'important');
    pageHeader.style.setProperty('gap', '12px', 'important');
    // No separate toolbar row; begin the drawing directly beneath the header.
    const top = Math.round(pageHeader.getBoundingClientRect().bottom + 10);
    const bottom = 14;
    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('top', top + 'px', 'important');
    panel.style.setProperty('left', left + 'px', 'important');
    panel.style.setProperty('width', width + 'px', 'important');
    panel.style.setProperty('max-width', 'none', 'important');
    panel.style.setProperty('height', Math.max(290, window.innerHeight - top - bottom) + 'px', 'important');
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
    // Restore the toolbar to its original DOM position so menu and editor remain reversible.
    panel.insertBefore(toolbar, frame);
    pageHeader.classList.remove('aht-tools-editor-header');
    if (originalHeaderStyle !== null) pageHeader.setAttribute('style', originalHeaderStyle);
    else pageHeader.removeAttribute('style');
    if (originalPanelStyle !== null) panel.setAttribute('style', originalPanelStyle);
    else panel.removeAttribute('style');
    frame.removeAttribute('style');
    originalHeaderStyle = null;
    originalPanelStyle = null;
    headerTop = null;
  }
  window.addEventListener('resize', () => { if (current) positionEditor(); });

  function confirmClose() {
    return window.confirm('Before leaving this tool, export your marked-up PDF and save your work (JSON), if needed. Any unsaved edits in the editor will be lost. Continue?');
  }
  function openTool(key) {
    if (!canOpenToolHub()) {
      window.alert('Tools & Utilities is available to Editors, Project Admins, and Admins.');
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(tools, key)) return;
    if (current && current !== key && !confirmClose()) return;
    if (current === key) return;
    current = key;
    title.textContent = tools[key].name;
    menu.hidden = true;
    panel.hidden = false;
    originalPanelStyle = panel.getAttribute('style');
    originalHeaderStyle = pageHeader.getAttribute('style');
    headerTop = pageHeader.getBoundingClientRect().top;
    pageHeader.classList.add('aht-tools-editor-header');
    pageHeader.appendChild(toolbar);  // Preserve existing Back / title / Fit handlers.
    if (fitButton) fitButton.hidden = key === 'labels';
    positionEditor();
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
