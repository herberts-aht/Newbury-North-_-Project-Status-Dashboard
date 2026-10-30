/* One semantic vocabulary for displayed operational statuses and schedule health.
   This file never changes data or the meaning of a task's existing status. */
(function (root) {
  "use strict";
  function normalize(value) {
    var label = String(value == null ? "" : value).trim().toLowerCase().replace(/[_–—-]+/g, " ").replace(/\s+/g, " ");
    if (!label) return "neutral";
    if (/overdue|past due|late deadline/.test(label)) return "overdue";
    if (/blocked|dependency conflict/.test(label)) return "blocked";
    if (/schedule review needed|review needed|date needs review/.test(label)) return "review-needed";
    if (/at risk|risk of/.test(label)) return "at-risk";
    if (/due soon/.test(label)) return "due-soon";
    if (/in progress|active|underway/.test(label)) return "in-progress";
    if (/awaiting review|pending review/.test(label)) return "review";
    if (/\bwaiting\b|awaiting (?!plans)|on hold/.test(label)) return "waiting";
    if (/completed|complete|received|resolved|approved|healthy|on track/.test(label)) return "complete";
    if (/planned|planning|not started|pending|tbd|unknown|awaiting plans/.test(label)) return "neutral";
    if (/outstanding|open|denied/.test(label)) return "blocked";
    return "neutral";
  }
  function classFor(value) { return "aht-status--" + normalize(value); }
  function escapeStatus(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function badge(value, escapeFn) {
    var label = String(value == null || value === "" ? "—" : value);
    return '<span class="aht-status-pill ' + classFor(label) + '">' +
      (typeof escapeFn === "function" ? escapeFn(label) : escapeStatus(label)) + '</span>';
  }
  root.AHTStatusUI = Object.freeze({ normalize:normalize, classFor:classFor, badge:badge });
})(typeof window !== "undefined" ? window : globalThis);
