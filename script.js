// Configurar Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCPcfbyxWNJr9DksBdmJrnZe4Fs3ZnINtY",
  authDomain: "juego-ocupacion.firebaseapp.com",
  databaseURL: "https://juego-ocupacion-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "juego-ocupacion",
  storageBucket: "juego-ocupacion.appspot.com",
  messagingSenderId: "567270483949",
  appId: "1:567270483949:web:7b5150bd422b5175a8e4"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const gameRef = db.ref("games/partida1");
const playersRef = gameRef.child("players");
const namesRef = gameRef.child("names");

const SIZE = 8;
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const playerIndicator = document.getElementById("player-indicator");
const nameInput = document.getElementById("name-input");
const nameBtn = document.getElementById("name-btn");
const scoresEl = document.getElementById("scores");

let playerIndex = null;
let sessionId = localStorage.getItem("ocupaSession");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("ocupaSession", sessionId);
}

let namesMap = {};

function playTone(freq) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
}

function initBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.coord = `${r},${c}`;
      cell.onclick = () => onCellClick(cell);
      boardEl.appendChild(cell);
    }
  }
}

function onCellClick(cell) {
  const coord = cell.dataset.coord;
  gameRef.once("value").then(snap => {
    const g = snap.val();
    if (!g || playerIndex === null) return;

    const turn = g.turn;
    if (turn !== playerIndex) return;

    const pieces = g.pieces || {};
    const trails = g.trails || {};
    const current = Object.entries(pieces).find(([, p]) => p === playerIndex);
    if (!current) return;

    const [fromCoord] = current;
    const [fx, fy] = fromCoord.split(",").map(Number);
    const [tx, ty] = coord.split(",").map(Number);
    const dx = Math.abs(fx - tx), dy = Math.abs(fy - ty);

    if ((dx + dy !== 1 && !(dx === 1 && dy === 1)) || pieces[coord]) return;

    playTone(300 + playerIndex * 100);

    // Ejecutar movimiento
    gameRef.transaction(g => {
      if (!g) return;
      g.pieces = g.pieces || {};
      g.trails = g.trails || {};

      g.trails[fromCoord] = playerIndex;
      delete g.pieces[fromCoord];
      g.pieces[coord] = playerIndex;

      let next = (g.turn + 1) % 4;
      const vivos = new Set(Object.values(g.pieces));
      while (!vivos.has(next) && vivos.size > 1) {
        next = (next + 1) % 4;
      }
      g.turn = next;

      const total = Object.keys(g.trails).length + Object.keys(g.pieces).length;
      if (total >= SIZE * SIZE) {
        const count = [0, 0, 0, 0];
        Object.values(g.trails).forEach(p => count[p]++);
        const max = Math.max(...count);
        const winners = count.map((v, i) => (v === max ? i : null)).filter(v => v !== null);

        setTimeout(() => {
          if (winners.length === 1) {
            alert(`¡Gana ${namesMap[winners[0]] || "Jugador " + (winners[0] + 1)} con ${max} trazas!`);
          } else {
            alert(`Empate entre ${winners.map(i => namesMap[i] || "Jugador " + (i + 1)).join(" y ")}`);
          }

          gameRef.update({
            turn: 0,
            pieces: {
              "0,0": 0,
              "0,7": 1,
              "7,0": 2,
              "7,7": 3
            },
            trails: {}
          });
        }, 200);
      }

      return g;
    });
  });
}

function updateUI(g) {
  const turn = g.turn;
  const pieces = g.pieces || {};
  const trails = g.trails || {};

  document.querySelectorAll(".cell").forEach(cell => {
    const coord = cell.dataset.coord;
    cell.innerHTML = "";
    cell.className = "cell";

    if (trails[coord] != null) {
      cell.style.background = playerColor(trails[coord]) + "33";
    } else {
      cell.style.background = "white";
    }

    if (pieces[coord] != null) {
      const icon = document.createElement("span");
      icon.className = "token";
      icon.textContent = "♟";
      icon.style.color = playerColor(pieces[coord]);
      cell.appendChild(icon);
    }
  });

  if (typeof turn === "number") {
    const name = namesMap[turn] || `Jugador ${turn + 1}`;
    statusEl.textContent = `Turno de: ${name}`;
  } else {
    statusEl.textContent = "Esperando turno…";
  }

  updateScores(trails);
}

function updateScores(trails) {
  const count = [0, 0, 0, 0];
  Object.values(trails).forEach(p => count[p]++);
  scoresEl.innerHTML = "";
  count.forEach((v, i) => {
    const div = document.createElement("div");
    div.className = "score";
    div.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;display:inline-block;background:${playerColor(i)}"></span> ${namesMap[i] || `Jugador ${i + 1}`}: ${v}`;
    scoresEl.appendChild(div);
  });
}

function playerColor(i) {
  return ["#e74c3c", "#27ae60", "#1abc9c", "#9b59b6"][i] || "#ccc";
}

function assignPlayer() {
  playersRef.transaction(players => {
    players = players || {};
    const ids = Object.values(players);
    const index = Object.entries(players).find(([k, v]) => v === sessionId);
    if (index) {
      playerIndex = parseInt(index[0]);
    } else if (ids.length < 4) {
      playerIndex = ids.length;
      players[playerIndex] = sessionId;
    }
    return players;
  }, () => {
    if (playerIndex !== null) {
      playerIndicator.textContent = `Eres: Jugador ${playerIndex + 1}`;

      const presenceRef = db.ref("presence/" + sessionId);
      presenceRef.set(true);
      presenceRef.onDisconnect().remove();

      const name = localStorage.getItem("ocupaName");
      if (name) nameInput.value = name;
      nameBtn.onclick = () => {
        const n = nameInput.value.trim();
        if (n) {
          namesRef.child(playerIndex).set(n);
          localStorage.setItem("ocupaName", n);
        }
      };
    }
  });
}

// Listeners
gameRef.on("value", snap => {
  const g = snap.val();
  if (!g) return;
  updateUI(g);
});

namesRef.on("value", snap => {
  namesMap = snap.val() || {};
});

// Iniciar
initBoard();
assignPlayer();
