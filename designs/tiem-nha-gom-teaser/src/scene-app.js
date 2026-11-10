const { seg, eo, eio, lerp, TextFx } = kit;

kit.scene('app', {
  init(kit) {
    kit.stage.append(kit.h(
      '<div class="ground">' +
        '<div class="words" style="left:80px;top:180px;width:920px">' +
          '<div class="pill-badge app-badge">Trải Nghiệm Ứng Dụng</div>' +
          '<h1 class="line app-line">Tích Điểm & Ưu Đãi</h1>' +
          '<p class="sub app-sub">Đặc quyền hội viên Tiệm Nhà Gốm trên tay</p>' +
        '</div>' +

        '<div class="art-center" style="top:220px">' +
          '<!-- Mobile Phone Mockup -->' +
          '<div class="app-phone" style="position:relative;width:520px;height:900px;background:#181716;border-radius:54px;padding:16px;box-shadow:0 30px 80px rgba(43,41,40,0.22);border:5px solid #E6D8C8">' +
            '<!-- Phone Screen -->' +
            '<div style="width:100%;height:100%;background:#FAF8F5;border-radius:40px;overflow:hidden;position:relative;display:flex;flex-direction:column;padding:28px 24px">' +
              '<!-- Notch / Dynamic Island -->' +
              '<div style="width:120px;height:24px;background:#181716;border-radius:12px;margin:0 auto 20px"></div>' +

              '<!-- App Mini Header -->' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">' +
                '<span style="font-family:var(--display);font-size:24px;font-weight:700;color:var(--second)">Tiệm Nhà Gốm</span>' +
                '<div style="background:rgba(200,150,46,0.15);padding:6px 14px;border-radius:20px;border:1px solid rgba(200,150,46,0.4);display:flex;align-items:center;gap:6px">' +
                  '<span style="font-size:16px">🏺</span>' +
                  '<span class="app-pts" style="font-family:var(--sans);font-size:16px;font-weight:700;color:var(--main)">1.250 Điểm</span>' +
                '</div>' +
              '</div>' +

              '<!-- Membership Banner Card -->' +
              '<div class="app-card" style="background:#FFFDF9;border-radius:24px;padding:20px;border:1.5px solid #E8E1D8;box-shadow:0 10px 24px rgba(0,0,0,0.04);margin-bottom:20px">' +
                '<h4 style="font-family:var(--sans);font-size:18px;font-weight:700;margin:0 0 12px;color:var(--second)">Thẻ Tiệm Nhà Gốm</h4>' +
                '<div style="display:flex;gap:10px">' +
                  '<div style="background:#FFFFFF;border:1px solid #E8E1D8;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.04)">' +
                    '<span>⛶</span><span>Quét mã</span>' +
                  '</div>' +
                  '<div style="background:#FFFFFF;border:1px solid #E8E1D8;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.04)">' +
                    '<span>🎁</span><span>Ưu đãi</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<!-- Special Voucher Voucher Floating Item -->' +
              '<div class="app-voucher" style="background:linear-gradient(135deg, var(--main), #8A5A2B);border-radius:22px;padding:22px;color:#FFFFFF;box-shadow:0 12px 28px rgba(156,113,86,0.3)">' +
                '<span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.85">Quà tặng thành viên</span>' +
                '<div style="font-family:var(--display);font-size:28px;font-weight:700;margin:6px 0">Giảm 50.000 đ</div>' +
                '<div style="font-size:13px;opacity:0.9">Áp dụng cho mọi đơn gốm sứ thủ công</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    ));

    this.badge = kit.stage.querySelector('.app-badge').style;
    this.line = kit.stage.querySelector('.app-line');
    this.sub = kit.stage.querySelector('.app-sub').style;
    this.phone = kit.stage.querySelector('.app-phone').style;
    this.pts = kit.stage.querySelector('.app-pts');
    this.voucher = kit.stage.querySelector('.app-voucher').style;
  },

  render(t) {
    this.badge.opacity = eo(seg(t, 0.1, 0.55));
    TextFx.fadeFromRight(this.line, t, 0.3);
    this.sub.opacity = eo(seg(t, 0.7, 1.3));

    // Phone enters with smooth zoom-in
    const pPhone = eo(seg(t, 0.2, 1.6));
    this.phone.opacity = pPhone;
    this.phone.transform = 'translateY(' + lerp(90, 0, pPhone) + 'px) scale(' + lerp(0.9, 1.0, pPhone) + ')';

    // Points count up
    const pPts = eio(seg(t, 1.0, 2.5));
    const currentPoints = Math.round(lerp(0, 1250, pPts));
    this.pts.textContent = currentPoints.toLocaleString('vi-VN') + ' Điểm';

    // Voucher pop in with pulse
    const pVoucher = eo(seg(t, 1.8, 2.8));
    this.voucher.opacity = pVoucher;
    this.voucher.transform = 'translateY(' + lerp(40, 0, pVoucher) + 'px) scale(' + lerp(0.92, 1.0, pVoucher) + ')';
  }
});

