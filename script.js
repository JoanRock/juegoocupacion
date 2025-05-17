/* ---------- Configuración Firebase ---------- */
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

const db          = firebase.database();
const gameRef     = db.ref("games/partida1");
const playersRef  = gameRef.child("players");
const namesRef    = gameRef.child("names");

/* ---------- Elementos del DOM ---------- */
const SIZE      = 8;
const boardEl   = document.getElementById("board");
const statusEl  = document.getElementById("status");
const scoresEl  = document.getElementById("scores");
const playerInd = document.getElementById("player-indicator");
const nameInput = document.getElementById("name-input");
const nameBtn   = document.getElementById("name-btn");

/* ---------- Sesión & colores ---------- */
let sessionId   = localStorage.getItem("ocupaSession") || crypto.randomUUID();
localStorage.setItem("ocupaSession", sessionId);
let playerIndex = null;
let namesMap    = {};
const COLORS    = ["#e74c3c", "#27ae60", "#1abc9c", "#9b59b6"];

/* ---------- Utilidades ---------- */
const playerColor = i => COLORS[i] || "#ccc";
function playTone(freq) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.5);
}

/* ---------- Tablero ---------- */
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

/* ---------- Clic en celda ---------- */
function onCellClick(cell) {
  const coord = cell.dataset.coord;
  gameRef.once("value").then(snap => {
    const g = snap.val();
    if (!g || playerIndex == null || g.turn !== playerIndex) return;

    const current = Object.entries(g.pieces || {})
      .find(([, p]) => p === playerIndex);
    if (!current) return;

    const [from]      = current;
    const [fx, fy]    = from.split(",").map(Number);
    const [tx, ty]    = coord.split(",").map(Number);
    const dx = Math.abs(fx - tx), dy = Math.abs(fy - ty);
    if ((dx + dy !== 1 && !(dx === 1 && dy === 1)) || g.pieces[coord]) return;

    playTone(300 + playerIndex * 100);

    /* ---- Transacción de movimiento ---- */
    gameRef.transaction(g => {
      if (!g) return;
      g.pieces = g.pieces || {};
      g.trails = g.trails || {};

      g.trails[from] = playerIndex;
      delete g.pieces[from];
      g.pieces[coord] = playerIndex;
      g.lastMove = Date.now();

      /* Turno siguiente */
      let next = (g.turn + 1) % 4;
      const vivos = new Set(Object.values(g.pieces));
      while (!vivos.has(next) && vivos.size > 1) next = (next + 1) % 4;
      g.turn = next;

      /* Tablero lleno → ganador por trazas */
      const total = Object.keys(g.trails).length + Object.keys(g.pieces).length;
      if (total >= SIZE * SIZE) endGameByTrails(g);
      return g;
    });
  });
}

/* ---------- Fin de partida por trazas ---------- */
function endGameByTrails(g) {
  const counts = [0, 0, 0, 0];
  Object.values(g.trails).forEach(p => counts[p]++);
  const max = Math.max(...counts);
  const winners = counts
    .map((v, i) => (v === max ? i : null))
    .filter(i => i != null);

  setTimeout(() => {
    if (winners.length === 1) {
      alert(`¡Gana ${namesMap[winners[0]] || "Jugador " + (winners[0] + 1)} con ${max} trazas!`);
    } else {
      alert(`Empate entre ${winners.map(i => namesMap[i] || "Jugador " + (i + 1)).join(" y ")}`);
    }
    /* Reinicio: mantiene players & names */
    gameRef.update({
      turn: 0,
      pieces: { "0,0":0, "0,7":1, "7,0":2, "7,7":3 },
      trails: {},
      lastMove: Date.now()
    });
  }, 300);
}

