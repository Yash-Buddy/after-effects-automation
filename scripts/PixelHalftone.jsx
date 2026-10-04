/*
  PixelHalftone  -  After Effects ExtendScript (.jsx)

  Inspired by the pink/orange pixel poster. Works in YOUR comp:

    - Your dark text (the DATAVIZ... list) and the strip it sits in stay clean white
    - Everything to the left of that strip is filled with a pink panel and a
      checkerboard of orange-red pixel squares that act like a halftone:
        dense at the left edge, fading out toward the white strip
    - Your WHITE text layer (the big "palette design") sits on top and shows up
      as white letter shapes cut out of the pattern
    - The squares grow and shrink in stepped sizes (pixel-like, not smooth):
        * a slow wave travels through the field
        * the music pumps the squares bigger on loud sounds
        * without music the wave still moves on its own

  Run: open your comp, then File > Scripts > Run Script File...
  CONTROLS layer: Density, Wave, Wave Speed, Audio Pop, Levels, Level Scale
*/
(function () {

    var CFG = {
        gap: 28,                // px of white kept between the pattern and your list text
        cell: 32,               // approx. size of one pixel square in px
        checker: true,          // true = checkerboard (every other cell), false = all cells
        seed: 3
    };

    var PRESETS = {
        "Pink & orange (reference)": { bg: [0.97, 0.76, 0.88], px: [[0.85, 0.31, 0.11], [0.80, 0.22, 0.09], [0.92, 0.46, 0.18]] },
        "Blue & yellow":             { bg: [0.74, 0.90, 0.98], px: [[0.09, 0.27, 0.85], [0.98, 0.78, 0.22], [0.06, 0.10, 0.42]] },
        "Black & white":             { bg: [0.93, 0.93, 0.93], px: [[0.04, 0.04, 0.04], [0.25, 0.25, 0.27]] },
        "Teal & coral":              { bg: [0.93, 0.85, 0.68], px: [[0.07, 0.42, 0.38], [0.98, 0.42, 0.35], [0.04, 0.22, 0.24]] },
        "Custom (type hex below)":   null
    };
    var presetNames = [];
    for (var pn in PRESETS) presetNames.push(pn);

    function hexToRgb(h) {
        h = h.replace(/[^0-9a-fA-F]/g, "");
        if (h.length !== 6) return null;
        return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
    }

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

    // ---------- colors dialog
    var dlg = new Window("dialog", "Pixel Halftone");
    dlg.orientation = "column";
    dlg.alignChildren = "left";
    dlg.add("statictext", undefined, "Colors:");
    var dd = dlg.add("dropdownlist", undefined, presetNames);
    dd.selection = 0;
    dlg.add("statictext", undefined, "Custom: panel background hex");
    var ebg = dlg.add("edittext", undefined, "#F7C2E0"); ebg.characters = 30;
    dlg.add("statictext", undefined, "Custom: pixel colors hex (comma separated)");
    var epx = dlg.add("edittext", undefined, "#D94F1C, #C93810, #EE7530"); epx.characters = 30;
    var bg0 = dlg.add("group");
    bg0.add("button", undefined, "Build", { name: "ok" });
    bg0.add("button", undefined, "Cancel", { name: "cancel" });
    if (dlg.show() !== 1) return;

    var chosen = PRESETS[presetNames[dd.selection.index]];
    if (chosen === null) {
        var cbg = hexToRgb(ebg.text);
        var parts = epx.text.split(","), cpx = [], q, c;
        for (q = 0; q < parts.length; q++) { c = hexToRgb(parts[q]); if (c) cpx.push(c); }
        if (cbg && cpx.length >= 1) chosen = { bg: cbg, px: cpx };
        else { alert("Invalid hex colors. Using the reference colors."); chosen = PRESETS[presetNames[0]]; }
    }

    var seedVal = CFG.seed * 9301 + 49297;
    function rnd() {
        seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
        return seedVal / 4294967296;
    }
    function n(x) { return (Math.round(x * 10000) / 10000).toString(); }

    var CW = comp.width, CH = comp.height, dur = comp.duration;

    // ---------- measure the DARK text (the white ghost title is ignored)
    var i, L, textLayers = [], box = null;
    for (i = 1; i <= comp.numLayers; i++) {
        L = comp.layer(i);
        if (!(L instanceof TextLayer)) continue;
        textLayers.push(L);
        var isWhite = false;
        try {
            var td = L.property("Source Text").value;
            var fc = td.fillColor;
            isWhite = (fc[0] > 0.92 && fc[1] > 0.92 && fc[2] > 0.92);
        } catch (e0) {}
        if (isWhite) continue;
        try {
            var rc = L.sourceRectAtTime(0, false);
            var pos = L.property("Position").value;
            var an = L.property("Anchor Point").value;
            var sc = L.property("Scale").value;
            var rot = L.property("Rotation").value * Math.PI / 180;
            var cs = Math.cos(rot), sn = Math.sin(rot);
            var pts = [[rc.left, rc.top], [rc.left + rc.width, rc.top],
                       [rc.left, rc.top + rc.height], [rc.left + rc.width, rc.top + rc.height]];
            for (var p = 0; p < 4; p++) {
                var lx = (pts[p][0] - an[0]) * sc[0] / 100;
                var ly = (pts[p][1] - an[1]) * sc[1] / 100;
                var X = pos[0] + lx * cs - ly * sn;
                var Y = pos[1] + lx * sn + ly * cs;
                if (!box) box = { l: X, t: Y, r: X, b: Y };
                if (X < box.l) box.l = X;
                if (X > box.r) box.r = X;
                if (Y < box.t) box.t = Y;
                if (Y > box.b) box.b = Y;
            }
        } catch (e1) {}
    }

    var x1 = box ? box.l - CFG.gap : CW * 0.6;
    x1 = Math.max(CW * 0.25, Math.min(CW * 0.9, x1));
    var RW = Math.round(x1), RH = CH;

    var rows = Math.max(4, Math.round(RH / CFG.cell));
    var uh = RH / rows;
    var cols = Math.max(2, Math.round(RW / uh));
    var uw = RW / cols;

    // ---------- helpers
    function findAudio() {
        var j, it;
        for (j = 1; j <= app.project.numItems; j++) {
            it = app.project.item(j);
            if (it instanceof FootageItem && it.hasAudio && !it.hasVideo) return it;
        }
        return null;
    }
    function ensureSlider(layer, name, val) {
        var parade = layer.property("ADBE Effect Parade");
        if (parade.property(name)) return;
        var fx = parade.addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(val);
    }

    var HEAD =
        'var ctl=thisComp.layer("CONTROLS");' +
        'var ts=Math.floor(time*12)/12;' +
        'var lvl;' +
        'try{var au=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider").valueAtTime(ts);' +
        'lvl=Math.min(1,au*ctl.effect("Level Scale")("Slider"));}' +
        'catch(err){lvl=0.5+0.5*Math.sin(time*1.7);}' +
        'var dens=ctl.effect("Density")("Slider");' +
        'var wv=ctl.effect("Wave")("Slider");' +
        'var ws=ctl.effect("Wave Speed")("Slider");' +
        'var pop=ctl.effect("Audio Pop")("Slider");' +
        'var q=Math.max(1,Math.round(ctl.effect("Levels")("Slider")));';

    app.beginUndoGroup("Pixel Halftone");
    try {
        // ---------- music (optional)
        var peak = 0, status = "no audio (automatic movement)", v;
        var amp = null;
        try { amp = comp.layer("Audio Amplitude"); } catch (e2) {}
        if (!amp) {
            var audioLayer = null;
            for (i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).hasAudio && !comp.layer(i).hasVideo &&
                    comp.layer(i).source instanceof FootageItem) { audioLayer = comp.layer(i); break; }
            }
            if (!audioLayer) {
                var music = findAudio();
                if (!music && confirm("Add a music track so the pixels react to the beat?\n(Cancel = no audio, automatic movement)")) {
                    var f = File.openDialog("Select your music track");
                    if (f) music = app.project.importFile(new ImportOptions(f));
                }
                if (music) { audioLayer = comp.layers.add(music); audioLayer.name = "MUSIC"; }
            }
            if (audioLayer) {
                comp.openInViewer();
                for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
                audioLayer.selected = true;
                var cmd = app.findMenuCommandId("Convert Audio to Keyframes");
                if (!cmd) cmd = 2639;
                app.executeCommand(cmd);
                try { amp = comp.layer("Audio Amplitude"); } catch (e3) {}
                if (!amp) status = "audio conversion FAILED (Animation > Keyframe Assistant > Convert Audio to Keyframes)";
            }
        }
        if (amp) {
            var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
            for (i = 1; i <= both.numKeys; i++) { v = both.keyValue(i); if (v > peak) peak = v; }
            status = "audio OK, peak = " + n(peak);
        }

        // ---------- controls
        var ctl = null;
        try { ctl = comp.layer("CONTROLS"); } catch (e4) {}
        if (!ctl) { ctl = comp.layers.addNull(dur); ctl.name = "CONTROLS"; }
        ensureSlider(ctl, "Density", 0.95);      // base fill, 0..1.2
        ensureSlider(ctl, "Wave", 0.30);         // strength of the traveling wave
        ensureSlider(ctl, "Wave Speed", 1.0);
        ensureSlider(ctl, "Audio Pop", 0.5);     // how much the music inflates the squares
        ensureSlider(ctl, "Levels", 5);          // size steps (lower = chunkier pixels)
        ensureSlider(ctl, "Level Scale", peak > 0 ? 1 / peak : 1);

        // ---------- panel background
        var bgl = comp.layers.addShape();
        bgl.name = "PANEL BG";
        var bg1 = bgl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var bgc = bg1.property("ADBE Vectors Group");
        bgc.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([RW, RH]);
        bgc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(chosen.bg);
        bgl.property("Position").setValue([RW / 2, RH / 2]);

        // ---------- pixel squares
        var pl = comp.layers.addShape();
        pl.name = "PANEL PIXELS";
        var root = pl.property("ADBE Root Vectors Group");
        pl.property("Anchor Point").setValue([0, 0]);
        pl.property("Position").setValue([0, 0]);

        var cx, cy, g, gc, u, vv, col, count = 0;
        for (cy = 0; cy < rows; cy++) {
            for (cx = 0; cx < cols; cx++) {
                if (CFG.checker && ((cx + cy) % 2 !== 0)) continue;
                u = (cx + 0.5) / cols;
                vv = (cy + 0.5) / rows;
                col = chosen.px[Math.floor(rnd() * chosen.px.length)];

                g = root.addProperty("ADBE Vector Group");
                gc = g.property("ADBE Vectors Group");
                gc.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").expression =
                    HEAD +
                    'var u=' + n(u) + ',v=' + n(vv) + ';' +
                    'var f=dens*(1-u*0.9)+wv*Math.sin(v*14+ts*ws+u*6)+wv*0.5*Math.sin(v*37-ts*ws*1.7)+pop*lvl*(1-u*0.6);' +
                    'f=Math.max(0,Math.min(1,f));f=Math.round(f*q)/q;' +
                    '[' + n(uw) + '*f,' + n(uh) + '*f];';
                gc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(col);
                g.property("ADBE Vector Transform Group").property("ADBE Vector Position")
                    .setValue([(cx + 0.5) * uw, (cy + 0.5) * uh]);
                count++;
            }
        }

        // ---------- stack order: user's text on top, pattern just below it
        if (textLayers.length > 0) {
            var lowestText = textLayers[0];
            for (i = 1; i < textLayers.length; i++) if (textLayers[i].index > lowestText.index) lowestText = textLayers[i];
            bgl.moveAfter(lowestText);
            pl.moveBefore(bgl);
        }

        comp.time = 0;
        alert("Done.\nStatus: " + status +
              "\n\nPattern panel: x 0 to " + RW + " (white strip kept from x " + Math.round(x1 + CFG.gap) + ")" +
              "\n" + cols + " x " + rows + " cells, " + count + " squares" +
              (box ? "" : "\n\nNo dark text found, so the panel covers the left 60%.") +
              "\n\nCONTROLS layer:\n- Density: how full the field is\n- Wave / Wave Speed: the traveling ripple\n" +
              "- Audio Pop: how much the music inflates the squares\n- Levels: size steps (lower = chunkier)\n" +
              "- Level Scale: audio sensitivity\n\nYour white title now shows as white letters cut out of the pattern.");
    } catch (err2) {
        alert("Script error:\n" + err2.toString() + "\nLine: " + err2.line);
    } finally {
        app.endUndoGroup();
    }
})();
