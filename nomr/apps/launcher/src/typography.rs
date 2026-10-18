use crate::dwrite::{DWriteTextStyle, FontCategory};
use eframe::egui::{Color32, FontFamily, FontId, RichText};

/// Hệ thống Typography tập trung chuẩn Microsoft Windows 11 Fluent Design kết hợp DirectWrite:
///
/// Bảng quy chuẩn tỷ lệ và trọng số (Font Metrics & Weight):
/// - `AppTitle`:    15.0pt | Semibold 600 | Segoe UI Variable Display
/// - `Description`: 12.8pt | Regular 400  | Segoe UI Variable Text
/// - `Metadata`:    11.5pt | Regular 400  | Segoe UI Variable Small
/// - `StatusBadge`: 11.5pt | Semibold 600 | Segoe UI Variable Small
/// - `Badge`:       10.5pt | Semibold 600 | Segoe UI Variable Small
/// - `Button`:      12.8pt | Semibold 600 | Segoe UI Variable Text
/// - `Tab`:         12.8pt | Medium 500 / Semibold 600 | Segoe UI Variable Text
/// - `Heading`:     16.0pt | Semibold 600 | Segoe UI Variable Display
/// - `Caption`:     11.5pt | Regular 400  | Segoe UI Variable Small
pub struct Typography;

impl Typography {
    // ── DirectWrite Native Windows 11 Text Styles ───────────────────────────

