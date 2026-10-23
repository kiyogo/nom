//! Lucide icon geometry shared with the Docs reference (lucide-react 0.475, ISC).
//! Paths are retained verbatim; white strokes are tinted at paint time.
use super::*;

#[derive(Clone, Copy)]
pub(super) enum ChromeIcon {
    Save,
    Download,
    Open,
    Print,
    Export,
    Source,
    Keyboard,
    New,
    Undo,
    Redo,
    Search,
}

pub(super) fn paint(ui: &Ui, rect: Rect, icon: ChromeIcon, color: Color32) {
    let (id, paths) = match icon {
        ChromeIcon::Save => (
            "save",
            r#"<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>"#,
        ),
        ChromeIcon::Download => (
            "download",
            r#"<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/>"#,
        ),
        ChromeIcon::Open => (
            "file-up",
            r#"<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6m3-3-3-3-3 3"/>"#,
        ),
        ChromeIcon::Print => (
            "printer",
            r#"<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>"#,
        ),
        ChromeIcon::Export => (
            "scroll-text",
            r#"<path d="M15 12h-5m5-4h-5m9 9V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>"#,
        ),
        ChromeIcon::Source => (
            "code",
            r#"<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>"#,
        ),
        ChromeIcon::Keyboard => (
            "keyboard",
            r#"<path d="M10 8h.01M12 12h.01M14 8h.01M16 12h.01M18 8h.01M6 8h.01M7 16h10M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>"#,
        ),
        ChromeIcon::New => (
            "file-text",
            r#"<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8m8 4H8m8 4H8"/>"#,
        ),
        ChromeIcon::Undo => (
            "undo",
            r#"<path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>"#,
        ),
        ChromeIcon::Redo => (
            "redo",
            r#"<g transform="translate(24 0) scale(-1 1)"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></g>"#,
        ),
        ChromeIcon::Search => ("search", r#"<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>"#),
    };
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{paths}</svg>"#
    );
    // egui's texture cache is keyed by URI, not SVG size hint. Keep the 16px
    // title icon separate from the 24px ribbon icon to avoid blurred upscaling.
    egui::Image::from_bytes(
        format!(
            "bytes://sheet-chrome-{id}-{}x{}-{}.svg",
            rect.width(),
            rect.height(),
            ui.ctx().pixels_per_point()
        ),
        svg.into_bytes(),
    )
    .tint(color)
    .paint_at(ui, rect);
}
