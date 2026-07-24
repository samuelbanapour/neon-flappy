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

  // Wing flap animation (driven by velocity)
  var wingPhase = 0;

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.angle);

    var bw = BIRD_R * 1.5, bh = BIRD_R;

    // Wing flap: oscillates with velocity, flaps faster when flapping up
    wingPhase += 0.15;
    var flapAmt = Math.sin(wingPhase * 6) * 0.35;
    // More aggressive flap when moving upward
    if (bird.vy < -100) flapAmt *= 1.6;

    // ── Tail feathers (3 fanned lines behind the bird) ─────────
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = "rgba(0,200,255,0.5)";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";

    for (var ti = -1; ti <= 1; ti++) {
      var tAngle = ti * 0.28;
      var tLen   = bw * 0.7 + (ti === 0 ? bw * 0.15 : 0);
      ctx.beginPath();
      ctx.moveTo(-bw * 0.7, ti * bh * 0.25);
      ctx.quadraticCurveTo(
        -bw * 1.1, ti * bh * 0.5 + Math.sin(wingPhase + ti) * 2,
        -bw * 1.3, ti * bh * 0.35 + Math.sin(wingPhase + ti) * 3
      );
      ctx.stroke();
    }

    // ── Body — rounder, bird-shaped (wider at chest, tapered at rear) ──
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur  = 20;

    ctx.beginPath();
    ctx.moveTo(bw * 0.85, 0);                    // beak tip starts here
    // Top of head → back
    ctx.bezierCurveTo(
      bw * 0.7,  -bh * 0.85,   // head top
      bw * 0.1,  -bh * 1.0,    // crown
      -bw * 0.4, -bh * 0.65    // upper back
    );
    // Back → tail base
    ctx.bezierCurveTo(
      -bw * 0.7, -bh * 0.35,
      -bw * 0.85, bh * 0.0,
      -bw * 0.7,  bh * 0.35    // rump
    );
    // Underside → chest
    ctx.bezierCurveTo(
      -bw * 0.4, bh * 0.75,
      bw * 0.1,  bh * 0.9,
      bw * 0.65, bh * 0.5      // throat
    );
    // Throat → beak
    ctx.bezierCurveTo(
      bw * 0.8,  bh * 0.25,
      bw * 0.88, bh * 0.08,
      bw * 0.85, 0
    );
    ctx.closePath();

    var bodyGrad = ctx.createRadialGradient(
      bw * 0.1, -bh * 0.2, 2,
      bw * 0.0,  bh * 0.1, bw * 1.1
    );
    bodyGrad.addColorStop(0,   "#b0ffff");
    bodyGrad.addColorStop(0.3, "#00f0ff");
    bodyGrad.addColorStop(0.7, "#00c8e0");
    bodyGrad.addColorStop(1,   "#005870");
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Subtle body outline
    ctx.strokeStyle = "rgba(0,255,255,0.25)";
    ctx.lineWidth   = 1;
    ctx.stroke();

    // ── Wing (filled, flapping) ────────────────────────────────
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#00d4ff";

    var wingY = bh * 0.1 + flapAmt * bh * 1.2;
    var wingDroop = flapAmt * 0.4;

    ctx.beginPath();
    ctx.moveTo(bw * 0.15, wingY - bh * 0.1);
    // Wing tip — sweeps back and up/down
    ctx.bezierCurveTo(
      -bw * 0.1, wingY - bh * 0.55 + wingDroop * bh,
      -bw * 0.5, wingY - bh * 0.5  + wingDroop * bh,
      -bw * 0.7, wingY - bh * 0.15 + wingDroop * bh * 0.5
    );
    // Wing trailing edge — back to body
    ctx.bezierCurveTo(
      -bw * 0.45, wingY + bh * 0.15,
      -bw * 0.1,  wingY + bh * 0.2,
      bw * 0.2,   wingY + bh * 0.05
    );
    ctx.closePath();

    var wingGrad = ctx.createLinearGradient(
      bw * 0.2, wingY - bh * 0.4,
      -bw * 0.6, wingY + bh * 0.1
    );
    wingGrad.addColorStop(0,   "rgba(0,220,255,0.85)");
    wingGrad.addColorStop(0.5, "rgba(0,180,220,0.6)");
    wingGrad.addColorStop(1,   "rgba(0,100,140,0.3)");
    ctx.fillStyle = wingGrad;
    ctx.fill();

    // Wing feather lines
    ctx.strokeStyle = "rgba(0,255,255,0.3)";
    ctx.lineWidth   = 1;
    for (var fi = 0; fi < 3; fi++) {
      var fx = bw * 0.05 - fi * bw * 0.2;
      ctx.beginPath();
      ctx.moveTo(fx, wingY - bh * 0.15);
      ctx.quadraticCurveTo(
        fx - bw * 0.1, wingY - bh * 0.35 + wingDroop * bh * 0.6,
        fx - bw * 0.3, wingY - bh * 0.2  + wingDroop * bh * 0.3
      );
      ctx.stroke();
    }

    // ── Beak (triangle, top and bottom) ────────────────────────
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#ffcc00";

    // Upper beak
    ctx.beginPath();
    ctx.moveTo(bw * 0.6, -bh * 0.15);
    ctx.lineTo(bw * 1.25, -bh * 0.05);
    ctx.lineTo(bw * 0.6, bh * 0.05);
    ctx.closePath();
    var beakGrad1 = ctx.createLinearGradient(bw * 0.6, 0, bw * 1.25, 0);
    beakGrad1.addColorStop(0,   "#ffaa00");
    beakGrad1.addColorStop(0.6, "#ff8800");
    beakGrad1.addColorStop(1,   "#ff6600");
    ctx.fillStyle = beakGrad1;
    ctx.fill();

    // Lower beak (slightly smaller)
    ctx.beginPath();
    ctx.moveTo(bw * 0.65, bh * 0.05);
    ctx.lineTo(bw * 1.15, bh * 0.1);
    ctx.lineTo(bw * 0.65, bh * 0.18);
    ctx.closePath();
    ctx.fillStyle = "#dd7700";
    ctx.fill();

    // Beak line (separation)
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(bw * 0.6, bh * 0.02);
    ctx.lineTo(bw * 1.2, bh * 0.03);
    ctx.stroke();

    // ── Eye ────────────────────────────────────────────────────
    ctx.shadowBlur = 0;

    // Eye white
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(bw * 0.5, -bh * 0.28, 4.2, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye ring (subtle cyan)
    ctx.strokeStyle = "rgba(0,200,255,0.4)";
    ctx.lineWidth   = 0.7;
    ctx.stroke();

    // Pupil
    ctx.fillStyle = "#0a0118";
    ctx.beginPath();
    ctx.ellipse(bw * 0.54, -bh * 0.26, 2.2, 2.6, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlight
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(bw * 0.48, -bh * 0.34, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // ── Cheek blush (subtle) ──────────────────────────────────
    ctx.fillStyle = "rgba(255,100,180,0.15)";
    ctx.beginPath();
    ctx.ellipse(bw * 0.35, bh * 0.15, 4, 2.5, 0.1, 0, Math.PI * 2);
    ctx.fill();

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
