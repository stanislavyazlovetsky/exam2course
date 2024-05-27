const express = require('express');
const path = require('path');
const http = require("http");
const WebSocket = require("ws");
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const bodyParser = require('body-parser');

const httpServer = http.createServer();
const wss = new WebSocket.Server({ server: httpServer });
httpServer.listen(8080);

const db = mysql.createConnection({
  host: 'localhost',
  user: 'st',
  password: '123',
  database: 'exam'
});

db.connect(err => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to the database');
  }
});

const clientConnections = {};
const opponents = {};
let clientIdsWaitingMatch = [];

wss.on("connection", connection => {
  const clientId = createClientId();
  clientConnections[clientId] = connection;

  matchClients(clientId);

  connection.on("message", message => {
    const result = JSON.parse(message);
    if (result.method === "move") {
      moveHandler(result, clientId);
    }
  });

  connection.on("close", () => {
    closeClient(connection, clientId);
  });
});

function matchClients(clientId) {
  clientIdsWaitingMatch.push(clientId);

  if (clientIdsWaitingMatch.length < 2) return;

  const firstClientId = clientIdsWaitingMatch.shift();
  const secondClientId = clientIdsWaitingMatch.shift();

  opponents[firstClientId] = secondClientId;
  opponents[secondClientId] = firstClientId;

  clientConnections[firstClientId].send(JSON.stringify({
    method: "join",
    symbol: "X",
    turn: "X"
  }));

  clientConnections[secondClientId].send(JSON.stringify({
    method: "join",
    symbol: "O",
    turn: "X"
  }));
}

function moveHandler(result, clientId) {
  const opponentClientId = opponents[clientId];

  if (checkWin(result.field)) {
    [clientId, opponentClientId].forEach(cId => {
      clientConnections[cId].send(JSON.stringify({
        method: "result",
        message: `${result.symbol} win`,
        field: result.field,
      }));
    });
    updateLeaderboard(result.symbol, clientId, opponentClientId, 'win');
    return;
  }

  if (checkDraw(result.field)) {
    [clientId, opponentClientId].forEach(cId => {
      clientConnections[cId].send(JSON.stringify({
        method: "result",
        message: "Draw",
        field: result.field,
      }));
    });
    updateLeaderboard(result.symbol, clientId, opponentClientId, 'draw');
    return;
  }

  [clientId, opponentClientId].forEach(cId => {
    clientConnections[cId].send(JSON.stringify({
      method: "update",
      turn: result.symbol === "X" ? "O" : "X",
      field: result.field,
    }));
  });
}

function closeClient(connection, clientId) {
  connection.close();
  const isLeftUnmachedClient = clientIdsWaitingMatch.some(unmatchedClientId => unmatchedClientId === clientId);

  if (isLeftUnmachedClient) {
    clientIdsWaitingMatch = clientIdsWaitingMatch.filter(unmatchedClientId => unmatchedClientId !== clientId);
  } else {
    const opponentClientId = opponents[clientId];
    clientConnections[opponentClientId].send(JSON.stringify({
      method: "left",
      message: "opponent left",
    }));
  }
}

function updateLeaderboard(symbol, winnerClientId, loserClientId, result) {
  const winnerName = `Player ${winnerClientId}`;
  const loserName = `Player ${loserClientId}`;

  if (result === 'win') {
    db.query(
      'INSERT INTO leaders (player_name, wins) VALUES (?, 1) ON DUPLICATE KEY UPDATE wins = wins + 1',
      [winnerName]
    );
    db.query(
      'INSERT INTO leaders (player_name, losses) VALUES (?, 1) ON DUPLICATE KEY UPDATE losses = losses + 1',
      [loserName]
    );
  } else if (result === 'draw') {
    [winnerName, loserName].forEach(name => {
      db.query(
        'INSERT INTO leaders (player_name, draws) VALUES (?, 1) ON DUPLICATE KEY UPDATE draws = draws + 1',
        [name]
      );
    });
  }

  updateLeaderboardForAllClients();
}

function updateLeaderboardForAllClients() {
  db.query('SELECT * FROM leaders ORDER BY wins DESC, draws DESC, losses ASC LIMIT 14', (error, results) => {
    if (error) {
      console.error('Error fetching leaderboard:', error);
      return;
    }

    wss.clients.forEach(client => {
      client.send(JSON.stringify({
        method: 'leaderboard',
        leaderboard: results
      }));
    });
  });
}

const winningCombos = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // Columns
  [0, 4, 8], [2, 4, 6]              // Diagonals
];

function checkWin(field) {
  return winningCombos.some(combo => {
    const [first, second, third] = combo;
    return field[first] !== "" && field[first] === field[second] && field[first] === field[third];
  });
}

function checkDraw(field) {
  return field.every(symbol => symbol === "X" || symbol === "O");
}

let clientIdCounter = 0;
function createClientId() {
  clientIdCounter++;
  return clientIdCounter;
}

const app = express();
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public', 'static')));

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    return res.redirect('/authorization');
  }
});

app.get('/authorization', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'views', 'registration.html'));
});

app.post('/authorization', (req, res) => {
  const { username , password } = req.body;
  const SELECT_USER_QUERY = `SELECT * FROM users WHERE username = ?`;

  db.query(SELECT_USER_QUERY, [username], async (error, results) => {
      if (error) {
          throw error;
      }

      if (results.length === 1 && bcrypt.compareSync(password, results[0].password)) {
          req.session.user = { nick: username };
          res.redirect('/user');
      } else {
          res.send("Помилка: Цей логін чи пароль неправильні.");
      }
  });
});

app.get('/registration', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'views', 'registration.html'));
});

app.post('/registration', (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const INSERT_USER_QUERY = `INSERT INTO users (username, password) VALUES (?, ?)`;

  db.query(INSERT_USER_QUERY, [username, hashedPassword], (error, results) => {
      if (error) {
          console.error (error)
          res.send("Помилка: Це ім'я зайняте.");
      } else {
          req.session.user = { nick: username };
          res.redirect('/user');
      }
  });
});

app.get('/user', (req, res) => {
  if (req.session.user) {
      res.sendFile(path.join(__dirname, '..', 'public', 'views', 'user.html'));
  } else {
      res.send("Ви не авторизовані.");
  }
});

app.get('/session', (req, res) => {
  res.json({ user: req.session.user });
});
