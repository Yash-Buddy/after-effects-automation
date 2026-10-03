/*
  WordRunner  -  After Effects ExtendScript (.jsx)

  - Keeps unlit words at 100% white opacity.
  - Electric current ping-pong effect: highlights word-by-word top-to-bottom,
    then sweeps back bottom-to-top continuously.
*/
(function () {

    var CFG = {
        highlightColor: [1.0, 1.0, 0.0]   // Pure Yellow [RGB 0-1]
    };

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open your comp first."); return; }

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

    // Ping-pong expression calculation
    function selectorExpr() {
        return 'var ctl=thisComp.layer("CONTROLS");' +
            'var wps=Math.max(0.1,ctl.effect("Words Per Second")("Slider"));' +
            'var trail=Math.max(1,Math.round(ctl.effect("Trail Words")("Slider")));' +
            'var st=ctl.effect("Start Time")("Slider");' +
            'var s=text.sourceText.toString();' +
            'var n=textIndex,tot=0,wi=-1,prev=true,i,c,sp;' +
            'for(i=0;i<s.length;i++){c=s.charAt(i);sp=/\\s/.test(c);' +
            'if(!sp&&prev)tot++;' +
            'if(i==n-1)wi=sp?-1:tot;' +
            'prev=sp;}' +
            'if(tot<1||wi<1)0;' +
            'else{' +
            '  var cycleSteps=Math.max(1, (tot - 1) * 2);' +
            '  var step=(time<st)?0:Math.floor((time-st)*wps)%cycleSteps;' +
            '  var curStep=(step<tot)?(step+1):(2*tot-1-step);' +
            '  var lit=(wi>=curStep-(trail-1) && wi<=curStep+(trail-1));' +
            '  (lit?100:0);' +
            '}';
    }

    app.beginUndoGroup("Word Runner");
    try {
        var ctl = null;
        try { ctl = comp.layer("CONTROLS"); } catch (e0) {}
        if (!ctl) { ctl = comp.layers.addNull(comp.duration); ctl.name = "CONTROLS"; }
        
        ensureSlider(ctl, "Words Per Second", 12);            // Higher default speed
        ensureSlider(ctl, "Trail Words", 1);                 // Glowing trail width
        ensureSlider(ctl, "Start Time", 0);                  // Delay before starting

        for (var t = 0; t < targets.length; t++) {
            L = targets[t];
            var animators = L.property("ADBE Text Properties").property("ADBE Text Animators");

            // Remove previous script-created animators
            for (i = animators.numProperties; i >= 1; i--) {
                if (animators.property(i).name.indexOf("WORD") === 0) animators.property(i).remove();
            }

            // Yellow color highlight animator
            var lit = animators.addProperty("ADBE Text Animator");
            lit.name = "WORD LIT";
            var fill = lit.property("ADBE Text Animator Properties").addProperty("ADBE Text Fill Color");
            setColor(fill, CFG.highlightColor);
            var ls = lit.property("ADBE Text Selectors");
            while (ls.numProperties > 0) ls.property(1).remove();
            ls.addProperty("ADBE Text Expressible Selector")
              .property("ADBE Text Expressible Amount").expression = selectorExpr();
        }

        alert("Done! Ping-pong electric current highlight updated for " + targets.length + " text layer(s).");
    } catch (err) {
        alert("Script error:\n" + err.toString() + "\nLine: " + err.line);
    } finally {
        app.endUndoGroup();
    }
})();