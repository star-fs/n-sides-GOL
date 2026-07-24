/**
 * Game of Life SPA - Ultra Performance Version (Memoized Geometry)
 * Features: Aperiodic "Hat" Universe + Standard Grids.
 * Optimized for Multi-Core Parallelization.
 */

const WORKER_CODE = `
    self.onmessage = function(e) {
        const { startIdx, endIdx, gridBuffer, nextGridBuffer, neighborBuffer, birthRules, survivalRules } = e.data;
        const grid = new Uint8Array(gridBuffer);
        const nextGrid = new Uint8Array(nextGridBuffer);
        const neighbors = new Int32Array(neighborBuffer);
        const bRules = new Uint8Array(14), sRules = new Uint8Array(14);
        birthRules.forEach(n => bRules[n] = 1);
        survivalRules.forEach(n => sRules[n] = 1);
        const stride = 14;

        for (let idx = startIdx; idx < endIdx; idx++) {
            const nBase = idx * stride;
            const nCount = neighbors[nBase];
            let aliveNeighbors = 0;
            for (let j = 1; j <= nCount; j++) if (grid[neighbors[nBase + j]]) aliveNeighbors++;
            if (grid[idx]) nextGrid[idx] = sRules[aliveNeighbors];
            else nextGrid[idx] = bRules[aliveNeighbors];
        }
        
        const isShared = typeof SharedArrayBuffer !== 'undefined' && gridBuffer instanceof SharedArrayBuffer;
        if (!isShared) {
            const resultSlice = nextGrid.slice(startIdx, endIdx);
            self.postMessage({ status: 'done', startIdx, endIdx, resultSlice }, [resultSlice.buffer]);
        } else {
            self.postMessage({ status: 'done' });
        }
    };
`;

const SQUARE_PRESET = {
    glider: [[0,1], [1,2], [2,0], [2,1], [2,2]],
    spaceship_med: [[1,0], [4,0], [0,1], [0,2], [0,3], [4,3], [1,4], [2,4], [3,4]],
    pulsar: [
        [2,4], [2,5], [2,6], [2,10], [2,11], [2,12],
        [4,2], [4,7], [4,9], [4,14], [5,2], [5,7], [5,9], [5,14], [6,2], [6,7], [6,9], [6,14],
        [7,4], [7,5], [7,6], [7,10], [7,11], [7,12],
        [9,4], [9,5], [9,6], [9,10], [9,11], [9,12],
        [10,2], [10,7], [10,9], [10,14], [11,2], [11,7], [11,9], [11,14], [12,2], [12,7], [12,9], [12,14],
        [14,4], [14,5], [14,6], [14,10], [14,11], [14,12]
    ],
    osc_small: [[0,0], [0,1], [0,2]],
    penta_decathlon: [[0,0], [0,1], [-1,2], [1,2], [0,3], [0,4], [0,5], [0,6], [-1,7], [1,7], [0,8], [0,9]],
    glider_gun: [
        [24,0], [22,1], [24,1], [12,2], [13,2], [20,2], [21,2], [34,2], [35,2],
        [11,3], [15,3], [20,3], [21,3], [34,3], [35,3], [0,4], [1,4], [10,4], [16,4], [20,4], [21,4],
        [0,5], [1,5], [10,5], [14,5], [16,5], [17,5], [22,5], [24,5],
        [10,6], [16,6], [24,6], [11,7], [15,7], [12,8], [13,8]
    ],
    infinite: [[0,0], [1,0], [2,0], [3,0], [4,0], [5,0], [6,0], [7,0], [9,0], [10,0], [11,0], [12,0], [13,0], [17,0], [18,0], [19,0], [26,0], [27,0], [28,0], [29,0], [30,0], [31,0], [32,0], [34,0], [35,0], [36,0], [37,0], [38,0]]
};

const SQRT3 = Math.sqrt(3);

/**
 * Correct "Hat" aperiodic monotile geometry, ported from the reference
 * substitution system published by Smith, Myers, Kaplan & Goodman-Strauss
 * ("An aperiodic monotile", 2023) and its reference implementation
 * (github.com/isohedral/hatviz, BSD-3-Clause). Unlike a periodic grid,
 * the hat tiling can't be built from a fixed per-cell rotation/offset —
 * it requires exact edge-matching affine transforms composed through a
 * hierarchy of four "metatiles" (H, T, P, F), each built from the hat
 * polykite. This block reproduces that substitution exactly; the numeric
 * rule tables below are not arbitrary, they encode the specific
 * combinatorial gluing the proof depends on.
 */
