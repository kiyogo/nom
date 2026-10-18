use eframe::egui::{self, CentralPanel, Color32, Context, ScrollArea, SidePanel, TopBottomPanel, Vec2};
use nom_package::{
    clear_session, get_default_catalog, launch_app, load_session, sync_installed_status, uninstall_app, AppInfo,
    AppStatus, InstallEvent, LocalInstaller, UserSession,
};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

#[cfg(target_os = "windows")]
static WINDOW_DPI: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(96);

use crate::font::setup_vietnamese_font;
use crate::theme::apply_flat_white_theme;
use crate::views::{
    get_default_tabs, render_app_list, render_app_tile, render_chrome_tab_bar, render_footer, render_hub_header,
    render_hub_sidebar, render_login_modal, AppRowAction, ChromeTab, FilterTab, HubNav, LoginModalState, TabAction,
    TabKind,
};

pub struct LauncherApp {
    apps: Vec<AppInfo>,
    install_tx: mpsc::Sender<InstallEvent>,
    install_rx: mpsc::Receiver<InstallEvent>,
    status_message: Option<String>,
    last_sync: Instant,
    session: UserSession,
    login_modal: LoginModalState,
    tabs: Vec<ChromeTab>,
    active_tab_idx: usize,
    new_tab_animation: Option<(usize, Instant)>,
    closing_tab_animation: Option<(usize, Instant)>,
    search_query: String,
    category_filter: Option<&'static str>,
    filter_tab: FilterTab,
    tab_dropdown_open: bool,
    win11_styled: bool,
    win11_style_attempts: u8,
}

impl LauncherApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // Nạp font tiếng Việt và theme ngay lập tức từ đầu — không bao giờ bị ô vuông □ khi mới mở app
        setup_vietnamese_font(&cc.egui_ctx);
        apply_flat_white_theme(&cc.egui_ctx);

        let (tx, rx) = mpsc::channel(100);
        let mut apps = get_default_catalog();
        sync_installed_status(&mut apps);
        let session = load_session();

        Self {
            apps,
            install_tx: tx,
            install_rx: rx,
            status_message: None,
            last_sync: Instant::now(),
            session,
            login_modal: LoginModalState::default(),
            tabs: get_default_tabs(),
            active_tab_idx: 0,
            new_tab_animation: None,
            closing_tab_animation: None,
            search_query: String::new(),
            category_filter: None,
            filter_tab: FilterTab::All,
            tab_dropdown_open: false,
            win11_styled: false,
            win11_style_attempts: 0,
        }
    }

    fn handle_install_events(&mut self) {
        while let Ok(event) = self.install_rx.try_recv() {
            match event {
                InstallEvent::Progress {
                    app_id,
                    progress,
                    speed_mbps,
                    copied_mb,
                    total_mb,
                } => {
                    if let Some(app) = self.apps.iter_mut().find(|a| a.id == app_id) {
                        app.status = AppStatus::Installing {
                            progress,
                            speed_mbps,
                            copied_mb,
                            total_mb,
                        };
                    }
                }
                InstallEvent::Verifying { app_id } => {
                    if let Some(app) = self.apps.iter_mut().find(|a| a.id == app_id) {
                        app.status = AppStatus::Verifying;
                    }
                }
                InstallEvent::Finalizing { app_id } => {
                    if let Some(app) = self.apps.iter_mut().find(|a| a.id == app_id) {
                        app.status = AppStatus::Extracting;
                    }
                }
                InstallEvent::Completed { app_id } => {
                    if let Some(app) = self.apps.iter_mut().find(|a| a.id == app_id) {
                        app.status = AppStatus::Installed {
                            version: app.version.clone(),
                        };
                        self.status_message = Some(format!(
                            "Đã cài đặt thành công Nom {} và đăng ký vào Windows Control Panel (appwiz.cpl)!",
                            app.name
                        ));
                    }
                }
                InstallEvent::Failed { app_id, error } => {
                    if let Some(app) = self.apps.iter_mut().find(|a| a.id == app_id) {
                        app.status = AppStatus::Error(error.clone());
                        self.status_message = Some(format!("Lỗi khi cài đặt Nom {}: {}", app.name, error));
                    }
                }
            }
        }
    }
}

