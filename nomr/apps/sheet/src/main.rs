#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;

use app::NomSheetApp;
use eframe::egui;

fn main() -> eframe::Result<()> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let capture = arguments
        .first()
        .filter(|value| *value == "--capture-ui")
        .and_then(|_| arguments.get(1))
        .map(std::path::PathBuf::from);
    let initial_file = if capture.is_some() {
        None
    } else {
        arguments.first().map(std::path::PathBuf::from)
    };
    let capture_mode = capture.is_some();
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size(if capture_mode {
                [1892.0, 1011.0]
            } else {
                [1440.0, 900.0]
            })
            .with_min_inner_size([760.0, 520.0])
            .with_decorations(false)
            .with_title("Nom Sheet"),
        ..Default::default()
    };
    eframe::run_native(
        "Nom Sheet",
        options,
        Box::new(move |context| {
            let mut app = NomSheetApp::new(context, initial_file.clone());
            if let Some(path) = capture.clone() {
                context.egui_ctx.set_pixels_per_point(1.0);
                app.request_visual_capture(path);
            }
            Ok(Box::new(app))
        }),
    )
}
