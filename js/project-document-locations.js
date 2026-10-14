/* AHT Project Documents — office-level discovery v2.
 *
 * VERIFIED OFFICE LIBRARIES: add each office ONCE after checking its actual
 * SharePoint site URL and document library name. Do not guess other office URLs.
 *
 * The picker derives project access from dashboard assignments, then searches
 * ONLY the mapped office library for a top-level folder whose name ENDS with
 * that assigned project's exact street address. Ambiguous/missing matches
 * fail closed and require an explicit project-folder override below.
 *
 * This browser-side registry does not grant SharePoint privileges. Microsoft
 * access controls must enforce actual per-office and per-project file rights.
 */
window.AHT_OFFICE_DOCUMENT_LIBRARIES = Object.freeze([
  Object.freeze({office:'Naples', siteUrl:'https://ahtglobalteam.sharepoint.com/sites/Naples', library:'Projects', mode:'auto'})
  // Example ONLY — add when verified by IT / PnP:
  // Object.freeze({office:'Miami', siteUrl:'https://ahtglobalteam.sharepoint.com/sites/<VERIFIED-SITE>', library:'<VERIFIED-LIBRARY>', mode:'auto'})
]);

/* Explicit overrides for exceptions/ambiguous folders. Exact projectId is
 * preferred once known; an address match MUST also match the same office.
 * Leave the confirmed 2200 Gordon path here as a known-good fallback.
 */
window.AHT_PROJECT_DOCUMENT_LOCATIONS = Object.freeze([
  Object.freeze({
    office:'Naples',
    projectAddress:'2200 Gordon Dr',
    siteUrl:'https://ahtglobalteam.sharepoint.com/sites/Naples',
    library:'Projects',
    folder:'Newbury North Associates - 2200 Gordon Dr'
  })
]);
