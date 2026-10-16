#target illustrator
// ------------------------------------------------------------
// Flat-vector style trace v2 (no white holes, enforced color limit)
// Run: File > Scripts > Other Script... > choose this file
// ------------------------------------------------------------

// ===== SETTINGS =====
var PRESET          = "6 Colors"; // "3 Colors", "6 Colors", "16 Colors"
var COLORS          = 6;          // final color count (4 = bold poster)
var MIN_AREA        = 300;        // px; higher = fewer tiny shapes, flatter look
var PATH_FIDELITY   = 15;         // lower = smoother curves
var CORNER_FIDELITY = 10;         // lower = rounder corners
var RESAMPLE_DPI    = 72;         // lower = softer input = flatter shapes (try 72-100)

var REMOVE_TINY     = true;
var TINY_AREA       = 80;

// Optional palette snapping (hex). Leave [] to keep traced colors.
var PALETTE = [];
// var PALETTE = ["#E03A26", "#101510", "#D9A866", "#7D1520", "#F2E8D5"];
// =====================

function hexToRGB(h) {
    h = h.replace("#", "");
    return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}
function makeColor(c) { var k = new RGBColor(); k.red = c.r; k.green = c.g; k.blue = c.b; return k; }
function nearest(c, pal) {
    var best = pal[0], bd = 1e12;
    for (var i = 0; i < pal.length; i++) {
        var dr = c.r - pal[i].r, dg = c.g - pal[i].g, db = c.b - pal[i].b;
        var d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; best = pal[i]; }
    }
    return best;
}
function itemArea(it) {
    try {
        if (it.typename === "PathItem") return Math.abs(it.area);
        if (it.typename === "CompoundPathItem") {
            var s = 0;
            for (var i = 0; i < it.pathItems.length; i++) s += Math.abs(it.pathItems[i].area);
            return s;
        }
    } catch (e) {}
    return 1e9;
}
function firstPath(it) {
    if (it.typename === "PathItem") return it;
    if (it.typename === "CompoundPathItem" && it.pathItems.length) return it.pathItems[0];
    return null;
}

(function () {
    var skipped = [];
    var imgFile = File.openDialog("Choose the image to trace");
    if (!imgFile) return;

    var doc = app.documents.add(DocumentColorSpace.RGB, 800, 1000);
    var srcLayer = doc.layers[0];
    srcLayer.name = "Source image";

    var placed = srcLayer.placedItems.add();
    placed.file = imgFile;
    placed.position = [0, 0];
    var b = placed.geometricBounds;
    doc.artboards[0].artboardRect = [b[0], b[1], b[2], b[3]];

    var traced;
    try { traced = placed.trace(); }
    catch (e) { alert("Could not start Image Trace:\n" + e); return; }

    var t = traced.tracing.tracingOptions;

    // 1) Start from Illustrator's own preset so the color limit is real
    try { t.loadFromPreset(PRESET); } catch (e) { skipped.push("preset:" + PRESET); }

    function setOpt(name, value) {
        try { t[name] = value; } catch (e) { skipped.push(name); }
    }

    // 2) Override with our settings
    setOpt("tracingMode", TracingModeType.TRACINGMODECOLOR);
    setOpt("maxColors", COLORS);
    setOpt("tracingMethod", TracingMethodType.TRACINGMETHODOVERLAPPING); // stacked = no gaps
    setOpt("ignoreWhite", false);                                        // keep light areas
    setOpt("fills", true);
    setOpt("strokes", false);
    setOpt("minArea", MIN_AREA);
    setOpt("pathFidelity", PATH_FIDELITY);
    setOpt("cornerFidelity", CORNER_FIDELITY);
    setOpt("resample", true);
    setOpt("resampleResolution", RESAMPLE_DPI);

    app.redraw();

    // 3) Read back what Illustrator really applied
    var report = "";
    try {
        report = "Applied: colors=" + t.maxColors +
                 ", method=" + (t.tracingMethod == TracingMethodType.TRACINGMETHODOVERLAPPING ? "overlapping" : "abutting") +
                 ", ignoreWhite=" + t.ignoreWhite +
                 ", minArea=" + t.minArea +
                 ", paths=" + t.pathFidelity +
                 ", corners=" + t.cornerFidelity;
    } catch (e) { report = "(could not read back settings)"; }

    var group;
    try { group = traced.tracing.expandTracing(); }
    catch (e) { alert("Trace finished, but expanding failed:\n" + e); return; }

    var pal = [];
    for (var p = 0; p < PALETTE.length; p++) pal.push(hexToRGB(PALETTE[p]));

    var removed = 0;
    for (var i = group.pageItems.length - 1; i >= 0; i--) {
        var it = group.pageItems[i];
        if (REMOVE_TINY && itemArea(it) < TINY_AREA) { it.remove(); removed++; continue; }
        if (pal.length) {
            var pi = firstPath(it);
            if (pi && pi.filled && pi.fillColor.typename === "RGBColor") {
                var c = { r: pi.fillColor.red, g: pi.fillColor.green, b: pi.fillColor.blue };
                var col = makeColor(nearest(c, pal));
                if (it.typename === "PathItem") it.fillColor = col;
                else for (var k = 0; k < it.pathItems.length; k++) it.pathItems[k].fillColor = col;
            }
        }
    }

    var vec = doc.layers.add();
    vec.name = "Flat vector";
    group.move(vec, ElementPlacement.PLACEATBEGINNING);
    srcLayer.visible = false;

    var msg = "Done.\n" + report + "\nSpecks removed: " + removed;
    if (skipped.length) msg += "\n\nSkipped (not supported in your version): " + skipped.join(", ");
    alert(msg);
})();
