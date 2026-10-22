export type ShellType =
  | 'senrin'
  | 'peony'
  | 'chrysanthemum'
  | 'willow'
  | 'heart'
  | 'ring'
  | 'multibreak'
  | 'cascade' // 三段連環
  | 'crackle'
  | 'text'
  | 'fan'
  | 'kamuro' // 冠菊
  | 'palm' // 椰子
  | 'ground' // 地面火花
  | 'pistil' // 雙芯
  | 'starmine' // 速射連發
  | 'giant'; // internal: 長岡 giant chrysanthemum (finale only)

export type SceneId = 'town' | 'field' | 'lake' | 'sky' | 'tw101' | 'needle';
/** landmark scenes: fireworks launch FROM the building (emitters on its corners / ledges / spire) */
export const LANDMARK_SCENES: SceneId[] = ['tw101', 'needle'];
/** scenes: only 'lake' renders water + reflection (the most expensive passes) */
export const SCENES: { id: SceneId; label: string }[] = [
  { id: 'town', label: '小鎮車站' },
  { id: 'field', label: '河岸草地' },
  { id: 'lake', label: '湖面倒影' },
  { id: 'sky', label: '純夜空' },
  { id: 'tw101', label: '台北 101' },
  { id: 'needle', label: '西雅圖 Space Needle' },
];

export type FinaleKind = 'classic' | 'nagaoka' | 'phoenix' | 'tower';
export const FINALES: { id: FinaleKind | 'random'; label: string }[] = [
  { id: 'classic', label: '經典終章' },
  { id: 'nagaoka', label: '長岡巨型' },
  { id: 'phoenix', label: '鳳凰亂舞' },
  { id: 'tower', label: '大樓秀' }, // landmark scenes only
  { id: 'random', label: '隨機' },
];
/** set pieces fire from the ground / in place, no shell rocket */
export const SET_PIECES: ShellType[] = ['fan', 'ground', 'starmine'];

export type ThemeId = 'sakura' | 'cyan' | 'crimson' | 'amethyst' | 'indigo' | 'mixed';

export interface Theme {
  id: ThemeId;
  name: string;
  swatch: string; // CSS for UI dot
  palettes: string[][];
  glitter: string[];
  smoke: string; // smoke tint (lit)
  smokeLit: number; // ambient smoke glow 0..1
  smokeAmount: number;
  horizon: string; // sky colour near horizon
  weights: Partial<Record<ShellType, number>>;
  finale: ShellType[];
}

