// Injected before the page loads: a controllable SpeechRecognition + speech synthesis spy.
(() => {
  window.__recs = []; window.__spoken = [];
  class FakeRec {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ""; window.__recs.push(this); this.alive = false; }
    start() { this.alive = true; window.__starts = (window.__starts || 0) + 1; if (window.__autoOpen !== false) setTimeout(() => { if (this.alive) { this.onstart && this.onstart(); this.onaudiostart && this.onaudiostart(); } }, 30); }
    stop() { this.alive = false; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.alive = false; }
  }
  window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
  window.__say = (items, resultIndex = 0) => { const r = window.__recs[window.__recs.length - 1]; const list = items.map((i) => (typeof i === "string" ? { text: i, final: true } : i)); r.onresult && r.onresult({ resultIndex, results: list.map((i) => ({ isFinal: !!i.final, 0: { transcript: i.text } })) }); };
  window.__err = (code) => { const r = window.__recs[window.__recs.length - 1]; r.onerror && r.onerror({ error: code }); r.onend && r.onend(); };
  const synth = { speaking: false, cancel() {}, getVoices() { return []; }, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); } };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__API__ = location.origin;
  // count permission lookups: the hook calls it once per effect run, so StrictMode's double mount shows up as 2
  window.__permCalls = 0;
  try { const q = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = (d) => { window.__permCalls++; return q(d); }; } catch (e) {}
})();
