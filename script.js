const svg = d3.select("#chart");
const g = svg.append("g");
const tooltip = d3.select("#tooltip");
const pinnedTooltip = d3.select("#pinnedTooltip");

let currentData = null;
const parseDate = d3.timeParse("%Y-%m-%d");

const BASE = {
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
    candidate: "#4CAF50",
    release: "#2196F3",
    hotfix: "#FF5722",
    fix: "#9C27B0",
    downstream: "#FFC107",
    upstream: "#607D8B"
};

function loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = JSON.parse(e.target.result);
        currentData = data;
        setDefaultDates(data);
        render(filterData(data));
    };
    reader.readAsText(file);
}

function filterData(data) {
    if (!data) return null;
    const sStr = document.getElementById("startDate").value;
    const eStr = document.getElementById("endDate").value;
    const sD = sStr ? new Date(sStr) : null;
    const eD = eStr ? new Date(eStr) : null;

    const fLinks = (data.links || []).filter(l => {
        const d = new Date(l.date);
        return (!sD || d >= sD) && (!eD || d <= eD);
    });

    const fEvents = (data.events || []).filter(ev => {
        const dF = new Date(ev.dateFrom);
        const dT = new Date(ev.dateTo);
        return (!sD || dT >= sD) && (!eD || dF <= eD);
    });

    const used = new Set();
    fLinks.forEach(l => { used.add(l.from); used.add(l.to); });
    fEvents.forEach(ev => used.add(ev.branch));

    return { 
        ...data, 
        links: fLinks, 
        events: fEvents, 
        branches: data.branches.filter(b => used.has(b)) 
    };
}

function setDefaultDates(data) {
    const allD = [
        ...data.links.map(l => new Date(l.date)), 
        ...(data.events || []).flatMap(e => [new Date(e.dateFrom), new Date(e.dateTo)])
    ];
    if (!allD.length) return;
    const min = new Date(Math.min(...allD));
    const max = new Date(Math.max(...allD));
    const fmt = d => d.toISOString().split("T")[0];
    document.getElementById("startDate").value = fmt(min);
    document.getElementById("endDate").value = fmt(max);
}

function renderTable(tableData) {
    const table = d3.select("#releaseTable");
    table.html("");
    if (!tableData || !Array.isArray(tableData)) return;

    const headers = ["Release", "P1 Deploy", "Branch", "Hybris version", "Start merge", "Start Stabilization", "Branch Unfreeze", "Note", "Scope"];
    const thead = table.append("thead").append("tr");
    headers.forEach(h => thead.append("th").text(h));

    const tbody = table.append("tbody");
    const lastItems = tableData.slice(-3);
    const roles = ["prev", "current", "next"];

    lastItems.forEach((d, i) => {
        const tr = tbody.append("tr").attr("class", "row-" + roles[i]);
        [d.release, d.p1Deploy, d.branch, d.hybrisVersion, d.startMerge, d.startStabilization, d.unfreeze, d.note, d.scope]
        .forEach(text => {
            tr.append("td").html(text ? text.replace(/\n/g, "<br>") : "");
        });
    });
}

