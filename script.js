// script.js

window.addEventListener('load', () => {
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
  const statusEl = document.getElementById("status");
  const boardEl = document.getElementById("board");
  const playerIndicator = document.getElementById("player-indicator");

  let playerId = localStorage.getItem("playerId");
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem("playerId", playerId);
  }

  const presenceRef = db.ref("presence/" + playerId);
  presenceRef.set(true);
  presenceRef.onDisconnect().remove();

  const playersRef = gameRef.child("players");
  let playerIndex = null;

  playersRef.once("value", snap => {
    const players = snap.val() || {};
    for (let i = 0; i < 4; i++) {
      if (!players[i]) {
        playersRef.child(i).set(playerId);
        playerIndex = i;
        break;
      } else if (players[i] === playerId) {
        playerIndex = i;
        break;
      }
    }
    if (playerIndex !== null) {
      playerIndicator.textContent = `Eres: Jugador ${playerIndex + 1}`;
    }
  });

  gameRef.on("value", snap => {
    const game = snap.val();
    if (!game) return;

    boardEl.innerHTML = "";
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        const key = `${r},${c}`;

        if (game.trails && game.trails[key] != null) {
          const trail = document.createElement("div");
          trail.className = "trail";
          trail.style.backgroundColor = `hsl(${game.trails[key] * 90}, 70%, 60%)`;
          cell.appendChild(trail);
        }

        if (game.pieces && game.pieces[key] != null) {
          const token = document.createElement("span");
          token.className = "token";
          token.textContent = "♟";
          token.style.color = `hsl(${game.pieces[key] * 90}, 70%, 50%)`;
          cell.appendChild(token);

          if (game.turn === game.pieces[key] && game.pieces[key] === playerIndex) {
            cell.onclick = () => {
              localStorage.setItem("selected", key);
              statusEl.textContent = `Seleccionado: ${key}`;
            };
          }
        } else {
          cell.onclick = () => {
            const selected = localStorage.getItem("selected");
            if (!selected) return;

            const [sx, sy] = selected.split(',').map(Number);
            const [dx, dy] = [r, c];
            const dxDiff = Math.abs(dx - sx);
            const dyDiff = Math.abs(dy - sy);

            if (dxDiff <= 1 && dyDiff <= 1 && (dxDiff + dyDiff) > 0) {
              gameRef.transaction(game => {
                if (!game || !game.pieces || game.pieces[selected] !== playerIndex || game.turn !== playerIndex) return;
                game.trails = game.trails || {};
                game.trails[selected] = playerIndex;
                delete game.pieces[selected];
                if (game.pieces[key] != null) delete game.pieces[key];
                game.pieces[key] = playerIndex;
                game.turn = (playerIndex + 1) % 4;
                return game;
              });
              localStorage.removeItem("selected");
            }
          };
        }

        boardEl.appendChild(cell);
      }
    }

    const totalCeldas = 64;
    const ocupadas = Object.keys(game.pieces || {}).length + Object.keys(game.trails || {}).length;
    if (ocupadas === totalCeldas) {
      const puntuaciones = [0, 0, 0, 0];
      Object.values(game.trails || {}).forEach(j => puntuaciones[j]++);
      const maxPuntos = Math.max(...puntuaciones);
      const ganadores = puntuaciones.map((v, i) => v === maxPuntos ? i : null).filter(v => v !== null);
      setTimeout(() => {
        if (ganadores.length > 1) {
          alert(`Empate entre ${ganadores.map(i => `Jugador ${i + 1}`).join(' y ')}`);
        } else {
          alert(`¡Gana Jugador ${ganadores[0] + 1}!`);
        }
        gameRef.set({
          turn: 0,
          pieces: { '0,0': 0, '0,7': 1, '7,0': 2, '7,7': 3 },
          trails: {},
          players: game.players
        });
      }, 200);
    }

    const turno = Number(game.turn);
    statusEl.textContent = isNaN(turno) ? "Esperando turno..." : `Turno de: Jugador ${turno + 1}`;
  });
});
