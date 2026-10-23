use super::appearance::{BLUE, GRID_LINE, HEADER, HEADER_SELECTED};
use super::*;

const ROW: f32 = 21.0;
const COL: f32 = 100.0;
const GUTTER: f32 = 38.0;
const HEAD: f32 = 24.0;

impl NomSheetApp {
    pub(super) fn draw_grid(&mut self, ui: &mut Ui) {
        let row_h = (ROW * self.zoom).max(12.0);
        let col_w = (COL * self.zoom).max(36.0);
        let available = ui.available_size();
        if self.reveal_selection {
            let x = (self.selected.column - 1) as f32 * col_w;
            let y = (self.selected.row - 1) as f32 * row_h;
            let width = (available.x - GUTTER - 16.0).max(col_w);
            let height = (available.y - HEAD - 16.0).max(row_h);
            if x < self.grid_scroll.x {
                self.grid_scroll.x = x;
            }
            if x + col_w > self.grid_scroll.x + width {
                self.grid_scroll.x = x + col_w - width;
            }
            if y < self.grid_scroll.y {
                self.grid_scroll.y = y;
            }
            if y + row_h > self.grid_scroll.y + height {
                self.grid_scroll.y = y + row_h - height;
            }
            self.reveal_selection = false;
        }
        let range = self.selection_range();
        let mut clicked = None;
        let mut dragged = None;
        let mut start_edit = false;
        let mut commit = false;
        let mut cancel = false;
        let mut advance = None;
        let mut header_action = None;
        ui.spacing_mut().item_spacing = Vec2::ZERO;
        let output = ScrollArea::both()
            .id_salt(("sheet-grid", self.workbook.active_sheet))
            .auto_shrink([false, false])
            .scroll_offset(self.grid_scroll)
            .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysVisible)
            .show_viewport(ui, |ui, viewport| {
                let origin = ui.min_rect().min + viewport.min.to_vec2();
                let screen = Rect::from_min_max(origin, ui.clip_rect().max);
                ui.set_min_size(Vec2::new(
                    GUTTER + MAX_COLUMNS as f32 * col_w,
                    HEAD + MAX_ROWS as f32 * row_h,
                ));
                let body = Rect::from_min_max(origin + Vec2::new(GUTTER, HEAD), screen.max);
                let painter = ui.painter().with_clip_rect(body);
                painter.rect_filled(body, Rounding::ZERO, Color32::WHITE);
                let first_col = ((viewport.left() / col_w).floor() as u16)
                    .saturating_add(1)
                    .min(MAX_COLUMNS);
                let last_col = (((viewport.left() + body.width()) / col_w).ceil() as u16)
                    .saturating_add(1)
                    .min(MAX_COLUMNS);
                let first_row = ((viewport.top() / row_h).floor() as u32)
                    .saturating_add(1)
                    .min(MAX_ROWS);
                let last_row = (((viewport.top() + body.height()) / row_h).ceil() as u32)
                    .saturating_add(1)
                    .min(MAX_ROWS);
                self.first_column = first_col;
                let cell_rect = |address: CellAddress| {
                    Rect::from_min_size(
                        origin
                            + Vec2::new(
                                GUTTER + (address.column - 1) as f32 * col_w - viewport.left(),
                                HEAD + (address.row - 1) as f32 * row_h - viewport.top(),
                            ),
                        Vec2::new(col_w, row_h),
                    )
                };
                let response = ui.interact(
                    body,
                    ui.make_persistent_id("grid-pointer"),
                    egui::Sense::click_and_drag(),
                );
                if let Some(pos) = response.interact_pointer_pos() {
                    let column = (((pos.x - body.left() + viewport.left()) / col_w).floor() as u16)
                        .saturating_add(1)
                        .clamp(1, MAX_COLUMNS);
                    let row = (((pos.y - body.top() + viewport.top()) / row_h).floor() as u32)
                        .saturating_add(1)
                        .clamp(1, MAX_ROWS);
                    let address = CellAddress { row, column };
                    if response.clicked() || response.drag_started() {
                        clicked = Some(address);
                    }
                    if response.dragged() {
                        dragged = Some(address);
                    }
                    start_edit = response.double_clicked();
                }
                response.context_menu(|ui| {
                    if ui.button("Sao chép · Ctrl+C").clicked() {
                        self.copy_to_clipboard(ui.ctx());
                        ui.close_menu();
                    }
                    if ui.button("Dán · Ctrl+V").clicked() {
                        self.request_clipboard_paste(ui.ctx());
                        ui.close_menu();
                    }
                    if ui.button("Xóa nội dung").clicked() {
                        self.clear_selection();
                        ui.close_menu();
                    }
                });
                for row in first_row..=last_row {
                    for column in first_col..=last_col {
                        let address = CellAddress { row, column };
                        let rect = cell_rect(address);
                        let style = self.workbook.active().get_style(address).cloned().unwrap_or_default();
                        if let Some([r, g, b]) = style.bg_color {
                            painter.rect_filled(rect, Rounding::ZERO, Color32::from_rgb(r, g, b));
                        }
                        if range.contains(address) {
                            painter.rect_filled(
                                rect,
                                Rounding::ZERO,
                                Color32::from_rgba_unmultiplied(26, 115, 232, 22),
                            );
                        }
                        if self.show_gridlines {
                            painter
                                .line_segment([rect.right_top(), rect.right_bottom()], Stroke::new(0.6_f32, GRID_LINE));
                            painter.line_segment(
                                [rect.left_bottom(), rect.right_bottom()],
                                Stroke::new(0.6_f32, GRID_LINE),
                            );
                        }
                        if address == self.selected && self.editing_cell {
                            continue;
                        }
                        let raw = self.workbook.active().get(address);
                        if matches!(raw, CellValue::Blank) {
                            continue;
                        }
                        let value = evaluate_cell(&self.workbook, self.workbook.active_sheet, address);
                        let text = value.format_display(style.num_format);
                        let color = style
                            .text_color
                            .map(|[r, g, b]| Color32::from_rgb(r, g, b))
                            .unwrap_or(RIBBON_TEXT);
                        let face = usize::from(style.bold) + usize::from(style.italic) * 2;
                        let family = match style.font_family.as_str() {
                            "Arial" | "Times New Roman" | "Calibri" | "Segoe UI" => style.font_family.as_str(),
                            _ => "Arial",
                        };
                        let font = egui::FontId::new(
                            style.font_size as f32 * (96.0 / 72.0) * self.zoom,
                            FontFamily::Name(format!("{family}-{face}").into()),
                        );
                        let format = egui::TextFormat {
                            font_id: font,
                            color,
                            italics: style.italic,
                            underline: if style.underline {
                                Stroke::new(1.0_f32, color)
                            } else {
                                Stroke::NONE
                            },
                            strikethrough: if style.strikethrough {
                                Stroke::new(1.0_f32, color)
                            } else {
                                Stroke::NONE
                            },
                            ..Default::default()
                        };
                        let mut job = egui::text::LayoutJob::default();
                        job.append(&text, 0.0, format);
                        let galley = painter.layout_job(job);
                        let right = style.align == CellAlign::Right
                            || (style.align == CellAlign::General && matches!(value, CellValue::Number(_)));
                        let x = if style.align == CellAlign::Center {
                            rect.center().x - galley.size().x / 2.0
                        } else if right {
                            rect.right() - 4.0 - galley.size().x
                        } else {
                            rect.left() + 4.0
                        };
                        painter
                            .with_clip_rect(rect.intersect(body).shrink2(Vec2::new(1.0, 0.0)))
                            .galley(Pos2::new(x, rect.center().y - galley.size().y / 2.0), galley, color);
                    }
                }
                let selection_rect = Rect::from_min_max(cell_rect(range.start).min, cell_rect(range.end).max);
                painter.rect_stroke(selection_rect, Rounding::ZERO, Stroke::new(1.0_f32, BLUE));
                let active = cell_rect(self.selected);
                painter.rect_stroke(active, Rounding::ZERO, Stroke::new(1.8_f32, BLUE));
                if body.contains(active.right_bottom()) {
                    painter.circle_filled(active.right_bottom(), 3.0, BLUE);
                }
                if self.editing_cell && active.intersects(body) {
                    let edit = ui.put(
                        active.intersect(body),
                        egui::TextEdit::singleline(&mut self.edit_buffer)
                            .font(egui::FontId::proportional(13.0 * self.zoom))
                            .margin(Vec2::new(3.0, 1.0))
                            .background_color(Color32::WHITE)
                            .frame(true),
                    );
                    if self.edit_focus_requested {
                        edit.request_focus();
                        self.edit_focus_requested = false;
                    }
                    cancel = ui.input(|i| i.key_pressed(Key::Escape));
                    if ui.input(|i| i.key_pressed(Key::Enter)) {
                        commit = true;
                        advance = Some((self.selected.row.saturating_add(1).min(MAX_ROWS), self.selected.column));
                    } else if ui.input(|i| i.key_pressed(Key::Tab)) {
                        commit = true;
                        advance = Some((
                            self.selected.row,
                            self.selected.column.saturating_add(1).min(MAX_COLUMNS),
                        ));
                    } else if edit.lost_focus() && !cancel {
                        commit = true;
                    }
                }
                let hp = ui.painter().with_clip_rect(screen);
                hp.rect_filled(
                    Rect::from_min_max(origin, Pos2::new(screen.right(), origin.y + HEAD)),
                    Rounding::ZERO,
                    HEADER,
                );
                hp.rect_filled(
                    Rect::from_min_max(origin, Pos2::new(origin.x + GUTTER, screen.bottom())),
                    Rounding::ZERO,
                    HEADER,
                );
                for column in first_col..=last_col {
                    let rect = Rect::from_min_size(
                        Pos2::new(cell_rect(CellAddress { row: 1, column }).left(), origin.y),
                        Vec2::new(col_w, HEAD),
                    );
                    let clip = Rect::from_min_max(
                        origin + Vec2::new(GUTTER, 0.0),
                        Pos2::new(screen.right(), origin.y + HEAD),
                    );
                    let p = hp.with_clip_rect(clip);
                    if column >= range.start.column && column <= range.end.column {
                        p.rect_filled(rect, Rounding::ZERO, HEADER_SELECTED);
                    }
                    p.line_segment(
                        [rect.right_top(), rect.right_bottom()],
                        Stroke::new(1.0_f32, Color32::from_gray(196)),
                    );
                    p.text(
                        rect.center(),
                        Align2::CENTER_CENTER,
                        nom_workbook::column_name(column),
                        egui::FontId::proportional(11.0),
                        RIBBON_TEXT,
                    );
                    if ui
                        .interact(
                            rect.intersect(clip),
                            ui.make_persistent_id(("column", column)),
                            egui::Sense::click(),
                        )
                        .clicked()
                    {
                        header_action = Some((false, column as u32));
                    }
                }
                for row in first_row..=last_row {
                    let rect = Rect::from_min_size(
                        Pos2::new(origin.x, cell_rect(CellAddress { row, column: 1 }).top()),
                        Vec2::new(GUTTER, row_h),
                    );
                    let clip = Rect::from_min_max(
                        origin + Vec2::new(0.0, HEAD),
                        Pos2::new(origin.x + GUTTER, screen.bottom()),
                    );
                    let p = hp.with_clip_rect(clip);
                    if row >= range.start.row && row <= range.end.row {
                        p.rect_filled(rect, Rounding::ZERO, HEADER_SELECTED);
                    }
                    p.line_segment(
                        [rect.left_bottom(), rect.right_bottom()],
                        Stroke::new(0.6_f32, GRID_LINE),
                    );
                    p.text(
                        rect.center(),
                        Align2::CENTER_CENTER,
                        row.to_string(),
                        egui::FontId::proportional(10.5),
                        RIBBON_MUTED,
                    );
                    if ui
                        .interact(
                            rect.intersect(clip),
                            ui.make_persistent_id(("row", row)),
                            egui::Sense::click(),
                        )
                        .clicked()
                    {
                        header_action = Some((true, row));
                    }
                }
                hp.line_segment(
                    [
                        origin + Vec2::new(GUTTER, 0.0),
                        Pos2::new(origin.x + GUTTER, screen.bottom()),
                    ],
                    Stroke::new(1.0_f32, Color32::from_gray(196)),
                );
                hp.line_segment(
                    [
                        origin + Vec2::new(0.0, HEAD),
                        Pos2::new(screen.right(), origin.y + HEAD),
                    ],
                    Stroke::new(1.0_f32, Color32::from_gray(196)),
                );
            });
        self.grid_scroll = output.state.offset;
        if cancel {
            self.editing_cell = false;
            self.refresh_bars();
        } else if commit {
            self.commit_edit();
            if let Some((row, column)) = advance {
                self.select_cell(CellAddress { row, column });
            }
        }
        if let Some(address) = clicked {
            if ui.input(|i| i.modifiers.shift) {
                self.selection_end = Some(address);
                self.refresh_bars();
            } else {
                self.select_cell(address);
            }
        }
        if let Some(address) = dragged {
            self.selection_end = Some(address);
            self.refresh_bars();
        }
        if start_edit {
            self.editing_cell = true;
            self.edit_focus_requested = true;
        }
        if let Some((is_row, index)) = header_action {
            if is_row {
                self.selected = CellAddress { row: index, column: 1 };
                self.selection_end = Some(CellAddress {
                    row: index,
                    column: MAX_COLUMNS,
                });
            } else {
                self.selected = CellAddress {
                    row: 1,
                    column: index as u16,
                };
                self.selection_end = Some(CellAddress {
                    row: MAX_ROWS,
                    column: index as u16,
                });
            }
            self.editing_cell = false;
            self.refresh_bars();
        }
    }
}
