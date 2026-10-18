use super::filter::FilterTab;
use super::item::{render_app_tile, AppRowAction};
use eframe::egui::{Color32, Context, Ui};
use nom_package::{AppInfo, AppStatus};

fn matching_app_indices(
    apps: &[AppInfo],
    filter_tab: FilterTab,
    category_filter: Option<&str>,
    search_query: &str,
) -> Vec<usize> {
    let query_lower = search_query.trim().to_lowercase();
    apps.iter()
        .enumerate()
        .filter_map(|(idx, app)| {
            let tab_match = match filter_tab {
                FilterTab::All => true,
                FilterTab::Installed => matches!(app.status, AppStatus::Installed { .. }),
                FilterTab::NotInstalled => !matches!(app.status, AppStatus::Installed { .. }),
            };
            if !tab_match || category_filter.is_some_and(|category| app.category != category) {
                return None;
            }
            if !query_lower.is_empty()
                && !app.name.to_lowercase().contains(&query_lower)
                && !app.description.to_lowercase().contains(&query_lower)
                && !app.category.to_lowercase().contains(&query_lower)
            {
                return None;
            }
            Some(idx)
        })
        .collect()
}

pub fn render_app_list(
    ui: &mut Ui,
    ctx: &Context,
    apps: &[AppInfo],
    filter_tab: FilterTab,
    category_filter: Option<&str>,
    search_query: &str,
) -> (Option<usize>, Option<usize>, Option<usize>) {
    let mut install_target = None;
    let mut launch_target = None;
    let mut uninstall_target = None;

    let matching = matching_app_indices(apps, filter_tab, category_filter, search_query);

    ui.horizontal(|ui| {
        ui.label(
            eframe::egui::RichText::new("Ứng dụng")
                .size(16.0)
                .strong()
                .color(Color32::from_rgb(15, 23, 42)),
        );
        ui.label(
            eframe::egui::RichText::new(format!("{} kết quả", matching.len()))
                .size(11.5)
                .color(Color32::from_rgb(100, 116, 139)),
        );
    });
    ui.add_space(12.0);

    let mut record_action = |action: AppRowAction| match action {
        AppRowAction::Install(i) => install_target = Some(i),
        AppRowAction::Launch(i) => launch_target = Some(i),
        AppRowAction::Uninstall(i) => uninstall_target = Some(i),
    };

    if ui.available_width() >= 620.0 {
        ui.columns(2, |columns| {
            for (position, &idx) in matching.iter().enumerate() {
                let col = &mut columns[position % 2];
                if let Some(action) = render_app_tile(col, ctx, idx, &apps[idx]) {
                    record_action(action);
                }
                col.add_space(12.0);
            }
        });
    } else {
        for &idx in &matching {
            if let Some(action) = render_app_tile(ui, ctx, idx, &apps[idx]) {
                record_action(action);
            }
            ui.add_space(12.0);
        }
    }

    if matching.is_empty() {
        ui.add_space(30.0);
        ui.vertical_centered(|ui| {
            let not_found_style = crate::dwrite::DWriteTextStyle {
                category: crate::dwrite::FontCategory::Body,
                weight: 400,
                size_pt: 13.5,
                color: Color32::from_rgb(71, 85, 105),
                bg_color: Some(Color32::WHITE),
            };
            crate::dwrite::label(ui, "Không tìm thấy ứng dụng phù hợp", &not_found_style);
            ui.add_space(4.0);
            crate::dwrite::label(
                ui,
                "Thử thay đổi từ khóa tìm kiếm hoặc chuyển đổi tab danh mục.",
                &crate::typography::Typography::caption_style(),
            );
        });
        ui.add_space(30.0);
    }

    (install_target, launch_target, uninstall_target)
}

#[cfg(test)]
mod tests {
    use super::{matching_app_indices, FilterTab};
    use nom_package::{get_default_catalog, AppStatus};

    #[test]
    fn hub_filters_use_existing_catalog_and_install_state() {
        let mut apps = get_default_catalog();
        apps[0].status = AppStatus::Installed {
            version: "1.0.0".into(),
        };
        assert_eq!(
            matching_app_indices(&apps, FilterTab::All, Some("Office"), ""),
            vec![0, 1, 2, 3]
        );
        assert_eq!(
            matching_app_indices(&apps, FilterTab::All, Some("Editor"), ""),
            vec![4, 5]
        );
        assert_eq!(matching_app_indices(&apps, FilterTab::Installed, None, ""), vec![0]);
        assert_eq!(
            matching_app_indices(&apps, FilterTab::NotInstalled, None, ""),
            vec![1, 2, 3, 4, 5]
        );
        assert_eq!(matching_app_indices(&apps, FilterTab::All, None, "pDf"), vec![3]);
    }
}