/* ---------- Render UI ---------- */
function updateUI(g) {
  const pieces = g.pieces || {}, trails = g.trails || {};
  document.querySelectorAll(".cell").forEach(cell => {
    const coord = cell.dataset.coord;
    cell.textContent = ""; cell.style.background = "#fff";
    if (trails[coord] != null) cell.style.background = playerColor(trails[coord]) + "33";
    if (pieces[coord] != null) {
      const tok = document.createElement("span");
      tok.className = "token";
      tok.textContent = "♟";
      tok.style.color = playerColor(pieces[coord]);
      cell.appendChild(tok);
    }
  });
  /* Estado turno */
  statusEl.textContent = `Turno de: ${namesMap[g.turn] || "Jugador " + (g.turn + 1)}`;
  /* Marcador */
  const count = [0,0,0,0];
  Object.values(trails).forEach(p => count[p]++);
  scoresEl.innerHTML = "";
  count.forEach((v,i) => {
    const div = document.createElement("div");
    div.className = "score";
    div.innerHTML =
      `<span style="width:12px;height:12px;border-radius:50%;display:inline-block;background:${playerColor(i)}"></span> ${namesMap[i] || "Jugador " + (i+1)}: ${v}`;
    scoresEl.appendChild(div);
  });
}

/* ---------- Asignación robusta de jugador ---------- */
function assignPlayer() {
  /* 1. Presencia viva */
  const presenceRef = db.ref("presence/" + sessionId);
  presenceRef.set(true);
  presenceRef.onDisconnect().remove();

  /* 2. Transacción para reclamar slot */
  playersRef.transaction(players => {
    players = players || {};
    /* Si ya estamos, conservar índice */
    for (const [idx, sid] of Object.entries(players)) {
      if (sid === sessionId) { playerIndex = Number(idx); return players; }
    }
    /* Liberar slots con sesiones sin presencia */
    return players;
  }).then(() => {
    /* Segundo paso: intentar de nuevo reclamando hueco libre */
    playersRef.transaction(players => {
      players = players || {};
      for (const [idx, sid] of Object.entries(players))
        if (sid === sessionId) { playerIndex = Number(idx); return players; }
      for (let i=0;i<4;i++)
        if (!players[i]) { players[i] = sessionId; playerIndex = i; break; }
      return players;
    }, () => {
      if (playerIndex == null) { alert("Sala llena (4/4)."); return; }
      playerInd.textContent = `Eres: Jugador ${playerIndex + 1}`;
      playersRef.child(playerIndex).onDisconnect().remove();

      const prev = localStorage.getItem("ocupaName") || "";
      if (prev) nameInput.value = prev;
      nameBtn.onclick = () => {
        const n = nameInput.value.trim();
        if (n) { namesRef.child(playerIndex).set(n); localStorage.setItem("ocupaName", n); }
      };
    });
  });
}

/* ---------- Limpieza de slots huérfanos ---------- */
db.ref("presence").on("value", snap => {
  const present = new Set(Object.keys(snap.val() || {}));
  playersRef.once("value").then(psnap => {
    const pl = psnap.val() || {};
    Object.entries(pl).forEach(([idx,sid]) => {
      if (!present.has(sid)) playersRef.child(idx).remove();
    });
  });
});

/* ---------- AFK reset: 10 minutos --------- */
setInterval(() => {
  gameRef.child("lastMove").once("value").then(snap => {
    const last = snap.val(); if (!last) return;
    if (Date.now() - last > 10 * 60 * 1000) {
      console.log("⏰ Reinicio por inactividad");
      gameRef.set({
        turn: 0,
        players: {},
        names: {},
        pieces: { "0,0":0, "0,7":1, "7,0":2, "7,7":3 },
        trails: {},
        lastMove: Date.now()
      });
    }
  });
}, 10000); // cada 10 s

/* ---------- Suscripciones ---------- */
gameRef.on("value", s => s.val() && updateUI(s.val()));
namesRef.on("value", s => namesMap = s.val() || {});

/* ---------- Inicio ---------- */
initBoard();
assignPlayer();
