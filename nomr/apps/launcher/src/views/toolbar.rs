use eframe::egui::{self, Color32, Pos2, Rect, Rounding, Stroke, Ui, Vec2};

/// Thanh công cụ điều hướng cố định (Fixed Toolbar / Navigation Bar)
/// Phong cách Google Chrome / Windows 11 Fluent:
/// - Nối liền mạch với Tab active ở phía trên (nền trắng #FFFFFF đồng bộ)
/// - Cố định ở đầu cửa sổ, KHÔNG BỊ CUỘN THEO danh sách ứng dụng
/// - Chứa ô tìm kiếm ứng dụng (Search Box) và nhãn trạng thái Windows Control Panel
/// - Có vạch ngăn cách 1px (#E2E8F0) bên dưới, đảm bảo danh sách ứng dụng khi cuộn
///   sẽ lướt mượt mà bên dưới thanh công cụ mà KHÔNG BAO GIỜ bị tràn lên hay đè vào dải Tab.
#[allow(dead_code)]
pub fn render_fixed_toolbar(ui: &mut Ui, search_query: &mut String, status_message: Option<&str>, app_count: usize) {
    let toolbar_height = 46.0_f32;
    let (toolbar_rect, _) =
        ui.allocate_exact_size(Vec2::new(ui.available_width(), toolbar_height), egui::Sense::hover());

    // 1. Nền trắng tinh khôi kết nối hoàn hảo với Tab đang active
    ui.painter().rect_filled(toolbar_rect, Rounding::ZERO, Color32::WHITE);

    let total_width = toolbar_rect.width();
    let max_content_width = 860.0_f32;
    let side_padding = ((total_width - max_content_width) / 2.0).max(24.0);

    let content_start_x = toolbar_rect.min.x + side_padding;
    let content_end_x = toolbar_rect.max.x - side_padding;
    let content_cy = toolbar_rect.center().y;

    // 2. Ô tìm kiếm bên trái (Search Input Box)
    let search_w = 340.0_f32.min(content_end_x - content_start_x - 220.0).max(200.0);
    let search_rect = Rect::from_center_size(
        Pos2::new(content_start_x + search_w / 2.0, content_cy),
        Vec2::new(search_w, 32.0),
    );

    let mut search_ui = ui.new_child(egui::UiBuilder::new().max_rect(search_rect));
    let text_edit = egui::TextEdit::singleline(search_query)
        .hint_text("🔍 Tìm kiếm ứng dụng (Writer, Sheet, PDF, Slide...)")
        .font(crate::typography::Typography::description_font())
        .margin(egui::Margin::symmetric(10.0, 6.0));
    search_ui.add_sized(Vec2::new(search_w, 30.0), text_edit);

    let p = ui.painter();

    // 3. Cụm trạng thái bên phải (Status / Windows Control Panel live sync)
    let right_zone_w = (content_end_x - (content_start_x + search_w + 16.0)).max(0.0);
    if right_zone_w > 120.0 {
        let badge_w = 230.0_f32.min(right_zone_w);
        let badge_rect = Rect::from_min_max(
            Pos2::new(content_end_x - badge_w, content_cy - 13.0),
            Pos2::new(content_end_x, content_cy + 13.0),
        );

        if let Some(msg) = status_message {
            // Thông báo thao tác cài đặt / gỡ ứng dụng
            let badge_bg = Color32::from_rgb(240, 253, 244);
            let badge_border = Color32::from_rgb(187, 247, 208);
            p.rect_filled(badge_rect, Rounding::same(6.0_f32), badge_bg);
            p.rect_stroke(badge_rect, Rounding::same(6.0_f32), Stroke::new(1.0_f32, badge_border));

            let dot_center = Pos2::new(badge_rect.min.x + 12.0, badge_rect.center().y);
            p.circle_filled(dot_center, 3.5, Color32::from_rgb(22, 163, 74));

            let text_pos = Pos2::new(badge_rect.min.x + 22.0, badge_rect.center().y);
            let truncated = if msg.chars().count() > 24 {
                let mut s: String = msg.chars().take(23).collect();
                s.push('…');
                s
            } else {
                msg.to_string()
            };
            crate::dwrite::paint_text(
                p,
                text_pos,
                egui::Align2::LEFT_CENTER,
                &truncated,
                &crate::typography::Typography::status_success_style(),
                ui.ctx(),
            );
        } else {
            // Nhãn kết nối Control Panel chuẩn Windows 11
            let badge_bg = Color32::from_rgb(248, 250, 252);
            let badge_border = Color32::from_rgb(226, 232, 240);
            p.rect_filled(badge_rect, Rounding::same(6.0_f32), badge_bg);
            p.rect_stroke(badge_rect, Rounding::same(6.0_f32), Stroke::new(1.0_f32, badge_border));

            let dot_center = Pos2::new(badge_rect.min.x + 12.0, badge_rect.center().y);
            p.circle_filled(dot_center, 3.5, Color32::from_rgb(22, 163, 74));

            let label_text = format!("Windows Control Panel ({} app)", app_count);
            let text_pos = Pos2::new(badge_rect.min.x + 22.0, badge_rect.center().y);
            crate::dwrite::paint_text(
                p,
                text_pos,
                egui::Align2::LEFT_CENTER,
                &label_text,
                &crate::typography::Typography::metadata_style(),
                ui.ctx(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_toolbar_layout_metrics() {
        let ctx = egui::Context::default();
        let _ = ctx.run(Default::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                ui.spacing_mut().item_spacing = Vec2::ZERO;
                let start_cursor = ui.cursor().min;
                let mut search = String::new();
                render_fixed_toolbar(ui, &mut search, None, 6);
                let end_cursor = ui.cursor().min;
                println!("start_cursor: {:?}, end_cursor: {:?}", start_cursor, end_cursor);
            });
        });
    }
}
