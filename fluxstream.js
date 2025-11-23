(async () => {
  // --- Game Configuration ---
  const PLAYER_BASE_SPEED = 6.0; // Base horizontal speed (increases with slipstream)
  const PLAYER_MAX_SPEED = 8.0; // Maximum speed when slipstreaming
  const TURNING_SPEED_PENALTY = 0.98; // Speed multiplier when turning (slight slowdown)
  const SLIPSTREAM_SPEED_INCREASE = 0.015; // How fast speed builds when slipstreaming
  const SPEED_DECAY = 0.99; // How fast speed returns to base when not slipstreaming

  const PLAYER_ACCEL_Y = 0.25; // Y-axis acceleration when input is held
  const PLAYER_FRICTION_Y = 0.92; // Drift/deceleration when no input
  const PLAYER_MAX_SPEED_Y = 4.0; // Max vertical velocity (MUST equal PLAYER_BASE_SPEED for 45° angle)

  // Quantized movement - slope is fixed regardless of speed
  // This creates the distinctive Dotstream feel
  const MOVEMENT_ANGLE_QUANTIZE = true;

  const TRAIL_WIDTH = 6;
  const TRAIL_HISTORY = Infinity;
  const COLLISION_GRACE_DISTANCE = 30;

  const WORLD_HEIGHT = 800; // Vertical play area
  const CAMERA_BUFFER = 400; // How far ahead to spawn obstacles

  const PLAYER_COLOR = 0x00ffff; // Cyan
  const TRAIL_COLOR = 0x00ffff;
  const RIVAL_COLOR = 0xff8000; // Orange
  const RIVAL_TRAIL_COLOR = 0xff8000;
  const OBSTACLE_COLOR = 0xff0000; // Red

  const GRID_SIZE = 50;
  const GRID_COLOR = 0x40406a;

  // Slipstream mechanic
  const SLIPSTREAM_RANGE = 3; // pixels tolerance for alignment
  const SLIPSTREAM_FILL_RATE = 0.5; // per frame
  const SLIPSTREAM_MAX = 100;
  const SLIPSTREAM_BOOST = 1.5; // speed multiplier

  // Rivals
  const NUM_RIVALS = 5;
  const RIVAL_SPACING = TRAIL_WIDTH * 1.5; // Minimum spacing between players (1 line-width)
  const RIVAL_PENALTY_TIME = 200; // ms penalty when hitting obstacle

  // Lives/Turbo system (like Dotstream)
  const STARTING_LIVES = 3;
  const INVINCIBILITY_TIME = 60; // frames of invincibility after hit

  // --- PIXI App Setup ---
  const app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x05050a,
    antialias: true,
  });
  document.body.appendChild(app.view);

  // --- Game Containers ---
  const world = new PIXI.Container();
  app.stage.addChild(world);

  const trailGraphics = new PIXI.Graphics();
  world.addChild(trailGraphics);

  const rivalTrailGraphics = new PIXI.Graphics();
  world.addChild(rivalTrailGraphics);

  const obstacleContainer = new PIXI.Container();
  world.addChild(obstacleContainer);

  const playerSprite = new PIXI.Graphics();
  world.addChild(playerSprite);

  // --- UI Objects ---
  let slipstreamBar, slipstreamBarFill;
  let pauseOverlay, gameOverOverlay, splashScreenElement, vignetteElement;
  let livesText;

  // --- Game State ---
  let player;
  let rivals = [];
  let trailPoints = [];
  let rivalTrails = [];
  let obstacles = [];
  let gameState = "splash"; // splash, playing, paused, gameOver
  let keys = {};
  let activeTouches = 0;
  let cameraX = 0; // Track how far the world has scrolled
  let slipstreamGauge = 0;
  let slipstreamActive = false;
  let lastObstacleX = -2000; // Track last obstacle position for spacing
  let obstacleDifficulty = 0; // Increases over time

  // --- Setup Functions ---

  function setupPlayerHead(sprite, color) {
    const triangleHeight = TRAIL_WIDTH * 1.8;
    const triangleHalfBase = TRAIL_WIDTH / 2;
    sprite.clear();
    sprite.beginFill(color);
    sprite.drawPolygon([
      new PIXI.Point(triangleHeight / 2, 0), // Point to the right
      new PIXI.Point(-triangleHeight / 2, -triangleHalfBase),
      new PIXI.Point(-triangleHeight / 2, triangleHalfBase),
    ]);
    sprite.endFill();
  }

  function setupUI() {
    // Slipstream gauge
    const gaugeWidth = 200;
    const gaugeHeight = 20;

    slipstreamBar = new PIXI.Graphics();
    slipstreamBar.lineStyle(2, 0xffffff);
    slipstreamBar.drawRect(0, 0, gaugeWidth, gaugeHeight);
    slipstreamBar.x = 20;
    slipstreamBar.y = app.screen.height - 40;
    app.stage.addChild(slipstreamBar);

    slipstreamBarFill = new PIXI.Graphics();
    app.stage.addChild(slipstreamBarFill);

    // Lives indicator
    livesText = new PIXI.Text({
      text: "3",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 32,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
      }),
    });
    livesText.anchor.set(0, 0);
    livesText.x = 20;
    livesText.y = 20;
    app.stage.addChild(livesText);

    // Get overlays and vignette
    pauseOverlay = document.getElementById("pause-overlay");
    gameOverOverlay = document.getElementById("game-over-overlay");
    splashScreenElement = document.getElementById("splash-screen");
    vignetteElement = document.getElementById("slipstream-vignette");
  }

  function updateLivesUI() {
    if (livesText) {
      livesText.text = `${player.lives}`;
    }
  }

  function updateSlipstreamUI() {
    const gaugeWidth = 200;
    const gaugeHeight = 20;
    const fillWidth = (slipstreamGauge / SLIPSTREAM_MAX) * gaugeWidth;

    slipstreamBarFill.clear();
    if (slipstreamGauge > 0) {
      const color = slipstreamActive ? 0x00ff00 : 0xffff00;
      slipstreamBarFill.beginFill(color);
      slipstreamBarFill.drawRect(slipstreamBar.x + 2, slipstreamBar.y + 2, fillWidth - 4, gaugeHeight - 4);
      slipstreamBarFill.endFill();
    }
  }

  function repositionUI() {
    if (slipstreamBar) {
      slipstreamBar.y = app.screen.height - 40;
    }
  }

  function drawTrails() {
    // Player trail
    trailGraphics.clear();
    if (trailPoints.length > 1) {
      trailGraphics.moveTo(trailPoints[0].x, trailPoints[0].y);
      for (let i = 1; i < trailPoints.length; i++) {
        trailGraphics.lineTo(trailPoints[i].x, trailPoints[i].y);
      }
      trailGraphics.stroke({
        width: TRAIL_WIDTH,
        color: TRAIL_COLOR,
        cap: "round",
        join: "round",
      });
    }

    // Rival trails
    rivalTrailGraphics.clear();
    rivals.forEach((rival, i) => {
      const trail = rivalTrails[i];
      if (trail && trail.length > 1) {
        rivalTrailGraphics.moveTo(trail[0].x, trail[0].y);
        for (let j = 1; j < trail.length; j++) {
          rivalTrailGraphics.lineTo(trail[j].x, trail[j].y);
        }
        rivalTrailGraphics.stroke({
          width: TRAIL_WIDTH,
          color: RIVAL_TRAIL_COLOR,
          cap: "round",
          join: "round",
        });
      }
    });
  }

  // --- Obstacle Generator (The "Director") ---
  // Based on Dotstream: Large funnels that force all 6 players through tight chokepoints

  function spawnObstacle() {
    const spawnX = cameraX + app.screen.width + CAMERA_BUFFER;

    // Gap must fit all 6 players (player + 5 rivals) with minimal spacing
    const minGapSize = (NUM_RIVALS + 1) * TRAIL_WIDTH * 2; // Barely fits all players
    const gapSize = minGapSize + Math.random() * 30; // Slight variation

    const type = Math.random();

    if (type < 0.5) {
      // Simple horizontal funnel - large walls with a gap
      const gapY = (Math.random() - 0.5) * WORLD_HEIGHT * 0.5;

      // Top wall (covers from top of screen to gap)
      const topWall = new PIXI.Graphics();
      topWall.beginFill(OBSTACLE_COLOR);
      topWall.drawRect(0, -WORLD_HEIGHT / 2, TRAIL_WIDTH * 2, (gapY - gapSize / 2) - (-WORLD_HEIGHT / 2));
      topWall.endFill();
      topWall.x = spawnX;
      topWall.y = 0;
      topWall.isWall = true;
      topWall.wallBounds = {
        x: 0,
        y: -WORLD_HEIGHT / 2,
        width: TRAIL_WIDTH * 2,
        height: gapY - gapSize / 2 + WORLD_HEIGHT / 2
      };
      obstacles.push(topWall);
      obstacleContainer.addChild(topWall);

      // Bottom wall (covers from gap to bottom of screen)
      const bottomWall = new PIXI.Graphics();
      bottomWall.beginFill(OBSTACLE_COLOR);
      bottomWall.drawRect(0, gapY + gapSize / 2, TRAIL_WIDTH * 2, (WORLD_HEIGHT / 2) - (gapY + gapSize / 2));
      bottomWall.endFill();
      bottomWall.x = spawnX;
      bottomWall.y = 0;
      bottomWall.isWall = true;
      bottomWall.wallBounds = {
        x: 0,
        y: gapY + gapSize / 2,
        width: TRAIL_WIDTH * 2,
        height: WORLD_HEIGHT / 2 - (gapY + gapSize / 2)
      };
      obstacles.push(bottomWall);
      obstacleContainer.addChild(bottomWall);

    } else {
      // Diagonal funnel - 45° angled walls creating a diagonal passage
      const angleUp = Math.random() < 0.5;
      const centerY = (Math.random() - 0.5) * WORLD_HEIGHT * 0.3;
      const funnelWidth = 300;

      // Create angled walls as filled polygons
      const topWall = new PIXI.Graphics();
      topWall.beginFill(OBSTACLE_COLOR);

      let topVertices;
      if (angleUp) {
        // Funnel going up
        topVertices = [
          { x: 0, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY - gapSize / 2 - funnelWidth },
          { x: 0, y: centerY - gapSize / 2 }
        ];
        topWall.drawPolygon([
          new PIXI.Point(0, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY - gapSize / 2 - funnelWidth),
          new PIXI.Point(0, centerY - gapSize / 2)
        ]);
      } else {
        // Funnel going down
        topVertices = [
          { x: 0, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY - gapSize / 2 + funnelWidth },
          { x: 0, y: centerY - gapSize / 2 }
        ];
        topWall.drawPolygon([
          new PIXI.Point(0, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY - gapSize / 2 + funnelWidth),
          new PIXI.Point(0, centerY - gapSize / 2)
        ]);
      }
      topWall.endFill();
      topWall.x = spawnX;
      topWall.y = 0;
      topWall.isWall = true;
      topWall.isDiagonal = true;
      topWall.polygonVertices = topVertices;
      topWall.angleUp = angleUp;
      topWall.centerY = centerY;
      topWall.gapSize = gapSize;
      topWall.funnelWidth = funnelWidth;
      obstacles.push(topWall);
      obstacleContainer.addChild(topWall);

      const bottomWall = new PIXI.Graphics();
      bottomWall.beginFill(OBSTACLE_COLOR);

      let bottomVertices;
      if (angleUp) {
        bottomVertices = [
          { x: 0, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY + gapSize / 2 - funnelWidth },
          { x: 0, y: centerY + gapSize / 2 }
        ];
        bottomWall.drawPolygon([
          new PIXI.Point(0, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY + gapSize / 2 - funnelWidth),
          new PIXI.Point(0, centerY + gapSize / 2)
        ]);
      } else {
        bottomVertices = [
          { x: 0, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY + gapSize / 2 + funnelWidth },
          { x: 0, y: centerY + gapSize / 2 }
        ];
        bottomWall.drawPolygon([
          new PIXI.Point(0, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY + gapSize / 2 + funnelWidth),
          new PIXI.Point(0, centerY + gapSize / 2)
        ]);
      }
      bottomWall.endFill();
      bottomWall.x = spawnX;
      bottomWall.y = 0;
      bottomWall.isWall = true;
      bottomWall.isDiagonal = true;
      bottomWall.polygonVertices = bottomVertices;
      bottomWall.angleUp = angleUp;
      bottomWall.centerY = centerY;
      bottomWall.gapSize = gapSize;
      bottomWall.funnelWidth = funnelWidth;
      obstacles.push(bottomWall);
      obstacleContainer.addChild(bottomWall);
    }
  }

  function updateObstacles() {
    // Remove obstacles that are off-screen to the left
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      if (obs.x < cameraX - 200) {
        obstacleContainer.removeChild(obs);
        obs.destroy();
        obstacles.splice(i, 1);
      }
    }

    // Progressive difficulty - spawn rate increases slowly over time
    obstacleDifficulty += 0.00001;
    const spawnChance = Math.min(0.008 + obstacleDifficulty, 0.02); // Cap at 0.02

    // Enforce minimum spacing between obstacles
    const minSpacing = 1200; // Minimum distance between obstacles
    const spawnX = cameraX + app.screen.width + CAMERA_BUFFER;
    const distanceSinceLastObstacle = spawnX - lastObstacleX;

    // Only spawn if enough distance has passed
    if (distanceSinceLastObstacle >= minSpacing && Math.random() < spawnChance) {
      spawnObstacle();
      lastObstacleX = spawnX;
    }
  }

  // --- Collision Detection ---

  function pointToSegmentDistanceSq(point, segP1, segP2) {
    const segX = segP2.x - segP1.x;
    const segY = segP2.y - segP1.y;
    const pointToP1X = segP1.x - point.x;
    const pointToP1Y = segP1.y - point.y;

    const segLenSq = segX * segX + segY * segY;
    if (segLenSq === 0) return (point.x - segP1.x) ** 2 + (point.y - segP1.y) ** 2;

    const t = Math.max(0, Math.min(1, (-pointToP1X * segX - pointToP1Y * segY) / segLenSq));
    const closestX = segP1.x + t * segX;
    const closestY = segP1.y + t * segY;

    return (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
  }

  function isCollidingWithTrail(entity, trail, graceDistance = 0) {
    if (!trail || trail.length < 2) return false;

    for (let i = 0; i < trail.length - 1; i++) {
      const distSq = pointToSegmentDistanceSq(entity, trail[i], trail[i + 1]);
      if (distSq < (TRAIL_WIDTH / 2 + graceDistance) ** 2) {
        return true;
      }
    }
    return false;
  }

  function getSafeTrail(entity, trail) {
    if (!trail) return [];
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      const distSq = (entity.x - p.x) ** 2 + (entity.y - p.y) ** 2;
      if (distSq > COLLISION_GRACE_DISTANCE ** 2) {
        return trail.slice(0, i + 1);
      }
    }
    return [];
  }

  function handlePlayerHit() {
    if (player.invincibilityTimer > 0) return; // Already invincible

    player.lives--;
    player.invincibilityTimer = INVINCIBILITY_TIME;
    updateLivesUI();

    if (player.lives <= 0) {
      endGame();
    }
  }

  function pointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function isRedPixelAt(worldX, worldY) {
    // Check if point collides with any obstacle graphics
    for (const obs of obstacles) {
      // Convert to local obstacle coordinates
      const localX = worldX - obs.x;
      const localY = worldY - obs.y;

      if (obs.isDiagonal) {
        // For diagonal obstacles, do point-in-polygon test
        if (!obs.polygonVertices) continue;
        if (pointInPolygon(localX, localY, obs.polygonVertices)) {
          return true;
        }
      } else {
        // For rectangular obstacles, use bounds
        const bounds = obs.getLocalBounds();
        if (localX >= bounds.x && localX <= bounds.x + bounds.width &&
            localY >= bounds.y && localY <= bounds.y + bounds.height) {
          return true;
        }
      }
    }
    return false;
  }

  function checkCollisions() {
    // Skip collision if invincible
    if (player.invincibilityTimer > 0) {
      player.invincibilityTimer--;
      return;
    }

    // Player vs own trail
    const safePlayerTrail = getSafeTrail(player, trailPoints);
    if (isCollidingWithTrail(player, safePlayerTrail)) {
      handlePlayerHit();
      return;
    }

    // Player vs rival trails (NON-LETHAL - just bounce/slide)
    // In Dotstream, other players' trails are solid walls you can grind on
    // We'll handle this differently - no death, just collision

    // Player vs obstacles - pixel-based collision check
    // Check the head position and direction
    const headX = player.x + TRAIL_WIDTH; // Front of bike
    const headY = player.y;

    if (isRedPixelAt(headX, headY) ||
        isRedPixelAt(headX + 2, headY + 2) ||
        isRedPixelAt(headX + 2, headY - 2)) {
      handlePlayerHit();
      return;
    }

    // Player vs world bounds
    if (Math.abs(player.y) > WORLD_HEIGHT / 2) {
      handlePlayerHit();
      return;
    }
  }

  // --- Slipstream Mechanic ---
  // Based on Dotstream FAQ: "You can only increase your line speed by being
  // adjacent to a line that is ahead of you" and "Your gauge only builds up
  // when horizontal" (not diagonal)

  function updateSlipstream(delta) {
    let isSlipstreaming = false;

    // Only build speed when moving horizontally (not turning)
    // From FAQ: "Your gauge only builds up when horizontal"
    const isMovingHorizontal = Math.abs(player.vy) < 0.1;

    if (isMovingHorizontal) {
      for (const rival of rivals) {
        // Must be ahead of player
        if (rival.x <= player.x) continue;

        // Check if truly adjacent (parallel, same Y level)
        const yDiff = Math.abs(player.y - rival.y);
        const xDiff = rival.x - player.x;

        // Must be close in Y and reasonably close in X
        if (yDiff <= SLIPSTREAM_RANGE && xDiff < 150 && xDiff > 0) {
          isSlipstreaming = true;
          break;
        }
      }
    }

    // Increase speed when slipstreaming
    if (isSlipstreaming) {
      player.currentSpeed = Math.min(PLAYER_MAX_SPEED, player.currentSpeed + SLIPSTREAM_SPEED_INCREASE * delta);
      slipstreamGauge = Math.min(SLIPSTREAM_MAX, slipstreamGauge + SLIPSTREAM_FILL_RATE * delta);
    } else {
      // Decay speed back to base
      player.currentSpeed = Math.max(PLAYER_BASE_SPEED, player.currentSpeed * Math.pow(SPEED_DECAY, delta));
      slipstreamGauge = Math.max(0, slipstreamGauge - SLIPSTREAM_FILL_RATE * delta * 0.5);
    }

    // Visual effect when slipstreaming
    slipstreamActive = isSlipstreaming && slipstreamGauge > 50;
  }

  function activateSlipstream() {
    if (slipstreamActive) {
      // Apply boost (will be used in movement)
      // For now, just consume the gauge
      slipstreamActive = false;
      slipstreamGauge = 0;
    }
  }

  // --- Game Flow ---

  function startGame() {
    if (gameState !== "splash") return;

    splashScreenElement.style.display = "none";
    gameOverOverlay.style.display = "none";

    // Initialize player
    player = {
      x: 100,
      y: 0,
      vy: 0, // Y velocity
      currentSpeed: PLAYER_BASE_SPEED, // Current horizontal speed (varies)
      lastMoveDirection: 0, // Track last Y movement direction for trail push
      lives: STARTING_LIVES,
      invincibilityTimer: 0,
      sprite: playerSprite,
    };

    setupPlayerHead(playerSprite, PLAYER_COLOR);

    trailPoints = [new PIXI.Point(player.x, player.y)];

    // Initialize rivals (dummy straight-ahead)
    rivals = [];
    rivalTrails = [];

    for (let i = 0; i < NUM_RIVALS; i++) {
      const rivalSprite = new PIXI.Graphics();
      setupPlayerHead(rivalSprite, RIVAL_COLOR);
      world.addChild(rivalSprite);

      const rival = {
        x: 200 + i * 150,
        y: ((i - NUM_RIVALS / 2) * 100),
        vy: 0,
        lastMoveDirection: 0, // Track last Y movement direction
        sprite: rivalSprite,
      };

      rivals.push(rival);
      rivalTrails.push([new PIXI.Point(rival.x, rival.y)]);
    }

    obstacles = [];
    obstacleContainer.removeChildren();
    cameraX = 0;
    slipstreamGauge = 0;
    slipstreamActive = false;
    lastObstacleX = -2000;
    obstacleDifficulty = 0;

    updateLivesUI();

    gameState = "playing";
  }

  function endGame() {
    if (gameState === "gameOver") return;
    gameState = "gameOver";
    gameOverOverlay.style.display = "flex";
  }

  function restartGame() {
    gameState = "splash";
    splashScreenElement.style.display = "flex";
    gameOverOverlay.style.display = "none";
  }

  function togglePause() {
    if (gameState === "gameOver" || gameState === "splash") return;

    if (gameState === "paused") {
      gameState = "playing";
      pauseOverlay.style.display = "none";
    } else {
      gameState = "paused";
      pauseOverlay.style.display = "flex";
    }
  }

  // --- Input Handling ---

  const PAUSE_AREA_HEIGHT = 80;

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  app.stage.on("pointerdown", (event) => {
    if (gameState === "splash") {
      startGame();
      return;
    }

    if (gameState === "paused") {
      togglePause();
      return;
    }

    if (gameState === "gameOver") {
      restartGame();
      return;
    }

    if (event.global.y < PAUSE_AREA_HEIGHT && activeTouches === 0) {
      togglePause();
      return;
    }

    if (gameState === "playing") {
      activeTouches++;
      if (event.global.x < window.innerWidth / 2) {
        keys["touchLeft"] = true;
      } else {
        keys["touchRight"] = true;
      }
    }
  });

  app.stage.on("pointerup", (event) => {
    activeTouches = Math.max(0, activeTouches - 1);
    if (event.global.x < window.innerWidth / 2) {
      keys["touchLeft"] = false;
    } else {
      keys["touchRight"] = false;
    }
    if (activeTouches === 0) {
      keys["touchLeft"] = false;
      keys["touchRight"] = false;
    }
  });

  app.stage.on("pointerupoutside", () => {
    activeTouches = Math.max(0, activeTouches - 1);
    if (activeTouches === 0) {
      keys["touchLeft"] = false;
      keys["touchRight"] = false;
    }
  });

  window.addEventListener("keydown", (e) => {
    if (gameState === "splash" && e.code === "Space") {
      e.preventDefault();
      startGame();
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      togglePause();
      return;
    }
    keys[e.code] = true;
    if (gameState === "gameOver" && e.code === "Space") {
      restartGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  window.addEventListener("resize", repositionUI);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- Game Loop ---

  app.ticker.add((ticker) => {
    const delta = ticker.deltaTime;

    if (gameState !== "playing") {
      return;
    }

    // --- Input Processing ---
    const up = keys["ArrowUp"] || keys["KeyW"] || (activeTouches > 0 && keys["touchLeft"]);
    const down = keys["ArrowDown"] || keys["KeyS"] || (activeTouches > 0 && keys["touchRight"]);
    const boost = keys["Space"] || (keys["touchLeft"] && keys["touchRight"]);

    if (boost && slipstreamActive) {
      activateSlipstream();
    }

    // --- Player Physics ---
    // FAQ: "Your line's slope when moving up or down will be the same no matter how fast you are going"
    // The slope is CAPPED at 45°, but accelerates smoothly to reach it

    const isTurning = up || down;

    // Apply acceleration with inertia
    if (up) {
      player.vy -= PLAYER_ACCEL_Y * delta;
      player.lastMoveDirection = -1;
    } else if (down) {
      player.vy += PLAYER_ACCEL_Y * delta;
      player.lastMoveDirection = 1;
    } else {
      // Return to horizontal when not turning (drift)
      player.vy *= Math.pow(PLAYER_FRICTION_Y, delta);
    }

    // Clamp to 45° max slope (vy cannot exceed current speed)
    player.vy = Math.max(-player.currentSpeed, Math.min(player.currentSpeed, player.vy));

    // Apply speed penalty when turning (FAQ: "Moving up or down will cause you to lose a little bit of speed")
    if (isTurning) {
      player.currentSpeed *= Math.pow(TURNING_SPEED_PENALTY, delta);
    }

    // Update position
    player.x += player.currentSpeed * delta;
    const oldY = player.y;
    player.y += player.vy * delta;

    // Continuous push from rival trails based on last movement direction
    for (const trail of rivalTrails) {
      if (isCollidingWithTrail(player, trail)) {
        // Always push in last movement direction (even if currently stationary)
        const pushAmount = 3 * delta; // Continuous push force

        if (player.lastMoveDirection !== 0) {
          player.y += player.lastMoveDirection * pushAmount;
        } else {
          // No previous movement - push back to old position
          player.y = oldY;
        }
        break;
      }
    }

    // Check player-to-rival collision (push apart when too close)
    for (const rival of rivals) {
      const dx = player.x - rival.x;
      const dy = player.y - rival.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RIVAL_SPACING && dist > 0) {
        // Too close! Push player in the direction they were moving
        const pushStrength = (RIVAL_SPACING - dist) * 0.4;

        // Push in Y direction based on player's current velocity direction
        if (Math.abs(player.vy) > 0.1) {
          player.y += Math.sign(player.vy) * pushStrength;
        } else {
          // If not moving, push away from rival
          player.y += (dy / dist) * pushStrength;
        }
      }
    }

    // Update camera based on player's actual position
    cameraX = player.x - 100; // Keep player slightly left of center

    // --- Rival Physics (Using same physics as player) ---

    rivals.forEach((rival, i) => {
      // AI: Look ahead for obstacles and navigate
      let targetY = Math.sin(rival.x * 0.008 + i) * (WORLD_HEIGHT * 0.3); // Default sine wave

      // Look ahead for obstacles and find the gap
      const lookAheadDist = 300;
      let gapFound = false;

      for (const obs of obstacles) {
        if (!obs.isWall) continue;

        // Check if obstacle is ahead
        if (obs.x > rival.x && obs.x < rival.x + lookAheadDist) {
          if (obs.wallBounds) {
            // Rectangular wall - determine if it's top or bottom
            const bounds = obs.wallBounds;
            const worldY = obs.y + bounds.y;

            if (worldY < 0) {
              // Top wall - navigate toward bottom half (positive Y)
              targetY = 50 + (i - NUM_RIVALS / 2) * TRAIL_WIDTH * 2;
              gapFound = true;
            } else {
              // Bottom wall - navigate toward top half (negative Y)
              targetY = -50 + (i - NUM_RIVALS / 2) * TRAIL_WIDTH * 2;
              gapFound = true;
            }
          } else if (obs.isDiagonal) {
            // Diagonal wall - aim for the gap center with slight offset per rival
            targetY = obs.centerY + (i - NUM_RIVALS / 2) * TRAIL_WIDTH * 2;
            gapFound = true;
          }
        }
      }

      const yDiff = targetY - rival.y;

      // Apply acceleration toward target
      if (yDiff > 10) {
        rival.vy += PLAYER_ACCEL_Y * delta * 0.8;
        rival.lastMoveDirection = 1;
      } else if (yDiff < -10) {
        rival.vy -= PLAYER_ACCEL_Y * delta * 0.8;
        rival.lastMoveDirection = -1;
      } else {
        // Apply friction when not turning
        rival.vy *= Math.pow(PLAYER_FRICTION_Y, delta);
      }

      // Clamp to fixed 45° slope
      rival.vy = Math.max(-PLAYER_BASE_SPEED, Math.min(PLAYER_BASE_SPEED, rival.vy));

      // Check if rival is in penalty (stopped)
      if (rival.penaltyTimer) {
        rival.penaltyTimer -= delta * (1000 / 60); // Convert to ms
        rival.sprite.alpha = 0.3; // Semi-transparent during penalty

        if (rival.penaltyTimer <= 0) {
          // End penalty
          rival.penaltyTimer = null;
          rival.sprite.alpha = 1;
        }
        // DO NOT MOVE during penalty - just skip this frame
        return;
      }

      // Check collision with obstacles BEFORE moving - pixel-based check
      const nextX = rival.x + PLAYER_BASE_SPEED * delta;
      const nextY = rival.y + rival.vy * delta;

      const headX = nextX + TRAIL_WIDTH; // Front of bike
      const headY = nextY;

      const aboutToHitObstacle = isRedPixelAt(headX, headY) ||
                                  isRedPixelAt(headX + 2, headY + 2) ||
                                  isRedPixelAt(headX + 2, headY - 2);

      // If about to hit obstacle, apply penalty
      if (aboutToHitObstacle) {
        rival.penaltyTimer = RIVAL_PENALTY_TIME; // 200ms penalty
        rival.sprite.alpha = 0.3; // Immediately show penalty
        return; // Don't move this frame
      }

      // Update position
      rival.x += PLAYER_BASE_SPEED * delta;
      const oldRivalY = rival.y;
      rival.y += rival.vy * delta;

      // Continuous push from player trail based on last movement direction
      if (isCollidingWithTrail(rival, trailPoints)) {
        const pushAmount = 3 * delta;
        if (rival.lastMoveDirection !== 0) {
          rival.y += rival.lastMoveDirection * pushAmount;
        } else {
          rival.y = oldRivalY;
        }
      }

      // Keep within bounds
      rival.y = Math.max(-WORLD_HEIGHT / 2 + 50, Math.min(WORLD_HEIGHT / 2 - 50, rival.y));

      // Update trail
      const trail = rivalTrails[i];
      if (
        trail.length === 0 ||
        (rival.x - trail.at(-1).x) ** 2 + (rival.y - trail.at(-1).y) ** 2 > (TRAIL_WIDTH / 2) ** 2
      ) {
        trail.push(new PIXI.Point(rival.x, rival.y));
        if (trail.length > TRAIL_HISTORY) {
          trail.shift();
        }
      }
    });

    // --- Update Player Trail ---

    if (
      trailPoints.length === 0 ||
      (player.x - trailPoints.at(-1).x) ** 2 + (player.y - trailPoints.at(-1).y) ** 2 > (TRAIL_WIDTH / 2) ** 2
    ) {
      trailPoints.push(new PIXI.Point(player.x, player.y));
      if (trailPoints.length > TRAIL_HISTORY) {
        trailPoints.shift();
      }
    }

    // --- Update Mechanics ---

    updateSlipstream(delta);
    updateObstacles();
    checkCollisions();

    if (gameState !== "playing") return;

    // --- Rendering ---

    // Update sprites
    playerSprite.position.set(player.x, player.y);

    // Visual feedback for slipstream - vignette effect
    if (vignetteElement) {
      vignetteElement.classList.remove("slipstream", "active");
      if (slipstreamActive) {
        vignetteElement.classList.add("slipstream", "active");
      }
    }

    // Player tint for invincibility
    if (player.invincibilityTimer > 0) {
      playerSprite.alpha = Math.floor(player.invincibilityTimer / 5) % 2 === 0 ? 0.5 : 1.0; // Flashing
    } else {
      playerSprite.alpha = 1.0;
    }

    rivals.forEach((rival) => {
      rival.sprite.position.set(rival.x, rival.y);
    });

    // Camera follows player (horizontal scroll only)
    world.pivot.set(cameraX, 0);
    world.position.set(0, app.screen.height / 2);

    drawTrails();
    updateSlipstreamUI();
  });

  // --- Initial Setup ---

  setupUI();
  repositionUI();

  splashScreenElement.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    e.preventDefault();
    startGame();
  });

  pauseOverlay.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    e.preventDefault();
    togglePause();
  });

  gameOverOverlay.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    e.preventDefault();
    restartGame();
  });
})();
