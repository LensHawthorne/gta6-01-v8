// Save / continue via localStorage: money, RP, missions done, shells,
// upgrades, time of day and the player's spot. Nothing leaves the browser.
const KEY = 'solara-bay-save-v8';

export function saveGame(gameState) {
  try {
    const data = {
      money: gameState.money,
      rp: gameState.rp,
      shellsGot: gameState.shellsGot,
      missionsDone: [...gameState.missionsDone],
      upgradesOwned: [...gameState.upgradesOwned],
      upgrades: gameState.upgrades,
      timeHours: gameState.timeHours,
      player: { x: gameState.playerX, z: gameState.playerZ },
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function hasSave() {
  return loadGame() !== null;
}
