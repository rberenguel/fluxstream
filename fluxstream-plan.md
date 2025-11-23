fluxstream: a homage game in pixijs / js to GBAs Dotsream

This is a full rewrite of what you will find in this folder (the tron-like game Flux), but Flux will serve you as a starting point given that:
- It works perfectly on mobile, with sharp touch controls
- Renders perfectly pixijs
- Has several effects and techniques we can reuse

***

### Design Philosophy & Game Feel
**The Metaphor:** You are not driving a car on asphalt; you are steering a data packet through a fiber optic cable.

**The Physics (Crucial):**
* **Fixed 45° Slope:** When turning up or down, the movement angle is always exactly 45 degrees, regardless of current speed (per Dotstream FAQ: "Your line's slope when moving up or down will be the same no matter how fast you are going").
* **Drift:** When the player releases the key, the line should **drift** back to horizontal, not stop instantly.
* **Speed Loss:** Turning causes gradual speed loss (per Dotstream FAQ: "Moving up or down will cause you to lose a little bit of speed").

**The Tension:**
The core loop is **Claustrophobic Flow**.
* The screen is constantly pushing the player left (relative motion).
* Rivals are not just enemies; they are "rails" to grind on. The player is encouraged to graze them dangerously closely.
* The "Stream" left behind is permanent (until it scrolls off). The screen becomes increasingly cluttered with "lethal geometry" (the trails of others). The player is weaving through a maze that is being built in real-time.

**Visuals:**
* Think *Tron* meets a heart rate monitor.
* The background is a void.
* The lines are laser-bright.
* Everything pulses.

This is a crucial addition. Using an external vector editor (Inkscape/Illustrator) as your level editor is a classic, highly efficient workflow for this specific genre.

Here is the updated section regarding the **Level Pipeline** and **Procedural Generation** to be included in the prompt. Following that, I have assembled the **Complete, Consolidated Prompt** for you to copy-paste to Claude.

### New Sections Added
1.  **SVG-to-Track Pipeline:** Treats an external `.svg` file as the map data source, parsing colors/layers into game entities (Walls, Pit Stops, Start positions).
2.  **The "Director" (Generative):** A logic block that spawns obstacles just off-screen based on the player's current $Y$ trajectory to create "near misses."

---

**Role:** You are an expert Game Developer specializing in PixiJS v8 (latest) and Creative Coding.
**Task:** Create the architecture and core prototype for a "Dotstream" homage game.
**Environment:** Browser only, plain JS, PWA

#### 1. Core Concept & "Game Feel"
* **Genre:** High-speed Vector Racing.
* **Visuals:** Minimalist, "Tron" aesthetics. Bright, high-contrast lines on a dark void background.
* **Compatibility:** The game will be played in landscape orientation on mobile and/or desktop. For touch controls, "left and right" hold is "turn" that direction (up and down respectively), holding both would trigger the action. Tapping on the score / upper area would pause. The controls for this are similar to what you will find in the scaffolding game provided.
* **The Vibe:** Steering a data packet through a fiber optic cable.
* **Movement Physics (Crucial):**
    * **Fixed 45° Angle:** Diagonal movement is always at exactly 45 degrees regardless of speed.
    * **Drift:** Releasing input causes the line to *slide* back to horizontal, not stop instantly.
    * **Speed Loss:** Turning causes gradual speed reduction.
    * **Flow:** The screen scrolls constantly to the right.

#### 2. Tech Stack & Rendering
* **Engine:** PixiJS v8.
* **Rendering Requirement:** Use `GraphicsContext`. Strictly adhere to the v8 drawing order: `moveTo` $\to$ `lineTo` $\to$ `stroke`.
* **Optimization:** Only render geometry visible within the viewport (+ buffer).

#### 3. Level Architecture: Hybrid System
The game must support two modes of level generation simultaneously:

**A. The SVG Pipeline (Fixed Tracks)**
* **Workflow:** The game loads an external `.svg` file.
* **Parsing Logic:**
    * **Black/Green Paths:** Parsed as **Static Walls** (Collision = Death).
    * **Blue Rects:** Parsed as **Pit Stop Zones** (Refill Health).
    * **Red Shapes:** Parsed as **Moving Obstacles** (Entities).
    * **Metadata:** Use SVG `id` or `class` attributes to define properties (e.g., `class="patrol-vertical"`).

**B. The "Director" (Procedural Generation)**
* **Logic:** A runtime system that spawns obstacles at `Camera.right + Buffer`.
* **Reactive Placement:** Calculate the player's current $Y$ and $Y$-Velocity. Spawn obstacles *directly* on this trajectory but leave a narrow "Needle's Eye" gap to force precise maneuvering.
* **Goal:** Create "barely avoidable" moments that make the player feel skilled.

#### 4. Physics & Collision Rules
* **Movement Model:**
    * $a_y = \text{Input} \times \text{Sensitivity}$
    * $v_y = (v_y + a_y) \times \text{Friction}$
    * $p_y = p_y + v_y$
* **Collision Matrix:**
    * **Wall/Obstacle:** -1 Life, Hard Bounce.
    * **Rival (Head):** No Damage, Elastic Bounce.
    * **Rival (Stream):** No Damage, Solid Block (Slide along it).

#### 5. Mechanics
* **The Slipstream:** Aligning parallel to a Rival ($\pm 3px$) fills a gauge. Full gauge = Free Speed Boost.
* **Resources:** "Dots" (Lives). Used for active Boosting (Speed up). Refilled in Pit Zones.

