from pathlib import Path
import re

root = Path(".")
dashboard = root / "js" / "dashboard.js"
index = root / "index.html"
styles = root / "css" / "styles.css"
mobile = root / "css" / "mobile.css"
config = root / "js" / "config.js"

# ==========================================================
# dashboard.js
# ==========================================================
text = dashboard.read_text(encoding="utf-8")

# Calendar state/navigation
if "let calendarViewDate" not in text:
    text = text.replace(
        "function render(){",
        """let calendarViewDate=new Date();

function setCalendarViewDate(value){
  const next=new Date(value);
  if(Number.isNaN(next.getTime()))return;
  calendarViewDate=new Date(next.getFullYear(),next.getMonth(),1);
  render();
}

window.calendarPrevMonth=()=>setCalendarViewDate(
  new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()-1,1)
);

window.calendarNextMonth=()=>setCalendarViewDate(
  new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+1,1)
);

window.calendarToday=()=>{
  const today=new Date();
  setCalendarViewDate(new Date(today.getFullYear(),today.getMonth(),1));
};

window.calendarMonthPicked=value=>{
  if(!value)return;
  const parts=value.split("-").map(Number);
  if(parts.length!==2)return;
  setCalendarViewDate(new Date(parts[0],parts[1]-1,1));
};

function render(){""",
        1
    )

# Replace on-screen calendar renderer
pattern = re.compile(
    r'const now=new Date\(\),calendarYear=now\.getFullYear\(\),calendarMonth=now\.getMonth\(\),firstDay=.*?monthGrid\.innerHTML=cells;if\(currentUser\.canAdmin\)renderAdmin\(\);',
    re.S
)

replacement = '''const now=new Date(),
calendarYear=calendarViewDate.getFullYear(),
calendarMonth=calendarViewDate.getMonth(),
firstDay=new Date(calendarYear,calendarMonth,1).getDay(),
daysInMonth=new Date(calendarYear,calendarMonth+1,0).getDate();

const calendarMonthTitle=document.getElementById("calendarMonthTitle");
if(calendarMonthTitle)calendarMonthTitle.textContent=
  new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"})
  .format(new Date(calendarYear,calendarMonth,1)).toUpperCase();

const calendarMonthPicker=document.getElementById("calendarMonthPicker");
if(calendarMonthPicker)calendarMonthPicker.value=
  `${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}`;

let cells="";
["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  .forEach(d=>cells+=`<div class="day-head">${d}</div>`);

for(let i=0;i<firstDay;i++)cells+=`<div class="day-cell"></div>`;

for(let day=1;day<=daysInMonth;day++){
  const key=`${calendarYear}-${String(calendarMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
        ev=grouped[key]||[],
        todayClass=
          day===now.getDate() &&
          calendarMonth===now.getMonth() &&
          calendarYear===now.getFullYear()
            ?" today":"";

  cells+=`<div class="day-cell${todayClass}">
    <div class="day-num">${day}</div>
    ${ev.slice(0,2).map(e=>`<div class="event-dot ${e.type}" ${
      currentUser.canEdit
        ?`onclick="${e.source==="deliverable"
            ?`editDeliverable(${e.sourceId})`
            :`editInfo(${e.sourceId})`
          }" style="cursor:pointer" title="Edit source record"`
        :""
    }>${esc(e.title)}</div>`).join("")}
  </div>`;
}

monthGrid.innerHTML=cells;
if(currentUser.canAdmin)renderAdmin();'''

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f"Calendar renderer replacement count was {count}")

# Calendar PDF should follow viewed month
text = text.replace(
'''  const now=new Date();
  const year=now.getFullYear();
  const month=now.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1));''',
'''  const now=new Date();
  const year=calendarViewDate.getFullYear();
  const month=calendarViewDate.getMonth();
  const monthName=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1));''',
1
)

dashboard.write_text(text, encoding="utf-8")


# ==========================================================
# index.html
# ==========================================================
html = index.read_text(encoding="utf-8")

html = html.replace("Last Internal Activity","Project Activity")

calendar_pattern = re.compile(
    r'<section id="calendar" class="view">.*?</section>',
    re.S
)

calendar_html = '''<section id="calendar" class="view">
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
        <button class="btn calendar-nav-btn" type="button" onclick="calendarPrevMonth()">‹</button>

        <div class="calendar-nav-center">
          <h3 id="calendarMonthTitle">MONTH</h3>
          <input id="calendarMonthPicker"
                 class="calendar-month-picker"
                 type="month"
                 onchange="calendarMonthPicked(this.value)" />
        </div>

        <div class="calendar-nav-actions">
          <button class="btn calendar-today-btn" type="button" onclick="calendarToday()">Today</button>
          <button class="btn calendar-nav-btn" type="button" onclick="calendarNextMonth()">›</button>
        </div>
      </div>

      <div class="month-grid" id="monthGrid"></div>
    </div>
  </div>
</section>'''

