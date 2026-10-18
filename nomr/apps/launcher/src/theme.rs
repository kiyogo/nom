use eframe::egui::{Color32, Rounding, Stroke, Visuals};

pub fn apply_flat_white_theme(ctx: &eframe::egui::Context) {
    let mut visuals = Visuals::light();

    // Nền canvas xám sáng dịu nhẹ (#F8FAFC) để tôn lên các thẻ Card trắng (#FFFFFF)
    visuals.panel_fill = Color32::WHITE;
    visuals.window_fill = Color32::WHITE;
    visuals.extreme_bg_color = Color32::WHITE;
    visuals.faint_bg_color = Color32::WHITE;
    visuals.window_stroke = Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240));

    // Bo góc hệ thống mềm mại
    visuals.window_rounding = Rounding::same(14.0_f32);
    visuals.menu_rounding = Rounding::same(10.0_f32);

    // Trạng thái nút bấm / widget (Inactive)
    // bg_fill màu xám nhạt thanh lịch chuẩn Chrome (#CBD5E1) để thanh cuộn scrollbar không bị màu đen
    visuals.widgets.inactive.bg_fill = Color32::from_rgb(203, 213, 225);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(15, 23, 42));
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240));
    visuals.widgets.inactive.rounding = Rounding::same(9.0_f32);

    // Hover: xám đậm hơn chút xíu
    visuals.widgets.hovered = visuals.widgets.inactive;
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(156, 163, 175);

    // Trạng thái khi bấm (Active)
    visuals.widgets.active.bg_fill = Color32::from_rgb(107, 114, 128);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0_f32, Color32::BLACK);
    visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(71, 85, 105));
    visuals.widgets.active.rounding = Rounding::same(9.0_f32);

    visuals.widgets.open = visuals.widgets.inactive;

    ctx.set_visuals(visuals);

    // ── Tinh chỉnh thanh cuộn (Scrollbar) chuẩn Google Chrome & Windows 11 ──────
    // Mảnh mai 4px, màu xám nhạt thanh lịch, KHÔNG bị màu đen, KHÔNG bo góc to dị dạng
    let mut style = (*ctx.style()).clone();
    style.spacing.scroll.floating = true;
    style.spacing.scroll.bar_width = 4.0; // Siêu mảnh 4px thay vì 12px thô to
    style.spacing.scroll.floating_width = 4.0;
    style.spacing.scroll.floating_allocated_width = 0.0;
    style.spacing.scroll.bar_inner_margin = 1.0;
    style.spacing.scroll.bar_outer_margin = 1.0;
    style.spacing.scroll.foreground_color = false; // Tắt cờ màu đen fg_stroke!
    style.spacing.scroll.dormant_background_opacity = 0.0; // Nền trong suốt
    style.spacing.scroll.active_background_opacity = 0.0;
    style.spacing.scroll.dormant_handle_opacity = 0.45;
    style.spacing.scroll.active_handle_opacity = 0.75;
    style.spacing.scroll.interact_handle_opacity = 1.0;

    // ── Cấu hình Text Styles hệ thống kết nối chặt chẽ với Typography ───────────────
    let mut text_styles = std::collections::BTreeMap::new();
    text_styles.insert(
        eframe::egui::TextStyle::Heading,
        crate::typography::Typography::heading_font(),
    );
    text_styles.insert(
        eframe::egui::TextStyle::Body,
        crate::typography::Typography::description_font(),
    );
    text_styles.insert(
        eframe::egui::TextStyle::Button,
        crate::typography::Typography::button_font(),
    );
    text_styles.insert(
        eframe::egui::TextStyle::Small,
        crate::typography::Typography::caption_font(),
    );
    text_styles.insert(
        eframe::egui::TextStyle::Monospace,
        eframe::egui::FontId::new(13.0, eframe::egui::FontFamily::Monospace),
    );
    style.text_styles = text_styles;

    ctx.set_style(style);
}