impl eframe::App for LauncherApp {
    fn update(&mut self, ctx: &Context, _frame: &mut eframe::Frame) {
        self.handle_install_events();

        // Đồng bộ trạng thái với Windows Control Panel mỗi 15 giây (hoặc ngay sau khi cài đặt/gỡ)
        if self.last_sync.elapsed() > Duration::from_secs(15) {
            sync_installed_status(&mut self.apps);
            self.last_sync = Instant::now();
        }

        let is_maximized = ctx.input(|i| i.viewport().maximized.unwrap_or(false));

        // Giữ nhịp repaint trong thời gian tab mới đang mở rộng từ nút '+'.
        // Animation ngắn và chỉ chạy sau thao tác NewTab của người dùng.
        let tab_animation = self.new_tab_animation.and_then(|(index, started)| {
            if index >= self.tabs.len() {
                self.new_tab_animation = None;
                return None;
            }

            let duration = Duration::from_millis(220);
            let progress = (started.elapsed().as_secs_f32() / duration.as_secs_f32()).min(1.0);
            if progress >= 1.0 {
                self.new_tab_animation = None;
                None
            } else {
                ctx.request_repaint_after(Duration::from_millis(16));
                // Ease-out cubic: bật nhanh rồi hạ nhẹ ở cuối.
                let eased = 1.0 - (1.0 - progress).powi(3);
                Some((index, eased))
            }
        });

        // Giữ tab còn trên thanh trong lúc đóng để có thể thu nhỏ nó trước khi
        // xóa khỏi Vec. Điều này tạo cảm giác giống Chrome thay vì biến mất đột ngột.
        let closing_tab_animation = match self.closing_tab_animation {
            Some((index, started)) if index < self.tabs.len() => {
                let duration = Duration::from_millis(100);
                let progress = (started.elapsed().as_secs_f32() / duration.as_secs_f32()).min(1.0);
                if progress >= 1.0 {
                    self.closing_tab_animation = None;
                    self.tabs.remove(index);
                    if let Some((opening_index, started)) = self.new_tab_animation {
                        if opening_index > index {
                            self.new_tab_animation = Some((opening_index - 1, started));
                        } else if opening_index == index {
                            self.new_tab_animation = None;
                        }
                    }
                    if self.active_tab_idx > index {
                        self.active_tab_idx -= 1;
                    } else if self.active_tab_idx >= self.tabs.len() {
                        self.active_tab_idx = self.tabs.len().saturating_sub(1);
                    }
                    None
                } else {
                    ctx.request_repaint();
                    // Thu nhanh lúc đầu và chậm dần về 0 để frame cuối không
                    // phải nhảy thêm một đoạn lớn khi tab bị xóa khỏi Vec.
                    let eased = 1.0 - (1.0 - progress).powi(3);
                    Some((index, eased))
                }
            }
            Some(_) => {
                self.closing_tab_animation = None;
                None
            }
            None => None,
        };

        // Xử lý kéo dãn cạnh và 4 góc cửa sổ khi không phóng to cực đại
        handle_window_resize_edges(ctx, is_maximized);

        let mut tab_action: Option<TabAction> = None;

        // ══════════════════════════════════════════════════════════════════════
        // 1. TopBottomPanel CỐ ĐỊNH Ở ĐẦU — Chỉ giữ thanh Tab Strip (40px)
        // Cố định 100% không bị cuộn theo, cách ly hoàn toàn với danh sách bên dưới
        // ══════════════════════════════════════════════════════════════════════
        TopBottomPanel::top("top_header_panel")
            .show_separator_line(false)
            .frame(egui::Frame::none())
            .show(ctx, |ui| {
                ui.spacing_mut().item_spacing = Vec2::ZERO;

                // ── Tab Strip (40px cố định) ───────────────────────────────
                if let Some(act) = render_chrome_tab_bar(
                    ui,
                    &self.tabs,
                    self.active_tab_idx,
                    self.tab_dropdown_open,
                    &self.session,
                    is_maximized,
                    tab_animation,
                    closing_tab_animation,
                ) {
                    tab_action = Some(act);
                }
            });

        // Thanh điều hướng Software Hub nằm dưới thanh tab, giữ nguyên các tab
        // và tính năng cài đặt/mở/gỡ sẵn có của ứng dụng.
        let selected_nav = match self.category_filter {
            Some("Office") => Some(HubNav::Office),
            Some("Editor") => Some(HubNav::Editor),
            _ => match self.filter_tab {
                FilterTab::All => Some(HubNav::All),
                FilterTab::Installed => Some(HubNav::Installed),
                FilterTab::NotInstalled => Some(HubNav::NotInstalled),
            },
        };
        let sidebar_width = if ctx.screen_rect().width() < 850.0 {
            172.0
        } else {
            204.0
        };
        let mut sidebar_action = None;
        SidePanel::left("software_hub_sidebar")
            .resizable(false)
            .show_separator_line(false)
            .exact_width(sidebar_width)
            .frame(
                egui::Frame::none()
                    .fill(Color32::WHITE)
                    .inner_margin(egui::Margin::symmetric(13.0, 20.0)),
            )
            .show(ctx, |ui| {
                sidebar_action = render_hub_sidebar(ui, selected_nav, &self.apps);
            });
        if let Some(nav) = sidebar_action {
            match nav {
                HubNav::All => {
                    self.filter_tab = FilterTab::All;
                    self.category_filter = None;
                }
                HubNav::Installed => {
                    self.filter_tab = FilterTab::Installed;
                    self.category_filter = None;
                }
                HubNav::NotInstalled => {
                    self.filter_tab = FilterTab::NotInstalled;
                    self.category_filter = None;
                }
                HubNav::Office => {
                    self.filter_tab = FilterTab::All;
                    self.category_filter = Some("Office");
                }
                HubNav::Editor => {
                    self.filter_tab = FilterTab::All;
                    self.category_filter = Some("Editor");
                }
            }
            ctx.request_repaint();
        }

        let current_kind = self
            .tabs
            .get(self.active_tab_idx)
            .map(|tab| tab.kind.clone())
            .unwrap_or(TabKind::Home);
        let page_title = "Trang chủ";

        CentralPanel::default()
            .frame(egui::Frame::none().fill(Color32::WHITE))
            .show(ctx, |ui| {
                ui.spacing_mut().item_spacing = Vec2::ZERO;

                let total_width = ui.available_width();
                let max_content_width = 1080.0_f32;
                let side_padding = ((total_width - max_content_width) / 2.0).max(20.0);

                ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded)
                    .show(ui, |ui| {
                        ui.spacing_mut().item_spacing = Vec2::ZERO;
                        ui.horizontal(|ui| {
                            ui.add_space(side_padding);
                            ui.vertical(|ui| {
                                ui.set_width((total_width - side_padding * 2.0).min(max_content_width));
                                ui.add_space(26.0);
                                let search_changed = render_hub_header(
                                    ui,
                                    &page_title,
                                    &mut self.search_query,
                                    self.status_message.as_deref(),
                                );
                                if search_changed && matches!(current_kind, TabKind::App(_)) {
                                    self.active_tab_idx = 0;
                                    self.category_filter = None;
                                    ctx.request_repaint();
                                }

                                // Danh sách app theo tab
                                let filter_tab = match &current_kind {
                                    TabKind::Home => self.filter_tab,
                                    TabKind::All => FilterTab::All,
                                    TabKind::Installed => FilterTab::Installed,
                                    TabKind::NotInstalled => FilterTab::NotInstalled,
                                    TabKind::App(_) => FilterTab::All,
                                };

                                let (action_install, action_launch, action_uninstall) = match &current_kind {
                                    TabKind::App(ref target_id) => {
                                        let target_idx = self
                                            .apps
                                            .iter()
                                            .enumerate()
                                            .find(|(_, a)| &a.id == target_id)
                                            .map(|(i, _)| i);
                                        if let Some(idx) = target_idx {
                                            let app = &self.apps[idx];
                                            match render_app_tile(ui, ctx, idx, app) {
                                                Some(AppRowAction::Install(i)) => (Some(i), None, None),
                                                Some(AppRowAction::Launch(i)) => (None, Some(i), None),
                                                Some(AppRowAction::Uninstall(i)) => (None, None, Some(i)),
                                                None => (None, None, None),
                                            }
                                        } else {
                                            (None, None, None)
                                        }
                                    }
                                    _ => render_app_list(
                                        ui,
                                        ctx,
                                        &self.apps,
                                        filter_tab,
                                        self.category_filter,
                                        &self.search_query,
                                    ),
                                };

                                // Xử lý sự kiện install / launch / uninstall
                                if let Some(idx) = action_install {
                                    let app = &mut self.apps[idx];
                                    app.status = AppStatus::Installing {
                                        progress: 0.0,
                                        speed_mbps: 0.0,
                                        copied_mb: 0.0,
                                        total_mb: 0.0,
                                    };
                                    LocalInstaller::start_install(app.clone(), self.install_tx.clone());
                                }
                                if let Some(idx) = action_launch {
                                    let app = &self.apps[idx];
                                    if let Err(e) = launch_app(app) {
                                        self.status_message = Some(format!("Không thể mở {}: {}", app.name, e));
                                    }
                                }
                                if let Some(idx) = action_uninstall {
                                    let app = self.apps[idx].clone();
                                    self.apps[idx].status = AppStatus::NotInstalled;
                                    self.status_message = Some(format!(
                                        "Đã gỡ bỏ sạch sẽ Nom {} khỏi hệ thống và Control Panel!",
                                        app.name
                                    ));
                                    tokio::spawn(async move {
                                        let _ = uninstall_app(&app);
                                    });
                                }

                                render_footer(ui);
                            });
                        });
                    });
            });

