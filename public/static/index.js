const cellElements = document.querySelectorAll('.cell');
const messageElement = document.querySelector('.message-container');
let field = ["", "", "", "", "", "", "", "", ""];
let isGameActive = false;
let symbol = null;
let turn = null;
let isBotActive = false;

let ws = new WebSocket("ws://localhost:8080");

ws.onmessage = message => {
  if (isBotActive) {
    return;
  }

  const response = JSON.parse(message.data);

  if (response.method === "join") {
    symbol = response.symbol;
    turn = response.turn;
    isGameActive = symbol === turn;
    cellElements.forEach((cell, index) => cell.addEventListener('click', (event) => {
      makeMove(event.target, index);
    }));
    updateMessage();
  }

  if (response.method === "update") {
    field = response.field;
    turn = response.turn;
    isGameActive = symbol === turn;
    updateBoard();
    updateMessage();
  }

  if (response.method === "result") {
    field = response.field;
    updateBoard();
    isGameActive = false;
    setTimeout(() => {
      messageElement.textContent = response.message;
    }, 100);
  }

  if (response.method === "left") {
    isGameActive = false;
    messageElement.textContent = response.message;
  }

  if (response.method === "leaderboard") {
    updateLeaderboard(response.leaderboard);
  }


};

function updateLeaderboard(leaderboard) {
  const leaderboardTable = document.getElementById('leaderboard').getElementsByTagName('tbody')[0];
  leaderboardTable.innerHTML = '';

  leaderboard.forEach(row => {
    const newRow = leaderboardTable.insertRow();
    const playerNameCell = newRow.insertCell(0);
    const winsCell = newRow.insertCell(1);
    const lossesCell = newRow.insertCell(2);
    const drawsCell = newRow.insertCell(3);

    playerNameCell.textContent = row.player_name;
    winsCell.textContent = row.wins;
    lossesCell.textContent = row.losses;
    drawsCell.textContent = row.draws;
  });
}

function makeMove(cell, index) {
  if (!isGameActive || field[index] !== "") {
    return;
  }

  isGameActive = false;
  cell.classList.add(symbol);
  field[index] = symbol;

  ws.send(JSON.stringify({
    "method": "move",
    "symbol": symbol,
    "field": field,
  }));
}

function updateBoard() {
  cellElements.forEach((cell, index) => {
    cell.classList.remove("X", "O");
    field[index] !== "" && cell.classList.add(field[index]);
  });
}

function updateMessage() {
  if (symbol === turn) {
    messageElement.textContent = "move";
  } else {
    messageElement.textContent = `waiting ${turn}...`;
  }
}

let currentPlayer = "X";
let board = Array(9).fill(null);

const winningConditions = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function handleCellPlayed(clickedCell, clickedCellIndex) {
  board[clickedCellIndex] = currentPlayer;
  clickedCell.classList.add(currentPlayer);
  clickedCell.removeEventListener("click", handleCellClick);
}

function handlePlayerChange() {
  currentPlayer = currentPlayer === "X" ? "O" : "X";
}

function handleResultValidation() {
  let roundWon = false;
  for (let i = 0; i <= 7; i++) {
    const winCondition = winningConditions[i];
    let a = board[winCondition[0]];
    let b = board[winCondition[1]];
    let c = board[winCondition[2]];
    if (a === null || b === null || c === null) {
      continue;
    }
    if (a === b && b === c) {
      roundWon = true;
      break;
    }
  }

  if (roundWon) {
    messageElement.innerHTML = `Player ${currentPlayer} has won!`;
    isGameActive = false;
    return;
  }

  let roundDraw = !board.includes(null);
  if (roundDraw) {
    messageElement.innerHTML = `Game ended in a draw!`;
    isGameActive = false;
    return;
  }

  isBotActive = false;
  handlePlayerChange();
}

function evaluate(board) {
  for (let i = 0; i < winningConditions.length; i++) {
    const [a, b, c] = winningConditions[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] === 'X' ? -10 : 10;
    }
  }
  return 0;
}

function minimax(board, depth, isMaximizing) {
  let score = evaluate(board);

  if (score === 10) {
    return score - depth;
  }
  if (score === -10) {
    return score + depth;
  }
  if (!board.includes(null)) {
    return 0;
  }

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        let moveScore = minimax(board, depth + 1, false);
        board[i] = null;
        bestScore = Math.max(bestScore, moveScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        let moveScore = minimax(board, depth + 1, true);
        board[i] = null;
        bestScore = Math.min(bestScore, moveScore);
      }
    }
    return bestScore;
  }
}

function randomMove() {
  let availableCells = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      availableCells.push(i);
    }
  }

  if (availableCells.length === 0) return;

  let randomIndex = Math.floor(Math.random() * availableCells.length);
  return availableCells[randomIndex];
}

function bestMove() {
  let bestScore = -Infinity;
  let move;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      board[i] = 'O';
      let score = minimax(board, 0, false);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        move = i;
      }
    }
  }
  return move;
}

function botMove() {
  if (!isGameActive) return;

  let cellIndex;

  
  if (Math.random() < 0.7) {
    cellIndex = randomMove();
  } else {
    cellIndex = bestMove();
  }

  let cell = cellElements[cellIndex];
  handleCellPlayed(cell, cellIndex);
  handleResultValidation();
}

function handleCellClick(clickedCellEvent) {
  const clickedCell = clickedCellEvent.target;
  const clickedCellIndex = Array.from(cellElements).indexOf(clickedCell);

  if (board[clickedCellIndex] !== null || !isGameActive) {
    return;
  }

  handleCellPlayed(clickedCell, clickedCellIndex);
  handleResultValidation();

  if (isGameActive && currentPlayer === "O") {
    setTimeout(botMove, 500); 
  }
}

function restartGame() {
  board = Array(9).fill(null);
  isGameActive = true;
  currentPlayer = "X";
  messageElement.innerHTML = `Player X's turn`;
  cellElements.forEach(cell => {
    cell.classList.remove("X");
    cell.classList.remove("O");
    cell.addEventListener("click", handleCellClick);
  });
}

document.getElementById('startBot').addEventListener("click", () => {
  isBotActive = true;
  cellElements.forEach(cell => cell.addEventListener("click", handleCellClick));
  restartGame();
});

document.getElementById('restartGame').addEventListener("click", () => {
  window.location.reload(true);
});
