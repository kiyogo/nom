use eframe::egui::{self, Align2, Color32, Pos2, Rect, Rounding, Stroke, Ui, Vec2};
use nom_package::UserSession;

#[cfg(target_os = "windows")]
static WINDOW_DRAG_BOUNDS: [std::sync::atomic::AtomicU32; 8] = [
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
    std::sync::atomic::AtomicU32::new(0),
];

#[cfg(target_os = "windows")]
pub fn publish_window_drag_bounds(main: Option<Rect>, top: Option<Rect>) {
    use std::sync::atomic::Ordering::Relaxed;

    for (slot, rect) in [(0, main), (4, top)] {
        let values = rect
            .map(|rect| [rect.min.x, rect.min.y, rect.max.x, rect.max.y])
            .unwrap_or([0.0; 4]);
        for (index, value) in values.into_iter().enumerate() {
            WINDOW_DRAG_BOUNDS[slot + index].store(value.to_bits(), Relaxed);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn is_window_drag_point(point: Pos2) -> bool {
    use std::sync::atomic::Ordering::Relaxed;

    [0, 4].into_iter().any(|slot| {
        let min_x = f32::from_bits(WINDOW_DRAG_BOUNDS[slot].load(Relaxed));
        let min_y = f32::from_bits(WINDOW_DRAG_BOUNDS[slot + 1].load(Relaxed));
        let max_x = f32::from_bits(WINDOW_DRAG_BOUNDS[slot + 2].load(Relaxed));
        let max_y = f32::from_bits(WINDOW_DRAG_BOUNDS[slot + 3].load(Relaxed));
        max_x > min_x && max_y > min_y && point.x >= min_x && point.x < max_x && point.y >= min_y && point.y < max_y
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabKind {
    Home,
    All,
    Installed,
    NotInstalled,
    App(String),
}

#[derive(Debug, Clone)]
pub struct ChromeTab {
    #[allow(dead_code)]
    pub id: String,
    pub title: String,
    pub kind: TabKind,
    pub can_close: bool,
}

pub enum TabAction {
    Select(usize),
    Close(usize),
    NewTab,
    ToggleDropdown,
    OpenLogin,
    Logout,
    Minimize,
    Maximize,
    CloseWindow,
}

pub fn get_default_tabs() -> Vec<ChromeTab> {
    vec![ChromeTab {
        id: "home".into(),
        title: "Trang chủ".into(),
        kind: TabKind::Home,
        can_close: false,
    }]
}

fn draw_tab_icon(p: &egui::Painter, center: Pos2, kind: &TabKind, is_active: bool) {
    match kind {
        TabKind::Home => {
            let color = if is_active {
                CHROME_ACTIVE_TEXT
            } else {
                CHROME_INACTIVE_TEXT
            };
            p.line_segment(
                [
                    Pos2::new(center.x - 5.0, center.y - 0.5),
                    Pos2::new(center.x, center.y - 5.0),
                ],
                Stroke::new(1.4_f32, color),
            );
            p.line_segment(
                [
                    Pos2::new(center.x, center.y - 5.0),
                    Pos2::new(center.x + 5.0, center.y - 0.5),
                ],
                Stroke::new(1.4_f32, color),
            );
            p.rect_stroke(
                Rect::from_min_max(
                    Pos2::new(center.x - 3.5, center.y - 1.0),
                    Pos2::new(center.x + 3.5, center.y + 5.0),
                ),
                Rounding::same(1.0),
                Stroke::new(1.2_f32, color),
            );
        }
        TabKind::All => {
            let col = if is_active {
                Color32::from_rgb(15, 23, 42)
            } else {
                Color32::from_rgb(71, 85, 105)
            };
            let sz = 3.5;
            let gap = 2.0;
            let r = Rounding::same(1.5);
            p.rect_filled(
                Rect::from_min_size(
                    Pos2::new(center.x - sz - gap / 2.0, center.y - sz - gap / 2.0),
                    Vec2::splat(sz),
                ),
                r,
                col,
            );
            p.rect_filled(
                Rect::from_min_size(
                    Pos2::new(center.x + gap / 2.0, center.y - sz - gap / 2.0),
                    Vec2::splat(sz),
                ),
                r,
                col,
            );
            p.rect_filled(
                Rect::from_min_size(
                    Pos2::new(center.x - sz - gap / 2.0, center.y + gap / 2.0),
                    Vec2::splat(sz),
                ),
                r,
                col,
            );
            p.rect_filled(
                Rect::from_min_size(Pos2::new(center.x + gap / 2.0, center.y + gap / 2.0), Vec2::splat(sz)),
                r,
                col,
            );
        }
        TabKind::Installed => {
            let col = Color32::from_rgb(22, 163, 74);
            let stroke = Stroke::new(1.3_f32, col);
            p.line_segment(
                [
                    Pos2::new(center.x - 5.0, center.y + 0.5),
                    Pos2::new(center.x - 1.5, center.y + 4.0),
                ],
                stroke,
            );
            p.line_segment(
                [
                    Pos2::new(center.x - 1.5, center.y + 4.0),
                    Pos2::new(center.x + 5.0, center.y - 3.5),
                ],
                stroke,
            );
        }
        TabKind::NotInstalled => {
            let col = Color32::from_rgb(37, 99, 235);
            let stroke = Stroke::new(1.3_f32, col);
            p.line_segment(
                [Pos2::new(center.x, center.y - 4.5), Pos2::new(center.x, center.y + 2.5)],
                stroke,
            );
            p.line_segment(
                [
                    Pos2::new(center.x - 3.0, center.y - 0.5),
                    Pos2::new(center.x, center.y + 2.5),
                ],
                stroke,
            );
            p.line_segment(
                [
                    Pos2::new(center.x + 3.0, center.y - 0.5),
                    Pos2::new(center.x, center.y + 2.5),
                ],
                stroke,
            );
            p.line_segment(
                [
                    Pos2::new(center.x - 4.5, center.y + 5.0),
                    Pos2::new(center.x + 4.5, center.y + 5.0),
                ],
                stroke,
            );
        }
        TabKind::App(app_id) => {
            let (bg, letter) = match app_id.as_str() {
                "writer" => (Color32::from_rgb(37, 99, 235), "W"),
                "sheet" => (Color32::from_rgb(5, 150, 105), "S"),
                "slide" => (Color32::from_rgb(234, 88, 12), "P"),
                "pdf" => (Color32::from_rgb(220, 38, 38), "PDF"),
                "markdown" => (Color32::from_rgb(79, 70, 229), "MD"),
                "html" => (Color32::from_rgb(217, 119, 6), "HTML"),
                _ => (Color32::from_rgb(71, 85, 105), "A"),
            };
            let rect = Rect::from_center_size(center, Vec2::new(16.0, 16.0));
            p.rect_filled(rect, Rounding::same(4.0), bg);
            let f_sz = match letter.chars().count() {
                1 => 9.5,
                2 => 7.5,
                3 => 6.5,
                _ => 5.5,
            };
            p.text(
                Pos2::new(center.x.round(), center.y.round()),
                Align2::CENTER_CENTER,
                letter,
                crate::font::semibold_font(f_sz),
                Color32::WHITE,
            );
        }
    }
}

fn draw_tab_close_button(p: &egui::Painter, close_rect: Rect, is_hover: bool) {
    let center = close_rect.center();
    if is_hover {
        p.circle_filled(center, 7.0, CHROME_HOVER_BG);
    }

    let d = if close_rect.width() < 15.0 { 3.0 } else { 4.0 };
    let col = if is_hover {
        Color32::from_rgb(15, 23, 42)
    } else {
        Color32::from_rgb(100, 116, 139)
    };
    p.line_segment(
        [
            Pos2::new(center.x - d, center.y - d),
            Pos2::new(center.x + d, center.y + d),
        ],
        Stroke::new(1.3_f32, col),
    );
    p.line_segment(
        [
            Pos2::new(center.x + d, center.y - d),
            Pos2::new(center.x - d, center.y + d),
        ],
        Stroke::new(1.3_f32, col),
    );
}

fn active_tab_radius(rect: Rect) -> f32 {
    12.0_f32.min(rect.width() * 0.22).min(rect.height() * 0.34)
}

fn paint_chrome_tab(p: &egui::Painter, rect: Rect, fill: Color32) {
    if rect.width() < 2.0 {
        return;
    }

    let radius = active_tab_radius(rect);
    // Vẽ trực tiếp hai vai cong. Cách cũ tô ô vuông trắng rồi cắt hình tròn
    // bằng clip rect tạo một vệt sáng 1px ở cạnh phải vùng clip.
    const SEGMENTS: usize = 16;
    let mut left = Vec::with_capacity(SEGMENTS + 2);
    let left_center = Pos2::new(rect.min.x - radius, rect.max.y - radius);
    for step in 0..=SEGMENTS {
        let angle = std::f32::consts::FRAC_PI_2 * (1.0 - step as f32 / SEGMENTS as f32);
        left.push(Pos2::new(
            left_center.x + radius * angle.cos(),
            left_center.y + radius * angle.sin(),
        ));
    }
    left.push(rect.left_bottom());
    p.add(egui::Shape::convex_polygon(left, fill, Stroke::NONE));

    let mut right = Vec::with_capacity(SEGMENTS + 2);
    let right_center = Pos2::new(rect.max.x + radius, rect.max.y - radius);
    for step in 0..=SEGMENTS {
        let angle = std::f32::consts::PI - std::f32::consts::FRAC_PI_2 * step as f32 / SEGMENTS as f32;
        right.push(Pos2::new(
            right_center.x + radius * angle.cos(),
            right_center.y + radius * angle.sin(),
        ));
    }
    right.push(rect.right_bottom());
    p.add(egui::Shape::convex_polygon(right, fill, Stroke::NONE));

    p.rect_filled(
        rect,
        Rounding {
            nw: radius,
            ne: radius,
            sw: 0.0,
            se: 0.0,
        },
        fill,
    );
}

// Bảng màu chuẩn Chrome Light Theme
pub const CHROME_LIGHT_BG: Color32 = Color32::from_rgb(222, 227, 233);
pub const CHROME_ACTIVE_TAB_BG: Color32 = Color32::WHITE;
pub const CHROME_BUTTON_BG: Color32 = Color32::from_rgb(205, 212, 221);
pub const CHROME_HOVER_BG: Color32 = Color32::from_rgb(208, 215, 224);
pub const CHROME_TAB_HOVER_BG: Color32 = Color32::from_rgb(208, 215, 224);
#[allow(dead_code)]
pub const CHROME_ACTIVE_TEXT: Color32 = Color32::from_rgb(15, 23, 42);
pub const CHROME_INACTIVE_TEXT: Color32 = Color32::from_rgb(51, 65, 85);
pub const CHROME_DIVIDER: Color32 = Color32::from_rgb(196, 204, 214);

fn tab_widths(count: usize, available: f32, opening: Option<(usize, f32)>, closing: Option<(usize, f32)>) -> Vec<f32> {
    let mut factors = vec![1.0; count];
    if let Some((index, progress)) = opening {
        if let Some(factor) = factors.get_mut(index) {
            *factor = progress.clamp(0.0, 1.0);
        }
    }
    if let Some((index, progress)) = closing {
        if let Some(factor) = factors.get_mut(index) {
            *factor *= 1.0 - progress.clamp(0.0, 1.0);
        }
    }
    let total: f32 = factors.iter().sum();
    let full_width = (available / total.max(1.0)).min(140.0);
    factors.into_iter().map(|factor| full_width * factor).collect()
}

/// Thanh Tab Google Chrome Light Theme chuẩn tuyệt đối:
/// - Co dãn tab động (Dynamic Tab Shrinking): Khi mở nhiều tab hoặc cửa sổ hẹp, các tab
///   tự động thu nhỏ lại (xuống icon favicon nhỏ như ảnh 2 của Chrome thật)
/// - Luôn luôn giữ khoảng cách an toàn với cụm Đăng nhập & nút điều khiển cửa sổ, KHÔNG BAO GIỜ bị đè lên
/// - Nút cửa sổ dùng Glyph native Microsoft Windows 11 thanh mảnh, tinh xảo
pub fn render_chrome_tab_bar(
    ui: &mut Ui,
    tabs: &[ChromeTab],
    active_idx: usize,
    dropdown_open: bool,
    session: &UserSession,
    is_maximized: bool,
    new_tab_animation: Option<(usize, f32)>,
    closing_tab_animation: Option<(usize, f32)>,
) -> Option<TabAction> {
    let mut action: Option<TabAction> = None;

    // Chừa dải nền phía dưới tab để hai góc đáy hiện rõ như tab Google Chrome.
    let strip_height = 44.0_f32;
    let (full_rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), strip_height), egui::Sense::hover());

    // Chrome-style tab strip: nền xám nhạt, tab đang mở màu trắng nổi lên trên.
    let strip_rounding = if is_maximized {
        Rounding::ZERO
    } else {
        Rounding {
            nw: 8.0,
            ne: 8.0,
            sw: 0.0,
            se: 0.0,
        }
    };
    ui.painter().rect_filled(full_rect, strip_rounding, CHROME_LIGHT_BG);

    let p = ui.painter();

    // ── 2. Nút dropdown 'v' ở góc trái (26x26) ────────────────────────────────
    let v_center = Pos2::new(full_rect.min.x + 8.0 + 13.0, full_rect.center().y);
    let v_rect = Rect::from_center_size(v_center, Vec2::new(26.0, 26.0));
    let v_resp = ui.interact(v_rect, ui.make_persistent_id("tab_btn_v"), egui::Sense::click());
    let v_bg = if v_resp.hovered() {
        CHROME_HOVER_BG
    } else {
        CHROME_BUTTON_BG
    };
    p.rect_filled(v_rect, Rounding::same(7.0_f32), v_bg);
    let v_cx = v_rect.center().x;
    let v_cy = v_rect.center().y;
    let v_col = CHROME_INACTIVE_TEXT;
    p.line_segment(
        [Pos2::new(v_cx - 3.5, v_cy - 1.5), Pos2::new(v_cx, v_cy + 2.0)],
        Stroke::new(1.3_f32, v_col),
    );
    p.line_segment(
        [Pos2::new(v_cx, v_cy + 2.0), Pos2::new(v_cx + 3.5, v_cy - 1.5)],
        Stroke::new(1.3_f32, v_col),
    );
    if v_resp.clicked() {
        action = Some(TabAction::ToggleDropdown);
    }

    if dropdown_open {
        let mut popup_action = None;
        let popup = egui::Area::new(ui.make_persistent_id("tab_list_dropdown"))
            .order(egui::Order::Foreground)
            .fixed_pos(Pos2::new(v_rect.min.x, full_rect.max.y + 3.0))
            .show(ui.ctx(), |ui| {
                egui::Frame::popup(ui.style()).show(ui, |ui| {
                    ui.set_min_width(220.0);
                    ui.set_max_width(260.0);
                    for (index, tab) in tabs.iter().enumerate() {
                        let button = egui::Button::new(&tab.title).selected(index == active_idx);
                        if ui.add_sized(Vec2::new(ui.available_width(), 32.0), button).clicked() {
                            popup_action = Some(TabAction::Select(index));
                        }
                    }
                });
            });
        if let Some(popup_action) = popup_action {
            action = Some(popup_action);
        } else {
            let clicked_outside = ui.ctx().input(|input| {
                input.pointer.any_click()
                    && input
                        .pointer
                        .interact_pos()
                        .is_some_and(|pos| !popup.response.rect.contains(pos) && !v_rect.contains(pos))
            });
            if clicked_outside {
                action = Some(TabAction::ToggleDropdown);
            }
        }
    }

    // ── 3. Cụm điều khiển bên phải (Window Controls + Profile) ─────────────────
    // Tính toán trước vị trí cụm bên phải để đảm bảo CÁC TAB LUÔN GIỮ KHOẢNG CÁCH AN TOÀN
    let wc_btn_w = 46.0_f32;
    let right_content_end_x = full_rect.max.x - wc_btn_w * 3.0 - 10.0;

    // 3a. Nút Profile / Đăng nhập
    let right_content_start_x = if session.is_logged_in {
        let logout_w = 66.0_f32;
        let logout_rect = Rect::from_min_size(
            Pos2::new(
                (right_content_end_x - logout_w).round(),
                (full_rect.center().y - 12.0).round(),
            ),
            Vec2::new(logout_w, 24.0),
        );
        let logout_resp = ui.interact(
            logout_rect,
            ui.make_persistent_id("btn_tab_logout"),
            egui::Sense::click(),
        );
        p.rect_filled(logout_rect, Rounding::same(6.0_f32), Color32::from_rgb(254, 242, 242));
        p.rect_stroke(
            logout_rect,
            Rounding::same(6.0_f32),
            Stroke::new(1.0_f32, Color32::from_rgb(254, 202, 202)),
        );
        let logout_style = crate::dwrite::DWriteTextStyle {
            category: crate::dwrite::FontCategory::Small,
            weight: 400,
            size_pt: 11.5,
            color: Color32::from_rgb(220, 38, 38),
            bg_color: Some(Color32::from_rgb(254, 242, 242)),
        };
        crate::dwrite::paint_text(
            p,
            Pos2::new(logout_rect.center().x.round(), logout_rect.center().y.round()),
            Align2::CENTER_CENTER,
            "Đăng xuất",
            &logout_style,
            ui.ctx(),
        );
        if logout_resp.clicked() {
            action = Some(TabAction::Logout);
        }

        let av_center = Pos2::new(
            (right_content_end_x - logout_w - 6.0 - 12.0).round(),
            full_rect.center().y.round(),
        );
        p.circle_filled(av_center, 12.0, Color32::from_rgb(37, 99, 235));
        p.text(
            av_center,
            Align2::CENTER_CENTER,
            &session.avatar_initials,
            crate::typography::Typography::badge_font(),
            Color32::WHITE,
        );

        av_center.x - 12.0
    } else {
        let login_w = 86.0_f32;
        let login_rect = Rect::from_min_size(
            Pos2::new(
                (right_content_end_x - login_w).round(),
                (full_rect.center().y - 13.0).round(),
            ),
            Vec2::new(login_w, 26.0),
        );
        let login_resp = ui.interact(login_rect, ui.make_persistent_id("btn_tab_login"), egui::Sense::click());
        p.rect_filled(login_rect, Rounding::same(6.0_f32), Color32::WHITE);
        p.rect_stroke(
            login_rect,
            Rounding::same(6.0_f32),
            Stroke::new(1.0_f32, Color32::from_rgb(203, 213, 225)),
        );
        let login_style = crate::dwrite::DWriteTextStyle {
            category: crate::dwrite::FontCategory::Body,
            weight: 400,
            size_pt: 12.0,
            color: Color32::from_rgb(15, 23, 42),
            bg_color: Some(Color32::WHITE),
        };
        crate::dwrite::paint_text(
            p,
            Pos2::new(login_rect.center().x.round(), login_rect.center().y.round()),
            Align2::CENTER_CENTER,
            "Đăng nhập",
            &login_style,
            ui.ctx(),
        );
        if login_resp.clicked() {
            action = Some(TabAction::OpenLogin);
        }

        right_content_end_x - login_w
    };

    // 3b. 3 Nút điều khiển cửa sổ (Window Controls)
    let wc_stroke_col = Color32::from_rgb(80, 90, 100);

    // [×] Đóng cửa sổ (Hover đỏ rực #E81123, nét trắng)
    let close_win_rect = Rect::from_min_size(
        Pos2::new((full_rect.max.x - wc_btn_w).round(), full_rect.min.y.round()),
        Vec2::new(wc_btn_w, strip_height),
    );
    let close_win_resp = ui.interact(
        close_win_rect,
        ui.make_persistent_id("wc_btn_close"),
        egui::Sense::click(),
    );
    let is_close_hover = close_win_resp.hovered();
    let close_bg = if is_close_hover {
        Color32::from_rgb(232, 17, 35)
    } else {
        Color32::TRANSPARENT
    };
    let close_stroke_col = if is_close_hover { Color32::WHITE } else { wc_stroke_col };
    let close_rounding = if is_maximized {
        Rounding::ZERO
    } else {
        Rounding {
            nw: 0.0,
            ne: 8.0,
            sw: 0.0,
            se: 0.0,
        }
    };
    p.rect_filled(close_win_rect, close_rounding, close_bg);
    let close_style = crate::typography::Typography::window_control_style(
        close_stroke_col,
        if is_close_hover {
            Some(Color32::from_rgb(232, 17, 35))
        } else {
            Some(CHROME_LIGHT_BG)
        },
    );
    crate::dwrite::paint_text(
        p,
        close_win_rect.center(),
        Align2::CENTER_CENTER,
        "\u{E8BB}", // ChromeClose native
        &close_style,
        ui.ctx(),
    );
    if close_win_resp.clicked() {
        action = Some(TabAction::CloseWindow);
    }

    // [□] Phóng to / Khôi phục
    let max_win_rect = Rect::from_min_size(
        Pos2::new((full_rect.max.x - wc_btn_w * 2.0).round(), full_rect.min.y.round()),
        Vec2::new(wc_btn_w, strip_height),
    );
    let max_win_resp = ui.interact(max_win_rect, ui.make_persistent_id("wc_btn_max"), egui::Sense::click());
    let max_bg = if max_win_resp.hovered() {
        CHROME_HOVER_BG
    } else {
        Color32::TRANSPARENT
    };
    p.rect_filled(max_win_rect, Rounding::ZERO, max_bg);
    let max_style = crate::typography::Typography::window_control_style(
        wc_stroke_col,
        if max_win_resp.hovered() {
            Some(CHROME_HOVER_BG)
        } else {
            Some(CHROME_LIGHT_BG)
        },
    );
    let max_glyph = if is_maximized {
        "\u{E923}" // ChromeRestore native (2 khung lồng nhau dày dặn, chuẩn xác 100%)
    } else {
        "\u{E922}" // ChromeMaximize native (1 khung vuông dày dặn, cùng stroke với Minimize)
    };
    crate::dwrite::paint_text(
        p,
        max_win_rect.center(),
        Align2::CENTER_CENTER,
        max_glyph,
        &max_style,
        ui.ctx(),
    );
    if max_win_resp.clicked() {
        action = Some(TabAction::Maximize);
    }

    // [–] Thu nhỏ
    let min_win_rect = Rect::from_min_size(
        Pos2::new((full_rect.max.x - wc_btn_w * 3.0).round(), full_rect.min.y.round()),
        Vec2::new(wc_btn_w, strip_height),
    );
    let min_win_resp = ui.interact(min_win_rect, ui.make_persistent_id("wc_btn_min"), egui::Sense::click());
    let min_bg = if min_win_resp.hovered() {
        CHROME_HOVER_BG
    } else {
        Color32::TRANSPARENT
    };
    p.rect_filled(min_win_rect, Rounding::ZERO, min_bg);
    let min_style = crate::typography::Typography::window_control_style(
        wc_stroke_col,
        if min_win_resp.hovered() {
            Some(CHROME_HOVER_BG)
        } else {
            Some(CHROME_LIGHT_BG)
        },
    );
    crate::dwrite::paint_text(
        p,
        min_win_rect.center(),
        Align2::CENTER_CENTER,
        "\u{E921}", // ChromeMinimize native
        &min_style,
        ui.ctx(),
    );
    if min_win_resp.clicked() {
        action = Some(TabAction::Minimize);
    }

    // ── 4. Thuật toán co dãn Tab động chuẩn Google Chrome ──────────────────────
    // Tạo khoảng thở lớn hơn sau nút danh sách để tab và góc bo không dồn sát trái.
    let tabs_start_x = full_rect.min.x + 42.0;
    let tabs_max_bound_x = right_content_start_x - 20.0;
    let plus_btn_w = 32.0_f32;
    let available_for_tabs = (tabs_max_bound_x - tabs_start_x - plus_btn_w).max(0.0);
    let widths = tab_widths(tabs.len(), available_for_tabs, new_tab_animation, closing_tab_animation);
    let mut tab_end_positions = Vec::with_capacity(tabs.len());
    let mut next_tab_x = tabs_start_x;

    let tab_top_y = full_rect.min.y + 6.0;
    let tab_bot_y = full_rect.max.y;

    for (i, tab) in tabs.iter().enumerate() {
        let is_active = i == active_idx;
        let tab_min_x = next_tab_x;
        let tab_max_x = tab_min_x + widths[i];
        next_tab_x = tab_max_x;
        tab_end_positions.push(tab_max_x);
        let tab_rect = Rect::from_min_max(Pos2::new(tab_min_x, tab_top_y), Pos2::new(tab_max_x, tab_bot_y));
        let is_animating = new_tab_animation.is_some_and(|(index, _)| index == i)
            || closing_tab_animation.is_some_and(|(index, _)| index == i);

        if tab_rect.width() < 16.0 {
            continue;
        }

        let tab_resp = ui.interact(
            tab_rect,
            ui.make_persistent_id(format!("tab_slot_{}", i)),
            egui::Sense::click(),
        );
        if tab_resp.clicked() {
            action = Some(TabAction::Select(i));
        }

        if is_active {
            // Hai vai cong lan ra ngoai tab_rect va duoc gioi han boi thanh tab.
            paint_chrome_tab(&p.with_clip_rect(full_rect), tab_rect, CHROME_ACTIVE_TAB_BG);
        }

        // Hover uses a full-size rounded gray surface; transparent DirectWrite
        // text keeps it from creating a second rectangle behind the label.
        if tab_resp.hovered() && !is_active {
            // Leave visible breathing room on every edge without reducing
            // the label, icon, or clickable area of the tab.
            let hover_rect = tab_rect.shrink2(Vec2::new(6.0, 6.0));
            if hover_rect.is_positive() {
                p.rect_filled(hover_rect, Rounding::same(8.0), CHROME_TAB_HOVER_BG);
            }
        }

        let content_painter = p.with_clip_rect(tab_rect);

        // Nội dung được bố trí theo chiều rộng đang hiển thị, không theo
        // chiều rộng đích; vì vậy không chồng chữ khi tab thu lại.
        if tab_rect.width() < 96.0 {
            // Khi tab hẹp như Chrome: giữ favicon rõ ràng và dành chỗ cho nút
            // đóng của tab đang active, tránh để icon và dấu × chồng lên nhau.
            let has_compact_close = tab.can_close && is_active && tab_rect.width() >= 32.0;
            if !has_compact_close || tab_rect.width() >= 44.0 {
                let icon_center = if has_compact_close {
                    let shoulder = active_tab_radius(tab_rect);
                    let compact_inset = shoulder + 8.0;
                    let blend = ((tab_rect.width() - 44.0) / 52.0).clamp(0.0, 1.0);
                    Pos2::new(
                        tab_rect.min.x + compact_inset + (24.0 - compact_inset) * blend,
                        tab_rect.center().y,
                    )
                } else {
                    // Giữ icon ở x+24 khi qua ngưỡng 96px; chỉ dịch dần
                    // vào giữa khi tab thực sự hẹp để không bị nhảy vị trí.
                    Pos2::new(
                        tab_rect.min.x + 24.0_f32.min(tab_rect.width() * 0.5),
                        tab_rect.center().y,
                    )
                };
                draw_tab_icon(&content_painter, icon_center, &tab.kind, is_active);
            }

            if has_compact_close {
                let close_center = if tab_rect.width() < 38.0 {
                    tab_rect.center()
                } else {
                    let right_inset = (tab_rect.width() * 0.32).clamp(13.0, 16.0);
                    Pos2::new(tab_rect.max.x - right_inset, tab_rect.center().y)
                };
                let close_rect = Rect::from_center_size(close_center, Vec2::splat(12.0));
                let close_id = ui.make_persistent_id(format!("tab_close_{}", i));
                let close_resp = ui.interact(close_rect, close_id, egui::Sense::click());
                draw_tab_close_button(&content_painter, close_rect, close_resp.hovered());
                if close_resp.clicked() && !is_animating {
                    action = Some(TabAction::Close(i));
                }
            }
        } else {
            // Khi tab có độ rộng vừa/lớn: Hiện Icon Favicon bên trái + Chữ tiêu đề
            // Giữ icon ở cùng tọa độ trước/sau khi chọn tab; không để trạng thái
            // active đẩy icon sang phải theo bán kính góc bo.
            let icon_inset = 24.0;
            let icon_center = Pos2::new(tab_rect.min.x + icon_inset, tab_rect.center().y);
            draw_tab_icon(&content_painter, icon_center, &tab.kind, is_active);

            // Icon chiếm 16px từ x+16 đến x+32; chừa thêm 8px trước chữ.
            let title_x = tab_rect.min.x + 40.0;
            let right_reserved = if tab.can_close && is_active { 28.0 } else { 8.0 };
            // Không tạo chuỗi tiêu đề mới theo từng pixel chiều rộng trong
            // animation: DirectWrite sẽ phải rasterize/upload texture mỗi frame.
            // Chỉ clip texture ổn định theo chiều rộng hiện tại của tab.
            let max_chars = if tab.can_close && is_active { 9 } else { 12 };

            let tab_style = if is_active {
                crate::typography::Typography::tab_active_style()
            } else {
                crate::typography::Typography::tab_inactive_style()
            };

            let display = if tab.title.chars().count() > max_chars {
                let mut s: String = tab.title.chars().take(max_chars.saturating_sub(1).max(1)).collect();
                s.push('…');
                s
            } else {
                tab.title.clone()
            };

            let title_pos = Pos2::new(title_x.round(), tab_rect.center().y.round());
            let title_clip = Rect::from_min_max(
                Pos2::new(title_x, tab_rect.min.y),
                Pos2::new(tab_rect.max.x - right_reserved, tab_rect.max.y),
            );
            crate::dwrite::paint_text(
                &content_painter.with_clip_rect(title_clip),
                title_pos,
                Align2::LEFT_CENTER,
                &display,
                &tab_style,
                ui.ctx(),
            );

            // Nút Đóng '×' (khi tab có thể đóng, đang active và đủ rộng)
            if tab.can_close && is_active {
                let cx = Pos2::new((tab_rect.max.x - 18.0).round(), tab_rect.center().y.round());
                let close_rect = Rect::from_center_size(cx, Vec2::new(18.0, 18.0));
                let close_id = ui.make_persistent_id(format!("tab_close_{}", i));
                let close_resp = ui.interact(close_rect, close_id, egui::Sense::click());
                draw_tab_close_button(&content_painter, close_rect, close_resp.hovered());
                if close_resp.clicked() && !is_animating {
                    action = Some(TabAction::Close(i));
                }
            }
        }
    }

    // ── 5. Vẽ vạch phân cách `|` giữa 2 tab không active ──────────────────────
    for i in 0..(tabs.len().saturating_sub(1)) {
        if i != active_idx && (i + 1) != active_idx {
            if widths[i] >= 45.0 && widths[i + 1] >= 45.0 {
                let sep_x = tab_end_positions[i].round();
                let sep_top = full_rect.min.y + 15.0;
                let sep_bot = full_rect.max.y - 11.0;
                p.vline(sep_x, sep_top..=sep_bot, Stroke::new(1.0_f32, CHROME_DIVIDER));
            }
        }
    }

    // ── 6. Nút '+' thêm tab (nằm ngay sau tab cuối cùng) ───────────────────────
    let plus_x = (next_tab_x + 4.0).round();
    let plus_center = Pos2::new(plus_x + 13.0, full_rect.center().y.round());
    let plus_rect = Rect::from_center_size(plus_center, Vec2::new(26.0, 26.0));
    let plus_resp = ui.interact(plus_rect, ui.make_persistent_id("tab_btn_plus"), egui::Sense::click());
    if plus_resp.hovered() {
        p.circle_filled(plus_center, 13.0, CHROME_HOVER_BG);
    }
    let plus_stroke = Stroke::new(1.25_f32, Color32::from_rgb(100, 116, 139));
    p.line_segment(
        [
            Pos2::new(plus_center.x - 4.0, plus_center.y),
            Pos2::new(plus_center.x + 4.0, plus_center.y),
        ],
        plus_stroke,
    );
    p.line_segment(
        [
            Pos2::new(plus_center.x, plus_center.y - 4.0),
            Pos2::new(plus_center.x, plus_center.y + 4.0),
        ],
        plus_stroke,
    );
    if plus_resp.clicked() {
        action = Some(TabAction::NewTab);
    }

    // ── 7. Kéo thả cửa sổ (Bấm giữ khoảng trống tab bar để di chuyển cửa sổ) ───
    let empty_start_x = plus_x + 26.0 + 6.0;
    let empty_end_x = right_content_start_x - 6.0;

    let drag_rect = (empty_end_x > empty_start_x).then(|| {
        Rect::from_min_max(
            Pos2::new(empty_start_x, full_rect.min.y),
            Pos2::new(empty_end_x, full_rect.max.y),
        )
    });

    if let Some(drag_rect) = drag_rect {
        let drag_resp = ui.interact(
            drag_rect,
            ui.make_persistent_id("tabbar_window_drag_zone"),
            egui::Sense::click_and_drag(),
        );
        if drag_resp.drag_started() {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
        }
        if drag_resp.double_clicked() {
            action = Some(TabAction::Maximize);
        }
    }

    // Mép trên 6px phía trên toàn bộ dải tab cho phép kéo cửa sổ tự do
    let top_edge_rect = Rect::from_min_max(
        Pos2::new(full_rect.min.x, full_rect.min.y),
        Pos2::new(right_content_start_x - 6.0, full_rect.min.y + 6.0),
    );
    #[cfg(target_os = "windows")]
    publish_window_drag_bounds(drag_rect, Some(top_edge_rect));

    let top_drag = ui.interact(
        top_edge_rect,
        ui.make_persistent_id("tabbar_top_edge_drag"),
        egui::Sense::click_and_drag(),
    );
    if top_drag.drag_started() {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
    }
    if top_drag.double_clicked() {
        action = Some(TabAction::Maximize);
    }
    action
}

#[cfg(test)]
mod tests {
    use super::tab_widths;

    #[test]
    fn tab_hover_color_is_chrome_gray() {
        let color = super::CHROME_TAB_HOVER_BG;
        assert_eq!([color.r(), color.g(), color.b()], [208, 215, 224]);
        assert_eq!(color.a(), 255);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_drag_hit_test_only_claims_empty_chrome_regions() {
        use super::{is_window_drag_point, publish_window_drag_bounds};
        use eframe::egui::{Pos2, Rect};

        let empty_gap = Rect::from_min_max(Pos2::new(218.0, 6.0), Pos2::new(680.0, 44.0));
        let top_edge = Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(680.0, 6.0));
        publish_window_drag_bounds(Some(empty_gap), Some(top_edge));

        assert!(is_window_drag_point(Pos2::new(300.0, 22.0)));
        assert!(is_window_drag_point(Pos2::new(100.0, 3.0)));
        assert!(!is_window_drag_point(Pos2::new(100.0, 22.0))); // Home tab
        assert!(!is_window_drag_point(Pos2::new(202.0, 22.0))); // Add-tab button
        assert!(!is_window_drag_point(Pos2::new(700.0, 22.0))); // Login button

        publish_window_drag_bounds(None, None);
    }

    #[test]
    fn new_tab_grows_from_its_left_edge_and_close_reverses_it() {
        let start = tab_widths(4, 560.0, Some((3, 0.0)), None);
        let middle = tab_widths(4, 560.0, Some((3, 0.5)), None);
        let end = tab_widths(4, 560.0, None, None);
        assert_eq!(start[3], 0.0);
        assert!(middle[3] > start[3] && middle[3] < end[3]);
        assert!(start[..3].iter().sum::<f32>() < middle.iter().sum::<f32>());

        let closing_middle = tab_widths(4, 560.0, None, Some((3, 0.5)));
        let closing_end = tab_widths(4, 560.0, None, Some((3, 1.0)));
        assert_eq!(closing_middle, middle);
        assert_eq!(closing_end, start);
    }

    #[test]
    fn test_vietnamese_utf8_truncation() {
        let titles = [
            "Kho ứng dụng",
            "Đã cài đặt",
            "Chưa cài đặt",
            "Trình soạn thảo văn bản chuyên nghiệp",
        ];
        for title in titles {
            let display = if title.chars().count() > 12 {
                let mut s: String = title.chars().take(11).collect();
                s.push('…');
                s
            } else {
                title.to_string()
            };
            assert!(!display.is_empty());
        }
    }
}
