(async () => {
  // --- Difficulty Settings ---
  // 0.25 = Easy, 0.5 = Normal, 1.0 = Hard, 1.25 = Ultra Hard
  const DIFFICULTY_MULTIPLIER = 0.5; // Normal difficulty

  // --- Game Configuration (Responsive speeds based on screen width) ---
  // Base speed is intentionally lower - momentum system brings it up to normal
  let PLAYER_BASE_SPEED =
    (window.innerWidth * 0.0059 * DIFFICULTY_MULTIPLIER) / 1.05;
  let PLAYER_MAX_SPEED =
    (window.innerWidth * 0.008 * DIFFICULTY_MULTIPLIER) / 1.05;
  let RIVAL_BASE_SPEED = window.innerWidth * 0.006 * DIFFICULTY_MULTIPLIER;
  const TURNING_SPEED_PENALTY = 0.98; // Speed multiplier when turning (slight slowdown)
  let SLIPSTREAM_SPEED_INCREASE = PLAYER_BASE_SPEED * 0.0085; // How fast speed builds when slipstreaming
  const SPEED_DECAY = 0.99; // How fast speed returns to base when not slipstreaming

  let PLAYER_ACCEL_Y = PLAYER_BASE_SPEED * 0.042; // Y-axis acceleration when input is held
  const PLAYER_FRICTION_Y = 0.92; // Drift/deceleration when no input
  let PLAYER_MAX_SPEED_Y = PLAYER_BASE_SPEED * 0.68; // Max vertical velocity for 45° angle

  // Quantized movement - slope is fixed regardless of speed
  // This creates the distinctive Dotstream feel
  const MOVEMENT_ANGLE_QUANTIZE = true;

  // Responsive sizing based on screen dimensions
  let WORLD_HEIGHT = window.innerHeight * 0.8; // Vertical play area (80% of screen height)
  let CAMERA_BUFFER = window.innerWidth * 0.3; // How far ahead to spawn obstacles
  let TRAIL_WIDTH = Math.max(3, WORLD_HEIGHT * 0.005); // Scale with world height
  const TRAIL_HISTORY = Infinity;
  let COLLISION_GRACE_DISTANCE = TRAIL_WIDTH * 7.5;

  // Track system - vehicles snap to horizontal tracks for uniform spacing
  const NUM_TRACKS = 50; // Many thin tracks for smooth movement feel
  let TRACK_SPACING = WORLD_HEIGHT / (NUM_TRACKS - 1); // Distance between tracks

  function snapToTrack(y) {
    // Snap y position to nearest track
    const trackIndex = Math.round((y + WORLD_HEIGHT / 2) / TRACK_SPACING);
    return trackIndex * TRACK_SPACING - WORLD_HEIGHT / 2;
  }

  function snapToTrackInDirection(y, direction) {
    // Snap to nearest track in the given direction (1 = down, -1 = up, 0 = nearest)
    const currentTrackIndex = (y + WORLD_HEIGHT / 2) / TRACK_SPACING;
    let targetTrackIndex;

    if (direction > 0) {
      targetTrackIndex = Math.ceil(currentTrackIndex);
    } else if (direction < 0) {
      targetTrackIndex = Math.floor(currentTrackIndex);
    } else {
      targetTrackIndex = Math.round(currentTrackIndex);
    }

    return targetTrackIndex * TRACK_SPACING - WORLD_HEIGHT / 2;
  }

  function getTrackIndex(y) {
    return Math.round((y + WORLD_HEIGHT / 2) / TRACK_SPACING);
  }

  function isTrackOccupied(trackIndex, excludeVehicle, checkX) {
    // Check if a track has any HORIZONTAL trail segments near the given X position
    // Only check vehicles AHEAD in the race (higher X) - you can't be blocked by someone behind you
    // Diagonal crossings don't count as occupying a track
    const trackY = trackIndex * TRACK_SPACING - WORLD_HEIGHT / 2;
    const xRangeBehind = WORLD_HEIGHT * 0.15; // Check trail behind
    const xRangeAhead = WORLD_HEIGHT * 0.3; // Check trail ahead (further)

    // Check player trail (only if player is ahead)
    if (excludeVehicle !== "player" && player.x > checkX) {
      for (let j = 1; j < trailPoints.length; j++) {
        const point = trailPoints[j];
        const prevPoint = trailPoints[j - 1];
        const xDist = point.x - checkX;

        // Only check trail that's nearby (behind or slightly ahead)
        if (xDist > -xRangeBehind && xDist < xRangeAhead) {
          const pointTrack = getTrackIndex(point.y);

          // Check if this segment is on the target track
          if (pointTrack === trackIndex) {
            // Check if segment is mostly horizontal (not a diagonal crossing)
            const dx = Math.abs(point.x - prevPoint.x);
            const dy = Math.abs(point.y - prevPoint.y);

            // If horizontal movement is much greater than vertical, it's occupying the track
            if (dx > dy * 3) {
              return true;
            }
          }
        }
      }
    }

    // Check rival trails (only if rival is ahead)
    for (let i = 0; i < rivalTrails.length; i++) {
      if (excludeVehicle === i) continue;
      const rival = rivals[i];
      // Only check this rival if they're ahead in the race
      if (rival.x <= checkX) continue;

      const trail = rivalTrails[i];
      for (let j = 1; j < trail.length; j++) {
        const point = trail[j];
        const prevPoint = trail[j - 1];
        const xDist = point.x - checkX;

        if (xDist > -xRangeBehind && xDist < xRangeAhead) {
          const pointTrack = getTrackIndex(point.y);

          if (pointTrack === trackIndex) {
            // Check if segment is mostly horizontal
            const dx = Math.abs(point.x - prevPoint.x);
            const dy = Math.abs(point.y - prevPoint.y);

            if (dx > dy * 3) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  // Helper functions for mobile/orientation
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  function isLandscape() {
    // Check orientation API if available
    if (window.screen.orientation) {
      return (
        window.screen.orientation.angle === 90 ||
        window.screen.orientation.angle === -90 ||
        window.screen.orientation.type.startsWith("landscape")
      );
    }
    // Fallback to dimensions
    return window.innerWidth > window.innerHeight;
  }

  function getLandscapeDimensions() {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    if (screenWidth >= screenHeight) {
      return { width: screenWidth, height: screenHeight };
    } else {
      return { width: screenHeight, height: screenWidth };
    }
  }

  function needsStandalone() {
    const standaloneiOS = window.navigator.standalone === true;
    const standaloneAndroid = window.matchMedia(
      "(display-mode: standalone)",
    ).matches;

    const isDevel =
      window.location.hostname.startsWith("192") ||
      window.location.hostname.startsWith("127") ||
      window.location.hostname === "localhost";

    console.log("needsStandalone check:");
    console.log("  isMobile:", isMobile());
    console.log("  isDevel:", isDevel);
    console.log("  standaloneiOS:", standaloneiOS);
    console.log("  standaloneAndroid:", standaloneAndroid);
    console.log("  hostname:", window.location.hostname);

    return isMobile() && !isDevel && !standaloneiOS && !standaloneAndroid;
  }

  const PLAYER_COLOR = 0x00ffff; // Cyan
  const TRAIL_COLOR = 0x00ffff;
  const OBSTACLE_COLOR = 0xff0000; // Red

  // Solarized Dark colors for rivals
  const RIVAL_COLORS = [
    0xdc322f, // red
    0x859900, // green
    0xb58900, // yellow
    0x268bd2, // blue
    0xd33682, // magenta
  ];

  let GRID_SIZE = WORLD_HEIGHT * 0.0625; // Grid scales with world
  const GRID_COLOR = 0x40406a;

  // Rivals
  const NUM_RIVALS = 5;
  let RIVAL_SPACING = TRAIL_WIDTH * 2; // Minimum spacing between players
  const LEADER_PENALTY_TIME = 800; // ms penalty for 1st place
  const RIVAL_PENALTY_TIME = 600; // ms penalty for everyone else

  // Slipstream mechanic
  let SLIPSTREAM_RANGE = RIVAL_SPACING * 1.5; // Must be larger than spacing to allow slipstream
  const SLIPSTREAM_FILL_RATE = 0.5; // per frame
  const SLIPSTREAM_MAX = 100;
  const SLIPSTREAM_BOOST = 1.5; // speed multiplier

  // Boost system
  let BOOST_SPEED = (window.innerWidth * 0.009 * DIFFICULTY_MULTIPLIER) / 1.05; // Speed when boosting (responsive)
  const BOOST_DURATION = 2000; // ms - how long boost lasts
  let BOOST_ZONE_SIZE = WORLD_HEIGHT * 0.075; // Size of boost pickup zones (scales with world)
  const BOOST_ZONE_SPAWN_CHANCE = 0.002; // Spawn rate for boost zones

  // Lives/Turbo system (like Dotstream)
  const STARTING_LIVES = 3;
  const INVINCIBILITY_TIME = 60; // frames of invincibility after hit

  // --- PIXI App Setup ---
  const landscapeDimensions = getLandscapeDimensions();
  const app = new PIXI.Application();
  await app.init({
    width: landscapeDimensions.width,
    height: landscapeDimensions.height,
    backgroundColor: 0x05050a,
    antialias: true,
  });
  document.body.appendChild(app.view);

  // --- Game Containers ---
  const world = new PIXI.Container();
  app.stage.addChild(world);

  const boundaryGraphics = new PIXI.Graphics();
  world.addChild(boundaryGraphics);

  const finishLineGraphics = new PIXI.Graphics();
  world.addChild(finishLineGraphics);

  const trailGraphics = new PIXI.Graphics();
  world.addChild(trailGraphics);

  const rivalTrailGraphics = new PIXI.Graphics();
  world.addChild(rivalTrailGraphics);

  const obstacleContainer = new PIXI.Container();
  world.addChild(obstacleContainer);

  const playerSprite = new PIXI.Graphics();
  world.addChild(playerSprite);

  // Minimap for race summary image
  const MINIMAP_MAX_HEIGHT = 400; // Max height for minimap
  const minimapContainer = new PIXI.Container();
  const minimapBackground = new PIXI.Graphics();
  const minimapTrails = new PIXI.Graphics();
  const minimapObstacles = new PIXI.Graphics();
  const minimapBoosts = new PIXI.Graphics();
  minimapContainer.addChild(minimapBackground);
  minimapContainer.addChild(minimapObstacles);
  minimapContainer.addChild(minimapBoosts);
  minimapContainer.addChild(minimapTrails);
  minimapContainer.visible = false; // Hidden, only for capture
  app.stage.addChild(minimapContainer);

  // --- UI Objects ---
  let slipstreamBar, slipstreamBarFill;
  let pauseOverlay, gameOverOverlay, splashScreenElement, vignetteElement;
  let livesText, timeText, positionText, pursuerText, speedIndicator;

  // --- Game State ---
  let player;
  let rivals = [];
  let trailPoints = [];
  let rivalTrails = [];
  let obstacles = [];
  let allEncounteredObstacles = []; // Track all obstacles for minimap (never cleaned up)
  let boostZones = []; // Boost pickups on track
  let allEncounteredBoostZones = []; // Track all boost zones for minimap (never cleaned up)
  let gameState = "splash"; // splash, playing, paused, gameOver
  let keys = {};
  let activeTouches = 0;
  let cameraX = 0; // Track how far the world has scrolled
  let slipstreamGauge = 0;
  let slipstreamActive = false;
  let lastObstacleX = -2000; // Track last obstacle position for spacing
  let lastBoostZoneX = -1000; // Track last boost zone position
  let obstacleDifficulty = 0; // Increases over time

  // Race timing and scoring
  const RACE_DURATION = 60000; // 60 seconds in ms
  let raceStartTime = 0;
  let raceTimeRemaining = RACE_DURATION;
  let positionTimeTracking = [0, 0, 0, 0, 0, 0]; // Time spent in each position (1st-6th)

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
    slipstreamBar.x = 20; // Left-aligned with other UI elements
    slipstreamBar.y = 20;
    app.stage.addChild(slipstreamBar);

    slipstreamBarFill = new PIXI.Graphics();
    app.stage.addChild(slipstreamBarFill);

    // Lives indicator (responsive font size)
    const mainFontSize = Math.max(20, Math.min(32, app.screen.height * 0.04));
    const subFontSize = Math.max(16, Math.min(24, app.screen.height * 0.03));
    const smallFontSize = Math.max(14, Math.min(18, app.screen.height * 0.025));

    livesText = new PIXI.Text({
      text: "3",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: mainFontSize,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: Math.max(3, mainFontSize * 0.125) },
      }),
    });
    livesText.anchor.set(0, 0);
    livesText.x = 20;
    livesText.y = 20 + gaugeHeight + 10; // Below slipstream bar
    app.stage.addChild(livesText);

    // Time remaining
    timeText = new PIXI.Text({
      text: "1:00",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: mainFontSize,
        fontWeight: "bold",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: Math.max(3, mainFontSize * 0.125) },
      }),
    });
    timeText.anchor.set(1, 0);
    timeText.x = app.screen.width - 20;
    timeText.y = 20;
    app.stage.addChild(timeText);

    // Current position
    positionText = new PIXI.Text({
      text: "6th",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: subFontSize,
        fontWeight: "bold",
        fill: 0xffff00,
        stroke: { color: 0x000000, width: Math.max(2, subFontSize * 0.125) },
      }),
    });
    positionText.anchor.set(0, 0);
    positionText.x = 20;
    positionText.y = 20 + gaugeHeight + 10 + mainFontSize + 10; // Below lives text
    app.stage.addChild(positionText);

    // Pursuer indicator (shows closest rival behind)
    pursuerText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({
        fontFamily: "Sixtyfour",
        fontSize: smallFontSize,
        fontWeight: "bold",
        fill: 0xff6666,
        stroke: { color: 0x000000, width: Math.max(2, smallFontSize * 0.125) },
      }),
    });
    pursuerText.anchor.set(1, 0);
    pursuerText.x = app.screen.width - 20;
    pursuerText.y = 20 + mainFontSize + 10;
    app.stage.addChild(pursuerText);

    // Speed indicator (shows current speed state)
    speedIndicator = new PIXI.Graphics();
    app.stage.addChild(speedIndicator);

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
      slipstreamBarFill.drawRect(
        slipstreamBar.x + 2,
        slipstreamBar.y + 2,
        fillWidth - 4,
        gaugeHeight - 4,
      );
      slipstreamBarFill.endFill();
    }
  }

  function repositionUI() {
    if (slipstreamBar) {
      slipstreamBar.x = 20; // Left-aligned with other UI elements
      slipstreamBar.y = 20;
    }
  }

  function drawBoundaries() {
    boundaryGraphics.clear();

    // Draw the top and bottom boundaries of the playable area
    const boundaryColor = 0x40406a; // Subtle purple-gray
    const boundaryWidth = 2;
    const visibleWidth = app.screen.width * 2; // Draw wide enough to cover screen

    // Top boundary
    boundaryGraphics.moveTo(cameraX - visibleWidth / 2, -WORLD_HEIGHT / 2);
    boundaryGraphics.lineTo(cameraX + visibleWidth, -WORLD_HEIGHT / 2);

    // Bottom boundary
    boundaryGraphics.moveTo(cameraX - visibleWidth / 2, WORLD_HEIGHT / 2);
    boundaryGraphics.lineTo(cameraX + visibleWidth, WORLD_HEIGHT / 2);

    boundaryGraphics.stroke({
      width: boundaryWidth,
      color: boundaryColor,
      alpha: 0.8,
    });
  }

  function drawFinishLine(finishX) {
    finishLineGraphics.clear();

    // Check if finish line is within visible range
    const visibleStart = cameraX - 100;
    const visibleEnd = cameraX + app.screen.width + CAMERA_BUFFER;

    if (finishX < visibleStart || finishX > visibleEnd) {
      return; // Not visible yet
    }

    // Draw a stylish finish line area
    const lineWidth = 20;
    const checkeredSize = 40;

    // Draw checkered pattern
    for (let y = -WORLD_HEIGHT / 2; y < WORLD_HEIGHT / 2; y += checkeredSize) {
      const offset =
        Math.floor(y / checkeredSize) % 2 === 0 ? 0 : checkeredSize / 2;
      for (let x = 0; x < lineWidth; x += checkeredSize) {
        const color =
          Math.floor((x + offset) / checkeredSize) % 2 === 0
            ? 0xffffff
            : 0x000000;
        finishLineGraphics.beginFill(color, 0.6);
        finishLineGraphics.drawRect(
          finishX - lineWidth / 2 + x,
          y,
          checkeredSize,
          checkeredSize,
        );
        finishLineGraphics.endFill();
      }
    }

    // Draw bright cyan border
    finishLineGraphics.moveTo(finishX, -WORLD_HEIGHT / 2);
    finishLineGraphics.lineTo(finishX, WORLD_HEIGHT / 2);
    finishLineGraphics.stroke({
      width: 3,
      color: 0x00ffff,
      alpha: 0.9,
    });
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

    // Rival trails - each with their own color
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
          color: rival.color,
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

    // Gap must fit all 6 players (player + 5 rivals) with spacing
    // Use larger multiplier since TRAIL_WIDTH is visual thickness, not spacing
    const minGapSize = (NUM_RIVALS + 1) * TRAIL_WIDTH * 3.5; // Comfortable fit
    const gapSize = minGapSize + Math.random() * 30; // Slight variation

    const type = Math.random();

    if (type < 0.5) {
      // Simple horizontal funnel - large walls with a gap
      const gapY = (Math.random() - 0.5) * WORLD_HEIGHT * 0.5;

      // Top wall (covers from top of screen to gap)
      const topWall = new PIXI.Graphics();
      topWall.beginFill(OBSTACLE_COLOR);
      topWall.drawRect(
        0,
        -WORLD_HEIGHT / 2,
        TRAIL_WIDTH * 2,
        gapY - gapSize / 2 - -WORLD_HEIGHT / 2,
      );
      topWall.endFill();
      topWall.x = spawnX;
      topWall.y = 0;
      topWall.isWall = true;
      topWall.wallBounds = {
        x: 0,
        y: -WORLD_HEIGHT / 2,
        width: TRAIL_WIDTH * 2,
        height: gapY - gapSize / 2 + WORLD_HEIGHT / 2,
      };
      topWall.gapY = gapY; // Store gap center for AI
      topWall.gapSize = gapSize;
      obstacles.push(topWall);
      allEncounteredObstacles.push({
        x: spawnX,
        y: 0,
        isWall: true,
        wallBounds: { ...topWall.wallBounds },
      });
      obstacleContainer.addChild(topWall);

      // Bottom wall (covers from gap to bottom of screen)
      const bottomWall = new PIXI.Graphics();
      bottomWall.beginFill(OBSTACLE_COLOR);
      bottomWall.drawRect(
        0,
        gapY + gapSize / 2,
        TRAIL_WIDTH * 2,
        WORLD_HEIGHT / 2 - (gapY + gapSize / 2),
      );
      bottomWall.endFill();
      bottomWall.x = spawnX;
      bottomWall.y = 0;
      bottomWall.isWall = true;
      bottomWall.wallBounds = {
        x: 0,
        y: gapY + gapSize / 2,
        width: TRAIL_WIDTH * 2,
        height: WORLD_HEIGHT / 2 - (gapY + gapSize / 2),
      };
      bottomWall.gapY = gapY; // Store gap center for AI
      bottomWall.gapSize = gapSize;
      obstacles.push(bottomWall);
      allEncounteredObstacles.push({
        x: spawnX,
        y: 0,
        isWall: true,
        wallBounds: { ...bottomWall.wallBounds },
      });
      obstacleContainer.addChild(bottomWall);
    } else {
      // Diagonal funnel - 45° angled walls creating a diagonal passage
      const angleUp = Math.random() < 0.5; // Randomize direction
      const funnelWidth = WORLD_HEIGHT * 0.375; // Responsive funnel width
      const padding = WORLD_HEIGHT * 0.025; // Responsive padding

      // Calculate safe centerY range to ensure gap stays within track boundaries
      // Gap exits at: centerY ± funnelWidth (depending on angle direction)
      // Must ensure: -WORLD_HEIGHT/2 + gapSize/2 < gap exit < WORLD_HEIGHT/2 - gapSize/2
      let minCenterY, maxCenterY;
      if (angleUp) {
        // Gap exits at centerY - funnelWidth, must be > -WORLD_HEIGHT/2 + gapSize/2
        minCenterY = -WORLD_HEIGHT / 2 + gapSize / 2 + funnelWidth + padding;
        maxCenterY = WORLD_HEIGHT / 2 - gapSize / 2 - padding;
      } else {
        // Gap exits at centerY + funnelWidth, must be < WORLD_HEIGHT/2 - gapSize/2
        minCenterY = -WORLD_HEIGHT / 2 + gapSize / 2 + padding;
        maxCenterY = WORLD_HEIGHT / 2 - gapSize / 2 - funnelWidth - padding;
      }

      // Random centerY within safe range
      const centerY = minCenterY + Math.random() * (maxCenterY - minCenterY);

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
          { x: 0, y: centerY - gapSize / 2 },
        ];
        topWall.drawPolygon([
          new PIXI.Point(0, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY - gapSize / 2 - funnelWidth),
          new PIXI.Point(0, centerY - gapSize / 2),
        ]);
      } else {
        // Funnel going down
        topVertices = [
          { x: 0, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: -WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY - gapSize / 2 + funnelWidth },
          { x: 0, y: centerY - gapSize / 2 },
        ];
        topWall.drawPolygon([
          new PIXI.Point(0, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, -WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY - gapSize / 2 + funnelWidth),
          new PIXI.Point(0, centerY - gapSize / 2),
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
      allEncounteredObstacles.push({
        x: spawnX,
        y: 0,
        isWall: true,
        isDiagonal: true,
        polygonVertices: topVertices.map((v) => ({ ...v })),
        angleUp: angleUp,
      });
      obstacleContainer.addChild(topWall);

      const bottomWall = new PIXI.Graphics();
      bottomWall.beginFill(OBSTACLE_COLOR);

      let bottomVertices;
      if (angleUp) {
        bottomVertices = [
          { x: 0, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY + gapSize / 2 - funnelWidth },
          { x: 0, y: centerY + gapSize / 2 },
        ];
        bottomWall.drawPolygon([
          new PIXI.Point(0, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY + gapSize / 2 - funnelWidth),
          new PIXI.Point(0, centerY + gapSize / 2),
        ]);
      } else {
        bottomVertices = [
          { x: 0, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: WORLD_HEIGHT / 2 },
          { x: funnelWidth, y: centerY + gapSize / 2 + funnelWidth },
          { x: 0, y: centerY + gapSize / 2 },
        ];
        bottomWall.drawPolygon([
          new PIXI.Point(0, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, WORLD_HEIGHT / 2),
          new PIXI.Point(funnelWidth, centerY + gapSize / 2 + funnelWidth),
          new PIXI.Point(0, centerY + gapSize / 2),
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
      allEncounteredObstacles.push({
        x: spawnX,
        y: 0,
        isWall: true,
        isDiagonal: true,
        polygonVertices: bottomVertices.map((v) => ({ ...v })),
        angleUp: angleUp,
      });
      obstacleContainer.addChild(bottomWall);
    }
  }

  function updateObstacles() {
    // Remove obstacles that are off-screen to the left
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      if (obs.x < cameraX - app.screen.width * 0.2) {
        obstacleContainer.removeChild(obs);
        obs.destroy();
        obstacles.splice(i, 1);
      }
    }

    // Progressive difficulty - spawn rate increases slowly over time
    obstacleDifficulty += 0.00001;
    const spawnChance = Math.min(0.003 + obstacleDifficulty, 0.01); // Cap at 0.01, start lower

    // Enforce minimum spacing between obstacles - responsive to screen width
    const minSpacing = app.screen.width * 2.5;
    const spawnX = cameraX + app.screen.width + CAMERA_BUFFER;
    const distanceSinceLastObstacle = spawnX - lastObstacleX;

    // Only spawn if enough distance has passed
    if (
      distanceSinceLastObstacle >= minSpacing &&
      Math.random() < spawnChance
    ) {
      spawnObstacle();
      lastObstacleX = spawnX;
    }
  }

  // --- Boost Zone System ---

  function spawnBoostZone() {
    const spawnX = cameraX + app.screen.width + CAMERA_BUFFER;
    const spawnY = (Math.random() - 0.5) * WORLD_HEIGHT * 0.6; // Random Y position

    const zone = new PIXI.Graphics();
    zone.beginFill(0x00ff00); // Green
    zone.drawRect(
      -BOOST_ZONE_SIZE / 2,
      -BOOST_ZONE_SIZE / 2,
      BOOST_ZONE_SIZE,
      BOOST_ZONE_SIZE,
    );
    zone.endFill();
    zone.x = spawnX;
    zone.y = spawnY;
    zone.alpha = 0.7;

    boostZones.push({
      sprite: zone,
      x: spawnX,
      y: spawnY,
      collectedBy: [], // Track which racers have collected this boost
    });

    // Store for minimap
    allEncounteredBoostZones.push({
      x: spawnX,
      y: spawnY,
      collectedBy: [], // Will be updated as racers collect it
    });

    obstacleContainer.addChild(zone);
  }

  function updateBoostZones() {
    // Remove off-screen boost zones
    for (let i = boostZones.length - 1; i >= 0; i--) {
      const zone = boostZones[i];
      if (zone.x < cameraX - app.screen.width * 0.2) {
        obstacleContainer.removeChild(zone.sprite);
        zone.sprite.destroy();
        boostZones.splice(i, 1);
      }
    }

    // Spawn new boost zones randomly
    const spawnX = cameraX + app.screen.width + CAMERA_BUFFER;
    const distanceSinceLastBoost = spawnX - lastBoostZoneX;
    const minBoostSpacing = app.screen.width * 0.8; // Responsive minimum distance between boost zones

    if (
      distanceSinceLastBoost >= minBoostSpacing &&
      Math.random() < BOOST_ZONE_SPAWN_CHANCE
    ) {
      spawnBoostZone();
      lastBoostZoneX = spawnX;
    }
  }

  function activateBoost(entity) {
    entity.boostTimer = BOOST_DURATION;
    entity.currentSpeed = BOOST_SPEED;
  }

  function checkBoostZoneCollisions() {
    for (let zoneIdx = 0; zoneIdx < boostZones.length; zoneIdx++) {
      const zone = boostZones[zoneIdx];

      // Find corresponding entry in allEncounteredBoostZones
      const allZone = allEncounteredBoostZones.find(
        (z) => z.x === zone.x && z.y === zone.y,
      );

      // Check player collision
      const playerDist = Math.sqrt(
        (player.x - zone.x) ** 2 + (player.y - zone.y) ** 2,
      );
      if (playerDist < BOOST_ZONE_SIZE / 2 + TRAIL_WIDTH) {
        // Only collect if player hasn't already collected this zone
        if (!zone.collectedBy.includes("player")) {
          zone.collectedBy.push("player");
          if (allZone) allZone.collectedBy.push("player");
          activateBoost(player);
        }
      }

      // Check rival collisions
      for (let i = 0; i < rivals.length; i++) {
        const rival = rivals[i];
        const rivalDist = Math.sqrt(
          (rival.x - zone.x) ** 2 + (rival.y - zone.y) ** 2,
        );
        if (rivalDist < BOOST_ZONE_SIZE / 2 + TRAIL_WIDTH) {
          const rivalId = `rival${i}`;
          // Only collect if this rival hasn't already collected this zone
          if (!zone.collectedBy.includes(rivalId) && !rival.boostTimer) {
            zone.collectedBy.push(rivalId);
            if (allZone) allZone.collectedBy.push(rivalId);
            rival.boostTimer = BOOST_DURATION;
          }
        }
      }
    }
  }

  // --- Collision Detection ---

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
    if (player.penaltyTimer) return; // Already in penalty

    player.lives--;
    updateLivesUI();

    if (player.lives <= 0) {
      endGame();
      return;
    }

    // Calculate position - check if player is in 1st place
    let position = 1;
    for (const rival of rivals) {
      if (rival.x > player.x) {
        position++;
      }
    }

    // Apply position-based penalty: 800ms for 1st, 600ms otherwise
    player.penaltyTimer =
      position === 1 ? LEADER_PENALTY_TIME : RIVAL_PENALTY_TIME;
    player.sprite.alpha = 0.3;
  }

  function pointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x,
        yi = vertices[i].y;
      const xj = vertices[j].x,
        yj = vertices[j].y;

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
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
        if (
          localX >= bounds.x &&
          localX <= bounds.x + bounds.width &&
          localY >= bounds.y &&
          localY <= bounds.y + bounds.height
        ) {
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

    if (
      isRedPixelAt(headX, headY) ||
      isRedPixelAt(headX + 2, headY + 2) ||
      isRedPixelAt(headX + 2, headY - 2)
    ) {
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
      for (let i = 0; i < rivals.length; i++) {
        const rival = rivals[i];
        // Must be ahead of player
        if (rival.x <= player.x) continue;

        // Check if on adjacent track (track-based slipstream)
        const playerTrack = getTrackIndex(player.y);
        const rivalTrack = getTrackIndex(rival.y);

        // Slipstream works if on nearest adjacent track (not same track!)
        if (Math.abs(playerTrack - rivalTrack) === 1) {
          isSlipstreaming = true;
          break;
        }
      }
    }

    // Increase speed when slipstreaming
    if (isSlipstreaming) {
      player.currentSpeed = Math.min(
        PLAYER_MAX_SPEED,
        player.currentSpeed + SLIPSTREAM_SPEED_INCREASE * delta,
      );
      slipstreamGauge = Math.min(
        SLIPSTREAM_MAX,
        slipstreamGauge + SLIPSTREAM_FILL_RATE * delta,
      );
    } else {
      // Decay speed back to base
      player.currentSpeed = Math.max(
        PLAYER_BASE_SPEED,
        player.currentSpeed * Math.pow(SPEED_DECAY, delta),
      );
      slipstreamGauge = Math.max(
        0,
        slipstreamGauge - SLIPSTREAM_FILL_RATE * delta * 0.5,
      );
    }

    // Visual effect when slipstreaming
    slipstreamActive = isSlipstreaming && slipstreamGauge > 50;

    return isSlipstreaming; // Return for use in push-apart logic
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
    showCountdown();
  }

  function showCountdown() {
    // Hide splash, show countdown
    splashScreenElement.style.display = "none";
    const countdownOverlay = document.getElementById("countdown-overlay");
    const countdownNumber = document.getElementById("countdown-number");

    countdownOverlay.classList.add("active");

    let count = 3;
    countdownNumber.textContent = count;

    const countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        // Reset animation by removing and re-adding
        countdownNumber.style.animation = "none";
        setTimeout(() => {
          countdownNumber.style.animation = "";
          countdownNumber.textContent = count;
        }, 10);
      } else {
        clearInterval(countdownInterval);
        countdownOverlay.classList.remove("active");
        actuallyStartGame();
      }
    }, 1000);
  }

  function actuallyStartGame() {
    gameOverOverlay.style.display = "none";

    // Initialize player at first position in diagonal (responsive sizing)
    const startX = app.screen.width * 0.1;
    const horizontalSpacing = app.screen.width * 0.15;

    // Calculate vertical spacing based on tracks to ensure uniform separation
    const trackSpacing = Math.ceil(
      ((NUM_RIVALS + 1) / NUM_TRACKS) * NUM_TRACKS,
    ); // Spread across multiple tracks
    const verticalSpacing = TRACK_SPACING * 2; // Use 2 tracks apart for nice spacing

    player = {
      x: startX,
      y: snapToTrack((-NUM_RIVALS * verticalSpacing) / 2), // Snap to track
      vy: 0, // Y velocity
      currentSpeed: PLAYER_BASE_SPEED, // Current horizontal speed (varies)
      speedMomentum: 1.05, // Speed multiplier from maintaining straight movement (0.95 to 1.05) - start at max
      lastMoveDirection: 0, // Track last Y movement direction for trail push
      lives: STARTING_LIVES,
      invincibilityTimer: 0,
      penaltyTimer: null,
      boostTimer: 0, // Boost effect timer
      sprite: playerSprite,
    };

    setupPlayerHead(playerSprite, PLAYER_COLOR);

    trailPoints = [new PIXI.Point(player.x, player.y)];

    // Clean up old rival sprites before creating new ones
    if (rivals.length > 0) {
      for (const rival of rivals) {
        if (rival.sprite) {
          world.removeChild(rival.sprite);
          rival.sprite.destroy();
        }
      }
    }

    // Initialize rivals in diagonal formation behind player
    rivals = [];
    rivalTrails = [];

    for (let i = 0; i < NUM_RIVALS; i++) {
      const rivalSprite = new PIXI.Graphics();
      const rivalColor = RIVAL_COLORS[i % RIVAL_COLORS.length];
      setupPlayerHead(rivalSprite, rivalColor);
      world.addChild(rivalSprite);

      const rival = {
        x: startX + (i + 1) * horizontalSpacing,
        y: snapToTrack(player.y + (i + 1) * verticalSpacing), // Snap to track
        vy: 0,
        lastMoveDirection: 0, // Track last Y movement direction
        color: rivalColor,
        sprite: rivalSprite,
        boostTimer: 0, // Boost effect timer
      };

      rivals.push(rival);
      rivalTrails.push([new PIXI.Point(rival.x, rival.y)]);
    }

    obstacles = [];
    allEncounteredObstacles = [];
    boostZones = [];
    allEncounteredBoostZones = [];
    obstacleContainer.removeChildren();
    finishLineGraphics.clear();
    cameraX = 0;
    slipstreamGauge = 0;
    slipstreamActive = false;
    lastObstacleX = -app.screen.width * 2;
    lastBoostZoneX = -app.screen.width;
    obstacleDifficulty = 0;

    // Reset race timing
    raceStartTime = Date.now();
    raceTimeRemaining = RACE_DURATION;
    positionTimeTracking = [0, 0, 0, 0, 0, 0];

    updateLivesUI();

    gameState = "playing";
  }

  // --- Minimap Rendering ---

  function renderMinimap() {
    // Calculate world bounds from all trails and entities
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    // Include player trail
    for (const point of trailPoints) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    // Include rival trails
    for (const trail of rivalTrails) {
      for (const point of trail) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      }
    }

    // Add padding to bounds
    const padding = 50;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    // Calculate dimensions maintaining aspect ratio
    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    const aspectRatio = worldWidth / worldHeight;

    // Use fixed height, calculate width based on aspect ratio
    const minimapHeight = MINIMAP_MAX_HEIGHT;
    const minimapWidth = minimapHeight * aspectRatio;
    const scale = minimapHeight / worldHeight;

    // Transform functions
    const transformX = (worldX) => (worldX - minX) * scale;
    const transformY = (worldY) => (worldY - minY) * scale;

    // Clear all graphics
    minimapBackground.clear();
    minimapObstacles.clear();
    minimapBoosts.clear();
    minimapTrails.clear();

    // Render background
    minimapBackground.beginFill(0x05050a, 1);
    minimapBackground.drawRect(0, 0, minimapWidth, minimapHeight);
    minimapBackground.endFill();

    // Render obstacles (use allEncounteredObstacles to show entire race)
    for (const obs of allEncounteredObstacles) {
      if (obs.isDiagonal && obs.polygonVertices) {
        // Render diagonal obstacle as polygon
        const points = [];
        for (const vertex of obs.polygonVertices) {
          points.push(
            new PIXI.Point(
              transformX(obs.x + vertex.x),
              transformY(obs.y + vertex.y),
            ),
          );
        }
        minimapObstacles.beginFill(OBSTACLE_COLOR);
        minimapObstacles.drawPolygon(points);
        minimapObstacles.endFill();
      } else if (obs.wallBounds) {
        // Render rectangular obstacle
        const bounds = obs.wallBounds;
        const x = transformX(obs.x + bounds.x);
        const y = transformY(obs.y + bounds.y);
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        minimapObstacles.beginFill(OBSTACLE_COLOR);
        minimapObstacles.drawRect(x, y, width, height);
        minimapObstacles.endFill();
      }
    }

    // Render boost zones (use allEncounteredBoostZones to show entire race)
    for (const zone of allEncounteredBoostZones) {
      const x = transformX(zone.x);
      const y = transformY(zone.y);
      const size = BOOST_ZONE_SIZE * scale;
      // Fade based on how many racers collected it (more collected = more faded)
      const alpha = Math.max(0.3, 0.9 - zone.collectedBy.length * 0.1);
      minimapBoosts.beginFill(0x00ff00, alpha);
      minimapBoosts.drawRect(x - size / 2, y - size / 2, size, size);
      minimapBoosts.endFill();
    }

    // Render rival trails
    for (let i = 0; i < rivalTrails.length; i++) {
      const trail = rivalTrails[i];
      const rival = rivals[i];
      if (trail && trail.length > 1) {
        minimapTrails.moveTo(transformX(trail[0].x), transformY(trail[0].y));
        for (let j = 1; j < trail.length; j++) {
          minimapTrails.lineTo(transformX(trail[j].x), transformY(trail[j].y));
        }
        minimapTrails.stroke({
          width: Math.max(1, TRAIL_WIDTH * scale * 0.8),
          color: rival.color,
          cap: "round",
          join: "round",
        });
      }
    }

    // Render player trail (on top)
    if (trailPoints.length > 1) {
      minimapTrails.moveTo(
        transformX(trailPoints[0].x),
        transformY(trailPoints[0].y),
      );
      for (let i = 1; i < trailPoints.length; i++) {
        minimapTrails.lineTo(
          transformX(trailPoints[i].x),
          transformY(trailPoints[i].y),
        );
      }
      minimapTrails.stroke({
        width: Math.max(1.5, TRAIL_WIDTH * scale),
        color: PLAYER_COLOR,
        cap: "round",
        join: "round",
      });
    }
  }

  async function captureMinimapImage() {
    // Make minimap visible for capture
    minimapContainer.visible = true;

    // Render the minimap
    renderMinimap();

    // Wait for next frame to ensure rendering is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Extract as canvas
    const canvas = app.renderer.extract.canvas(minimapContainer);

    // Hide minimap again
    minimapContainer.visible = false;

    // Convert to data URL
    return canvas.toDataURL("image/png");
  }

  function endGame(raceFinished = false) {
    if (gameState === "gameOver") return;
    gameState = "gameOver";

    // Update title
    const title = document.getElementById("game-over-title");
    if (raceFinished) {
      title.textContent = "FINISH";
    } else {
      title.textContent = "GAME OVER";
    }

    // Show results
    const subtitle = document.getElementById("game-over-subtitle");
    const total = positionTimeTracking.reduce((a, b) => a + b, 0);
    let resultsHTML = "Time in each position:<br/>";
    for (let i = 0; i < 6; i++) {
      const percentage =
        total > 0 ? Math.round((positionTimeTracking[i] / total) * 100) : 0;
      const suffix = ["st", "nd", "rd", "th", "th", "th"][i];
      resultsHTML += `${i + 1}${suffix}: ${percentage}%<br/>`;
    }
    resultsHTML += "<br/>Tap to Restart";
    subtitle.innerHTML = resultsHTML;

    // Generate and add minimap image
    captureMinimapImage()
      .then((dataUrl) => {
        // Create container like Flux does
        let container = document.getElementById("minimap-container");
        if (!container) {
          container = document.createElement("div");
          container.id = "minimap-container";
          container.style.textAlign = "center";
          container.style.marginTop = "20px";

          const image = document.createElement("img");
          image.id = "minimap-image";
          image.style.maxWidth = "90%";
          image.style.maxHeight = "400px";
          image.style.marginBottom = "15px";
          image.style.border = "2px solid #40406a";
          image.style.background = "rgba(0, 0, 0, 0.5)";
          image.style.padding = "5px";

          const link = document.createElement("a");
          link.id = "minimap-download-link";
          link.textContent = "Save Your Race";
          link.style.display = "block";
          link.style.color = "#00ffff";
          link.style.textDecoration = "none";
          link.style.fontSize = "18px";
          link.style.cursor = "pointer";
          link.download = `fluxstream-race-${Date.now()}.png`;

          container.appendChild(image);
          container.appendChild(link);

          // Stop propagation so clicking doesn't restart game
          container.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
          });

          // Insert before subtitle
          const menu = gameOverOverlay.querySelector(".menu");
          menu.insertBefore(container, subtitle);
        }

        // Update the image and link
        const image = document.getElementById("minimap-image");
        const link = document.getElementById("minimap-download-link");
        image.src = dataUrl;
        link.href = dataUrl;
        link.download = `fluxstream-race-${Date.now()}.png`;
      })
      .catch((err) => {
        console.error("Failed to generate minimap:", err);
      });

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

  // Recalculate responsive values on resize
  function updateResponsiveValues() {
    // Update dimensions
    WORLD_HEIGHT = window.innerHeight * 0.8;
    CAMERA_BUFFER = window.innerWidth * 0.3;
    TRAIL_WIDTH = Math.max(3, WORLD_HEIGHT * 0.005);
    COLLISION_GRACE_DISTANCE = TRAIL_WIDTH * 7.5;
    GRID_SIZE = WORLD_HEIGHT * 0.0625;
    RIVAL_SPACING = TRAIL_WIDTH * 2;
    SLIPSTREAM_RANGE = RIVAL_SPACING * 1.5;
    BOOST_ZONE_SIZE = WORLD_HEIGHT * 0.075;
    TRACK_SPACING = WORLD_HEIGHT / (NUM_TRACKS - 1); // Update track spacing

    // Update speeds (responsive to screen width with difficulty multiplier)
    // Base speed divided by 1.05 so momentum system brings it to normal
    PLAYER_BASE_SPEED =
      (window.innerWidth * 0.0059 * DIFFICULTY_MULTIPLIER) / 1.05;
    PLAYER_MAX_SPEED =
      (window.innerWidth * 0.008 * DIFFICULTY_MULTIPLIER) / 1.05;
    RIVAL_BASE_SPEED = window.innerWidth * 0.006 * DIFFICULTY_MULTIPLIER;
    SLIPSTREAM_SPEED_INCREASE = PLAYER_BASE_SPEED * 0.0085;
    PLAYER_ACCEL_Y = PLAYER_BASE_SPEED * 0.042;
    PLAYER_MAX_SPEED_Y = PLAYER_BASE_SPEED * 0.68;
    BOOST_SPEED = (window.innerWidth * 0.009 * DIFFICULTY_MULTIPLIER) / 1.05;
  }

  window.addEventListener("resize", () => {
    updateResponsiveValues();
    repositionUI();
  });

  // --- Game Loop ---

  app.ticker.add((ticker) => {
    const delta = ticker.deltaTime;

    // Check for landscape orientation on mobile
    if (isMobile() && !isLandscape()) {
      // Hide canvas and show rotation message
      app.canvas.style.display = "none";
      const orientationWarning = document.getElementById("orientation-warning");
      if (orientationWarning) {
        orientationWarning.style.display = "flex";
      }
      return;
    } else {
      // Show canvas and hide warning
      app.canvas.style.display = "block";
      const orientationWarning = document.getElementById("orientation-warning");
      if (orientationWarning) {
        orientationWarning.style.display = "none";
      }
    }

    // Check for PWA install requirement
    const pwaWarning = document.getElementById("pwa-warning");
    if (needsStandalone()) {
      // Always show PWA warning if needs standalone
      if (pwaWarning) {
        pwaWarning.style.display = "flex";
      }
      if (gameState === "splash") {
        splashScreenElement.style.display = "none";
      }
      return;
    } else {
      // Hide PWA warning if standalone or not mobile
      if (pwaWarning) {
        pwaWarning.style.display = "none";
      }
    }

    if (gameState !== "playing") {
      return;
    }

    // --- Input Processing ---
    const up =
      keys["ArrowUp"] ||
      keys["KeyW"] ||
      (activeTouches > 0 && keys["touchLeft"]);
    const down =
      keys["ArrowDown"] ||
      keys["KeyS"] ||
      (activeTouches > 0 && keys["touchRight"]);
    const boost = keys["Space"] || (keys["touchLeft"] && keys["touchRight"]);

    // Manual boost - consumes life (but can't use last life)
    if (boost && player.lives > 1 && !player.boostTimer) {
      player.lives--;
      updateLivesUI();
      activateBoost(player);
      keys["Space"] = false; // Prevent holding
      keys["touchLeft"] = false;
      keys["touchRight"] = false;
    }

    // --- Update Slipstream (must be before player physics for push-apart check) ---
    const isSlipstreaming = updateSlipstream(delta);

    // --- Player Physics ---

    // Check if player is in penalty (stopped after hitting obstacle)
    let playerInPenalty = false;
    if (player.penaltyTimer) {
      playerInPenalty = true;
      player.penaltyTimer -= delta * (1000 / 60);
      player.sprite.alpha = 0.3;

      if (player.penaltyTimer <= 0) {
        player.penaltyTimer = null;
        player.sprite.alpha = 1;
        player.invincibilityTimer = INVINCIBILITY_TIME;

        // Small teleport past obstacle - crashing should be SLOWER than navigating
        player.x += 80;
        playerInPenalty = false; // Penalty just ended, continue normally
      }
    }

    // Only process player movement if not in penalty
    if (!playerInPenalty) {
      // FAQ: "Your line's slope when moving up or down will be the same no matter how fast you are going"
      // The slope is CAPPED at 45°, but accelerates smoothly to reach it

      const isTurning = up || down;
      const isMovingHorizontal = Math.abs(player.vy) < 0.1;

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
      player.vy = Math.max(
        -player.currentSpeed,
        Math.min(player.currentSpeed, player.vy),
      );

      // Speed momentum system: reward sustained horizontal movement
      // Momentum ranges from 0.95 (just turned) to 1.05 (sustained horizontal = normal speed)
      const MOMENTUM_BUILD_RATE = 0.003; // How fast momentum builds when horizontal
      const MOMENTUM_DECAY_RATE = 0.04; // How fast momentum decays when turning
      const MAX_MOMENTUM = 1.05;
      const MIN_MOMENTUM = 0.95;

      if (isMovingHorizontal && !isTurning) {
        // Building momentum while moving straight
        player.speedMomentum = Math.min(
          MAX_MOMENTUM,
          player.speedMomentum + MOMENTUM_BUILD_RATE * delta,
        );
      } else if (isTurning) {
        // Lose momentum when turning
        player.speedMomentum = Math.max(
          MIN_MOMENTUM,
          player.speedMomentum - MOMENTUM_DECAY_RATE * delta,
        );
      }
      // When just coasting (not turning but not fully horizontal), momentum stays same

      // Apply speed penalty when turning (FAQ: "Moving up or down will cause you to lose a little bit of speed")
      if (isTurning) {
        player.currentSpeed *= Math.pow(TURNING_SPEED_PENALTY, delta);
      }

      // Handle boost timer
      if (player.boostTimer) {
        player.boostTimer -= delta * (1000 / 60);
        if (player.boostTimer <= 0) {
          player.boostTimer = 0;
          // Speed will return to normal via slipstream logic
        } else {
          // Maintain boost speed
          player.currentSpeed = BOOST_SPEED;
        }
      }

      // Update position (apply momentum multiplier to horizontal speed)
      player.x += player.currentSpeed * player.speedMomentum * delta;

      // If not actively turning, smoothly glide to target track
      if (!up && !down) {
        // Determine target track in the direction of last movement
        let targetY = snapToTrackInDirection(
          player.y,
          player.lastMoveDirection,
        );
        let targetTrack = getTrackIndex(targetY);

        // If target track is occupied, keep searching in the SAME direction
        if (isTrackOccupied(targetTrack, "player", player.x)) {
          // Search in the direction we were moving
          const searchDirection = player.lastMoveDirection || 1; // Default to down if no direction
          for (let offset = 1; offset <= 10; offset++) {
            const nextTrack = targetTrack + offset * searchDirection;
            if (!isTrackOccupied(nextTrack, "player", player.x)) {
              targetTrack = nextTrack;
              targetY = nextTrack * TRACK_SPACING - WORLD_HEIGHT / 2;
              break;
            }
          }
        }

        // Smoothly interpolate to target track
        const snapSpeed = 0.15 * delta; // Smooth glide speed
        player.y += (targetY - player.y) * snapSpeed;

        // Also decay velocity
        player.vy *= Math.pow(PLAYER_FRICTION_Y, delta);

        // Lock to track when very close and not occupied
        if (
          Math.abs(player.y - targetY) < 0.5 &&
          !isTrackOccupied(targetTrack, "player", player.x)
        ) {
          player.y = targetY;
          player.vy = 0;
        }
      } else {
        // Actively turning - free movement
        player.y += player.vy * delta;
      }
    } // End of player movement (if not in penalty)

    // Update camera based on player's actual position (always, even during penalty)
    cameraX = player.x - app.screen.width * 0.3; // Keep player at 30% from left (closer to center)

    // --- Rival Physics (Using same physics as player) ---

    rivals.forEach((rival, i) => {
      // Check if rival is in penalty (stopped)
      if (rival.penaltyTimer) {
        rival.penaltyTimer -= delta * (1000 / 60); // Convert to ms
        rival.sprite.alpha = 0.3; // Semi-transparent during penalty

        if (rival.penaltyTimer <= 0) {
          // End penalty - teleport just past the obstacle
          rival.penaltyTimer = null;
          rival.sprite.alpha = 1;

          // Small jump just past obstacle - crashing should be SLOWER than navigating
          // During 800ms penalty, rivals lose time that would have moved them ~288px
          // So we only jump 80px, resulting in net loss of ~208px
          rival.x += 80;
        }
        // DO NOT MOVE during penalty - just skip this rival
        return;
      }

      // AI: Stay mostly horizontal unless avoiding obstacles or collecting boosts
      let targetY = rival.y; // Default: maintain current Y position

      // Look ahead for obstacles we WILL collide with (responsive)
      const lookAheadDist = app.screen.width * 0.8;
      let mustAvoid = false;
      let targetingBoost = false;

      for (const obs of obstacles) {
        if (!obs.isWall) continue;

        // Check if obstacle is directly ahead (or we're inside it for diagonal funnels)
        const relX = obs.x - rival.x;

        // For diagonal funnels, also check when inside (relX < 0 but > -funnelWidth)
        const shouldCheckObstacle = obs.isDiagonal
          ? relX < lookAheadDist && relX > -obs.funnelWidth
          : relX > 0 && relX < lookAheadDist;

        if (shouldCheckObstacle) {
          // Check if we're on collision course
          let willCollide = false;

          if (obs.wallBounds) {
            // Rectangular obstacle - navigate to the gap center
            const bounds = obs.wallBounds;
            const obsWorldY = obs.y + bounds.y;
            const obsTop = obsWorldY;
            const obsBottom = obsWorldY + bounds.height;

            // Will we hit this wall at our current Y?
            if (rival.y >= obsTop && rival.y <= obsBottom) {
              willCollide = true;
              // Navigate to the gap center (stored in obstacle)
              if (obs.gapY !== undefined) {
                // Add per-rival offset so they don't all bunch up
                targetY = obs.gapY + (i - NUM_RIVALS / 2) * TRAIL_WIDTH * 1.8;
              } else {
                // Fallback: go to center
                targetY = 0;
              }
            }
          } else if (obs.isDiagonal) {
            // Diagonal funnel navigation
            const distanceTraveled = Math.max(0, -relX);
            const isInsideFunnel = relX < 0 && relX > -obs.funnelWidth;

            // Spread rivals within the gap
            const rivalOffset = (i - NUM_RIVALS / 2) * TRAIL_WIDTH * 1.8;

            if (isInsideFunnel) {
              // INSIDE the funnel: set target far in the funnel direction
              // This causes continuous acceleration to maintain 45° movement
              if (obs.angleUp) {
                targetY = obs.centerY - obs.funnelWidth * 2 + rivalOffset; // Far up
              } else {
                targetY = obs.centerY + obs.funnelWidth * 2 + rivalOffset; // Far down
              }
              willCollide = true; // Always navigate while inside
            } else {
              // APPROACHING the funnel: aim for the entrance
              targetY = obs.centerY + rivalOffset;

              // Check if we need to start navigating
              const entranceGapTop = obs.centerY - obs.gapSize / 2;
              const entranceGapBottom = obs.centerY + obs.gapSize / 2;

              if (
                rival.y < entranceGapTop - 20 ||
                rival.y > entranceGapBottom + 20
              ) {
                willCollide = true;
              }
            }
          }

          if (willCollide) {
            mustAvoid = true;
            break; // React to first obstacle
          }
        }
      }

      // If not avoiding obstacles and not already boosting, look for nearby boost zones
      if (!mustAvoid && !rival.boostTimer) {
        const boostLookAheadDist = app.screen.width * 0.6;
        let closestBoostDist = Infinity;
        let closestBoostY = null;
        const rivalId = `rival${i}`;

        for (const zone of boostZones) {
          // Skip if this rival already collected this boost
          if (zone.collectedBy.includes(rivalId)) continue;

          const distX = zone.x - rival.x;
          const distY = Math.abs(zone.y - rival.y);

          // Check if boost is ahead and within reasonable range
          if (
            distX > 0 &&
            distX < boostLookAheadDist &&
            distY < WORLD_HEIGHT * 0.4
          ) {
            const totalDist = Math.sqrt(distX * distX + distY * distY);
            if (totalDist < closestBoostDist) {
              closestBoostDist = totalDist;
              closestBoostY = zone.y;
            }
          }
        }

        // If found a boost zone nearby, target it (responsive distance threshold)
        if (
          closestBoostY !== null &&
          closestBoostDist < app.screen.width * 0.4
        ) {
          targetY = closestBoostY;
          targetingBoost = true;
        }
      }

      const yDiff = targetY - rival.y;

      // Apply acceleration toward target
      // Use stronger acceleration when actively avoiding obstacles or targeting boosts
      const accelStrength = mustAvoid ? 1.2 : targetingBoost ? 0.8 : 0.5;
      if (yDiff > 10) {
        rival.vy += PLAYER_ACCEL_Y * delta * accelStrength;
        rival.lastMoveDirection = 1;
      } else if (yDiff < -10) {
        rival.vy -= PLAYER_ACCEL_Y * delta * accelStrength;
        rival.lastMoveDirection = -1;
      } else {
        // Apply friction when not turning
        rival.vy *= Math.pow(PLAYER_FRICTION_Y, delta);
      }

      // Clamp to fixed 45° slope
      rival.vy = Math.max(
        -RIVAL_BASE_SPEED,
        Math.min(RIVAL_BASE_SPEED, rival.vy),
      );

      // Check collision with obstacles BEFORE moving - pixel-based check
      const nextX = rival.x + RIVAL_BASE_SPEED * delta;
      const nextY = rival.y + rival.vy * delta;

      const headX = nextX + TRAIL_WIDTH; // Front of bike
      const headY = nextY;

      const aboutToHitObstacle =
        isRedPixelAt(headX, headY) ||
        isRedPixelAt(headX + 2, headY + 2) ||
        isRedPixelAt(headX + 2, headY - 2);

      // If about to hit obstacle, apply penalty
      if (aboutToHitObstacle) {
        // Calculate this rival's position
        let rivalPosition = 1;
        if (player.x > rival.x) rivalPosition++;
        for (const otherRival of rivals) {
          if (otherRival.x > rival.x) rivalPosition++;
        }

        // Position-based penalty: 800ms for 1st, 600ms otherwise
        rival.penaltyTimer =
          rivalPosition === 1 ? LEADER_PENALTY_TIME : RIVAL_PENALTY_TIME;
        rival.sprite.alpha = 0.3; // Immediately show penalty
        return; // Don't move this frame
      }

      // Handle boost timer for rivals
      let rivalSpeed = RIVAL_BASE_SPEED;
      if (rival.boostTimer) {
        rival.boostTimer -= delta * (1000 / 60);
        if (rival.boostTimer <= 0) {
          rival.boostTimer = 0;
        } else {
          rivalSpeed = BOOST_SPEED;
        }
      }

      // Update position
      rival.x += rivalSpeed * delta;

      // Only glide to track when velocity is very close to zero AND not actively navigating
      const isActivelyNavigating = Math.abs(yDiff) > 10;
      if (Math.abs(rival.vy) < 0.3 && !isActivelyNavigating) {
        let targetY = snapToTrackInDirection(rival.y, rival.lastMoveDirection);
        let targetTrack = getTrackIndex(targetY);

        // If target track is occupied, keep searching in the SAME direction
        if (isTrackOccupied(targetTrack, i, rival.x)) {
          // Search in the direction we were moving
          const searchDirection = rival.lastMoveDirection || 1; // Default to down if no direction
          for (let offset = 1; offset <= 10; offset++) {
            const nextTrack = targetTrack + offset * searchDirection;
            if (!isTrackOccupied(nextTrack, i, rival.x)) {
              targetTrack = nextTrack;
              targetY = nextTrack * TRACK_SPACING - WORLD_HEIGHT / 2;
              break;
            }
          }
        }

        // Smoothly interpolate to target track
        const snapSpeed = 0.15 * delta;
        rival.y += (targetY - rival.y) * snapSpeed;

        // Lock to track when very close and not occupied
        if (
          Math.abs(rival.y - targetY) < 0.5 &&
          !isTrackOccupied(targetTrack, i, rival.x)
        ) {
          rival.y = targetY;
          rival.vy = 0;
        }
      } else {
        // Actively turning or moving - free movement
        rival.y += rival.vy * delta;
      }

      // Keep within bounds (responsive margin)
      const boundaryMargin = WORLD_HEIGHT * 0.0625;
      rival.y = Math.max(
        -WORLD_HEIGHT / 2 + boundaryMargin,
        Math.min(WORLD_HEIGHT / 2 - boundaryMargin, rival.y),
      );

      // Update trail
      const trail = rivalTrails[i];
      if (
        trail.length === 0 ||
        (rival.x - trail.at(-1).x) ** 2 + (rival.y - trail.at(-1).y) ** 2 >
          (TRAIL_WIDTH / 2) ** 2
      ) {
        trail.push(new PIXI.Point(rival.x, rival.y));
        if (trail.length > TRAIL_HISTORY) {
          trail.shift();
        }
      }
    });

    // --- Update Mechanics ---

    updateObstacles();
    updateBoostZones();
    checkBoostZoneCollisions();
    checkCollisions();

    // --- Update Player Trail ---

    if (
      trailPoints.length === 0 ||
      (player.x - trailPoints.at(-1).x) ** 2 +
        (player.y - trailPoints.at(-1).y) ** 2 >
        (TRAIL_WIDTH / 2) ** 2
    ) {
      trailPoints.push(new PIXI.Point(player.x, player.y));
      if (trailPoints.length > TRAIL_HISTORY) {
        trailPoints.shift();
      }
    }

    if (gameState !== "playing") return;

    // --- Update Race Timer ---
    const now = Date.now();
    const elapsed = now - raceStartTime;
    raceTimeRemaining = Math.max(0, RACE_DURATION - elapsed);

    // Calculate current position
    let currentPosition = 1;
    for (const rival of rivals) {
      if (rival.x > player.x) {
        currentPosition++;
      }
    }

    // Track time in this position (delta time in ms)
    const deltaMs = delta * (1000 / 60);
    positionTimeTracking[currentPosition - 1] += deltaMs;

    // Update UI
    timeText.text = `${Math.floor(raceTimeRemaining / 1000)}:${String(Math.floor((raceTimeRemaining % 1000) / 10)).padStart(2, "0")}`;
    const positionSuffix = ["st", "nd", "rd", "th", "th", "th"];
    positionText.text = `${currentPosition}${positionSuffix[currentPosition - 1]}`;

    // Find closest pursuer (rival behind player)
    let closestPursuer = null;
    let closestDistance = Infinity;
    for (const rival of rivals) {
      if (rival.x < player.x) {
        // Behind player
        const distance = player.x - rival.x;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPursuer = rival;
        }
      }
    }

    // Update pursuer indicator
    if (closestPursuer) {
      // Calculate time gap based on current speeds
      const timeGap = closestDistance / player.currentSpeed / 60; // Convert to seconds
      pursuerText.text = `v ${timeGap.toFixed(1)}s`;
    } else {
      pursuerText.text = ""; // No pursuers
    }

    // Calculate and draw finish line when it comes into view
    // Estimate where player will be when time runs out based on current speed
    const secondsRemaining = raceTimeRemaining / 1000;
    const estimatedFinishX =
      player.x + player.currentSpeed * secondsRemaining * 60;
    drawFinishLine(estimatedFinishX);

    // End race when time runs out
    if (raceTimeRemaining <= 0) {
      endGame(true); // Pass true to indicate race finished (not crashed)
      return;
    }

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
      playerSprite.alpha =
        Math.floor(player.invincibilityTimer / 5) % 2 === 0 ? 0.5 : 1.0; // Flashing
    } else {
      playerSprite.alpha = 1.0;
    }

    // Update speed indicator (next to position on left side)
    speedIndicator.clear();
    const indicatorX = 120; // Right of position text
    const indicatorY = positionText.y + positionText.height / 2; // Vertically centered with position text
    const dotSize = 6;
    const dotSpacing = 12;

    // Determine speed level: 1=slowed, 2=normal, 3=slipstream, 4=boost
    let speedLevel = 2; // Default: normal
    if (player.boostTimer > 0) {
      speedLevel = 4; // Boosted
    } else if (slipstreamActive) {
      speedLevel = 3; // Slipstreaming
    } else if (player.speedMomentum < 1.0) {
      speedLevel = 1; // Slowed
    }

    // Draw speed dots horizontally
    for (let i = 0; i < 4; i++) {
      const x = indicatorX + i * dotSpacing;

      if (i < speedLevel) {
        // Active dot - colored based on speed level
        let color;
        if (speedLevel === 1)
          color = 0xff6666; // Red (slowed)
        else if (speedLevel === 2)
          color = 0xffffff; // White (normal)
        else if (speedLevel === 3)
          color = 0x00ff00; // Green (slipstream)
        else color = 0xff00ff; // Magenta (boost)

        speedIndicator.beginFill(color);
      } else {
        // Inactive dot - gray
        speedIndicator.beginFill(0x404040);
      }

      speedIndicator.drawCircle(x, indicatorY, dotSize / 2);
      speedIndicator.endFill();
    }

    rivals.forEach((rival) => {
      rival.sprite.position.set(rival.x, rival.y);
    });

    // Camera follows player (horizontal scroll only)
    world.pivot.set(cameraX, 0);
    world.position.set(0, app.screen.height / 2);

    drawBoundaries();
    drawTrails();
    updateSlipstreamUI();
  });

  // --- Initial Setup ---

  setupUI();
  repositionUI();

  splashScreenElement.addEventListener("pointerdown", (e) => {
    // Allow right-click everywhere (for dev tools)
    if (e.button === 2) return;
    // Allow links to work
    if (e.target.tagName === "A" || e.target.closest("a")) {
      return;
    }
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
