/* AHT Mobile Field Update v2.9.8 — presentation-only entry to existing Field Reporting.
 * Runs for /field-update.html or the legacy ?fieldUpdate=1 URL. No parallel authentication, SharePoint writes,
 * notification logic, or approval flow. All submission behavior remains in
 * js/field-reporting.js with its existing project/role checks.
 */
(function () {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  // Dedicated URL survives an iOS home-screen launch even when query parameters do not.
  // Do not activate mobile mode for the normal dashboard (including other installed PWAs).
  const dedicatedPath = window.location.pathname.replace(/\/+$/, '') === '/field-update.html';
  if (!dedicatedPath && params.get('fieldUpdate') !== '1') return;

  const HOME = 'aht.fieldUpdate.lastProject';
  // An installed iPhone app may return to / after Microsoft sign-in.
  // Remember only standalone Field Update launches, not normal dashboard visits.
  try {
    if (window.navigator.standalone === true ||
        window.matchMedia?.('(display-mode: standalone)')?.matches) {
      sessionStorage.setItem('aht.fieldUpdate.standaloneReturn', String(Date.now()));
    }
  } catch (error) {
    console.warn('Field Update launch marker unavailable:', error);
  }
  const app = document.getElementById('app');
  const root = document.getElementById('fieldReporting');
  if (!app || !root) return;

  let started = false;
  function addHeadMetadata() {
    if (!document.querySelector('link[data-aht-field-manifest]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'field-update.webmanifest';
      manifest.setAttribute('data-aht-field-manifest', '1');
      document.head.appendChild(manifest);
    }
    if (!document.querySelector('link[data-aht-field-touch-icon]')) {
      const icon = document.createElement('link');
      icon.rel = 'apple-touch-icon';
      icon.href = 'assets/aht-field-update-180.png';
      icon.setAttribute('data-aht-field-touch-icon', '1');
      document.head.appendChild(icon);
    }
    for (const [name, content] of [
      ['apple-mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'default'],
      ['apple-mobile-web-app-title', 'AHT Field Update']
    ]) {
      if (!document.querySelector('meta[name="' + name + '"]')) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
      }
    }
    document.title = 'AHT Field Update';
  }

  function requireProjectSelection() {
    const select = root.querySelector('#fr-project');
    const submit = root.querySelector('#fr-submit');
    if (!select || !submit || select.dataset.ahtQuickWatched) return;
    select.dataset.ahtQuickWatched = '1';
    let confirmed = '';
    let updating = false;
    const wrap = root.querySelector('#fr-project-wrap');
    const hint = root.querySelector('#fr-project-hint');

    function resetUnconfirmed() {
      if (updating) return;
      updating = true;
      try {
        // The shared PM form sometimes repopulates this select and selects the first
        // project automatically. Mobile capture must instead show a blank prompt.
        let placeholder = Array.from(select.options).find(o => o.value === '');
        if (!placeholder) {
          placeholder = new Option('Select project…', '');
          select.insertBefore(placeholder, select.firstChild);
        }
        placeholder.disabled = true;
        if (wrap) wrap.hidden = false; // Even a single-project technician confirms the job.
        if (hint) hint.textContent = 'Choose the job for this report before submitting.';
        const stillValid = confirmed && Array.from(select.options).some(o => o.value === confirmed);
        if (!stillValid) {
          confirmed = '';
          select.value = '';
        } else if (select.value !== confirmed) {
          // A programmatic refresh is not a technician selection.
          select.value = confirmed;
        }
      } finally { updating = false; }
    }

    select.addEventListener('change', function (event) {
      if (!event.isTrusted) return; // Never accept programmatic selection as confirmation.
      confirmed = select.value;
      if (hint) hint.textContent = confirmed
        ? 'Project confirmed for this update.'
        : 'Choose the job for this report before submitting.';
    });

    // Capturing the click before the existing Field Reporting handler prevents any
    // upload when there has been no deliberate project choice. All normal SharePoint
    // and permission checks are still performed by the original handler afterward.
    root.addEventListener('click', function (event) {
      if (event.target !== submit && !submit.contains(event.target)) return;
      const valid = confirmed && select.value === confirmed &&
        Array.from(select.options).some(o => o.value === confirmed);
      if (valid) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (wrap) wrap.hidden = false;
      resetUnconfirmed();
      const status = root.querySelector('#fr-status');
      if (status) {
        status.textContent = 'Select the correct project before submitting your update.';
        status.className = 'fr-status fr-warning';
        status.hidden = false;
      }
      select.focus();
    }, true);

    new MutationObserver(resetUnconfirmed).observe(select, { childList: true });
    if (wrap) new MutationObserver(() => { if (wrap.hidden) wrap.hidden = false; })
      .observe(wrap, { attributes: true, attributeFilter: ['hidden'] });
    resetUnconfirmed();
  }

  function installQuickHeader() {
    if (root.querySelector('#aht-field-quick-header')) return;
    const header = document.createElement('div');
    header.id = 'aht-field-quick-header';
    header.className = 'aht-quick-header';
    header.innerHTML = '<div class="aht-quick-title"><span class="aht-quick-eyebrow">AHT PROJECT CONTROL</span><strong>Field Update</strong></div>'+
      '<div class="aht-quick-links"><button type="button" id="aht-quick-reports">My reports</button>'+
      '<button type="button" id="aht-quick-exit" aria-label="Open full dashboard" title="Open full dashboard">Dashboard</button></div>';
    root.prepend(header);

    const reports = header.querySelector('#aht-quick-reports');
    reports.addEventListener('click', function () {
      const reportsPanel = root.querySelector('#fr-pane-mine');
      const showingReports = reportsPanel && !reportsPanel.hidden;
      const nextTab = root.querySelector(showingReports ? '#fr-tab-capture' : '#fr-tab-mine');
      if (nextTab) nextTab.click();
      reports.textContent = showingReports ? 'My reports' : 'New update';
    });
    header.querySelector('#aht-quick-exit').addEventListener('click', function () {
      // Explicit exit clears standalone launch restoration before opening dashboard.
      try { sessionStorage.removeItem('aht.fieldUpdate.standaloneReturn'); } catch (_) {}
      window.location.href = '/';
    });
  }

  function prepareCopy() {
    const heading = root.querySelector('.fr-head h2');
    if (heading) heading.textContent = 'Quick daily update';
    const subheading = root.querySelector('.fr-head .fr-muted');
    if (subheading) subheading.textContent = 'Record or type what you did. Submit when finished.';
    const recordNote = root.querySelector('.fr-text-wrap .fr-muted');
    if (recordNote) {
      recordNote.textContent = 'Voice recordings save to SharePoint. Audio transcription is not connected yet; include a short text note if you want AI findings today.';
    }
    const label = root.querySelector('.fr-text-wrap label');
    if (label) label.textContent = 'Or type an update';
    const textarea = root.querySelector('#fr-text');
    if (textarea) textarea.placeholder = 'What did you finish? What is holding you up? What is next?';
    const submit = root.querySelector('#fr-submit');
    if (submit && !submit.disabled) submit.textContent = 'Submit field update';
  }

  function start() {
    if (started || app.classList.contains('hidden')) return;
    const field = window.AHTFieldReporting;
    if (!field || typeof field.canAccess !== 'function' || !field.canAccess()) {
      // No workaround for the dashboard's existing role/project permission gate.
      return;
    }
    if (typeof showView !== 'function') return;
    started = true;
    addHeadMetadata();
    document.body.classList.add('aht-field-quick-mode');
    showView('fieldReporting');
    // showView schedules the existing Field Reporting initialization first.
    queueMicrotask(function () {
      if (root.classList.contains('active') && root.querySelector('#fr-pane-capture')) {
        root.querySelector('#fr-tab-capture')?.click();
        installQuickHeader();
        requireProjectSelection();
        prepareCopy();
      }
    });
  }

  addHeadMetadata();
  // Auth and SharePoint project permissions can become ready after #app is shown.
  // Retry briefly, only for Field Update, without changing the access checks.
  new MutationObserver(start).observe(app, { attributes: true, attributeFilter: ['class'] });
  let ahtFieldUpdateRetryCount = 0;
  const ahtFieldUpdateRetryTimer = window.setInterval(function () {
    start();
    ahtFieldUpdateRetryCount++;
    if (started || ahtFieldUpdateRetryCount >= 80) {
      window.clearInterval(ahtFieldUpdateRetryTimer);
    }
  }, 250);
  window.addEventListener('pageshow', start);
  start();
})();