export const THEMES: Theme[] = [
  {
    id: 'sakura',
    name: '櫻桃紅',
    swatch: 'linear-gradient(135deg,#ff4fa3,#ff2d55 55%,#e040fb)',
    palettes: [
      ['#ff4fa3', '#ff86c8', '#ffd1ea'],
      ['#ff2d55', '#ff6b8b', '#ff9aa8'],
      ['#e040fb', '#ff4fd8', '#ff9bf0'],
      ['#ffffff', '#ffc0e0', '#ff7ab8'],
      ['#ff3b6b', '#ffd36b', '#ff86c8'],
    ],
    glitter: ['#fff4fb', '#ffd1ea', '#ffe6a8'],
    smoke: '#ff7fb0',
    smokeLit: 0.12,
    smokeAmount: 1,
    horizon: '#16060f',
    weights: { cascade: 1, senrin: 6, peony: 2, chrysanthemum: 2, ring: 1, heart: 1, crackle: 1, multibreak: 1, pistil: 2, starmine: 0.8, kamuro: 0.8 },
    finale: ['senrin', 'senrin', 'peony', 'crackle', 'multibreak', 'chrysanthemum', 'cascade'],
  },
  {
    id: 'cyan',
    name: '青碧光扇',
    swatch: 'linear-gradient(135deg,#00e5ff,#14ffc8 55%,#2fa8ff)',
    palettes: [
      ['#00e5ff', '#7ff6ff', '#d8feff'],
      ['#14ffc8', '#a0ffe8', '#e0fff7'],
      ['#2fa8ff', '#bfeaff', '#7fd8ff'],
      ['#ffffff', '#9ffcff', '#3fe0ff'],
    ],
    glitter: ['#e8ffff', '#a8fff4', '#ffffff'],
    smoke: '#58e0ee',
    smokeLit: 0.15,
    smokeAmount: 1,
    horizon: '#03121a',
    weights: { cascade: 1, fan: 3, senrin: 3, peony: 2, chrysanthemum: 2, ring: 2, pistil: 2, starmine: 1, ground: 0.6 },
    finale: ['fan', 'senrin', 'fan', 'chrysanthemum', 'ring', 'senrin'],
  },
  {
    id: 'crimson',
    name: '赤焰煙雲',
    swatch: 'linear-gradient(135deg,#ff1a1a,#ff5a36 55%,#b30000)',
    palettes: [
      ['#ff1a1a', '#ff4d2e', '#ff8a65'],
      ['#ff3b30', '#ff6a4d', '#ffb199'],
      ['#ff0040', '#ff3355', '#ff5a36'],
      ['#ff2200', '#ff7a1a', '#ffc27a'],
    ],
    glitter: ['#ffd9a0', '#ff9a5a', '#fff0d0'],
    smoke: '#ff7a2a',
    smokeLit: 0.55,
    smokeAmount: 2.2,
    horizon: '#1a0602',
    weights: { cascade: 1, senrin: 4, peony: 3, chrysanthemum: 2, willow: 1, multibreak: 1, kamuro: 1, palm: 1, ground: 0.6 },
    finale: ['senrin', 'peony', 'senrin', 'chrysanthemum', 'multibreak'],
  },
  {
    id: 'amethyst',
    name: '紫晶閃耀',
    swatch: 'linear-gradient(135deg,#b84dff,#ff5fd2 55%,#8a5cff)',
    palettes: [
      ['#b84dff', '#e09bff', '#f3d6ff'],
      ['#ff5fd2', '#ffb3ec', '#ffe0f7'],
      ['#8a5cff', '#c9b3ff', '#efe6ff'],
      ['#ffffff', '#f0d0ff', '#d68bff'],
    ],
    glitter: ['#ffffff', '#f6dcff', '#ffc8f0'],
    smoke: '#c07aff',
    smokeLit: 0.18,
    smokeAmount: 1.2,
    horizon: '#0f0618',
    weights: { cascade: 1, crackle: 3, senrin: 3, peony: 2, multibreak: 2, chrysanthemum: 1, heart: 1, pistil: 2, starmine: 1 },
    finale: ['crackle', 'senrin', 'crackle', 'multibreak', 'senrin', 'peony'],
  },
  {
    id: 'indigo',
    name: '深藍星夜',
    swatch: 'linear-gradient(135deg,#2a4bff,#5a3dff 55%,#a8c4ff)',
    palettes: [
      ['#2a4bff', '#6f8bff', '#c2ceff'],
      ['#5a3dff', '#9d8cff', '#ddd6ff'],
      ['#3f7bff', '#a8c4ff', '#e6eeff'],
      ['#e8eaff', '#b8c0ff', '#7c6bff'],
    ],
    glitter: ['#eef0ff', '#c8d2ff', '#ffffff'],
    smoke: '#6a7aff',
    smokeLit: 0.12,
    smokeAmount: 1,
    horizon: '#04061a',
    weights: { cascade: 1, senrin: 4, peony: 3, ring: 2, chrysanthemum: 2, crackle: 1, pistil: 2, kamuro: 1, starmine: 0.8 },
    finale: ['senrin', 'peony', 'ring', 'senrin', 'chrysanthemum'],
  },
  {
    id: 'mixed',
    name: '繽紛',
    swatch: 'conic-gradient(#ff4fa3,#ffd36b,#14ffc8,#2fa8ff,#b84dff,#ff4fa3)',
    palettes: [
      ['#ff4fa3', '#ffd1ea'],
      ['#ffd36b', '#fff1c2'],
      ['#14ffc8', '#a0ffe8'],
      ['#2fa8ff', '#bfeaff'],
      ['#b84dff', '#e09bff'],
      ['#ff3b30', '#ffb199'],
      ['#7dff4f', '#d8ffc2'],
    ],
    glitter: ['#fff6d8', '#ffffff', '#ffe08a'],
    smoke: '#ffc890',
    smokeLit: 0.12,
    smokeAmount: 1,
    horizon: '#0a0812',
    weights: { cascade: 1, senrin: 3, peony: 2, chrysanthemum: 2, willow: 2, heart: 1, ring: 1, multibreak: 2, crackle: 2, fan: 1, kamuro: 1.5, palm: 1.5, pistil: 2, ground: 0.8, starmine: 1 },
    finale: ['senrin', 'willow', 'crackle', 'multibreak', 'peony', 'chrysanthemum', 'cascade'],
  },
];

export const SHELLS: { id: ShellType | 'random'; label: string }[] = [
  { id: 'random', label: '隨機' },
  { id: 'senrin', label: '千輪' },
  { id: 'peony', label: '牡丹' },
  { id: 'chrysanthemum', label: '菊花' },
  { id: 'willow', label: '柳' },
  { id: 'heart', label: '愛心' },
  { id: 'ring', label: '圓環' },
  { id: 'multibreak', label: '多段' },
  { id: 'cascade', label: '三段連環' },
  { id: 'crackle', label: '閃爍' },
  { id: 'fan', label: '光扇' },
  { id: 'kamuro', label: '冠菊' },
  { id: 'palm', label: '椰子' },
  { id: 'pistil', label: '雙芯' },
  { id: 'ground', label: '地面火花' },
  { id: 'starmine', label: '速射連發' },
  { id: 'text', label: '文字' },
];
