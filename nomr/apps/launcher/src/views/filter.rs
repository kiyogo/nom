use eframe::egui::{self, Color32, Rounding, Stroke, Ui, Vec2};
use nom_package::AppInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterTab {
    All,
    Installed,
    NotInstalled,
}

#[allow(dead_code)]
pub fn render_filter_bar(ui: &mut Ui, active_tab: &mut FilterTab, search_query: &mut String, apps: &[AppInfo]) {
    let total_count = apps.len();
    let installed_count = apps
        .iter()
        .filter(|a| matches!(a.status, nom_package::AppStatus::Installed { .. }))
        .count();
    let not_installed_count = total_count - installed_count;

    ui.horizontal(|ui| {
        let is_all = *active_tab == FilterTab::All;
        let all_style = crate::dwrite::DWriteTextStyle {
            category: crate::dwrite::FontCategory::Body,
            weight: if is_all { 600 } else { 500 },
            size_pt: 12.5,
            color: if is_all {
                Color32::WHITE
            } else {
                Color32::from_rgb(71, 85, 105)
            },
            bg_color: Some(if is_all {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            }),
        };
        let btn_all_resp = crate::dwrite::button(
            ui,
            format!("Tất cả ({})", total_count),
            &all_style,
            Vec2::new(78.0, 32.0),
            if is_all {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            },
            if is_all {
                Stroke::NONE
            } else {
                Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240))
            },
            Rounding::same(10.0_f32),
        );

        if btn_all_resp.clicked() {
            *active_tab = FilterTab::All;
        }

        ui.add_space(6.0);

        let is_installed = *active_tab == FilterTab::Installed;
        let inst_style = crate::dwrite::DWriteTextStyle {
            category: crate::dwrite::FontCategory::Body,
            weight: if is_installed { 600 } else { 500 },
            size_pt: 12.5,
            color: if is_installed {
                Color32::WHITE
            } else {
                Color32::from_rgb(71, 85, 105)
            },
            bg_color: Some(if is_installed {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            }),
        };
        let btn_inst_resp = crate::dwrite::button(
            ui,
            format!("Đã cài đặt ({})", installed_count),
            &inst_style,
            Vec2::new(104.0, 32.0),
            if is_installed {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            },
            if is_installed {
                Stroke::NONE
            } else {
                Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240))
            },
            Rounding::same(10.0_f32),
        );

        if btn_inst_resp.clicked() {
            *active_tab = FilterTab::Installed;
        }

        ui.add_space(6.0);

        let is_not_installed = *active_tab == FilterTab::NotInstalled;
        let not_style = crate::dwrite::DWriteTextStyle {
            category: crate::dwrite::FontCategory::Body,
            weight: if is_not_installed { 600 } else { 500 },
            size_pt: 12.5,
            color: if is_not_installed {
                Color32::WHITE
            } else {
                Color32::from_rgb(71, 85, 105)
            },
            bg_color: Some(if is_not_installed {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            }),
        };
        let btn_not_resp = crate::dwrite::button(
            ui,
            format!("Chưa cài đặt ({})", not_installed_count),
            &not_style,
            Vec2::new(114.0, 32.0),
            if is_not_installed {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(241, 245, 249)
            },
            if is_not_installed {
                Stroke::NONE
            } else {
                Stroke::new(1.0_f32, Color32::from_rgb(226, 232, 240))
            },
            Rounding::same(10.0_f32),
        );

        if btn_not_resp.clicked() {
            *active_tab = FilterTab::NotInstalled;
        }

        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let search_edit = egui::TextEdit::singleline(search_query)
                .hint_text("Tìm kiếm ứng dụng...")
                .font(crate::typography::Typography::description_font())
                .min_size(Vec2::new(210.0, 32.0));
            ui.add(search_edit);
        });
    });

    ui.add_space(14.0);
}
