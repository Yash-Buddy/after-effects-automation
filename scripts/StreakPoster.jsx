/*
  StreakPoster  -  After Effects ExtendScript (.jsx)

  Procedural "pixel-stretch" poster like your reference:
    - Your photo as the base
    - N masked copies of the photo, each stretched horizontally from a single
      column of pixels, so it smears into colored streaks
    - Streaks grow and shrink on their own (procedural, no keyframes)
    - If a music track is used, streaks also kick on the audio
    - Flat colored blocks (yellow / teal / red / navy) that blink

  Run: File > Scripts > Run Script File...
  Select your photo in the Project panel first (optional).
  Everything keeps moving even without audio.
*/
(function () {

    var CFG = {
        compName: "Streak Poster",
        w: 1080, h: 1920, fps: 30,
        maxDuration: 12,
        seed: 7,                 // change for a different random layout
        blocks: 22,              // number of streak strips
        colorBlocks: 8,          // number of flat colored blocks
        useAudio: true,
        palette: [
            [0.98, 0.86, 0.15],  // yellow
            [0.25, 0.72, 0.66],  // teal
            [0.78, 0.14, 0.14],  // red
            [0.10, 0.22, 0.45],  // navy
            [0.93, 0.93, 0.90]   // off-white
        ]
    };

    // seeded random so a layout can be repeated
    var seedVal = CFG.seed * 9301 + 49297;
    function rnd() {
        seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
        return seedVal / 4294967296;
    }

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
    function n(x) { return (Math.round(x * 1000) / 1000).toString(); }

    app.beginUndoGroup("Streak Poster");
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

        var cw = CFG.w, ch = CFG.h;
        var pw = photo.width, ph = photo.height;
        var dur = music ? Math.min(music.duration, CFG.maxDuration) : CFG.maxDuration;
        var comp = app.project.items.addComp(CFG.compName, cw, ch, 1, dur, CFG.fps);
        comp.openInViewer();

        var fu = Math.max(cw / pw, ch / ph);   // fit scale (unit)
        var fit = fu * 100;                    // fit scale (percent)

        // ---------- base photo
        var base = comp.layers.add(photo);
        base.name = "PHOTO";
        base.property("Position").setValue([cw / 2, ch / 2]);
        base.property("Scale").setValue([fit, fit]);

        // ---------- audio -> keyframes
        var peak = 0, audioStatus = "no audio";
        var i, v;
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
                audioStatus = "audio conversion FAILED (run Animation > Keyframe Assistant > Convert Audio to Keyframes manually)";
            }
        }

        // ---------- controls
        var ctl = comp.layers.addNull(dur);
        ctl.name = "CONTROLS";
        addSlider(ctl, "Stretch Amount", 100);
        addSlider(ctl, "Speed", 1);
        addSlider(ctl, "Audio Gain", peak > 0 ? 14 / peak : 0);
        addSlider(ctl, "Threshold", peak > 0 ? peak * 0.55 : 1);

        var HEAD =
            'var ctl=thisComp.layer("CONTROLS");' +
            'var a=0,t=1;' +
            'try{a=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider");' +
            't=ctl.effect("Threshold")("Slider");}catch(err){}';

        // ---------- streak strips
        for (i = 0; i < CFG.blocks; i++) {
            var bh = (0.008 + Math.pow(rnd(), 2) * 0.11) * ph;
            var cy = rnd() * ph;
            var y0 = Math.max(0, cy - bh / 2), y1 = Math.min(ph, cy + bh / 2);
            var my = (y0 + y1) / 2;
            var ax = (0.05 + rnd() * 0.9) * pw;
            var d = (0.006 + rnd() * 0.014) * pw;

            var L = comp.layers.add(photo);
            L.name = "STREAK " + (i + 1);
            L.property("Anchor Point").setValue([ax, my]);
            L.property("Position").setValue([cw / 2 + (ax - pw / 2) * fu, ch / 2 + (my - ph / 2) * fu]);
            L.property("Scale").setValue([fit, fit]);

            var sh = new Shape();
            sh.vertices = [[ax - d, y0], [ax + d, y0], [ax + d, y1], [ax - d, y1]];
            sh.closed = true;
            var mk = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            mk.property("ADBE Mask Shape").setValue(sh);

            var A = 3 + Math.pow(rnd(), 2) * 35;          // max stretch factor
            var w1 = 0.4 + rnd() * 1.6, p1 = rnd() * 6.283;
            var w2 = 0.3 + rnd() * 1.2, p2 = rnd() * 6.283;
            var bw = rnd();                               // audio sensitivity of this strip

            L.property("Scale").expression = HEAD +
                'var f=' + n(fit) + ';' +
                'var amt=ctl.effect("Stretch Amount")("Slider")/100;' +
                'var spd=ctl.effect("Speed")("Slider");' +
                'var g=ctl.effect("Audio Gain")("Slider");' +
                'var e1=0.5+0.5*Math.sin(time*' + n(w1) + '*spd+' + n(p1) + ');' +
                'var e2=0.5+0.5*Math.sin(time*' + n(w2) + '*spd+' + n(p2) + ');' +
                'var m=1+amt*' + n(A) + '*e1*e2*e1+g*a*' + n(bw) + ';' +
                '[f*m,f];';
        }

        // ---------- flat colored blocks
        for (i = 0; i < CFG.colorBlocks; i++) {
            var bwid = (0.02 + rnd() * 0.12) * cw;
            var bhei = (0.03 + rnd() * 0.22) * ch;
            var col = CFG.palette[Math.floor(rnd() * CFG.palette.length)];
            var sl = comp.layers.addShape();
            sl.name = "BLOCK " + (i + 1);
            var grp = sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            var cont = grp.property("ADBE Vectors Group");
            cont.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([bwid, bhei]);
            cont.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(col);
            sl.property("Position").setValue([(0.05 + rnd() * 0.9) * cw, (0.05 + rnd() * 0.9) * ch]);

            var bwv = 0.8 + rnd() * 3, bp = rnd() * 6.283;
            var bw2 = 0.5 + rnd() * 2, bp2 = rnd() * 6.283;
            var thr = 0.2 + rnd() * 0.9;
            var mult = 0.9 + rnd() * 0.5;
            sl.property("Opacity").expression = HEAD +
                'var spd=ctl.effect("Speed")("Slider");' +
                'var e=Math.sin(time*' + n(bwv) + '*spd+' + n(bp) + ')+Math.sin(time*' + n(bw2) + '*spd+' + n(bp2) + ');' +
                '(e>' + n(thr + 0.8) + ' || a>t*' + n(mult) + ') ? 100 : 0;';
        }

        comp.time = 0;
        comp.openInViewer();
        alert("Done.\nStatus: " + audioStatus +
              "\n\nTweak on the CONTROLS layer:\n- Stretch Amount: how far streaks smear\n- Speed: how fast they move\n- Audio Gain: how hard they kick on the music\n- Threshold: when colored blocks flash on audio");
    } catch (err2) {
        alert("Script error:\n" + err2.toString() + "\nLine: " + err2.line);
    } finally {
        app.endUndoGroup();
    }
})();
