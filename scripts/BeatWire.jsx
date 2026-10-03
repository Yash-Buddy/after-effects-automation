/*
  BeatWire  -  After Effects ExtendScript (.jsx)

  Select your pen-drawn shape layers in the active comp, then run.
  Each layer's opacity is linked to the music so it blinks on the beat.

  Behaviors are mixed automatically:
    layer 1,4,7...  -> every beat
    layer 2,5,8...  -> only harder hits
    layer 3,6,9...  -> off-beat (shows when the music is quiet)
  Override by naming a layer with the word beat, hard or off
  (e.g. "window top beat", "car hard", "window left off").
  Rename your photo layer to PHOTO to get the scale pop and parenting.
*/
(function () {

    var CFG = {
        thresholdFactor: 0.55,        // beat threshold = this x loudest peak
        recolor: false,               // true = force all selected shapes to flashColor
        flashColor: [0.92, 0.17, 0.10],
        addPopOnPhoto: true,          // scale pop on a layer named PHOTO, if present
        parentToPhoto: true           // parent shapes to PHOTO so they follow its pop/shake
    };

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

    var targets = [], i;
    for (i = 0; i < comp.selectedLayers.length; i++) targets.push(comp.selectedLayers[i]);
    if (targets.length === 0) { alert("Select the shape layers you drew first."); return; }

    function setFills(group) {
        var j, p;
        for (j = 1; j <= group.numProperties; j++) {
            p = group.property(j);
            if (p.matchName === "ADBE Vector Graphic - Fill") {
                p.property("ADBE Vector Fill Color").setValue(CFG.flashColor);
            } else if (p.numProperties && p.propertyType === PropertyType.INDEXED_GROUP ||
                       p.propertyType === PropertyType.NAMED_GROUP) {
                setFills(p);
            }
        }
    }

    function addSlider(layer, name, val) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(val);
    }

    app.beginUndoGroup("BeatWire");
    try {
        // ---- Make sure audio data exists
        var amp = null;
        try { amp = comp.layer("Audio Amplitude"); } catch (e) {}

        if (!amp) {
            var audioLayer = null;
            for (i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).hasAudio && comp.layer(i).source instanceof FootageItem &&
                    !comp.layer(i).hasVideo) { audioLayer = comp.layer(i); break; }
            }
            if (!audioLayer) { alert("Add your music track to this comp first."); return; }
            comp.openInViewer();
            for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            audioLayer.selected = true;
            var cmd = app.findMenuCommandId("Convert Audio to Keyframes");
            if (!cmd) cmd = 2639;
            app.executeCommand(cmd);
            try { amp = comp.layer("Audio Amplitude"); } catch (e2) {}
            if (!amp) {
                alert("Auto 'Convert Audio to Keyframes' failed.\nSelect the music layer, run it from Animation > Keyframe Assistant, then run BeatWire again.");
                return;
            }
        }

        // ---- Auto threshold
        var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
        var peak = 0, v;
        for (i = 1; i <= both.numKeys; i++) { v = both.keyValue(i); if (v > peak) peak = v; }
        if (peak <= 0) peak = 20;

        // ---- Controls layer (create once)
        var ctl = null;
        try { ctl = comp.layer("CONTROLS"); } catch (e3) {}
        if (!ctl) {
            ctl = comp.layers.addNull(comp.duration);
            ctl.name = "CONTROLS";
            addSlider(ctl, "Threshold", peak * CFG.thresholdFactor);
            addSlider(ctl, "Pop Amount", 4);
            addSlider(ctl, "Shake", 14);
        }

        var HEAD =
            'var a=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider");' +
            'var t=thisComp.layer("CONTROLS").effect("Threshold")("Slider");';

        // ---- Wire the shapes
        for (i = 0; i < targets.length; i++) {
            var L = targets[i];
            if (L.name === "CONTROLS" || L.name === "Audio Amplitude") continue;
            if (CFG.recolor && L instanceof ShapeLayer) {
                setFills(L.property("ADBE Root Vectors Group"));
            }
            var mode = i % 3, expr;
            var nm = L.name.toLowerCase();
            if (/(^|[\s_\-])off([\s_\-]|$)/.test(nm)) mode = 2;
            else if (/(^|[\s_\-])hard([\s_\-]|$)/.test(nm)) mode = 1;
            else if (/(^|[\s_\-])beat([\s_\-]|$)/.test(nm)) mode = 0;
            if (mode === 0)      expr = HEAD + 'a>t ? 100 : 0;';
            else if (mode === 1) expr = HEAD + 'a>t*1.25 ? 100 : 0;';
            else                 expr = HEAD + 'a<t*0.6 ? 100 : 0;';
            L.property("Opacity").expression = expr;
        }

        // ---- Parent shapes to the photo so pop/shake keeps them aligned
        if (CFG.parentToPhoto) {
            var ph0 = null;
            try { ph0 = comp.layer("PHOTO"); } catch (e5) {}
            if (ph0) {
                for (i = 0; i < targets.length; i++) {
                    if (targets[i] !== ph0 && targets[i] instanceof ShapeLayer) targets[i].parent = ph0;
                }
            }
        }

        // ---- Optional pop on the photo
        if (CFG.addPopOnPhoto) {
            var ph = null;
            try { ph = comp.layer("PHOTO"); } catch (e4) {}
            if (ph) {
                var sc = ph.property("Scale");
                if (!sc.expressionEnabled && sc.expression === "") {
                    sc.expression = HEAD +
                        'var p=thisComp.layer("CONTROLS").effect("Pop Amount")("Slider");' +
                        'a>t ? value+[p,p] : value;';
                }
            }
        }

        alert("Wired " + targets.length + " layer(s).\nAdjust 'Threshold' on CONTROLS for more or fewer blinks.");
    } catch (err) {
        alert("Script error:\n" + err.toString() + "\nLine: " + err.line);
    } finally {
        app.endUndoGroup();
    }
})();
