from pathlib import Path

root = Path(".")

dashboard = root / "js" / "dashboard.js"
index = root / "index.html"
styles = root / "css" / "styles.css"
mobile = root / "css" / "mobile.css"

# ---------------------------------------------------------
# DASHBOARD.JS
# ---------------------------------------------------------

text = dashboard.read_text(encoding="utf-8")

marker = "function render(){"
insert = r'''
// Calendar view state.
// Stays on the selected month while the user remains in the dashboard.
let calendarViewDate = new Date();

function setCalendarViewDate(value){
  const next = new Date(value);
  if(Number.isNaN(next.getTime())) return;
  calendarViewDate = new Date(next.getFullYear(), next.getMonth(), 1);
  render();
}

window.calendarPrevMonth = function(){
  setCalendarViewDate(new Date(
    calendarViewDate.getFullYear(),
    calendarViewDate.getMonth()-1,
    1
  ));
};

window.calendarNextMonth = function(){
  setCalendarViewDate(new Date(
    calendarViewDate.getFullYear(),
    calendarViewDate.getMonth()+1,
    1
  ));
};

window.calendarToday = function(){
  const today = new Date();
  setCalendarViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
};

window.calendarMonthPicked = function(value){
  if(!value) return;
  const parts = value.split("-").map(Number);
  if(parts.length !== 2 || !parts[0] || !parts[1]) return;
  setCalendarViewDate(new Date(parts[0], parts[1]-1, 1));
};

'''

if insert.strip() not in text:
    if marker not in text:
        raise RuntimeError("Could not locate render() in dashboard.js")
    text = text.replace(marker, insert + marker, 1)


old_calendar = '''  const now=new Date(),calendarYear=now.getFullYear(),calendarMonth=now.getMonth(),firstDay=new Date(calendarYear,calendarMonth,1).getDay(),daysInMonth=new Date(calendarYear,calendarMonth+1,0).getDate();
  const calendarMonthTitle=document.getElementById("calendarMonthTitle");if(calendarMonthTitle)calendarMonthTitle.textContent=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(calendarYear,calendarMonth,1)).toUpperCase();
  let cells="";["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>cells+=`<div class="day-head">${d}</div>`);for(let i=0;i<firstDay;i++)cells+=`<div class="day-cell"></div>`;for(let day=1;day<=daysInMonth;day++){const key=`${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`,ev=grouped[key]||[];cells+=`<div class="day-cell"><div class="day-num">${day}</div>${ev.slice(0,2).map(e=>`<div class="event-dot ${e.type}" ${currentUser.canEdit?`onclick="${e.source==="deliverable"?`editDeliverable(${e.sourceId})`:`editInfo(${e.sourceId})`}" style="cursor:pointer" title="Edit source record"`:""}>${esc(e.title)}</div>`).join("")}</div>`}monthGrid.innerHTML=cells;if(currentUser.canAdmin)renderAdmin();'''

new_calendar = '''  const now=new Date();
  const calendarYear=calendarViewDate.getFullYear();
  const calendarMonth=calendarViewDate.getMonth();
  const firstDay=new Date(calendarYear,calendarMonth,1).getDay();
  const daysInMonth=new Date(calendarYear,calendarMonth+1,0).getDate();

  const calendarMonthTitle=document.getElementById("calendarMonthTitle");
  if(calendarMonthTitle){
    calendarMonthTitle.textContent=new Intl.DateTimeFormat("en-US",{
      month:"long",
      year:"numeric"
    }).format(new Date(calendarYear,calendarMonth,1)).toUpperCase();
  }

  const calendarMonthPicker=document.getElementById("calendarMonthPicker");
  if(calendarMonthPicker){
    calendarMonthPicker.value=`${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}`;
  }

  let cells="";
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>cells+=`<div class="day-head">${d}</div>`);
  for(let i=0;i<firstDay;i++)cells+=`<div class="day-cell"></div>`;

  for(let day=1;day<=daysInMonth;day++){
    const key=`${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const ev=grouped[key]||[];
    const todayClass=
      day===now.getDate() &&
      calendarMonth===now.getMonth() &&
      calendarYear===now.getFullYear()
        ?" today"
        :"";

    cells+=`<div class="day-cell${todayClass}"><div class="day-num">${day}</div>${
      ev.slice(0,2).map(e=>`<div class="event-dot ${e.type}" ${
        currentUser.canEdit
          ?`onclick="${e.source==="deliverable"
              ?`editDeliverable(${e.sourceId})`
              :`editInfo(${e.sourceId})`
            }" style="cursor:pointer" title="Edit source record"`
          :""
      }>${esc(e.title)}</div>`).join("")
    }</div>`;
  }

  monthGrid.innerHTML=cells;
  if(currentUser.canAdmin)renderAdmin();'''

