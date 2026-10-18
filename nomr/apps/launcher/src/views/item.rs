use super::progress::render_flat_progress_bar;
use eframe::egui::{self, Color32, Context, Frame, Margin, Pos2, RichText, Rounding, Stroke, Ui, Vec2};
use nom_package::{AppInfo, AppStatus};

pub enum AppRowAction {
    Install(usize),
    Launch(usize),
    Uninstall(usize),
}

fn get_app_icon_visuals(app_id: &str) -> (Color32, &'static str, f32) {
    match app_id {
        "writer" => (Color32::from_rgb(37, 99, 235), "W", 20.0),
        "sheet" => (Color32::from_rgb(5, 150, 105), "S", 20.0),
        "slide" => (Color32::from_rgb(234, 88, 12), "P", 20.0),
        "pdf" => (Color32::from_rgb(220, 38, 38), "PDF", 13.0),
        "markdown" => (Color32::from_rgb(79, 70, 229), "MD", 15.0),
        "html" => (Color32::from_rgb(217, 119, 6), "HTML", 12.0),
        _ => (Color32::from_rgb(71, 85, 105), "App", 13.0),
    }
}

#[allow(dead_code)]
pub fn render_app_row(ui: &mut Ui, ctx: &Context, idx: usize, app: &AppInfo) -> Option<AppRowAction> {
    let mut triggered_action = None;

    let card_frame = Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)))
        .rounding(Rounding::same(12.0_f32))
        .inner_margin(Margin::symmetric(20.0, 16.0));

    card_frame.show(ui, |ui| {
        let inner_w = ui.available_width();
        let icon_w = 46.0_f32;
        let icon_gap = 16.0_f32;

        let right_col_w = match &app.status {
            AppStatus::Installing { .. } => 180.0,
            AppStatus::Installed { .. } => 146.0,
            AppStatus::Verifying | AppStatus::Extracting => 150.0,
            AppStatus::Error(_) => 160.0,
            AppStatus::NotInstalled => 100.0,
        };

        let text_w = (inner_w - icon_w - icon_gap - right_col_w - 16.0).max(120.0);

        ui.horizontal(|ui| {
            // 1. Icon ứng dụng (46x46)
            let (icon_bg, icon_text, font_size) = get_app_icon_visuals(&app.id);
            let icon_size = Vec2::new(icon_w, 46.0);
            let (icon_rect, _) = ui.allocate_exact_size(icon_size, egui::Sense::hover());

            ui.painter().rect_filled(icon_rect, Rounding::same(10.0_f32), icon_bg);
            ui.painter().text(
                Pos2::new(icon_rect.center().x.round(), icon_rect.center().y.round()),
                egui::Align2::CENTER_CENTER,
                icon_text,
                crate::font::semibold_font(font_size),
                Color32::WHITE,
            );

            ui.add_space(icon_gap);

            // 2. Cột thông tin ở giữa (Tiêu đề, Category, Mô tả, Metadata)
            ui.allocate_ui_with_layout(Vec2::new(text_w, 0.0), egui::Layout::top_down(egui::Align::Min), |ui| {
                // Dòng 1: Tiêu đề + Badge thể loại
                ui.horizontal(|ui| {
                    crate::dwrite::label(
                        ui,
                        format!("Nom {}", app.name),
                        &crate::typography::Typography::app_title_style(),
                    );

                    ui.add_space(8.0);

                    let cat_text = app.category.to_uppercase();
                    let (cat_rect, _) = ui.allocate_exact_size(Vec2::new(56.0, 20.0), egui::Sense::hover());
                    ui.painter()
                        .rect_filled(cat_rect, Rounding::same(6.0_f32), Color32::from_rgb(241, 245, 249));
                    ui.painter().rect_stroke(
                        cat_rect,
                        Rounding::same(6.0_f32),
                        Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)),
                    );
                    crate::dwrite::paint_text(
                        ui.painter(),
                        cat_rect.center(),
                        egui::Align2::CENTER_CENTER,
                        cat_text,
                        &crate::typography::Typography::badge_style(),
                        ctx,
                    );
                });

                ui.add_space(4.0);
                // Dòng 2: Mô tả sắc nét native DirectWrite
                crate::dwrite::label_wrapped(
                    ui,
                    &app.description,
                    &crate::typography::Typography::description_style(),
                    Some(text_w),
                );

                ui.add_space(6.0);
                // Dòng 3: Metadata + Trạng thái Control Panel đồng bộ
                ui.horizontal(|ui| {
                    crate::dwrite::label(
                        ui,
                        format!("v{}   •   {:.1} MB   •", app.version, app.size_mb),
                        &crate::typography::Typography::metadata_style(),
                    );
                    ui.add_space(2.0);
                    let (dot_rect, _) = ui.allocate_exact_size(Vec2::new(8.0, 16.0), egui::Sense::hover());
                    ui.painter().circle_filled(
                        Pos2::new(dot_rect.center().x.round(), dot_rect.center().y.round()),
                        3.0,
                        Color32::from_rgb(22, 163, 74),
                    );
                    ui.add_space(2.0);
                    crate::dwrite::label(
                        ui,
                        "Control Panel",
                        &crate::typography::Typography::status_success_style(),
                    );
                });
            });

            // 3. Cụm nút hành động bên phải (đảm bảo neo chặt trong khung thẻ, không bị tràn hay cắt chữ)
            ui.allocate_ui_with_layout(
                Vec2::new(right_col_w, 46.0),
                egui::Layout::right_to_left(egui::Align::Center),
                |ui| {
                    match &app.status {
                        AppStatus::NotInstalled => {
                            let btn_resp = crate::dwrite::button(
                                ui,
                                "Cài đặt",
                                &crate::typography::Typography::button_white_style(),
                                Vec2::new(92.0, 34.0),
                                Color32::from_rgb(15, 23, 42),
                                Stroke::NONE,
                                Rounding::same(8.0_f32),
                            );

                            if btn_resp.clicked() {
                                triggered_action = Some(AppRowAction::Install(idx));
                            }
                        }
                        AppStatus::Installing {
                            progress,
                            speed_mbps,
                            copied_mb,
                            total_mb,
                        } => {
                            ui.vertical(|ui| {
                                ui.horizontal(|ui| {
                                    ui.label(crate::typography::Typography::metadata(format!(
                                        "Cài {:.1}/{:.1} MB",
                                        copied_mb, total_mb
                                    )));
                                    ui.add_space(6.0);
                                    ui.label(
                                        RichText::new(format!("{:.1} MB/s", speed_mbps))
                                            .font(crate::typography::Typography::button_font())
                                            .color(Color32::from_rgb(37, 99, 235)),
                                    );
                                });

                                ui.add_space(4.0);
                                render_flat_progress_bar(ui, *progress);
                            });
                            ctx.request_repaint();
                        }
                        AppStatus::Verifying => {
                            ui.label(crate::typography::Typography::description("Đang kiểm tra..."));
                            ctx.request_repaint();
                        }
                        AppStatus::Extracting => {
                            ui.label(crate::typography::Typography::description("Đang hoàn tất cài đặt..."));
                            ctx.request_repaint();
                        }
                        AppStatus::Installed { .. } => {
                            // Trong right_to_left: Nút thêm trước sẽ nằm ở bên PHẢI (Mở)
                            let btn_launch_resp = crate::dwrite::button(
                                ui,
                                "Mở",
                                &crate::typography::Typography::button_white_style(),
                                Vec2::new(76.0, 34.0),
                                Color32::from_rgb(15, 23, 42),
                                Stroke::NONE,
                                Rounding::same(8.0_f32),
                            );

                            if btn_launch_resp.clicked() {
                                triggered_action = Some(AppRowAction::Launch(idx));
                            }

                            ui.add_space(8.0);

                            // Nút thêm sau sẽ nằm ở bên TRÁI (Gỡ)
                            let btn_uninstall_resp = crate::dwrite::button(
                                ui,
                                "Gỡ",
                                &crate::typography::Typography::button_danger_style(),
                                Vec2::new(52.0, 34.0),
                                Color32::from_rgb(254, 242, 242),
                                Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)),
                                Rounding::same(8.0_f32),
                            );

                            if btn_uninstall_resp.clicked() {
                                triggered_action = Some(AppRowAction::Uninstall(idx));
                            }
                        }
                        AppStatus::Error(err) => {
                            let btn_retry = egui::Button::new(
                                RichText::new("Thử lại")
                                    .font(crate::typography::Typography::button_font())
                                    .color(Color32::from_rgb(15, 23, 42)),
                            )
                            .fill(Color32::from_rgb(241, 245, 249))
                            .stroke(Stroke::new(1.0_f32, Color32::from_rgb(203, 213, 225)))
                            .rounding(Rounding::same(6.0_f32))
                            .min_size(Vec2::new(74.0, 34.0));

                            if ui.add(btn_retry).clicked() {
                                triggered_action = Some(AppRowAction::Install(idx));
                            }

                            ui.add_space(6.0);
                            ui.label(
                                RichText::new(format!("Lỗi: {}", err))
                                    .font(crate::typography::Typography::caption_font())
                                    .color(Color32::from_rgb(220, 38, 38)),
                            );
                        }
                    }
                },
            );
        });
    });

    triggered_action
}

