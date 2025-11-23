(async () => {
  // --- Game Configuration ---
  const PLAYER_SPEED = 4.6;
  const PLAYER_TRAIL_HISTORY = Infinity;
  const TURN_SPEED = 0.05;
  const TRAIL_WIDTH = 6;
  const GRID_SIZE = 50;
  const COLLISION_GRACE_DISTANCE = 30;
  const WORLD_BOUNDS = 1500;
  const SEGMENTFADE_DELTA = 0.01;

  const DOTS_PER_LEVEL = 5;
  const DOT_SIZE = 10;
  const DOT_PICKUP_RADIUS = 30;
  const DOT_COLOR = 0xffffff;

  const PLAYER_COLOR = 0x00ffff; // Cyan
  const TRAIL_COLOR = 0x00ffff;
  const FADING_TRAIL_COLOR = 0x586e75; // A muted gray-blue from Solarized palette

  const ENEMY_COLOR = 0xff8000; // Orange
  const ENEMY_TRAIL_COLOR = 0xff8000;

  const GRID_COLOR = 0x40406a;

  // --- New Feature Configuration ---
  const GRIND_BOOST_MULTIPLIER = 1.2;
  const GRIND_MAX_DISTANCE = 25;
  const GRIND_ANGLE_THRESHOLD = Math.cos(Math.PI * (10 / 180));
  const GRIND_PARTICLE_COLOR = 0xffff00;
  const SCREEN_SHAKE_AMOUNT = 2;
  const GRIND_PARTICLE_COUNT = 3;

  const POWERUP_SPAWN_INTERVAL = 15000; // ms
  const POWERUP_SIZE = 12;
  const POWERUP_S_BOOST = 1.3;
  const POWERUP_S_DURATION = 5 * 60;
  const POWERUP_T_BOOST = 3.0;
  const POWERUP_T_DURATION = 0.5 * 60;
  const POWERUP_S_COLOR = 0x00ff00;
  const POWERUP_T_COLOR = 0xff00ff;

  const PARTICLE_LIFETIME = 40; // frames
  const EXPLOSION_PARTICLE_COUNT = 150;
  const BOOST_SPEED_PARTICLE_COUNT = 1;
  const BOOST_TURBO_PARTICLE_COUNT = 4;

  // --- AI Configuration ---
  const AI_WHISKER_ANGLES = [
    -Math.PI / 3,
    -Math.PI / 6,
    0,
    Math.PI / 6,
    Math.PI / 3,
  ];
  const AI_UPDATE_INTERVAL = 2;
  const AI_TRAIL_HISTORY = Infinity;
  const AI_WHISKER_SAFETY_MULTIPLIER = 1.2;
  const AI_WALL_AVOID_DISTANCE = 250;
  const AI_WALL_AVOID_STRENGTH = 2.0;
  const ENEMY_RESPAWN_DELAY = 3000; // ms

  // --- UI Configuration ---
  let MINIMAP_SIZE = 180;
  const MINIMAP_PADDING = 20;
  const UI_PADDING = 20;
  const FADE_DURATION = 30; // frames
  const PAUSE_AREA_HEIGHT = 80; // pixels from the top
  const MINIMAP_CAPTURE_RESOLUTION = 512;

  // --- PIXI App Setup ---
  const app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x05050a,
    antialias: true,
  });
  document.body.appendChild(app.view);

  // --- Game Objects ---
  const world = new PIXI.Container();
  app.stage.addChild(world);
  const grid = new PIXI.Graphics();
  world.addChild(grid);
  const trailGraphics = new PIXI.Graphics();
  world.addChild(trailGraphics);
  const enemyTrailGraphics = new PIXI.Graphics();
  world.addChild(enemyTrailGraphics);
  const particleContainer = new PIXI.Container();
  world.addChild(particleContainer);
  const powerupContainer = new PIXI.Container();
  world.addChild(powerupContainer);
  const dotContainer = new PIXI.Container();
  world.addChild(dotContainer);
  const playerSprite = new PIXI.Graphics();
  world.addChild(playerSprite);

  // --- UI Objects ---
  let enemyIndicator,
    powerupIndicator,
    dotCountText,
    screenFade,
    splashScreenElement;
  let dotIndicatorContainer;
  let minimapContainer,
    minimapBackground,
    minimapTrails,
    minimapPlayer,
    minimapEnemies,
    minimapPowerups,
    minimapDots,
    minimapDeaths;
  let pauseOverlay, gameOverOverlay;

  // --- Game State ---
  let player,
    enemies = [];
  let trailPoints,
    enemyTrails = [];
  let turning,
    keys = {};
  let gameState = "splash",
    playerScore,
    currentLevel;
  let particles = [];
  let powerups = [];
  let dots = [];
  let fadingTrails = [];
  let deathLocations = [];
  let powerupInterval;
  let vignetteElement;
  let transitionTimer = 0;
  let activeTouches = 0;
  let readyTimer;
  let levelMinimaps = [];
  let finalMinimapImage = null;

  function setupReadyUI() {
    readyText = new PIXI.Text({
      text: "GET READY!",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 48,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 5 },
        align: "center",
      }),
    });
    readyText.anchor.set(0.5);
    readyText.visible = false;
    app.stage.addChild(readyText);
  }

  function setupBike(sprite, color) {
    const triangleHeight = TRAIL_WIDTH * 1.8;
    const triangleHalfBase = TRAIL_WIDTH / 2;
    sprite.clear();
    sprite.beginFill(color);
    sprite.drawPolygon([
      new PIXI.Point(0, -triangleHeight / 2),
      new PIXI.Point(-triangleHalfBase, triangleHeight / 2),
      new PIXI.Point(triangleHalfBase, triangleHeight / 2),
    ]);
    sprite.endFill();
    sprite.tint = 0xffffff;
  }

  function setupEnemyIndicator() {
    enemyIndicator = new PIXI.Graphics();
    enemyIndicator.beginFill(ENEMY_COLOR);
    enemyIndicator.drawCircle(0, 0, 10);
    enemyIndicator.endFill();
    app.stage.addChild(enemyIndicator);
  }

  function setupDotIndicators() {
    dotIndicatorContainer = new PIXI.Container();
    app.stage.addChild(dotIndicatorContainer);
    for (let i = 0; i < DOTS_PER_LEVEL; i++) {
      const indicator = new PIXI.Graphics();
      indicator.beginFill(DOT_COLOR);
      indicator.drawCircle(0, 0, 5);
      indicator.endFill();
      indicator.visible = false;
      dotIndicatorContainer.addChild(indicator);
    }
  }

  function setupDotCountUI() {
    dotCountText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 32,
        fontWeight: "bold",
        fill: 0xffffff,
        align: "left",
        stroke: { color: 0x000000, width: 4 },
      }),
    });
    dotCountText.anchor.set(0, 0);
    app.stage.addChild(dotCountText);
  }

  function updateDotCountUI() {
    const dotsRemaining = DOTS_PER_LEVEL - playerScore;
    dotCountText.text = `${dotsRemaining}`;
  }

  function showGameOverUI() {
    document.getElementById("level-text").textContent =
      `You reached level ${currentLevel}`;
    gameOverOverlay.style.display = "flex";

    if (finalMinimapImage) {
      const gameOverDOMContainer = document.createElement("div");
      gameOverDOMContainer.id = "gameOverDOMContainer";
      gameOverDOMContainer.style.textAlign = "center";
      gameOverDOMContainer.style.marginTop = "20px";

      const image = new Image();
      image.src = finalMinimapImage;
      image.style.width = "100%";
      image.style.maxWidth = "300px";
      image.style.marginBottom = "20px";
      image.style.background = "rgba(0, 0, 0, 0.7)";
      image.style.padding = "10px";
      image.style.border = "2px solid #00FFFF";

      const link = document.createElement("a");
      link.href = finalMinimapImage;
      link.download = "flux-mosaic.png";
      link.textContent = "Save Your Journey";
      link.style.display = "block";
      link.style.color = "#00FFFF";
      link.style.textDecoration = "none";
      link.style.fontSize = "18px";

      gameOverDOMContainer.appendChild(image);
      gameOverDOMContainer.appendChild(link);
      gameOverOverlay.appendChild(gameOverDOMContainer);

      gameOverDOMContainer.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });
    }
  }

  function setupPowerupUI() {
    powerupIndicator = new PIXI.Container();
    powerupIndicator.visible = false;
    app.stage.addChild(powerupIndicator);
  }

  function updatePowerupUI() {
    powerupIndicator.removeChildren();
    if (!player.powerup) {
      powerupIndicator.visible = false;
      return;
    }
    powerupIndicator.visible = true;
    const type = player.powerup;
    const color = type === "S" ? POWERUP_S_COLOR : POWERUP_T_COLOR;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x101010, 0.8);
    bg.lineStyle(3, color);
    bg.drawCircle(0, 0, POWERUP_SIZE * 1.5);
    bg.endFill();
    const text = new PIXI.Text({
      text: type,
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 20,
        fontWeight: "bold",
        fill: color,
      }),
    });
    text.anchor.set(0.5);
    powerupIndicator.addChild(bg, text);
  }

  function setupMinimap() {
    minimapContainer = new PIXI.Container();
    minimapBackground = new PIXI.Graphics();
    minimapContainer.addChild(minimapBackground);
    minimapDeaths = new PIXI.Graphics();
    minimapContainer.addChild(minimapDeaths);
    minimapDots = new PIXI.Graphics();
    minimapContainer.addChild(minimapDots);
    minimapPowerups = new PIXI.Graphics();
    minimapContainer.addChild(minimapPowerups);
    minimapTrails = new PIXI.Graphics();
    minimapContainer.addChild(minimapTrails);
    minimapPlayer = new PIXI.Graphics();
    minimapContainer.addChild(minimapPlayer);
    minimapEnemies = new PIXI.Container();
    minimapContainer.addChild(minimapEnemies);
    app.stage.addChild(minimapContainer);
  }

  function updateMinimap(isCapture = false) {
    const size = isCapture ? MINIMAP_CAPTURE_RESOLUTION : MINIMAP_SIZE;
    const scale = size / (WORLD_BOUNDS * 2);
    const strokeWidth = isCapture ? 2.5 : 1.5;

    minimapBackground.clear();
    minimapBackground.beginFill(0x010101, 0.7);
    minimapBackground.lineStyle(1, 0x30304a);
    minimapBackground.drawRect(0, 0, size, size);
    minimapBackground.endFill();

    const transformX = (worldX) => (worldX + WORLD_BOUNDS) * scale;
    const transformY = (worldY) => (worldY + WORLD_BOUNDS) * scale;

    minimapTrails.clear();

    if (trailPoints.length > 1) {
      minimapTrails.moveTo(
        transformX(trailPoints[0].x),
        transformY(trailPoints[0].y),
      );
      for (let i = 1; i < trailPoints.length; i++)
        minimapTrails.lineTo(
          transformX(trailPoints[i].x),
          transformY(trailPoints[i].y),
        );
      minimapTrails.stroke({ width: strokeWidth, color: PLAYER_COLOR });
    }

    enemyTrails.forEach((trail) => {
      if (trail && trail.length > 1) {
        minimapTrails.moveTo(transformX(trail[0].x), transformY(trail[0].y));
        for (let j = 1; j < trail.length; j++) {
          minimapTrails.lineTo(transformX(trail[j].x), transformY(trail[j].y));
        }
        minimapTrails.stroke({ width: strokeWidth, color: ENEMY_COLOR });
      }
    });

    fadingTrails.forEach((trailItem) => {
      const trail = trailItem.trail; // Get the actual trail array
      if (trail && trail.length > 1) {
        minimapTrails.moveTo(transformX(trail[0].x), transformY(trail[0].y));
        for (let j = 1; j < trail.length; j++) {
          minimapTrails.lineTo(transformX(trail[j].x), transformY(trail[j].y));
        }

        // Apply alpha if the *fading* trail is a phantom
        const alpha = trailItem.isPhantom ? 0.4 : 1.0;

        minimapTrails.stroke({
          width: strokeWidth,
          color: FADING_TRAIL_COLOR,
          alpha: alpha, // Set alpha
        });
      }
    });

    minimapPowerups.clear();
    for (const p of powerups) {
      const color = p.type === "S" ? POWERUP_S_COLOR : POWERUP_T_COLOR;
      minimapPowerups.beginFill(color);
      minimapPowerups.drawCircle(
        transformX(p.x),
        transformY(p.y),
        2.5 * (isCapture ? 2 : 1),
      );
      minimapPowerups.endFill();
    }

    minimapDots.clear();
    for (const d of dots) {
      minimapDots.beginFill(DOT_COLOR);
      minimapDots.drawCircle(
        transformX(d.x),
        transformY(d.y),
        2.0 * (isCapture ? 2 : 1),
      );
      minimapDots.endFill();
    }

    minimapDeaths.clear();
    if (isCapture) {
      for (const loc of deathLocations) {
        const x = transformX(loc.x);
        const y = transformY(loc.y);
        const markerSize = 12;
        minimapDeaths.moveTo(x - markerSize, y).lineTo(x + markerSize, y);
        minimapDeaths.moveTo(x, y - markerSize).lineTo(x, y + markerSize);
      }
      minimapDeaths.stroke({ width: 3, color: ENEMY_COLOR });
    }

    const playerMarkerSize = isCapture ? 8 : 4;
    minimapPlayer.clear();
    minimapPlayer.beginFill(PLAYER_COLOR);
    minimapPlayer.drawRect(
      -playerMarkerSize / 2,
      -playerMarkerSize / 2,
      playerMarkerSize,
      playerMarkerSize,
    );
    minimapPlayer.endFill();
    minimapPlayer.x = transformX(player.x);
    minimapPlayer.y = transformY(player.y);

    const enemyMarkerSize = isCapture ? 8 : 4;
    minimapEnemies.children.forEach((c) => (c.visible = false));
    enemies.forEach((enemy, i) => {
      if (enemy) {
        const sprite = minimapEnemies.children[i];
        if (sprite) {
          sprite.clear();
          sprite.beginFill(ENEMY_COLOR);
          sprite.drawRect(
            -enemyMarkerSize / 2,
            -enemyMarkerSize / 2,
            enemyMarkerSize,
            enemyMarkerSize,
          );
          sprite.endFill();
          sprite.x = transformX(enemy.x);
          sprite.y = transformY(enemy.y);
          sprite.visible = true;
        }
      }
    });
  }

  function repositionUI() {
    const screenWidth = app.screen.width;
    const screenHeight = app.screen.height;
    const smallerDimension = Math.min(screenWidth, screenHeight);

    if (readyText) {
      readyText.style.fontSize = Math.max(32, screenWidth * 0.08);
      readyText.x = screenWidth / 2;
      readyText.y = screenHeight / 2;
    }

    powerupIndicator.x = 30;
    powerupIndicator.y = screenHeight - 50;

    if (dotCountText) {
      dotCountText.style.fontSize = 20; //Math.min(16, smallerDimension * 0.07);
      dotCountText.x = UI_PADDING;
      dotCountText.y = UI_PADDING;
    }

    if (screenFade) {
      screenFade.width = screenWidth;
      screenFade.height = screenHeight;
    }

    if (minimapContainer) {
      MINIMAP_SIZE = smallerDimension / 4;
      minimapContainer.x = screenWidth - MINIMAP_SIZE - MINIMAP_PADDING;
      minimapContainer.y = MINIMAP_PADDING;
    }
  }

  function spawnPowerup() {
    if (powerups.length >= 5) return;
    const type = Math.random() < 0.5 ? "S" : "T";
    const color = type === "S" ? POWERUP_S_COLOR : POWERUP_T_COLOR;
    const powerup = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.beginFill(0x101010);
    bg.lineStyle(2, color);
    bg.drawCircle(0, 0, POWERUP_SIZE);
    bg.endFill();
    const text = new PIXI.Text({
      text: type,
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 14,
        fontWeight: "bold",
        fill: color,
      }),
    });
    text.anchor.set(0.5);
    powerup.addChild(bg, text);
    powerup.x = (Math.random() - 0.5) * WORLD_BOUNDS * 1.8;
    powerup.y = (Math.random() - 0.5) * WORLD_BOUNDS * 1.8;
    powerup.type = type;
    powerups.push(powerup);
    powerupContainer.addChild(powerup);
  }

  function spawnDot() {
    const dot = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(DOT_COLOR);
    g.drawCircle(0, 0, DOT_SIZE);
    g.endFill();

    const text = new PIXI.Text({
      text: "!",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: 14,
        fill: 0x000000,
        fontWeight: "bold",
      }),
    });
    text.anchor.set(0.5);

    dot.addChild(g, text);

    do {
      dot.x = (Math.random() - 0.5) * WORLD_BOUNDS * 1.8;
      dot.y = (Math.random() - 0.5) * WORLD_BOUNDS * 1.8;
    } while (dot.x ** 2 + dot.y ** 2 < (DOT_PICKUP_RADIUS * 3) ** 2);

    dots.push(dot);
    dotContainer.addChild(dot);
  }

  function spawnSingleEnemy() {
    if (gameState !== "playing" && gameState !== "levelTransition") return;

    const enemySprite = new PIXI.Graphics();
    setupBike(enemySprite, ENEMY_COLOR);
    enemySprite.alpha = 0.5; // Set initial phantom alpha
    world.addChild(enemySprite);

    const startPos = {
      x: (Math.random() - 0.5) * WORLD_BOUNDS,
      y: (Math.random() - 0.5) * WORLD_BOUNDS,
    };

    const enemy = {
      x: startPos.x,
      y: startPos.y,
      angle: Math.random() * Math.PI * 2,
      turning: 0,
      aiUpdateCooldown: 0,
      isGrinding: false,
      speedBoost: null,
      powerup: null,
      aiTurnBias: 0,
      aiBiasCooldown: Math.random() * 120,
      sprite: enemySprite,
      isPhantom: true, // Add phantom state
      phantomTimer: null, // Placeholder for the timer
    };

    // Timer to remove phantom state
    const phantomTimer = setTimeout(() => {
      if (enemy) {
        // Check if enemy still exists
        enemy.isPhantom = false;
        if (enemy.sprite) {
          enemy.sprite.alpha = 1.0; // Restore alpha
        }
        enemy.phantomTimer = null;
      }
    }, 3000); // 3 seconds

    enemy.phantomTimer = phantomTimer; // Store timer reference

    enemies.push(enemy);
    enemyTrails.push([new PIXI.Point(startPos.x, startPos.y)]);

    const minimapSprite = new PIXI.Graphics();
    minimapEnemies.addChild(minimapSprite);
  }

  function startLevel(levelNum) {
    player = {
      x: 0,
      y: 0,
      angle: 0,
      isGrinding: false,
      speedBoost: null,
      powerup: null,
    };
    player.sprite = playerSprite;
    playerSprite.alpha = 1;
    world.addChild(playerSprite);

    trailPoints = [new PIXI.Point(player.x, player.y)];
    turning = 0;
    playerScore = 0;
    updateDotCountUI();

    dotContainer.removeChildren();
    dots = [];
    for (let i = 0; i < DOTS_PER_LEVEL; i++) spawnDot();

    enemies.forEach((e) => e.sprite.destroy());
    enemies = [];
    enemyTrails = [];
    fadingTrails = [];
    deathLocations = [];
    minimapEnemies.removeChildren();
    trailGraphics.clear();
    enemyTrailGraphics.clear();

    const numEnemiesToSpawn = Math.min(levelNum, 6);
    for (let i = 0; i < numEnemiesToSpawn; i++) {
      const enemySprite = new PIXI.Graphics();
      setupBike(enemySprite, ENEMY_COLOR);
      enemySprite.alpha = 0.5; // Set initial phantom alpha
      world.addChild(enemySprite);

      const startPos = {
        x: (Math.random() - 0.5) * WORLD_BOUNDS,
        y: (Math.random() - 0.5) * WORLD_BOUNDS,
      };

      const enemy = {
        x: startPos.x,
        y: startPos.y,
        angle: Math.random() * Math.PI * 2,
        turning: 0,
        aiUpdateCooldown: 0,
        isGrinding: false,
        speedBoost: null,
        powerup: null,
        aiTurnBias: 0,
        aiBiasCooldown: Math.random() * 120,
        sprite: enemySprite,
        isPhantom: true, // Add phantom state
        phantomTimer: null, // Placeholder for the timer
      };

      // Timer to remove phantom state
      const phantomTimer = setTimeout(() => {
        if (enemy) {
          // Check if enemy still exists
          enemy.isPhantom = false;
          if (enemy.sprite) {
            enemy.sprite.alpha = 1.0; // Restore alpha
          }
          enemy.phantomTimer = null;
        }
      }, 3000); // 3 seconds

      enemy.phantomTimer = phantomTimer; // Store timer reference

      enemies.push(enemy);
      enemyTrails.push([new PIXI.Point(startPos.x, startPos.y)]);

      const minimapSprite = new PIXI.Graphics();
      minimapEnemies.addChild(minimapSprite);
    }
    updatePowerupUI();
  }

  function startGame() {
    if (gameState !== "splash") return;

    splashScreenElement.style.display = "none";

    currentLevel = 1;
    keys = {};
    activeTouches = 0;
    fadingTrails = [];
    deathLocations = [];
    vignetteElement = document.getElementById("grind-vignette");
    vignetteElement.classList.remove("grind", "speed", "turbo", "active");
    particleContainer.removeChildren();
    particles = [];
    powerupContainer.removeChildren();
    powerups = [];
    if (powerupInterval) clearInterval(powerupInterval);
    spawnPowerup();
    powerupInterval = setInterval(spawnPowerup, POWERUP_SPAWN_INTERVAL);
    enemyIndicator.visible = true;
    gameOverOverlay.style.display = "none";

    if (pauseOverlay.style.display === "flex") {
      togglePause();
    }

    setupBike(playerSprite, PLAYER_COLOR);
    startLevel(currentLevel);
    gameState = "levelReady";
    readyTimer = 60;
    readyText.visible = true;
  }

  function restartGame() {
    gameState = "splash";
    splashScreenElement.style.display = "flex";
    gameOverOverlay.style.display = "none";

    const gameOverDOMContainer = document.getElementById(
      "gameOverDOMContainer",
    );
    if (gameOverDOMContainer) {
      gameOverOverlay.removeChild(gameOverDOMContainer);
    }
    levelMinimaps.forEach((tex) => tex.destroy());
    levelMinimaps = [];
    finalMinimapImage = null;
  }

  function captureMinimap() {
    const renderTexture = PIXI.RenderTexture.create({
      width: MINIMAP_CAPTURE_RESOLUTION,
      height: MINIMAP_CAPTURE_RESOLUTION,
    });

    const originalPosition = minimapContainer.position.clone();
    minimapContainer.position.set(0, 0);

    updateMinimap(true);

    app.renderer.render({
      container: minimapContainer,
      target: renderTexture,
    });

    minimapContainer.position.copyFrom(originalPosition);
    updateMinimap(false);

    levelMinimaps.push(renderTexture);
  }

  function nextLevel() {
    captureMinimap();
    gameState = "levelTransition";
    transitionTimer = FADE_DURATION;
  }

  function togglePause() {
    if (
      gameState === "gameOver" ||
      gameState === "levelTransition" ||
      gameState === "splash"
    )
      return;

    if (gameState === "paused") {
      gameState = "playing";
      pauseOverlay.style.display = "none";
    } else {
      gameState = "paused";
      pauseOverlay.style.display = "flex";
    }
  }

  function handlePowerupActivation() {
    if (keys["Space"] || (keys["touchLeft"] && keys["touchRight"])) {
      activatePowerup(player);
      keys["Space"] = false;
    }
  }

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointerdown", (event) => {
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
      if (event.global.x < window.innerWidth / 2) keys["touchLeft"] = true;
      else keys["touchRight"] = true;
    }
  });

  app.stage.on("pointerup", (event) => {
    activeTouches = Math.max(0, activeTouches - 1);
    if (event.global.x < window.innerWidth / 2) keys["touchLeft"] = false;
    else keys["touchRight"] = false;
    if (activeTouches === 0) {
      keys["touchLeft"] = false;
      keys["touchRight"] = false;
    }
  });

  app.stage.on("pointerupoutside", (event) => {
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
    if (gameState === "gameOver" && e.code === "Space") restartGame();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  function drawGrid() {
    grid.clear();
    const worldDrawSize = WORLD_BOUNDS;
    for (let i = -worldDrawSize; i <= worldDrawSize; i += GRID_SIZE) {
      grid.moveTo(i, -worldDrawSize).lineTo(i, worldDrawSize);
      grid.moveTo(-worldDrawSize, i).lineTo(worldDrawSize, i);
    }
    grid.stroke({ width: 1, color: GRID_COLOR });
  }

  function drawTrails() {
    trailGraphics.clear();
    if (trailPoints.length > 1) {
      trailGraphics.moveTo(trailPoints[0].x, trailPoints[0].y);
      for (let i = 1; i < trailPoints.length; i++)
        trailGraphics.lineTo(trailPoints[i].x, trailPoints[i].y);
      trailGraphics.stroke({
        width: TRAIL_WIDTH,
        color: TRAIL_COLOR,
        cap: "round",
        join: "round",
      });
    }

    enemyTrailGraphics.clear();
    // MODIFIED: Iterate enemies to check phantom state for each trail
    enemies.forEach((enemy, i) => {
      const trail = enemyTrails[i];
      if (enemy && trail && trail.length >= 2) {
        enemyTrailGraphics.moveTo(trail[0].x, trail[0].y);
        for (let j = 1; j < trail.length; j++)
          enemyTrailGraphics.lineTo(trail[j].x, trail[j].y);

        const alpha = enemy.isPhantom ? 0.5 : 1.0; // Apply alpha

        enemyTrailGraphics.stroke({
          width: TRAIL_WIDTH,
          color: ENEMY_TRAIL_COLOR,
          alpha: alpha, // Set per-trail alpha
          cap: "round",
          join: "round",
        });
      }
    });

    fadingTrails.forEach((trailItem) => {
      const trail = trailItem.trail; // Get the actual trail array
      if (trail && trail.length >= 2) {
        enemyTrailGraphics.moveTo(trail[0].x, trail[0].y);
        for (let j = 1; j < trail.length; j++)
          enemyTrailGraphics.lineTo(trail[j].x, trail[j].y);

        // Apply alpha if the *fading* trail is a phantom
        const alpha = trailItem.isPhantom ? 0.4 : 1.0;

        enemyTrailGraphics.stroke({
          width: TRAIL_WIDTH,
          color: FADING_TRAIL_COLOR,
          alpha: alpha, // Set alpha
          cap: "round",
          join: "round",
        });
      }
    });
  }

  function createExplosion(x, y, color) {
    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      const particle = new PIXI.Graphics();
      particle.beginFill(color);
      particle.drawCircle(0, 0, Math.random() * 2 + 1);
      particle.endFill();
      particle.x = x;
      particle.y = y;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particles.push({
        sprite: particle,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: PARTICLE_LIFETIME * (Math.random() * 0.5 + 0.5),
        initialLife: PARTICLE_LIFETIME,
      });
      particleContainer.addChild(particle);
    }
  }

  function emitBoostParticle(bike) {
    if (!bike.speedBoost) return;
    const isTurbo = bike.speedBoost.multiplier === POWERUP_T_BOOST;
    const color = isTurbo ? POWERUP_T_COLOR : POWERUP_S_COLOR;
    const particleCount = isTurbo
      ? BOOST_TURBO_PARTICLE_COUNT
      : BOOST_SPEED_PARTICLE_COUNT;
    for (let i = 0; i < particleCount; i++) {
      const particle = new PIXI.Graphics();
      particle.beginFill(color);
      particle.drawCircle(0, 0, Math.random() * 1.5 + 1);
      particle.endFill();
      const backOffset = TRAIL_WIDTH * 1.5;
      particle.x = bike.x - Math.sin(bike.angle) * backOffset;
      particle.y = bike.y + Math.cos(bike.angle) * backOffset;
      const angle = bike.angle + (Math.random() - 0.5) * (Math.PI / 4);
      const speed = (isTurbo ? 4 : 2) + Math.random();
      particles.push({
        sprite: particle,
        vx: -Math.sin(angle) * speed,
        vy: Math.cos(angle) * speed,
        life: PARTICLE_LIFETIME / 3,
        initialLife: PARTICLE_LIFETIME / 3,
      });
      particleContainer.addChild(particle);
    }
  }

  function emitGrindParticle(bike, side) {
    for (let i = 0; i < GRIND_PARTICLE_COUNT; i++) {
      const perpAngle =
        bike.angle + (side === "left" ? Math.PI / 2 : -Math.PI / 2);
      const particle = new PIXI.Graphics();
      particle.beginFill(GRIND_PARTICLE_COLOR);
      particle.drawCircle(0, 0, Math.random() * 1.5 + 0.5);
      particle.endFill();
      particle.x = bike.x + (Math.sin(perpAngle) * TRAIL_WIDTH) / 2;
      particle.y = bike.y - (Math.cos(perpAngle) * TRAIL_WIDTH) / 2;
      particles.push({
        sprite: particle,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: PARTICLE_LIFETIME / 2,
        initialLife: PARTICLE_LIFETIME / 2,
      });
      particleContainer.addChild(particle);
    }
  }

  function updateParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        particleContainer.removeChild(p.sprite);
        p.sprite.destroy();
        particles.splice(i, 1);
      } else {
        p.sprite.x += p.vx * delta;
        p.sprite.y += p.vy * delta;
        p.sprite.alpha = p.life / p.initialLife;
      }
    }
  }

  function updateFadingTrails(delta) {
    const segmentsToRemove = Math.max(1, Math.floor(SEGMENTFADE_DELTA * delta));
    for (let i = fadingTrails.length - 1; i >= 0; i--) {
      // --- MODIFICATION ---
      // Was: const trail = fadingTrails[i];
      const trailItem = fadingTrails[i];
      const trail = trailItem.trail; // Get the actual array of points
      // --- END MODIFICATION ---

      for (let j = 0; j < segmentsToRemove && trail.length > 1; j++) {
        trail.shift();
      }
      if (trail.length < 2) {
        fadingTrails.splice(i, 1);
      }
    }
  }

  function getSafeTrail(bike, trail) {
    if (!trail) return [];
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      const distSq = (bike.x - p.x) ** 2 + (bike.y - p.y) ** 2;
      if (distSq > COLLISION_GRACE_DISTANCE ** 2) {
        return trail.slice(0, i + 1);
      }
    }
    return [];
  }

  function checkWallGrind(bike, allTrails) {
    bike.isGrinding = false;
    const bikeDirX = Math.sin(bike.angle);
    const bikeDirY = -Math.cos(bike.angle);
    for (const trail of allTrails) {
      if (!trail) continue;
      for (let i = trail.length - 2; i >= 0; i--) {
        const p1 = trail[i];
        const p2 = trail[i + 1];
        const distSq = pointToSegmentDistanceSq(bike, p1, p2);

        if (
          distSq > (TRAIL_WIDTH / 2) ** 2 &&
          distSq < GRIND_MAX_DISTANCE ** 2
        ) {
          const segX = p2.x - p1.x;
          const segY = p2.y - p1.y;
          const segLen = Math.sqrt(segX * segX + segY * segY);
          if (segLen < 1) continue;
          const trailDirX = segX / segLen;
          const trailDirY = segY / segLen;
          const parallelDot = bikeDirX * trailDirX + bikeDirY * trailDirY;

          if (Math.abs(parallelDot) > GRIND_ANGLE_THRESHOLD) {
            bike.isGrinding = true;
            const crossZ =
              bikeDirX * (p1.y - bike.y) - bikeDirY * (p1.x - bike.x);
            bike.grindingSide = crossZ > 0 ? "left" : "right";
            return;
          }
        }
      }
    }
  }

  function activatePowerup(bike) {
    if (!bike || !bike.powerup) return;
    if (bike.powerup === "S") {
      bike.speedBoost = {
        multiplier: POWERUP_S_BOOST,
        duration: POWERUP_S_DURATION,
      };
    } else if (bike.powerup === "T") {
      bike.speedBoost = {
        multiplier: POWERUP_T_BOOST,
        duration: POWERUP_T_DURATION,
      };
    }
    bike.powerup = null;
    if (bike === player) updatePowerupUI();
  }

  function pointToSegmentDistanceSq(point, segP1, segP2) {
    const segX = segP2.x - segP1.x;
    const segY = segP2.y - segP1.y;
    const pointToP1X = segP1.x - point.x;
    const pointToP1Y = segP1.y - point.y;

    const segLenSq = segX * segX + segY * segY;
    if (segLenSq === 0)
      return (point.x - segP1.x) ** 2 + (point.y - segP1.y) ** 2;

    const t = Math.max(
      0,
      Math.min(1, (-pointToP1X * segX - pointToP1Y * segY) / segLenSq),
    );
    const closestX = segP1.x + t * segX;
    const closestY = segP1.y + t * segY;

    return (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
  }

  function isBikeCollidingWithTrail(bike, trail) {
    if (!trail || trail.length < 2) return false;
    for (let i = 0; i < trail.length - 1; i++) {
      const distSq = pointToSegmentDistanceSq(bike, trail[i], trail[i + 1]);
      if (distSq < (TRAIL_WIDTH / 2) ** 2) {
        return true;
      }
    }
    return false;
  }

  function isPointColliding(point, allTrails) {
    if (Math.abs(point.x) > WORLD_BOUNDS || Math.abs(point.y) > WORLD_BOUNDS) {
      return true;
    }
    for (const trail of allTrails) {
      if (!trail || trail.length < 2) continue;
      for (let i = 0; i < trail.length - 1; i++) {
        const distSq = pointToSegmentDistanceSq(point, trail[i], trail[i + 1]);
        if (distSq < TRAIL_WIDTH ** 2) {
          return true;
        }
      }
    }
    return false;
  }

  function getAIInput(enemy, enemyTrail) {
    if (enemy.powerup === "T") activatePowerup(enemy);

    const speedMultiplier =
      (enemy.speedBoost ? enemy.speedBoost.multiplier : 1) *
      (enemy.isGrinding ? GRIND_BOOST_MULTIPLIER : 1);
    const currentSpeed = PLAYER_SPEED * speedMultiplier;

    const turnRadius = currentSpeed / TURN_SPEED;
    const reactionDistance = currentSpeed * AI_UPDATE_INTERVAL;
    const whiskerLength =
      (turnRadius + reactionDistance) * AI_WHISKER_SAFETY_MULTIPLIER;

    const myIndex = enemies.indexOf(enemy);
    const safeEnemyTrail = getSafeTrail(enemy, enemyTrail);

    const allTrailsForAI = [getSafeTrail(player, trailPoints)];
    enemyTrails.forEach((trail, i) => {
      if (i === myIndex) {
        allTrailsForAI.push(safeEnemyTrail);
      } else if (enemies[i]) {
        allTrailsForAI.push(getSafeTrail(enemies[i], trail));
      }
    });

    const whiskerPoints = AI_WHISKER_ANGLES.map((angle) => ({
      x: enemy.x + Math.sin(enemy.angle + angle) * whiskerLength,
      y: enemy.y - Math.cos(enemy.angle + angle) * whiskerLength,
    }));

    const blocked = whiskerPoints.map((p) =>
      isPointColliding(p, allTrailsForAI),
    );
    const [farLeft, nearLeft, center, nearRight, farRight] = blocked;

    if (center) {
      if (!nearLeft && !farLeft) return -1;
      if (!nearRight && !farRight) return 1;
      return enemy.aiTurnBias > 0 ? 1 : -1;
    }

    let turn = 0;
    if (nearLeft) turn += 0.5;
    if (farLeft) turn += 0.5;
    if (nearRight) turn -= 0.5;
    if (farRight) turn -= 0.5;

    let wallTurn = 0;
    const dirX = Math.sin(enemy.angle);
    const dirY = -Math.cos(enemy.angle);

    let xProximity = 0;
    if (dirX > 0)
      xProximity =
        (enemy.x - (WORLD_BOUNDS - AI_WALL_AVOID_DISTANCE)) /
        AI_WALL_AVOID_DISTANCE;
    else if (dirX < 0)
      xProximity =
        (-WORLD_BOUNDS + AI_WALL_AVOID_DISTANCE - enemy.x) /
        AI_WALL_AVOID_DISTANCE;

    let yProximity = 0;
    if (dirY > 0)
      yProximity =
        (enemy.y - (WORLD_BOUNDS - AI_WALL_AVOID_DISTANCE)) /
        AI_WALL_AVOID_DISTANCE;
    else if (dirY < 0)
      yProximity =
        (-WORLD_BOUNDS + AI_WALL_AVOID_DISTANCE - enemy.y) /
        AI_WALL_AVOID_DISTANCE;

    xProximity = Math.max(0, xProximity);
    yProximity = Math.max(0, yProximity);

    if (xProximity > yProximity && xProximity > 0) {
      wallTurn =
        -Math.sign(dirX) * AI_WALL_AVOID_STRENGTH * xProximity * xProximity;
    } else if (yProximity > 0) {
      wallTurn =
        -Math.sign(dirY) * AI_WALL_AVOID_STRENGTH * yProximity * yProximity;
    }

    const finalTurn = turn + wallTurn + enemy.aiTurnBias;
    return Math.max(-1, Math.min(1, finalTurn));
  }

  function updateEnemyIndicator() {
    const offscreenEnemies = enemies.filter((enemy) => {
      if (!enemy) return false;
      const screenPos = world.toGlobal(enemy);
      return (
        screenPos.x < 0 ||
        screenPos.x > app.screen.width ||
        screenPos.y < 0 ||
        screenPos.y > app.screen.height
      );
    });

    if (offscreenEnemies.length === 0) {
      enemyIndicator.visible = false;
      return;
    }

    let closestDistSq = Infinity;
    let closestEnemy = null;
    for (const enemy of offscreenEnemies) {
      const distSq = (player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestEnemy = enemy;
      }
    }

    if (closestEnemy) {
      enemyIndicator.visible = true;
      const dx = closestEnemy.x - player.x;
      const dy = closestEnemy.y - player.y;
      const angle = -player.angle;
      const screenDx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const screenDy = dx * Math.sin(angle) + dy * Math.cos(angle);
      const indicatorAngle = Math.atan2(screenDy, screenDx);
      const padding = 15;
      const screenCenterX = app.screen.width / 2;
      const screenCenterY = app.screen.height / 2;
      const halfW = screenCenterX - padding;
      const halfH = screenCenterY - padding;
      const tanAngle = Math.tan(indicatorAngle);
      if (Math.abs(halfH / tanAngle) > halfW) {
        enemyIndicator.x = screenCenterX + halfW * Math.sign(screenDx);
        enemyIndicator.y =
          screenCenterY + halfW * tanAngle * Math.sign(screenDx);
      } else {
        enemyIndicator.x =
          screenCenterX + (halfH / tanAngle) * Math.sign(screenDy);
        enemyIndicator.y = screenCenterY + halfH * Math.sign(screenDy);
      }
    }
  }

  function updateDotIndicators() {
    dotIndicatorContainer.children.forEach((c) => (c.visible = false));
    let indicatorIndex = 0;

    const padding = 5;
    const screenCenterX = app.screen.width / 2;
    const screenCenterY = app.screen.height / 2;
    const halfW = screenCenterX - padding;
    const halfH = screenCenterY - padding;

    for (const dot of dots) {
      const screenPos = world.toGlobal(dot);
      const isOffscreen =
        screenPos.x < 0 ||
        screenPos.x > app.screen.width ||
        screenPos.y < 0 ||
        screenPos.y > app.screen.height;

      if (
        isOffscreen &&
        indicatorIndex < dotIndicatorContainer.children.length
      ) {
        const indicator = dotIndicatorContainer.children[indicatorIndex];
        indicator.visible = true;

        const dx = dot.x - player.x;
        const dy = dot.y - player.y;
        const playerAngle = -player.angle;
        const screenDx =
          dx * Math.cos(playerAngle) - dy * Math.sin(playerAngle);
        const screenDy =
          dx * Math.sin(playerAngle) + dy * Math.cos(playerAngle);
        const indicatorAngle = Math.atan2(screenDy, screenDx);

        const tanAngle = Math.tan(indicatorAngle);
        if (Math.abs(halfH / tanAngle) > halfW) {
          indicator.x = screenCenterX + halfW * Math.sign(screenDx);
          indicator.y = screenCenterY + halfW * tanAngle * Math.sign(screenDx);
        } else {
          indicator.x =
            screenCenterX + (halfH / tanAngle) * Math.sign(screenDy);
          indicator.y = screenCenterY + halfH * Math.sign(screenDy);
        }
        indicatorIndex++;
      }
    }
  }

  function updateVignetteAndShake() {
    vignetteElement.classList.remove("grind", "speed", "turbo", "active");
    let isEffectActive = false;

    if (player.isGrinding) {
      isEffectActive = true;
      vignetteElement.classList.add("grind");
    } else if (player.speedBoost) {
      isEffectActive = true;
      const isTurbo = player.speedBoost.multiplier === POWERUP_T_BOOST;
      vignetteElement.classList.add(isTurbo ? "turbo" : "speed");
    }

    if (isEffectActive) {
      vignetteElement.classList.add("active");
      world.position.x += (Math.random() - 0.5) * SCREEN_SHAKE_AMOUNT;
      world.position.y += (Math.random() - 0.5) * SCREEN_SHAKE_AMOUNT;
    }
  }

  function endGame(playerWon = false) {
    if (gameState === "gameOver") return;

    // Capture the final level's minimap right before ending the game.
    captureMinimap();

    gameState = "gameOver";

    if (levelMinimaps.length > 0) {
      const numMinimaps = levelMinimaps.length;
      const cols = Math.ceil(Math.sqrt(numMinimaps));
      const rows = Math.ceil(numMinimaps / cols);
      const minimapSize = MINIMAP_CAPTURE_RESOLUTION;
      const mosaicCanvas = document.createElement("canvas");
      mosaicCanvas.width = cols * minimapSize;
      mosaicCanvas.height = rows * minimapSize;
      const ctx = mosaicCanvas.getContext("2d");
      ctx.fillStyle = "#05050a"; // Background color
      ctx.fillRect(0, 0, mosaicCanvas.width, mosaicCanvas.height);

      for (let i = 0; i < numMinimaps; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const image = new PIXI.Sprite(levelMinimaps[i]);
        const imageCanvas = app.renderer.extract.canvas(image);
        ctx.drawImage(imageCanvas, col * minimapSize, row * minimapSize);
      }
      finalMinimapImage = mosaicCanvas.toDataURL("image/png");
    }

    if (!playerWon) {
      createExplosion(player.x, player.y, PLAYER_COLOR);
      playerSprite.alpha = 0;
    }
    enemyIndicator.visible = false;
    showGameOverUI(playerWon);
    if (powerupInterval) clearInterval(powerupInterval);
  }

  function handleEnemyDeath(enemy) {
    const index = enemies.indexOf(enemy);
    if (index === -1) return;

    if (enemy.phantomTimer) {
      clearTimeout(enemy.phantomTimer);
    }

    deathLocations.push({ x: enemy.x, y: enemy.y });
    createExplosion(enemy.x, enemy.y, ENEMY_COLOR);

    // --- MODIFICATION ---
    // Was: fadingTrails.push(enemyTrails[index]);
    if (enemyTrails[index] && enemyTrails[index].length > 1) {
      // Now push an object that stores the trail and its phantom state
      fadingTrails.push({
        trail: enemyTrails[index],
        isPhantom: enemy.isPhantom, // Carry over the phantom status
      });
    }
    // --- END MODIFICATION ---

    world.removeChild(enemy.sprite);
    enemy.sprite.destroy();

    enemies.splice(index, 1);
    enemyTrails.splice(index, 1);

    minimapEnemies.removeChildAt(index).destroy();

    setTimeout(spawnSingleEnemy, ENEMY_RESPAWN_DELAY);
  }

  function checkCollisions() {
    // --- 1. PLAYER COLLISION CHECKS ---

    const playerTrailSafe = getSafeTrail(player, trailPoints);
    // Player vs. Self
    if (isBikeCollidingWithTrail(player, playerTrailSafe)) {
      endGame();
      return;
    }
    // Player vs. Walls
    if (
      Math.abs(player.x) > WORLD_BOUNDS ||
      Math.abs(player.y) > WORLD_BOUNDS
    ) {
      endGame();
      return;
    }

    // Player vs. Active Enemy Trails
    for (let i = 0; i < enemyTrails.length; i++) {
      const trail = enemyTrails[i];
      const enemy = enemies[i];

      // Skip collision if the enemy is a phantom
      if (enemy && enemy.isPhantom) {
        continue;
      }

      if (
        trail &&
        trail.length > 0 &&
        isBikeCollidingWithTrail(player, trail)
      ) {
        endGame();
        return;
      }
    }

    // Player vs. Fading Trails
    for (const trailItem of fadingTrails) {
      // Skip collision if the fading trail is a phantom
      if (trailItem.isPhantom) {
        continue;
      }

      const trail = trailItem.trail;
      if (
        trail &&
        trail.length > 0 &&
        isBikeCollidingWithTrail(player, trail)
      ) {
        endGame();
        return;
      }
    }

    // --- 2. ENEMY COLLISION CHECKS ---
    // (Enemies are NOT protected by phantom status and will die)

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      const ownTrail = enemyTrails[i];
      const ownTrailSafe = getSafeTrail(enemy, ownTrail);

      let didDie = false;

      // Enemy vs. Self
      if (isBikeCollidingWithTrail(enemy, ownTrailSafe)) {
        didDie = true;
      }

      // Enemy vs. Walls
      if (
        !didDie &&
        (Math.abs(enemy.x) > WORLD_BOUNDS || Math.abs(enemy.y) > WORLD_BOUNDS)
      ) {
        didDie = true;
      }

      // Enemy vs. Player Trail
      if (!didDie && isBikeCollidingWithTrail(enemy, trailPoints)) {
        didDie = true;
      }

      // Enemy vs. Other Active Enemy Trails
      if (!didDie) {
        for (let j = 0; j < enemyTrails.length; j++) {
          if (i === j) continue; // Skip self
          const otherTrail = enemyTrails[j];
          if (
            otherTrail &&
            otherTrail.length > 0 &&
            isBikeCollidingWithTrail(enemy, otherTrail)
          ) {
            didDie = true;
            break;
          }
        }
      }

      // Enemy vs. Fading Trails
      if (!didDie) {
        for (const trailItem of fadingTrails) {
          const otherTrail = trailItem.trail;
          if (
            otherTrail &&
            otherTrail.length > 0 &&
            isBikeCollidingWithTrail(enemy, otherTrail)
          ) {
            didDie = true;
            break;
          }
        }
      }

      if (didDie) {
        handleEnemyDeath(enemy);
      }
    }
  }
  function updatePowerups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (!p || !p.parent) continue;
      if (
        !player.powerup &&
        (player.x - p.x) ** 2 + (player.y - p.y) ** 2 <
          (POWERUP_SIZE + TRAIL_WIDTH) ** 2
      ) {
        player.powerup = p.type;
        updatePowerupUI();
        powerupContainer.removeChild(p);
        p.destroy();
        powerups.splice(i, 1);
        continue;
      }

      for (const enemy of enemies) {
        if (
          enemy &&
          !enemy.powerup &&
          (enemy.x - p.x) ** 2 + (enemy.y - p.y) ** 2 <
            (POWERUP_SIZE + TRAIL_WIDTH) ** 2
        ) {
          enemy.powerup = p.type;
          powerupContainer.removeChild(p);
          p.destroy();
          powerups.splice(i, 1);
          break;
        }
      }
    }
  }

  function checkDotCollection() {
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (
        (player.x - d.x) ** 2 + (player.y - d.y) ** 2 <
        DOT_PICKUP_RADIUS ** 2
      ) {
        playerScore++;
        updateDotCountUI();
        dotContainer.removeChild(d);
        d.destroy({ children: true });
        dots.splice(i, 1);
        if (playerScore >= DOTS_PER_LEVEL) {
          nextLevel();
        }
        return;
      }
    }
  }

  app.ticker.add((ticker) => {
    const delta = ticker.deltaTime;

    if (gameState === "splash" || gameState === "paused") {
      return;
    }

    if (gameState === "levelReady") {
      readyTimer -= delta;
      if (readyTimer <= 0) {
        gameState = "playing";
        readyText.visible = false;
      }
      return;
    }

    updateParticles(delta);
    updateFadingTrails(delta);

    if (gameState === "levelTransition") {
      transitionTimer -= delta;
      screenFade.alpha = 1 - Math.abs(transitionTimer) / FADE_DURATION;
      if (transitionTimer <= -FADE_DURATION) {
        gameState = "levelReady";
        readyTimer = 60;
        readyText.visible = true;
      } else if (transitionTimer < 0 && transitionTimer + delta >= 0) {
        currentLevel++;
        startLevel(currentLevel);
      }
      return;
    }

    if (gameState !== "playing") {
      return;
    }

    handlePowerupActivation();

    const left =
      keys["ArrowLeft"] ||
      keys["KeyA"] ||
      (activeTouches > 0 && keys["touchLeft"]);
    const right =
      keys["ArrowRight"] ||
      keys["KeyD"] ||
      (activeTouches > 0 && keys["touchRight"]);
    turning = (right ? 1 : 0) - (left ? 1 : 0);

    const bikes = [player, ...enemies];

    bikes.forEach((bike) => {
      if (!bike) return;

      if (bike.speedBoost) {
        bike.speedBoost.duration -= delta;
        if (bike.speedBoost.duration <= 0) bike.speedBoost = null;
      }

      const myTrail =
        bike === player ? trailPoints : enemyTrails[enemies.indexOf(bike)];
      const safeMyTrail = getSafeTrail(bike, myTrail);

      const otherTrails = [];
      if (bike === player) {
        enemyTrails.forEach((trail) => {
          if (trail && trail.length > 0) otherTrails.push(trail);
        });
      } else {
        otherTrails.push(trailPoints);
        const bikeIndex = enemies.indexOf(bike);
        enemyTrails.forEach((trail, i) => {
          if (i !== bikeIndex && trail && trail.length > 0)
            otherTrails.push(trail);
        });
      }
      checkWallGrind(bike, [safeMyTrail, ...otherTrails]);

      if (bike.isGrinding) emitGrindParticle(bike, bike.grindingSide);
      emitBoostParticle(bike);
      const speedMultiplier =
        (bike.speedBoost ? bike.speedBoost.multiplier : 1) *
        (bike.isGrinding ? GRIND_BOOST_MULTIPLIER : 1);

      if (bike === player) {
        if (turning !== 0) bike.angle += turning * TURN_SPEED * delta;
      } else {
        // Enemy
        bike.aiBiasCooldown -= delta;
        if (bike.aiBiasCooldown <= 0) {
          bike.aiTurnBias = (Math.random() - 0.5) * 0.4;
          bike.aiBiasCooldown = Math.random() * 120 + 60;
        }

        bike.aiUpdateCooldown -= delta;
        if (bike.aiUpdateCooldown <= 0) {
          bike.turning = getAIInput(bike, myTrail);
          bike.aiUpdateCooldown = AI_UPDATE_INTERVAL;
        }
        if (bike.turning !== 0) bike.angle += bike.turning * TURN_SPEED * delta;
      }
      bike.x += Math.sin(bike.angle) * PLAYER_SPEED * speedMultiplier * delta;
      bike.y -= Math.cos(bike.angle) * PLAYER_SPEED * speedMultiplier * delta;
    });

    if (
      trailPoints.length === 0 ||
      (player.x - trailPoints.at(-1).x) ** 2 +
        (player.y - trailPoints.at(-1).y) ** 2 >
        (TRAIL_WIDTH / 2) ** 2
    ) {
      trailPoints.push(new PIXI.Point(player.x, player.y));
      if (trailPoints.length > PLAYER_TRAIL_HISTORY) {
        trailPoints.shift();
      }
    }

    enemies.forEach((enemy, i) => {
      if (enemy) {
        const trail = enemyTrails[i];
        if (
          trail &&
          (trail.length === 0 ||
            (enemy.x - trail.at(-1).x) ** 2 + (enemy.y - trail.at(-1).y) ** 2 >
              (TRAIL_WIDTH / 2) ** 2)
        ) {
          trail.push(new PIXI.Point(enemy.x, enemy.y));
          if (trail.length > AI_TRAIL_HISTORY) {
            trail.shift();
          }
        }
      }
    });

    checkCollisions();
    if (gameState !== "playing") return;

    updatePowerups();
    checkDotCollection();

    playerSprite.position.set(player.x, player.y);
    playerSprite.rotation = player.angle;
    playerSprite.tint = player.isGrinding ? 0xffff00 : 0xffffff;

    enemies.forEach((enemy) => {
      if (enemy) {
        enemy.sprite.position.set(enemy.x, enemy.y);
        enemy.sprite.rotation = enemy.angle;
        enemy.sprite.tint = enemy.isGrinding ? 0xffff00 : 0xffffff;
      }
    });

    world.pivot.set(player.x, player.y);
    world.position.set(app.screen.width / 2, app.screen.height * 0.9);
    updateVignetteAndShake();
    world.rotation = -player.angle;

    drawTrails();
    updateEnemyIndicator();
    updateDotIndicators();
    updateMinimap();
  });

  // --- Initial Setup ---
  // --- Initial Setup ---
  pauseOverlay = document.getElementById("pause-overlay");
  gameOverOverlay = document.getElementById("game-over-overlay");
  splashScreenElement = document.getElementById("splash-screen");

  drawGrid();
  setupEnemyIndicator();
  setupDotIndicators();
  setupPowerupUI();
  setupDotCountUI();
  setupReadyUI();
  setupMinimap();

  screenFade = new PIXI.Graphics();
  screenFade.beginFill(0x010101);
  screenFade.drawRect(0, 0, app.screen.width, app.screen.height);
  screenFade.endFill();
  screenFade.alpha = 0;
  app.stage.addChild(screenFade);

  window.addEventListener("resize", repositionUI);
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