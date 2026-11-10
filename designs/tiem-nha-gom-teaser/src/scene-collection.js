const { seg, eo, eio, lerp, TextFx } = kit;

kit.scene('collection', {
  init(kit) {
    kit.stage.append(kit.h(
      '<div class="ground">' +
        '<div class="words" style="left:80px;top:200px;width:920px">' +
          '<div class="pill-badge col-badge">Tuyển Chọn Độc Bản</div>' +
          '<h1 class="line col-line">Nét Mộc Tinh Tế</h1>' +
          '<p class="sub col-sub">Hơn 500+ mẫu gốm thủ công & đồ dùng gia đình</p>' +
        '</div>' +

        '<div class="art-center" style="top:230px">' +
          '<div class="col-cards-row" style="position:relative;width:920px;height:700px">' +
            '<!-- Card 1: Cốc Gốm Bánh Mì -->' +
            '<div class="ceramic-card col-c1" style="left:20px;top:40px;width:420px;height:520px;padding:32px;box-sizing:border-box">' +
              '<div style="width:100%;height:320px;background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--main) 15%, transparent), transparent);border-radius:20px;display:flex;align-items:center;justify-content:center">' +
                '<svg viewBox="0 0 200 200" style="width:200px;height:200px">' +
                  '<ellipse cx="100" cy="165" rx="55" ry="14" fill="rgba(43,41,40,0.12)" />' +
                  '<!-- Mug Body -->' +
                  '<rect x="55" y="65" width="90" height="95" rx="24" fill="var(--main)" />' +
                  '<path d="M145 80 C175 80 175 130 145 130" fill="none" stroke="var(--main)" stroke-width="14" stroke-linecap="round" />' +
                  '<ellipse cx="100" cy="65" rx="45" ry="12" fill="color-mix(in srgb, var(--accent) 35%, var(--main))" />' +
                  '<path d="M70 95 Q100 115 130 95" stroke="rgba(255,255,255,0.4)" stroke-width="4" fill="none" stroke-linecap="round" />' +
                '</svg>' +
              '</div>' +
              '<div style="margin-top:24px">' +
                '<h3 style="font-family:var(--sans);font-size:26px;font-weight:700;margin:0 0 8px;color:var(--second)">Cốc Gốm Bánh Mì</h3>' +
                '<span style="font-size:22px;font-weight:700;color:var(--main)">210.000 đ</span>' +
              '</div>' +
            '</div>' +

            '<!-- Card 2: Đĩa Gốm Vỏ Sò Viền Vàng -->' +
            '<div class="ceramic-card col-c2" style="right:20px;top:100px;width:420px;height:520px;padding:32px;box-sizing:border-box">' +
              '<div style="width:100%;height:320px;background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 20%, transparent), transparent);border-radius:20px;display:flex;align-items:center;justify-content:center">' +
                '<svg viewBox="0 0 200 200" style="width:210px;height:210px">' +
                  '<ellipse cx="100" cy="160" rx="65" ry="16" fill="rgba(43,41,40,0.12)" />' +
                  '<!-- Shell plate -->' +
                  '<path d="M40 135 C35 75 80 50 100 48 C120 50 165 75 160 135 C140 152 60 152 40 135 Z" fill="#FFFDF9" stroke="var(--accent)" stroke-width="5" />' +
                  '<path d="M100 48 L100 148 M100 48 L70 144 M100 48 L130 144 M100 48 L48 132 M100 48 L152 132" stroke="color-mix(in srgb, var(--accent) 60%, transparent)" stroke-width="2.5" />' +
                '</svg>' +
              '</div>' +
              '<div style="margin-top:24px">' +
                '<h3 style="font-family:var(--sans);font-size:26px;font-weight:700;margin:0 0 8px;color:var(--second)">Đĩa Sò Viền Vàng</h3>' +
                '<span style="font-size:22px;font-weight:700;color:var(--main)">105.000 đ</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    ));

    this.badge = kit.stage.querySelector('.col-badge').style;
    this.line = kit.stage.querySelector('.col-line');
    this.sub = kit.stage.querySelector('.col-sub').style;
    this.c1 = kit.stage.querySelector('.col-c1').style;
    this.c2 = kit.stage.querySelector('.col-c2').style;
  },

  render(t) {
    this.badge.opacity = eo(seg(t, 0.1, 0.55));
    TextFx.fadeFromRight(this.line, t, 0.3);
    this.sub.opacity = eo(seg(t, 0.7, 1.3));

    // Staggered card entrance
    const p1 = eo(seg(t, 0.4, 1.4));
    this.c1.opacity = p1;
    this.c1.transform = 'translateY(' + lerp(80, 0, p1) + 'px) rotate(' + lerp(-4, -1.5, p1) + 'deg)';

    const p2 = eo(seg(t, 0.7, 1.7));
    this.c2.opacity = p2;
    this.c2.transform = 'translateY(' + lerp(100, 0, p2) + 'px) rotate(' + lerp(6, 2, p2) + 'deg)';

    // Subtle floating drift
    const hover = Math.sin(t * 3) * 6;
    this.c1.transform += ' translateY(' + hover + 'px)';
    this.c2.transform += ' translateY(' + (-hover) + 'px)';
  }
});

