(function () {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("Open the slide comp first."); return; }

    var sel = comp.selectedLayers;
    if (sel.length === 0) { alert("Select the layers you want to pop up first."); return; }

    // ---- settings ----
    var START = 0.5;      // seconds until the first piece appears
    var STAGGER = 0.3;    // delay between pieces
    var RISE = 120;       // pixels each piece rises from below
    var DUR = 0.7;        // seconds for the rise
    var FADE = 0.4;       // seconds for the fade-in
    var REVERSE = false;  // true = bottom selected layer goes first
    // ------------------

    function easeKeys(prop) {
        try {
            var e = new KeyframeEase(0, 80);
            for (var k = 1; k <= prop.numKeys; k++) {
                prop.setTemporalEaseAtKey(k, [e], [e]);
            }
        } catch (err) {}
    }

    app.beginUndoGroup("Pop-up cascade");

    var layers = [];
    for (var i = 0; i < sel.length; i++) layers.push(sel[i]);
    if (REVERSE) layers.reverse();

    for (var n = 0; n < layers.length; n++) {
        var L = layers[n];
        var t = START + n * STAGGER;
        var tr = L.property("ADBE Transform Group");

        // position: rise up into place
        var pos = tr.property("ADBE Position");
        if (pos.dimensionsSeparate) {
            var yp = tr.property("ADBE Position_1");
            var y0 = yp.value;
            yp.setValueAtTime(t, y0 + RISE);
            yp.setValueAtTime(t + DUR, y0);
            easeKeys(yp);
        } else if (pos.numKeys === 0) {
            var v = pos.value;
            var from = [];
            for (var d = 0; d < v.length; d++) from.push(v[d]);
            from[1] = from[1] + RISE;
            pos.setValueAtTime(t, from);
            pos.setValueAtTime(t + DUR, v);
            easeKeys(pos);
        }

        // opacity: hidden until its turn, then fade in
        var op = tr.property("ADBE Opacity");
        if (op.numKeys === 0) {
            var o = op.value;
            op.setValueAtTime(0, 0);
            op.setValueAtTime(t, 0);
            op.setValueAtTime(t + FADE, o);
            easeKeys(op);
        }
    }

    app.endUndoGroup();
})();