#[cfg(target_os = "windows")]
use eframe::egui::{self, Color32, Vec2};
#[cfg(target_os = "windows")]
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use windows::core::PCWSTR;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::BOOL;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Direct2D::Common::{
    D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_COLOR_F, D2D1_PIXEL_FORMAT, D2D_POINT_2F,
};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Direct2D::{
    D2D1CreateFactory, ID2D1Factory, ID2D1RenderTarget, D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT,
    D2D1_FACTORY_TYPE_SINGLE_THREADED, D2D1_FEATURE_LEVEL_DEFAULT, D2D1_RENDER_TARGET_PROPERTIES,
    D2D1_RENDER_TARGET_TYPE_DEFAULT, D2D1_RENDER_TARGET_USAGE_NONE, D2D1_TEXT_ANTIALIAS_MODE_CLEARTYPE,
    D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE,
};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::DirectWrite::{
    DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection, IDWriteTextFormat, IDWriteTextLayout,
    DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT,
    DWRITE_TEXT_METRICS, DWRITE_WORD_WRAPPING_NO_WRAP, DWRITE_WORD_WRAPPING_WRAP,
};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_WICPixelFormat32bppPBGRA, IWICBitmap, IWICImagingFactory, WICBitmapCacheOnDemand,
    WICBitmapLockRead, WICRect,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FontCategory {
    Title, // Segoe UI Variable Display
    Body,  // Segoe UI Variable Text
    Small, // Segoe UI Variable Small
    Icon,  // Segoe Fluent Icons / Segoe MDL2 Assets
}

#[derive(Debug, Clone, PartialEq)]
pub struct DWriteTextStyle {
    pub category: FontCategory,
    pub weight: u16,               // 400 = Regular, 500 = Medium, 600 = SemiBold
    pub size_pt: f32,              // Points / DIPs
    pub color: Color32,            // Màu chữ
    pub bg_color: Option<Color32>, // Màu nền (nếu có: kích hoạt ClearType subpixel rendering; nếu None: grayscale alpha)
}

#[cfg(target_os = "windows")]
pub struct DWriteEngine {
    dwrite_factory: IDWriteFactory,
    d2d_factory: ID2D1Factory,
    wic_factory: IWICImagingFactory,
    font_collection: Option<IDWriteFontCollection>,
    format_cache: HashMap<(FontCategory, u16, u32), IDWriteTextFormat>,
}

