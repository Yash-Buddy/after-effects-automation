// ============================================================
// Iso Focus for After Effects  (ExtendScript / ES3)
// Run: File > Scripts > Run Script File...
//
// 3-6 JPG/PNG images are repeated into a staircase of >= 9 cards.
// The focus card sits at the exact center. Every card is sheared
// (top/bottom edges slope down to the right, vertical edges stay
// vertical). The whole stack glides one slot per step toward the
// top-right, the next card arrives from the bottom-left.
// All motion is expression-driven from the CONTROLS null.
// ============================================================

// ---------- constants (edit here) ----------
var MIN_IMAGES       = 3;
var MAX_IMAGES       = 6;
var MIN_CARDS        = 12;
var CARD_ASPECT      = 1.1;     // card height / card width. 1.25 keeps more of a portrait photo
var CORNER           = 0.07;    // corner radius as a fraction of card width
var HEADLINE_FONT    = "HelveticaNeue-Light";
var DEFAULT_CARD_PCT = 44;      // card width as % of the SHORTER side of the frame
var BG_DARK          = [15 / 255, 15 / 255, 20 / 255];
var BG_CREAM         = [242 / 255, 235 / 255, 221 / 255];

// default look numbers (also written to the CONTROLS sliders, and used for the build-time wrap check)
var LOOK = { firstX: 0.80, pileX: 0.17, firstY: 0.50, pileY: 0.11, spread: 0.7, sf: 15, df: 35, skew: 11 };

// ---------- helpers ----------
// card centre / half-extents at slot distance dv (same math as the expressions)
function cardBox(dv, W, H, cw, ch, sy) {
    var e2 = Math.exp(2 * dv / LOOK.spread), th = (e2 - 1) / (e2 + 1);
    var x = W / 2 + cw * (LOOK.pileX * dv + LOOK.firstX * th);
    var y = H * sy - cw * (LOOK.pileY * dv + LOOK.firstY * th);
    var rel = ((100 - LOOK.sf) + LOOK.sf * Math.exp(-dv * dv / 18)) / 100;
    var shear = cw / 2 * rel * Math.tan(LOOK.skew * Math.PI / 180);
    return { x: x, y: y, hw: cw / 2 * rel + cw * 0.12 * rel, hh: ch / 2 * rel + shear + cw * 0.16 * rel, top: y - ch / 2 * rel - shear };
}
// fully outside the frame (incl. sheared corners + shadow) with a 5% margin
function outsideAt(dv, W, H, cw, ch, sy) {
    var b = cardBox(dv, W, H, cw, ch, sy), mx = 0.05 * W, my = 0.05 * H;
    return (b.x - b.hw > W + mx) || (b.x + b.hw < -mx) || (b.y + b.hh < -my) || (b.y - b.hh > H + my);
}
function isWindows() { return ($.os.indexOf("Windows") !== -1); }

function imageFilter() {
    if (isWindows()) return "Images (JPG/PNG):*.jpg;*.jpeg;*.png";
    return function (f) { return (f instanceof Folder) || /\.(jpg|jpeg|png)$/i.test(f.name); };
}
function audioFilter() {
    if (isWindows()) return "Audio:*.mp3;*.wav;*.aac;*.m4a;*.aif;*.aiff";
    return function (f) { return (f instanceof Folder) || /\.(mp3|wav|aac|m4a|aif|aiff)$/i.test(f.name); };
}
function isArray(o) { return Object.prototype.toString.call(o) === "[object Array]"; }

function roundedRect(x0, y0, x1, y1, r) {
    var k = 0.5523 * r, s = new Shape();
    s.vertices = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
    s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
    s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
    s.closed = true;
    return s;
}

// add an effect trying several names (match name or display name)
function addFx(parent, names) {
    for (var i = 0; i < names.length; i++) {
        try { var e = parent.addProperty(names[i]); if (e) return e; } catch (err) {}
    }
    return null;
}
// find an effect property by display name, fall back to index
function fxProp(fx, name, idx) {
    var p = null;
    try { p = fx.property(name); } catch (e) {}
    if (!p && idx) { try { p = fx.property(idx); } catch (e2) {} }
    return p;
}
function fill(str, map) {
    for (var key in map) { str = str.split("@" + key + "@").join(String(map[key])); }
    return str;
}