const HAT_HR3 = SQRT3 / 2;
const HAT_IDENT = [1, 0, 0, 0, 1, 0];

function hatHexPt(x, y) { return [x + 0.5 * y, HAT_HR3 * y]; }
function hatAdd2(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function hatSub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function hatScl2(a, s) { return [a[0] * s, a[1] * s]; }
function hatIntersect(p1, q1, p2, q2) {
    const d = (q2[1] - p2[1]) * (q1[0] - p1[0]) - (q2[0] - p2[0]) * (q1[1] - p1[1]);
    const uA = ((q2[0] - p2[0]) * (p1[1] - p2[1]) - (q2[1] - p2[1]) * (p1[0] - p2[0])) / d;
    return [p1[0] + uA * (q1[0] - p1[0]), p1[1] + uA * (q1[1] - p1[1])];
}
function hatInv(T) {
    const det = T[0] * T[4] - T[1] * T[3];
    return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det,
            -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
}
function hatMul(A, B) {
    return [
        A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
        A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]
    ];
}
function hatTrot(a) { return [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0]; }
function hatTtrans(p) { return [1, 0, p[0], 0, 1, p[1]]; }
function hatRotAbout(p, ang) { return hatMul(hatTtrans(p), hatMul(hatTrot(ang), hatTtrans([-p[0], -p[1]]))); }
function hatTransPt(M, P) { return [M[0] * P[0] + M[1] * P[1] + M[2], M[3] * P[0] + M[4] * P[1] + M[5]]; }
function hatMatchSeg(p, q) { return [q[0] - p[0], p[1] - q[1], p[0], q[1] - p[1], q[0] - p[0], p[1]]; }
function hatMatchTwo(p1, q1, p2, q2) { return hatMul(hatMatchSeg(p2, q2), hatInv(hatMatchSeg(p1, q1))); }

class HatGeom {
    constructor(shape) { this.shape = shape; this.width = 1; this.children = []; }
    addChild(T, geom) { this.children.push({ T, geom }); }
    evalChild(n, i) { return hatTransPt(this.children[n].T, this.children[n].geom.shape[i]); }
    recentre() {
        let tr = [0, 0];
        this.shape.forEach(p => { tr = hatAdd2(tr, p); });
        tr = hatScl2(tr, -1 / this.shape.length);
        this.shape = this.shape.map(p => hatAdd2(p, tr));
        const M = hatTtrans(tr);
        for (const ch of this.children) ch.T = hatMul(M, ch.T);
    }
}

// The 13-vertex hat polykite outline, in its canonical kite-grid coordinates.
const HAT_OUTLINE = [
    hatHexPt(0, 0), hatHexPt(-1, -1), hatHexPt(0, -2), hatHexPt(2, -2),
    hatHexPt(2, -1), hatHexPt(4, -2), hatHexPt(5, -1), hatHexPt(4, 0),
    hatHexPt(3, 0), hatHexPt(2, 2), hatHexPt(0, 3), hatHexPt(0, 2),
    hatHexPt(-1, 2)
];
// One shared leaf geometry per hat "role"; only the transform differs per use.
const H1_HAT = new HatGeom(HAT_OUTLINE);
const H_HAT = new HatGeom(HAT_OUTLINE);
const T_HAT = new HatGeom(HAT_OUTLINE);
const P_HAT = new HatGeom(HAT_OUTLINE);
const F_HAT = new HatGeom(HAT_OUTLINE);

