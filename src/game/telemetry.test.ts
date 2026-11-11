import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../sim/save';
import { openMap } from '../sim/testMaps';
import { World } from '../sim/world';
import { DiaryFps, FrameMeter, parseUserAgent, performanceSummary, recordSession, tutorialVariant } from './telemetry';

const env = (ua: string, search = '') => ({ userAgent: ua, screen: { width: 1920, height: 1080 }, viewport: { width: 1440, height: 900 }, dpr: 2, gpu: 'Intel Iris', search });

describe('FrameMeter', () => {
  it('média e pior segundo desde a última leitura', () => {
    const m = new FrameMeter();
    for (let i = 0; i < 60; i++) m.add(1 / 60); // 1 s a 60 FPS
    for (let i = 0; i < 20; i++) m.add(1 / 20); // 1 s a 20 FPS
    expect(m.take()).toEqual({ avg: 40, min: 20 });
    expect(m.take()).toBeNull();
  });

  it('ignora saltos de aba em segundo plano', () => {
    const m = new FrameMeter();
    m.add(30);
    m.add(0);
    expect(m.take()).toBeNull();
  });
});

describe('ambiente da sessão', () => {
  it('reconhece navegador e sistema', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')).toEqual({ browser: 'Chrome 141', os: 'Windows' });
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toEqual({ browser: 'Edge 141', os: 'Windows' });
    expect(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toEqual({ browser: 'Safari 18', os: 'macOS' });
    expect(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toEqual({ browser: 'Firefox 131', os: 'Linux' });
  });

  it('variante do tutorial vem da URL', () => {
    expect(tutorialVariant('')).toBe('a');
    expect(tutorialVariant('?tut=b')).toBe('b');
    expect(tutorialVariant('?tut=B&x=1')).toBe('b');
    expect(tutorialVariant('?tut=z')).toBe('a');
  });

  it('sessões ficam no Diário e sobrevivem ao save', () => {
    const w = new World(openMap(10, 10));
    w.time = 125;
    const s = recordSession(w, env('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', '?tut=b'), new Date('2026-10-05T14:00:00Z'));
    expect(s).toMatchObject({ gameTime: 125, browser: 'Firefox 131', screen: '1920x1080', viewport: '1440x900', dpr: 2, tutorial: 'b', gpu: 'Intel Iris' });
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))), openMap(10, 10));
    expect(back.diary.sessions).toEqual([s]);
  });
});

describe('FPS nas amostras do Diário', () => {
  const tickMinute = (w: World) => {
    for (let i = 0; i < 600; i++) w.tick(0.1);
  };
  const frames = (fps: DiaryFps, w: World, n: number, rate: number) => {
    for (let i = 0; i < n; i++) fps.update(w, 1 / rate);
  };

  it('cada amostra nova recebe o FPS medido desde a anterior', () => {
    const w = new World(openMap(10, 10));
    const fps = new DiaryFps();
    fps.update(w, null);
    frames(fps, w, 120, 60); // 2 s a 60 FPS
    for (let i = 0; i < 605; i++) w.tick(0.1); // passa de 60 s (soma de 0,1 acumula arredondamento)
    frames(fps, w, 60, 60);
    frames(fps, w, 20, 20);
    tickMinute(w);
    fps.update(w, null);
    expect(w.diary.samples.map((s) => [s.fps, s.fpsMin])).toEqual([[60, 60], [40, 20]]);
    expect(performanceSummary(w)).toEqual({ fpsMedio: 50, fpsPiorSegundo: 20, minutosMedidos: 2, minutosAbaixoDe30: 0 });
    const back = deserialize(JSON.parse(JSON.stringify(serialize(w))), openMap(10, 10));
    expect(back.diary.samples.at(-1)).toMatchObject({ fps: 40, fpsMin: 20 });
  });

  it('sem quadros medidos (tela de abertura) a amostra fica sem FPS; trocar de mundo não mexe no antigo', () => {
    const a = new World(openMap(10, 10));
    const fps = new DiaryFps();
    fps.update(a, null);
    for (let i = 0; i < 605; i++) a.tick(0.1);
    fps.update(a, null);
    expect(a.diary.samples[0].fps).toBeUndefined();
    const b = new World(openMap(10, 10));
    frames(fps, b, 60, 30);
    expect(a.diary.samples[0].fps).toBeUndefined();
    for (let i = 0; i < 605; i++) b.tick(0.1);
    fps.update(b, null);
    expect(b.diary.samples[0]).toMatchObject({ fps: 30, fpsMin: 30 });
  });
});
