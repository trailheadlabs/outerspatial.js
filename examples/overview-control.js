window.OuterSpatial = {
  div: 'map',
  overviewControl: {
    layer: 'outerspatial-landscape'
  }
};

(function () {
  var s = document.createElement('script');
  s.src = '{{ path }}/outerspatial-bootstrap.js';
  document.body.appendChild(s);
})();
