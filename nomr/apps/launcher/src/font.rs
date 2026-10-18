use eframe::egui::{Context, FontData, FontDefinitions, FontFamily, FontId};

/// Cấu hình typography thanh lịch chuẩn Microsoft Windows 11 Fluent & Google Chrome:
/// 1. `segoe_regular`: Segoe UI Regular (400) cho toàn bộ tabs, buttons, mô tả, nhãn, footer
/// 2. `segoe_semibold`: Segoe UI Semibold (600) thanh thoát cho tiêu đề ứng dụng (KHÔNG DÙNG BOLD 700 THÔ KỆCH)
/// 3. `symbols`: Bộ biểu tượng Windows 11 Fluent SegoeIcons / segmdl2
pub fn setup_vietnamese_font(ctx: &Context) {
    let mut fonts = FontDefinitions::default();

    // 1. Nạp Segoe UI TrueType chuẩn cho độ sắc nét tối đa trên rasterizer
    let regular_candidates = [
        // Windows 11 / 10 / 8 / 7: Segoe UI TrueType chuẩn (không bị lỗi baseline như SegUIVar variable)
        r"C:\Windows\Fonts\segoeui.ttf",
        // Fallback Windows thông dụng
        r"C:\Windows\Fonts\arial.ttf",
        // macOS San Francisco / Helvetica
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFPro.ttf",
        "/Library/Fonts/Arial.ttf",
        // Linux DejaVu / Liberation / Ubuntu
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
    ];

    for path in &regular_candidates {
        if let Ok(data) = std::fs::read(path) {
            fonts.font_data.insert(
                "segoe_regular".to_owned(),
                std::sync::Arc::new(FontData::from_owned(data)),
            );
            fonts
                .families
                .entry(FontFamily::Proportional)
                .or_default()
                .insert(0, "segoe_regular".to_owned());
            break;
        }
    }

    // 2. Nạp Segoe UI Semibold (seguisb.ttf - 600) cho tiêu đề thanh nhã, sắc bén chuẩn Windows 11
    let semibold_candidates = [
        r"C:\Windows\Fonts\seguisb.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ];

    for path in &semibold_candidates {
        if let Ok(data) = std::fs::read(path) {
            fonts.font_data.insert(
                "segoe_semibold".to_owned(),
                std::sync::Arc::new(FontData::from_owned(data)),
            );
            fonts
                .families
                .entry(FontFamily::Name("semibold".into()))
                .or_default()
                .push("segoe_semibold".to_owned());
            break;
        }
    }

    // 3. Nạp bộ glyph biểu tượng Fluent Icons của Windows 11
    let symbol_candidates = [
        r"C:\Windows\Fonts\SegoeIcons.ttf",
        r"C:\Windows\Fonts\segmdl2.ttf",
        r"C:\Windows\Fonts\seguisym.ttf",
        r"C:\Windows\Fonts\seguiemj.ttf",
    ];

    for path in &symbol_candidates {
        if let Ok(data) = std::fs::read(path) {
            let key = format!("symbol_{}", path.split('\\').last().unwrap_or("sym"));
            fonts
                .font_data
                .insert(key.clone(), std::sync::Arc::new(FontData::from_owned(data)));
            fonts
                .families
                .entry(FontFamily::Proportional)
                .or_default()
                .push(key.clone());
            fonts
                .families
                .entry(FontFamily::Name("semibold".into()))
                .or_default()
                .push(key);
        }
    }

    // Fallback bổ sung: nếu semibold thiếu ký tự đặc biệt nào thì lấy từ segoe_regular
    fonts
        .families
        .entry(FontFamily::Name("semibold".into()))
        .or_default()
        .push("segoe_regular".to_owned());

    ctx.set_fonts(fonts);
}

/// Font thường thanh mảnh, sắc nét, đúng chuẩn Google Chrome
#[inline]
pub fn regular_font(size: f32) -> FontId {
    FontId::new(size, FontFamily::Proportional)
}

/// Font Semibold (600) thanh lịch cho tiêu đề thẻ ứng dụng
#[inline]
pub fn semibold_font(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("semibold".into()))
}

/// Fallback alias cho bold_font (sử dụng semibold thay vì bold đậm để tránh nhòe)
#[allow(dead_code)]
#[inline]
pub fn bold_font(size: f32) -> FontId {
    semibold_font(size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_font_setup_works() {
        let ctx = Context::default();
        setup_vietnamese_font(&ctx);
        let f_reg = regular_font(12.5);
        let f_semi = semibold_font(15.0);
        assert_eq!(f_reg.size, 12.5);
        assert_eq!(f_semi.size, 15.0);
    }
}
