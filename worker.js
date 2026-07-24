/**
 * Game of Life Multi-Core Worker
 * Parallelized Simulation logic
 */

self.onmessage = function(e) {
    const { 
        startIdx, 
        endIdx, 
        width, 
        height, 
        tiling, 
        birthRules, 
        survivalRules, 
        gridBuffer, 
        nextGridBuffer 
    } = e.data;

    const grid = new Uint8Array(gridBuffer);
    const nextGrid = new Uint8Array(nextGridBuffer);
    const bSet = new Set(birthRules);
    const sSet = new Set(survivalRules);

    const cellsPerCoord = 1;

    for (let idx = startIdx; idx < endIdx; idx++) {
        // Calculate neighbors on the fly to avoid passing massive index arrays
        const neighbors = getNeighborIndices(idx, width, height, tiling, cellsPerCoord);
        
        let aliveNeighbors = 0;
        for (let j = 0; j < neighbors.length; j++) {
            if (grid[neighbors[j]]) aliveNeighbors++;
        }

        if (grid[idx]) {
            nextGrid[idx] = sSet.has(aliveNeighbors) ? 1 : 0;
        } else {
            nextGrid[idx] = bSet.has(aliveNeighbors) ? 1 : 0;
        }
    }

    self.postMessage({ status: 'done' });
};

function getNeighborIndices(idx, width, height, tiling, cellsPerCoord) {
    const i = idx % cellsPerCoord;
    const coordIdx = Math.floor(idx / cellsPerCoord);
    const x = coordIdx % width;
    const y = Math.floor(coordIdx / width);
    const res = [];

    const mod = (v, m) => (v + m) % m;
    const getIdx = (nx, ny, ni = 0) => (mod(ny, height) * width + mod(nx, width)) * cellsPerCoord + ni;

    if (tiling === 'square') {
        for (let dy = -1; dy <= 1; dy++) 
            for (let dx = -1; dx <= 1; dx++) 
                if (dx !== 0 || dy !== 0) res.push(getIdx(x + dx, y + dy));
    } else if (tiling === 'diamond') {
        res.push(getIdx(x, y + 1), getIdx(x, y - 1), getIdx(x + 1, y), getIdx(x - 1, y));
    } else if (tiling === 'hex') {
        const dirs = (y % 2 === 0) ? [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 0]] 
                                   : [[-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
        for (let d = 0; d < dirs.length; d++) res.push(getIdx(x + dirs[d][0], y + dirs[d][1]));
    } else if (tiling === 'tri') {
        for (let dy = -1; dy <= 1; dy++) 
            for (let dx = -2; dx <= 2; dx++) 
                if (dx !== 0 || dy !== 0) res.push(getIdx(x + dx, y + dy));
    }
    return res;
}
