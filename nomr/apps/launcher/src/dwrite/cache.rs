#[cfg(target_os = "windows")]
use super::engine::{DWriteEngine, DWriteTextStyle, FontCategory};
#[cfg(target_os = "windows")]
use eframe::egui::{Context, TextureHandle, TextureOptions, Vec2};
#[cfg(target_os = "windows")]
use std::cell::RefCell;
#[cfg(target_os = "windows")]
use std::collections::HashMap;

#[derive(Clone, PartialEq, Eq, Hash)]
pub struct DWriteCacheKey {
    pub text: String,
    pub category: FontCategory,
    pub weight: u16,
    pub size_pt_x100: u32,
    pub color: [u8; 4],
    pub bg_color: Option<[u8; 4]>,
    pub max_width_dips_x10: Option<u32>,
    pub dpi_scale_x100: u32,
}

#[derive(Clone)]
pub struct CachedLayout {
    pub texture: TextureHandle,
    pub size: Vec2,
}

#[cfg(target_os = "windows")]
pub struct DWriteCache {
    engine: Result<DWriteEngine, String>,
    cache: HashMap<DWriteCacheKey, CachedLayout>,
    next_id: u64,
}

#[cfg(target_os = "windows")]
impl DWriteCache {
    pub fn new() -> Self {
        Self {
            engine: DWriteEngine::new(),
            cache: HashMap::new(),
            next_id: 0,
        }
    }

    pub fn get_or_render(
        &mut self,
        ctx: &Context,
        text: &str,
        style: &DWriteTextStyle,
        max_width_dips: Option<f32>,
    ) -> Option<(TextureHandle, Vec2)> {
        let scale = ctx.pixels_per_point();
        let scale_key = (scale * 100.0).round() as u32;

        let key = DWriteCacheKey {
            text: text.to_string(),
            category: style.category,
            weight: style.weight,
            size_pt_x100: (style.size_pt * 100.0).round() as u32,
            color: [style.color.r(), style.color.g(), style.color.b(), style.color.a()],
            bg_color: style.bg_color.map(|c| [c.r(), c.g(), c.b(), c.a()]),
            max_width_dips_x10: max_width_dips.map(|w| (w * 10.0).round() as u32),
            dpi_scale_x100: scale_key,
        };

        if let Some(cached) = self.cache.get(&key) {
            return Some((cached.texture.clone(), cached.size));
        }

        let engine = match &mut self.engine {
            Ok(e) => e,
            Err(_) => return None,
        };

        let (color_image, size) = engine.render_text(text, style, max_width_dips, scale).ok()?;

        self.next_id += 1;
        let tex_name = format!("dwrite_glyph_{}", self.next_id);
        let texture = ctx.load_texture(tex_name, color_image, TextureOptions::LINEAR);

        // Giới hạn bộ nhớ cache tối đa 800 mục
        if self.cache.len() > 800 {
            self.cache.clear();
        }

        let cached = CachedLayout {
            texture: texture.clone(),
            size,
        };
        self.cache.insert(key, cached);

        Some((texture, size))
    }
}

#[cfg(target_os = "windows")]
thread_local! {
    static DWRITE_CACHE: RefCell<DWriteCache> = RefCell::new(DWriteCache::new());
}

#[cfg(target_os = "windows")]
pub fn with_dwrite_cache<R>(f: impl FnOnce(&mut DWriteCache) -> R) -> R {
    DWRITE_CACHE.with(|c| f(&mut *c.borrow_mut()))
}