// ---------- expressions ----------
// One master progress p shared by all cards: hold, smootherstep glide, hold. Only ever increases.
var EXPR_HEAD =
    'var c=thisComp.layer("CONTROLS");' +
    'var N=c.effect("Count")(1),st=c.effect("Seconds Per Card")(1),h=c.effect("Hold %")(1)/100;' +
    'var uu=time/st,kf=Math.floor(uu),fr=uu-kf;' +
    'var xx=clamp((fr-h/2)/(1-h),0,1);var p=kf+xx*xx*xx*(xx*(xx*6-15)+10);' +
    'var d=c.effect("Direction")(1)*(p-@IDX@);d=d-N*Math.floor((d+N/2)/N);' +
    'var e2=Math.exp(2*d/c.effect("Spread")(1));var th=(e2-1)/(e2+1);';

// smooth functions of d only (no branches on |d|)
var EXPR_POS =
    'var cw=@CW@;' +
    'var ox=cw*(c.effect("Pile Gap")(1)*d+c.effect("First Gap")(1)*th);' +
    'var oy=-cw*(c.effect("Pile Gap Y")(1)*d+c.effect("First Gap Y")(1)*th);' +
    'var zs=(c.effect("Overlap Mode")(1)>0.5)?10*d-100*Math.max(0,1-Math.abs(d)):10*Math.abs(d)+0.01*d;' +
    '[thisComp.width/2+ox,thisComp.height*c.effect("Stack Y")(1)+oy,zs];';

var EXPR_SCALE =
    'var sf=c.effect("Scale Falloff")(1);var sc=(100-sf)+sf*Math.exp(-d*d/18);' +
    'var T0=Math.min(0.1,st/8);var tau=((fr>=1-h/2)?fr-(1-h/2):fr+h/2)*st;' +
    'var pu=(c.effect("BPM")(1)>0)?c.effect("Pulse")(1)/100*(tau/T0)*Math.exp(1-tau/T0)*Math.exp(-d*d*4):0;' +
    'var v=@BASE@*sc/100*(1+pu);[v,v,v];';

var EXPR_EXPOSURE =
    'var df=c.effect("Dim Falloff")(1);var bb=((100-df)+df*Math.exp(-d*d/5))/100;Math.log(bb)/Math.LN2;';

var SKEW_HEAD = 'var h=@FW@/2*Math.tan(degreesToRadians(thisComp.layer("CONTROLS").effect("Skew")(1)));';
var EXPR_UL = SKEW_HEAD + '[0,-h];';
var EXPR_UR = SKEW_HEAD + '[@FW@,h];';
var EXPR_LL = SKEW_HEAD + '[0,@FH@-h];';
var EXPR_LR = SKEW_HEAD + '[@FW@,@FH@+h];';

