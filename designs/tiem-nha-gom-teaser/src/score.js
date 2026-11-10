kit.score(function (S, T) {
  const BPM = 96, B = 60 / BPM;
  S.tempo(BPM, { t0: 0 });

  // Warm acoustic instrumentation
  S.program('mallet', 'marimba');
  S.program('kalimba', 'pluck', { rev: 0.5 });
  S.program('keys', 'ep', { rev: 0.6, bright: 1.2 });
  S.program('pad', 'pad', { rev: 0.7, gain: -8 });
  S.program('bass', 'bass', { gain: -4 });

  // Intro: Craft (0 -> 3.5s)
  S.chord('pad', ['D3', 'A3', 'D4', 'F#4'], { beat: 0, beats: 6, vel: 45 });
  S.pattern('mallet', 'x.x.X.x.', { from: 0, repeat: 3, pitch: ['D5', 'F#5', 'A5'], vel: 55 });
  S.fx('whoosh', T.craft + 0.3, { dur: 0.8 });

  // Collection (3.5s -> 7.5s)
  S.chord('keys', ['G3', 'B3', 'D4', 'G4'], { t: T.collection, dur: 3.5, vel: 55 });
  S.note('bass', 'G2', { t: T.collection, dur: 2.0, vel: 70 });
  S.pattern('kalimba', 'x.x.x.X.', { from: 6, repeat: 4, pitch: ['B4', 'D5', 'G5', 'A5'], vel: 60 });
  S.drums({ kick: 'x...', sidestick: '..x.', shaker: 'xxxx' }, { from: 6, repeat: 6, vel: 50 });
  S.fx('chime', T.collection + 0.5, { vel: 65 });

  // App & Points (7.5s -> 11.5s)
  S.chord('keys', ['A3', 'C#4', 'E4', 'A4'], { t: T.app, dur: 3.5, vel: 60 });
  S.note('bass', 'A2', { t: T.app, dur: 2.0, vel: 72 });
  S.pattern('mallet', 'X.x.X.xx', { from: 12, repeat: 4, pitch: ['A4', 'C#5', 'E5', 'A5'], vel: 62 });
  S.fx('pop', T.app + 0.3);
  S.fx('ding', T.app + 2.3, { vel: 75 });

  // Outro: Tiệm Nhà Gốm (11.5s -> 15.0s)
  S.chord('keys', ['D3', 'F#3', 'A3', 'D4', 'F#4'], { t: T.outro, dur: 3.2, vel: 68 });
  S.chord('pad', ['D3', 'A3', 'D4'], { t: T.outro, dur: 3.2, vel: 50 });
  S.note('bass', 'D2', { t: T.outro, dur: 2.5, vel: 75 });
  S.run('mallet', ['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5'], { t: T.outro + 0.2, step: 0.08, vel: 65 });
  S.fx('chime', T.outro + 0.4, { vel: 70 });

  S.master({ gain: -5, fadeOut: 1.0 });
});

