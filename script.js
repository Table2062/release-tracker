const svg = d3.select("#chart");
const g = svg.append("g");

const tooltip = d3.select("#tooltip");
const pinnedTooltip = d3.select("#pinnedTooltip");

let SCALE = 1;
let isFirstLoad = true;

function loadFromFile(file){
  const reader = new FileReader();

  reader.onload = function(e){
    const data = JSON.parse(e.target.result);

    if(isFirstLoad){
      setDefaultDates(data);
      isFirstLoad = false;
    }

    const filtered = filterData(data);
    render(filtered);
  };

  reader.readAsText(file);
}

// ================= AUTO SCALE =================
function computeScale(branchCount) {
  const BASE_HEIGHT = 120 + branchCount * 140;
  const viewport = window.innerHeight - 32;
  return Math.min(1, viewport / BASE_HEIGHT);
}

// ================= CONFIG BASE =================
const BASE = {
  LEFT_MARGIN: 140,
  branchSpacing: 140,
  topOffset: 120,
  timelineOffset: 60,
  CLUSTER_SPACING: 90,
  CLUSTER_PADDING: 30,
  SINGLE_WIDTH: 70,
  MIN_OFFSET: 38,
  STEP_OFFSET: 14
};

const colors = {
  candidate:"#4CAF50",
  release:"#2196F3",
  hotfix:"#FF5722",
  fix:"#9C27B0",
  downstream:"#FFC107"
};

const parseDate = d3.timeParse("%Y-%m-%d");

// ================= FILTER =================
function filterData(data) {
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;

  if (!start && !end) return data;

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  const filteredLinks = data.links.filter(l => {
    const d = new Date(l.date);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  const usedBranches = new Set();
  filteredLinks.forEach(l => {
    usedBranches.add(l.from);
    usedBranches.add(l.to);
  });

  const filteredBranches = data.branches.filter(b => usedBranches.has(b));

  return {
    ...data,
    links: filteredLinks,
    branches: filteredBranches
  };
}

// ================= DEFAULT DATES =================
function setDefaultDates(data){
  const dates = data.links.map(l => new Date(l.date));
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));

  const format = d => d.toISOString().split("T")[0];

  document.getElementById("startDate").value = format(min);
  document.getElementById("endDate").value = format(max);
}

// ================= PINNED TOOLTIP =================
function showPinnedTooltip(l) {
  const textToCopy = `${l.label}\n${l.details || ""}\n${l.dateFormatted}`;

  pinnedTooltip
    .classed("hidden", false)
    .html(`

      <div id="closeTooltip" style="
        position:absolute;
        top:10px;
        right:12px;
        cursor:pointer;
        font-size:16px;
        color:#999;
      ">✖</div>

      <div style="font-weight:700;margin-bottom:6px;">
        ${l.label}
      </div>

      <div>${l.details || ""}</div>

      <div style="margin-top:6px;font-size:12px;color:#64748b;">
        ${l.dateFormatted}
      </div>

      <div style="margin-top:12px;">
        <button id="copyBtn">Copy</button>
        <span id="copiedMsg" style="
          margin-left:8px;
          font-size:12px;
          color:green;
          display:none;
        ">Copied!</span>
      </div>
    `);

  d3.select("#copyBtn").on("click", async () => {
    await navigator.clipboard.writeText(textToCopy);

    const msg = d3.select("#copiedMsg");
    msg.style("display", "inline");

    setTimeout(() => {
      msg.style("display", "none");
    }, 1500);
  });

  d3.select("#closeTooltip").on("click", (event) => {
    event.stopPropagation();
    pinnedTooltip.classed("hidden", true);
  });

  pinnedTooltip.on("click", (event) => {
    event.stopPropagation();
  });
}

d3.select("body").on("click", (event) => {
  const tooltipNode = pinnedTooltip.node();

  if (!tooltipNode.contains(event.target)) {
    pinnedTooltip.classed("hidden", true);
  }
});