// ---------- main ----------
function build() {
    // ----- dialog -----
    var win = new Window("dialog", "Iso Focus");
    win.orientation = "column";
    win.alignChildren = "fill";

    var g1 = win.add("group");
    g1.add("statictext", undefined, "Headline:");
    var headline = g1.add("edittext", undefined, "Motion posters\rPresent. Without panic.", { multiline: true });
    headline.preferredSize = [260, 56];

    var g2 = win.add("group");
    g2.add("statictext", undefined, "Frame:");
    var frames = [["4:5  1080x1350", 1080, 1350], ["9:16  1080x1920", 1080, 1920], ["1:1  1080x1080", 1080, 1080], ["16:9  1920x1080", 1920, 1080]];
    var fnames = []; for (var f = 0; f < frames.length; f++) fnames.push(frames[f][0]);
    var frameDD = g2.add("dropdownlist", undefined, fnames);
    frameDD.selection = 0;

    var g3 = win.add("group");
    g3.add("statictext", undefined, "Seconds per card:");
    var spcEt = g3.add("edittext", undefined, "1.0"); spcEt.characters = 5;
    g3.add("statictext", undefined, "Card size %:");
    var sizeEt = g3.add("edittext", undefined, String(DEFAULT_CARD_PCT)); sizeEt.characters = 4;

    var g4 = win.add("group");
    g4.add("statictext", undefined, "Background:");
    var bgDD = g4.add("dropdownlist", undefined, ["Dark", "Cream"]);
    bgDD.selection = 0;
    g4.add("statictext", undefined, "Frame rate:");
    var fpsDD = g4.add("dropdownlist", undefined, ["30", "60"]);
    fpsDD.selection = 0;

    var g5 = win.add("group");
    g5.add("statictext", undefined, "BPM (0 = off):");
    var bpmEt = g5.add("edittext", undefined, "0"); bpmEt.characters = 4;

    var musicFile = null;
    var g6 = win.add("group");
    var mBtn = g6.add("button", undefined, "Choose music (optional)...");
    var mLbl = g6.add("statictext", undefined, "none");
    mLbl.characters = 22;
    mBtn.onClick = function () {
        var mf = File.openDialog("Choose a music file", audioFilter());
        if (mf) { musicFile = mf; mLbl.text = mf.name; }
    };

    var gb = win.add("group");
    gb.alignment = "right";
    gb.add("button", undefined, "Choose images and build", { name: "ok" });
    gb.add("button", undefined, "Cancel", { name: "cancel" });

    if (win.show() !== 1) return;

    var W = frames[frameDD.selection.index][1];
    var H = frames[frameDD.selection.index][2];
    var cream = (bgDD.selection.index === 1);
    var FPSV = (fpsDD.selection.index === 1) ? 60 : 30;
    var BPM = parseFloat(bpmEt.text) || 0;
    var SPC = parseFloat(spcEt.text) || 1.0;
    if (BPM > 0) SPC = 120 / BPM;                     // each step = 2 beats
    if (SPC < 0.2) SPC = 0.2;
    var CARDPCT = parseFloat(sizeEt.text) || DEFAULT_CARD_PCT;
    if (CARDPCT < 15) CARDPCT = 15;
    if (CARDPCT > 80) CARDPCT = 80;

    // ----- pick images -----
    var picked = File.openDialog("Choose " + MIN_IMAGES + " to " + MAX_IMAGES + " images (JPG or PNG)", imageFilter(), true);
    if (!picked) return;
    var raw = isArray(picked) ? picked : [picked];
    var files = [];
    for (var i = 0; i < raw.length; i++) {
        if (/\.(jpg|jpeg|png)$/i.test(raw[i].name)) files.push(raw[i]);
    }
    files.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0); });
    if (files.length < MIN_IMAGES) {
        alert("Please pick at least " + MIN_IMAGES + " JPG or PNG images (you picked " + files.length + ").");
        return;
    }
    var trimmedNote = "";
    if (files.length > MAX_IMAGES) {
        trimmedNote = "\nYou picked " + files.length + " images; only the first " + MAX_IMAGES + " (by file name) were used.";
        files = files.slice(0, MAX_IMAGES);
    }

    app.beginUndoGroup("Iso Focus");
    undoOpen = true;
    if (!app.project) app.newProject();

    var imgFolder = app.project.items.addFolder("Iso Focus images");
    var footage = [];
    for (var m = 0; m < files.length; m++) {
        try {
            var it = app.project.importFile(new ImportOptions(files[m]));
            it.parentFolder = imgFolder;
            footage.push(it);
        } catch (e1) {}
    }
    if (footage.length < MIN_IMAGES) { alert("Could not import enough images."); return; }

    var M = footage.length;
    var landscape = (W > H);
    var CW = Math.min(W, H) * CARDPCT / 100, CH = CW * CARD_ASPECT;
    var SY = landscape ? 0.55 : 0.60;                  // focus card centre as a fraction of frame height
    var cardNote = "";
    if (!landscape) {                                  // keep the up-right neighbour below the headline zone (top 26%)
        var cp0 = CARDPCT;
        while (true) {
            var syMax = 1 - (CH / 2 + CW * 0.16) / H;
            SY = 0.60;
            while (cardBox(1, W, H, CW, CH, SY).top < 0.26 * H && SY < syMax) SY += 0.005;
            if (cardBox(1, W, H, CW, CH, SY).top >= 0.26 * H || CARDPCT <= 30) break;
            CARDPCT -= 0.5; CW = Math.min(W, H) * CARDPCT / 100; CH = CW * CARD_ASPECT;
        }
        if (CARDPCT !== cp0) cardNote = "\nCard size reduced from " + cp0 + "% to " + CARDPCT + "% so the headline stays clear of the cards in this frame.";
    }
    var N = M * Math.ceil(MIN_CARDS / M);              // 3 images -> 12 cards
    // the wrap (d jumps +N/2 -> -N/2) must happen fully outside the frame: add cards until it does
    while (N < 90 && !(outsideAt(N / 2, W, H, CW, CH, SY) && outsideAt(-N / 2, W, H, CW, CH, SY))) N += M;
    var DUR = N * SPC;
    var warnings = [];

    // ----- comp -----
    var comp = app.project.items.addComp("Iso Focus", W, H, 1, DUR, FPSV);
    var bgCol = cream ? BG_CREAM : BG_DARK;
    comp.bgColor = bgCol;
    try { comp.motionBlur = true; comp.shutterAngle = 180; comp.shutterPhase = -90; } catch (eMB) {}
    comp.layers.addSolid(bgCol, "BG", W, H, 1);


    // ----- controls -----
    var ctl = comp.layers.addNull();
    ctl.name = "CONTROLS";
    function slider(name, val) {
        var e = ctl.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        e.name = name;
        e.property(1).setValue(val);
    }
    slider("Count", N);
    slider("Seconds Per Card", SPC);   // if you change this, set the comp duration to Count x this
    slider("Hold %", 15);              // share of each step spent holding (half before, half after the glide)
    slider("Direction", 1);            // 1: card that just left goes up-right, next arrives from lower-left; -1 flips it
    slider("Overlap Mode", 0);         // 0 = nearest card in front (z = 10|d| + 0.01d); 1 = far bottom-left cards in front
    slider("Stack Y", SY);             // focus card centre, fraction of frame height
    slider("Skew", LOOK.skew);         // degrees; negative flips the slant
    slider("First Gap", LOOK.firstX);  // x distance of first neighbour, x card width
    slider("First Gap Y", LOOK.firstY);
    slider("Pile Gap", LOOK.pileX);    // extra x per further card (smaller = tighter pile)
    slider("Pile Gap Y", LOOK.pileY);
    slider("Spread", LOOK.spread);     // how quickly the first neighbour's gap is reached (in slots)
    slider("Scale Falloff", LOOK.sf);  // % scale lost far from focus (15 -> 85%)
    slider("Dim Falloff", LOOK.df);    // % darker far from focus (35 -> 65%)
    slider("BPM", BPM);                // > 0 enables the landing pulse
    slider("Pulse", 4);                // % scale pulse on landing

    // ----- cards -----
    for (var n = 0; n < N; n++) {
        var L = comp.layers.add(footage[n % M]);
        L.name = "Card " + (n + 1);
        L.motionBlur = true;
        L.threeDLayer = true;                          // no camera: used only for depth sorting

        var fw = L.width, fh = L.height;
        var s = Math.max(CW / fw, CH / fh);
        var cwS = CW / s, chS = CH / s;
        var x0 = (fw - cwS) / 2, y0 = (fh - chS) / 2;

        var map = { IDX: n, CW: CW, CH: CH, FW: fw, FH: fh, BASE: (s * 100).toFixed(4) };

        // rounded crop
        var mk = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.property("ADBE Mask Shape").setValue(roundedRect(x0, y0, x0 + cwS, y0 + chS, cwS * CORNER));

        var fxp = L.property("ADBE Effect Parade");

        // 1) brightness falloff
        var ex = addFx(fxp, ["ADBE Exposure2", "Exposure"]);
        var exP = ex ? fxProp(ex, "Exposure", 0) : null;
        if (exP) { exP.expression = fill(EXPR_HEAD + EXPR_EXPOSURE, map); }
        else if (n === 0) { warnings.push("Exposure effect not found: no brightness falloff"); }

        // 2) shear with Corner Pin (does not clip to layer bounds)
        var cp = addFx(fxp, ["ADBE Corner Pin", "Corner Pin"]);
        if (cp) {
            var ul = fxProp(cp, "Upper Left", 1), ur = fxProp(cp, "Upper Right", 2);
            var ll = fxProp(cp, "Lower Left", 3), lr = fxProp(cp, "Lower Right", 4);
            if (ul && ur && ll && lr) {
                ul.expression = fill(EXPR_UL, map); ur.expression = fill(EXPR_UR, map);
                ll.expression = fill(EXPR_LL, map); lr.expression = fill(EXPR_LR, map);
            } else if (n === 0) { warnings.push("Corner Pin points not found: cards are not sheared"); }
        } else if (n === 0) { warnings.push("Corner Pin effect not found: cards are not sheared"); }

        // 3) soft shadow, always straight down (layers are never rotated)
        var sh = addFx(fxp, ["ADBE Drop Shadow", "Drop Shadow"]);
        if (sh) {
            try {
                var pOp = fxProp(sh, "Opacity", 2), pDir = fxProp(sh, "Direction", 3);
                var pDist = fxProp(sh, "Distance", 4), pSoft = fxProp(sh, "Softness", 5);
                if (pOp) pOp.setValue(55);
                if (pDir) pDir.setValue(180);
                if (pDist) pDist.setValue(CW * 0.04 / s);
                if (pSoft) pSoft.setValue(CW * 0.12 / s);
            } catch (e2) {}
        }

        var tg = L.property("ADBE Transform Group");
        tg.property("ADBE Position").expression = fill(EXPR_HEAD + EXPR_POS, map);
        tg.property("ADBE Scale").expression = fill(EXPR_HEAD + EXPR_SCALE, map);
    }

    // ----- headline scrim: cards fade into the background behind the text -----
    var scrim = comp.layers.addSolid(bgCol, "Headline Scrim", W, H, 1);
    var sm = scrim.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var ss = new Shape();
    ss.vertices = [[-0.3 * W, -0.3 * H], [1.3 * W, -0.3 * H], [1.3 * W, 0.15 * H], [-0.3 * W, 0.15 * H]];
    ss.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]]; ss.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]]; ss.closed = true;
    sm.property("ADBE Mask Shape").setValue(ss);
    try { sm.property("ADBE Mask Feather").setValue([0.3 * H, 0.3 * H]); } catch (eF) { warnings.push("Scrim feather not set"); }

    // ----- headline (top layer) -----
    var fsz = Math.round(W * (landscape ? 0.055 : 0.075));
    var t = comp.layers.addText(headline.text);
    t.name = "Headline";
    var tp = t.property("ADBE Text Properties").property("ADBE Text Document");
    var td = tp.value;
    td.fontSize = fsz;
    td.fillColor = cream ? [0.08, 0.08, 0.1] : [1, 1, 1];
    td.applyFill = true;
    td.applyStroke = false;
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    try { td.font = HEADLINE_FONT; } catch (e3) {}
    tp.setValue(td);
    var hx = landscape ? W * 0.36 : W / 2;
    var hy = landscape ? H * 0.17 : H * 0.07 + fsz;
    t.property("ADBE Transform Group").property("ADBE Position").setValue([hx, hy]);

    // ----- music -----
    if (musicFile) {
        try {
            var mi = app.project.importFile(new ImportOptions(musicFile));
            var ml = comp.layers.add(mi);
            ml.moveToEnd();
            try { if (ml.outPoint > DUR) ml.outPoint = DUR; } catch (e4) {}
            var lev = ml.property("ADBE Audio Group").property("ADBE Audio Levels");
            var fin = Math.min(0.6, DUR / 4), fout = Math.min(0.9, DUR / 4);
            lev.setValueAtTime(0, [-48, -48]);
            lev.setValueAtTime(fin, [0, 0]);
            lev.setValueAtTime(Math.max(fin + 0.1, DUR - fout), [0, 0]);
            lev.setValueAtTime(DUR, [-48, -48]);
        } catch (e5) { warnings.push("Music could not be added: " + e5.toString()); }
    }

    // ----- render queue -----
    var note = "";
    var rq = null;
    try {
        rq = app.project.renderQueue.items.add(comp);
        rq.outputModule(1).applyTemplate("H.264 - Match Render Settings - 15 Mbps");
        rq.outputModule(1).file = new File(files[0].parent.fsName + "/iso_focus.mp4");
        note = "Render queue: output set to iso_focus.mp4 next to your images.";
    } catch (e6) {
        try { if (rq) rq.remove(); } catch (e7) {}
        note = "The H.264 template is not available in this After Effects version. Use Composition > Add to Adobe Media Encoder Queue and choose H.264.";
    }

    comp.openInViewer();

    var msg = "Built " + N + " cards from " + M + " images. Loop length " + DUR.toFixed(1) + "s (" + SPC.toFixed(2) + "s per card, seamless)." + trimmedNote + cardNote;
    msg += "\n\n" + note;
    msg += "\n\nTune on the CONTROLS layer: Skew (sign flips slant), Direction (1 / -1), Overlap Mode (0 / 1), First Gap / Pile Gap / Spread (spacing), Stack Y, Hold %, Dim Falloff, Scale Falloff.";
    if (warnings.length) msg += "\n\nWarnings:\n- " + warnings.join("\n- ");
    alert(msg);
}

var undoOpen = false;
try {
    build();
} catch (err) {
    alert("Iso Focus stopped: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""));
}
if (undoOpen) { try { app.endUndoGroup(); } catch (e8) {} }
