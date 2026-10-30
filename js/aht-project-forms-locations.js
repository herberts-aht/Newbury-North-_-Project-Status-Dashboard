/* AHT Project Forms — verified SharePoint folder roots.
 * Only an authorized site owner should maintain these mapping URLs in source control.
 * Naples and Aspen Projects library roots verified against their SharePoint site drives.
 * Add other offices only after verifying their exact SharePoint document-library URLs.
 * Users may navigate BELOW the selected project/office root; the picker will not
 * start at the unscoped SharePoint library root.
 *
 * Example for other offices (not configured):
 * offices: { OfficeName: 'https://yourtenant.sharepoint.com/sites/YOUR_SITE/Projects' }
 * projects: { '2200': 'https://yourtenant.sharepoint.com/sites/YOUR_SITE/Shared%20Documents/.../2200' }
 */
window.AHT_PROJECT_FORMS_FOLDER_ROOTS = Object.freeze({
  offices: Object.freeze({
    Naples: 'https://ahtglobalteam.sharepoint.com/sites/Naples/Projects',
    Aspen: 'https://ahtglobalteam.sharepoint.com/sites/Aspen/Projects',
  }),
  projects: Object.freeze({
    // '2200': 'PASTE VERIFIED 2200 PROJECT DOCUMENT ROOT URL HERE',
  })
});
