/**
 * Pixel-art assets for the Live Theater: palette, 16x16 sprites, a 5x7 bitmap font, and tiny drawing helpers.
 * Sprites/font were generated procedurally (see art/gen.py in the delivery) and previewed before use.
 * No dependencies; every helper works on a plain CanvasRenderingContext2D or returns data for SVG.
 */
export const PALETTE: Record<string, string> = {
  k: "#050b18", d: "#1b3350", D: "#2c4f7a", w: "#eaf6ff", W: "#a9c7e8", c: "#2ee6ff", C: "#12a4c0", b: "#4c8dff", B: "#2a5bd0",
  p: "#b06cff", P: "#7a3fd1", t: "#2de2c4", T: "#14a58f", g: "#52f08a", G: "#22a85a", y: "#ffd34d", Y: "#c9961a",
  r: "#ff5d78", R: "#b82a45", o: "#ff9a3d", s: "#ffd9b8", S: "#e0a77c", n: "#e0c2ff", m: "#b06cff", M: "#7a3fd1",
};

export type SpriteName = "doc" | "parse" | "chip" | "shield" | "core" | "nurse" | "lock" | "tick" | "cross" | "warn";
export const SPRITES: Record<SpriteName, string[]> = {"doc":["...kkkkkkk......","..kwwwwwwwk.....","..kwcccccwWkk...","..kwcccccwWWWk..","..kwwwwwwwwwwk..","..kwbbbbbbbbwk..","..kwwwwwwwwwwk..","..kwbbbbbbbwwk..","..kwwwwwwwwwwk..","..kwbbbbbbbbwk..","..kwwwwwwwwwwk..","..kwbbbbbbwwwk..","..kwwwwwwwwwwk..","..kwWWWWWWWWwk..","..kwwwwwwwwwwk..","...kkkkkkkkkk..."],"parse":["................",".kkkkkkkkkkkkkk.",".kcccccckbbbbbk.",".kcccccckbbbbbk.",".kkkkkkkkkkkkkk.","................",".kkkkkkkkkkkkkk.",".kttttkppppkyyk.",".kttttkppppkyyk.",".kkkkkkkkkkkkkk.","................",".kkkkkkkkkkkkkk.",".kggggggkoooook.",".kggggggkoooook.",".kkkkkkkkkkkkkk.","................"],"chip":["....k.k.k.k.....","....n.n.n.n.....","..kkkkkkkkkkkk..","..kMMMMMMMMMMk..","..kMkkkkkkkkMk..","knkMkmmmmmmkMknk","..kMkmmmmmmkMk..","knkMkmmmmmmkMknk","..kMkmmmmmmkMk..","knkMkmmmmmmkMknk","..kMkkkkkkkkMk..","knkMMMMMMMMMMknk","..kkkkkkkkkkkk..","....n.n.n.n.....","....k.k.k.k.....","................"],"shield":["...kkkkkkkkkk...","..kGGGGGGGGGGk..",".kGggggggggggGk.",".kGggggggggggGk.",".kGggggggggggGk.",".kGgggggggwwgGk.",".kGggwgggwwggGk.",".kGggwwgwwgggGk.",".kGgggwwwggggGk.","..kGGGGwGGGGGk..","..kGGGGGGGGGGk..","...kGGGGGGGGk...","....kGGGGGGk....",".....kGGGGk.....","......kGGk......",".......kk......."],"core":[".....kppk.......","..kk.kppk..kk...",".kttkkkBkkkttk..",".kttkbbbbbbttk..","..kkbbbBkbbbk...","..kbbBccccBbbk..","kkkbbccccccbbkk.","ppkbkccwwcckbppk","ppBbBccwwccBbppk","kkkbbccccccbbkk.","..kbbBccccBbbk..",".kttbbbkBbbttk..",".kttkbbbbbbttk..","..kk.kkppkkkk...","......kppk......",".......kk......."],"nurse":["....kwwwwwwk....","...kwwrrrrwwk...","...kwwwrrwwwk...","...kwwwwwwwwk...","....kssssssk....","...kssssssssk...","...kssksskssk...","...kssssssssk...","....kssSSssk....","...kkksssskkk...","..kcccwwwwccck..","..kbbbwwwwbbbk..","..kbbbwwwwbbbk..","..kbbbbbbbbbbk..","..kbbbbbbbbbbk..","...kkkkkkkkkk..."],"lock":["................","......kkkk......",".....kWWWWk.....","....kWWWWWWk....","...kWWWkkWWWk...","...kWWk..kWWk...","...kWWk..kWWk...","..kkkkkkkkkkkk..","..kyyyyyyyyyyk..","..kyyyyyyyyyyk..","..kyyyykkyyyyk..","..kyyyykkyyyyk..","..kyyyykkyyyyk..","..kYYYYYYYYYYk..","..kkkkkkkkkkkk..","................"],"tick":["........",".......g","......gg",".g...gg.",".gg.gg..","..ggg...","...g....","........"],"cross":["........",".r....r.","..r..r..","...rr...","...rr...","..r..r..",".r....r.","........"],"warn":["...yy...","...yy...","...yy...","...yy...","...yy...","........","...yy...","...yy..."]};

/** Chip recolour maps: Reader A is purple, Reader B is teal. */
export const REMAP_A: Record<string, string> = { m: "#b06cff", M: "#7a3fd1", n: "#e0c2ff" };
export const REMAP_B: Record<string, string> = { m: "#2de2c4", M: "#14a58f", n: "#b8fff0" };

