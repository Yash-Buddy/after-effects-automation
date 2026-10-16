// ------------------------------------------------------------
// Photo Orbit for After Effects  (v2)
// Run: File > Scripts > Run Script File...
//
// You pick 12-14 JPG / PNG images and it builds a seamless looping comp:
//   - Arc wheel (2D) : cards ride a big curved ring, tilted along the curve
//   - Orbit ring (3D): cards circle in real depth with a camera
// Optional: add a music track + BPM and the cards pulse gently on the beat.
//
// Everything is expression-driven from a "CONTROLS" null, so you can
// tweak Radius / Turns / Jitter / BPM / Pulse afterwards without rerunning.
// (Turns: keep it a whole number for a seamless loop. Negative = reverse.)
// ------------------------------------------------------------

(function () {

    // ---------- settings you can edit ----------
    var MIN_CARDS = 12;       // ring always has at least this many cards (images repeat if you pick fewer)
    var MAX_CARDS = 14;       // ...and at most this many (extra images are ignored)
    var FPS = 30;
    var CARD_ASPECT = 1.25;   // card height / width. 1.25 = 4:5 portrait (good for fashion)
    var CORNER = 0.06;        // corner rounding as a fraction of card width (0.02 = almost square)
    var HEADLINE_FONT = "HelveticaNeue-Light";   // try "Didot" (Mac) or "BodoniMT" (Windows) for a fashion look

    var isWin = ($.os.indexOf("Windows") !== -1);
    var imgFilter = isWin
        ? "JPG and PNG:*.jpg;*.jpeg;*.png"
        : function (f) { return (f instanceof Folder) || (/\.(jpe?g|png)$/i).test(f.name); };
    var audFilter = isWin
        ? "Audio:*.mp3;*.wav;*.aif;*.aiff;*.m4a"
        : function (f) { return (f instanceof Folder) || (/\.(mp3|wav|aif|aiff|m4a)$/i).test(f.name); };

    // ---------- dialog ----------
    var win = new Window("dialog", "Photo Orbit");
    win.orientation = "column";
    win.alignChildren = "fill";

    var g1 = win.add("group");
    g1.add("statictext", undefined, "Headline:");
    var headline = g1.add("edittext", undefined, "Present.\rWithout panic.", { multiline: true });
    headline.preferredSize = [260, 56];

    var g2 = win.add("group");
    g2.add("statictext", undefined, "Motion:");
    var modeDD = g2.add("dropdownlist", undefined, ["Arc wheel (2D)", "Orbit ring (3D)"]);
    modeDD.selection = 0;

    var g3 = win.add("group");
    g3.add("statictext", undefined, "Frame:");
    var frames = [["9:16 Reel 1080x1920", 1080, 1920], ["4:5 Post 1080x1350", 1080, 1350], ["1:1 1080x1080", 1080, 1080], ["16:9 1920x1080", 1920, 1080]];
    var names = [];
    for (var f = 0; f < frames.length; f++) names.push(frames[f][0]);
    var frameDD = g3.add("dropdownlist", undefined, names);
    frameDD.selection = 0;

    var g4 = win.add("group");
    g4.add("statictext", undefined, "Loop length (sec):");
    var secDD = g4.add("dropdownlist", undefined, ["6", "10", "15", "20"]);
    secDD.selection = 1;

    var g5 = win.add("group");
    g5.add("statictext", undefined, "Card size (% of width):");
    var sizeEt = g5.add("edittext", undefined, "22");
    sizeEt.characters = 4;

    var g6 = win.add("group");
    g6.add("statictext", undefined, "Background:");
    var bgDD = g6.add("dropdownlist", undefined, ["Dark", "Cream (editorial)"]);
    bgDD.selection = 0;

    var g7 = win.add("group");
    g7.add("statictext", undefined, "Music (optional):");
    var musicBtn = g7.add("button", undefined, "Browse...");
    var musicTxt = g7.add("statictext", undefined, "none");
    musicTxt.preferredSize = [170, 20];
    var musicFile = null;
    musicBtn.onClick = function () {
        var mf = File.openDialog("Choose a music track (mp3 / wav)", audFilter, false);
        if (mf) { musicFile = mf; musicTxt.text = mf.name; }
    };

    var g8 = win.add("group");
    g8.add("statictext", undefined, "Beat pulse BPM (0 = off):");
    var bpmEt = g8.add("edittext", undefined, "0");
    bpmEt.characters = 4;

    var bg = win.add("group");
    bg.alignment = "right";
    bg.add("button", undefined, "Choose images and build", { name: "ok" });
    bg.add("button", undefined, "Cancel", { name: "cancel" });

    if (win.show() !== 1) return;

    var mode3D = (modeDD.selection.index === 1);
    var W = frames[frameDD.selection.index][1];
    var H = frames[frameDD.selection.index][2];
    var DUR = parseFloat(secDD.selection.text);
    var CARDPCT = Math.max(10, Math.min(45, parseFloat(sizeEt.text) || 22));
    var cream = (bgDD.selection.index === 1);
    var BPM = parseFloat(bpmEt.text) || 0;
    if (BPM > 0) {
        BPM = Math.max(60, Math.min(200, BPM));
        // snap the loop to a whole number of beats so the pulse also loops cleanly
        DUR = Math.max(1, Math.round(DUR * BPM / 60)) * 60 / BPM;
    }
    DUR = Math.round(DUR * FPS) / FPS;

    var bgCol = cream ? [0.94, 0.91, 0.87] : [0.06, 0.06, 0.08];
    var txtCol = cream ? [0.08, 0.08, 0.09] : [1, 1, 1];

    // ---------- rounded-rect mask ----------
    function roundedRect(x0, y0, x1, y1, r) {
        var k = 0.5523 * r, s = new Shape();
        s.vertices = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
        s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
        s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
        s.closed = true;
        return s;
    }

    // ---------- main build ----------
    function build() {

        // ---- pick images (JPG / PNG only) ----
        var sel = File.openDialog(
            "Select " + MIN_CARDS + " to " + MAX_CARDS + " JPG / PNG images (Shift- or Ctrl/Cmd-click to select many)",
            imgFilter, true);
        if (!sel) return;

        var picked = (sel instanceof File) ? [sel] : sel;
        var files = [];
        for (var i = 0; i < picked.length; i++) {
            if ((/\.(jpe?g|png)$/i).test(picked[i].name)) files.push(picked[i]);
        }
        if (!files.length) { alert("No JPG or PNG images were selected."); return; }

        // order = file name (name them 01_, 02_ ... to control the order)
        files.sort(function (a, b) {
            var x = a.name.toLowerCase(), y = b.name.toLowerCase();
            return x < y ? -1 : (x > y ? 1 : 0);
        });

        var ignored = 0;
        if (files.length > MAX_CARDS) {
            ignored = files.length - MAX_CARDS;
            files = files.slice(0, MAX_CARDS);
        }
        if (files.length < MIN_CARDS) {
            if (!confirm("You picked " + files.length + " image(s). The ring uses " + MIN_CARDS + " to " + MAX_CARDS +
                " cards, so some images will repeat.\n\nContinue?")) return;
        }

        // ---- import ----
        var imgFolder = app.project.items.addFolder("Orbit images");
        var footage = [];
        for (var j = 0; j < files.length; j++) {
            try {
                var item = app.project.importFile(new ImportOptions(files[j]));
                item.parentFolder = imgFolder;
                footage.push(item);
            } catch (err) {}
        }
        if (!footage.length) { alert("Could not import any images."); return; }

        // 12 to 14 cards; images cycle if fewer than 12 were imported
        var N = Math.max(footage.length, MIN_CARDS);

        // ---- comp ----
        var comp = app.project.items.addComp("Photo Orbit", W, H, 1, DUR, FPS);
        comp.bgColor = bgCol;
        comp.layers.addSolid(bgCol, "BG", W, H, 1);

        var cw = W * CARDPCT / 100, ch = cw * CARD_ASPECT;
        var radius = mode3D
            ? Math.min(W * 0.5, Math.max(W * 0.34, cw * N * 0.85 / (2 * Math.PI)))
            : Math.max(W * 0.5, cw * N * 1.12 / (2 * Math.PI));

        // ---- controls null ----
        var ctl = comp.layers.addNull();
        ctl.name = "CONTROLS";
        function slider(name, val) {
            var e = ctl.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
            e.name = name;
            e.property(1).setValue(val);
        }
        slider("Radius", radius);
        slider("Turns", 1);       // full turns per loop (whole number = seamless)
        slider("Jitter", 8);      // degrees of messy tilt
        slider("BPM", BPM);       // 0 = no pulse
        slider("Pulse", 4);       // % scale bump on each beat

        // ---- expressions ----
        var common =
            'var c=thisComp.layer("CONTROLS");' +
            'var R=c.effect("Radius")(1);var T=c.effect("Turns")(1);var J=c.effect("Jitter")(1);' +
            'var N=' + N + ';' +
            'var a=degreesToRadians(-90+IDX*360/N+360*T*time/thisComp.duration);';

        function posExpr(idx) {
            var e = common.replace(/IDX/g, idx);
            if (mode3D) {
                // ring in a horizontal plane seen slightly from above; front cards lower and closer
                return e + '[thisComp.width/2+R*Math.cos(a), thisComp.height*0.62+thisComp.height*0.11*Math.sin(a), -R*0.9*Math.sin(a)];';
            }
            return e + '[thisComp.width/2+R*Math.cos(a), thisComp.height*0.56+R+R*Math.sin(a)];';
        }
        function rotExpr(idx) {
            var e = common.replace(/IDX/g, idx);
            var jit = 'J*Math.sin(' + idx + '*12.9898)';
            if (mode3D) return e + 'Math.cos(a)*8+' + jit + ';';
            return e + 'radiansToDegrees(a)+90+' + jit + ';';
        }
        // beat pulse: a short bump at the start of every beat (does nothing when BPM = 0)
        var pulseExpr =
            'var c=thisComp.layer("CONTROLS");var B=c.effect("BPM")(1);var P=c.effect("Pulse")(1)/100;' +
            'var p=0;if(B>0){var ph=(time*B/60)%1;p=P*Math.pow(Math.max(0,1-ph*2.5),2);}' +
            'mul(value,1+p);';
        // keeps the shadow pointing straight down even while the card rotates
        var shadowDirExpr = '180-' + (mode3D ? 'transform.zRotation' : 'transform.rotation') + ';';

        // ---- camera (3D mode) ----
        if (mode3D) {
            comp.layers.addCamera("Camera", [W / 2, H / 2]);
        }

        // ---- cards ----
        for (var n = 0; n < N; n++) {
            var src = footage[n % footage.length];
            var L = comp.layers.add(src);
            L.name = "Card " + (n + 1);
            if (mode3D) L.threeDLayer = true;

            var fw = L.width, fh = L.height;
            var s = Math.max(cw / fw, ch / fh);
            var sv = mode3D ? [s * 100, s * 100, s * 100] : [s * 100, s * 100];
            L.property("ADBE Transform Group").property("ADBE Scale").setValue(sv);

            // rounded crop in source pixels
            var cwSrc = cw / s, chSrc = ch / s;
            var x0 = (fw - cwSrc) / 2, y0 = (fh - chSrc) / 2;
            var m = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            m.property("ADBE Mask Shape").setValue(roundedRect(x0, y0, x0 + cwSrc, y0 + chSrc, cwSrc * Math.max(0.02, CORNER)));

            // soft shadow
            try {
                var sh = L.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
                sh.property("ADBE Drop Shadow-0002").setValue(cream ? 80 : 115);   // opacity
                sh.property("ADBE Drop Shadow-0005").setValue(40);                  // softness
                sh.property("ADBE Drop Shadow-0004").setValue(18);                  // distance
                sh.property("ADBE Drop Shadow-0003").expression = shadowDirExpr;   // direction
            } catch (err2) {}

            var tg = L.property("ADBE Transform Group");
            tg.property("ADBE Position").expression = posExpr(n);
            tg.property("ADBE Rotate Z").expression = rotExpr(n);
            tg.property("ADBE Scale").expression = pulseExpr;
        }

        // ---- headline ----
        var t = comp.layers.addText(headline.text);
        t.name = "Headline";
        var tp = t.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        td.fontSize = Math.round(W * 0.078);
        td.fillColor = txtCol;
        td.applyFill = true;
        td.applyStroke = false;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        try { td.font = HEADLINE_FONT; } catch (err3) {}
        tp.setValue(td);
        t.property("ADBE Transform Group").property("ADBE Position").setValue([W / 2, H * 0.1 + W * 0.078]);

        // ---- music (optional) ----
        var musicNote = "";
        if (musicFile) {
            try {
                var aItem = app.project.importFile(new ImportOptions(musicFile));
                var aL = comp.layers.add(aItem);
                aL.moveToEnd();
                var lv = aL.property("ADBE Audio Group").property("ADBE Audio Levels");
                lv.setValueAtTime(0, [-60, -60]);
                lv.setValueAtTime(Math.min(0.6, DUR / 4), [0, 0]);
                lv.setValueAtTime(Math.max(DUR - 1, DUR * 0.75), [0, 0]);
                lv.setValueAtTime(DUR, [-60, -60]);
                musicNote = "\nMusic added with a short fade in/out. Trim or slip it so a downbeat lands on frame 0.";
            } catch (err4) {
                musicNote = "\nCould not import the music file.";
            }
        }

        // ---- render queue ----
        var rq;
        var note = "Add it to Adobe Media Encoder (Composition > Add to Adobe Media Encoder Queue) and pick H.264.";
        try {
            rq = app.project.renderQueue.items.add(comp);
            rq.outputModule(1).applyTemplate("H.264 - Match Render Settings - 15 Mbps");
            rq.outputModule(1).file = new File(files[0].parent.fsName + "/photo_orbit.mp4");
            note = "Output set to photo_orbit.mp4 in your image folder.";
        } catch (err5) {
            // newer After Effects versions have no H.264 in the render queue
            try { if (rq) rq.remove(); } catch (err6) {}
        }

        comp.openInViewer();

        var extra = "";
        if (ignored > 0) extra = "\n" + ignored + " extra image(s) were ignored (max " + MAX_CARDS + ", sorted by file name).";
        if (BPM > 0) extra += "\nLoop length snapped to " + DUR.toFixed(2) + "s (whole beats at " + BPM + " BPM).";

        alert("Done: " + N + " cards, " + DUR + "s seamless loop." + extra + musicNote + "\n\n" +
              "Tweak Radius, Turns, Jitter, BPM and Pulse on the CONTROLS layer (Effect Controls).\n\n" +
              note);
    }

    app.beginUndoGroup("Photo Orbit");
    try {
        build();
    } catch (err) {
        alert("Photo Orbit stopped: " + err.toString() + (err.line ? "\nLine: " + err.line : ""));
    }
    app.endUndoGroup();
})();
