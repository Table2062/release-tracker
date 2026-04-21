const svg = d3.select("#chart");
const g = svg.append("g");
const tooltip = d3.select("#tooltip");
const pinnedTooltip = d3.select("#pinnedTooltip");

let currentData = null;
let tableStartIndex = 0; 
let currentNumRows = 3; 

const parseDate = d3.timeParse("%Y-%m-%d");

// ✅ FORMAT ISO (YYYY-MM-DD)
function formatDateSafe(d) {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toISOString().split("T")[0];
}

const BASE = {
    branchSpacing: 140,
    topOffset: 120,
    timelineOffset: 60,
    CLUSTER_SPACING: 90,
    CLUSTER_PADDING: 30,
    SINGLE_WIDTH: 70,
    MIN_OFFSET: 38,
    STEP_OFFSET: 14,
    EVENT_PADDING: 10
};

const colors = {
    candidate: "#4CAF50",
    release: "#2196F3",
    hotfix: "#FF5722",
    fix: "#9C27B0",
    downstream: "#FFC107",
    upstream: "#607D8B"
};

/* ========================= */
/* MODAL                     */
/* ========================= */

function openModal(contentHtml) {
    const overlay = document.getElementById("modalOverlay");
    const content = document.getElementById("modalContent");

    content.innerHTML = contentHtml;
    overlay.classList.add("active");
}

function closeModal() {
    document.getElementById("modalOverlay").classList.remove("active");
}

document.getElementById("modalCloseBtn").onclick = closeModal;

document.getElementById("modalOverlay").onclick = function(e) {
    if (e.target.id === "modalOverlay") closeModal();
};

/* ========================= */
/* LOAD + FILTER             */
/* ========================= */

function loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            currentData = data;
            tableStartIndex = 0; 
            setDefaultDates(data);
            render(filterData(data));
        } catch (err) { console.error(err); }
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
        const dF = new Date(ev.dateFrom), dT = new Date(ev.dateTo);
        return (!sD || dT >= sD) && (!eD || dF <= eD);
    });

    const used = new Set();
    fLinks.forEach(l => { used.add(l.from); used.add(l.to); });
    fEvents.forEach(ev => used.add(ev.branch));

    return { ...data, links: fLinks, events: fEvents, branches: (data.branches || []).filter(b => used.has(b)) };
}

function setDefaultDates(data) {
    const allD = [
        ...(data.links || []).map(l => new Date(l.date)),
        ...(data.events || []).flatMap(e => [new Date(e.dateFrom), new Date(e.dateTo)])
    ];
    if (!allD.length) return;

    const min = new Date(Math.min(...allD)), max = new Date(Math.max(...allD));
    const fmt = d => d.toISOString().split("T")[0];

    document.getElementById("startDate").value = fmt(min);
    document.getElementById("endDate").value = fmt(max);
}

/* ========================= */
/* TABLE (UNCHANGED)         */
/* ========================= */

function renderTable(tableData) {
    const table = d3.select("#releaseTable");
    if (!tableData || !Array.isArray(tableData)) { table.html(""); return; }

    const total = tableData.length;
    if (currentNumRows > total) currentNumRows = total;

    let end = total - tableStartIndex;
    let start = end - currentNumRows;

    if (start < 0) { start = 0; end = Math.min(currentNumRows, total); }
    if (end > total) { end = total; start = Math.max(0, total - currentNumRows); }

    table.html(""); 

    const thead = table.append("thead").append("tr");
    ["Release", "P1 Deploy", "Branch", "Hybris version", "Start merge", "Start Stabilization", "Branch Unfreeze", "Note"].forEach(h => {
        thead.append("th").attr("class", "th-" + h.toLowerCase().replace(/ /g, "-")).text(h);
    });

    const hScope = thead.append("th").attr("class", "th-scope");
    const scopeContainer = hScope.append("div").attr("class", "scope-header-content");
    scopeContainer.append("span").attr("class", "scope-title").text("Scope");
    const ctrlWrap = scopeContainer.append("div").attr("class", "table-ctrl-wrap");
    ctrlWrap.append("span").attr("class", "t-counter").text(`${start+1}-${end} / ${total}`);
    
    ctrlWrap.append("input")
        .attr("type", "number").attr("value", currentNumRows)
        .attr("min", "1").attr("max", total)
        .on("change", function() {
            currentNumRows = parseInt(this.value) || 1;
            tableStartIndex = 0; 
            render(filterData(currentData));
        });

    const nav = ctrlWrap.append("div").attr("class", "t-nav");
    nav.append("button").html("&#9650;").classed("off", start <= 0).on("click", () => {
        if (start > 0) { tableStartIndex++; render(filterData(currentData)); }
    });
    nav.append("button").html("&#9660;").classed("off", tableStartIndex <= 0).on("click", () => {
        if (tableStartIndex > 0) { tableStartIndex--; render(filterData(currentData)); }
    });

    const tbody = table.append("tbody");
    const items = tableData.slice(start, end);
    
    items.forEach((d, i) => {
        let rowClass = "";
        const absoluteIdx = start + i;

        if (absoluteIdx === total - 1) rowClass = "row-next";
        else if (absoluteIdx === total - 2) rowClass = "row-current";
        else if (absoluteIdx === total - 3) rowClass = "row-prev";
        else rowClass = "row-cycle-" + (absoluteIdx % 10);

        const tr = tbody.append("tr").attr("class", rowClass);
        [d.release, d.p1Deploy, d.branch, d.hybrisVersion, d.startMerge, d.startStabilization, d.branchUnfreeze, d.note, d.scope]
        .forEach(text => tr.append("td").html(text ? text.replace(/\n/g, "<br>") : ""));
    });
}

