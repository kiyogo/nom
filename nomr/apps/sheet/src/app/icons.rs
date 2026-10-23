use eframe::egui::{self, Align2, Color32, Pos2, Rect, Rounding, Stroke, Ui, Vec2};

#[derive(Clone, Copy)]
pub(super) enum Icon {
    Save,
    Open,
    New,
    Undo,
    Redo,
    Copy,
    Cut,
    Paste,
    Bold,
    Italic,
    Underline,
    Strike,
    Left,
    Center,
    Right,
    TextColor,
    Fill,
    Chart,
    Search,
    Add,
    Delete,
    Sort,
    Formula,
    Grid,
}

pub(super) fn draw(p: &egui::Painter, rect: Rect, icon: Icon, color: Color32) {
    let c = rect.center();
    let s = Stroke::new(1.3_f32, color);
    let pt = |x: f32, y: f32| Pos2::new(c.x + x, c.y + y);
    let line = |a: (f32, f32), b: (f32, f32)| {
        p.line_segment([pt(a.0, a.1), pt(b.0, b.1)], s);
    };
    match icon {
        Icon::Save => {
            p.rect_stroke(Rect::from_center_size(c, Vec2::splat(13.0)), Rounding::same(1.0), s);
            p.rect_stroke(
                Rect::from_center_size(pt(0.0, 3.0), Vec2::new(7.0, 5.0)),
                Rounding::ZERO,
                s,
            );
            line((-3.0, -6.0), (-3.0, -1.0));
            line((-3.0, -1.0), (4.0, -1.0));
        }
        Icon::Open => {
            p.rect_stroke(Rect::from_min_max(pt(-7.0, -3.0), pt(7.0, 6.0)), Rounding::same(1.0), s);
            line((-7.0, -3.0), (-7.0, -6.0));
            line((-7.0, -6.0), (-1.0, -6.0));
            line((-1.0, -6.0), (1.0, -3.0));
        }
        Icon::New | Icon::Add => {
            line((-6.0, 0.0), (6.0, 0.0));
            line((0.0, -6.0), (0.0, 6.0));
        }
        Icon::Undo | Icon::Redo => {
            let d = if matches!(icon, Icon::Undo) { 1.0 } else { -1.0 };
            p.add(egui::Shape::line(
                vec![
                    pt(-6.0 * d, -2.0),
                    pt(1.0 * d, -2.0),
                    pt(5.0 * d, 1.0),
                    pt(4.0 * d, 5.0),
                    pt(0.0, 6.0),
                ],
                s,
            ));
            line((-6.0 * d, -2.0), (-2.0 * d, -6.0));
            line((-6.0 * d, -2.0), (-2.0 * d, 2.0));
        }
        Icon::Copy => {
            p.rect_stroke(Rect::from_min_max(pt(-3.0, -4.0), pt(6.0, 7.0)), Rounding::same(1.0), s);
            line((-6.0, 3.0), (-6.0, -7.0));
            line((-6.0, -7.0), (3.0, -7.0));
        }
        Icon::Paste => {
            p.rect_stroke(Rect::from_min_max(pt(-6.0, -5.0), pt(6.0, 7.0)), Rounding::same(1.0), s);
            p.rect_stroke(
                Rect::from_min_max(pt(-3.0, -7.0), pt(3.0, -3.0)),
                Rounding::same(1.0),
                s,
            );
        }
        Icon::Cut => {
            p.circle_stroke(pt(-4.0, 4.0), 2.5, s);
            p.circle_stroke(pt(4.0, 4.0), 2.5, s);
            line((-3.0, 2.0), (5.0, -7.0));
            line((3.0, 2.0), (-5.0, -7.0));
        }
        Icon::Left | Icon::Center | Icon::Right => {
            for (i, w) in [13.0, 8.0, 13.0, 8.0].into_iter().enumerate() {
                let x = if matches!(icon, Icon::Left) {
                    -6.5
                } else if matches!(icon, Icon::Right) {
                    6.5 - w
                } else {
                    -w / 2.0
                };
                let y = -5.0 + i as f32 * 3.5;
                line((x, y), (x + w, y));
            }
        }
        Icon::Search => {
            p.circle_stroke(pt(-1.5, -1.5), 4.5, s);
            line((2.0, 2.0), (7.0, 7.0));
        }
        Icon::Chart => {
            for (x, h) in [(-5.0, 5.0), (0.0, 12.0), (5.0, 8.0)] {
                p.rect_stroke(
                    Rect::from_min_size(pt(x - 1.5, 7.0 - h), Vec2::new(3.0, h)),
                    Rounding::ZERO,
                    s,
                );
            }
        }
        Icon::Grid => {
            p.rect_stroke(Rect::from_center_size(c, Vec2::splat(14.0)), Rounding::ZERO, s);
            line((-7.0, 0.0), (7.0, 0.0));
            line((0.0, -7.0), (0.0, 7.0));
        }
        Icon::Delete => {
            line((-6.0, -4.0), (6.0, -4.0));
            line((-3.0, -7.0), (3.0, -7.0));
            p.rect_stroke(Rect::from_min_max(pt(-4.5, -3.0), pt(4.5, 7.0)), Rounding::same(1.0), s);
        }
        Icon::TextColor | Icon::Fill => {
            p.text(
                pt(0.0, -2.0),
                Align2::CENTER_CENTER,
                if matches!(icon, Icon::Fill) { "A" } else { "A" },
                egui::FontId::proportional(17.0),
                color,
            );
            p.rect_filled(
                Rect::from_min_size(pt(-7.0, 6.0), Vec2::new(14.0, 3.0)),
                Rounding::ZERO,
                if matches!(icon, Icon::Fill) {
                    Color32::from_rgb(255, 210, 70)
                } else {
                    super::appearance::BLUE
                },
            );
        }
        _ => {
            let text = match icon {
                Icon::Bold => "B",
                Icon::Italic => "I",
                Icon::Underline => "U",
                Icon::Strike => "S",
                Icon::Sort => "A-Z",
                Icon::Formula => "fx",
                _ => "",
            };
            p.text(
                c,
                Align2::CENTER_CENTER,
                text,
                egui::FontId::new(15.0, egui::FontFamily::Name("Arial-1".into())),
                color,
            );
            if matches!(icon, Icon::Underline) {
                line((-5.0, 7.0), (5.0, 7.0));
            }
            if matches!(icon, Icon::Strike) {
                line((-6.0, 0.0), (6.0, 0.0));
            }
        }
    }
}

pub(super) fn button(ui: &mut Ui, icon: Icon, title: &str, label: Option<&str>, selected: bool) -> bool {
    let size = if label.is_some() {
        Vec2::new(58.0, 54.0)
    } else {
        Vec2::splat(28.0)
    };
    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::click());
    if selected {
        ui.painter().rect_filled(
            rect.shrink(1.0),
            Rounding::same(2.0),
            super::appearance::HEADER_SELECTED,
        );
    }
    let center = if label.is_some() {
        Pos2::new(rect.center().x, rect.top() + 18.0)
    } else {
        rect.center()
    };
    draw(
        ui.painter(),
        Rect::from_center_size(center, Vec2::splat(20.0)),
        icon,
        Color32::from_rgb(72, 76, 80),
    );
    if let Some(text) = label {
        ui.painter().text(
            Pos2::new(rect.center().x, rect.bottom() - 10.0),
            Align2::CENTER_CENTER,
            text,
            egui::FontId::proportional(10.5),
            Color32::from_rgb(68, 68, 68),
        );
    }
    response.on_hover_text(title).clicked()
}
