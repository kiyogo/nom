use eframe::egui::{self, Align2, Color32, Context, Frame, Margin, Pos2, RichText, Rounding, Stroke, Vec2};
use nom_package::{save_session, UserSession};

pub struct LoginModalState {
    pub is_open: bool,
    pub email: String,
    pub password: String,
    pub error_msg: Option<String>,
}

impl Default for LoginModalState {
    fn default() -> Self {
        Self {
            is_open: false,
            email: String::new(),
            password: String::new(),
            error_msg: None,
        }
    }
}

pub fn render_login_modal(ctx: &Context, state: &mut LoginModalState, session: &mut UserSession) {
    if !state.is_open {
        return;
    }

    let mut close_modal = false;

    // Lớp nền đen mờ bao phủ toàn màn hình (Modal Backdrop)
    egui::Area::new(egui::Id::new("login_modal_backdrop"))
        .order(egui::Order::Foreground)
        .fixed_pos(Pos2::ZERO)
        .show(ctx, |ui| {
            let screen_rect = ctx.screen_rect();
            let (rect, response) = ui.allocate_exact_size(screen_rect.size(), egui::Sense::click());
            ui.painter()
                .rect_filled(rect, Rounding::ZERO, Color32::from_black_alpha(130));
            if response.clicked() {
                close_modal = true;
            }
        });

    // Thẻ Card Đăng nhập nổi ở chính giữa màn hình (Không dùng Window OS bar thô ráp)
    egui::Window::new("login_modal_window")
        .title_bar(false)
        .collapsible(false)
        .resizable(false)
        .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
        .order(egui::Order::Foreground)
        .frame(
            Frame::none()
                .fill(Color32::WHITE)
                .stroke(Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                .rounding(Rounding::same(12.0_f32))
                .inner_margin(Margin::symmetric(28.0, 24.0)),
        )
        .show(ctx, |ui| {
            ui.set_width(360.0);

            // Header của Card: Logo + Tiêu đề + Nút Đóng [X]
            ui.horizontal(|ui| {
                let logo_size = Vec2::new(32.0, 32.0);
                let (logo_rect, _) = ui.allocate_exact_size(logo_size, egui::Sense::hover());
                ui.painter()
                    .rect_filled(logo_rect, Rounding::same(8.0_f32), Color32::from_rgb(15, 23, 42));
                ui.painter().text(
                    Pos2::new(logo_rect.center().x.round(), logo_rect.center().y.round()),
                    Align2::CENTER_CENTER,
                    "N",
                    crate::font::semibold_font(18.0),
                    Color32::WHITE,
                );

                ui.add_space(8.0);

                ui.vertical(|ui| {
                    crate::dwrite::label(
                        ui,
                        "Đăng nhập Nom Office",
                        &crate::typography::Typography::heading_style(),
                    );
                    crate::dwrite::label(
                        ui,
                        "Đồng bộ ứng dụng & dữ liệu tài khoản",
                        &crate::typography::Typography::caption_style(),
                    );
                });

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Min), |ui| {
                    let btn_close = egui::Button::new(
                        RichText::new("✕")
                            .font(crate::typography::Typography::button_font())
                            .color(Color32::from_rgb(148, 163, 184)),
                    )
                    .fill(Color32::from_rgb(248, 250, 252))
                    .stroke(Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
                    .rounding(Rounding::same(6.0_f32))
                    .min_size(Vec2::new(26.0, 26.0));

                    if ui.add(btn_close).clicked() {
                        close_modal = true;
                    }
                });
            });

            ui.add_space(14.0);

            // Đường phân cách nhẹ
            let (sep_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 1.0), egui::Sense::hover());
            ui.painter()
                .rect_filled(sep_rect, Rounding::ZERO, Color32::from_rgb(241, 245, 249));

            ui.add_space(14.0);

            if let Some(ref err) = state.error_msg {
                let (err_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 32.0), egui::Sense::hover());
                ui.painter()
                    .rect_filled(err_rect, Rounding::same(7.0_f32), Color32::from_rgb(254, 242, 242));
                ui.painter().rect_stroke(
                    err_rect,
                    Rounding::same(7.0_f32),
                    Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)),
                );
                ui.painter().text(
                    Pos2::new(err_rect.center().x.round(), err_rect.center().y.round()),
                    Align2::CENTER_CENTER,
                    err,
                    crate::typography::Typography::caption_font(),
                    Color32::from_rgb(220, 38, 38),
                );
                ui.add_space(10.0);
            }

            crate::dwrite::label(
                ui,
                "Email hoặc Tên tài khoản",
                &crate::typography::Typography::badge_style(),
            );
            ui.add_space(3.0);
            let email_edit = egui::TextEdit::singleline(&mut state.email)
                .hint_text("email@nomoffice.org")
                .font(crate::typography::Typography::description_font())
                .min_size(Vec2::new(ui.available_width(), 36.0));
            ui.add(email_edit);

            ui.add_space(10.0);

            crate::dwrite::label(ui, "Mật khẩu", &crate::typography::Typography::badge_style());
            ui.add_space(3.0);
            let pass_edit = egui::TextEdit::singleline(&mut state.password)
                .password(true)
                .hint_text("••••••••")
                .font(crate::typography::Typography::description_font())
                .min_size(Vec2::new(ui.available_width(), 36.0));
            ui.add(pass_edit);

            ui.add_space(18.0);

            let btn_login_resp = crate::dwrite::button(
                ui,
                "Đăng nhập",
                &crate::typography::Typography::button_white_style(),
                Vec2::new(ui.available_width(), 38.0),
                Color32::from_rgb(15, 23, 42),
                Stroke::NONE,
                Rounding::same(8.0_f32),
            );

            if btn_login_resp.clicked() {
                if state.email.trim().is_empty() {
                    state.error_msg = Some("Vui lòng nhập Email hoặc Tên tài khoản!".to_string());
                } else {
                    let new_session = UserSession::from_credentials(&state.email, None);
                    let _ = save_session(&new_session);
                    *session = new_session;
                    close_modal = true;
                }
            }

            ui.add_space(8.0);

            let btn_quick = egui::Button::new(
                RichText::new("Đăng nhập nhanh tài khoản mẫu")
                    .font(crate::typography::Typography::metadata_font())
                    .color(Color32::from_rgb(37, 99, 235)),
            )
            .fill(Color32::from_rgb(239, 246, 255))
            .stroke(Stroke::new(1.0_f32, Color32::from_rgb(191, 219, 254)))
            .rounding(Rounding::same(7.0_f32))
            .min_size(Vec2::new(ui.available_width(), 34.0));

            if ui.add(btn_quick).clicked() {
                let demo = UserSession::new_demo();
                let _ = save_session(&demo);
                *session = demo;
                close_modal = true;
            }

            ui.add_space(6.0);

            let btn_cancel = egui::Button::new(
                RichText::new("Đóng")
                    .font(crate::typography::Typography::caption_font())
                    .color(Color32::from_rgb(100, 116, 139)),
            )
            .fill(Color32::WHITE)
            .stroke(Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
            .rounding(Rounding::same(7.0_f32))
            .min_size(Vec2::new(ui.available_width(), 32.0));

            if ui.add(btn_cancel).clicked() {
                close_modal = true;
            }
        });

    if close_modal {
        state.is_open = false;
        state.error_msg = None;
        state.password.clear();
    }
}