    /// Tiêu đề thẻ ứng dụng (Segoe UI Variable Display, 15.0pt, Semibold 600)
    #[inline]
    pub fn app_title_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Title,
            weight: 600,
            size_pt: 15.0,
            color: Color32::from_rgb(15, 23, 42),
            bg_color: Some(Color32::WHITE),
        }
    }

    /// Mô tả ứng dụng (Segoe UI Variable Text, 12.8pt, Regular 400)
    #[inline]
    pub fn description_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Body,
            weight: 400,
            size_pt: 12.8,
            color: Color32::from_rgb(51, 65, 85),
            bg_color: Some(Color32::WHITE),
        }
    }

    /// Metadata phiên bản, kích thước (Segoe UI Variable Small, 11.5pt, Regular 400)
    #[inline]
    pub fn metadata_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Small,
            weight: 400,
            size_pt: 11.5,
            color: Color32::from_rgb(71, 85, 105),
            bg_color: Some(Color32::WHITE),
        }
    }

    /// Trạng thái Control Panel (Segoe UI Variable Small, 11.5pt, Semibold 600)
    #[inline]
    pub fn status_success_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Small,
            weight: 600,
            size_pt: 11.5,
            color: Color32::from_rgb(22, 163, 74),
            bg_color: Some(Color32::WHITE),
        }
    }

    /// Badge thể loại (Segoe UI Variable Small, 10.5pt, Semibold 600)
    #[inline]
    pub fn badge_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Small,
            weight: 600,
            size_pt: 10.5,
            color: Color32::from_rgb(51, 65, 85),
            bg_color: Some(Color32::from_rgb(241, 245, 249)),
        }
    }

    /// Nút bấm màu trắng (Segoe UI Variable Text, 12.8pt, Semibold 600)
    #[inline]
    pub fn button_white_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Body,
            weight: 600,
            size_pt: 12.8,
            color: Color32::WHITE,
            bg_color: Some(Color32::from_rgb(15, 23, 42)),
        }
    }

    /// Nút bấm màu đỏ Danger (Segoe UI Variable Text, 12.8pt, Semibold 600)
    #[inline]
    pub fn button_danger_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Body,
            weight: 600,
            size_pt: 12.8,
            color: Color32::from_rgb(220, 38, 38),
            bg_color: Some(Color32::from_rgb(254, 242, 242)),
        }
    }

    /// Tab label đang active (Segoe UI Variable Text, 12.8pt, Regular 400 - KHÔNG IN ĐẬM)
    #[inline]
    pub fn tab_active_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Body,
            weight: 400,
            size_pt: 12.8,
            color: Color32::from_rgb(15, 23, 42),
            // Tab text is composited over a custom-shaped tab; an opaque
            // DirectWrite texture paints a second rectangular background.
            bg_color: None,
        }
    }

    /// Tab label không active (Segoe UI Variable Text, 12.8pt, Regular 400 - KHÔNG IN ĐẬM)
    #[inline]
    pub fn tab_inactive_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Body,
            weight: 400,
            size_pt: 12.8,
            color: Color32::from_rgb(71, 85, 105),
            bg_color: None,
        }
    }

    /// Tiêu đề Header (Segoe UI Variable Display, 16.0pt, Semibold 600)
    #[inline]
    pub fn heading_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Title,
            weight: 600,
            size_pt: 16.0,
            color: Color32::from_rgb(15, 23, 42),
            bg_color: Some(Color32::WHITE),
        }
    }

    /// Caption chân trang (Segoe UI Variable Small, 11.5pt, Regular 400)
    #[inline]
    pub fn caption_style() -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Small,
            weight: 400,
            size_pt: 11.5,
            color: Color32::from_rgb(71, 85, 105),
            bg_color: None,
        }
    }

    /// Icon nút điều khiển cửa sổ chuẩn Windows 11 (Segoe Fluent Icons, 10.0pt, 400)
    #[inline]
    pub fn window_control_style(color: Color32, bg_color: Option<Color32>) -> DWriteTextStyle {
        DWriteTextStyle {
            category: FontCategory::Icon,
            weight: 400,
            size_pt: 10.0,
            color,
            bg_color,
        }
    }

    // ── Fallback FontId Generators ──────────────────────────────────────────

    pub fn app_title_font() -> FontId {
        FontId::new(15.0, FontFamily::Name("semibold".into()))
    }

    pub fn description_font() -> FontId {
        FontId::new(12.8, FontFamily::Proportional)
    }

    pub fn metadata_font() -> FontId {
        FontId::new(11.5, FontFamily::Proportional)
    }

    pub fn status_font() -> FontId {
        FontId::new(11.5, FontFamily::Name("semibold".into()))
    }

    pub fn badge_font() -> FontId {
        FontId::new(10.5, FontFamily::Name("semibold".into()))
    }

    pub fn button_font() -> FontId {
        FontId::new(12.8, FontFamily::Name("semibold".into()))
    }

    pub fn tab_font() -> FontId {
        FontId::new(12.8, FontFamily::Proportional)
    }

    pub fn heading_font() -> FontId {
        FontId::new(16.0, FontFamily::Name("semibold".into()))
    }

    pub fn caption_font() -> FontId {
        FontId::new(11.5, FontFamily::Proportional)
    }

    // ── Fallback RichText Builders ──────────────────────────────────────────

    pub fn app_title(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::app_title_font())
            .color(Color32::from_rgb(15, 23, 42))
    }

    pub fn description(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::description_font())
            .color(Color32::from_rgb(51, 65, 85))
    }

    pub fn metadata(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::metadata_font())
            .color(Color32::from_rgb(71, 85, 105))
    }

    pub fn badge(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::badge_font())
            .color(Color32::from_rgb(51, 65, 85))
    }

    pub fn button_white(text: impl Into<String>) -> RichText {
        RichText::new(text).font(Self::button_font()).color(Color32::WHITE)
    }

    pub fn button_danger(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::button_font())
            .color(Color32::from_rgb(220, 38, 38))
    }

    pub fn tab(text: impl Into<String>, is_active: bool) -> RichText {
        let color = if is_active {
            Color32::from_rgb(15, 23, 42)
        } else {
            Color32::from_rgb(51, 65, 85)
        };
        RichText::new(text).font(Self::tab_font()).color(color)
    }

    pub fn status_success(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::status_font())
            .color(Color32::from_rgb(22, 163, 74))
    }

    pub fn caption(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::caption_font())
            .color(Color32::from_rgb(71, 85, 105))
    }

    pub fn heading(text: impl Into<String>) -> RichText {
        RichText::new(text)
            .font(Self::heading_font())
            .color(Color32::from_rgb(15, 23, 42))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_typography_metrics_conform_to_windows_11_spec() {
        assert_eq!(Typography::app_title_font().size, 15.0);
        assert_eq!(Typography::description_font().size, 12.8);
        assert_eq!(Typography::metadata_font().size, 11.5);
        assert_eq!(Typography::status_font().size, 11.5);
        assert_eq!(Typography::badge_font().size, 10.5);
        assert_eq!(Typography::button_font().size, 12.8);
        assert_eq!(Typography::tab_font().size, 12.8);
        assert_eq!(Typography::heading_font().size, 16.0);
        assert_eq!(Typography::caption_font().size, 11.5);
    }

    #[test]
    fn tab_text_is_transparent_over_the_tab_surface() {
        assert_eq!(Typography::tab_active_style().bg_color, None);
        assert_eq!(Typography::tab_inactive_style().bg_color, None);
    }
}