function render(data) {
    if (!data) return;
    renderTable(data["release-table"]);
    
    const SCALE = 1; 
    document.documentElement.style.setProperty('--ui-scale', SCALE);

    g.selectAll("*").remove();
    const stickyContainer = d3.select("#branch-labels-sticky").html("");
    d3.select("#legend").html("");

    const legendBox = d3.select("#legend").append("div").attr("class", "legend-box");
    Object.entries(colors).forEach(([k, c]) => {
        const row = legendBox.append("div").attr("class", "legend-row");
        row.append("div").attr("class", "legend-color").style("background", c);
        row.append("div").text(k);
    });

    const BS = BASE.branchSpacing * SCALE;
    const TO = BASE.topOffset * SCALE;
    const TLO = BASE.timelineOffset * SCALE;

    const sV = document.getElementById("startDate").value ? new Date(document.getElementById("startDate").value) : null;
    const eV = document.getElementById("endDate").value ? new Date(document.getElementById("endDate").value) : null;

    const tD = new Set();
    data.links.forEach(l => tD.add(l.date));
    data.events.forEach(ev => {
        if (!sV || new Date(ev.dateFrom) >= sV) tD.add(ev.dateFrom);
        if (!eV || new Date(ev.dateTo) <= eV) tD.add(ev.dateTo);
    });

    const grouped = Array.from(tD)
        .map(d => ({ date: d, dObj: parseDate(d), items: data.links.filter(l => l.date === d) }))
        .sort((a, b) => a.dObj - b.dObj);

    grouped.forEach(gr => {
        gr.w = gr.items.length <= 1 ? BASE.SINGLE_WIDTH * SCALE : (gr.items.length * BASE.CLUSTER_SPACING * SCALE + BASE.CLUSTER_PADDING * SCALE);
    });

    let xP = 20 * SCALE;
    const dateX = {};
    grouped.forEach((d, i) => {
        if (i !== 0) {
            const days = (d.dObj - grouped[i-1].dObj) / (1000 * 60 * 60 * 24);
            xP += (days <= 2 ? 80 : days <= 10 ? 120 : days <= 20 ? 180 : 240) * SCALE;
        }
        d.startX = xP;
        dateX[d.date] = d.startX + d.w / 2;
        xP += d.w;
    });

    const lastX = xP + 50 * SCALE;
    const chartHeight = TO + data.branches.length * BS;
    svg.attr("width", lastX).attr("height", chartHeight).attr("viewBox", `0 0 ${lastX} ${chartHeight}`);

    g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", TLO).attr("y2", TLO).attr("stroke", "#000");

    grouped.forEach(d => {
        g.append("rect").attr("x", d.startX).attr("y", TLO - 10 * SCALE).attr("width", d.w).attr("height", 20 * SCALE).attr("rx", 6 * SCALE).attr("class", "timeline-date");
        g.append("text").attr("x", d.startX + d.w / 2).attr("y", TLO - 15 * SCALE).attr("text-anchor", "middle").attr("class", "timeline-text").text(d3.timeFormat("%d %b %Y")(d.dObj));
    });

    const bY = {};
    data.branches.forEach((b, i) => {
        const y = TO + i * BS; bY[b] = y;
        const label = stickyContainer.append("div").attr("class", "sticky-branch-label").style("top", `${y}px`);
        label.append("div").attr("class", "branch-box").text(b);
        g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", y).attr("y2", y).attr("stroke", "#eee");
    });

    data.events.forEach(ev => {
        const y = bY[ev.branch]; if (y === undefined) return;
        let xS = dateX[ev.dateFrom], xE = dateX[ev.dateTo];
        let cL = false, cR = false;
        if (sV && new Date(ev.dateFrom) < sV) { xS = 0; cL = true; }
        if (eV && new Date(ev.dateTo) > eV) { xE = lastX; cR = true; }
        if (xS === undefined) xS = 0; if (xE === undefined) xE = lastX;
        const rH = 32 * SCALE, rW = xE - xS; if (rW <= 0) return;
        const evG = g.append("g");
        evG.append("rect").attr("x", xS).attr("y", y - rH / 2).attr("width", rW).attr("height", rH).attr("fill", ev.color).attr("fill-opacity", 0.15).attr("stroke", ev.color).attr("stroke-width", 1.5 * SCALE).attr("rx", (cL || cR) ? 0 : 4 * SCALE);
        if (cL) evG.append("line").attr("x1", xS).attr("y1", y - rH / 2).attr("x2", xS).attr("y2", y + rH / 2).attr("stroke", ev.color).attr("stroke-width", 3 * SCALE).attr("stroke-dasharray", "4,2");
        if (cR) evG.append("line").attr("x1", xE).attr("y1", y - rH / 2).attr("x2", xE).attr("y2", y + rH / 2).attr("stroke", ev.color).attr("stroke-width", 3 * SCALE).attr("stroke-dasharray", "4,2");
        evG.append("text").attr("x", xS + rW / 2).attr("y", y + 5 * SCALE).attr("text-anchor", "middle").style("font-size", `${11 * SCALE}px`).style("font-weight", "600").text(ev.label);
    });

    const defs = g.append("defs");
    Object.entries(colors).forEach(([k, c]) => {
        defs.append("marker").attr("id", "arrow-" + k).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0 0 L10 5 L0 10Z").attr("fill", c);
    });

    const pl = [];
    grouped.forEach(group => {
        group.items.forEach((l, i) => {
            const x = group.items.length === 1 ? dateX[group.date] : group.startX + (BASE.CLUSTER_PADDING * SCALE) / 2 + i * (BASE.CLUSTER_SPACING * SCALE);
            const y1 = bY[l.from], y2 = bY[l.to], mid = (y1 + y2) / 2;
            const temp = g.append("text").text(l.label);
            const w = temp.node().getBBox().width + 20 * SCALE; temp.remove();
            let lY = mid;
            for (let lv = 0; lv <= 8; lv++) {
                let cY = mid + (lv === 0 ? 0 : (lv % 2 === 1 ? 1 : -1) * (Math.ceil(lv / 2) === 1 ? BASE.MIN_OFFSET * SCALE : (BASE.MIN_OFFSET + (Math.ceil(lv / 2) - 1) * BASE.STEP_OFFSET) * SCALE));
                let box = { x1: x - w / 2, x2: x + w / 2, y1: cY - 18 * SCALE, y2: cY + 18 * SCALE, mid };
                if (!pl.some(p => Math.abs(p.mid - box.mid) < 80 * SCALE && !(box.x2 < p.x1 || box.x1 > p.x2 || box.y2 < p.y1 || box.y1 > p.y2))) { lY = cY; pl.push(box); break; }
            }
            g.append("line").attr("x1", x).attr("y1", y1).attr("x2", x).attr("y2", y2).attr("stroke", colors[l.type]).attr("stroke-width", 2 * SCALE).attr("marker-end", "url(#arrow-" + l.type + ")");
            const el = g.append("g").style("cursor", "pointer").on("click", () => showPinnedTooltip(l));
            el.append("rect").attr("x", x - w / 2).attr("y", lY - 18 * SCALE).attr("width", w).attr("height", 36 * SCALE).attr("rx", 10 * SCALE).attr("fill", colors[l.type]);
            el.append("text").attr("x", x).attr("y", lY - 2 * SCALE).attr("text-anchor", "middle").attr("fill", "white").style("font-size", `${12 * SCALE}px`).text(l.label);
            el.append("text").attr("x", x).attr("y", lY + 10 * SCALE).attr("text-anchor", "middle").attr("fill", "white").style("font-size", `${10 * SCALE}px`).text(l.date);
        });
    });
}

function showPinnedTooltip(l) {
    pinnedTooltip.classed("hidden", false).html(`<div id="closeT" style="position:absolute;top:5px;right:10px;cursor:pointer;">✖</div><b>${l.label}</b><br>${l.date}`);
    d3.select("#closeT").on("click", () => pinnedTooltip.classed("hidden", true));
}

document.getElementById("loadJsonBtn").onclick = () => document.getElementById("jsonFileInput").click();
document.getElementById("jsonFileInput").onchange = function() { if(this.files[0]) loadFromFile(this.files[0]); };
document.getElementById("startDate").onchange = () => currentData && render(filterData(currentData));
document.getElementById("endDate").onchange = () => currentData && render(filterData(currentData));
document.getElementById("resetDatesBtn").onclick = () => { if (currentData) { setDefaultDates(currentData); render(filterData(currentData)); } };