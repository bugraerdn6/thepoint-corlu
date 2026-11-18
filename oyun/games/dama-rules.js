// Türk daması kural motoru — saf fonksiyonlar.
// Tahta: 64 hücre, satır 0 en üst. 1 = beyaz taş, 2 = beyaz dama, -1 = siyah taş, -2 = siyah dama, 0 = boş.
// Beyaz (taraf 0) yukarı (satır azalır), siyah (taraf 1) aşağı gider. Taşlar ileri ve yana gider, geri ve çapraz yok.
// Yeme zorunlu ve en çok taş yiyen yol seçilmek zorunda. Yenen taş hemen kalkar. Dama düz çizgide uzaktan yer,
// yeme sırasında 180° dönemez. Son sıraya hamlesini bitiren taş dama olur.

export const idx = (r, c) => r * 8 + c;
export const rc = (i) => [Math.floor(i / 8), i % 8];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const sideOf = (v) => (v > 0 ? 0 : v < 0 ? 1 : -1);
const isKing = (v) => Math.abs(v) === 2;
const fwd = (side) => (side === 0 ? -1 : 1);

export function initialBoard() {
  const b = new Array(64).fill(0);
  for (let c = 0; c < 8; c++) { b[idx(1, c)] = -1; b[idx(2, c)] = -1; b[idx(5, c)] = 1; b[idx(6, c)] = 1; }
  return b;
}

// Bir taşın yön listesi: taş için ileri + yanlar, dama için dört yön
const dirsFor = (v, side) => (isKing(v) ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[fwd(side), 0], [0, -1], [0, 1]]);

// Bir taştan başlayan bütün yeme dizileri (en uzunlar ayrıca seçilir)
function captureSeqs(b, from, side) {
  const v = b[from];
  const out = [];
  const dfs = (board, pos, path, caps, lastDir) => {
    let extended = false;
    const [r, c] = rc(pos);
    for (const [dr, dc] of dirsFor(v, side)) {
      if (lastDir && dr === -lastDir[0] && dc === -lastDir[1]) continue; // 180° dönüş yok
      if (!isKing(v)) {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (!inside(r2, c2)) continue;
        const mid = idx(r1, c1), land = idx(r2, c2);
        if (sideOf(board[mid]) === 1 - side && board[land] === 0) {
          const nb = board.slice(); nb[mid] = 0; nb[pos] = 0; nb[land] = v;
          extended = true;
          dfs(nb, land, [...path, land], [...caps, mid], [dr, dc]);
        }
      } else {
        // dama: boşluklardan geç, ilk rakip taşı bul, arkasındaki boş karelerden birine in
        let rr = r + dr, cc = c + dc;
        while (inside(rr, cc) && board[idx(rr, cc)] === 0) { rr += dr; cc += dc; }
        if (!inside(rr, cc) || sideOf(board[idx(rr, cc)]) !== 1 - side) continue;
        const mid = idx(rr, cc);
        let lr = rr + dr, lc = cc + dc;
        while (inside(lr, lc) && board[idx(lr, lc)] === 0) {
          const land = idx(lr, lc);
          const nb = board.slice(); nb[mid] = 0; nb[pos] = 0; nb[land] = v;
          extended = true;
          dfs(nb, land, [...path, land], [...caps, mid], [dr, dc]);
          lr += dr; lc += dc;
        }
      }
    }
    if (!extended && caps.length) out.push({ path, caps });
  };
  dfs(b, from, [from], [], null);
  return out;
}

// Taraf için bütün yasal hamleler: [{ path:[kareler], caps:[yenenler] }]
export function legalMoves(b, side) {
  let caps = [];
  for (let i = 0; i < 64; i++) if (sideOf(b[i]) === side) caps.push(...captureSeqs(b, i, side));
  if (caps.length) {
    const max = Math.max(...caps.map((m) => m.caps.length));
    return caps.filter((m) => m.caps.length === max); // en çok yiyen yol zorunlu
  }
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (sideOf(v) !== side) continue;
    const [r, c] = rc(i);
    for (const [dr, dc] of dirsFor(v, side)) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc) && b[idx(rr, cc)] === 0) {
        moves.push({ path: [i, idx(rr, cc)], caps: [] });
        if (!isKing(v)) break;
        rr += dr; cc += dc;
      }
    }
  }
  return moves;
}

export function applyMove(b, m) {
  const nb = b.slice();
  const from = m.path[0], to = m.path[m.path.length - 1];
  let v = nb[from];
  nb[from] = 0;
  for (const c of m.caps) nb[c] = 0;
  const side = sideOf(v);
  const [r] = rc(to);
  if (!isKing(v) && ((side === 0 && r === 0) || (side === 1 && r === 7))) v = side === 0 ? 2 : -2; // dama oldu
  nb[to] = v;
  return nb;
}

export const encMove = (m) => m.path.join("-");
export const count = (b, side) => b.filter((v) => sideOf(v) === side).length;
