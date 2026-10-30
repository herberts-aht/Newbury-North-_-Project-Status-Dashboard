/* AHT Guided Editor Workflow v1
   Light-touch navigation and UI relocation. All input IDs and existing handlers remain intact. */
(function () {
  'use strict';
  const source = document.currentScript;
  const editor = source && source.dataset && source.dataset.editor;
  const configs = {
    lighting: {
      labels:['Open','Place','Size & ID','PIR Coverage','Review','Export'],
      messages:['Open a SharePoint or local PDF drawing.','Choose a keypad or PIR and place it on the drawing.','Select a symbol to match its size to the existing PDF. Apply that size to the same device type if desired.','Show, hide or adjust PIR coverage across all drawing pages.','Check device counts and identify unfinished changes.','Save your editable JSON, marked-up PDF and counts.'],
      headings:['Size, Orient & Identify','PIR Coverage Guides'],
      coverage:true
    },
    cctv: {
      labels:['Open','Place','Size & Aim','Camera Views','Review','Export'],
      messages:['Open a SharePoint or local PDF drawing.','Choose initial or proposed camera layouts, then place devices.','Select a camera to size it and set its facing direction. Initial teal and proposed orange remain distinct.','Show, hide or adjust fixed and fisheye camera viewing guides.','Review camera positions, counts and proposed changes.','Save your editable JSON, marked-up PDF and counts.'],
      headings:['Size, Aim & Identify','Camera Viewing Guides'],
      coverage:true
    },
    shades: {
      labels:['Open','Place','Size & ID','Alignment','Review','Export'],
      messages:['Open a SharePoint or local PDF drawing.','Choose shade or drapery, then click its start and end points.','Select a run to adjust its symbol, line thickness and room identification.','Choose line snapping and optional estimated length display.','Review runs, counts and preliminary length estimates.','Save your editable JSON, marked-up PDF and counts.'],
      headings:['Size & Identify','Alignment & Estimated Lengths'],
      coverage:false
    },
    access: {
      labels:['Open','Place','Size & ID','Door Systems','Review','Export'],
      messages:['Open a SharePoint or local PDF drawing.','Start with a door opening; link readers, locks and other hardware to it.','Select a device to adjust size or identify the associated room and door.','Check door assignment, system tags and opening details.','Review the door-by-door schedule and device counts.','Save your editable JSON, marked-up PDF and door/device schedule.'],
      headings:['Size, Orient & Identify','Door Coordination'],
      coverage:false
    }
  };
  const config = configs[editor];
  if (!config) return;
  const $ = (id) => document.getElementById(id);

  function run() {
    const sidebar = $('sidebar');
    const header = sidebar && sidebar.querySelector(':scope > header');
    const details = $('detailsSection');
    const selected = $('selectionSettings');
    const place = $('placeSection');
    const review = $('reviewSection');
    const exportArea = $('exportSection');
    const plan = $('planSection');
    if (!sidebar || !header || !details || !selected || !place || !review || !exportArea || !plan) return;
    if ($('ahtGuidedSteps')) return;

    const stepHeading = (section, number, heading) => {
      const label = section && section.querySelector(':scope > .step-heading');
      const numeral = label && label.querySelector('.step-number');
      const title = label && label.querySelector('h2');
      if (numeral) numeral.textContent = String(number);
      if (title) title.textContent = heading;
    };
    stepHeading(details, 3, config.headings[0]);
    stepHeading(review, 5, 'Review Changes & Counts');
    stepHeading(exportArea, 6, 'Save & Export');

    // Move the existing, fully wired selection panel into plain view.
    // Preserve the actual element so its event handlers, IDs and state are unchanged.
    const tips = document.createElement('div');
    tips.className = 'aht-guided-size-tip';
    tips.innerHTML = '<strong>Match your PDF first:</strong> Place or select a symbol, adjust “Size of this device,” then choose “Apply this size to all of this type” if appropriate. “Default icon size” sets future placements.';
    const detailsForm = $('changeDetails');
    if (detailsForm) {
      details.insertBefore(tips, detailsForm);
      details.insertBefore(selected, detailsForm);
    } else {
      details.append(tips, selected);
    }
    selected.open = true;
    const selectedSummary = selected.querySelector(':scope > summary');
    if (selectedSummary && selectedSummary.firstChild && selectedSummary.firstChild.nodeType === 3) {
      selectedSummary.firstChild.nodeValue = 'Selected Symbol — Size & Editing ';
    }

    let fourth;
    if (config.coverage) {
      fourth = $('bulkCoveragePanel');
      if (!fourth) return;
      const head = document.createElement('div');
      head.className = 'step-heading';
      head.innerHTML = '<span class="step-number">4</span><h2></h2>';
      head.querySelector('h2').textContent = config.headings[1];
      fourth.insertBefore(head, fourth.firstChild);
      const intro = document.createElement('div');
      intro.className = 'aht-guided-intro';
      intro.textContent = 'Illustrative guides only; the engineering layout and actual coverage take precedence.';
      fourth.insertBefore(intro, head.nextSibling);
    } else {
      fourth = document.createElement('section');
      fourth.id = 'aht-guided-stage4';
      fourth.className = 'workflow-step';
      fourth.innerHTML = '<div class="step-heading"><span class="step-number">4</span><h2></h2></div>';
      fourth.querySelector('h2').textContent = config.headings[1];
      const explanation = document.createElement('div');
      explanation.className = 'aht-guided-intro';
      explanation.textContent = config.messages[3];
      fourth.appendChild(explanation);
      review.before(fourth);
    }

    function jumpTo(element, index, focus) {
      if (!element) return;
      markStep(index);
      if (element.closest('details') && !element.closest('details').open) element.closest('details').open = true;
      element.scrollIntoView({behavior:'smooth', block:'start'});
      if (focus && typeof element.focus === 'function') element.focus({preventScroll:true});
    }
    if (editor === 'shades') {
      const align = place.querySelector('.shade-run-controls');
      if (align) {
        fourth.appendChild(align);
        const shortcut = document.createElement('button');
        shortcut.type = 'button';
        shortcut.className = 'aht-guided-shortcut';
        shortcut.textContent = 'Adjust line alignment & length display (Step 4)';
        shortcut.addEventListener('click', () => jumpTo(fourth,3));
        const palette = $('palette');
        if (palette) palette.after(shortcut);
      }
    }
    if (editor === 'access') {
      const actions = document.createElement('div');
      actions.className = 'aht-door-buttons';
      const choose = document.createElement('button');
      choose.type = 'button'; choose.textContent = 'Choose door for new devices';
      choose.addEventListener('click', () => jumpTo($('activeDoor'),1,true));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = 'Edit selected opening / hardware';
      edit.addEventListener('click', () => {
        jumpTo(details,2);
        const btn = $('editDetailsBtn');
        if (btn) btn.click();
      });
      actions.append(choose,edit);
      fourth.appendChild(actions);
      const remind = document.createElement('div');
      remind.className = 'aht-guided-size-tip';
      remind.textContent = 'A door/opening marker groups the readers, contacts, locks, and other equipment at that opening. Record its opening ID, then choose it before placing associated hardware.';
      fourth.appendChild(remind);
    }

    const sections = [plan, place, details, fourth, review, exportArea];
    const nav = document.createElement('nav');
    nav.id = 'ahtGuidedSteps';
    nav.setAttribute('aria-label', 'Plan editor workflow steps');
    const overline = document.createElement('p');
    overline.className = 'aht-guided-overline';
    overline.textContent = 'Your drawing workflow — jump to any step';
    const grid = document.createElement('div');
    grid.className = 'aht-guided-grid';
    const note = document.createElement('div');
    note.id = 'ahtGuidedNext'; note.setAttribute('aria-live','polite');
    const buttons = [];
    function markStep(index) {
      buttons.forEach((button,i) => {
        if (i === index) button.setAttribute('aria-current','step');
        else button.removeAttribute('aria-current');
      });
      note.textContent = config.messages[index] || '';
    }
    sections.forEach((section, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'aht-guided-link';
      button.dataset.target = section.id;
      const number = document.createElement('b');
      number.textContent = String(i+1);
      button.append(number,document.createTextNode(config.labels[i]));
      button.addEventListener('click', () => jumpTo(section,i));
      grid.appendChild(button);
      buttons.push(button);
    });
    nav.append(overline,grid,note);
    header.after(nav);
    markStep(0);

    // Keep guidance synchronized with common user actions without interrupting editing.
    const palette = $('palette');
    if (palette) palette.addEventListener('click', () => markStep(1));
    const reviewList = $('changeReview');
    if (reviewList) reviewList.addEventListener('click', () => markStep(4));
    const editBtn = $('editDetailsBtn');
    if (editBtn) editBtn.addEventListener('click', () => markStep(2));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true});
  else run();
})();