if old_calendar not in text:
    raise RuntimeError("Could not locate current-month calendar renderer.")
text = text.replace(old_calendar, new_calendar, 1)


old_pdf = '''  const now=new Date();
  const year=now.getFullYear();
  const month=now.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1));'''

new_pdf = '''  const now=new Date();
  const viewedMonth=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth(),1);
  const year=viewedMonth.getFullYear();
  const month=viewedMonth.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(viewedMonth);'''

if old_pdf not in text:
    raise RuntimeError("Could not locate Calendar PDF month selection.")
text = text.replace(old_pdf, new_pdf, 1)

dashboard.write_text(text, encoding="utf-8")


# ---------------------------------------------------------
# INDEX.HTML
# ---------------------------------------------------------

text = index.read_text(encoding="utf-8")

text = text.replace(
    '<span class="activity-label">Last Internal Activity</span>',
    '<span class="activity-label">Project Activity</span>',
    1
)

old_calendar_html = '''<section id="calendar" class="view"><div class="page-header"><div><div class="eyebrow">Schedule</div><h2>Calendar & Agenda</h2><p>Generated from editable Deliverables and Information Required records.</p></div><div class="actions"><div class="project-switcher"><span class="small">Project</span><select class="project-select-clone"></select></div><button class="btn primary" type="button" onclick="downloadCurrentCalendarPDF()">Download Calendar PDF</button></div></div><div class="agenda-grid"><div class="calendar-card"><h3>UPCOMING AGENDA</h3><div id="agendaList"></div></div><div class="calendar-card"><h3 id="calendarMonthTitle">MONTH</h3><div class="month-grid" id="monthGrid"></div></div></div></section>'''

new_calendar_html = '''<section id="calendar" class="view">
      <div class="page-header">
        <div>
          <div class="eyebrow">Schedule</div>
          <h2>Calendar & Agenda</h2>
          <p>Generated from editable Deliverables and Information Required records.</p>
        </div>
        <div class="actions">
          <div class="project-switcher">
            <span class="small">Project</span>
            <select class="project-select-clone"></select>
          </div>
          <button class="btn primary" type="button" onclick="downloadCurrentCalendarPDF()">Download Calendar PDF</button>
        </div>
      </div>

      <div class="agenda-grid">
        <div class="calendar-card">
          <h3>UPCOMING AGENDA</h3>
          <div id="agendaList"></div>
        </div>

        <div class="calendar-card">
          <div class="calendar-nav">
            <button class="btn calendar-nav-btn" type="button" onclick="calendarPrevMonth()" aria-label="Previous month">‹</button>
            <div class="calendar-nav-center">
              <h3 id="calendarMonthTitle">MONTH</h3>
              <input
                id="calendarMonthPicker"
                class="calendar-month-picker"
                type="month"
                aria-label="Jump to month and year"
                onchange="calendarMonthPicked(this.value)"
              />
            </div>
            <div class="calendar-nav-actions">
              <button class="btn calendar-today-btn" type="button" onclick="calendarToday()">Today</button>
              <button class="btn calendar-nav-btn" type="button" onclick="calendarNextMonth()" aria-label="Next month">›</button>
            </div>
          </div>
          <div class="month-grid" id="monthGrid"></div>
        </div>
      </div>
    </section>'''

if old_calendar_html not in text:
    raise RuntimeError("Could not locate Calendar HTML section.")
