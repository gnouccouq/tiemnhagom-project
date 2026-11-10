const { seg, eo, eio, lerp, TextFx } = kit;

kit.scene('craft', {
  init(kit) {
    kit.stage.append(kit.h(
      '<div class="ground">' +
        '<div class="words" style="left:80px;top:220px;width:920px">' +
          '<div class="pill-badge craft-badge">Nghệ Thuật Thủ Công</div>' +
          '<h1 class="line craft-line">Gốm Mộc & Men Ấm</h1>' +
          '<p class="sub craft-sub">Từng tác phẩm được chuốt tỉ mỉ từ bàn xoay</p>' +
        '</div>' +

        '<div class="art-center" style="top:260px">' +
          '<svg class="craft-svg" viewBox="0 0 800 800" style="width:720px;height:720px;overflow:visible">' +
            '<!-- Wheel Base -->' +
            '<ellipse cx="400" cy="650" rx="280" ry="70" fill="color-mix(in srgb, var(--second) 12%, transparent)" />' +
            '<ellipse class="craft-disc" cx="400" cy="640" rx="250" ry="55" fill="color-mix(in srgb, var(--main) 20%, var(--ground))" stroke="var(--main)" stroke-width="4" />' +
            '<ellipse cx="400" cy="635" rx="180" ry="38" fill="none" stroke="color-mix(in srgb, var(--accent) 50%, var(--main))" stroke-width="2" stroke-dasharray="16 12" />' +

            '<!-- Pottery Vase Shaping -->' +
            '<g class="craft-vase-wrap">' +
              '<!-- Clay Body -->' +
              '<path class="craft-vase" d="M310 630 C260 520 280 400 340 330 C360 305 350 270 355 250 L445 250 C450 270 440 305 460 330 C520 400 540 520 490 630 Z" fill="var(--main)" />' +
              '<!-- Glaze highlight -->' +
              '<path class="craft-glaze" d="M340 340 C355 315 350 285 355 260 L380 260 C375 285 380 315 365 340 C330 400 320 500 340 600 C325 560 320 450 340 340 Z" fill="color-mix(in srgb, var(--accent) 60%, white)" opacity="0.65" />' +
              '<!-- Vase Lip / Rim -->' +
              '<ellipse cx="400" cy="250" rx="46" ry="14" fill="color-mix(in srgb, var(--main) 80%, var(--second))" />' +
              '<ellipse cx="400" cy="248" rx="42" ry="11" fill="color-mix(in srgb, var(--accent) 40%, var(--main))" />' +
            '</g>' +

            '<!-- Floating Craftsman Glow -->' +
            '<circle cx="400" cy="440" r="180" fill="radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 70%)" />' +
          '</svg>' +
        '</div>' +
      '</div>'
    ));

    this.badge = kit.stage.querySelector('.craft-badge').style;
    this.line = kit.stage.querySelector('.craft-line');
    this.sub = kit.stage.querySelector('.craft-sub').style;
    this.vaseWrap = kit.stage.querySelector('.craft-vase-wrap').style;
    this.disc = kit.stage.querySelector('.craft-disc').style;
    this.vaseWrap.transformOrigin = '400px 640px';
  },

  render(t) {
    // Text entrance
    this.badge.opacity = eo(seg(t, 0.1, 0.6));
    this.badge.transform = 'translateY(' + lerp(20, 0, eo(seg(t, 0.1, 0.6))) + 'px)';
    TextFx.fadeFromRight(this.line, t, 0.35);
    this.sub.opacity = eo(seg(t, 0.8, 1.4));
    this.sub.transform = 'translateY(' + lerp(16, 0, eo(seg(t, 0.8, 1.4))) + 'px)';

    // Wheel spin & wobble
    const spinProgress = seg(t, 0, 3.5);
    this.disc.transform = 'scaleY(' + (1 + Math.sin(t * 12) * 0.03) + ')';

    // Vase grows up from clay mound
    const grow = eio(seg(t, 0.4, 2.2));
    const scaleY = lerp(0.2, 1.0, grow);
    const scaleX = lerp(1.35, 1.0, grow);
    const breathe = 1 + Math.sin(t * 4) * 0.015;
    this.vaseWrap.transform = 'scale(' + (scaleX * breathe) + ', ' + (scaleY * breathe) + ')';
  }
});

