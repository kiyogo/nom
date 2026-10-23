use eframe::egui::{self, Color32, Context, FontData, FontDefinitions, FontFamily, Rounding, Stroke, Vec2};

pub(super) const BLUE: Color32 = Color32::from_rgb(50, 113, 234);
pub(super) const HEADER: Color32 = Color32::from_rgb(248, 249, 250);
pub(super) const HEADER_SELECTED: Color32 = Color32::from_rgb(211, 227, 253);
pub(super) const GRID_LINE: Color32 = Color32::from_rgb(225, 225, 225);

pub(super) fn setup_sheet_appearance(context: &Context) {
    let mut fonts = FontDefinitions::default();
    for (family, faces) in [
        (
            "Segoe UI",
            ["segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"],
        ),
        ("Arial", ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"]),
        (
            "Times New Roman",
            ["times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"],
        ),
        (
            "Calibri",
            ["calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"],
        ),
    ] {
        for (index, face) in faces.iter().enumerate() {
            let name = format!("{family}-{index}");
            let mut fallback = fonts.families[&FontFamily::Proportional].clone();
            if let Ok(data) = std::fs::read(format!(r"C:\Windows\Fonts\{face}")) {
                fonts
                    .font_data
                    .insert(name.clone(), std::sync::Arc::new(FontData::from_owned(data)));
                fallback.insert(0, name.clone());
            }
            fonts.families.insert(FontFamily::Name(name.into()), fallback);
        }
    }
    let regular = fonts.families[&FontFamily::Name("Segoe UI-0".into())].clone();
    let mut semibold = regular.clone();
    if let Ok(data) = std::fs::read(r"C:\Windows\Fonts\seguisb.ttf") {
        fonts.font_data.insert(
            "Segoe UI-Semibold".into(),
            std::sync::Arc::new(FontData::from_owned(data)),
        );
        semibold.insert(0, "Segoe UI-Semibold".into());
    }
    fonts
        .families
        .insert(FontFamily::Name("Segoe UI-Semibold".into()), semibold);
    // Both proportional UI labels and monospace text fields need Vietnamese.
    fonts.families.insert(FontFamily::Proportional, regular.clone());
    fonts.families.insert(FontFamily::Monospace, regular);
    context.set_fonts(fonts);
    let mut style = (*context.style()).clone();
    style.visuals = egui::Visuals::light();
    style.visuals.override_text_color = Some(Color32::from_rgb(40, 40, 40));
    style.visuals.panel_fill = Color32::WHITE;
    style.visuals.window_fill = Color32::WHITE;
    style.visuals.extreme_bg_color = Color32::WHITE;
    style.visuals.selection.bg_fill = HEADER_SELECTED;
    style.visuals.selection.stroke = Stroke::new(1.0_f32, BLUE);
    style.visuals.widgets.noninteractive.bg_fill = Color32::WHITE;
    for widget in [
        &mut style.visuals.widgets.inactive,
        &mut style.visuals.widgets.hovered,
        &mut style.visuals.widgets.active,
    ] {
        widget.bg_fill = Color32::WHITE;
        widget.weak_bg_fill = Color32::WHITE;
        widget.bg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(224, 227, 231));
        widget.fg_stroke = Stroke::new(1.0_f32, Color32::from_rgb(55, 55, 55));
        widget.rounding = Rounding::same(2.0);
    }
    style.spacing.item_spacing = Vec2::new(6.0, 4.0);
    style.spacing.button_padding = Vec2::new(7.0, 4.0);
    style
        .text_styles
        .insert(egui::TextStyle::Body, egui::FontId::proportional(12.0));
    style
        .text_styles
        .insert(egui::TextStyle::Button, egui::FontId::proportional(12.0));
    context.set_style(style);
}
