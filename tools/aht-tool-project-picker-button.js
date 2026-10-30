/* Lightweight bridge shared by all five markup editors.
 * Does not expose Graph tokens in the iframe; the authenticated dashboard
 * retrieves the PDF and injects it into the EXISTING PDF input handler.
 */
(function () {
  'use strict';
  const choose = document.getElementById('chooseBtn');
  const input = document.getElementById('fileInput');
  if (!choose || !input) return;
  const row = document.createElement('div');
  row.className = 'aht-source-switch';
  row.style.cssText = 'margin-top:7px;display:flex;gap:7px;align-items:stretch';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'ahtOpenProjectPdf';
  button.textContent = 'Browse SharePoint project PDFs…';
  button.style.cssText = 'width:100%;padding:9px 8px;border:1px solid #abc5d9;border-radius:7px;background:#eff6fa;color:#205c82;font:inherit;font-weight:650;font-size:12px;cursor:pointer;';
  button.addEventListener('click', () => {
    try {
      if (window.parent === window ||
          !window.parent.AHTProjectDocumentPicker ||
          typeof window.parent.AHTProjectDocumentPicker.openForEditor !== 'function') {
        window.alert('Open this editor through Project Control > Tools & Utilities to browse SharePoint. Local PDFs remain available.');
        return;
      }
      window.parent.AHTProjectDocumentPicker.openForEditor(window);
    } catch (_) {
      window.alert('The dashboard document picker is unavailable. You can still use Choose plan PDF to open a local file.');
    }
  });
  row.appendChild(button);
  choose.insertAdjacentElement('afterend', row);
})();
