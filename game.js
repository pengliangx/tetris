(() => {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;

  const boardCanvas = document.getElementById("board");
  const ctx = boardCanvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nctx = nextCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const restartBtn = document.getElementById("restart");
  const overlayBtn = document.getElementById("overlay-btn");

  // 七种方块，每种用 4x4 或 3x3 的矩阵表示
  const SHAPES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    O: [
      [1, 1],
      [1, 1],
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  };

  const COLORS = {
    I: "#38bdf8",
    J: "#60a5fa",
    L: "#fb923c",
    O: "#facc15",
    S: "#4ade80",
    T: "#c084fc",
    Z: "#f87171",
  };

  let grid;
  let current;
  let nextType;
  let score;
  let lines;
  let level;
  let best = Number(localStorage.getItem("tetris-best") || 0);
  let dropCounter;
  let dropInterval;
  let lastTime;
  let paused;
  let gameOver;
  let rafId;

  function createGrid() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }

  function randomType() {
    const types = Object.keys(SHAPES);
    return types[Math.floor(Math.random() * types.length)];
  }

  function spawn(type) {
    const matrix = SHAPES[type].map((row) => row.slice());
    return {
      type,
      matrix,
      x: Math.floor((COLS - matrix[0].length) / 2),
      y: type === "I" ? -1 : 0,
    };
  }

  function collide(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const nx = piece.x + x + offsetX;
        const ny = piece.y + y + offsetY;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function rotateMatrix(matrix) {
    const size = matrix.length;
    const result = matrix.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        result[x][size - 1 - y] = matrix[y][x];
      }
    }
    return result;
  }

  function rotate() {
    const rotated = rotateMatrix(current.matrix);
    // 踢墙：尝试原位、左移、右移
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collide(current, dx, 0, rotated)) {
        current.matrix = rotated;
        current.x += dx;
        return;
      }
    }
  }

  function merge() {
    current.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        const ny = current.y + y;
        const nx = current.x + x;
        if (ny >= 0) grid[ny][nx] = current.type;
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].every((cell) => cell)) {
        grid.splice(y, 1);
        grid.unshift(new Array(COLS).fill(null));
        cleared++;
        y++; // 重新检查当前行
      }
    }
    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared];
      score += points * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      dropInterval = Math.max(80, 800 - (level - 1) * 70);
      updateStats();
    }
  }

  function updateStats() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > best) {
      best = score;
      localStorage.setItem("tetris-best", String(best));
    }
    bestEl.textContent = best;
  }

  function lockPiece() {
    merge();
    clearLines();
    current = spawn(nextType);
    nextType = randomType();
    drawNext();
    if (collide(current, 0, 0)) {
      endGame();
    }
  }

  function softDrop() {
    if (!collide(current, 0, 1)) {
      current.y++;
      score += 1;
      updateStats();
    } else {
      lockPiece();
    }
    dropCounter = 0;
  }

  function hardDrop() {
    let dropped = 0;
    while (!collide(current, 0, 1)) {
      current.y++;
      dropped++;
    }
    score += dropped * 2;
    lockPiece();
    dropCounter = 0;
    updateStats();
  }

  function move(dx) {
    if (!collide(current, dx, 0)) {
      current.x += dx;
    }
  }

  function drawCell(context, x, y, color, size) {
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);
    context.fillStyle = "rgba(255,255,255,0.22)";
    context.fillRect(x * size, y * size, size, size * 0.18);
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.lineWidth = 1;
    context.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
  }

  function drawGridLines() {
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * BLOCK, 0);
      ctx.lineTo(x * BLOCK, ROWS * BLOCK);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * BLOCK);
      ctx.lineTo(COLS * BLOCK, y * BLOCK);
      ctx.stroke();
    }
  }

  function drawBoard() {
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    drawGridLines();

    // 已固定的方块
    grid.forEach((row, y) => {
      row.forEach((type, x) => {
        if (type) drawCell(ctx, x, y, COLORS[type], BLOCK);
      });
    });

    // 当前方块
    if (current) {
      current.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (!value) return;
          const ny = current.y + y;
          if (ny >= 0) {
            drawCell(ctx, current.x + x, ny, COLORS[current.type], BLOCK);
          }
        });
      });

      // 幽灵方块（落点预览）
      let ghostY = current.y;
      while (!collide(current, 0, ghostY - current.y + 1)) ghostY++;
      ctx.globalAlpha = 0.22;
      current.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (!value) return;
          const ny = ghostY + y;
          if (ny >= 0) drawCell(ctx, current.x + x, ny, COLORS[current.type], BLOCK);
        });
      });
      ctx.globalAlpha = 1;
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const matrix = SHAPES[nextType];
    const size = 24;
    // 计算实际占用范围以居中
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (!value) return;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      })
    );
    const w = (maxX - minX + 1) * size;
    const h = (maxY - minY + 1) * size;
    const offX = (nextCanvas.width - w) / 2;
    const offY = (nextCanvas.height - h) / 2;

    matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (!value) return;
        const px = offX + (x - minX) * size;
        const py = offY + (y - minY) * size;
        nctx.fillStyle = COLORS[nextType];
        nctx.fillRect(px, py, size, size);
        nctx.fillStyle = "rgba(255,255,255,0.22)";
        nctx.fillRect(px, py, size, size * 0.18);
        nctx.strokeStyle = "rgba(0,0,0,0.35)";
        nctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      })
    );
  }

  function update(time = 0) {
    rafId = requestAnimationFrame(update);
    if (paused || gameOver) return;

    const delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;

    if (dropCounter > dropInterval) {
      if (!collide(current, 0, 1)) {
        current.y++;
      } else {
        lockPiece();
      }
      dropCounter = 0;
    }

    drawBoard();
  }

  function endGame() {
    gameOver = true;
    overlayTitle.textContent = "游戏结束";
    overlayText.textContent = `本局分数：${score}　按回车重新开始`;
    overlayBtn.textContent = "重新开始";
    overlay.classList.remove("hidden");
  }

  function reset() {
    grid = createGrid();
    score = 0;
    lines = 0;
    level = 1;
    dropCounter = 0;
    dropInterval = 800;
    lastTime = performance.now();
    paused = false;
    gameOver = false;
    current = spawn(randomType());
    nextType = randomType();
    overlay.classList.add("hidden");
    updateStats();
    drawNext();
    drawBoard();
    if (!rafId) update();
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      overlayTitle.textContent = "已暂停";
      overlayText.textContent = "按 P 或回车继续";
      overlayBtn.textContent = "继续";
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
      lastTime = performance.now();
    }
  }

  document.addEventListener("keydown", (e) => {
    const key = e.key;
    if (key === "p" || key === "P") {
      togglePause();
      return;
    }
    if ((key === "Enter" || key === " ") && (gameOver || paused)) {
      if (gameOver) reset();
      else togglePause();
      return;
    }
    if (paused || gameOver) return;

    switch (key) {
      case "ArrowLeft":
        e.preventDefault();
        move(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        move(1);
        break;
      case "ArrowDown":
        e.preventDefault();
        softDrop();
        break;
      case "ArrowUp":
        e.preventDefault();
        rotate();
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
    }
    drawBoard();
  });

  overlayBtn.addEventListener("click", () => {
    if (paused && !gameOver) togglePause();
    else reset();
  });
  restartBtn.addEventListener("click", reset);

  reset();
})();
