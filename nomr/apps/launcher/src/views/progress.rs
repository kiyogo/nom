use eframe::egui::{Color32, Rounding, Stroke, Ui, Vec2};

pub fn render_flat_progress_bar(ui: &mut Ui, progress: f32) {
    let pbar_width = 160.0_f32;
    let pbar_height = 8.0_f32;
    let (pbar_rect, _) = ui.allocate_exact_size(Vec2::new(pbar_width, pbar_height), eframe::egui::Sense::hover());

    ui.painter()
        .rect_filled(pbar_rect, Rounding::same(5.0_f32), Color32::from_rgb(226, 232, 240));

    let fill_width = pbar_width * progress.clamp(0.0, 1.0);
    if fill_width > 0.0 {
        let fill_rect = eframe::egui::Rect::from_min_size(pbar_rect.min, Vec2::new(fill_width, pbar_height));
        ui.painter()
            .rect_filled(fill_rect, Rounding::same(5.0_f32), Color32::from_rgb(37, 99, 235));
    }

    ui.painter().rect_stroke(
        pbar_rect,
        Rounding::same(5.0_f32),
        Stroke::new(1.0_f32, Color32::from_rgb(203, 213, 225)),
    );
}
