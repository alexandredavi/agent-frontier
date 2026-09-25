import type { ResourceId, Terrain, Tile } from './types';

const LEGEND: Record<string, Tile> = {
  '#': { terrain: 'nevoa', node: null },
  '.': { terrain: 'planicie', node: null },
  ':': { terrain: 'cratera', node: null },
  '^': { terrain: 'rocha', node: null },
  r: { terrain: 'planicie', node: 'regolito' },
  i: { terrain: 'cratera', node: 'gelo' },
};

export class GameMap {
  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly tiles: Tile[],
  ) {}

  static fromAscii(rows: string[]): GameMap {
    if (rows.length === 0) throw new Error('Mapa vazio');
    const width = rows[0].length;
    const tiles: Tile[] = [];
    rows.forEach((row, y) => {
      if (row.length !== width) {
        throw new Error(`Linha ${y} do mapa tem ${row.length} colunas (esperado ${width})`);
      }
      for (const ch of row) {
        const t = LEGEND[ch];
        if (!t) throw new Error(`Caractere desconhecido '${ch}' na linha ${y}`);
        tiles.push({ ...t });
      }
    });
    return new GameMap(width, rows.length, tiles);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile | undefined {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x] : undefined;
  }

  terrainAt(x: number, y: number): Terrain | undefined {
    return this.get(x, y)?.terrain;
  }

  nodeAt(x: number, y: number): ResourceId | null {
    return this.get(x, y)?.node ?? null;
  }
}