export const FONT: Record<string, string[]> = {"A":[".###.","#...#","#...#","#####","#...#","#...#","#...#"],"B":["####.","#...#","#...#","####.","#...#","#...#","####."],"C":[".####","#....","#....","#....","#....","#....",".####"],"D":["####.","#...#","#...#","#...#","#...#","#...#","####."],"E":["#####","#....","#....","####.","#....","#....","#####"],"F":["#####","#....","#....","####.","#....","#....","#...."],"G":[".####","#....","#....","#.###","#...#","#...#",".###."],"H":["#...#","#...#","#...#","#####","#...#","#...#","#...#"],"I":["###",".#.",".#.",".#.",".#.",".#.","###"],"J":["..###","...#.","...#.","...#.","...#.","#..#.",".##.."],"K":["#...#","#..#.","#.#..","##...","#.#..","#..#.","#...#"],"L":["#....","#....","#....","#....","#....","#....","#####"],"M":["#...#","##.##","#.#.#","#.#.#","#...#","#...#","#...#"],"N":["#...#","##..#","#.#.#","#..##","#...#","#...#","#...#"],"O":[".###.","#...#","#...#","#...#","#...#","#...#",".###."],"P":["####.","#...#","#...#","####.","#....","#....","#...."],"Q":[".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#"],"R":["####.","#...#","#...#","####.","#.#..","#..#.","#...#"],"S":[".####","#....","#....",".###.","....#","....#","####."],"T":["#####","..#..","..#..","..#..","..#..","..#..","..#.."],"U":["#...#","#...#","#...#","#...#","#...#","#...#",".###."],"V":["#...#","#...#","#...#","#...#","#...#",".#.#.","..#.."],"W":["#...#","#...#","#...#","#.#.#","#.#.#","##.##","#...#"],"X":["#...#","#...#",".#.#.","..#..",".#.#.","#...#","#...#"],"Y":["#...#","#...#",".#.#.","..#..","..#..","..#..","..#.."],"Z":["#####","....#","...#.","..#..",".#...","#....","#####"],"0":[".###.","#...#","#..##","#.#.#","##..#","#...#",".###."],"1":["..#..",".##..","..#..","..#..","..#..","..#..",".###."],"2":[".###.","#...#","....#","...#.","..#..",".#...","#####"],"3":["#####","...#.","..#..","...#.","....#","#...#",".###."],"4":["...#.","..##.",".#.#.","#..#.","#####","...#.","...#."],"5":["#####","#....","####.","....#","....#","#...#",".###."],"6":["..##.",".#...","#....","####.","#...#","#...#",".###."],"7":["#####","....#","...#.","..#..",".#...",".#...",".#..."],"8":[".###.","#...#","#...#",".###.","#...#","#...#",".###."],"9":[".###.","#...#","#...#",".####","....#","...#.",".##.."],":":["...",".#.","...","...",".#.","...","..."],".":["..","..","..","..","..","##","##"],"-":[".....",".....",".....","#####",".....",".....","....."],"/":["....#","....#","...#.","..#..",".#...","#....","#...."],"%":["##..#","##.#.","...#.","..#..",".#...",".#.##","#..##"],"+":[".....","..#..","..#..","#####","..#..","..#..","....."],"!":["#","#","#","#","#",".","#"],"?":[".###.","#...#","....#","...#.","..#..",".....","..#.."]," ":["...","...","...","...","...","...","..."],"(":["..#",".#.","#..","#..","#..",".#.","..#"],")":["#..",".#.","..#","..#","..#",".#.","#.."],"'":["#","#",".",".",".",".","."],"_":[".....",".....",".....",".....",".....",".....","#####"],"<":["...#.","..#..",".#...","#....",".#...","..#..","...#."],">":[".#...","..#..","...#.","....#","...#.","..#..",".#..."],"#":[".#.#.",".#.#.","#####",".#.#.","#####",".#.#.",".#.#."],"=":[".....",".....","#####",".....","#####",".....","....."]};

/** Draws a sprite with its top-left at (x, y); `scale` is the size of one sprite pixel. */
export function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, scale = 1, remap?: Record<string, string>, alpha = 1): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === ".") continue;
      ctx.fillStyle = remap?.[ch] ?? PALETTE[ch] ?? "#fff";
      ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), scale, scale);
    }
  }
  ctx.globalAlpha = prev;
}

const glyph = (ch: string): string[] | undefined => FONT[ch] ?? FONT[ch.toUpperCase()];

export function textWidth(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text) { const g = glyph(ch); w += ((g ? g[0].length : 3) + 1) * scale; }
  return Math.max(0, w - scale);
}

/** Pixel text on a canvas. align: "left" | "center" | "right" relative to x. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string, align: "left" | "center" | "right" = "left"): void {
  const w = textWidth(text, scale);
  let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = color;
  for (const ch of text) {
    const g = glyph(ch);
    if (g) for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === "#") ctx.fillRect(Math.round(cx + i * scale), Math.round(y + j * scale), scale, scale);
    cx += ((g ? g[0].length : 3) + 1) * scale;
  }
}

/** Pixel text as SVG rectangles (accessible: the caller adds role="img" and aria-label). */
export function textRects(text: string): { w: number; h: number; pts: [number, number][] } {
  const pts: [number, number][] = [];
  let cx = 0;
  for (const ch of text) {
    const g = glyph(ch);
    if (g) for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === "#") pts.push([cx + i, j]);
    cx += (g ? g[0].length : 3) + 1;
  }
  return { w: Math.max(1, cx - 1), h: 7, pts };
}
