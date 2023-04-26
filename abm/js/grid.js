/**
 * "Enter The Grid"
 *
 * Screensaver shell from:
 *   - https://github.com/tlrobinson/WebSaver
 *
 * Javascript from CodePen sketch:
 *   - https://codepen.io/P3R0/pen/MwgoKv
 */
'use strict';

var $grid, gridTimer;

function startGrid() {
  stopGrid();

  const $w = $(window);
  var wtimer = null;
  $w.on('resize', () => {
    if (wtimer) clearTimeout(wtimer);
    wtimer = setTimeout(startGrid, 200);
  });

  $grid = $('#grid');
  if (!$grid.length) $grid = $('<canvas id="grid"></canvas>').prependTo('body');

  // Watch the window size and resize the grid accordingly
  //$w.resize(() => {
  //  $grid.attr({ width:$w.width(), height:$w.height() });
  //}).resize();

  // Configure the appearance
  const drop_color = "#0F0",
        font_size = 24,
        col_gap = 0;

  const charset = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890".split('');

  var w = window.innerWidth, h = window.innerHeight;
  //if  (w < h) w = h;
  $grid.prop({ width: w, height: h })
       .css({ marginRight: -w, marginBottom: -h });

  const ctx = $grid[0].getContext("2d");
  ctx.font = `${font_size}px arial`;

  // Column size and number of columns
  const col_size = font_size + col_gap, columns = w / col_size, rows = h / font_size;

  function rndint(n) { return Math.floor(Math.random() * n); }

  function newdrop() {
    const intvl = rndint(4);
    return { y:-rndint(rows), int:intvl, cnt:intvl };
  }

  // Init all drops at the top of the screen
  var drops = [];
  for (var x = 0; x < columns; x++) drops.push(newdrop());

  // Draw the characters
  function draw() {
    // Black BG for the canvas
    // translucent BG to show trail
    ctx.fillStyle = "rgba(0, 0.01, 0, 0.05)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = drop_color;

    const len = drops.length;
    for (var i = 0; i < len; i++) {
      if (drops[i].cnt--) continue;

      drops[i].cnt = drops[i].int;
      drops[i].y++;

      // Send the drop back to the top randomly after it has crossed the screen
      // Add a randomness to the reset to make the drops scattered on the Y axis
      var y = drops[i].y * font_size;
      if (y > h) drops[i] = newdrop();

      // Print a random character
      ctx.fillText(charset[rndint(charset.length)], i * col_size, y);
    }
  }

  $grid.addClass('grid').on('click', stopGrid);
  gridTimer = setInterval(draw, 33);
}

function stopGrid() {
  // Remove the resize handler from the window
  $(window).off('resize', startGrid);

  // Stop the animation timer
  if (gridTimer) {
    clearInterval(gridTimer);
    gridTimer = null;
  }

  // Remove the grid from the DOM
  if ($grid) $grid.remove();
  $grid = null;
}
