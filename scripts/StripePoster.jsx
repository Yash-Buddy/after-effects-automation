/*
  StripePoster  -  After Effects ExtendScript (.jsx)

  Builds the symmetric rainbow-stripe poster from your reference, animated and
  audio reactive:
    - 5 bands: a tall stripe band on top and 4 "glitch" bands below it, each
      with its own stripe count and range, so the symmetry centers shift
    - crimson blocks fill the leftover space of each band
    - Audio reaction:
        * the tall band breathes taller / shorter with the music level
          (the glitch bands squeeze to make room)
        * colors rotate along the stripes, further when the music is louder
    - Without music it still moves (slow breathing + slow color drift)
    - Optional text: top-left, top-right (big), bottom-left

  Run: File > Scripts > Run Script File...   (no setup needed, it makes a new comp)
  CONTROLS layer: Height Pulse, Color Rate, Color Kick, Level Scale
*/
(function () {

    var CFG = {
        compName: "Stripe Poster",
        w: 1080, h: 1350, fps: 30,
        maxDuration: 12,
        margin: 44,                          // teal border around the poster
        bgColor: [0.17, 0.50, 0.46],         // teal background
        paper: [1, 1, 1],
        crimson: [0.80, 0.13, 0.34],
        // colors from the poster EDGE to the CENTER
        palette: [
            [0.97, 0.70, 0.82],   // pink
            [0.80, 0.76, 0.96],   // lavender
            [0.74, 0.90, 0.98],   // light blue
            [0.12, 0.06, 0.42],   // navy
            [0.20, 0.55, 0.38],   // green
            [0.98, 0.78, 0.25],   // yellow
            [0.96, 0.45, 0.25],   // orange
            [0.93, 0.33, 0.20],   // vermilion
            [0.86, 0.15, 0.10]    // red (center)
        ],
        // bands: h = share of the poster height, stripes fill [x0..x1] (fractions of width)
        bands: [
            { h: 0.58, x0: 0.00, x1: 0.88, n: 17 },
            { h: 0.08, x0: 0.00, x1: 0.72, n: 20 },
            { h: 0.10, x0: 0.00, x1: 0.80, n: 14 },
            { h: 0.18, x0: 0.10, x1: 1.00, n: 13 },
            { h: 0.06, x0: 0.05, x1: 1.00, n: 22 }
        ],
        textColor: [0.04, 0.04, 0.04]
    };

    function n(x) { return (Math.round(x * 10000) / 10000).toString(); }

    function findAudio() {
        var j, it;
        for (j = 1; j <= app.project.numItems; j++) {
            it = app.project.item(j);
            if (it instanceof FootageItem && it.hasAudio && !it.hasVideo) return it;
        }
        return null;
    }
    function addSlider(layer, name, val) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(val);
    }

    // ---------- text dialog
    var dlg = new Window("dialog", "Stripe Poster");
    dlg.orientation = "column";
    dlg.alignChildren = "left";
    dlg.add("statictext", undefined, "Top-left text (use | for a new line, empty = none):");
    var t1 = dlg.add("edittext", undefined, "PALETTE DESIGN|@palettedesign_ind"); t1.characters = 38;
    dlg.add("statictext", undefined, "Top-right big text:");
    var t2 = dlg.add("edittext", undefined, "01"); t2.characters = 38;
    dlg.add("statictext", undefined, "Bottom-left text:");
    var t3 = dlg.add("edittext", undefined, "Skill set and expertise"); t3.characters = 38;
    var bg0 = dlg.add("group");
    bg0.add("button", undefined, "Build", { name: "ok" });
    bg0.add("button", undefined, "Cancel", { name: "cancel" });
    if (dlg.show() !== 1) return;

    var P = "[";
    (function () {
        var k, a = [];
        for (k = 0; k < CFG.palette.length; k++) {
            a.push("[" + n(CFG.palette[k][0]) + "," + n(CFG.palette[k][1]) + "," + n(CFG.palette[k][2]) + ",1]");
        }
        P += a.join(",") + "]";
    })();
    var S = CFG.palette.length;

    var HEAD =
        'var ctl=thisComp.layer("CONTROLS");' +
        'var ts=Math.floor(time*15)/15;' +
        'var lvl;' +
        'try{var au=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider").valueAtTime(ts);' +
        'lvl=Math.min(1,au*ctl.effect("Level Scale")("Slider"));}' +
        'catch(err){lvl=0.5+0.5*Math.sin(time*1.7);}';

    app.beginUndoGroup("Stripe Poster");
    try {
        // ---------- music (optional)
        var music = findAudio();
        if (!music && confirm("Add a music track so the poster reacts to the beat?\n(Cancel = no audio, slow automatic movement)")) {
            var f = File.openDialog("Select your music track");
            if (f) music = app.project.importFile(new ImportOptions(f));
        }

        var cw = CFG.w, ch = CFG.h;
        var dur = music ? Math.min(music.duration, CFG.maxDuration) : 10;
        var comp = app.project.items.addComp(CFG.compName, cw, ch, 1, dur, CFG.fps);
        comp.openInViewer();

        var PX = CFG.margin, PY = CFG.margin;
        var PW = cw - 2 * CFG.margin, PH = ch - 2 * CFG.margin;

        // ---------- background + paper
        comp.layers.addSolid(CFG.bgColor, "BACKGROUND", cw, ch, 1, dur);
        var paper = comp.layers.addShape();
        paper.name = "POSTER";
        var pg = paper.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        var pc = pg.property("ADBE Vectors Group");
        pc.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([PW, PH]);
        pc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(CFG.paper);
        paper.property("Position").setValue([PX + PW / 2, PY + PH / 2]);
        try {
            var ds = paper.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
            ds.property(2).setValue(130);
            ds.property(4).setValue(14);
            ds.property(5).setValue(30);
        } catch (e0) {}

        // ---------- audio -> keyframes
        var peak = 0, status = "no audio (automatic movement)", i, v;
        if (music) {
            var al = comp.layers.add(music);
            al.name = "MUSIC";
            for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            al.selected = true;
            var cmd = app.findMenuCommandId("Convert Audio to Keyframes");
            if (!cmd) cmd = 2639;
            app.executeCommand(cmd);
            var amp = null;
            try { amp = comp.layer("Audio Amplitude"); } catch (e1) {}
            if (amp) {
                var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
                for (i = 1; i <= both.numKeys; i++) { v = both.keyValue(i); if (v > peak) peak = v; }
                status = "audio OK, peak = " + n(peak);
            } else {
                status = "audio conversion FAILED (Animation > Keyframe Assistant > Convert Audio to Keyframes)";
            }
        }

        // ---------- controls
        var ctl = comp.layers.addNull(dur);
        ctl.name = "CONTROLS";
        addSlider(ctl, "Height Pulse", 0.15);       // how much the tall band grows with the music
        addSlider(ctl, "Color Rate", 0.3);          // slow color rotation (steps per second)
        addSlider(ctl, "Color Kick", 3);            // colors rotated at the loudest moment
        addSlider(ctl, "Level Scale", peak > 0 ? 1 / peak : 1);

        // ---------- bands
        var bases = [], b;
        for (b = 0; b < CFG.bands.length; b++) bases.push(CFG.bands[b].h);
        var baseStr = "[" + bases.join(",") + "]";

        for (b = 0; b < CFG.bands.length; b++) {
            var B = CFG.bands[b];
            var sl = comp.layers.addShape();
            sl.name = "BAND " + (b + 1);
            sl.property("Anchor Point").setValue([0, 0]);
            var root = sl.property("ADBE Root Vectors Group");

            // geometry: layer scale-Y stretches the 100px tall rectangles
            var GEO = HEAD +
                'var base=' + baseStr + ';' +
                'var mainH=base[0]*(1+ctl.effect("Height Pulse")("Slider")*lvl);' +
                'var restOld=1-base[0],restNew=1-mainH,hs=[mainH],j;' +
                'for(j=1;j<base.length;j++)hs.push(base[j]/restOld*restNew);' +
                'var top=0;for(j=0;j<' + b + ';j++)top+=hs[j];';
            sl.property("Position").expression = GEO + '[' + PX + ',' + PY + '+top*' + PH + '];';
            sl.property("Scale").expression = GEO + '[100,(hs[' + b + ']*' + PH + '+1)];';

            var addRect = function (x, w, expr, color) {
                var g = root.addProperty("ADBE Vector Group");
                var gc = g.property("ADBE Vectors Group");
                gc.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([w + 0.6, 100]);
                var fill = gc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color");
                if (expr) fill.expression = expr; else fill.setValue(color);
                g.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([x + w / 2, 50]);
            };

            // crimson fill on both sides of the stripe range
            if (B.x0 > 0) addRect(0, B.x0 * PW, null, CFG.crimson);
            if (B.x1 < 1) addRect(B.x1 * PW, (1 - B.x1) * PW, null, CFG.crimson);

            // stripes
            var sw = (B.x1 - B.x0) * PW / B.n, s, t, m, k;
            for (s = 0; s < B.n; s++) {
                t = (s + 0.5) / B.n;
                m = Math.abs(2 * t - 1);
                k = (S - 1) - Math.min(S - 1, Math.floor(m * S));
                addRect(B.x0 * PW + s * sw, sw,
                    HEAD +
                    'var P=' + P + ';' +
                    'var sh=Math.floor(ts*ctl.effect("Color Rate")("Slider"))+Math.round(lvl*ctl.effect("Color Kick")("Slider"));' +
                    'P[(' + k + '+sh)%' + S + '];', null);
            }
        }

        // ---------- text
        var addText = function (str, size, pos, just) {
            if (!str || str.replace(/\s/g, "") === "") return;
            var tl = comp.layers.addText(str.split("|").join("\r"));
            var tp = tl.property("Source Text");
            var td = tp.value;
            td.resetCharStyle();
            td.fontSize = size;
            td.fillColor = CFG.textColor;
            td.applyStroke = false;
            try { td.font = "ArialMT"; } catch (ef) {}
            td.justification = just;
            tp.setValue(td);
            tl.property("Position").setValue(pos);
        };
        addText(t1.text, 22, [PX + 24, PY + 44], ParagraphJustification.LEFT_JUSTIFY);
        addText(t2.text, 70, [PX + PW - 24, PY + 78], ParagraphJustification.RIGHT_JUSTIFY);
        addText(t3.text, 22, [PX + 24, PY + PH - 24], ParagraphJustification.LEFT_JUSTIFY);

        comp.time = 0;
        comp.openInViewer();
        alert("Done.\nStatus: " + status +
              "\n\nCONTROLS layer:\n- Height Pulse: how much the tall band breathes with the music\n" +
              "- Color Rate: slow color rotation\n- Color Kick: how far colors jump on loud sounds\n" +
              "- Level Scale: audio sensitivity (higher = stronger reaction)\n\n" +
              "Colors, band layout and margins can be edited at the top of the script.");
    } catch (err2) {
        alert("Script error:\n" + err2.toString() + "\nLine: " + err2.line);
    } finally {
        app.endUndoGroup();
    }
})();
