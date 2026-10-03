/*
  PixelStreaks  -  After Effects ExtendScript (.jsx)   (v2 of StreakPoster)

  Crisp, grid-locked version:
    - Everything snaps to a square pixel grid (default 40 px cells -> 27 x 48)
    - Every row is the same height (one cell)
    - Each row has one streak made by stretching a single column of the photo
    - Streaks slide horizontally, cell by cell, in stepped (held) frames
    - Widths are whole numbers of cells, so edges are hard and aligned
    - Layers use Draft quality = no smoothing, hard pixel edges
    - Optional music: widths jump on the beat; colored blocks flash on beats
    - Sharpen layer on top

  Run: File > Scripts > Run Script File...   (select your photo first if you like)
  Then open the NEW comp "Pixel Streaks" and set viewer resolution to Full.
*/
(function () {

    var CFG = {
        compName: "Pixel Streaks",
        w: 1080, h: 1920, fps: 30,
        maxDuration: 12,
        cell: 40,                // grid cell size in px (must divide 1080 and 1920 evenly)
        sampleWidth: 3,          // photo px sampled per streak (smaller = flatter color)
        seed: 11,
        colorBlocks: 10,
        useAudio: true,
        sharpen: true,
        palette: [
            [0.98, 0.86, 0.15],
            [0.25, 0.72, 0.66],
            [0.78, 0.14, 0.14],
            [0.10, 0.22, 0.45],
            [0.93, 0.93, 0.90]
        ]
    };

    var seedVal = CFG.seed * 9301 + 49297;
    function rnd() {
        seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
        return seedVal / 4294967296;
    }
    function n(x) { return (Math.round(x * 1000000) / 1000000).toString(); }
    function np(x) { return "(" + n(x) + ")"; }

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
        var i, it;
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
    }

    app.beginUndoGroup("Pixel Streaks");
    try {
        // ---------- footage
        var photo = findStill() || importFile("Select your photo");
        if (!photo) { alert("No photo selected."); return; }

        var music = null;
        if (CFG.useAudio) {
            music = findAudio();
            if (!music && confirm("Add a music track?\n(Cancel = animate without audio)")) {
                music = importFile("Select your music track");
            }
        }

        var cw = CFG.w, ch = CFG.h, cell = CFG.cell;
        var cols = Math.floor(cw / cell), rows = Math.floor(ch / cell);
        var pw = photo.width, ph = photo.height;
        var dur = music ? Math.min(music.duration, CFG.maxDuration) : CFG.maxDuration;
        var comp = app.project.items.addComp(CFG.compName, cw, ch, 1, dur, CFG.fps);
        comp.openInViewer();

        var fu = Math.max(cw / pw, ch / ph);
        var fit = fu * 100;
        var D = Math.max(CFG.sampleWidth, 1) / 2;

        // ---------- base photo
        var base = comp.layers.add(photo);
        base.name = "PHOTO";
        base.property("Position").setValue([cw / 2, ch / 2]);
        base.property("Scale").setValue([fit, fit]);

        // ---------- audio
        var peak = 0, audioStatus = "no audio", i, v;
        if (music) {
            var al = comp.layers.add(music);
            al.name = "MUSIC";
            for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            al.selected = true;
            var cmd = app.findMenuCommandId("Convert Audio to Keyframes");
            if (!cmd) cmd = 2639;
            app.executeCommand(cmd);
            var amp = null;
            try { amp = comp.layer("Audio Amplitude"); } catch (e0) {}
            if (amp) {
                var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
                for (i = 1; i <= both.numKeys; i++) { v = both.keyValue(i); if (v > peak) peak = v; }
                audioStatus = "audio OK, peak = " + n(peak);
            } else {
                audioStatus = "audio conversion FAILED (use Animation > Keyframe Assistant > Convert Audio to Keyframes)";
            }
        }

        // ---------- controls
        var ctl = comp.layers.addNull(dur);
        ctl.name = "CONTROLS";
        addSlider(ctl, "Step FPS", 12);         // how often things jump
        addSlider(ctl, "Move Speed", 6);        // cells per second (horizontal slide)
        addSlider(ctl, "Max Stretch", 10);      // max streak width in cells
        addSlider(ctl, "Audio Gain", peak > 0 ? 8 / peak : 0);
        addSlider(ctl, "Threshold", peak > 0 ? peak * 0.55 : 1);

        var HEAD =
            'var ctl=thisComp.layer("CONTROLS");' +
            'var fps=Math.max(1,ctl.effect("Step FPS")("Slider"));' +
            'var ts=Math.floor(time*fps)/fps;' +
            'var au=0,thr=1;' +
            'try{au=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider").valueAtTime(ts);' +
            'thr=ctl.effect("Threshold")("Slider");}catch(err){}';

        // ---------- streak rows (equal height, grid locked)
        for (i = 0; i < rows; i++) {
            var cy0 = i * cell, cy1 = (i + 1) * cell;
            var yc = (cy0 + cy1) / 2;
            var Y0 = ph / 2 + (cy0 - ch / 2) / fu;
            var Y1 = ph / 2 + (cy1 - ch / 2) / fu;
            var MY = (Y0 + Y1) / 2;

            var G0 = Math.floor(rnd() * cols);
            var DIR = rnd() < 0.5 ? -1 : 1;
            var RS = 0.5 + Math.floor(rnd() * 4) * 0.5;       // row speed 0.5 .. 2
            var W1 = 0.4 + rnd() * 1.6, P1 = rnd() * 6.283;
            var W2 = 0.3 + rnd() * 1.2, P2 = rnd() * 6.283;
            var BW = rnd();

            var GEO = HEAD +
                'var ms=ctl.effect("Move Speed")("Slider");' +
                'var mc=ctl.effect("Max Stretch")("Slider");' +
                'var gn=ctl.effect("Audio Gain")("Slider");' +
                'var COLS=' + cols + ',CELL=' + cell + ';' +
                'var cells=Math.floor(ts*ms*' + n(RS) + ');' +
                'var gi=((' + G0 + '+' + np(DIR) + '*cells)%COLS+COLS)%COLS;' +
                'var e1=0.5+0.5*Math.sin(ts*' + n(W1) + '+' + n(P1) + ');' +
                'var e2=0.5+0.5*Math.sin(ts*' + n(W2) + '+' + n(P2) + ');' +
                'var nC=1+Math.floor(mc*e1*e2*e1+gn*au*' + n(BW) + ');' +
                'nC=Math.min(nC,COLS);' +
                'var xl=gi*CELL,wc=nC*CELL,xc=xl+wc/2;' +
                'var axp=' + n(pw / 2) + '+(xc-' + n(cw / 2) + ')/' + n(fu) + ';';

            var L = comp.layers.add(photo);
            L.name = "ROW " + (i + 1);
            try { L.quality = LayerQuality.DRAFT; } catch (eq) {}

            var sh = new Shape();
            sh.vertices = [[0, Y0], [pw, Y0], [pw, Y1], [0, Y1]];
            sh.closed = true;
            var mk = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            mk.property("ADBE Mask Shape").setValue(sh);

            L.property("Anchor Point").expression = GEO + '[axp,' + n(MY) + '];';
            L.property("Position").expression = GEO + '[xc,' + n(yc) + '];';
            L.property("Scale").expression = GEO + '[100*wc/' + n(2 * D) + ',' + n(fit) + '];';
            mk.property("ADBE Mask Shape").expression = GEO +
                'createPath([[axp-' + n(D) + ',' + n(Y0) + '],[axp+' + n(D) + ',' + n(Y0) + '],' +
                '[axp+' + n(D) + ',' + n(Y1) + '],[axp-' + n(D) + ',' + n(Y1) + ']],[],[],true);';
        }

        // ---------- flat colored blocks (grid snapped, stepped, sliding)
        for (i = 0; i < CFG.colorBlocks; i++) {
            var bwC = 1 + Math.floor(rnd() * 3);
            var bhC = 1 + Math.floor(rnd() * 6);
            var gx = Math.floor(rnd() * cols), gy = Math.floor(rnd() * (rows - bhC));
            var col = CFG.palette[Math.floor(rnd() * CFG.palette.length)];
            var bdir = rnd() < 0.5 ? -1 : 1;
            var brs = 0.5 + Math.floor(rnd() * 3) * 0.5;
            var bw1 = 0.8 + rnd() * 3, bp1 = rnd() * 6.283;
            var bw2 = 0.5 + rnd() * 2, bp2 = rnd() * 6.283;
            var bth = 0.9 + rnd() * 0.8;
            var bmult = 0.9 + rnd() * 0.5;

            var sl = comp.layers.addShape();
            sl.name = "BLOCK " + (i + 1);
            var grp = sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var cont = grp.property("ADBE Vectors Group");
            cont.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([bwC * cell, bhC * cell]);
            cont.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(col);

            sl.property("Position").expression = HEAD +
                'var ms=ctl.effect("Move Speed")("Slider");' +
                'var cells=Math.floor(ts*ms*' + n(brs) + ');' +
                'var gi=((' + gx + '+' + np(bdir) + '*cells)%' + cols + '+' + cols + ')%' + cols + ';' +
                '[gi*' + cell + '+' + (bwC * cell / 2) + ',' + (gy * cell + bhC * cell / 2) + '];';
            sl.property("Opacity").expression = HEAD +
                'var e=Math.sin(ts*' + n(bw1) + '+' + n(bp1) + ')+Math.sin(ts*' + n(bw2) + '+' + n(bp2) + ');' +
                '(e>' + n(bth) + ' || au>thr*' + n(bmult) + ') ? 100 : 0;';
        }

        // ---------- sharpen
        if (CFG.sharpen) {
            var adj = comp.layers.addSolid([1, 1, 1], "SHARPEN", cw, ch, 1, dur);
            adj.adjustmentLayer = true;
            try {
                var us = adj.property("ADBE Effect Parade").addProperty("ADBE Unsharp Mask2");
                us.property(1).setValue(120);   // amount
                us.property(2).setValue(1.2);   // radius
            } catch (es) {}
        }

        comp.time = 0;
        comp.openInViewer();
        alert("Done.\nStatus: " + audioStatus +
              "\n\nOpen the comp 'Pixel Streaks' and set viewer resolution to Full.\n\n" +
              "CONTROLS layer:\n- Step FPS: lower = more jerky/pixel-like\n- Move Speed: horizontal slide, cells/second\n" +
              "- Max Stretch: widest streak in cells\n- Audio Gain / Threshold: music reaction");
    } catch (err2) {
        alert("Script error:\n" + err2.toString() + "\nLine: " + err2.line);
    } finally {
        app.endUndoGroup();
    }
})();
