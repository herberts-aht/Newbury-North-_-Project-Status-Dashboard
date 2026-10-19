/* AHT Project Plan Scheduling v1 — no fabricated due dates. */
window.AHTScheduling = (() => {
  const modes = ['Firm', 'Tentative', 'Floating', 'TBD'];
  const iso = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  function businessDays(start, offset) {
    if (!iso(start)) return '';
    const d = new Date(start + 'T12:00:00Z');
    if (Number.isNaN(d.getTime())) return '';
    const days = Number(offset);
    if (!Number.isInteger(days) || days < 0 || days > 365) return '';
    let remaining = days;
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining--;
    }
    return d.toISOString().slice(0,10);
  }
  function mode(item) { return modes.includes(item?.scheduleMode) ? item.scheduleMode : ''; }
  function target(item) {
    if (mode(item) === 'Floating') return businessDays(item.scheduleTriggerDate, item.scheduleOffsetDays);
    if (mode(item) === 'TBD') return '';
    return iso(item?.targetDate);
  }
  function dateLabel(item) {
    const m=mode(item);
    if (m === 'TBD') return 'TBD · review ' + (iso(item.scheduleReviewDate) || 'needed');
    if (m === 'Floating' && !target(item)) return 'Floating · review ' + (iso(item.scheduleReviewDate) || 'needed');
    if (m === 'Floating') return target(item) + ' · dependent';
    if (m === 'Tentative') return (target(item) || '—') + ' · estimate';
    return target(item) || '—';
  }
  // Dates are calendar weekdays; holiday calendars are not yet applied.
  return {modes, businessDays, mode, target, dateLabel, iso};
})();
