use eframe::egui::Ui;

pub fn render_footer(ui: &mut Ui) {
    ui.add_space(16.0);
    ui.vertical_centered(|ui| {
        crate::dwrite::label(
            ui,
            "Toàn bộ ứng dụng được quản lý độc lập tại %LOCALAPPDATA%\\NomOffice và Windows Control Panel (appwiz.cpl).",
            &crate::typography::Typography::caption_style(),
        );
    });
    ui.add_space(20.0);
}