text = text.replace(old_calendar_html, new_calendar_html, 1)

index.write_text(text, encoding="utf-8")


# ---------------------------------------------------------
# STYLES.CSS
# ---------------------------------------------------------

css = styles.read_text(encoding="utf-8")

patch = r'''

/* ==========================================================
   v0.14.39 — Dashboard usability refinement
   ========================================================== */

/* ---- Project Activity ---- */
.last-activity{
  position:relative;
}

.last-activity .activity-label{
  color:var(--blue);
}

.last-activity .activity-text{
  font-weight:600;
}


/* ---- Deliverables first-row clipping correction ----
   Deliverables does not need a sticky vertical header.
   Keep table geometry normal so row 1 can never sit underneath it.
*/
#deliverables .desktop-table thead,
#deliverables .desktop-table thead th{
  position:static!important;
  top:auto!important;
  z-index:auto!important;
}

#deliverables .desktop-table tbody tr:first-child td{
  position:relative;
}


/* ---- Calendar multi-year navigation ---- */
.calendar-nav{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:12px;
}

.calendar-nav-center{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  min-width:0;
  flex:1;
}

.calendar-nav-center h3{
  margin:0;
  white-space:nowrap;
}

.calendar-nav-actions{
  display:flex;
  gap:7px;
  align-items:center;
}

.calendar-nav-btn{
  min-width:38px;
  padding:7px 11px;
  font-size:19px;
  line-height:1;
  color:var(--navy);
  border-color:#9fc5dc;
}

.calendar-today-btn{
  color:var(--navy);
  border-color:#9fc5dc;
}

.calendar-month-picker{
  width:auto;
  max-width:160px;
  padding:6px 8px;
  border:1px solid var(--line);
  border-radius:7px;
  background:#fff;
  color:var(--navy);
  font:inherit;
  font-size:12px;
  font-weight:700;
}

.month-grid .day-cell.today{
  background:#f1f8fc;
  box-shadow:inset 0 0 0 1px rgba(0,136,199,.22);
}


/* ---- Change Log ----
   The renderer already displays the complete auditLog array.
   Give the audit trail substantially more usable viewing room.
*/
.audit-table-scroll{
  max-height:68vh!important;
  min-height:280px;
  overflow:auto!important;
  scrollbar-gutter:stable;
  -webkit-overflow-scrolling:touch;
}

.audit-table-scroll table{
  min-width:900px;
}

.audit-table-scroll thead th{
  position:sticky!important;
  top:0!important;
  z-index:5!important;
  background:#f4f8fb!important;
}


/* ---- Admin action-button visual hierarchy ---- */

/* Edit / Manage = blue outline */
.project-admin-actions .btn,
[data-manage-profile]{
  background:#fff!important;
  color:#006ea6!important;
  border-color:#5ca8cf!important;
}

.project-admin-actions .btn:hover,
[data-manage-profile]:hover{
  background:#edf7fc!important;
  color:#005985!important;
  border-color:#0088c7!important;
}

/* Archive / Restore = orange-red outline */
.project-admin-actions button[onclick^="toggleArchive"]{
  background:#fff!important;
  color:#b84e24!important;
  border-color:#dc8b66!important;
}

.project-admin-actions button[onclick^="toggleArchive"]:hover{
  background:#fff3ed!important;
  color:#963b19!important;
  border-color:#c7653c!important;
}

/* Microsoft refresh = green outline */
#refreshEntraUsersBtn{
  background:#fff!important;
  color:#2b7a50!important;
  border-color:#70ad47!important;
}

#refreshEntraUsersBtn:hover{
  background:#edf7e8!important;
  color:#205e3b!important;
  border-color:#5b9638!important;
}


/* ---- Current Dashboard Access ----
   Replace the accumulated v0.14.11–v0.14.14 competing scroll rules
   with one predictable scroll viewport.
*/
.entra-user-table-wrap{
  position:relative!important;
  display:block!important;
  width:100%!important;
  height:auto!important;
  max-height:none!important;
  overflow:visible!important;
  padding:0!important;
  margin-top:16px!important;
  scrollbar-gutter:auto!important;
}

.entra-user-table-wrap .entra-table-heading{
  position:relative!important;
  top:auto!important;
  z-index:auto!important;
  min-width:0!important;
  background:transparent!important;
  padding:0 0 8px!important;
}

.entra-user-table-wrap .entra-user-table{
  display:block!important;
  width:100%!important;
  min-width:0!important;
  max-height:310px!important;
  overflow:auto!important;
  border-collapse:separate!important;
  border-spacing:0!important;
  scrollbar-gutter:stable!important;
  -webkit-overflow-scrolling:touch;
}

.entra-user-table-wrap .entra-user-table thead,
.entra-user-table-wrap .entra-user-table tbody{
  display:table!important;
  width:100%!important;
  min-width:760px!important;
  table-layout:fixed!important;
}

.entra-user-table-wrap .entra-user-table thead{
  position:sticky!important;
  top:0!important;
  z-index:20!important;
}

.entra-user-table-wrap .entra-user-table thead th{
  position:static!important;
  top:auto!important;
  z-index:auto!important;
  background:#f4f8fb!important;
  box-shadow:0 1px 0 #d7e4ec;
}

.entra-user-table-wrap .entra-user-table tbody{
  position:relative;
  z-index:1;
}

.entra-user-table-wrap .entra-user-table td{
  background:#fff;
}

'''

