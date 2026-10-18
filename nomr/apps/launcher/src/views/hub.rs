use eframe::egui::{self, Align2, Color32, Pos2, RichText, Rounding, Sense, Stroke, Ui, Vec2};
use nom_package::{AppInfo, AppStatus};

const INK: Color32 = Color32::from_rgb(23, 32, 48);
const MUTED: Color32 = Color32::from_rgb(100, 116, 139);
const BLUE: Color32 = Color32::from_rgb(37, 99, 235);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HubNav {
    All,
    Installed,
    NotInstalled,
    Office,
    Editor,
}

fn nav_item(ui: &mut Ui, label: &str, count: usize, selected: bool, accent: Color32) -> bool {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 38.0), Sense::click());
    ui.painter().rect_filled(rect, Rounding::same(8.0), Color32::WHITE);
    ui.painter()
        .circle_filled(Pos2::new(rect.min.x + 15.0, rect.center().y), 4.0, accent);
    ui.painter().text(
        Pos2::new(rect.min.x + 29.0, rect.center().y),
        Align2::LEFT_CENTER,
        label,
        crate::font::regular_font(12.5),
        if selected { INK } else { Color32::from_rgb(71, 85, 105) },
    );
    ui.painter().text(
        Pos2::new(rect.max.x - 11.0, rect.center().y),
        Align2::RIGHT_CENTER,
        count.to_string(),
        crate::font::regular_font(11.0),
        MUTED,
    );
    response.clicked()
}

pub fn render_hub_sidebar(ui: &mut Ui, selected: Option<HubNav>, apps: &[AppInfo]) -> Option<HubNav> {
    let installed = apps
        .iter()
        .filter(|app| matches!(app.status, AppStatus::Installed { .. }))
        .count();
    let office = apps.iter().filter(|app| app.category == "Office").count();
    let editor = apps.iter().filter(|app| app.category == "Editor").count();
    let mut action = None;

    ui.horizontal(|ui| {
        let (logo, _) = ui.allocate_exact_size(Vec2::splat(34.0), Sense::hover());
        ui.painter().rect_filled(logo, Rounding::same(9.0), BLUE);
        ui.painter().text(
            logo.center(),
            Align2::CENTER_CENTER,
            "N",
            crate::font::semibold_font(19.0),
            Color32::WHITE,
        );
        ui.add_space(8.0);
        ui.vertical(|ui| {
            ui.label(RichText::new("Nom").size(15.0).strong().color(INK));
            ui.label(RichText::new("Software Hub").size(11.0).color(MUTED));
        });
    });

    ui.add_space(30.0);
    ui.label(RichText::new("THƯ VIỆN").size(10.0).strong().color(MUTED));
    ui.add_space(8.0);
    if nav_item(ui, "Kho ứng dụng", apps.len(), selected == Some(HubNav::All), BLUE) {
        action = Some(HubNav::All);
    }
    if nav_item(
        ui,
        "Đã cài đặt",
        installed,
        selected == Some(HubNav::Installed),
        Color32::from_rgb(5, 150, 105),
    ) {
        action = Some(HubNav::Installed);
    }
    if nav_item(
        ui,
        "Chưa cài đặt",
        apps.len() - installed,
        selected == Some(HubNav::NotInstalled),
        Color32::from_rgb(234, 88, 12),
    ) {
        action = Some(HubNav::NotInstalled);
    }

    ui.add_space(24.0);
    ui.label(RichText::new("DANH MỤC").size(10.0).strong().color(MUTED));
    ui.add_space(8.0);
    if nav_item(ui, "Office", office, selected == Some(HubNav::Office), BLUE) {
        action = Some(HubNav::Office);
    }
    if nav_item(
        ui,
        "Editor",
        editor,
        selected == Some(HubNav::Editor),
        Color32::from_rgb(124, 58, 237),
    ) {
        action = Some(HubNav::Editor);
    }

    ui.add_space(22.0);
    ui.painter().hline(
        ui.min_rect().left()..=ui.min_rect().right(),
        ui.cursor().min.y,
        Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240)),
    );
    ui.add_space(18.0);
    ui.label(
        RichText::new("Ứng dụng được đồng bộ với Windows Control Panel.")
            .size(11.0)
            .color(MUTED),
    );
    action
}

pub fn render_hub_header(ui: &mut Ui, title: &str, query: &mut String, status_message: Option<&str>) -> bool {
    let compact = ui.available_width() < 640.0;
    let mut search_changed = false;

    if compact {
        ui.label(RichText::new(title).size(24.0).strong().color(INK));
        ui.add_space(10.0);
        search_changed = ui
            .add_sized(
                Vec2::new(ui.available_width(), 34.0),
                egui::TextEdit::singleline(query)
                    .hint_text("Tìm ứng dụng...")
                    .margin(egui::Margin::symmetric(10.0, 7.0)),
            )
            .changed();
    } else {
        ui.horizontal(|ui| {
            ui.label(RichText::new(title).size(25.0).strong().color(INK));
            search_changed = ui
                .with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.add_sized(
                        Vec2::new(265.0, 34.0),
                        egui::TextEdit::singleline(query)
                            .hint_text("Tìm ứng dụng...")
                            .margin(egui::Margin::symmetric(10.0, 7.0)),
                    )
                    .changed()
                })
                .inner;
        });
    }

    ui.add_space(18.0);

    if let Some(message) = status_message {
        ui.add_space(12.0);
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(Stroke::new(1.0_f32, Color32::from_rgb(220, 235, 224)))
            .rounding(Rounding::same(8.0))
            .inner_margin(egui::Margin::symmetric(12.0, 9.0))
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.label(RichText::new(message).size(11.5).color(Color32::from_rgb(22, 101, 52)));
            });
    }

    ui.add_space(22.0);
    search_changed
}