/* ========================= */
/* RENDER (ONLY DATE FIX)    */
/* ========================= */

function render(data) {
    if (!data) return;

    renderTable(data["release-table"]);

    g.selectAll("*").remove();
    const stickyContainer = d3.select("#branch-labels-sticky").html("");

    const legendBox = d3.select("#legend").html("").append("div").attr("class", "legend-box");
    Object.entries(colors).forEach(([k, c]) => {
        const row = legendBox.append("div").attr("class", "legend-row");
        row.append("div").attr("class", "legend-color").style("background", c);
        row.append("div").text(k);
    });

    const BS = BASE.branchSpacing, TO = BASE.topOffset, TLO = BASE.timelineOffset;

    const sV = document.getElementById("startDate").value ? new Date(document.getElementById("startDate").value) : null;
    const eV = document.getElementById("endDate").value ? new Date(document.getElementById("endDate").value) : null;

    const tD = new Set();
    (data.links || []).forEach(l => tD.add(l.date));
    (data.events || []).forEach(ev => {
        if (!sV || new Date(ev.dateFrom) >= sV) tD.add(ev.dateFrom);
        if (!eV || new Date(ev.dateTo) <= eV) tD.add(ev.dateTo);
    });

    const grouped = Array.from(tD).map(d => ({
        date: d,
        dObj: parseDate(d),
        items: (data.links || []).filter(l => l.date === d)
    })).sort((a,b)=>a.dObj-b.dObj);

    grouped.forEach(gr => {
        gr.w = gr.items.length <= 1
            ? BASE.SINGLE_WIDTH
            : (gr.items.length * BASE.CLUSTER_SPACING + BASE.CLUSTER_PADDING);
    });

    let xP = 20;
    const dateX = {};

    grouped.forEach((d, i) => {
        if (i !== 0) {
            const days = (d.dObj - grouped[i-1].dObj) / (1000 * 60 * 60 * 24);
            xP += (days <= 2 ? 80 : days <= 10 ? 120 : days <= 20 ? 180 : 240);
        }
        d.startX = xP;
        dateX[d.date] = d.startX + d.w / 2;
        xP += d.w;
    });

    const lastX = xP + 50;
    const chartHeight = TO + (data.branches || []).length * BS;

    svg.attr("width", lastX).attr("height", chartHeight);

    g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", TLO).attr("y2", TLO).attr("stroke", "#000");

    grouped.forEach(d => {
        g.append("rect").attr("x", d.startX).attr("y", TLO - 10).attr("width", d.w).attr("height", 20).attr("rx", 6).attr("class", "timeline-date");
        g.append("text").attr("x", d.startX + d.w/2).attr("y", TLO - 15).attr("text-anchor", "middle").attr("class", "timeline-text").text(d3.timeFormat("%d %b %Y")(d.dObj));
    });

    const bY = {};
    (data.branches || []).forEach((b, i) => {
        const y = TO + i * BS; 
        bY[b] = y;
        stickyContainer.append("div").attr("class", "sticky-branch-label").style("top", `${y}px`).append("div").attr("class", "branch-box").text(b);
        g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", y).attr("y2", y).attr("stroke", "#eee");
    });

    // EVENTS
    (data.events || []).forEach(ev => {
        const y = bY[ev.branch]; 
        if (y === undefined) return;

        const startGroup = grouped.find(g => g.date === ev.dateFrom);
        const endGroup = grouped.find(g => g.date === ev.dateTo);

        let xS = startGroup ? (startGroup.startX + startGroup.w) : 0;
        let xE = endGroup ? endGroup.startX : lastX;

        const rW = xE - xS;
        if (rW <= 0) return;

        const evG = g.append("g")
            .style("cursor", "pointer")
            .on("click", () => {
                openModal(`
                    <div class="modal-title">${ev.label}</div>
                    <div class="modal-row"><span class="modal-label">Branch:</span><span class="modal-value">${ev.branch}</span></div>
                    <div class="modal-row"><span class="modal-label">From:</span><span class="modal-value">${formatDateSafe(ev.dateFrom)}</span></div>
                    <div class="modal-row"><span class="modal-label">To:</span><span class="modal-value">${formatDateSafe(ev.dateTo)}</span></div>
                `);
            });

        evG.append("rect")
            .attr("x", xS)
            .attr("y", y - 16)
            .attr("width", rW)
            .attr("height", 32)
            .attr("fill", ev.color)
            .attr("fill-opacity", 0.15)
            .attr("stroke", ev.color)
            .attr("rx", 4);

        evG.append("text")
            .attr("x", xS + rW / 2)
            .attr("y", y + 5)
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "600")
            .text(ev.label);
    });

    const defs = svg.append("defs");
    Object.entries(colors).forEach(([k, c]) => {
        defs.append("marker")
            .attr("id", "arrow-" + k)
            .attr("viewBox", "0 0 10 10")
            .attr("refX", 10)
            .attr("refY", 5)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0 0 L10 5 L0 10Z")
            .attr("fill", c);
    });

    grouped.forEach(gr => {
        gr.items.forEach((l, i) => {

            const x = gr.items.length === 1
                ? dateX[gr.date]
                : gr.startX + BASE.CLUSTER_PADDING/2 + i*BASE.CLUSTER_SPACING;

            const y1 = bY[l.from];
            const y2 = bY[l.to];

            const distance = Math.abs(y2 - y1);
            let midY = distance > BASE.branchSpacing * 1.1
                ? y1 + (y2 - y1) * 0.675
                : (y1 + y2) / 2;

            const temp = g.append("text").text(l.label);
            const w = temp.node().getBBox().width + 20; 
            temp.remove();

            g.append("line")
                .attr("x1", x).attr("y1", y1)
                .attr("x2", x).attr("y2", y2)
                .attr("stroke", colors[l.type] || "#ccc")
                .attr("stroke-width", 2)
                .attr("marker-end", `url(#arrow-${l.type})`);

            const el = g.append("g")
                .style("cursor", "pointer")
                .on("click", () => {
                    openModal(`
                        <div class="modal-title">${l.label}</div>
                        <div class="modal-row"><span class="modal-label">Date:</span><span class="modal-value">${formatDateSafe(l.date)}</span></div>
                        <div class="modal-row"><span class="modal-label">From:</span><span class="modal-value">${l.from}</span></div>
                        <div class="modal-row"><span class="modal-label">To:</span><span class="modal-value">${l.to}</span></div>
                        <div class="modal-row"><span class="modal-label">Type:</span><span class="modal-value">${l.type}</span></div>
                        ${l.details ? `<div class="modal-row"><span class="modal-label">Details:</span><span class="modal-value">${l.details}</span></div>` : ""}
                    `);
                });

            el.append("rect")
                .attr("x", x-w/2).attr("y", midY-18)
                .attr("width", w).attr("height", 36)
                .attr("rx", 10)
                .attr("fill", colors[l.type] || "#ccc");

            el.append("text")
                .attr("x", x).attr("y", midY-2)
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .style("font-size", "12px")
                .text(l.label);

            el.append("text")
                .attr("x", x).attr("y", midY+10)
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .style("font-size", "10px")
                .text(formatDateSafe(l.date)); // ✅ FIX
        });
    });
}

/* ========================= */

document.getElementById("loadJsonBtn").onclick = () =>
    document.getElementById("jsonFileInput").click();

document.getElementById("jsonFileInput").onchange = function() {
    if(this.files[0]) loadFromFile(this.files[0]);
};