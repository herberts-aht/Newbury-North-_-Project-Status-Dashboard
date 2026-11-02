/* AHT Project Control | compact, non-duplicated development build label */
(function () {
  'use strict';
  function fromLoadedScript() {
    var nodes = document.querySelectorAll('script[src]');
    for (var i = 0; i < nodes.length; i++) {
      var src = nodes[i].getAttribute('src') || '';
      if (!/(?:^|\/)field-reporting\.js(?:\?|$)/i.test(src)) continue;
      var match = src.match(/[?&]v=spv(\d)(\d)(?:&|$)/i);
      if (match) return match[1] + '.' + match[2];
    }
    return '';
  }
  function render() {
    var cfg = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : {};
    var meta = window.AHT_BUILD_INFO || {};
    var dashboardVersion = String(cfg.version || 'unknown');
    // Prefer the installed script actually loaded by the page. Build metadata can
    // be stale when a Field Reporting upgrade occurs after the version installer.
    var frVersion = fromLoadedScript() || String(meta.fieldReporting || '').trim();
    var label = 'Dashboard v' + dashboardVersion + (frVersion ? ' · Field Reporting v' + frVersion : '');
    var host = String(location.hostname || '').toLowerCase();
    var preview = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.github.dev') || host.endsWith('.app.github.dev');
    var commit = String(meta.sourceCommit || '').slice(0, 10);
    var secondary = preview ? 'LOCAL PREVIEW' : 'HOSTED';
    if (commit) secondary += ' · saved base ' + commit;
    var footer = document.getElementById('sidebarVersion');
    if (footer) {
      footer.replaceChildren();
      var first = document.createElement('span');
      first.textContent = label;
      first.style.display = 'block';
      first.style.overflowWrap = 'break-word';
      var second = document.createElement('span');
      second.textContent = secondary;
      second.style.display = 'block';
      second.style.marginTop = '3px';
      second.style.fontSize = '10px';
      second.style.opacity = '.85';
      footer.appendChild(first);
      footer.appendChild(second);
      footer.title = 'Saved Git base is not a precise build identifier if local files have changed.';
    }
    // The dashboard has a separate mobileVersion element. On desktop it
    // otherwise appears beneath the regular sidebar footer, duplicating labels.
    if (!document.getElementById('aht-version-no-duplicate')) {
      var style = document.createElement('style');
      style.id = 'aht-version-no-duplicate';
      style.textContent = '@media (min-width: 981px) { #mobileVersion { display: none !important; } }';
      document.head.appendChild(style);
    }
    var mobile = document.getElementById('mobileVersion');
    if (mobile) mobile.textContent = label + ' · ' + (preview ? 'PREVIEW' : 'HOSTED');
    var tag = document.getElementById('versionTag');
    if (tag) tag.textContent = label;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
