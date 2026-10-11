// Council rates calculator for aldo.today. No dependencies.
// Reads its numbers from <script type="application/json" id="rates-cfg">.
(function () {
  var form = document.querySelector('[data-rates-calc]');
  var cfgEl = document.getElementById('rates-cfg');
  if (!form || !cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent);
  var out = form.querySelector('output');
  var use = form.elements.use;
  var fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

  var opts = [['Residential', cfg.residential]].concat(Object.entries(cfg.categories));
  opts.forEach(function (o) { use.add(new Option(o[0], o[1])); });

  // Accepts "1,100,000", "$1.1m", "850k".
  function amount(s) {
    s = String(s || '').toLowerCase().replace(/[$,\s]/g, '');
    var m = s.match(/^(\d*\.?\d+)(m|k)?$/);
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  }

  function row(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  }

  function render() {
    var cv = amount(form.elements.cv.value);
    if (!(cv > 0)) { out.innerHTML = '<span class="fine">Enter a capital value, like 950,000 or 1.2m.</span>'; return; }
    var rate = parseFloat(use.value);
    var byValue = cv * rate;
    var onMin = byValue < cfg.minimum;
    var general = Math.max(byValue, cfg.minimum) + cfg.fixed;
    var levy = cv * cfg.levy + (cfg.levyFixed || 0);
    var total = general + levy + (cfg.service || 0);
    var html = '<div class="big">' + fmt.format(total) + ' a year</div>' +
      '<div>about ' + fmt.format(total / 4) + ' a quarter</div><dl>' +
      row('General rates' + (onMin ? ' (minimum)' : ''), fmt.format(general)) +
      row(cfg.levyName, fmt.format(levy)) +
      (cfg.service ? row('Waste service charge', fmt.format(cfg.service)) : '') + '</dl>';
    if (onMin) html += '<p class="fine">' + fmt.format(cv) + ' × ' + +(rate * 100).toFixed(9) + '¢ = ' + fmt.format(byValue) +
      ', under the ' + fmt.format(cfg.minimum) + ' minimum, so you pay the minimum.</p>';
    var last = form.elements.last ? amount(form.elements.last.value) : 0;
    if (cfg.cap && last > 0 && use.selectedIndex === 0) {
      var capped = last * (1 + cfg.cap / 100);
      html += general > capped
        ? '<p><b>Up ' + Math.round((general / last - 1) * 100) + '% on last year.</b> You may get a rate-capping rebate of about ' +
          fmt.format(general - capped) + ', bringing general rates to ' + fmt.format(capped) + '. Ask council.</p>'
        : '<p class="fine">Change on last year: ' + ((general / last - 1) * 100).toFixed(1) + '% — under the ' + cfg.cap + '% cap.</p>';
    }
    html += '<p class="fine">Estimate only. Excludes the Emergency Services Levy (billed by RevenueSA) and any rebate or concession.</p>';
    out.innerHTML = html;
  }

  form.addEventListener('input', render);
  render();
})();
