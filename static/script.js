let rows, cols, mines;
let board = [];
let revealed = [];
let marked = [];
let firstClick = true;
let timer = 0;
let timerInterval;
let remainingMines = 0;

const DIFFICULTIES = {
    Easy: [9, 9, 10],
    Normal: [16, 16, 40],
    Hard: [16, 30, 99]
};

// --- ゲーム開始 ---
function startGame(level) {
    [rows, cols, mines] = DIFFICULTIES[level];
    board = Array.from({length: rows}, () => Array(cols).fill(0));
    revealed = Array.from({length: rows}, () => Array(cols).fill(false));
    marked = Array.from({length: rows}, () => Array(cols).fill(0));
    firstClick = true;
    timer = 0;
    remainingMines = mines;
    document.getElementById('timer').textContent = 'Time: 0 s';
    document.getElementById('remaining').textContent = `Mines: ${remainingMines}`;

    clearInterval(timerInterval);

    const gameDiv = document.getElementById('game');
    gameDiv.innerHTML = '';
    gameDiv.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.textContent = '';
            cell.addEventListener('click', () => reveal(r, c));
            cell.addEventListener('contextmenu', e => {
                e.preventDefault();
                flag(r, c);
            });
            gameDiv.appendChild(cell);
        }
    }
    updateBestTimes();
}

// --- 地雷配置 ---
function placeMines(safeR, safeC) {
    let forbidden = new Set();
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = safeR + dr;
            const nc = safeC + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                forbidden.add(nr + ',' + nc);
            }
        }
    }

    let remaining = mines;
    while (remaining > 0) {
        let r = Math.floor(Math.random() * rows);
        let c = Math.floor(Math.random() * cols);
        const key = r + ',' + c;
        if (forbidden.has(key) || board[r][c] === -1) continue;
        board[r][c] = -1;
        remaining--;
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] === -1) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === -1) count++;
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
        document.getElementById('timer').textContent = `Time: ${timer} s`;
    }, 1000);
}

// --- セルを開く ---
function reveal(r, c) {
    const cell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    if (revealed[r][c] || marked[r][c] === 1) return;

    if (firstClick) {
        placeMines(r, c);
        firstClick = false;
        startTimer();
    }

    revealed[r][c] = true;
    cell.classList.add('revealed');
    cell.classList.remove('flagged', 'question');

    if (board[r][c] === -1) {
        cell.textContent = '💣';
        showDialog("GAME OVER", "どっかーん！！");
        clearInterval(timerInterval);
        revealAllMines();
    } else if (board[r][c] === 0) {
        cell.textContent = '';
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
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
    const cell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
    if (revealed[r][c]) return;

    marked[r][c] = (marked[r][c] + 1) % 3;

    if (marked[r][c] === 0) {
        cell.textContent = '';
        cell.classList.remove('flagged', 'question');
        remainingMines++;
    } else if (marked[r][c] === 1) {
        cell.textContent = '🚩';
        cell.classList.add('flagged');
        cell.classList.remove('question');
        remainingMines--;
    } else if (marked[r][c] === 2) {
        cell.textContent = '?';
        cell.classList.add('question');
        cell.classList.remove('flagged');
    }

    document.getElementById('remaining').textContent = `Mines: ${remainingMines}`;
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

// --- クリア処理（ランキング対応版） ---
function handleClear() {
    clearInterval(timerInterval);

    // 現在の難易度を特定
    let difficulty = "";
    for (let key in DIFFICULTIES) {
        const [r, c, m] = DIFFICULTIES[key];
        if (r === rows && c === cols && m === mines) difficulty = key;
    }

    // Firebase 上位5位取得
    db.collection("ranking")
      .where("difficulty", "==", difficulty)
      .orderBy("time", "asc")
      .limit(5)
      .get()
      .then(snapshot => {
          const ranks = snapshot.docs.map(doc => doc.data());
          let position = ranks.findIndex(r => timer < r.time);
          if (position === -1 && ranks.length < 5) position = ranks.length; // 空き枠

          if (position !== -1) {
              // 上位5位なら名前入力
              const name = prompt(`優　なかなかやるね　${difficulty}のランキング上位だ\nTime: ${timer} 秒\n名前を教えてくれるかな`) || "名無し";
              submitTime(name, timer, difficulty);
          } else {
              showDialog("監査官の評定", `良　まだまだ、かな　Time: ${timer} 秒`);
          }
          
          // クリア時の難易度だけランキング表示
          loadRanking(difficulty);
      });
}

// --- Firebase送信関数 ---
function submitTime(playerName, time, difficulty) {
    db.collection("ranking").add({
        name: playerName,
        time: time,
        difficulty: difficulty,
        date: new Date()
    }).then(() => {
        loadRanking(difficulty);
    });
}

// --- ランキング表示関数 ---
function loadRanking(difficulty) {
    db.collection("ranking")
      .where("difficulty", "==", difficulty)
      .orderBy("time", "asc")
      .limit(5)
      .get()
      .then(snapshot => {
          const rankingDiv = document.getElementById("ranking");
          rankingDiv.innerHTML = `<h3>${difficulty} ランキング（上位5位）</h3>`;

          // 取得データを配列に変換してソート
          const ranks = snapshot.docs.map(doc => doc.data());
          ranks.sort((a, b) => a.time - b.time);

          ranks.forEach((data, index) => {
              const p = document.createElement("p");
              p.textContent = `${index + 1}. ${data.name}: ${data.time.toFixed(2)}秒`;
              rankingDiv.appendChild(p);
          });
      });
}

// --- ベストタイム表示 ---
function updateBestTimes() {
    const ul = document.getElementById('best-list');
    ul.innerHTML = '';

    for (let key in DIFFICULTIES) {
        // Firebase 上位5位取得
        db.collection("ranking")
          .where("difficulty", "==", key)
          .orderBy("time", "asc")
          .limit(1) // ベストタイムだけ取る
          .get()
          .then(snapshot => {
              let best = snapshot.docs[0] ? snapshot.docs[0].data() : null;
              const li = document.createElement('li');
              if (best) li.textContent = `${key}: ${best.time.toFixed(2)} 秒 - ${best.name}`;
              else li.textContent = `${key}: --`;
              ul.appendChild(li);
          });
    }
}


// --- 全地雷を表示 ---
function revealAllMines() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] === -1) {
                const cell = document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`);
                cell.textContent = '💣';
                cell.classList.add('revealed');
            }
        }
    }
}

// --- その他 ---
function backToMenu() {
    // ゲーム盤をクリア
    const gameDiv = document.getElementById('game');
    gameDiv.innerHTML = '';

    // 情報表示リセット
    document.getElementById('timer').textContent = 'Time: 0 s';
    document.getElementById('remaining').textContent = 'Mines: 0';

    // ダイアログ非表示
    closeDialog();

    // ランキングを再表示
    updateBestTimes();
}

function getNumberColor(num) {
    const colors = ["blue","green","red","navy","brown","turquoise","black","gray"];
    return colors[num-1] || "black";
}

// --- カスタムダイアログ ---
function showDialog(title, message) {
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-message').textContent = message;
    document.getElementById('custom-dialog').style.display = 'flex';
}

function closeDialog() {
    document.getElementById('custom-dialog').style.display = 'none';
}