        // ── Xử lý TabAction SAU khi render (áp dụng frame tiếp theo) ─────
        if let Some(act) = tab_action {
            match act {
                TabAction::Select(idx) => {
                    if idx < self.tabs.len() {
                        self.active_tab_idx = idx;
                        self.category_filter = None;
                    }
                    self.tab_dropdown_open = false;
                }
                TabAction::Close(idx) => {
                    if idx < self.tabs.len() && self.tabs[idx].can_close && self.closing_tab_animation.is_none() {
                        self.closing_tab_animation = Some((idx, Instant::now()));
                        // Chọn tab kế bên ngay từ đầu; nếu chờ tới frame xóa,
                        // nền tab active sẽ nhảy đột ngột ở cuối animation.
                        if self.active_tab_idx == idx {
                            self.active_tab_idx = if idx + 1 < self.tabs.len() {
                                idx + 1
                            } else {
                                idx.saturating_sub(1)
                            };
                        }
                        ctx.request_repaint();
                    }
                }
                TabAction::NewTab => {
                    self.tab_dropdown_open = false;
                    self.category_filter = None;
                    let opened_ids: Vec<String> = self
                        .tabs
                        .iter()
                        .filter_map(|t| match &t.kind {
                            TabKind::App(id) => Some(id.clone()),
                            _ => None,
                        })
                        .collect();
                    if let Some(next_app) = self.apps.iter().find(|a| !opened_ids.contains(&a.id)) {
                        self.tabs.push(ChromeTab {
                            id: format!("app_{}", next_app.id),
                            title: format!("Nom {}", next_app.name),
                            kind: TabKind::App(next_app.id.clone()),
                            can_close: true,
                        });
                        self.active_tab_idx = self.tabs.len() - 1;
                        self.new_tab_animation = Some((self.active_tab_idx, Instant::now()));
                        ctx.request_repaint();
                    } else {
                        self.active_tab_idx = 0;
                    }
                }
                TabAction::ToggleDropdown => {
                    self.tab_dropdown_open = !self.tab_dropdown_open;
                }
                TabAction::OpenLogin => {
                    self.login_modal.is_open = true;
                }
                TabAction::Logout => {
                    let _ = clear_session();
                    self.session = UserSession::default();
                    self.status_message = Some("Đã đăng xuất tài khoản thành công!".to_string());
                }
                TabAction::Minimize => {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
                }
                TabAction::Maximize => {
                    let currently_max = ctx.input(|i| i.viewport().maximized.unwrap_or(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!currently_max));
                }
                TabAction::CloseWindow => {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
            }
        }

        // Modal đăng nhập
        render_login_modal(ctx, &mut self.login_modal, &mut self.session);

        // HWND của eframe có thể chưa tồn tại ở frame đầu. Thử lại vài lần để
        // DWM áp dụng góc cửa sổ native thay vì vẽ một góc giả bằng egui.
        #[cfg(target_os = "windows")]
        if !self.win11_styled && self.win11_style_attempts < 20 {
            self.win11_style_attempts += 1;
            self.win11_styled = apply_windows_11_rounded_corners();
            if !self.win11_styled {
                ctx.request_repaint_after(Duration::from_millis(100));
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn borderless_shadow_subclass_proc(
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
    _subclass_id: usize,
    _ref_data: usize,
) -> isize {
    const WM_NCCALCSIZE: u32 = 0x0083;
    const WM_NCHITTEST: u32 = 0x0084;
    const WM_NCLBUTTONDBLCLK: u32 = 0x00A3;
    const WM_DPICHANGED: u32 = 0x02E0;
    const HTCAPTION: isize = 2;
    const SW_MAXIMIZE: i32 = 3;
    const SW_RESTORE: i32 = 9;

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    struct NcCalcSizeParams {
        rects: [Rect; 3],
        window_pos: *mut std::ffi::c_void,
    }

    #[repr(C)]
    struct MonitorInfo {
        size: u32,
        monitor: Rect,
        work: Rect,
        flags: u32,
    }

    #[link(name = "comctl32")]
    extern "system" {
        fn DefSubclassProc(hwnd: isize, message: u32, wparam: usize, lparam: isize) -> isize;
    }
    #[link(name = "user32")]
    extern "system" {
        fn IsZoomed(hwnd: isize) -> i32;
        fn MonitorFromWindow(hwnd: isize, flags: u32) -> isize;
        fn GetMonitorInfoW(monitor: isize, info: *mut MonitorInfo) -> i32;
        fn ScreenToClient(hwnd: isize, point: *mut Point) -> i32;
        fn ShowWindow(hwnd: isize, command: i32) -> i32;
    }

    if message == WM_DPICHANGED {
        let dpi = (wparam & 0xFFFF) as u32;
        if dpi > 0 {
            WINDOW_DPI.store(dpi, std::sync::atomic::Ordering::Relaxed);
        }
    }

    // The app removes WS_CAPTION to draw its Chrome-like tab strip itself.
    // Treat only its empty regions as caption so Windows can begin a native
    // move on mouse-down while tabs and controls still receive normal clicks.
    if message == WM_NCHITTEST {
        let mut point = Point {
            x: (lparam as u16 as i16) as i32,
            y: ((lparam >> 16) as u16 as i16) as i32,
        };
        if unsafe { ScreenToClient(hwnd, &mut point) } != 0 {
            let dpi = WINDOW_DPI.load(std::sync::atomic::Ordering::Relaxed).max(1) as f32;
            let points_per_pixel = 96.0 / dpi;
            let logical_point = egui::pos2(point.x as f32 * points_per_pixel, point.y as f32 * points_per_pixel);
            if crate::views::tabs::is_window_drag_point(logical_point) {
                return HTCAPTION;
            }
        }
    }

    // Keep Chrome-style double-click-to-maximize in the native drag region.
    if message == WM_NCLBUTTONDBLCLK && wparam == HTCAPTION as usize {
        let command = if unsafe { IsZoomed(hwnd) } != 0 {
            SW_RESTORE
        } else {
            SW_MAXIMIZE
        };
        unsafe { ShowWindow(hwnd, command) };
        return 0;
    }

    // Keep the native caption style for DWM's corners and shadow, while making
    // the tab strip the actual client area instead of showing a second titlebar.
    if message == WM_NCCALCSIZE {
        if wparam != 0 {
            let params = unsafe { &mut *(lparam as *mut NcCalcSizeParams) };
            if unsafe { IsZoomed(hwnd) } != 0 {
                let monitor = unsafe { MonitorFromWindow(hwnd, 2) };
                let mut info = MonitorInfo {
                    size: std::mem::size_of::<MonitorInfo>() as u32,
                    monitor: Rect {
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                    },
                    work: Rect {
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                    },
                    flags: 0,
                };
                if monitor != 0 && unsafe { GetMonitorInfoW(monitor, &mut info) } != 0 {
                    params.rects[0] = info.work;
                }
            } else {
                params.rects[0].top += 1;
                params.rects[0].bottom -= 1;
            }
        }
        return 0;
    }

    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

#[cfg(target_os = "windows")]
fn apply_windows_11_rounded_corners() -> bool {
    struct EnumData {
        pid: u32,
        hwnd: isize,
    }

    extern "system" fn find_own_window(hwnd: isize, lparam: isize) -> i32 {
        let data = unsafe { &mut *(lparam as *mut EnumData) };
        let mut window_pid = 0_u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut window_pid) };
        if window_pid == data.pid && unsafe { IsWindowVisible(hwnd) } != 0 {
            let mut title = [0_u16; 256];
            let title_len = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
            let title = String::from_utf16_lossy(&title[..title_len.max(0) as usize]);
            if title == "Nom Software Hub" {
                data.hwnd = hwnd;
                return 0;
            }
        }
        1
    }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(callback: extern "system" fn(isize, isize) -> i32, lparam: isize) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, process_id: *mut u32) -> u32;
        fn IsWindowVisible(hwnd: isize) -> i32;
        fn GetWindowTextW(hwnd: isize, text: *mut u16, max_count: i32) -> i32;
        fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
        fn SetWindowPos(hwnd: isize, insert_after: isize, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32;
        fn GetDpiForWindow(hwnd: isize) -> u32;
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
    }

    #[link(name = "comctl32")]
    extern "system" {
        fn SetWindowSubclass(
            hwnd: isize,
            callback: Option<unsafe extern "system" fn(isize, u32, usize, isize, usize, usize) -> isize>,
            subclass_id: usize,
            ref_data: usize,
        ) -> i32;
    }

    unsafe {
        let mut data = EnumData {
            pid: std::process::id(),
            hwnd: 0,
        };
        let _ = EnumWindows(find_own_window, &mut data as *mut _ as isize);
        let hwnd = data.hwnd;
        if hwnd != 0 {
            let dpi = GetDpiForWindow(hwnd);
            if dpi > 0 {
                WINDOW_DPI.store(dpi, std::sync::atomic::Ordering::Relaxed);
            }

            const GWL_STYLE: i32 = -16;
            const WS_CAPTION: isize = 0x00C0_0000;
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let _ = SetWindowLongPtrW(hwnd, GWL_STYLE, style & !WS_CAPTION);

            const SUBCLASS_ID: usize = 0x4E4F_4D;
            if SetWindowSubclass(hwnd, Some(borderless_shadow_subclass_proc), SUBCLASS_ID, 0) == 0 {
                return false;
            }
            // Recalculate the non-client frame now that the subclass is active.
            const FRAME_REFRESH_FLAGS: u32 = 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020;
            if SetWindowPos(hwnd, 0, 0, 0, 0, 0, FRAME_REFRESH_FLAGS) == 0 {
                return false;
            }
            // 33 = DWMWA_WINDOW_CORNER_PREFERENCE
            // 2 = DWMWCP_ROUND: dùng bo góc cửa sổ chuẩn Windows 11.
            // Các góc nội dung do egui tự vẽ với bán kính riêng.
            let preference: u32 = 2;
            let result = DwmSetWindowAttribute(
                hwnd,
                33,
                &preference as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            if result >= 0 {
                // 34 = DWMWA_BORDER_COLOR; restore system default so DWM can
                // render the subtle native outline around rounded corners.
                let border_color: u32 = 0xFFFF_FFFF;
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    34,
                    &border_color as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<u32>() as u32,
                );
                return true;
            }
        }
    }
    false
}

/// Cho phép người dùng rê chuột vào 4 cạnh và 4 góc của cửa sổ không viền để kéo dãn kích thước tùy thích
fn handle_window_resize_edges(ctx: &Context, is_maximized: bool) {
    if is_maximized {
        return;
    }

    let screen_rect = ctx.screen_rect();
    let border = 5.0_f32; // Vùng bắt chuột 5px quanh mép trái, phải, dưới
    let top_border = 3.0_f32; // Vùng bắt chuột 3px ở mép trên cùng (không lấn vào tab hoặc nút)

    let Some(pointer_pos) = ctx.input(|i| i.pointer.latest_pos()) else {
        return;
    };

    let on_left = pointer_pos.x >= screen_rect.min.x && pointer_pos.x <= screen_rect.min.x + border;
    let on_right = pointer_pos.x <= screen_rect.max.x && pointer_pos.x >= screen_rect.max.x - border;
    let on_top = pointer_pos.y >= screen_rect.min.y && pointer_pos.y <= screen_rect.min.y + top_border;
    let on_bottom = pointer_pos.y <= screen_rect.max.y && pointer_pos.y >= screen_rect.max.y - border;

    let resize_dir = match (on_left, on_right, on_top, on_bottom) {
        (true, _, true, _) => Some((egui::ResizeDirection::NorthWest, egui::CursorIcon::ResizeNorthWest)),
        (_, true, true, _) => Some((egui::ResizeDirection::NorthEast, egui::CursorIcon::ResizeNorthEast)),
        (true, _, _, true) => Some((egui::ResizeDirection::SouthWest, egui::CursorIcon::ResizeSouthWest)),
        (_, true, _, true) => Some((egui::ResizeDirection::SouthEast, egui::CursorIcon::ResizeSouthEast)),
        (true, _, _, _) => Some((egui::ResizeDirection::West, egui::CursorIcon::ResizeWest)),
        (_, true, _, _) => Some((egui::ResizeDirection::East, egui::CursorIcon::ResizeEast)),
        (_, _, true, _) => Some((egui::ResizeDirection::North, egui::CursorIcon::ResizeNorth)),
        (_, _, _, true) => Some((egui::ResizeDirection::South, egui::CursorIcon::ResizeSouth)),
        _ => None,
    };

    if let Some((dir, cursor)) = resize_dir {
        ctx.set_cursor_icon(cursor);
        if ctx.input(|i| i.pointer.primary_pressed()) {
            ctx.send_viewport_cmd(egui::ViewportCommand::BeginResize(dir));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_layout_clip_rect() {
        let ctx = egui::Context::default();
        let _ = ctx.run(Default::default(), |ctx| {
            let tabs = get_default_tabs();
            let session = UserSession::default();

            egui::TopBottomPanel::top("top_header_panel")
                .show_separator_line(false)
                .frame(egui::Frame::none())
                .show(ctx, |ui| {
                    ui.spacing_mut().item_spacing = Vec2::ZERO;
                    render_chrome_tab_bar(ui, &tabs, 0, false, &session, false, None, None);
                    println!(
                        "In TopBottomPanel, after tab bar: cursor={:?}, min_rect={:?}",
                        ui.cursor().min,
                        ui.min_rect()
                    );
                });

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(Color32::WHITE))
                .show(ctx, |ui| {
                    println!(
                        "CentralPanel: clip_rect={:?}, cursor={:?}",
                        ui.clip_rect(),
                        ui.cursor().min
                    );
                    ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
                        println!(
                            "Inside ScrollArea: clip_rect={:?}, cursor={:?}",
                            ui.clip_rect(),
                            ui.cursor().min
                        );
                    });
                });
        });
    }
}