#[cfg(target_os = "windows")]
impl DWriteEngine {
    pub fn new() -> Result<Self, String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let dwrite_factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)
                .map_err(|e| format!("DWriteCreateFactory failed: {}", e))?;
            let d2d_factory: ID2D1Factory = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)
                .map_err(|e| format!("D2D1CreateFactory failed: {}", e))?;
            let wic_factory: IWICImagingFactory =
                CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("CoCreateInstance WIC failed: {}", e))?;

            let mut font_collection = None;
            let _ = dwrite_factory.GetSystemFontCollection(&mut font_collection, false);

            Ok(Self {
                dwrite_factory,
                d2d_factory,
                wic_factory,
                font_collection,
                format_cache: HashMap::new(),
            })
        }
    }

    /// Lấy hoặc tạo mới IDWriteTextFormat có bộ nhớ đệm (Font Format Cache)
    pub fn get_or_create_format(
        &mut self,
        category: FontCategory,
        weight: u16,
        size_pt: f32,
    ) -> Result<IDWriteTextFormat, String> {
        let size_key = (size_pt * 100.0) as u32;
        let key = (category, weight, size_key);
        if let Some(fmt) = self.format_cache.get(&key) {
            return Ok(fmt.clone());
        }

        // Danh sách ưu tiên font hệ thống theo đúng quy chuẩn Windows 11 Fluent Design
        let candidates: &[&str] = match category {
            FontCategory::Title => &[
                "Segoe UI Variable Display",
                "Segoe UI Variable Text",
                "Segoe UI Variable",
                "Segoe UI",
                "Arial",
            ],
            FontCategory::Body => &["Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", "Arial"],
            FontCategory::Small => &[
                "Segoe UI Variable Small",
                "Segoe UI Variable Text",
                "Segoe UI Variable",
                "Segoe UI",
                "Arial",
            ],
            FontCategory::Icon => &["Segoe Fluent Icons", "Segoe MDL2 Assets", "Segoe UI Symbol"],
        };

        let locale = match category {
            FontCategory::Icon => windows::core::w!("en-US"),
            _ => windows::core::w!("vi-VN"),
        };

        let mut last_err = String::new();
        for &family in candidates {
            let family_wide: Vec<u16> = family.encode_utf16().chain(std::iter::once(0)).collect();

            // Kiểm tra xem font family có thực sự tồn tại trong bộ sưu tập font của máy không
            if let Some(ref fc) = self.font_collection {
                let mut index = 0u32;
                let mut exists = BOOL(0);
                let check_res =
                    unsafe { fc.FindFamilyName(PCWSTR::from_raw(family_wide.as_ptr()), &mut index, &mut exists) };
                if check_res.is_ok() && !exists.as_bool() {
                    // Font không tồn tại trên máy này -> thử candidate tiếp theo
                    continue;
                }
            }

            let res = unsafe {
                self.dwrite_factory.CreateTextFormat(
                    PCWSTR::from_raw(family_wide.as_ptr()),
                    None,
                    DWRITE_FONT_WEIGHT(weight as i32),
                    DWRITE_FONT_STYLE_NORMAL,
                    DWRITE_FONT_STRETCH_NORMAL,
                    size_pt,
                    locale,
                )
            };

            match res {
                Ok(fmt) => {
                    self.format_cache.insert(key, fmt.clone());
                    return Ok(fmt);
                }
                Err(e) => {
                    last_err = format!("{}", e);
                }
            }
        }

        Err(format!("Không thể tạo TextFormat: {}", last_err))
    }

    /// Dựng hình toàn diện Text Layout sang egui::ColorImage bằng DirectWrite + Direct2D ở DPI thực tế
    pub fn render_text(
        &mut self,
        text: &str,
        style: &DWriteTextStyle,
        max_width_dips: Option<f32>,
        scale: f32, // pixels_per_point (1.0, 1.25, 1.5, 1.75, 2.0...)
    ) -> Result<(egui::ColorImage, Vec2), String> {
        let format = self.get_or_create_format(style.category, style.weight, style.size_pt)?;

        let text_u16: Vec<u16> = text.encode_utf16().collect();
        let max_w = max_width_dips.unwrap_or(8000.0);
        let max_h = 8000.0;

        let layout: IDWriteTextLayout = unsafe {
            self.dwrite_factory
                .CreateTextLayout(&text_u16, &format, max_w, max_h)
                .map_err(|e| format!("CreateTextLayout failed: {}", e))?
        };

        if max_width_dips.is_some() {
            unsafe {
                let _ = layout.SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
            };
        } else {
            unsafe {
                let _ = layout.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
            };
        }

        let mut metrics = DWRITE_TEXT_METRICS::default();
        unsafe {
            layout
                .GetMetrics(&mut metrics)
                .map_err(|e| format!("GetMetrics failed: {}", e))?;
        };

        let logical_w = metrics.width.max(1.0);
        let logical_h = metrics.height.max(1.0);

        // Kích thước pixel vật lý thực tế của màn hình (thêm 2px đệm biên khử răng cưa)
        let pixel_w = ((logical_w * scale).ceil() as u32).max(1) + 2;
        let pixel_h = ((logical_h * scale).ceil() as u32).max(1) + 2;

        unsafe {
            // 1. Tạo WIC Bitmap 32-bit PBGRA
            let wic_bitmap: IWICBitmap = self
                .wic_factory
                .CreateBitmap(pixel_w, pixel_h, &GUID_WICPixelFormat32bppPBGRA, WICBitmapCacheOnDemand)
                .map_err(|e| format!("CreateBitmap WIC failed: {}", e))?;

            // 2. Tạo Direct2D Render Target trên WIC Bitmap với đúng DPI thực tế của màn hình
            let target_props = D2D1_RENDER_TARGET_PROPERTIES {
                r#type: D2D1_RENDER_TARGET_TYPE_DEFAULT,
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                },
                dpiX: 96.0 * scale,
                dpiY: 96.0 * scale,
                usage: D2D1_RENDER_TARGET_USAGE_NONE,
                minLevel: D2D1_FEATURE_LEVEL_DEFAULT,
            };

            let render_target: ID2D1RenderTarget = self
                .d2d_factory
                .CreateWicBitmapRenderTarget(&wic_bitmap, &target_props)
                .map_err(|e| format!("CreateWicBitmapRenderTarget failed: {}", e))?;

            // 3. Cấu hình chế độ khử răng cưa theo đúng chuẩn Windows 11:
            // - Nếu có màu nền đích -> Kích hoạt ClearType (subpixel RGB/BGR)
            // - Nếu không có màu nền -> Kích hoạt Grayscale Antialiasing sắc bén
            if style.bg_color.is_some() {
                render_target.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_CLEARTYPE);
            } else {
                render_target.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
            }

            render_target.BeginDraw();

            if let Some(bg) = style.bg_color {
                let clear_col = D2D1_COLOR_F {
                    r: bg.r() as f32 / 255.0,
                    g: bg.g() as f32 / 255.0,
                    b: bg.b() as f32 / 255.0,
                    a: bg.a() as f32 / 255.0,
                };
                render_target.Clear(Some(&clear_col as *const _));
            } else {
                let transparent = D2D1_COLOR_F {
                    r: 0.0,
                    g: 0.0,
                    b: 0.0,
                    a: 0.0,
                };
                render_target.Clear(Some(&transparent as *const _));
            }

            let brush_col = D2D1_COLOR_F {
                r: style.color.r() as f32 / 255.0,
                g: style.color.g() as f32 / 255.0,
                b: style.color.b() as f32 / 255.0,
                a: style.color.a() as f32 / 255.0,
            };
            let brush = render_target
                .CreateSolidColorBrush(&brush_col as *const _, None)
                .map_err(|e| format!("CreateSolidColorBrush failed: {}", e))?;

            render_target.DrawTextLayout(
                D2D_POINT_2F { x: 0.0, y: 0.0 },
                &layout,
                &brush,
                D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT,
            );

            render_target
                .EndDraw(None, None)
                .map_err(|e| format!("EndDraw failed: {}", e))?;

            // 4. Đọc dữ liệu pixel PBGRA từ WIC Bitmap và chuyển đổi sang egui::ColorImage
            let wic_rect = WICRect {
                X: 0,
                Y: 0,
                Width: pixel_w as i32,
                Height: pixel_h as i32,
            };
            let lock = wic_bitmap
                .Lock(&wic_rect, WICBitmapLockRead.0 as u32)
                .map_err(|e| format!("WIC lock failed: {}", e))?;

            let mut data_size: u32 = 0;
            let mut data_ptr: *mut u8 = std::ptr::null_mut();
            lock.GetDataPointer(&mut data_size, &mut data_ptr)
                .map_err(|e| format!("GetDataPointer failed: {}", e))?;

            let stride = lock.GetStride().map_err(|e| format!("GetStride failed: {}", e))?;

            let slice = std::slice::from_raw_parts(data_ptr, data_size as usize);
            let mut pixels = Vec::with_capacity((pixel_w * pixel_h) as usize);

            for y in 0..pixel_h {
                let row_offset = (y * stride) as usize;
                for x in 0..pixel_w {
                    let px_idx = row_offset + (x * 4) as usize;
                    let b = slice[px_idx];
                    let g = slice[px_idx + 1];
                    let r = slice[px_idx + 2];
                    let a = slice[px_idx + 3];
                    pixels.push(Color32::from_rgba_premultiplied(r, g, b, a));
                }
            }

            let color_image = egui::ColorImage {
                size: [pixel_w as usize, pixel_h as usize],
                pixels,
            };

            let logical_size = Vec2::new(pixel_w as f32 / scale, pixel_h as f32 / scale);
            Ok((color_image, logical_size))
        }
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn test_directwrite_engine_vietnamese_rendering() {
        let mut engine = DWriteEngine::new().expect("Khởi tạo DWriteEngine thành công");

        let style = DWriteTextStyle {
            category: FontCategory::Title,
            weight: 600,
            size_pt: 15.0,
            color: Color32::from_rgb(15, 23, 42),
            bg_color: Some(Color32::WHITE),
        };

        let text = "Nom Writer (Docs) - Soạn thảo văn bản chuyên nghiệp tiếng Việt";

        // Thử nghiệm ở scale 100%, 125%, 150%
        for scale in [1.0, 1.25, 1.5] {
            let res = engine.render_text(text, &style, None, scale);
            assert!(res.is_ok(), "Render thất bại ở scale {}", scale);
            let (img, size) = res.unwrap();
            assert!(img.size[0] > 0);
            assert!(img.size[1] > 0);
            assert!(size.x > 0.0);
            assert!(size.y > 0.0);
        }
    }

    #[test]
    fn test_window_control_caption_glyphs() {
        let mut engine = DWriteEngine::new().expect("Khởi tạo DWriteEngine thành công");

        let style = DWriteTextStyle {
            category: FontCategory::Icon,
            weight: 400,
            size_pt: 10.0,
            color: Color32::from_rgb(80, 90, 100),
            bg_color: Some(Color32::from_rgb(222, 227, 233)),
        };

        // 4 icon chuẩn của Windows 11 Fluent: Minimize, Maximize, Restore, Close
        let glyphs = ["\u{E921}", "\u{E922}", "\u{E923}", "\u{E8BB}"];
        let btn_w = 46usize;
        let btn_h = 40usize;
        let total_w = btn_w * glyphs.len();
        let total_h = btn_h;
        let mut full_bmp = vec![Color32::from_rgb(222, 227, 233); total_w * total_h];

        for (i, &glyph) in glyphs.iter().enumerate() {
            let res = engine.render_text(glyph, &style, None, 1.0);
            assert!(res.is_ok(), "Render glyph {:?} thất bại", glyph);
            let (img, size) = res.unwrap();
            let bg_c = style.bg_color.unwrap();
            let mut drawn_pixels = 0;
            for p in &img.pixels {
                if p.r() != bg_c.r() || p.g() != bg_c.g() || p.b() != bg_c.b() {
                    drawn_pixels += 1;
                }
            }
            println!(
                "Glyph {:?}: size={}x{}, logical={:?}, drawn_pixels={}",
                glyph, img.size[0], img.size[1], size, drawn_pixels
            );
            assert!(drawn_pixels > 0, "Glyph {:?} không vẽ pixel nào!", glyph);

            // Căn giữa glyph vào ô button 46x40
            let start_x = i * btn_w + (btn_w.saturating_sub(img.size[0])) / 2;
            let start_y = (btn_h.saturating_sub(img.size[1])) / 2;
            for gy in 0..img.size[1] {
                for gx in 0..img.size[0] {
                    let pixel = img.pixels[gy * img.size[0] + gx];
                    let dst_x = start_x + gx;
                    let dst_y = start_y + gy;
                    if dst_x < total_w && dst_y < total_h {
                        full_bmp[dst_y * total_w + dst_x] = pixel;
                    }
                }
            }
        }

        // Ghi ra file BMP
        let mut bmp_data = Vec::new();
        let row_bytes = total_w * 4;
        let file_size = 54 + (row_bytes * total_h);
        // Header
        bmp_data.extend_from_slice(b"BM");
        bmp_data.extend_from_slice(&(file_size as u32).to_le_bytes());
        bmp_data.extend_from_slice(&[0, 0, 0, 0]);
        bmp_data.extend_from_slice(&54u32.to_le_bytes());
        // DIB Header
        bmp_data.extend_from_slice(&40u32.to_le_bytes());
        bmp_data.extend_from_slice(&(total_w as i32).to_le_bytes());
        bmp_data.extend_from_slice(&(-(total_h as i32)).to_le_bytes()); // Top-down
        bmp_data.extend_from_slice(&1u16.to_le_bytes());
        bmp_data.extend_from_slice(&32u16.to_le_bytes());
        bmp_data.extend_from_slice(&0u32.to_le_bytes());
        bmp_data.extend_from_slice(&(row_bytes as u32 * total_h as u32).to_le_bytes());
        bmp_data.extend_from_slice(&0u32.to_le_bytes());
        bmp_data.extend_from_slice(&0u32.to_le_bytes());
        bmp_data.extend_from_slice(&0u32.to_le_bytes());
        bmp_data.extend_from_slice(&0u32.to_le_bytes());
        for p in full_bmp {
            bmp_data.push(p.b());
            bmp_data.push(p.g());
            bmp_data.push(p.r());
            bmp_data.push(p.a());
        }
        let artifact_path = r"C:\Users\sonng\.gemini\antigravity\brain\c9b48b43-6cc6-48bb-a20b-a1415755e291\caption_buttons_preview.bmp";
        let _ = std::fs::write(artifact_path, bmp_data);
    }
}