// Level-0 metatiles: how each of H, T, P, F is built from a small cluster of hats.
const HAT_H_INIT = (function () {
    const outline = [[0, 0], [4, 0], [4.5, HAT_HR3], [2.5, 5 * HAT_HR3], [1.5, 5 * HAT_HR3], [-0.5, HAT_HR3]];
    const meta = new HatGeom(outline); meta.width = 2;
    meta.addChild(hatMatchTwo(HAT_OUTLINE[5], HAT_OUTLINE[7], outline[5], outline[0]), H_HAT);
    meta.addChild(hatMatchTwo(HAT_OUTLINE[9], HAT_OUTLINE[11], outline[1], outline[2]), H_HAT);
    meta.addChild(hatMatchTwo(HAT_OUTLINE[5], HAT_OUTLINE[7], outline[3], outline[4]), H_HAT);
    meta.addChild(hatMul(hatTtrans([2.5, HAT_HR3]), hatMul([-0.5, -HAT_HR3, 0, HAT_HR3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), H1_HAT);
    return meta;
}());
const HAT_T_INIT = (function () {
    const outline = [[0, 0], [3, 0], [1.5, 3 * HAT_HR3]];
    const meta = new HatGeom(outline); meta.width = 2;
    meta.addChild([0.5, 0, 0.5, 0, 0.5, HAT_HR3], T_HAT);
    return meta;
}());
const HAT_P_INIT = (function () {
    const outline = [[0, 0], [4, 0], [3, 2 * HAT_HR3], [-1, 2 * HAT_HR3]];
    const meta = new HatGeom(outline); meta.width = 2;
    meta.addChild([0.5, 0, 1.5, 0, 0.5, HAT_HR3], P_HAT);
    meta.addChild(hatMul(hatTtrans([0, 2 * HAT_HR3]), hatMul([0.5, HAT_HR3, 0, -HAT_HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), P_HAT);
    return meta;
}());
const HAT_F_INIT = (function () {
    const outline = [[0, 0], [3, 0], [3.5, HAT_HR3], [3, 2 * HAT_HR3], [-1, 2 * HAT_HR3]];
    const meta = new HatGeom(outline); meta.width = 2;
    meta.addChild([0.5, 0, 1.5, 0, 0.5, HAT_HR3], F_HAT);
    meta.addChild(hatMul(hatTtrans([0, 2 * HAT_HR3]), hatMul([0.5, HAT_HR3, 0, -HAT_HR3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), F_HAT);
    return meta;
}());

// Assembles a fixed 29-metatile patch of H/T/P/F pieces, glued edge-to-edge.
// The rule table is the published gluing combinatorics — not tunable.
function hatConstructPatch(H, T, P, F) {
    const rules = [
        ['H'],
        [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2],
        [0, 4, 'F', 3], [2, 4, 'F', 3], [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0],
        [10, 2, 'H', 0], [11, 4, 'P', 2], [12, 0, 'H', 2], [13, 0, 'F', 3], [14, 2, 'F', 1],
        [15, 3, 'H', 4], [8, 2, 'F', 1], [17, 3, 'H', 0], [18, 2, 'P', 0], [19, 2, 'H', 2],
        [20, 4, 'F', 3], [20, 0, 'P', 2], [22, 0, 'H', 2], [23, 4, 'F', 3], [23, 0, 'F', 3],
        [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3]
    ];
    const ret = new HatGeom([]);
    ret.width = H.width;
    const shapes = { H, T, P, F };
    for (const r of rules) {
        if (r.length === 1) {
            ret.addChild(HAT_IDENT, shapes[r[0]]);
        } else if (r.length === 4) {
            const poly = ret.children[r[0]].geom.shape;
            const RT = ret.children[r[0]].T;
            const P0 = hatTransPt(RT, poly[(r[1] + 1) % poly.length]);
            const Q0 = hatTransPt(RT, poly[r[1]]);
            const nshp = shapes[r[2]], npoly = nshp.shape;
            ret.addChild(hatMatchTwo(npoly[r[3]], npoly[(r[3] + 1) % npoly.length], P0, Q0), nshp);
        } else {
            const chP = ret.children[r[0]], chQ = ret.children[r[2]];
            const P0 = hatTransPt(chQ.T, chQ.geom.shape[r[3]]);
            const Q0 = hatTransPt(chP.T, chP.geom.shape[r[1]]);
            const nshp = shapes[r[4]], npoly = nshp.shape;
            ret.addChild(hatMatchTwo(npoly[r[5]], npoly[(r[5] + 1) % npoly.length], P0, Q0), nshp);
        }
    }
    return ret;
}

// Extracts the next, larger generation of H/T/P/F supertiles from a patch.
function hatConstructMetatiles(patch) {
    const bps1 = patch.evalChild(8, 2);
    const bps2 = patch.evalChild(21, 2);
    const rbps = hatTransPt(hatRotAbout(bps1, -2.0 * Math.PI / 3.0), bps2);
    const p72 = patch.evalChild(7, 2);
    const p252 = patch.evalChild(25, 2);
    const llc = hatIntersect(bps1, rbps, patch.evalChild(6, 2), p72);
    let w = hatSub2(patch.evalChild(6, 2), llc);

    const newHOutline = [llc, bps1];
    w = hatTransPt(hatTrot(-Math.PI / 3), w);
    newHOutline.push(hatAdd2(newHOutline[1], w));
    newHOutline.push(patch.evalChild(14, 2));
    w = hatTransPt(hatTrot(-Math.PI / 3), w);
    newHOutline.push(hatSub2(newHOutline[3], w));
    newHOutline.push(patch.evalChild(6, 2));
    const newH = new HatGeom(newHOutline); newH.width = patch.width * 2;
    for (const ch of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) newH.addChild(patch.children[ch].T, patch.children[ch].geom);

    const newPOutline = [p72, hatAdd2(p72, hatSub2(bps1, llc)), bps1, llc];
    const newP = new HatGeom(newPOutline); newP.width = patch.width * 2;
    for (const ch of [7, 2, 3, 4, 28]) newP.addChild(patch.children[ch].T, patch.children[ch].geom);

    const newFOutline = [bps2, patch.evalChild(24, 2), patch.evalChild(25, 0), p252, hatAdd2(p252, hatSub2(llc, bps1))];
    const newF = new HatGeom(newFOutline); newF.width = patch.width * 2;
    for (const ch of [21, 20, 22, 23, 24, 25]) newF.addChild(patch.children[ch].T, patch.children[ch].geom);

    const AAA = newHOutline[2];
    const BBB = hatAdd2(newHOutline[1], hatSub2(newHOutline[4], newHOutline[5]));
    const CCC = hatTransPt(hatRotAbout(BBB, -Math.PI / 3), AAA);
    const newT = new HatGeom([BBB, CCC, AAA]); newT.width = patch.width * 2;
    newT.addChild(patch.children[11].T, patch.children[11].geom);

    newH.recentre(); newP.recentre(); newF.recentre(); newT.recentre();
    return [newH, newT, newP, newF];
}

// Runs `levels` rounds of substitution, then walks the resulting hierarchy
// down to individual hat polygons (each an array of {x,y} points).
function buildHatTiling(levels, scale) {
    let tiles = [HAT_H_INIT, HAT_T_INIT, HAT_P_INIT, HAT_F_INIT];
    for (let i = 0; i < levels; i++) {
        const patch = hatConstructPatch(...tiles);
        tiles = hatConstructMetatiles(patch);
    }
    const out = [];
    const stack = [{ T: [scale, 0, 0, 0, scale, 0], geom: tiles[0], level: levels }];
    while (stack.length) {
        const t = stack.pop();
        if (t.level >= 0) {
            for (const g of t.geom.children) stack.push({ T: hatMul(t.T, g.T), geom: g.geom, level: t.level - 1 });
        } else {
            out.push(t.geom.shape.map(p => { const q = hatTransPt(t.T, p); return { x: q[0], y: q[1] }; }));
        }
    }
    return out;
}

const DEFAULT_RULES = {
    square: { birth: "3", survival: "23" },
    hex: { birth: "3", survival: "23" },
    tri: { birth: "3", survival: "23" },
    diamond: { birth: "2", survival: "23" },
    hat: { birth: "3", survival: "23" }
};

const PRESETS = {
    square: SQUARE_PRESET, hex: SQUARE_PRESET, tri: SQUARE_PRESET, diamond: SQUARE_PRESET, hat: {}
};

const state = {
    grid: null, nextGrid: null, neighborBuffer: null,
    gridBuffer: null, nextGridBuffer: null, neighborRawBuffer: null,
    workers: [], numWorkers: navigator.hardwareConcurrency || 4, workersReady: 0,
    width: 75, height: 75, totalCells: 0, generation: 0, isPlaying: false, speed: 100, density: 0.2,
    tiling: 'square',
    rulesByGrid: { ...DEFAULT_RULES },
    zoom: 1, pan: { x: 0, y: 0 }, canvas: null, ctx: null, cellSize: 20, cellPaths: [],
    visibleIndices: [] 
};

// --- DOM Elements ---
const btnPlay = document.getElementById('btn-play'), btnPause = document.getElementById('btn-pause');
const btnStep = document.getElementById('btn-step'), btnClear = document.getElementById('btn-clear');
const btnReset = document.getElementById('btn-reset'), btnRandom = document.getElementById('btn-random');
const selectPreset = document.getElementById('select-preset'), btnLoadPreset = document.getElementById('btn-load-preset');
const inputWidth = document.getElementById('input-width'), inputHeight = document.getElementById('input-height');
const inputBirth = document.getElementById('input-birth'), inputSurvival = document.getElementById('input-survival');
const inputSpeed = document.getElementById('input-speed'), inputDensity = document.getElementById('input-density');
const speedValue = document.getElementById('speed-value'), selectTiling = document.getElementById('select-tiling');
const statGen = document.getElementById('stat-gen'), viewportContainer = document.getElementById('viewport-container');

function init() {
    state.canvas = document.getElementById('viewport');
    state.ctx = state.canvas.getContext('2d', { alpha: false });
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); setupWorkers(); updateRules(); resetGrid(); setupEventListeners();
    requestAnimationFrame(renderLoop);
}

function setupWorkers() {
    state.workers = [];
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    for (let i = 0; i < state.numWorkers; i++) {
        const worker = new Worker(workerUrl);
        worker.onmessage = handleWorkerMessage;
        state.workers.push(worker);
    }
}

function handleWorkerMessage(e) {
    if (e.data.status === 'done') {
        if (e.data.resultSlice) state.nextGrid.set(e.data.resultSlice, e.data.startIdx);
        state.workersReady++;
        if (state.workersReady === state.numWorkers) onGenerationComplete();
    }
}

function onGenerationComplete() {
    const temp = state.grid; state.grid = state.nextGrid; state.nextGrid = temp;
    const tempBuf = state.gridBuffer; state.gridBuffer = state.nextGridBuffer; state.nextGridBuffer = tempBuf;
    state.generation++; statGen.textContent = state.generation;
    if (state.isPlaying) setTimeout(triggerStep, state.speed);
}

function resizeCanvas() {
    state.canvas.width = viewportContainer.clientWidth;
    state.canvas.height = viewportContainer.clientHeight;
    updateVisibilityCache();
}

function resetGrid() {
    pause();
    state.generation = 0; statGen.textContent = 0;
    state.width = parseInt(inputWidth.value); state.height = parseInt(inputHeight.value);
    state.tiling = selectTiling.value;
    setupGridData();
}

function setupGridData() {
    if (state.tiling === 'hat') { setupHatGrid(); return; }
    const cellsPerCoord = 1;
    state.totalCells = state.width * state.height * cellsPerCoord;
    const stride = 14; const neighborBytes = state.totalCells * stride * 4;
    try {
        state.gridBuffer = new SharedArrayBuffer(state.totalCells);
        state.nextGridBuffer = new SharedArrayBuffer(state.totalCells);
        state.neighborRawBuffer = new SharedArrayBuffer(neighborBytes);
    } catch (e) {
        state.gridBuffer = new ArrayBuffer(state.totalCells);
        state.nextGridBuffer = new ArrayBuffer(state.totalCells);
        state.neighborRawBuffer = new ArrayBuffer(neighborBytes);
    }
    state.grid = new Uint8Array(state.gridBuffer);
    state.nextGrid = new Uint8Array(state.nextGridBuffer);
    state.neighborBuffer = new Int32Array(state.neighborRawBuffer);

    state.cellPaths = [];
    for (let idx = 0; idx < state.totalCells; idx++) {
        const c = getCoordsFromIndex(idx, 1);
        state.cellPaths.push(calculateCellPath(c.x, c.y, c.i));
        const nCoords = getNeighborCoords(c.x, c.y, c.i);
        const nBase = idx * stride;
        state.neighborBuffer[nBase] = nCoords.length;
        for (let j = 0; j < nCoords.length; j++) {
            const nc = nCoords[j];
            const wx = (nc.x + state.width) % state.width;
            const wy = (nc.y + state.height) % state.height;
            state.neighborBuffer[nBase + 1 + j] = (wy * state.width + wx) + (nc.i || 0);
        }
    }
    updateVisibilityCache();
}

function setupHatGrid() {
    const scale = 20;
    const gridW = state.width * scale, gridH = state.height * scale;

    // Grow the substitution by levels until the generated patch comfortably
    // covers the requested grid extent (with margin, since we crop to a
    // centered box below and want real hats up to that box's edges).
    const targetSpan = 1.35 * Math.max(state.width, state.height) * scale;
    let level = 1, rawHats;
    for (; level <= 8; level++) {
        rawHats = buildHatTiling(level, scale);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const poly of rawHats) for (const p of poly) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        if (Math.min(maxX - minX, maxY - minY) >= targetSpan) break;
    }

    // Centre the patch on its own bounding box, then crop to the requested extent.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of rawHats) for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const hats = rawHats.map(poly => {
        const pts = poly.map(p => ({ x: p.x - centerX, y: p.y - centerY }));
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        return { points: pts, x: cx, y: cy };
    });

    const filteredHats = hats.filter(h => Math.abs(h.x) < gridW/2 && Math.abs(h.y) < gridH/2);
    
    state.totalCells = filteredHats.length;
    const stride = 14, neighborBytes = state.totalCells * stride * 4;
    try {
        state.gridBuffer = new SharedArrayBuffer(state.totalCells);
        state.nextGridBuffer = new SharedArrayBuffer(state.totalCells);
        state.neighborRawBuffer = new SharedArrayBuffer(neighborBytes);
    } catch (e) {
        state.gridBuffer = new ArrayBuffer(state.totalCells);
        state.nextGridBuffer = new ArrayBuffer(state.totalCells);
        state.neighborRawBuffer = new ArrayBuffer(neighborBytes);
    }
    state.grid = new Uint8Array(state.gridBuffer);
    state.nextGrid = new Uint8Array(state.nextGridBuffer);
    state.neighborBuffer = new Int32Array(state.neighborRawBuffer);
    state.cellPaths = filteredHats.map(h => ({ type: 'path', points: h.points, x: h.x, y: h.y }));

    const vertexMap = new Map(), precision = 10;
    filteredHats.forEach((h, idx) => {
        h.points.forEach(p => {
            const key = `${Math.round(p.x * precision)},${Math.round(p.y * precision)}`;
            if (!vertexMap.has(key)) vertexMap.set(key, []);
            vertexMap.get(key).push(idx);
        });
    });

    for (let idx = 0; idx < state.totalCells; idx++) {
        const neighborCounts = new Map();
        filteredHats[idx].points.forEach(p => {
            const key = `${Math.round(p.x * precision)},${Math.round(p.y * precision)}`;
            vertexMap.get(key).forEach(nIdx => { if (nIdx !== idx) neighborCounts.set(nIdx, (neighborCounts.get(nIdx) || 0) + 1); });
        });
        const nList = [];
        neighborCounts.forEach((count, nIdx) => { if (count >= 2) nList.push(nIdx); });
        const nBase = idx * stride;
        state.neighborBuffer[nBase] = Math.min(nList.length, stride - 1);
        for (let j = 0; j < state.neighborBuffer[nBase]; j++) state.neighborBuffer[nBase + 1 + j] = nList[j];
    }
    updateVisibilityCache();
}

function getCoordsFromIndex(idx, cellsPerCoord) {
    const i = idx % cellsPerCoord;
    const coordIdx = Math.floor(idx / cellsPerCoord);
    return { x: coordIdx % state.width, y: Math.floor(coordIdx / state.width), i };
}

function updateVisibilityCache() {
    if (!state.cellPaths.length) return;
    const { canvas, zoom, pan, totalCells, cellPaths } = state, offset = getGridCenterOffset();
    const s = state.cellSize, invZoom = 1 / zoom;
    const minX = (-canvas.width/2 - pan.x) * invZoom + offset.x - s, maxX = (canvas.width/2 - pan.x) * invZoom + offset.x + s;
    const minY = (-canvas.height/2 - pan.y) * invZoom + offset.y - s, maxY = (canvas.height/2 - pan.y) * invZoom + offset.y + s;
    state.visibleIndices = [];
    for (let i = 0; i < totalCells; i++) {
        const p = cellPaths[i]; 
        if (!p) continue;
        let cx = p.x, cy = p.y;
        if (p.transform) { cx = p.transform.tx; cy = p.transform.ty; }
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) state.visibleIndices.push(i);
    }
}

function triggerStep() {
    if (!state.grid) return;
    state.workersReady = 0;
    const cellsPerWorker = Math.ceil(state.totalCells / state.numWorkers);
    for (let i = 0; i < state.numWorkers; i++) {
        const start = i * cellsPerWorker, end = Math.min(start + cellsPerWorker, state.totalCells);
        state.workers[i].postMessage({
            startIdx: start, endIdx: end, 
            gridBuffer: state.gridBuffer, nextGridBuffer: state.nextGridBuffer, neighborBuffer: state.neighborRawBuffer,
            birthRules: Array.from(state.rules.birth), survivalRules: Array.from(state.rules.survival)
        });
    }
}

function renderLoop() { draw(); requestAnimationFrame(renderLoop); }

function draw() {
    if (!state.grid) return;
    const { ctx, canvas, grid, visibleIndices, cellPaths, zoom, pan } = state;
    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width/2 + pan.x, canvas.height/2 + pan.y); ctx.scale(zoom, zoom);
    const offset = getGridCenterOffset(); ctx.translate(-offset.x, -offset.y);
    const aliveColor = getComputedStyle(document.documentElement).getPropertyValue('--alive-color').trim();
    const deadColor = '#1e293b';
    ctx.fillStyle = deadColor;
    for (let j = 0; j < visibleIndices.length; j++) { const i = visibleIndices[j]; if (!grid[i]) drawPath(ctx, cellPaths[i]); }
    ctx.fillStyle = aliveColor;
    for (let j = 0; j < visibleIndices.length; j++) { const i = visibleIndices[j]; if (grid[i]) drawPath(ctx, cellPaths[i]); }
    ctx.restore();
}

