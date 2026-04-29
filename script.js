const svg = d3.select("#chart");
const g = svg.append("g");
const tooltip = d3.select("#tooltip");
const pinnedTooltip = d3.select("#pinnedTooltip");

let currentData = null;
let tableStartIndex = 0; 
let currentNumRows = 3; 

const parseDate = d3.timeParse("%Y-%m-%d");

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
    CLUSTER_SPACING: 140, 
    CLUSTER_PADDING: 50,  
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

const envColors = {
    "D1": "#475569", 
    "D2": "#A855F7", 
    "S1": "#0D9488", 
    "S2": "#eb259f", 
    "P1": "#78001a" 
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
document.getElementById("modalOverlay").onclick = (e) => {
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

    return {
        ...data,
        links: fLinks,
        events: fEvents,
        branches: (data.branches || []).filter(b => used.has(b))
    };
}

function setDefaultDates(data) {
    const allD = [
        ...(data.links || []).map(l => new Date(l.date)),
        ...(data.events || []).flatMap(e => [new Date(e.dateFrom), new Date(e.dateTo)])
    ];
    if (!allD.length) return;
    const min = new Date(Math.min(...allD));
    const max = new Date(Math.max(...allD));
    const fmt = d => d.toISOString().split("T")[0];
    document.getElementById("startDate").value = fmt(min);
    document.getElementById("endDate").value = fmt(max);
}

document.getElementById("startDate").addEventListener("change", () => {
    if (currentData) render(filterData(currentData));
});
document.getElementById("endDate").addEventListener("change", () => {
    if (currentData) render(filterData(currentData));
});
document.getElementById("resetDatesBtn").onclick = () => {
    if (!currentData) return;
    setDefaultDates(currentData);
    render(filterData(currentData));
};

document.getElementById("viewModeSwitch").addEventListener("change", () => {
    if (currentData) render(filterData(currentData));
});

/* ========================= */
/* TABLE                     */
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
        .attr("min", "1").on("change", function() {
            currentNumRows = parseInt(this.value) || 1;
            tableStartIndex = 0; 
            render(filterData(currentData));
        });

    const nav = ctrlWrap.append("div").attr("class", "t-nav");
    nav.append("button").html("&#9650;").on("click", () => {
        if (start > 0) { tableStartIndex++; render(filterData(currentData)); }
    });
    nav.append("button").html("&#9660;").on("click", () => {
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
/* RENDER                    */
/* ========================= */

function render(data) {
    if (!data) return;
    renderTable(data["release-table"]);
    g.selectAll("*").remove();
    const stickyContainer = d3.select("#branch-labels-sticky").html("");
    
    const isEnvView = document.getElementById("viewModeSwitch").checked;
    const legendArea = d3.select("#legend").html("");
    
    if (!isEnvView) {
        legendArea.append("div").attr("class", "legend-title").text("Links & Branches");
        const legendBox = legendArea.append("div").attr("class", "legend-box");
        Object.entries(colors).forEach(([k, c]) => {
            const row = legendBox.append("div").attr("class", "legend-row");
            row.append("div").attr("class", "legend-color").style("background", c);
            row.append("div").text(k);
        });
    }

    legendArea.append("div").attr("class", "legend-title").style("margin-top", "15px").text("Environments");
    const envLegendBox = legendArea.append("div").attr("class", "legend-box");
    Object.entries(envColors).forEach(([env, color]) => {
        const row = envLegendBox.append("div").attr("class", "legend-row");
        row.append("div").attr("class", "legend-color").style("background", color);
        row.append("div").text(env);
    });

    if (data.description) {
        legendArea.append("div").attr("class", "description-box")
            .html(data.description.replace(/\n/g, "<br>"));
    }

    const BS = BASE.branchSpacing, TO = BASE.topOffset, TLO = BASE.timelineOffset;
    const sV_str = document.getElementById("startDate").value;
    const eV_str = document.getElementById("endDate").value;
    const sV = sV_str ? new Date(sV_str) : null;
    const eV = eV_str ? new Date(eV_str) : null;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const tD = new Set();
    const todayObj = new Date(todayStr);
    if ((!sV || todayObj >= sV) && (!eV || todayObj <= eV)) tD.add(todayStr);

    if (!isEnvView) {
        (data.links || []).forEach(l => {
            const d = new Date(l.date);
            if ((!sV || d >= sV) && (!eV || d <= eV)) tD.add(l.date);
        });
    }

    (data.events || []).forEach(ev => {
        const dF = new Date(ev.dateFrom), dT = new Date(ev.dateTo);
        if ((sV && dT < sV) || (eV && dF > eV)) return;
        const vF = sV && dF < sV ? sV : dF;
        const vT = eV && dT > eV ? eV : dT;
        tD.add(vF.toISOString().split("T")[0]);
        tD.add(vT.toISOString().split("T")[0]);
    });

    const grouped = Array.from(tD).map(d => ({
        date: d, dObj: parseDate(d),
        items: isEnvView ? [] : (data.links || []).filter(l => l.date === d)
    })).sort((a,b)=>a.dObj-b.dObj);

    grouped.forEach(gr => {
        gr.w = gr.items.length <= 1 ? BASE.SINGLE_WIDTH : (gr.items.length * BASE.CLUSTER_SPACING + BASE.CLUSTER_PADDING);
    });

    let xP = 20;
    const dateX = {};
    grouped.forEach((d, i) => {
        if (i !== 0) {
            const days = (d.dObj - grouped[i-1].dObj) / 86400000;
            xP += (days <= 2 ? 80 : days <= 10 ? 120 : days <= 20 ? 180 : 240);
        }
        d.startX = xP;
        dateX[d.date] = d.startX + d.w / 2;
        xP += d.w;
    });

    const lastX = xP + 50;
    
    let entities = [];
    if (isEnvView) {
        const activeEnvs = new Set((data.events || []).map(ev => ev.env));
        entities = Object.keys(envColors).filter(env => activeEnvs.has(env));
    } else {
        entities = (data.branches || []);
    }

    const yMap = {};
    const chartHeight = TO + entities.length * BS;
    svg.attr("width", lastX).attr("height", chartHeight);

    const todayData = grouped.find(g => g.date === todayStr);
    if (todayData) {
        g.append("rect")
            .attr("x", todayData.startX).attr("y", TLO - 10).attr("width", todayData.w).attr("height", chartHeight - TLO + 10)
            .attr("class", "today-column-highlight");
    }

    g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", TLO).attr("y2", TLO).attr("stroke", "#000");

    grouped.forEach(d => {
        const isToday = d.date === todayStr;
        const rectClass = isToday ? "timeline-date timeline-today-bg" : "timeline-date";
        const textClass = isToday ? "timeline-text timeline-today-text" : "timeline-text";
        g.append("rect").attr("x", d.startX).attr("y", TLO-10).attr("width", d.w).attr("height", 20).attr("rx", 6).attr("class", rectClass);
        g.append("text").attr("x", d.startX+d.w/2).attr("y", TLO-15).attr("text-anchor", "middle").attr("class", textClass).text(d3.timeFormat("%d %b %Y")(d.dObj));
    });

    entities.forEach((entity, i) => {
        const y = TO + i * BS; 
        yMap[entity] = y;
        stickyContainer.append("div").attr("class", "sticky-branch-label").style("top", `${y}px`).append("div").attr("class", "branch-box").text(entity);
        g.append("line").attr("x1", 0).attr("x2", lastX).attr("y1", y).attr("y2", y).attr("stroke", "#eee");
    });

    (data.events || []).forEach(ev => {
        const targetEntity = isEnvView ? ev.env : ev.branch;
        const y = yMap[targetEntity]; 
        if (y === undefined) return;

        const realDF = new Date(ev.dateFrom), realDT = new Date(ev.dateTo);
        if ((sV && realDT < sV) || (eV && realDF > eV)) return;

        const vF = sV && realDF < sV ? sV : realDF;
        const vT = eV && realDT > eV ? eV : realDT;
        const sK = vF.toISOString().split("T")[0], eK = vT.toISOString().split("T")[0];
        
        const sG = grouped.find(g => g.date === sK), eG = grouped.find(g => g.date === eK);
        let xS = sG ? (isEnvView ? sG.startX + (sG.w/2) : sG.startX + sG.w) : 0, 
            xE = eG ? (isEnvView ? eG.startX + (eG.w/2) : eG.startX) : lastX;
        
        const rW = xE - xS; if (rW <= 0) return;

        const isCutLeft = sV && realDF < sV;
        const isCutRight = eV && realDT > eV;
        const evColor = envColors[ev.env] || "#ccc";
        const h = 32; // altezza barra
        const topY = y - h/2;

        const evG = g.append("g").style("cursor", "pointer").on("click", () => {
            openModal(`<div class="modal-title">${ev.label}</div><div class="modal-row"><span class="modal-label">Env:</span>${ev.env}</div><div class="modal-row"><span class="modal-label">Branch:</span>${ev.branch}</div><div class="modal-row"><span class="modal-label">From:</span>${formatDateSafe(ev.dateFrom)}</div><div class="modal-row"><span class="modal-label">To:</span>${formatDateSafe(ev.dateTo)}</div>`);
        });

        // 1. Corpo principale (senza bordi laterali)
        evG.append("rect")
            .attr("x", xS).attr("y", topY).attr("width", rW).attr("height", h)
            .attr("fill", evColor).attr("fill-opacity", 0.12)
            .attr("stroke", evColor).attr("stroke-width", 1.5)
            .attr("stroke-dasharray", `${rW},${h},${rW},${h}`); // Solo bordi orizzontali (Sopra e Sotto)

        // 2. Bordo Sinistro
        const leftEdge = evG.append("line")
            .attr("x1", xS).attr("y1", topY).attr("x2", xS).attr("y2", topY + h)
            .attr("stroke", evColor).attr("stroke-width", 1.5);
        if (isCutLeft) leftEdge.attr("stroke-dasharray", "4,3");

        // 3. Bordo Destro
        const rightEdge = evG.append("line")
            .attr("x1", xS + rW).attr("y1", topY).attr("x2", xS + rW).attr("y2", topY + h)
            .attr("stroke", evColor).attr("stroke-width", 1.5);
        if (isCutRight) rightEdge.attr("stroke-dasharray", "4,3");

        evG.append("text").attr("x", xS + rW/2).attr("y", y+5).attr("text-anchor", "middle").style("font-size", "11px").style("font-weight", "600").text(ev.label);
    });

    if (!isEnvView) {
        const defs = svg.append("defs");
        Object.entries(colors).forEach(([k, c]) => {
            defs.append("marker").attr("id", "arrow-"+k).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0 0 L10 5 L0 10Z").attr("fill", c);
        });

        const linkLayer = g.append("g").attr("class", "links-layer");
        grouped.forEach(gr => {
            gr.items.forEach((l, i) => {
                const x = gr.items.length === 1 ? dateX[gr.date] : gr.startX + BASE.CLUSTER_PADDING / 2 + i * BASE.CLUSTER_SPACING;
                const y1 = yMap[l.from], y2 = yMap[l.to];
                if (y1 === undefined || y2 === undefined) return;

                const midY = Math.abs(y2 - y1) > BS * 1.1 ? y1 + (y2 - y1) * 0.675 : (y1 + y2) / 2;
                const color = colors[l.type] || "#ccc";

                linkLayer.append("line").attr("x1", x).attr("y1", y1).attr("x2", x).attr("y2", y2).attr("stroke", color).attr("stroke-width", 2).attr("marker-end", `url(#arrow-${l.type})`);
                
                const temp = g.append("text").text(l.label).style("font-size", "11px").style("font-weight", "600");
                const textW = temp.node().getBBox().width; temp.remove();
                const dw = Math.max(textW + 85, 130), dh = 48;

                const diamond = linkLayer.append("g").style("cursor", "pointer").on("click", () => {
                    openModal(`<div class="modal-title">${l.label}</div><div class="modal-row"><span class="modal-label">Date:</span>${l.date}</div><div class="modal-row"><span class="modal-label">From:</span>${l.from}</div><div class="modal-row"><span class="modal-label">To:</span>${l.to}</div><div class="modal-row"><span class="modal-label">Type:</span>${l.type}</div>`);
                });
                const hw = dw/2, hh = dh/2;
                const hsl = d3.hsl(color);
                const bgColor = d3.hsl(hsl.h, 0.3, 0.92).toString();

                diamond.append("path").attr("d", `M${x-hw},${midY} L${x},${midY-hh} L${x+hw},${midY} L${x},${midY+hh} Z`).attr("fill", bgColor).attr("stroke", color).attr("stroke-width", 2.5);
                diamond.append("text").attr("x", x).attr("y", midY+1).attr("text-anchor", "middle").style("font-size", "11px").style("font-weight", "700").attr("fill", "#1e293b").text(l.label);
                diamond.append("text").attr("x", x).attr("y", midY+13).attr("text-anchor", "middle").style("font-size", "9px").style("font-weight", "600").attr("fill", "#475569").text(formatDateSafe(l.date));
            });
        });
    }
}

document.getElementById("loadJsonBtn").onclick = () => document.getElementById("jsonFileInput").click();
document.getElementById("jsonFileInput").onchange = function() { if(this.files[0]) loadFromFile(this.files[0]); };