/// Thẻ ứng dụng gọn cho bố cục Software Hub; dùng cùng các hành động như hàng cũ.
pub fn render_app_tile(ui: &mut Ui, ctx: &Context, idx: usize, app: &AppInfo) -> Option<AppRowAction> {
    let mut action = None;
    Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0_f32, Color32::from_rgb(225, 231, 239)))
        .rounding(Rounding::same(11.0))
        // Keep a visible gutter around each tile. The list uses equal-width
        // columns, so without an outer margin adjacent card borders touch.
        .outer_margin(Margin::symmetric(5.0, 5.0))
        .inner_margin(Margin::same(16.0))
        .show(ui, |ui| {
            ui.set_min_width(ui.available_width());
            ui.set_min_height(176.0);

            ui.horizontal(|ui| {
                let (icon_bg, icon_text, font_size) = get_app_icon_visuals(&app.id);
                let (icon_rect, _) = ui.allocate_exact_size(Vec2::splat(42.0), egui::Sense::hover());
                ui.painter().rect_filled(icon_rect, Rounding::same(9.0), icon_bg);
                ui.painter().text(
                    icon_rect.center(),
                    egui::Align2::CENTER_CENTER,
                    icon_text,
                    crate::font::semibold_font(font_size.min(18.0)),
                    Color32::WHITE,
                );
                ui.add_space(9.0);
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new(format!("Nom {}", app.name))
                            .font(crate::font::semibold_font(14.0))
                            .color(Color32::from_rgb(15, 23, 42)),
                    );
                    ui.label(
                        RichText::new(app.category.to_uppercase())
                            .size(10.5)
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                });
            });

            ui.add_space(10.0);
            ui.allocate_ui_with_layout(
                Vec2::new(ui.available_width(), 43.0),
                egui::Layout::top_down(egui::Align::Min),
                |ui| {
                    ui.add(
                        egui::Label::new(
                            RichText::new(&app.description)
                                .size(11.5)
                                .color(Color32::from_rgb(71, 85, 105)),
                        )
                        .wrap(),
                    );
                },
            );

            ui.add_space(8.0);
            ui.separator();
            ui.add_space(7.0);
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new(format!("v{}  ·  {:.1} MB", app.version, app.size_mb))
                        .size(10.5)
                        .color(Color32::from_rgb(100, 116, 139)),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    // Override the app-wide zero spacing locally so action buttons
                    // remain visibly separated even on compact cards.
                    ui.spacing_mut().item_spacing.x = 8.0;
                    match &app.status {
                        AppStatus::NotInstalled => {
                            if ui
                                .add(
                                    egui::Button::new(RichText::new("Cài đặt").size(11.5).color(Color32::WHITE))
                                        .fill(Color32::from_rgb(37, 99, 235))
                                        .stroke(Stroke::NONE)
                                        .rounding(Rounding::same(7.0))
                                        .min_size(Vec2::new(78.0, 30.0)),
                                )
                                .clicked()
                            {
                                action = Some(AppRowAction::Install(idx));
                            }
                        }
                        AppStatus::Installed { .. } => {
                            if ui
                                .add(
                                    egui::Button::new(RichText::new("Mở").size(11.5).color(Color32::WHITE))
                                        .fill(Color32::from_rgb(15, 23, 42))
                                        .stroke(Stroke::NONE)
                                        .rounding(Rounding::same(7.0))
                                        .min_size(Vec2::new(58.0, 30.0)),
                                )
                                .clicked()
                            {
                                action = Some(AppRowAction::Launch(idx));
                            }
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("Gỡ").size(11.5).color(Color32::from_rgb(220, 38, 38)),
                                    )
                                    .fill(Color32::from_rgb(254, 242, 242))
                                    .stroke(Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)))
                                    .rounding(Rounding::same(7.0))
                                    .min_size(Vec2::new(50.0, 30.0)),
                                )
                                .clicked()
                            {
                                action = Some(AppRowAction::Uninstall(idx));
                            }
                        }
                        AppStatus::Installing {
                            progress: _,
                            speed_mbps,
                            copied_mb,
                            total_mb,
                        } => {
                            ui.label(
                                RichText::new(format!(
                                    "Cài {:.1}/{:.1} MB · {:.1} MB/s",
                                    copied_mb, total_mb, speed_mbps
                                ))
                                .size(10.5),
                            );
                            ctx.request_repaint();
                        }
                        AppStatus::Verifying => {
                            ui.label(RichText::new("Đang kiểm tra...").size(10.5));
                            ctx.request_repaint();
                        }
                        AppStatus::Extracting => {
                            ui.label(RichText::new("Đang hoàn tất cài đặt...").size(10.5));
                            ctx.request_repaint();
                        }
                        AppStatus::Error(error) => {
                            if ui
                                .add(egui::Button::new("Thử lại").rounding(Rounding::same(7.0)))
                                .clicked()
                            {
                                action = Some(AppRowAction::Install(idx));
                            }
                            ui.label(
                                RichText::new(format!("Lỗi: {error}"))
                                    .size(10.0)
                                    .color(Color32::from_rgb(220, 38, 38)),
                            );
                        }
                    }
                });
            });
            if let AppStatus::Installing { progress, .. } = &app.status {
                ui.add_space(5.0);
                render_flat_progress_bar(ui, *progress);
            }
        });
    action
}

#[cfg(test)]
mod tile_tests {
    use super::*;

    #[test]
    fn app_tile_fits_single_and_two_column_widths() {
        let app = nom_package::get_default_catalog().remove(0);
        for width in [330.0_f32, 500.0_f32] {
            let ctx = egui::Context::default();
            crate::font::setup_vietnamese_font(&ctx);
            let input = egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(Pos2::ZERO, Vec2::new(width, 500.0))),
                ..Default::default()
            };
            let _ = ctx.run(input, |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    render_app_tile(ui, ctx, 0, &app);
                    assert!(ui.min_rect().width() <= width + 1.0);
                });
            });
        }
    }
}
