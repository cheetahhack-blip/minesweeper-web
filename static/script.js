// --- グローバル ---
let rows, cols, mines;
let board = [];
let revealed = [];
let marked = [];
let firstClick = true;
let timer = 0;
let timerInterval;
let remainingMines = 0;
let currentDifficulty = "";

const DIFFICULTIES = {
    Easy: [9, 9, 10],
    Normal: [16, 16, 40],
    Hard: [16, 30, 99]
};

// --- ゲーム開始 ---
function startGame(level) {
    currentDifficulty = level;
    [rows, cols, mines] = DIFFICULTIES[level];

    board = Array.from({ length: rows }, () => Array(cols).fill(0));
    revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
    marked = Array.from({ length: rows }, () => Array(cols).fill(0));

    firstClick = true;
    timer = 0;
    remainingMines = mines;

    document.getElementById("timer").textContent = "Time: 0 s";
    document.getElementById("remaining").textContent = `Mines: ${remainingMines}`;
    clearInterval(timerInterval);

    const gameDiv = document.getElementById("game");
    gameDiv.innerHTML = "";
    gameDiv.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.r = r;
            cell.dataset.c = c;

            cell.onclick = () => reveal(r, c);
            cell.oncontextmenu = e => {
                e.preventDefault();
                flag(r, c);
            };

            gameDiv.appendChild(cell);
        }
    }

    updateBestTimes();
    loadRanking(currentDifficulty);
}

// --- 地雷配置 ---
function placeMines(sr, sc) {
    const forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = sr + dr, nc = sc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                forbidden.add(`${nr},${nc}`);
            }
        }
    }

    let left = mines;
    while (left > 0) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        if (board[r][c] === -1 || forbidden.has(`${r},${c}`)) continue;
        board[r][c] = -1;
        left--;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] === -1) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === -1) {
                        count++;
                    }
                }
            }
            board[r][c] = count;
        }
    }
}

// --- タイマー ---
function startTimer() {
    timerInterval = setInterval(() => {
        timer++;
        document.getElementById("timer").textContent = `Time: ${timer} s`;
    }, 1000);
}

// --- セルを開く ---
function reveal(r, c) {
    if (revealed[r][c] || marked[r][c] === 1) return;

    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);

    if (firstClick) {
        placeMines(r, c);
        startTimer();
        firstClick = false;
    }

    revealed[r][c] = true;
    cell.classList.add("revealed");

    if (board[r][c] === -1) {
        cell.textContent = "💣";
        clearInterval(timerInterval);
        showDialog("GAME OVER", "どっかーん！！");
        revealAllMines();
        return;
    }

    if (board[r][c] === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) reveal(nr, nc);
            }
        }
    } else {
        cell.textContent = board[r][c];
        cell.style.color = getNumberColor(board[r][c]);
    }

    if (checkClear()) handleClear();
}

// --- 旗 ---
function flag(r, c) {
    if (revealed[r][c]) return;

    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    marked[r][c] = (marked[r][c] + 1) % 3;

    if (marked[r][c] === 1) {
        cell.textContent = "🚩";
        remainingMines--;
    } else if (marked[r][c] === 2) {
        cell.textContent = "?";
    } else {
        cell.textContent = "";
        remainingMines++;
    }

    document.getElementById("remaining").textContent = `Mines: ${remainingMines}`;
}

// --- クリア判定 ---
function checkClear() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] !== -1 && !revealed[r][c]) return false;
        }
    }
    return true;
}

// --- クリア処理 ---
function handleClear() {
    clearInterval(timerInterval);

    db.collection("ranking")
      .where("difficulty", "==", currentDifficulty)
      .orderBy("time", "asc")
      .limit(5)
      .get()
      .then(snapshot => {
          const ranks = snapshot.docs.map(d => d.data());
          const pos = ranks.findIndex(r => timer < r.time);

          if (pos !== -1 || ranks.length < 5) {
              const name = prompt(`やるじゃないか　${currentDifficulty}のランキング上位だ\nTime: ${timer} 秒\n名前を教えてくれるかな`) || "名無し";

              submitTime(name, timer, currentDifficulty)
                .then(() => {
                    loadRanking(currentDifficulty);
                    updateBestTimes();
                })
                .catch(err => {
                    console.error("submitTime failed:", err);
                    showDialog("監査官", "通信状態が不安定みたいだ。もう一度だけ試してくれるか。");
                });

              showDialog("監査官の評定", `優　なかなかの手際だね\nTime: ${timer} 秒`);
          } else {
              showDialog("監査官の評定", `良　まだまだ、かな　Time: ${timer} 秒`);
          }
      })
      .catch(err => console.error("Firebase error:", err));
}

// --- Firebase 書き込み ---
function submitTime(name, time, difficulty) {
  const user = firebase.auth().currentUser;

  // 匿名ログインがまだ完了していない場合は送信しない
  if (!user) {
    return Promise.reject(new Error("Auth not ready"));
  }

  return db.collection("ranking").add({
    name,
    time: Number(time),
    difficulty,
    uid: user.uid,
    date: new Date()
  });
}

// --- 上位5人表示 ---
function loadRanking(difficulty) {
    const div = document.getElementById("ranking");
    div.innerHTML = `<h3>${difficulty} ランキング（上位5位）</h3>`;

    db.collection("ranking")
      .where("difficulty", "==", difficulty)
      .orderBy("time", "asc")
      .limit(5)
      .get()
      .then(snapshot => {
          snapshot.docs.forEach((doc, i) => {
              const d = doc.data();
              div.innerHTML += `<p>${i + 1}. ${d.name}: ${d.time.toFixed(2)}秒</p>`;
          });
      })
      .catch(err => console.error("Firebase error:", err));
}

// --- Best Times 表示 ---
function updateBestTimes() {
    const ul = document.getElementById("best-list");
    ul.innerHTML = "";

    Object.keys(DIFFICULTIES).forEach(level => {
        db.collection("ranking")
          .where("difficulty", "==", level)
          .orderBy("time", "asc")
          .limit(1)
          .get()
          .then(snap => {
              const li = document.createElement("li");
              if (snap.docs[0]) {
                  const d = snap.docs[0].data();
                  li.textContent = `${level}: ${d.time.toFixed(2)} 秒 - ${d.name}`;
              } else {
                  li.textContent = `${level}: --`;
              }
              ul.appendChild(li);
          });
    });
}

// --- その他 ---
function revealAllMines() {
    document.querySelectorAll(".cell").forEach(cell => {
        const r = cell.dataset.r, c = cell.dataset.c;
        if (board[r][c] === -1) cell.textContent = "💣";
    });
}

function backToMenu() {
    document.getElementById("game").innerHTML = "";
    document.getElementById("timer").textContent = "Time: 0 s";
    document.getElementById("remaining").textContent = "Mines: 0";
    closeDialog();
    updateBestTimes();
}

function getNumberColor(n) {
    return ["blue","green","red","navy","brown","turquoise","black","gray"][n - 1] || "black";
}

function showDialog(t, m) {
    document.getElementById("dialog-title").textContent = t;
    document.getElementById("dialog-message").textContent = m;
    document.getElementById("custom-dialog").style.display = "flex";
}

function closeDialog() {
    document.getElementById("custom-dialog").style.display = "none";
}
