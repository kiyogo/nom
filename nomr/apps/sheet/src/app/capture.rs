//! Capture the actual GPU-rendered frame without foreground-window races.
use super::*;

impl NomSheetApp {
    pub fn request_visual_capture(&mut self, path: PathBuf) {
        self.capture_path = Some(path);
        self.capture_frames = 8;
    }

    pub(super) fn capture_visual_frame(&mut self, ctx: &Context) {
        let Some(path) = self.capture_path.clone() else {
            return;
        };
        let captured = ctx.input(|input| {
            input.events.iter().find_map(|event| match event {
                egui::Event::Screenshot { image, .. } => Some(image.clone()),
                _ => None,
            })
        });
        if let Some(frame) = captured {
            let pixels: Vec<u8> = frame.pixels.iter().flat_map(|pixel| pixel.to_array()).collect();
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match image::save_buffer(
                &path,
                &pixels,
                frame.size[0] as u32,
                frame.size[1] as u32,
                image::ColorType::Rgba8,
            ) {
                Ok(()) => {
                    self.capture_path = None;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
                Err(error) => {
                    self.status = format!("Không lưu được ảnh: {error}");
                    self.capture_path = None;
                }
            }
        } else if self.capture_frames > 0 {
            self.capture_frames -= 1;
            ctx.request_repaint();
        } else {
            ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(egui::UserData::default()));
            ctx.request_repaint();
        }
    }
}
