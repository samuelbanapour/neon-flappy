/**
 * Neon Flappy — a Flappy Bird-style game.
 * Pure HTML5 Canvas, no dependencies. Neon/dark aesthetic.
 * Features: gravity physics, scrolling pipes, particle trail,
 * screen shake on death, difficulty curve, localStorage high score.
 */
(function () {
  "use strict";

  // ── Tunables ────────────────────────────────────────────────
  var GRAVITY        = 1900;   // px/s²
  var FLAP_FORCE     = -530;   // px/s  (negative = up)
  var BIRD_R         = 14;     // bird collision radius
  var PIPE_W         = 62;     // pipe width
  var PIPE_SPEED_0   = 210;    // initial pipe scroll speed px/s
  var PIPE_FREQ_0    = 1.65;   // seconds between pipe spawns
  var GAP_H_0        = 178;    // initial gap height between pipes
  var GAP_H_MIN      = 118;    // floor on gap shrinkage
  var DIFF_EVERY     = 5;      // increase difficulty every N pipes passed
  var SPEED_INC      = 18;     // px/s added per difficulty step
  var GAP_DEC        = 12;     // px removed from gap per difficulty step
  var PIPE_MARGIN    = 90;     // min distance from top/bottom for gap center
  var MAX_DT         = 0.05;   // cap delta-time to avoid spiral of death

  // trail / particles
  var TRAIL_MAX      = 12;
  var TRAIL_LIFE     = 0.28;   // seconds each trail particle lives
  var BURST_COUNT    = 28;     // particles on death
  var BURST_LIFE     = 0.9;

  // screen shake
  var SHAKE_TIME     = 0.45;
  var SHAKE_AMP      = 11;

  // star parallax layers
  var STAR_LAYERS = [
    { count: 60, speed: 18,  r: 0.6, alpha: 0.35 },
    { count: 35, speed: 46,  r: 1.1, alpha: 0.55 },
    { count: 18, speed: 90,  r: 1.7, alpha: 0.8  },
  ];

  // ── Canvas + resize ──────────────────────────────────────────
  var canvas = document.getElementById("game");
  var ctx    = canvas.getContext("2d");
  var W = 400, H = 600;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr  = window.devicePixelRatio || 1;
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width;
    H = rect.height;
    // Reposition stars when resized
    stars.forEach(function (s) {
      s.x = Math.random() * W;
      s.y = Math.random() * H;
    });
  }
  window.addEventListener("resize", resize);

  // ── Stars (parallax) ────────────────────────────────────────
  var stars = [];
  function initStars() {
    stars = [];
    STAR_LAYERS.forEach(function (layer, li) {
      for (var i = 0; i < layer.count; i++) {
        stars.push({
          x: Math.random() * (W || 400),
          y: Math.random() * (H || 600),
          r: layer.r,
          alpha: layer.alpha,
          speed: layer.speed,
          layer: li,
        });
      }
    });
  }

  // ── State ────────────────────────────────────────────────────
  var state = "menu"; // 'menu' | 'playing' | 'dead'

  var bird = {};
  var pipes = [];
  var particles = [];
  var pipeTimer = 0;
  var score = 0;
  var highScore = parseInt(localStorage.getItem("neonFlappy_hs") || "0", 10);
  var newBest = false;

  // difficulty vars (reset each play)
  var pipeSpeed, pipeFreq, gapH, diffStep;

  // screen-shake
  var shakeTimer = 0;

  // for the score bump CSS animation
  var scoreEl     = document.getElementById("score");
  var bestEl      = document.getElementById("best");
  var overlay     = document.getElementById("overlay");
  var overlayTitle    = document.getElementById("overlayTitle");
  var overlaySub      = document.getElementById("overlaySubtitle");
  var startBtn    = document.getElementById("startBtn");

  function initBird() {
    bird = { x: W * 0.28, y: H * 0.45, vy: 0, angle: 0 };
  }

  function resetGame() {
    initBird();
    pipes      = [];
    particles  = [];
    pipeTimer  = 0;
    score      = 0;
    newBest    = false;
    pipeSpeed  = PIPE_SPEED_0;
    pipeFreq   = PIPE_FREQ_0;
    gapH       = GAP_H_0;
    diffStep   = 0;
    shakeTimer = 0;
    scoreEl.textContent = "0";
    updateBestDisplay();
  }

  function updateBestDisplay() {
    bestEl.textContent = highScore > 0 ? "BEST " + highScore : "";
  }

  // ── Difficulty ───────────────────────────────────────────────
  function checkDifficulty() {
    var step = Math.floor(score / DIFF_EVERY);
    if (step > diffStep) {
      diffStep   = step;
      pipeSpeed  = PIPE_SPEED_0 + diffStep * SPEED_INC;
      gapH       = Math.max(GAP_H_MIN, GAP_H_0 - diffStep * GAP_DEC);
      pipeFreq   = Math.max(1.05, PIPE_FREQ_0 - diffStep * 0.06);
    }
  }

  // ── Pipes ────────────────────────────────────────────────────
  function spawnPipe() {
    var cy  = PIPE_MARGIN + Math.random() * (H - PIPE_MARGIN * 2 - gapH);
    pipes.push({ x: W + PIPE_W / 2, topH: cy, scored: false });
  }

  // ── Particles ────────────────────────────────────────────────
  function spawnTrail() {
    for (var i = 0; i < 3; i++) {
      particles.push({
        x:    bird.x + (Math.random() - 0.5) * BIRD_R,
        y:    bird.y + (Math.random() - 0.5) * BIRD_R,
        vx:   (Math.random() - 0.5) * 60 - 30,
        vy:   (Math.random() - 0.5) * 60 + 40,
        life: TRAIL_LIFE,
        maxLife: TRAIL_LIFE,
        r:    2 + Math.random() * 2,
        color: "0, 240, 255",
        type: "trail",
      });
    }
  }

  function spawnBurst() {
    for (var i = 0; i < BURST_COUNT; i++) {
      var angle = (Math.random() * Math.PI * 2);
      var spd   = 80 + Math.random() * 280;
      var col   = Math.random() < 0.5 ? "255, 45, 155" : "0, 240, 255";
      particles.push({
        x:    bird.x,
        y:    bird.y,
        vx:   Math.cos(angle) * spd,
        vy:   Math.sin(angle) * spd,
        life: BURST_LIFE,
        maxLife: BURST_LIFE,
        r:    2 + Math.random() * 4,
        color: col,
        type: "burst",
      });
    }
  }

  // ── Collision ────────────────────────────────────────────────
  // Circle-AABB: does circle (cx,cy,r) overlap rect (rx,ry,rw,rh)?
  function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    var nearX = Math.max(rx, Math.min(cx, rx + rw));
    var nearY = Math.max(ry, Math.min(cy, ry + rh));
    var dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy < r * r;
  }

  function checkCollision() {
    // Floor / ceiling
    if (bird.y - BIRD_R <= 0 || bird.y + BIRD_R >= H) return true;

    for (var i = 0; i < pipes.length; i++) {
      var p  = pipes[i];
      var px = p.x - PIPE_W / 2;
      // top pipe rect
      if (circleHitsRect(bird.x, bird.y, BIRD_R - 2, px, 0, PIPE_W, p.topH)) return true;
      // bottom pipe rect
      var botY = p.topH + gapH;
      if (circleHitsRect(bird.x, bird.y, BIRD_R - 2, px, botY, PIPE_W, H - botY)) return true;
    }
    return false;
  }

  // ── Input ────────────────────────────────────────────────────
  function flap() {
    if (state === "menu") {
      startGame();
      return;
    }
    if (state === "dead") return;
    bird.vy = FLAP_FORCE;
    spawnTrail();
  }

  document.addEventListener("pointerdown", function (e) {
    // Ignore clicks on the overlay button (handled separately)
    if (e.target === startBtn) return;
    flap();
  });

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      flap();
    }
  });

  startBtn.addEventListener("click", function () {
    if (state === "menu" || state === "dead") startGame();
  });

  // ── State transitions ────────────────────────────────────────
  function startGame() {
    resetGame();
    state = "playing";
    hideOverlay();
  }

  function die() {
    state = "dead";
    shakeTimer = SHAKE_TIME;
    spawnBurst();

    // Save high score
    if (score > highScore) {
      highScore = score;
      newBest   = true;
      localStorage.setItem("neonFlappy_hs", highScore);
    }

    // Show game-over overlay after brief delay
    setTimeout(showGameOver, 600);
  }

  function showGameOver() {
    overlayTitle.textContent = "GAME OVER";
    // Build score panel
    var panel = document.getElementById("gameOverPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "gameOverPanel";
      overlay.insertBefore(panel, startBtn);
    }
    panel.innerHTML =
      '<div class="label">SCORE</div>' +
      '<div class="val' + (newBest ? ' new-best">★ ' : '">') + score + "</div>" +
      '<div class="label" style="margin-top:10px">BEST</div>' +
      '<div class="val">' + highScore + "</div>";

    overlaySub.textContent = newBest ? "🎉 New personal best!" : "Tap to try again";
    startBtn.textContent = "PLAY AGAIN";
    showOverlay();
  }

  function showOverlay()  { overlay.classList.add("visible"); }
  function hideOverlay()  { overlay.classList.remove("visible"); }

  // ── Update ────────────────────────────────────────────────────
  function update(dt) {
    dt = Math.min(dt, MAX_DT);

    if (state !== "playing") {
      // still scroll stars on menu/dead
      updateStars(dt);
      updateParticles(dt);
      shakeTimer = Math.max(0, shakeTimer - dt);
      return;
    }

    updateStars(dt);

    // Bird physics
    bird.vy    += GRAVITY * dt;
    bird.y     += bird.vy  * dt;
    bird.angle  = Math.max(-0.52, Math.min(1.3, bird.vy / 580)) * Math.PI;

    // Pipes
    pipeTimer += dt;
    if (pipeTimer >= pipeFreq) {
      spawnPipe();
      pipeTimer = 0;
    }

    for (var i = pipes.length - 1; i >= 0; i--) {
      pipes[i].x -= pipeSpeed * dt;
      // Score when pipe center passes bird x
      if (!pipes[i].scored && pipes[i].x < bird.x) {
        pipes[i].scored = true;
        score++;
        scoreEl.textContent = score;
        bumpScore();
        checkDifficulty();
      }
      // Remove off-screen pipes
      if (pipes[i].x < -PIPE_W) pipes.splice(i, 1);
    }

    updateParticles(dt);

    // Shake timer
    shakeTimer = Math.max(0, shakeTimer - dt);

    // Collision
    if (checkCollision()) die();
  }

  function bumpScore() {
    scoreEl.classList.remove("bump");
    // Force reflow so the animation restarts
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
  }

  function updateStars(dt) {
    if (state === "menu") dt *= 0.25; // slow scroll on menu
    stars.forEach(function (s) {
      s.x -= s.speed * dt;
      if (s.x < -s.r) s.x = W + s.r;
    });
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x    += p.vx * dt;
      p.y    += p.vy * dt;
      p.vy   += 200 * dt; // slight gravity on burst
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Draw ──────────────────────────────────────────────────────
  function draw() {
    ctx.save();

    // Screen shake
    if (shakeTimer > 0) {
      var t     = shakeTimer / SHAKE_TIME;
      var amp   = SHAKE_AMP * t;
      var sx    = (Math.random() * 2 - 1) * amp;
      var sy    = (Math.random() * 2 - 1) * amp;
      ctx.translate(sx, sy);
    }

    drawBackground();
    drawStars();
    drawPipes();
    drawParticles();
    drawBird();

    ctx.restore();
  }

  function drawBackground() {
    // Main gradient
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   "#1a0b3d");
    grad.addColorStop(0.5, "#0d0622");
    grad.addColorStop(1,   "#0a0118");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle scanlines
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (var y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }
  }

  function drawStars() {
    stars.forEach(function (s) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255," + s.alpha + ")";
      ctx.fill();
    });
  }

  function drawPipes() {
    pipes.forEach(function (p) {
      var px = p.x - PIPE_W / 2;

      // Glow
      ctx.shadowColor = "#ff2d9b";
      ctx.shadowBlur  = 22;

      // Top pipe
      drawPipeRect(px, 0, PIPE_W, p.topH);
      // Bottom pipe
      var botY = p.topH + gapH;
      drawPipeRect(px, botY, PIPE_W, H - botY);

      // Pipe caps
      var capH = 18, capOvr = 6;
      drawPipeCap(px - capOvr, p.topH - capH, PIPE_W + capOvr * 2, capH);
      drawPipeCap(px - capOvr, botY,           PIPE_W + capOvr * 2, capH);

      ctx.shadowBlur = 0;

      // Gap center line (faint)
      var cy = p.topH + gapH / 2;
      ctx.strokeStyle = "rgba(255, 45, 155, 0.12)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(px, cy);
      ctx.lineTo(px + PIPE_W, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  function drawPipeRect(x, y, w, h) {
    // Gradient fill
    var grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0,    "#7a0040");
    grad.addColorStop(0.3,  "#cc1066");
    grad.addColorStop(0.55, "#ff2d9b");
    grad.addColorStop(0.78, "#cc1066");
    grad.addColorStop(1,    "#7a0040");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Edge highlight
    ctx.fillStyle = "rgba(255,180,220,0.18)";
    ctx.fillRect(x + 4, y, 4, h);
  }

  function drawPipeCap(x, y, w, h) {
    var grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0,    "#5a0030");
    grad.addColorStop(0.35, "#dd1580");
    grad.addColorStop(0.65, "#ff4db8");
    grad.addColorStop(1,    "#5a0030");
    ctx.fillStyle = grad;

    var r = 5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  // Wing flap animation
  var wingPhase = 0;

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.angle);

    // Flappy Bird: round ball body, ~BIRD_R radius
    var r = BIRD_R;

    // Wing flap
    wingPhase += 0.18;
    var flapAmt = Math.sin(wingPhase * 7);
    if (bird.vy < -100) flapAmt *= 1.5;

    // ── BODY — big round circle (the iconic Flappy Bird shape) ──
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur  = 22;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    var bodyGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 1, 0, 0, r);
    bodyGrad.addColorStop(0,   "#b0ffff");
    bodyGrad.addColorStop(0.35, "#00f0ff");
    bodyGrad.addColorStop(0.75, "#00c8e0");
    bodyGrad.addColorStop(1,   "#005870");
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Body outline
    ctx.strokeStyle = "rgba(0,255,255,0.3)";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── WING — small oval on the side, flaps up/down ──────────
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#00d4ff";

    var wingYOff = flapAmt * r * 0.5;

    ctx.beginPath();
    ctx.ellipse(-r * 0.15, r * 0.05 + wingYOff, r * 0.55, r * 0.32, -0.15, 0, Math.PI * 2);
    var wingGrad = ctx.createLinearGradient(-r * 0.6, wingYOff, r * 0.3, r * 0.3 + wingYOff);
    wingGrad.addColorStop(0,   "rgba(0,200,255,0.8)");
    wingGrad.addColorStop(0.5, "rgba(0,160,200,0.55)");
    wingGrad.addColorStop(1,   "rgba(0,80,120,0.25)");
    ctx.fillStyle = wingGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,255,255,0.2)";
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    // ── BEAK — two triangles (orange, the Flappy Bird signature) ──
    ctx.shadowBlur = 4;
    ctx.shadowColor = "#ff8800";

    // Upper beak
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * 0.12);
    ctx.lineTo(r * 1.35, -r * 0.04);
    ctx.lineTo(r * 0.55, r * 0.1);
    ctx.closePath();
    var ubGrad = ctx.createLinearGradient(r * 0.55, 0, r * 1.35, 0);
    ubGrad.addColorStop(0,   "#ff9900");
    ubGrad.addColorStop(0.7, "#ff6600");
    ubGrad.addColorStop(1,   "#ee4400");
    ctx.fillStyle = ubGrad;
    ctx.fill();

    // Lower beak
    ctx.beginPath();
    ctx.moveTo(r * 0.6, r * 0.1);
    ctx.lineTo(r * 1.2, r * 0.12);
    ctx.lineTo(r * 0.6, r * 0.24);
    ctx.closePath();
    ctx.fillStyle = "#cc5500";
    ctx.fill();

    // Beak separation line
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth   = 0.7;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, r * 0.09);
    ctx.lineTo(r * 1.3,  r * 0.05);
    ctx.stroke();

    // ── EYE — big white circle with black pupil (Flappy Bird style) ──
    ctx.shadowBlur = 0;

    // Eye white — big and round
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.25, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,180,220,0.35)";
    ctx.lineWidth   = 0.6;
    ctx.stroke();

    // Pupil — offset right (looking forward)
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.22, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlight (white dot)
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(r * 0.36, -r * 0.32, r * 0.08, 0, Math.PI * 2);
    ctx.fill();

    // ── TAIL — 3 small feather tufts at the back ──────────────
    ctx.strokeStyle = "rgba(0,200,255,0.45)";
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = "round";
    ctx.shadowBlur  = 4;

    for (var ti = -1; ti <= 1; ti++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, ti * r * 0.22);
      ctx.lineTo(-r * 1.25, ti * r * 0.3 + Math.sin(wingPhase + ti) * 1.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(function (p) {
      var t = p.life / p.maxLife;
      var alpha = p.type === "trail" ? t * 0.7 : t * 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (p.type === "trail" ? t : 1), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.color + "," + alpha + ")";
      ctx.shadowColor = "rgba(" + p.color + ",0.6)";
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ── Game loop ─────────────────────────────────────────────────
  var lastTime = null;

  function loop(ts) {
    if (lastTime === null) lastTime = ts;
    var dt = (ts - lastTime) / 1000;
    lastTime = ts;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // ── Boot ─────────────────────────────────────────────────────
  function boot() {
    resize();
    initStars();
    initBird();
    updateBestDisplay();

    // Show menu
    state = "menu";
    overlayTitle.innerHTML = "NEON<br>FLAPPY";
    overlaySub.textContent = "Tap or press Space to fly";
    startBtn.textContent   = "TAP TO START";

    requestAnimationFrame(loop);
  }

  // Remove a lingering game-over panel on re-show
  startBtn.addEventListener("click", function () {
    var panel = document.getElementById("gameOverPanel");
    if (panel) panel.remove();
  });

  // CSS bump animation (injected so no extra file needed)
  var styleTag = document.createElement("style");
  styleTag.textContent =
    "@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.28)}100%{transform:scale(1)}}" +
    "#score.bump{animation:bump 0.18s ease forwards}";
  document.head.appendChild(styleTag);

  boot();
})();
