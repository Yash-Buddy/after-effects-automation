/*
  PosterFinish  -  After Effects ExtendScript (.jsx)

  Adds to the ACTIVE comp (on top of everything):
    - bold title with a hard cut-in
    - vignette
    - grain + contrast adjustment layer
  Run it after BeatWire. Safe to run on any comp.
*/
(function () {

    var CFG = {
        titleDefault: "OLD TOWN|DESK UPDATE.",   // use | for a new line
        titleColor: [0.85, 0.95, 0.05],          // yellow (matches your windows)
        titleFontSize: 130,
        titleStart: 0.4,                         // seconds, hard cut-in
        titleY: 0.80,                            // vertical position, fraction of comp height
        vignetteOpacity: 65,
        grainAmount: 9,
        contrast: 15
    };

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

    var W = comp.width, H = comp.height, dur = comp.duration;

    app.beginUndoGroup("Poster Finish");
    try {
        var raw = prompt("Title text (use | for a new line):", CFG.titleDefault);
        if (raw === null) raw = CFG.titleDefault;

        // ---- Vignette
        var vg = comp.layers.addSolid([0, 0, 0], "VIGNETTE", W, H, 1, dur);
        var cx = W / 2, cy = H / 2, rx = W * 0.55, ry = H * 0.55, k = 0.5523;
        var shp = new Shape();
        shp.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
        shp.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
        shp.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
        shp.closed = true;
        var mk = vg.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.property("ADBE Mask Shape").setValue(shp);
        mk.inverted = true;
        mk.property("ADBE Mask Feather").setValue([450, 450]);
        vg.property("Opacity").setValue(CFG.vignetteOpacity);

        // ---- Grain + contrast
        var adj = comp.layers.addSolid([1, 1, 1], "GRAIN + CONTRAST", W, H, 1, dur);
        adj.adjustmentLayer = true;
        var fx = adj.property("ADBE Effect Parade");
        try {
            var bc = fx.addProperty("ADBE Brightness & Contrast 2");
            bc.property(2).setValue(CFG.contrast);
        } catch (e1) {}
        try {
            var ns = fx.addProperty("ADBE Noise");
            ns.property(1).setValue(CFG.grainAmount);
            ns.property(2).setValue(0);
        } catch (e2) {}

        // ---- Title
        var title = raw.toUpperCase().split("|").join("\r");
        var tl = comp.layers.addText(title);
        tl.name = "TITLE";
        var tp = tl.property("Source Text");
        var td = tp.value;
        td.resetCharStyle();
        td.fontSize = CFG.titleFontSize;
        td.fillColor = CFG.titleColor;
        td.applyStroke = false;
        td.leading = CFG.titleFontSize * 0.9;
        try { td.font = "Arial-Black"; } catch (e3) {}
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        tp.setValue(td);
        tl.property("Position").setValue([W * 0.065, H * CFG.titleY]);
        if (CFG.titleStart < dur) tl.inPoint = CFG.titleStart;

        alert("Done. Edit the title with the Type tool, or change settings at the top of the script.");
    } catch (err) {
        alert("Script error:\n" + err.toString() + "\nLine: " + err.line);
    } finally {
        app.endUndoGroup();
    }
})();