html, count = calendar_pattern.subn(calendar_html, html, count=1)
if count != 1:
    raise RuntimeError(f"Calendar HTML replacement count was {count}")

index.write_text(html, encoding="utf-8")


# ==========================================================
# styles.css
# ==========================================================
css = styles.read_text(encoding="utf-8")

if "v0.14.39 dashboard usability" not in css:
    css += r'''

/* v0.14.39 dashboard usability */

/* Deliverables: prevent first row from hiding beneath header */
#deliverables .desktop-table thead,
#deliverables .desktop-table thead th{
  position:static!important;
  top:auto!important;
  z-index:auto!important;
}

/* Project Activity */
.last-activity .activity-label{
  color:var(--blue);
}

/* Calendar navigation */
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
  flex:1;
}

.calendar-nav-center h3{margin:0}

.calendar-nav-actions{
  display:flex;
  align-items:center;
  gap:7px;
}

.calendar-nav-btn{
  min-width:38px;
  font-size:18px;
  color:var(--navy);
  border-color:#80b8d5;
}

.calendar-today-btn{
  color:var(--navy);
  border-color:#80b8d5;
}

.calendar-month-picker{
  width:auto;
  padding:6px 8px;
  border:1px solid var(--line);
  border-radius:7px;
  background:#fff;
  color:var(--navy);
  font:inherit;
  font-size:12px;
  font-weight:700;
}

.day-cell.today{
  background:#f1f8fc;
  box-shadow:inset 0 0 0 1px rgba(0,136,199,.22);
}

/* Change Log */
.audit-table-scroll{
  max-height:68vh!important;
  min-height:300px;
  overflow:auto!important;
  scrollbar-gutter:stable;
}

.audit-table-scroll table{
  min-width:900px;
}

.audit-table-scroll thead th{
  position:sticky!important;
  top:0!important;
  z-index:10!important;
  background:#f4f8fb!important;
}

/* Edit and Manage - blue outline */
.project-admin-actions .btn:first-child,
[data-manage-profile]{
  background:#fff!important;
  color:#006ea6!important;
  border-color:#5ca8cf!important;
}

/* Archive - orange/red outline */
.project-admin-actions button[onclick^="toggleArchive"]{
  background:#fff!important;
  color:#b84e24!important;
  border-color:#dc8b66!important;
}

/* Microsoft refresh - green outline */
#refreshEntraUsersBtn{
  background:#fff!important;
  color:#2b7a50!important;
  border-color:#70ad47!important;
}

/* Current Dashboard Access - one clean scroll model */
.entra-user-table-wrap{
  position:relative!important;
  height:auto!important;
  max-height:none!important;
  overflow:visible!important;
  padding:0!important;
}

.entra-user-table-wrap .entra-table-heading{
  position:relative!important;
  top:auto!important;
  z-index:auto!important;
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
  background:#f4f8fb!important;
}

.entra-user-table-wrap .entra-user-table td{
  background:#fff;
}
'''

styles.write_text(css, encoding="utf-8")


# ==========================================================
# mobile.css
# ==========================================================
css = mobile.read_text(encoding="utf-8")

if "v0.14.39 mobile usability" not in css:
    css += r'''

/* v0.14.39 mobile usability */
@media(max-width:700px){

  .calendar-nav{
    display:grid;
    grid-template-columns:auto 1fr auto;
    gap:6px;
  }

  .calendar-nav-center{
    flex-direction:column;
    gap:4px;
  }

  .calendar-nav-center h3{
    text-align:center;
    font-size:13px;
  }

  .calendar-month-picker{
    width:100%;
    max-width:150px;
  }

  .calendar-today-btn{
    display:none;
  }

  .audit-toolbar{
    display:grid;
    grid-template-columns:1fr;
    gap:7px;
  }

  .audit-toolbar input,
  .audit-toolbar select{
    width:100%;
  }

  .audit-table-scroll{
    max-height:62vh!important;
    min-height:300px;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch;
  }

  .audit-table-scroll table{
    min-width:820px;
  }

  .entra-user-table-wrap{
    height:auto!important;
    max-height:none!important;
    overflow:visible!important;
  }

  .entra-user-table-wrap .entra-user-table{
    display:block!important;
    max-height:330px!important;
    overflow:auto!important;
    -webkit-overflow-scrolling:touch;
  }

  .entra-user-table-wrap .entra-user-table thead,
  .entra-user-table-wrap .entra-user-table tbody{
    display:table!important;
    width:760px!important;
    min-width:760px!important;
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
  }
}
'''

mobile.write_text(css, encoding="utf-8")


# ==========================================================
# version
# ==========================================================
cfg = config.read_text(encoding="utf-8")
cfg = re.sub(r'version:\s*"[^"]+"', 'version: "0.14.39"', cfg, count=1)
config.write_text(cfg, encoding="utf-8")

print("SUCCESS: v0.14.39 live UI files patched.")