// ================= RENDER =================
function render(data){

  renderTable(data["release-table"]);

  SCALE = computeScale(data.branches.length);
  document.documentElement.style.setProperty('--ui-scale', SCALE);

  g.selectAll("*").remove();
  d3.select("#branches").html("");
  d3.select("#legend").html("");

  const LEFT_MARGIN = BASE.LEFT_MARGIN * SCALE;
  const branchSpacing = BASE.branchSpacing * SCALE;
  const topOffset = BASE.topOffset * SCALE;
  const timelineOffset = BASE.timelineOffset * SCALE;

  const CLUSTER_SPACING = BASE.CLUSTER_SPACING * SCALE;
  const CLUSTER_PADDING = BASE.CLUSTER_PADDING * SCALE;
  const SINGLE_WIDTH = BASE.SINGLE_WIDTH * SCALE;

  const MIN_OFFSET = BASE.MIN_OFFSET * SCALE;
  const STEP_OFFSET = BASE.STEP_OFFSET * SCALE;

  const branchesDiv = d3.select("#branches");

  data.branches.forEach((b)=>{
    branchesDiv.append("div")
      .attr("class","branch-item")
      .append("div")
      .attr("class","branch-box")
      .text(b);
  });

  const legend = d3.select("#legend")
    .append("div")
    .attr("class","legend-box");

  Object.entries(colors).forEach(([k,c])=>{
    const row = legend.append("div").attr("class","legend-row");
    row.append("div").attr("class","legend-color").style("background",c);
    row.append("div").text(k);
  });

  data.links.forEach(l=>{
    l.dateObj = parseDate(l.date);
    l.dateFormatted = new Intl.DateTimeFormat(navigator.language,{
      day:"2-digit",
      month:"short",
      year:"numeric"
    }).format(l.dateObj);
  });

  const grouped = d3.groups(data.links, d=>d.date)
    .map(([date,items])=>({
      date,
      dateObj: parseDate(date),
      items: items.sort((a,b)=> a._index - b._index)
    }))
    .sort((a,b)=>a.dateObj - b.dateObj);

  grouped.forEach(group=>{
    group.clusterWidth = group.items.length === 1
      ? SINGLE_WIDTH
      : group.items.length * CLUSTER_SPACING + CLUSTER_PADDING;
  });

  function dist(days){
    if(days<=2) return 80 * SCALE;
    if(days<=10) return 120 * SCALE;
    if(days<=20) return 180 * SCALE;
    if(days<=30) return 240 * SCALE;
    return 300 * SCALE;
  }

  let x = LEFT_MARGIN;

  grouped.forEach((d,i)=>{
    if(i !== 0){
      const prev = grouped[i-1];
      const days = (d.dateObj-prev.dateObj)/(1000*60*60*24);
      x += dist(days);
    }

    d.startX = x;
    d.x = d.startX + d.clusterWidth / 2;
    x += d.clusterWidth;
  });

  const width = x + 100 * SCALE;
  const height = topOffset + data.branches.length * branchSpacing;

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("height", height);

  const Y = timelineOffset;

  g.append("line")
    .attr("x1", LEFT_MARGIN)
    .attr("x2", width)
    .attr("y1", Y)
    .attr("y2", Y)
    .attr("stroke","#000");

  grouped.forEach(d=>{
    g.append("rect")
      .attr("x", d.startX)
      .attr("y", Y-10 * SCALE)
      .attr("width", d.clusterWidth)
      .attr("height", 20 * SCALE)
      .attr("rx",6 * SCALE)
      .attr("class","timeline-date");

    g.append("text")
      .attr("x", d.x)
      .attr("y", Y-15 * SCALE)
      .attr("text-anchor","middle")
      .attr("class","timeline-text")
      .text(d3.timeFormat("%d %b %Y")(d.dateObj));
  });

  const branchY = {};

  data.branches.forEach((b,i)=>{
    const y = topOffset + i * branchSpacing;
    branchY[b] = y;

    g.append("line")
      .attr("x1", LEFT_MARGIN)
      .attr("x2", width)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke","#aaa");
  });

  const defs = g.append("defs");

  Object.entries(colors).forEach(([k,c])=>{
    defs.append("marker")
      .attr("id","arrow-"+k)
      .attr("viewBox","0 0 10 10")
      .attr("refX",10)
      .attr("refY",5)
      .attr("markerWidth",6 * SCALE)
      .attr("markerHeight",6 * SCALE)
      .attr("orient","auto")
      .append("path")
      .attr("d","M0 0 L10 5 L0 10Z")
      .attr("fill",c);
  });

  const placedGlobal = [];

  grouped.forEach(group => {

    group.items.forEach((l, i) => {

      const x = group.items.length === 1
        ? group.x
        : group.startX + CLUSTER_PADDING/2 + i * CLUSTER_SPACING;

      const y1 = branchY[l.from];
      const y2 = branchY[l.to];
      const mid = (y1 + y2) / 2;

      const temp = g.append("text").attr("x",-999).text(l.label);
      const w = temp.node().getBBox().width + 20 * SCALE;
      temp.remove();

      let labelY = mid;
      let box;

      for(let level = 0; level <= 4; level++){

        let candidateY;

        if(level === 0){
          candidateY = mid;
        } else {
          const direction = (level % 2 === 1) ? 1 : -1;
          const step = Math.ceil(level / 2);

          const offset = step === 1
            ? MIN_OFFSET
            : MIN_OFFSET + (step - 1) * STEP_OFFSET;

          candidateY = mid + direction * offset;
        }

        box = {
          x1: x - w/2,
          x2: x + w/2,
          y1: candidateY - 18 * SCALE,
          y2: candidateY + 18 * SCALE,
          mid: mid
        };

        const collision = placedGlobal.some(p => {
          if(Math.abs(p.mid - box.mid) >= 80 * SCALE) return false;

          return !(
            box.x2 < p.x1 ||
            box.x1 > p.x2 ||
            box.y2 < p.y1 ||
            box.y1 > p.y2
          );
        });

        if(!collision){
          labelY = candidateY;
          break;
        }
      }

      placedGlobal.push(box);

      g.append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", y1)
        .attr("y2", y2)
        .attr("stroke", colors[l.type])
        .attr("stroke-width", 1.8 * SCALE)
        .attr("marker-end", "url(#arrow-" + l.type + ")");

      const groupEl = g.append("g")
        .style("cursor", "pointer");

      let tooltipTimeout;

      groupEl
        .on("mouseenter", (event) => {
          clearTimeout(tooltipTimeout);

          tooltip
            .style("opacity", 1)
            .html(`
              <div><b>${l.label}</b></div>
              <div>${l.details || ""}</div>
              <div style="margin-top:4px;font-size:11px;color:#ccc;">
                ${l.dateFormatted}
              </div>
            `);
        })
        .on("mousemove", (event) => {
          tooltip
            .style("left", (event.clientX + 12) + "px")
            .style("top", (event.clientY + 12) + "px");
        })
        .on("mouseleave", () => {
          tooltipTimeout = setTimeout(() => {
            tooltip.style("opacity", 0);
          }, 100);
        })
        .on("click", (event) => {
          event.stopPropagation();
          showPinnedTooltip(l);
        });

      groupEl.append("rect")
        .attr("x", x - w/2)
        .attr("y", labelY - 18 * SCALE)
        .attr("width", w)
        .attr("height", 36 * SCALE)
        .attr("rx",10 * SCALE)
        .attr("fill", colors[l.type]);

      groupEl.append("text")
        .attr("x",x)
        .attr("y",labelY-2 * SCALE)
        .attr("text-anchor","middle")
        .attr("fill","white")
        .style("font-size", `${12 * SCALE}px`)
        .text(l.label);

      groupEl.append("text")
        .attr("x",x)
        .attr("y",labelY+10 * SCALE)
        .attr("text-anchor","middle")
        .attr("fill","white")
        .style("font-size", `${10 * SCALE}px`)
        .text(l.dateFormatted);

    });

  });

}

