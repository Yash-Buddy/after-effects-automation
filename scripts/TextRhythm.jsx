/*
  TextRhythm  -  After Effects ExtendScript (.jsx)

  Makes individual LETTERS on your text layers change color in a stepped
  rhythm, like the poster reference (yellow letters flipping to black).

  Works on ANY number of text layers:
    - select the text layers you want, or select nothing to use every text layer
    - add / duplicate / edit lines whenever you like, then run it again
      (it replaces its own previous animators, so it is safe to re-run)

  Each flip color is a text animator with an Expression Selector, so you can
  still edit the text freely. Everything is controlled from a CONTROLS layer.
  Music is optional: loud hits make many more letters flip at once.
*/
(function () {

    var CFG = {
        flipColors: [
            [0.04, 0.04, 0.04],   // black
            [0.90, 0.10, 0.07]    // red
        ],
        shareOfSecond: 0.5,       // second color flips this fraction as often as the first
        useAudio: true
    };

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

    // ---- which text layers
    var targets = [], i, L;
    for (i = 0; i < comp.selectedLayers.length; i++) {
        if (comp.selectedLayers[i] instanceof TextLayer) targets.push(comp.selectedLayers[i]);
    }
    if (targets.length === 0) {
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i) instanceof TextLayer) targets.push(comp.layer(i));
        }
    }
    if (targets.length === 0) { alert("No text layers found in this comp."); return; }

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
    function setColor(prop, c) {
        try { prop.setValue([c[0], c[1], c[2]]); }
        catch (e) { prop.setValue([c[0], c[1], c[2], 1]); }
    }

    app.beginUndoGroup("Text Rhythm");
    try {
        // ---- audio (optional)
        var status = "no audio";
        var peak = 0, v;
        var amp = null;
        try { amp = comp.layer("Audio Amplitude"); } catch (e0) {}

        if (!amp && CFG.useAudio) {
            var audioLayer = null;
            for (i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).hasAudio && !comp.layer(i).hasVideo &&
                    comp.layer(i).source instanceof FootageItem) { audioLayer = comp.layer(i); break; }
            }
            if (!audioLayer) {
                var music = findAudio();
                if (!music && confirm("Add a music track?\n(Cancel = use the timer only, no audio)")) {
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
                try { amp = comp.layer("Audio Amplitude"); } catch (e1) {}
                if (!amp) status = "audio conversion FAILED (Animation > Keyframe Assistant > Convert Audio to Keyframes)";
            }
        }
        if (amp) {
            var both = amp.property("ADBE Effect Parade").property("Both Channels").property(1);
            for (i = 1; i <= both.numKeys; i++) { v = both.keyValue(i); if (v > peak) peak = v; }
            status = "audio OK, peak = " + Math.round(peak * 10) / 10;
        }

        // ---- controls layer
        var ctl = null;
        try { ctl = comp.layer("CONTROLS"); } catch (e2) {}
        if (!ctl) { ctl = comp.layers.addNull(comp.duration); ctl.name = "CONTROLS"; }
        ensureSlider(ctl, "Flip Rate", 4);          // color changes per second
        ensureSlider(ctl, "Density", 18);           // % of letters flipped at any moment
        ensureSlider(ctl, "Audio Boost", 45);       // extra % of letters on each beat
        ensureSlider(ctl, "Threshold", peak > 0 ? peak * 0.55 : 1);
        ensureSlider(ctl, "Start Time", 0);         // seconds before flipping begins

        // ---- animators
        for (var t = 0; t < targets.length; t++) {
            L = targets[t];
            var animators = L.property("ADBE Text Properties").property("ADBE Text Animators");

            // remove our previous animators so re-running is safe
            for (i = animators.numProperties; i >= 1; i--) {
                if (animators.property(i).name.indexOf("RHYTHM") === 0) animators.property(i).remove();
            }

            for (var c = 0; c < CFG.flipColors.length; c++) {
                var an = animators.addProperty("ADBE Text Animator");
                an.name = "RHYTHM " + (c + 1);

                var fill = an.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color");
                setColor(fill, CFG.flipColors[c]);

                var sels = an.property("ADBE Text Selectors");
                while (sels.numProperties > 0) sels.property(1).remove();
                var es = sels.addProperty("ADBE Text Expressible Selector");

                var share = (c === 0) ? 1 : CFG.shareOfSecond;
                es.property("ADBE Text Expressible Amount").expression =
                    'var ctl=thisComp.layer("CONTROLS");' +
                    'var st=ctl.effect("Start Time")("Slider");' +
                    'var fps=Math.max(0.1,ctl.effect("Flip Rate")("Slider"));' +
                    'var step=Math.floor(Math.max(0,time-st)*fps);' +
                    'var au=0,thr=1;' +
                    'try{au=thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider").valueAtTime(time);' +
                    'thr=ctl.effect("Threshold")("Slider");}catch(err){}' +
                    'var d=ctl.effect("Density")("Slider")/100*' + share + ';' +
                    'if(au>thr)d=Math.min(1,d+ctl.effect("Audio Boost")("Slider")/100*' + share + ');' +
                    'seedRandom(textIndex*131+thisLayer.index*977+step*7919+' + (c * 5003) + ',true);' +
                    '(time<st)?0:(random()<d?100:0);';
            }
        }

        alert("Done: " + targets.length + " text layer(s).\nStatus: " + status +
              "\n\nOn the CONTROLS layer:\n- Flip Rate: color changes per second\n- Density: % of letters flipped\n" +
              "- Audio Boost / Threshold: reaction to the beat\n- Start Time: when flipping begins\n\n" +
              "Added more lines later? Select them (or nothing) and run again.");
    } catch (err2) {
        alert("Script error:\n" + err2.toString() + "\nLine: " + err2.line);
    } finally {
        app.endUndoGroup();
    }
})();
