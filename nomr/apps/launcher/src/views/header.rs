use eframe::egui::{self, Align2, Color32, Pos2, RichText, Rounding, Stroke, Ui, Vec2};
use nom_package::UserSession;

#[allow(dead_code)]
pub enum HeaderAction {
    OpenLogin,
    Logout,
}

#[allow(dead_code)]
pub fn render_header(ui: &mut Ui, status_message: Option<&str>, session: &UserSession) -> Option<HeaderAction> {
    let mut triggered_action = None;

    ui.add_space(2.0);

    // Top Navigation Bar: Cụm bên trái và Cụm bên phải tách biệt rõ ràng
    ui.horizontal(|ui| {
        // CỤM TRÁI: Logo & Tên ứng dụng & Trạng thái Control Panel
        ui.horizontal(|ui| {
            // Logo vuông bo góc 10px
            let logo_size = Vec2::new(36.0, 36.0);
            let (logo_rect, _) = ui.allocate_exact_size(logo_size, egui::Sense::hover());
            ui.painter()
                .rect_filled(logo_rect, Rounding::same(9.0_f32), Color32::from_rgb(15, 23, 42));
            ui.painter().text(
                Pos2::new(logo_rect.center().x.round(), logo_rect.center().y.round()),
                Align2::CENTER_CENTER,
                "N",
                crate::font::semibold_font(20.0),
                Color32::WHITE,
            );

            ui.add_space(10.0);

            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("Nom Office")
                            .font(crate::font::semibold_font(17.5))
                            .color(Color32::from_rgb(15, 23, 42)),
                    );

                    ui.add_space(8.0);

                    // Trạng thái kết nối Control Panel dạng badge nhỏ gọn
                    let badge_size = Vec2::new(104.0, 20.0);
                    let (badge_rect, _) = ui.allocate_exact_size(badge_size, egui::Sense::hover());
                    ui.painter()
                        .rect_filled(badge_rect, Rounding::same(6.0_f32), Color32::from_rgb(240, 253, 244));
                    ui.painter().rect_stroke(
                        badge_rect,
                        Rounding::same(6.0_f32),
                        Stroke::new(1.0_f32, Color32::from_rgb(187, 247, 208)),
                    );

                    // Chấm tròn xanh vẽ bằng painter
                    let dot_pos = Pos2::new(badge_rect.min.x + 8.0, badge_rect.center().y);
                    ui.painter().circle_filled(dot_pos, 3.0, Color32::from_rgb(22, 163, 74));

                    let text_pos = Pos2::new(badge_rect.min.x + 15.0, badge_rect.center().y);
                    ui.painter().text(
                        Pos2::new(text_pos.x.round(), text_pos.y.round()),
                        Align2::LEFT_CENTER,
                        "Control Panel",
                        crate::font::semibold_font(11.0),
                        Color32::from_rgb(22, 163, 74),
                    );
                });

                ui.label(
                    RichText::new("Bộ ứng dụng văn phòng bản địa")
                        .font(crate::font::regular_font(12.0))
                        .color(Color32::from_rgb(100, 116, 139)),
                );
            });
        });

        // CỤM PHẢI: Tài khoản người dùng (căn sát phải)
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if session.is_logged_in {
                let btn_logout = egui::Button::new(
                    RichText::new("Đăng xuất")
                        .size(11.0)
                        .color(Color32::from_rgb(220, 38, 38)),
                )
                .fill(Color32::from_rgb(254, 242, 242))
                .stroke(Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)))
                .rounding(Rounding::same(6.0_f32))
                .min_size(Vec2::new(66.0, 28.0));

                if ui.add(btn_logout).clicked() {
                    triggered_action = Some(HeaderAction::Logout);
                }

                ui.add_space(8.0);

                // Tên người dùng và gói
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(&session.name)
                            .size(12.0)
                            .strong()
                            .color(Color32::from_rgb(15, 23, 42)),
                    );
                    ui.label(
                        RichText::new(&session.plan)
                            .size(10.0)
                            .color(Color32::from_rgb(37, 99, 235)),
                    );
                });

                ui.add_space(8.0);

                // Avatar Icon tròn hoàn hảo 32px
                let avatar_size = Vec2::new(32.0, 32.0);
                let (av_rect, _) = ui.allocate_exact_size(avatar_size, egui::Sense::hover());
                ui.painter()
                    .circle_filled(av_rect.center(), 16.0, Color32::from_rgb(37, 99, 235));
                ui.painter().text(
                    av_rect.center(),
                    Align2::CENTER_CENTER,
                    &session.avatar_initials,
                    egui::FontId::proportional(12.0),
                    Color32::WHITE,
                );
            } else {
                let btn_login = egui::Button::new(RichText::new("Đăng nhập").size(12.5).strong().color(Color32::WHITE))
                    .fill(Color32::from_rgb(15, 23, 42))
                    .stroke(Stroke::NONE)
                    .rounding(Rounding::same(7.0_f32))
                    .min_size(Vec2::new(96.0, 32.0));

                if ui.add(btn_login).clicked() {
                    triggered_action = Some(HeaderAction::OpenLogin);
                }
            }
        });
    });

    // Thông báo trạng thái: vẽ biểu tượng chấm tròn, triệt tiêu hoàn toàn ô vuông lỗi [?]
    if let Some(msg) = status_message {
        ui.add_space(10.0);

        let (banner_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 32.0), egui::Sense::hover());

        ui.painter()
            .rect_filled(banner_rect, Rounding::same(7.0_f32), Color32::from_rgb(240, 253, 244));
        ui.painter().rect_stroke(
            banner_rect,
            Rounding::same(7.0_f32),
            Stroke::new(1.0_f32, Color32::from_rgb(187, 247, 208)),
        );

        // Chấm tròn xanh chuẩn Painter
        let dot_pos = Pos2::new(banner_rect.min.x + 12.0, banner_rect.center().y);
        ui.painter().circle_filled(dot_pos, 3.5, Color32::from_rgb(22, 163, 74));

        let text_pos = Pos2::new(banner_rect.min.x + 22.0, banner_rect.center().y);
        ui.painter().text(
            text_pos,
            Align2::LEFT_CENTER,
            msg,
            egui::FontId::proportional(11.5),
            Color32::from_rgb(22, 101, 52),
        );
    }

    ui.add_space(12.0);

    // Đường kẻ phân cách Header nhẹ nhàng
    let (div_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 1.0), egui::Sense::hover());
    ui.painter()
        .rect_filled(div_rect, Rounding::ZERO, Color32::from_rgb(226, 232, 240));

    ui.add_space(10.0);

    triggered_action
}