if "v0.14.39 — Dashboard usability refinement" not in css:
    css += patch

styles.write_text(css, encoding="utf-8")


# ---------------------------------------------------------
# MOBILE.CSS
# ---------------------------------------------------------

css = mobile.read_text(encoding="utf-8")

mobile_patch = r'''

/* ==========================================================
   v0.14.39 — Mobile usability refinement
   ========================================================== */

@media (max-width:700px){

  /* Project Activity */
  .last-activity{
    padding:12px;
  }

  /* Calendar */
  .calendar-nav{
    display:grid;
    grid-template-columns:auto minmax(0,1fr) auto;
    align-items:center;
    gap:7px;
  }

  .calendar-nav-center{
    display:flex;
    flex-direction:column;
    gap:5px;
  }

  .calendar-nav-center h3{
    font-size:13px;
    text-align:center;
  }

  .calendar-month-picker{
    width:100%;
    max-width:155px;
  }

  .calendar-nav-actions{
    gap:5px;
  }

  .calendar-today-btn{
    display:none;
  }

  .calendar-nav-btn{
    min-width:36px;
    min-height:36px;
  }


  /* Change Log:
     preserve all columns and allow natural touch scrolling.
  */
  .audit-table-scroll{
    max-height:62vh!important;
    min-height:300px;
    overflow:auto!important;
    width:100%;
    -webkit-overflow-scrolling:touch;
  }

  .audit-table-scroll table{
    min-width:820px;
  }

  .audit-toolbar{
    display:grid;
    grid-template-columns:1fr;
    gap:7px;
  }

  .audit-toolbar input,
  .audit-toolbar select{
    width:100%;
    min-width:0;
  }


  /* Current Dashboard Access */
  .entra-user-table-wrap{
    height:auto!important;
    max-height:none!important;
    overflow:visible!important;
  }

  .entra-user-table-wrap .entra-user-table{
    display:block!important;
    width:100%!important;
    min-width:0!important;
    max-height:330px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch;
  }

  .entra-user-table-wrap .entra-user-table thead,
  .entra-user-table-wrap .entra-user-table tbody{
    display:table!important;
    width:760px!important;
    min-width:760px!important;
    table-layout:fixed!important;
  }

  .entra-user-table-wrap .entra-user-table thead{
    position:sticky!important;
    top:0!important;
    z-index:20!important;
  }

  .entra-user-table-wrap .entra-table-heading{
    position:relative!important;
    top:auto!important;
    min-width:0!important;
    z-index:auto!important;
  }
}

'''

if "v0.14.39 — Mobile usability refinement" not in css:
    css += mobile_patch

mobile.write_text(css, encoding="utf-8")

print("v0.14.39 UI patch applied successfully.")
