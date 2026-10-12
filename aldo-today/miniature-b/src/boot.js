
/* Boot: check WebGL before fetching three.js, give the scripts 15 s, and show the fallback card
   (never a dead end) if anything fails. The main code above only runs if this says so. */
(function(){
  'use strict';
  var B = window.BAIT, card = document.getElementById('fallback'), ld = document.getElementById('loading');
  if (!B) { if (ld) ld.hidden = true; if (card) card.hidden = false; return; }
  function hasGL(){
    try {
      var c = document.createElement('canvas'), o = { failIfMajorPerformanceCaveat: true };
      var gl = window.WebGLRenderingContext && (c.getContext('webgl2', o) || c.getContext('webgl', o));
      if (!gl) return false;
      var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
      return true;
    } catch (e) { return false; }
  }
  function load(src){
    return new Promise(function(res, rej){ var s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = function(){ rej(new Error(src)); }; document.head.appendChild(s); });
  }
  function go(){
    if (!hasGL()) { B.fallback('nogl'); return; }
    var done = false, timer = setTimeout(function(){ if (!done) { done = true; B.fallback('timeout'); } }, B.rules.scriptMs);
    load(B.build.scripts[0]).then(function(){ if (done) throw new Error('late'); return load(B.build.scripts[1]); }).then(function(){
      if (done) return; done = true; clearTimeout(timer);
      if (!window.THREE || !THREE.MapControls) { B.fallback('timeout'); return; }
      try { B.start(); } catch (e) { B.fallback('nogl'); }
    }, function(){ if (done) return; done = true; clearTimeout(timer); B.fallback('timeout'); });
  }
  var c = navigator.connection;
  if (B.build.page === 'site' && c && c.saveData === true) B.fallback('savedata', go); else go();
})();