function calculateCellPath(x, y, i) {
    const s = state.cellSize;
    if (state.tiling === 'square') return { type: 'rect', x: x * s, y: y * s, w: s - 1, h: s - 1 };
    if (state.tiling === 'diamond') {
        const ox = x * s + (y % 2 ? s / 2 : 0), oy = y * (s / 2);
        const points = [{x: ox + s/2, y: oy}, {x: ox + s, y: oy + s/2}, {x: ox + s/2, y: oy + s}, {x: ox, y: oy + s/2}];
        return { type: 'path', points, x: ox, y: oy };
    }
    if (state.tiling === 'hex') {
        const r = s / 2, h = r * Math.sqrt(3), cx = x * h * 1.05 + (y % 2 ? h / 2 : 0), cy = y * r * 1.5, points = [];
        for (let j = 0; j < 6; j++) { const a = (j * 60 - 30) * Math.PI / 180; points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
        return { type: 'path', points, x: cx, y: cy };
    }
    if (state.tiling === 'tri') {
        const h = s, isUp = (x + y) % 2 === 0, cx = x * (s / 2), cy = y * h;
        const points = isUp ? [{x: cx, y: cy + h}, {x: cx + s, y: cy + h}, {x: cx + s/2, y: cy}] : [{x: cx, y: cy}, {x: cx + s, y: cy}, {x: cx + s/2, y: cy + h}];
        return { type: 'path', points, x: cx, y: cy };
    }
}

function getNeighborCoords(x, y, i) {
    if (state.tiling === 'square') {
        const res = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) res.push({x: x + dx, y: y + dy});
        return res;
    }
    if (state.tiling === 'diamond') return [{x: x, y: y + 1}, {x: x, y: y - 1}, {x: x + 1, y: y}, {x: x - 1, y: y}];
    if (state.tiling === 'hex') {
        const dirs = (y % 2 === 0) ? [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 0]] : [[-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
        return dirs.map(([dx, dy]) => ({x: x + dx, y: y + dy}));
    }
    if (state.tiling === 'tri') {
        const isUp = (x + y) % 2 === 0;
        return isUp ? [{x:x-1, y}, {x:x+1, y}, {x:x, y:y+1}] : [{x:x-1, y}, {x:x+1, y}, {x:x, y:y-1}];
    }
}

function getGridCenterOffset() {
    const s = state.cellSize;
    if (state.tiling === 'square') return { x: (state.width * s) / 2, y: (state.height * s) / 2 };
    if (state.tiling === 'diamond') return { x: (state.width * s + s/2) / 2, y: (state.height * s/2 + s/2) / 2 };
    if (state.tiling === 'hex') return { x: (state.width * s * 0.9) / 2, y: (state.height * s * 0.75) / 2 };
    if (state.tiling === 'tri') return { x: (state.width * s / 4), y: (state.height * s) / 2 };
    return { x: 0, y: 0 };
}

function drawPath(ctx, path) {
    ctx.save();
    if (path.type === 'rect') ctx.fillRect(path.x, path.y, path.w, path.h);
    else if (path.type === 'path') {
        ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let j = 1; j < path.points.length; j++) ctx.lineTo(path.points[j].x, path.points[j].y);
        ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}

function updateRules() {
    const bVal = inputBirth.value, sVal = inputSurvival.value;
    state.rulesByGrid[state.tiling] = { birth: bVal, survival: sVal };
    const parse = (str) => str.split('').map(Number);
    state.rules = { birth: parse(bVal), survival: parse(sVal) };
}

function randomize() { pause(); for (let i = 0; i < state.totalCells; i++) state.grid[i] = Math.random() < state.density ? 1 : 0; }
function clear() { pause(); state.grid.fill(0); state.generation = 0; statGen.textContent = 0; }
function play() { if (state.isPlaying) return; state.isPlaying = true; btnPlay.disabled = true; btnPause.disabled = false; triggerStep(); }
function pause() { state.isPlaying = false; btnPlay.disabled = false; btnPause.disabled = true; }

function setupEventListeners() {
    btnPlay.onclick = play; btnPause.onclick = pause; btnStep.onclick = triggerStep;
    btnClear.onclick = clear; btnReset.onclick = resetGrid; btnRandom.onclick = randomize;
    btnLoadPreset.onclick = () => loadPreset(selectPreset.value);
    selectTiling.onchange = () => {
        const rules = state.rulesByGrid[selectTiling.value];
        if (rules) { inputBirth.value = rules.birth; inputSurvival.value = rules.survival; updateRules(); }
        resetGrid();
    };
    inputWidth.onchange = resetGrid; inputHeight.onchange = resetGrid;
    inputSpeed.oninput = (e) => { state.speed = parseInt(e.target.value); speedValue.textContent = `${state.speed}ms`; };
    inputDensity.oninput = (e) => state.density = parseFloat(e.target.value);
    inputBirth.onchange = updateRules; inputSurvival.onchange = updateRules;

    let isDragging = false, isDrawing = false, lastMousePos = { x: 0, y: 0 };
    state.canvas.oncontextmenu = (e) => e.preventDefault();
    state.canvas.onmousedown = (e) => {
        const rect = state.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if (e.button === 0 && !e.shiftKey) { isDrawing = true; setCellAt(mx, my, true); }
        else if (e.button === 2 || (e.button === 0 && e.shiftKey)) { isDragging = true; }
        lastMousePos = { x: e.clientX, y: e.clientY };
    };
    window.onmousemove = (e) => {
        const rect = state.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        if (isDrawing) { setCellAt(mx, my, true); }
        else if (isDragging) {
            state.pan.x += (e.clientX - lastMousePos.x); state.pan.y += (e.clientY - lastMousePos.y);
            updateVisibilityCache();
        }
        lastMousePos = { x: e.clientX, y: e.clientY };
    };
    window.onmouseup = () => { isDragging = false; isDrawing = false; };
    viewportContainer.onwheel = (e) => { e.preventDefault(); state.zoom *= e.deltaY > 0 ? 0.9 : 1.1; updateVisibilityCache(); };
    document.getElementById('btn-zoom-in').onclick = () => { state.zoom *= 1.2; updateVisibilityCache(); };
    document.getElementById('btn-zoom-out').onclick = () => { state.zoom /= 1.2; updateVisibilityCache(); };
    document.getElementById('btn-zoom-reset').onclick = () => { state.zoom = 1; state.pan = {x:0, y:0}; updateVisibilityCache(); };
}

function loadPreset(type) {
    if (!type || state.tiling === 'hat') return;
    clear();
    const preset = PRESETS[state.tiling][type];
    if (!preset) return;
    const cx = Math.floor(state.width / 2), cy = Math.floor(state.height / 2);
    const cellsPerCoord = 1;
    preset.forEach(coord => {
        let x, y, i = 0;
        if (Array.isArray(coord)) { [x, y] = coord; } else { ({x, y, i} = coord); }
        const tx = cx + x, ty = cy + y;
        if (tx >= 0 && tx < state.width && ty >= 0 && ty < state.height) {
            const idx = (ty * state.width + tx) * cellsPerCoord + i;
            state.grid[idx] = 1;
        }
    });
}

function setCellAt(mx, my, alive) {
    const { canvas, zoom, pan, width, height, tiling, cellSize, cellPaths, totalCells } = state;
    const offset = getGridCenterOffset();
    const tx = (mx - canvas.width/2 - pan.x) / zoom + offset.x;
    const ty = (my - canvas.height/2 - pan.y) / zoom + offset.y;

    if (tiling === 'hat') {
        for (let i = 0; i < totalCells; i++) {
            const p = cellPaths[i];
            if (isPointInPoly(p.points, {x: tx, y: ty})) {
                state.grid[i] = alive ? 1 : 0;
                return;
            }
        }
        return;
    }

    let gx, gy, cellsPerCoord = 1;
    if (tiling === 'hex') {
        const r = cellSize / 2, h = r * Math.sqrt(3);
        gy = Math.floor(ty / (r * 1.5)); gx = Math.floor((tx - (gy % 2 ? h / 2 : 0)) / (h * 1.05));
    } else if (tiling === 'tri') {
        const s = cellSize, h = s;
        gy = Math.floor(ty / h); gx = Math.floor(tx / (s / 2));
    } else if (tiling === 'diamond') {
        gy = Math.floor(ty / (cellSize / 2)); gx = Math.floor((tx - (gy % 2 ? cellSize / 2 : 0)) / cellSize);
    } else {
        gx = Math.floor(tx / cellSize); gy = Math.floor(ty / cellSize);
    }

    if (gx < 0 || gx >= width || gy < 0 || gy >= height) return;
    const startIdx = (gy * width + gx) * cellsPerCoord;
    for (let i = 0; i < cellsPerCoord; i++) {
        const idx = startIdx + i; const p = cellPaths[idx];
        if (!p) continue;
        let hit = false;
        if (p.type === 'rect') hit = tx >= p.x && tx <= p.x + p.w && ty >= p.y && ty <= p.y + p.h;
        else if (p.type === 'path') hit = isPointInPoly(p.points, {x: tx, y: ty});
        if (hit) {
            if (state.grid[idx] !== (alive ? 1 : 0)) { state.grid[idx] = alive ? 1 : 0; }
            break;
        }
    }
}

function isPointInPoly(poly, pt) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

init();
