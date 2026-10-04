/*
  StripeFill  -  After Effects ExtendScript (.jsx)

  Uses YOUR comp (no new comp). Fills all the free space around your text with
  rainbow stripe bands that START AT THE RIGHT EDGE and run leftwards.

    - Your text layers are measured (rotation included) and never covered:
        * the TOP band sits beside your text (starts to the right of it)
        * the bands BELOW run the full width, underneath the text area
    - Rainbow runs one way: pink at the right edge -> red at the left end
    - Stripes get slightly wider or narrower along each band, and every band
      has its own color offset, so the bands look glitched against each other
    - Intro: the bands slide in from the right edge, one after another
    - Audio: the top band grows with the music level, colors rotate further
      when it is louder. Without music it breathes slowly on its own.

  Run:  open your comp, then File > Scripts > Run Script File...
  CONTROLS layer: Height Pulse, Color Rate, Color Kick, Level Scale, Intro Time
*/
(function () {

    var CFG = {
        gap: 40,                   // px kept clear around your text
        palette: [                 // colors from the RIGHT edge to the LEFT end
            [0.97, 0.70, 0.82],    // pink
            [0.80, 0.76, 0.96],    // lavender
            [0.74, 0.90, 0.98],    // light blue
            [0.12, 0.06, 0.42],    // navy
            [0.20, 0.55, 0.38],    // green
            [0.98, 0.78, 0.25],    // yellow
            [0.96, 0.45, 0.25],    // orange
            [0.93, 0.33, 0.20],    // vermilion
            [0.86, 0.15, 0.10]     // red
        ],
        // the top band is special (it sits beside the text). The others share the rest of the height.
        // g = how much wider (+) or narrower (-) each stripe gets going left, ph = color offset
        topBand: { n: 13, g: 0.05, ph: 0 },
        bands: [
            { rel: 0.22, n: 26, g: -0.04, ph: 2 },
            { rel: 0.26, n: 16, g: 0.07,  ph: -1 },
            { rel: 0.36, n: 11, g: 0.00,  ph: 1 },
            { rel: 0.16, n: 28, g: 0.03,  ph: 3 }
        ]
    };

    function n(x) { return (Math.round(x * 10000) / 10000).toString(); }

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

    var CW = comp.width, CH = comp.height, dur = comp.duration;

    // ---------- measure the text (rotation aware)
    var i, L, tl = [];
    var box = null;
    for (i = 1; i <= comp.numLayers; i++) {
        L = comp.layer(i);
        if (!(L instanceof TextLayer)) continue;
        tl.push(L);
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
        } catch (e0) {}
    }

    var x0, hTopFrac;
    if (box) {
        x0 = Math.min(CW * 0.85, Math.max(0, box.r + CFG.gap));
        hTopFrac = Math.min(0.6, Math.max(0.2, (box.b + CFG.gap) / CH));
    } else {
        x0 = 0;
        hTopFrac = 0.4;
    }

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

    var S = CFG.palette.length;
    var P = "[";
    (function () {
        var k, a = [];
        for (k = 0; k < S; k++) {
            a.push("[" + n(CFG.palette[k][0]) + "," + n(CFG.palette[k][1]) + "," + n(CFG.palette[k][2]) + ",1]");
        }
        P += a.join(",") + "]";
    })();

    var HEAD =
        'var ctl=thisComp.layer("CONTROLS");' +
        'var ts=Math.floor(time*15)/15;' +
        'var lvl;' +
        'try{var au=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider").valueAtTime(ts);' +
        'lvl=Math.min(1,au*ctl.effect("Level Scale")("Slider"));}' +
        'catch(err){lvl=0.5+0.5*Math.sin(time*1.7);}';

    app.beginUndoGroup("Stripe Fill");
    try {
        // ---------- music (optional)
        var peak = 0, status = "no audio (automatic movement)", v;
        var amp = null;
        try { amp = comp.layer("Audio Amplitude"); } catch (e1) {}
        if (!amp) {
            var audioLayer = null;
            for (i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).hasAudio && !comp.layer(i).hasVideo &&
                    comp.layer(i).source instanceof FootageItem) { audioLayer = comp.layer(i); break; }
            }
            if (!audioLayer) {
                var music = findAudio();
                if (!music && confirm("Add a music track so the stripes react to the beat?\n(Cancel = no audio, slow automatic movement)")) {
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
                try { amp = comp.layer("Audio Amplitude"); } catch (e2) {}
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
        try { ctl = comp.layer("CONTROLS"); } catch (e3) {}
        if (!ctl) { ctl = comp.layers.addNull(dur); ctl.name = "CONTROLS"; }
        ensureSlider(ctl, "Height Pulse", 0.25);
        ensureSlider(ctl, "Color Rate", 0.3);
        ensureSlider(ctl, "Color Kick", 3);
        ensureSlider(ctl, "Level Scale", peak > 0 ? 1 / peak : 1);
        ensureSlider(ctl, "Intro Time", 0.8);

        // ---------- band list: [top band] + the rest
        var specs = [];
        specs.push({ h: hTopFrac, left: x0, n: CFG.topBand.n, g: CFG.topBand.g, ph: CFG.topBand.ph });
        var b;
        for (b = 0; b < CFG.bands.length; b++) {
            specs.push({ h: CFG.bands[b].rel * (1 - hTopFrac), left: 0,
                         n: CFG.bands[b].n, g: CFG.bands[b].g, ph: CFG.bands[b].ph });
        }
        var bases = [];
        for (b = 0; b < specs.length; b++) bases.push(specs[b].h);
        var baseStr = "[" + bases.join(",") + "]";

        // ---------- build bands (anchored on the RIGHT edge)
        var made = [];
        for (b = 0; b < specs.length; b++) {
            var B = specs[b];
            var sl = comp.layers.addShape();
            sl.name = "STRIPE BAND " + (b + 1);
            sl.property("Anchor Point").setValue([CW, 0]);
            var root = sl.property("ADBE Root Vectors Group");

            var GEO = HEAD +
                'var base=' + baseStr + ';' +
                'var mainH=base[0]*(1+ctl.effect("Height Pulse")("Slider")*lvl);' +
                'var restOld=1-base[0],restNew=1-mainH,hs=[mainH],j;' +
                'for(j=1;j<base.length;j++)hs.push(base[j]/restOld*restNew);' +
                'var top=0;for(j=0;j<' + b + ';j++)top+=hs[j];';
            var introT = 'var it=ctl.effect("Intro Time")("Slider");' +
                'var sx=ease(time,' + n(b * 0.15) + ',' + n(b * 0.15) + '+Math.max(0.05,it),0,100);';
            sl.property("Position").expression = GEO + '[' + CW + ',top*' + CH + '];';
            sl.property("Scale").expression = GEO + introT + '[sx,(hs[' + b + ']*' + CH + '+1)];';

            // stripe widths, growing (g>0) or shrinking (g<0) going left; normalised to the band extent
            var extent = CW - B.left, ws = [], tot = 0, s, w;
            for (s = 0; s < B.n; s++) {
                w = Math.max(0.3, 1 + B.g * s);
                ws.push(w);
                tot += w;
            }
            var cursor = CW;
            for (s = 0; s < B.n; s++) {
                w = ws[s] / tot * extent;
                var x = cursor - w;
                cursor = x;
                var idx = Math.min(S - 1, Math.floor(((s + 0.5) / B.n) * S));
                var k = ((idx + B.ph) % S + S) % S;

                var g = root.addProperty("ADBE Vector Group");
                var gc = g.property("ADBE Vectors Group");
                gc.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([w + 0.6, 100]);
                gc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").expression =
                    HEAD +
                    'var P=' + P + ';' +
                    'var sh=Math.floor(ts*ctl.effect("Color Rate")("Slider"))+Math.round(lvl*ctl.effect("Color Kick")("Slider"));' +
                    'P[(' + k + '+sh)%' + S + '];';
                g.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([x + w / 2, 50]);
            }
            made.push(sl);
        }

        // keep the user's text on top
        if (tl.length > 0) {
            var lowestText = tl[0];
            for (i = 1; i < tl.length; i++) if (tl[i].index > lowestText.index) lowestText = tl[i];
            for (i = 0; i < made.length; i++) made[i].moveAfter(lowestText);
        }

        comp.time = 0;
        var msg = "Done. Bands: " + specs.length + "\nStatus: " + status;
        if (box) {
            msg += "\n\nText found at x " + Math.round(box.l) + "-" + Math.round(box.r) +
                   ", y " + Math.round(box.t) + "-" + Math.round(box.b) +
                   "\nTop band starts at x " + Math.round(x0) + " and is " + Math.round(hTopFrac * CH) + " px tall.";
        } else {
            msg += "\n\nNo text layers found, so the top band uses the full width.";
        }
        msg += "\n\nCONTROLS layer: Height Pulse, Color Rate, Color Kick, Level Scale, Intro Time.";
        alert(msg);
    } catch (err3) {
        alert("Script error:\n" + err3.toString() + "\nLine: " + err3.line);
    } finally {
        app.endUndoGroup();
    }
})();