// ================= INIT =================
let currentData = null;

function load(file){
  d3.json(file).then(data => {
    currentData = data;

    if(isFirstLoad){
      setDefaultDates(data);
      isFirstLoad = false;
    }

    const filtered = filterData(data);
    render(filtered);
  });
}

document.getElementById("loadJsonBtn").addEventListener("click", () => {
  document.getElementById("jsonFileInput").click();
});

document.getElementById("jsonFileInput").addEventListener("change", function(){
  const file = this.files[0];
  if(file){
    isFirstLoad = true;
    loadFromFile(file);
  }
});

window.addEventListener("resize", () => {
  if(currentData){
    const filtered = filterData(currentData);
    render(filtered);
  }
});

d3.select("#jsonSelect").on("change", function(){
  isFirstLoad = true;
  load(this.value);
});

d3.select("#startDate").on("change", () => {
  if(currentData){
    const filtered = filterData(currentData);
    render(filtered);
  }
});

d3.select("#endDate").on("change", () => {
  if(currentData){
    const filtered = filterData(currentData);
    render(filtered);
  }
});

// ================= TABLE =================
function renderTable(tableData){

  const table = d3.select("#releaseTable");
  table.html("");

  if(!tableData || !Array.isArray(tableData)) return;

  const headers = [
    "Release","P1 Deploy","Branch","Hybris version",
    "Start merge","Start Stabilization","Branch Unfreeze",
    "Note","Scope"
  ];

  const thead = table.append("thead").append("tr");
  headers.forEach(h=> thead.append("th").text(h));

  const tbody = table.append("tbody");

  // 👉 PRENDI SEMPRE GLI ULTIMI 3
  const lastItems = tableData.slice(-3);

  // 👉 mappatura prev / current / next
  const roles = ["prev","current","next"];

  lastItems.forEach((d, i)=>{
    const role = roles[i] || "current";

    const tr = tbody.append("tr")
      .attr("class","row-"+role);

    tr.append("td").text(d.release || "");
    tr.append("td").text(d.p1Deploy || "");
    tr.append("td").text(d.branch || "");
    tr.append("td").text(d.hybrisVersion || "");
    tr.append("td").text(d.startMerge || "");
    tr.append("td").text(d.startStabilization || "");
    tr.append("td").text(d.unfreeze || "");
    tr.append("td").text(d.note || "");
    tr.append("td").text(d.scope || "");
  });
}