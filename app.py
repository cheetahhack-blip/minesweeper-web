# app.py
from flask import Flask, render_template, jsonify, request, session
import random

app = Flask(__name__)
app.secret_key = "minesweeper-secret-key"

# 難易度設定
DIFFICULTIES = {
    "Easy": (9, 9, 10),
    "Normal": (16, 16, 40),
    "Hard": (16, 30, 99)
}

# -------------------------
# ゲームクラス
# -------------------------
class MinesweeperGame:
    def __init__(self, rows, cols, mines):
        self.rows = rows
        self.cols = cols
        self.mines_count = mines
        self.remaining_mines = mines
        self.first_click = True
        self.game_over_flag = False

        self.board_state = [
            [{"revealed": False, "flag": False, "value": 0} for _ in range(cols)]
            for _ in range(rows)
        ]
        self.mines = set()

    def place_mines(self, safe_r, safe_c):
        forbidden = {
            (safe_r + dr, safe_c + dc)
            for dr in (-1, 0, 1)
            for dc in (-1, 0, 1)
            if 0 <= safe_r + dr < self.rows and 0 <= safe_c + dc < self.cols
        }

        while len(self.mines) < self.mines_count:
            r = random.randrange(self.rows)
            c = random.randrange(self.cols)
            if (r, c) in forbidden or (r, c) in self.mines:
                continue
            self.mines.add((r, c))
            self.board_state[r][c]["value"] = -1

        for r in range(self.rows):
            for c in range(self.cols):
                if self.board_state[r][c]["value"] == -1:
                    continue
                self.board_state[r][c]["value"] = sum(
                    (0 <= r + dr < self.rows and 0 <= c + dc < self.cols and
                     self.board_state[r + dr][c + dc]["value"] == -1)
                    for dr in (-1, 0, 1)
                    for dc in (-1, 0, 1)
                )

    def reveal(self, r, c):
        cell = self.board_state[r][c]
        if cell["revealed"] or cell["flag"]:
            return

        if self.first_click:
            self.place_mines(r, c)
            self.first_click = False

        cell["revealed"] = True

        if cell["value"] == -1:
            self.game_over_flag = True
        elif cell["value"] == 0:
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < self.rows and 0 <= nc < self.cols:
                        if not self.board_state[nr][nc]["revealed"]:
                            self.reveal(nr, nc)

    def toggle_flag(self, r, c):
        cell = self.board_state[r][c]
        if cell["revealed"]:
            return
        cell["flag"] = not cell["flag"]
        self.remaining_mines += -1 if cell["flag"] else 1


# -------------------------
# session から game を取得
# -------------------------
def get_game():
    if "game" not in session:
        difficulty = session.get("difficulty", "Easy")
        rows, cols, mines = DIFFICULTIES[difficulty]
        session["game"] = MinesweeperGame(rows, cols, mines)
    return session["game"]


# -------------------------
# ルーティング
# -------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/start/<difficulty>", methods=["POST"])
def start(difficulty):
    if difficulty not in DIFFICULTIES:
        return jsonify({"error": "invalid difficulty"}), 400

    session["difficulty"] = difficulty
    rows, cols, mines = DIFFICULTIES[difficulty]
    session["game"] = MinesweeperGame(rows, cols, mines)

    return jsonify({"status": "ok"})


@app.route("/click", methods=["POST"])
def click():
    game = get_game()
    data = request.json
    r, c = data["row"], data["col"]
    action = data["action"]

    if game.game_over_flag:
        return jsonify({
            "board_state": game.board_state,
            "remaining_mines": game.remaining_mines,
            "game_over": True
        })

    if action == "reveal":
        game.reveal(r, c)
    elif action == "flag":
        game.toggle_flag(r, c)

    session["game"] = game

    return jsonify({
        "board_state": game.board_state,
        "remaining_mines": game.remaining_mines,
        "game_over": game.game_over_flag
    })


@app.route("/reset", methods=["POST"])
def reset():
    difficulty = session.get("difficulty", "Easy")
    rows, cols, mines = DIFFICULTIES[difficulty]
    session["game"] = MinesweeperGame(rows, cols, mines)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
