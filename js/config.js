// Non-secret application configuration.
//
// Never place passwords, service keys, database secrets, or private SSO
// credentials in this file or any browser-delivered JavaScript.

const APP_CONFIG = Object.freeze({
  appName: "AHT Project Control",
  version: "0.9.0",
  buildDate: "2026-08-05",
  environment: "local",
  authProvider: "demo",
  dataProvider: "localStorage",
  backupFormatVersion: 2
});
