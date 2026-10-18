pub mod cache;
pub mod engine;

pub use engine::{DWriteTextStyle, FontCategory};

use eframe::egui::{self, Align2, Color32, Context, Painter, Pos2, Rect, Response, Rounding, Sense, Stroke, Ui, Vec2};

#[cfg(target_os = "windows")]
use cache::with_dwrite_cache;

/// Hiển thị nhãn văn bản sắc nét native 100% bằng DirectWrite + Direct2D
pub fn label(ui: &mut Ui, text: impl AsRef<str>, style: &DWriteTextStyle) -> Response {
    label_wrapped(ui, text, style, None)
}

/// Hiển thị nhãn văn bản DirectWrite với chiều rộng giới hạn tự ngắt dòng chuẩn tiếng Việt
pub fn label_wrapped(ui: &mut Ui, text: impl AsRef<str>, style: &DWriteTextStyle, max_width: Option<f32>) -> Response {
    let text_str = text.as_ref();

    #[cfg(target_os = "windows")]
    {
        let cached = with_dwrite_cache(|cache| cache.get_or_render(ui.ctx(), text_str, style, max_width));

        if let Some((texture, size)) = cached {
            let (rect, resp) = ui.allocate_exact_size(size, Sense::hover());
            if ui.is_rect_visible(rect) {
                let scale = ui.ctx().pixels_per_point();
                // Snap nguyên pixel vật lý để triệt tiêu hoàn toàn mờ do fractional transform
                let snapped_min = Pos2::new(
                    (rect.min.x * scale).round() / scale,
                    (rect.min.y * scale).round() / scale,
                );
                let snapped_rect = Rect::from_min_size(snapped_min, size);
                ui.painter().image(
                    texture.id(),
                    snapped_rect,
                    Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0)),
                    Color32::WHITE,
                );
            }
            return resp;
        }
    }

    // Fallback khi không chạy trên Windows hoặc khi DirectWrite khởi tạo không thành công
    let font_id = egui::FontId::new(style.size_pt, egui::FontFamily::Proportional);
    let rich = egui::RichText::new(text_str).font(font_id).color(style.color);
    ui.label(rich)
}

/// Vẽ văn bản DirectWrite trực tiếp vào Painter tại tọa độ chỉ định (cho tab bar, icon badges, v.v.)
pub fn paint_text(
    p: &Painter,
    pos: Pos2,
    align: Align2,
    text: impl AsRef<str>,
    style: &DWriteTextStyle,
    ctx: &Context,
) {
    let text_str = text.as_ref();

    #[cfg(target_os = "windows")]
    {
        let cached = with_dwrite_cache(|cache| cache.get_or_render(ctx, text_str, style, None));

        if let Some((texture, size)) = cached {
            let scale = ctx.pixels_per_point();
            let mut top_left = pos;
            match align.x() {
                egui::Align::Min => {}
                egui::Align::Center => top_left.x -= size.x / 2.0,
                egui::Align::Max => top_left.x -= size.x,
            }
            match align.y() {
                egui::Align::Min => {}
                egui::Align::Center => top_left.y -= size.y / 2.0,
                egui::Align::Max => top_left.y -= size.y,
            }

            let snapped_min = Pos2::new(
                (top_left.x * scale).round() / scale,
                (top_left.y * scale).round() / scale,
            );
            let snapped_rect = Rect::from_min_size(snapped_min, size);
            p.image(
                texture.id(),
                snapped_rect,
                Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
            return;
        }
    }

    let font_id = egui::FontId::new(style.size_pt, egui::FontFamily::Proportional);
    p.text(pos, align, text_str, font_id, style.color);
}

/// Nút bấm giao diện sử dụng văn bản DirectWrite sắc nét
pub fn button(
    ui: &mut Ui,
    text: impl AsRef<str>,
    style: &DWriteTextStyle,
    min_size: Vec2,
    fill: Color32,
    stroke: Stroke,
    rounding: Rounding,
) -> Response {
    let (rect, resp) = ui.allocate_exact_size(min_size, Sense::click());
    if ui.is_rect_visible(rect) {
        let is_hover = resp.hovered();
        let bg_col = if is_hover {
            if fill == Color32::from_rgb(15, 23, 42) {
                Color32::from_rgb(30, 41, 59)
            } else if fill == Color32::from_rgb(254, 242, 242) {
                Color32::from_rgb(254, 226, 226)
            } else {
                fill
            }
        } else {
            fill
        };

        ui.painter().rect_filled(rect, rounding, bg_col);
        if stroke.width > 0.0 && stroke.color != Color32::TRANSPARENT {
            ui.painter().rect_stroke(rect, rounding, stroke);
        }

        paint_text(
            ui.painter(),
            rect.center(),
            Align2::CENTER_CENTER,
            text,
            style,
            ui.ctx(),
        );
    }
    resp
}
