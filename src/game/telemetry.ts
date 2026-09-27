/**
 * Telemetria do playtest que depende do navegador: FPS por minuto de jogo e o ambiente de cada sessão.
 * Sem Phaser nem DOM no nível do módulo, para ser testável; quem chama passa `navigator`, `window` etc.
 */
import type { DiarySession } from '../sim/types';
import type { World } from '../sim/world';

/**
 * Mede quadros em janelas de 1 s. `take()` devolve o FPS médio e o do pior segundo desde a última chamada
 * (arredondados), ou null se não houve quadros medidos.
 */
export class FrameMeter {
  private frames = 0;
  private time = 0;
  private secFrames = 0;
  private secTime = 0;
  private worst = Infinity;

  /** Registra um quadro que levou `dt` segundos reais. */
  add(dt: number): void {
    if (!(dt > 0) || dt > 5) return; // aba em segundo plano ou relógio pulando: não é FPS de verdade
    this.frames++;
    this.time += dt;
    this.secFrames++;
    this.secTime += dt;
    if (this.secTime >= 1) {
      this.worst = Math.min(this.worst, this.secFrames / this.secTime);
      this.secFrames = 0;
      this.secTime = 0;
    }
  }

  take(): { avg: number; min: number } | null {
    if (this.frames === 0 || this.time <= 0) return null;
    const avg = this.frames / this.time;
    const min = Number.isFinite(this.worst) ? this.worst : avg;
    this.frames = 0;
    this.time = 0;
    this.worst = Infinity;
    return { avg: Math.round(avg), min: Math.round(min) };
  }
}

/**
 * Grava o FPS nas amostras do Diário: chamado a cada quadro; quando a simulação cria uma amostra nova,
 * ela recebe o FPS medido desde a anterior. Ao trocar de mundo (carregar, novo jogo) recomeça a medição
 * sem mexer nas amostras antigas.
 */
export class DiaryFps {
  private world: World | null = null;
  private last: object | undefined;

  constructor(private readonly meter = new FrameMeter()) {}

  /** `dt` = segundos reais do quadro, ou null quando não é para medir (tela de abertura). */
  update(world: World, dt: number | null): void {
    const newest = world.diary.samples[world.diary.samples.length - 1];
    if (world !== this.world) {
      this.world = world;
      this.last = newest;
      this.meter.take();
    } else if (newest && newest !== this.last) {
      this.last = newest;
      const f = this.meter.take();
      if (f) {
        newest.fps = f.avg;
        newest.fpsMin = f.min;
      }
    }
    if (dt !== null) this.meter.add(dt);
  }
}

/** Navegador e sistema a partir do user agent (o suficiente para separar sessões, não para estatística fina). */
export function parseUserAgent(ua: string): { browser: string; os: string } {
  const ver = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0] ?? '';
  let browser = 'Outro';
  if (/Edg\//.test(ua)) browser = `Edge ${ver(/Edg\/([\d.]+)/)}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${ver(/OPR\/([\d.]+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ver(/Firefox\/([\d.]+)/)}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${ver(/Chrome\/([\d.]+)/)}`;
  else if (/Safari\//.test(ua)) browser = `Safari ${ver(/Version\/([\d.]+)/)}`;
  let os = 'Outro';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return { browser: browser.trim(), os };
}

/** Variante do tutorial pedida na URL (`?tut=b`); qualquer outra coisa é a padrão, "a". */
export function tutorialVariant(search: string): 'a' | 'b' {
  return new URLSearchParams(search).get('tut')?.toLowerCase() === 'b' ? 'b' : 'a';
}

/** Placa de vídeo pelo WebGL, quando o navegador informa. */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext | null | undefined): string {
  if (!gl) return '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '').slice(0, 120);
  } catch {
    return '';
  }
}

export interface EnvInput {
  userAgent: string;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  dpr: number;
  gpu: string;
  search: string;
}

/** Acrescenta uma sessão ao Diário do mundo (no máximo 50 guardadas). */
export function recordSession(world: World, env: EnvInput, now = new Date()): DiarySession {
  const { browser, os } = parseUserAgent(env.userAgent);
  const s: DiarySession = {
    startedAt: now.toISOString(),
    gameTime: Math.round(world.time),
    browser,
    os,
    screen: `${Math.round(env.screen.width)}x${Math.round(env.screen.height)}`,
    viewport: `${Math.round(env.viewport.width)}x${Math.round(env.viewport.height)}`,
    dpr: Math.round(env.dpr * 100) / 100,
    gpu: env.gpu,
    tutorial: tutorialVariant(env.search),
  };
  const list = (world.diary.sessions ??= []);
  list.push(s);
  if (list.length > 50) list.splice(0, list.length - 50);
  return s;
}

/** Resumo de desempenho para o JSON exportado do Diário. */
export function performanceSummary(world: World): { fpsMedio: number | null; fpsPiorSegundo: number | null; minutosMedidos: number; minutosAbaixoDe30: number } {
  const s = world.diary.samples.filter((x) => typeof x.fps === 'number');
  if (!s.length) return { fpsMedio: null, fpsPiorSegundo: null, minutosMedidos: 0, minutosAbaixoDe30: 0 };
  return {
    fpsMedio: Math.round(s.reduce((a, x) => a + x.fps!, 0) / s.length),
    fpsPiorSegundo: Math.min(...s.map((x) => x.fpsMin ?? x.fps!)),
    minutosMedidos: s.length,
    minutosAbaixoDe30: s.filter((x) => x.fps! < 30).length,
  };
}
