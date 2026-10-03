/*
  Tehran Beat Reel  -  After Effects ExtendScript (.jsx)

  What it builds (1080x1920, 30fps):
   - Your photo, cover-fit, with a slow push-in
   - Audio converted to keyframes, auto threshold
   - Red flash blocks that blink on the beat (different blocks hit at different loudness)
   - White strobe on the loudest peaks
   - Scale pop + small shake on beats
   - Vignette, contrast/grain adjustment layer
   - Bold yellow title with a hard cut-in

  Run: File > Scripts > Run Script File...
  Tip: select your photo (and optionally the music) in the Project panel first.
*/

(function () {

    // ---------------- SETTINGS (edit these) ----------------
    var CFG = {
        compName: "Tehran Beat Reel",
        w: 1080, h: 1920, fps: 30,
        maxDuration: 15,            // seconds (reels: keep it short)
        pushIn: 1.18,               // end scale multiplier for the push-in
        thresholdFactor: 0.55,      // beat threshold = this x loudest peak (lower = more flashes)
        popAmount: 4,               // scale % added on each beat
        shakePx: 14,                // shake pixels on loud hits
        flashColor: [0.92, 0.17, 0.10],
        titleColor: [0.98, 0.88, 0.15],
        titleDefault: "TEHRAN|DESK UPDATE.",   // use | for a new line
        titleFontSize: 130,
        titleStart: 0.4,            // seconds
        // Red blocks, in fractions of the comp. mult = how loud a hit must be (1 = normal beat)
        flashes: [
            { name: "Flash - Tower",       x: 0.50, y: 0.455, w: 0.10, h: 0.20, mult: 1.00 },
            { name: "Flash - Buildings L", x: 0.25, y: 0.80,  w: 0.40, h: 0.14, mult: 0.90 },
            { name: "Flash - Buildings R", x: 0.78, y: 0.70,  w: 0.30, h: 0.10, mult: 1.05 },
            { name: "Flash - Sky",         x: 0.50, y: 0.15,  w: 1.00, h: 0.22, mult: 1.20 }
        ]
    };
    // -------------------------------------------------------

    function findStill() {
        var sel = app.project.selection, i, it;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            if (it instanceof FootageItem && it.hasVideo && it.mainSource.isStill) return it;
        }
        for (i = 1; i <= app.project.numItems; i++) {
            it = app.project.item(i);
            if (it instanceof FootageItem && it.hasVideo && it.mainSource.isStill) return it;
        }
        return null;
    }

    function findAudio() {
        var sel = app.project.selection, i, it;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            if (it instanceof FootageItem && it.hasAudio && !it.hasVideo) return it;
        }
        for (i = 1; i <= app.project.numItems; i++) {
            it = app.project.item(i);
            if (it instanceof FootageItem && it.hasAudio && !it.hasVideo) return it;
        }
        return null;
    }

    function importFile(msg) {
        var f = File.openDialog(msg);
        if (!f) return null;
        return app.project.importFile(new ImportOptions(f));
    }

    function addSlider(layer, name, val) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(val);
        return fx;
    }

    app.beginUndoGroup("Tehran Beat Reel");
    try {
        // ---- Footage
        var photo = findStill() || importFile("Select your photo");
        if (!photo) { alert("No photo selected."); return; }
        var music = findAudio() || importFile("Select your music track");
        if (!music) { alert("No music selected."); return; }

        var dur = Math.min(music.duration, CFG.maxDuration);
        var comp = app.project.items.addComp(CFG.compName, CFG.w, CFG.h, 1, dur, CFG.fps);
        comp.openInViewer();

        // ---- Photo + push-in
        var pl = comp.layers.add(photo);
        pl.name = "PHOTO";
        var fit = Math.max(CFG.w / photo.width, CFG.h / photo.height) * 100;
        pl.property("Position").setValue([CFG.w / 2, CFG.h / 2]);
        var sc = pl.property("Scale");
        sc.setValueAtTime(0, [fit, fit]);
        sc.setValueAtTime(dur, [fit * CFG.pushIn, fit * CFG.pushIn]);

        // ---- Music + Convert Audio to Keyframes
        var al = comp.layers.add(music);
        al.name = "MUSIC";
        var i;
        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        al.selected = true;
        var cmd = app.findMenuCommandId("Convert Audio to Keyframes");
        if (!cmd) cmd = 2639;
        app.executeCommand(cmd);

        var amp = comp.layer("Audio Amplitude");
        if (!amp) {
            alert("Could not auto-run 'Convert Audio to Keyframes'.\n\nSelect the MUSIC layer, run Animation > Keyframe Assistant > Convert Audio to Keyframes, then run this script again.");
            return;
        }

        // find loudest peak -> auto threshold
        var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
        var peak = 0, v;
        for (i = 1; i <= both.numKeys; i++) {
            v = both.keyValue(i);
            if (v > peak) peak = v;
        }
        if (peak <= 0) peak = 20;
        var thr = peak * CFG.thresholdFactor;

        // ---- Controls
        var ctl = comp.layers.addNull(dur);
        ctl.name = "CONTROLS";
        addSlider(ctl, "Threshold", thr);
        addSlider(ctl, "Pop Amount", CFG.popAmount);
        addSlider(ctl, "Shake", CFG.shakePx);

        var HEAD =
            'var a=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider");' +
            'var t=thisComp.layer("CONTROLS").effect("Threshold")("Slider");';

        // beat pop + shake on the photo
        sc.expression = HEAD +
            'var p=thisComp.layer("CONTROLS").effect("Pop Amount")("Slider");' +
            'a>t ? value+[p,p] : value;';
        pl.property("Position").expression = HEAD +
            'var s=thisComp.layer("CONTROLS").effect("Shake")("Slider");' +
            'seedRandom(timeToFrames(time),true);' +
            'var r=[random(-s,s),random(-s,s)];' +
            'a>t*1.2 ? value+r : value;';

        // ---- Red flash blocks
        for (i = 0; i < CFG.flashes.length; i++) {
            var f = CFG.flashes[i];
            var sl = comp.layers.addShape();
            sl.name = f.name;
            var grp = sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var cont = grp.property("ADBE Vectors Group");
            var rect = cont.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([f.w * CFG.w, f.h * CFG.h]);
            var fill = cont.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue(CFG.flashColor);
            sl.property("Position").setValue([f.x * CFG.w, f.y * CFG.h]);
            sl.property("Opacity").expression = HEAD + 'a>t*' + f.mult + ' ? 100 : 0;';
        }

        // ---- White strobe on the biggest hits
        var st = comp.layers.addSolid([1, 1, 1], "STROBE", CFG.w, CFG.h, 1, dur);
        st.property("Opacity").expression = HEAD + 'a>t*1.45 ? 55 : 0;';

        // ---- Vignette
        var vg = comp.layers.addSolid([0, 0, 0], "VIGNETTE", CFG.w, CFG.h, 1, dur);
        var cx = CFG.w / 2, cy = CFG.h / 2, rx = CFG.w * 0.55, ry = CFG.h * 0.55, k = 0.5523;
        var shp = new Shape();
        shp.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
        shp.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
        shp.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
        shp.closed = true;
        var mk = vg.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.property("ADBE Mask Shape").setValue(shp);
        mk.inverted = true;
        mk.property("ADBE Mask Feather").setValue([450, 450]);
        vg.property("Opacity").setValue(70);

        // ---- Grade + grain adjustment layer
        var adj = comp.layers.addSolid([1, 1, 1], "GRADE + GRAIN", CFG.w, CFG.h, 1, dur);
        adj.adjustmentLayer = true;
        var fx = adj.property("ADBE Effect Parade");
        try {
            var bc = fx.addProperty("ADBE Brightness & Contrast 2");
            bc.property(1).setValue(-8);   // brightness
            bc.property(2).setValue(28);   // contrast
        } catch (e1) {}
        try {
            var ns = fx.addProperty("ADBE Noise");
            ns.property(1).setValue(9);    // amount of noise
            ns.property(2).setValue(0);    // mono grain
        } catch (e2) {}

        // ---- Title
        var raw = prompt("Title text (use | for a new line):", CFG.titleDefault);
        if (raw === null) raw = CFG.titleDefault;
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
        tl.property("Position").setValue([70, CFG.h * 0.78]);
        tl.inPoint = CFG.titleStart;   // hard cut-in

        comp.time = 0;
        comp.openInViewer();
        alert("Done!\n\nAuto threshold: " + Math.round(thr * 10) / 10 +
              "\nFewer/more flashes: change 'Threshold' on the CONTROLS layer.\n" +
              "Move red blocks: select a Flash layer and change its Position/size.");
    } catch (err) {
        alert("Script error:\n" + err.toString() + "\nLine: " + err.line);
    } finally {
        app.endUndoGroup();
    }
})();
