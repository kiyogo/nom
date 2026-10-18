use std::collections::BTreeMap;
use std::path::PathBuf;

use thiserror::Error;

pub const MAX_ROWS: u32 = 1_048_576;
pub const MAX_COLUMNS: u16 = 16_384;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CellAddress {
    pub row: u32,
    pub column: u16,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AddressError {
    #[error("Địa chỉ ô không hợp lệ: {0}")]
    Invalid(String),
    #[error("Địa chỉ ô vượt giới hạn worksheet: {0}")]
    OutOfBounds(String),
}

impl CellAddress {
    pub fn new(row: u32, column: u16) -> Result<Self, AddressError> {
        if row == 0 || row > MAX_ROWS || column == 0 || column > MAX_COLUMNS {
            return Err(AddressError::OutOfBounds(format!("{column}{row}")));
        }
        Ok(Self { row, column })
    }

    pub fn parse(value: &str) -> Result<Self, AddressError> {
        let value = value.trim();
        let bytes = value.as_bytes();
        let mut index = if bytes.first() == Some(&b'$') { 1 } else { 0 };
        let letters_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_alphabetic) {
            index += 1;
        }
        let letters_end = index;
        if letters_end == letters_start {
            return Err(AddressError::Invalid(value.to_string()));
        }
        if bytes.get(index) == Some(&b'$') {
            index += 1;
        }
        let digits_start = index;
        while bytes.get(index).is_some_and(u8::is_ascii_digit) {
            index += 1;
        }
        if digits_start == index || index != bytes.len() {
            return Err(AddressError::Invalid(value.to_string()));
        }
        let letters = &bytes[letters_start..letters_end];
        let digits = &value[digits_start..index];
        let mut column: u32 = 0;
        for byte in letters.iter().copied() {
            column = column
                .checked_mul(26)
                .and_then(|n| n.checked_add(u32::from(byte.to_ascii_uppercase() - b'A' + 1)))
                .ok_or_else(|| AddressError::OutOfBounds(value.to_string()))?;
        }
        let row = digits
            .parse::<u32>()
            .map_err(|_| AddressError::Invalid(value.to_string()))?;
        if row == 0 || row > MAX_ROWS || column == 0 || column > u32::from(MAX_COLUMNS) {
            return Err(AddressError::OutOfBounds(value.to_string()));
        }
        Ok(Self {
            row,
            column: column as u16,
        })
    }

    pub fn column_name(self) -> String {
        column_name(self.column)
    }
}

impl std::fmt::Display for CellAddress {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}{}", column_name(self.column), self.row)
    }
}

pub fn column_name(mut column: u16) -> String {
    let mut name = Vec::with_capacity(3);
    while column > 0 {
        let digit = (column - 1) % 26;
        name.push(b'A' + digit as u8);
        column = (column - 1) / 26;
    }
    name.reverse();
    String::from_utf8(name).expect("column names are ASCII")
}

pub fn column_index(name: &str) -> Result<u16, AddressError> {
    if name.is_empty() || !name.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return Err(AddressError::Invalid(name.to_string()));
    }
    let value = name
        .bytes()
        .try_fold(0_u32, |acc, byte| {
            acc.checked_mul(26)?
                .checked_add(u32::from(byte.to_ascii_uppercase() - b'A' + 1))
        })
        .ok_or_else(|| AddressError::OutOfBounds(name.to_string()))?;
    if value == 0 || value > u32::from(MAX_COLUMNS) {
        return Err(AddressError::OutOfBounds(name.to_string()));
    }
    Ok(value as u16)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CellRange {
    pub start: CellAddress,
    pub end: CellAddress,
}

impl CellRange {
    pub fn new(first: CellAddress, second: CellAddress) -> Self {
        Self {
            start: CellAddress {
                row: first.row.min(second.row),
                column: first.column.min(second.column),
            },
            end: CellAddress {
                row: first.row.max(second.row),
                column: first.column.max(second.column),
            },
        }
    }

    pub fn parse(value: &str) -> Result<Self, AddressError> {
        let (start, end) = value.split_once(':').unwrap_or((value, value));
        Ok(Self::new(CellAddress::parse(start)?, CellAddress::parse(end)?))
    }

    pub fn contains(self, address: CellAddress) -> bool {
        address.row >= self.start.row
            && address.row <= self.end.row
            && address.column >= self.start.column
            && address.column <= self.end.column
    }

    pub fn cell_count(&self) -> u64 {
        u64::from(self.end.row - self.start.row + 1) * u64::from(self.end.column - self.start.column + 1)
    }

    pub fn iter_rows(&self) -> std::ops::RangeInclusive<u32> {
        self.start.row..=self.end.row
    }

    pub fn iter_columns(&self) -> std::ops::RangeInclusive<u16> {
        self.start.column..=self.end.column
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CellAlign {
    #[default]
    General,
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NumFormat {
    #[default]
    General,
    Number,
    Currency,
    Percentage,
    Date,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CellStyle {
    pub bold: bool,
    pub italic: bool,
    pub text_color: Option<[u8; 3]>,
    pub bg_color: Option<[u8; 3]>,
    pub align: CellAlign,
    pub num_format: NumFormat,
}

impl CellStyle {
    pub fn is_default(&self) -> bool {
        !self.bold
            && !self.italic
            && self.text_color.is_none()
            && self.bg_color.is_none()
            && self.align == CellAlign::General
            && self.num_format == NumFormat::General
    }
}

pub fn format_excel_date(serial: f64) -> String {
    let days = serial.floor() as i64;
    if days <= 0 {
        return "1900-01-01".into();
    }
    let z = days + 2415019;
    let a = z + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - (146097 * b) / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - (1461 * d) / 4;
    let m = (5 * e + 2) / 153;
    let day = e - (153 * m + 2) / 5 + 1;
    let month = m + 3 - 12 * (m / 10);
    let year = 100 * b + d - 4800 + (m / 10);
    format!("{year:04}-{month:02}-{day:02}")
}

#[derive(Debug, Clone, PartialEq)]
pub enum CellValue {
    Blank,
    Text(String),
    Number(f64),
    Boolean(bool),
    Formula(String),
    Error(String),
}

impl CellValue {
    pub fn display_text(&self) -> String {
        match self {
            Self::Blank => String::new(),
            Self::Text(value) | Self::Error(value) => value.clone(),
            Self::Formula(value) => format!("={value}"),
            Self::Number(value) if value.is_finite() => {
                let mut text = value.to_string();
                if text.ends_with(".0") {
                    text.truncate(text.len() - 2);
                }
                text
            }
            Self::Number(_) => "#NUM!".to_string(),
            Self::Boolean(value) => if *value { "TRUE" } else { "FALSE" }.to_string(),
        }
    }

    pub fn format_display(&self, num_format: NumFormat) -> String {
        match (self, num_format) {
            (Self::Number(n), NumFormat::Number) => format!("{:.2}", n),
            (Self::Number(n), NumFormat::Currency) => format!("${:.2}", n),
            (Self::Number(n), NumFormat::Percentage) => format!("{:.2}%", n * 100.0),
            (Self::Number(n), NumFormat::Date) => format_excel_date(*n),
            _ => self.display_text(),
        }
    }

    pub fn from_input(input: &str) -> Self {
        if let Some(formula) = input.strip_prefix('=') {
            return Self::Formula(formula.to_string());
        }
        if input.is_empty() {
            return Self::Blank;
        }
        if let Ok(number) = input.parse::<f64>() {
            if number.is_finite() {
                return Self::Number(number);
            }
        }
        match input.to_ascii_uppercase().as_str() {
            "TRUE" => Self::Boolean(true),
            "FALSE" => Self::Boolean(false),
            _ => Self::Text(input.to_string()),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Sheet {
    pub name: String,
    cells: BTreeMap<CellAddress, CellValue>,
    styles: BTreeMap<CellAddress, CellStyle>,
}

impl Sheet {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            cells: BTreeMap::new(),
            styles: BTreeMap::new(),
        }
    }

    pub fn get(&self, address: CellAddress) -> &CellValue {
        self.cells.get(&address).unwrap_or(&CellValue::Blank)
    }

    pub fn set(&mut self, address: CellAddress, value: CellValue) {
        if value == CellValue::Blank {
            self.cells.remove(&address);
        } else {
            self.cells.insert(address, value);
        }
    }

    pub fn get_style(&self, address: CellAddress) -> Option<&CellStyle> {
        self.styles.get(&address)
    }

    pub fn set_style(&mut self, address: CellAddress, style: CellStyle) {
        if style.is_default() {
            self.styles.remove(&address);
        } else {
            self.styles.insert(address, style);
        }
    }

    pub fn styles(&self) -> impl Iterator<Item = (CellAddress, &CellStyle)> {
        self.styles.iter().map(|(address, style)| (*address, style))
    }

    pub fn cells(&self) -> impl Iterator<Item = (CellAddress, &CellValue)> {
        self.cells.iter().map(|(address, value)| (*address, value))
    }

    pub fn used_range(&self) -> Option<CellRange> {
        let mut iter = self.cells.keys();
        let first = *iter.next()?;
        let (mut min_row, mut max_row, mut min_col, mut max_col) = (first.row, first.row, first.column, first.column);
        for address in iter {
            min_row = min_row.min(address.row);
            max_row = max_row.max(address.row);
            min_col = min_col.min(address.column);
            max_col = max_col.max(address.column);
        }
        Some(CellRange {
            start: CellAddress {
                row: min_row,
                column: min_col,
            },
            end: CellAddress {
                row: max_row,
                column: max_col,
            },
        })
    }

    pub fn populated_cell_count(&self) -> usize {
        self.cells.len()
    }

    pub fn insert_row(&mut self, row: u32) {
        let mut new_cells = BTreeMap::new();
        for (addr, val) in std::mem::take(&mut self.cells) {
            if addr.row >= row && addr.row < MAX_ROWS {
                new_cells.insert(
                    CellAddress {
                        row: addr.row + 1,
                        column: addr.column,
                    },
                    val,
                );
            } else if addr.row < row {
                new_cells.insert(addr, val);
            }
        }
        self.cells = new_cells;

        let mut new_styles = BTreeMap::new();
        for (addr, style) in std::mem::take(&mut self.styles) {
            if addr.row >= row && addr.row < MAX_ROWS {
                new_styles.insert(
                    CellAddress {
                        row: addr.row + 1,
                        column: addr.column,
                    },
                    style,
                );
            } else if addr.row < row {
                new_styles.insert(addr, style);
            }
        }
        self.styles = new_styles;
    }

    pub fn delete_row(&mut self, row: u32) {
        let mut new_cells = BTreeMap::new();
        for (addr, val) in std::mem::take(&mut self.cells) {
            if addr.row > row {
                new_cells.insert(
                    CellAddress {
                        row: addr.row - 1,
                        column: addr.column,
                    },
                    val,
                );
            } else if addr.row < row {
                new_cells.insert(addr, val);
            }
        }
        self.cells = new_cells;

        let mut new_styles = BTreeMap::new();
        for (addr, style) in std::mem::take(&mut self.styles) {
            if addr.row > row {
                new_styles.insert(
                    CellAddress {
                        row: addr.row - 1,
                        column: addr.column,
                    },
                    style,
                );
            } else if addr.row < row {
                new_styles.insert(addr, style);
            }
        }
        self.styles = new_styles;
    }

    pub fn insert_column(&mut self, column: u16) {
        let mut new_cells = BTreeMap::new();
        for (addr, val) in std::mem::take(&mut self.cells) {
            if addr.column >= column && addr.column < MAX_COLUMNS {
                new_cells.insert(
                    CellAddress {
                        row: addr.row,
                        column: addr.column + 1,
                    },
                    val,
                );
            } else if addr.column < column {
                new_cells.insert(addr, val);
            }
        }
        self.cells = new_cells;

        let mut new_styles = BTreeMap::new();
        for (addr, style) in std::mem::take(&mut self.styles) {
            if addr.column >= column && addr.column < MAX_COLUMNS {
                new_styles.insert(
                    CellAddress {
                        row: addr.row,
                        column: addr.column + 1,
                    },
                    style,
                );
            } else if addr.column < column {
                new_styles.insert(addr, style);
            }
        }
        self.styles = new_styles;
    }

    pub fn delete_column(&mut self, column: u16) {
        let mut new_cells = BTreeMap::new();
        for (addr, val) in std::mem::take(&mut self.cells) {
            if addr.column > column {
                new_cells.insert(
                    CellAddress {
                        row: addr.row,
                        column: addr.column - 1,
                    },
                    val,
                );
            } else if addr.column < column {
                new_cells.insert(addr, val);
            }
        }
        self.cells = new_cells;

        let mut new_styles = BTreeMap::new();
        for (addr, style) in std::mem::take(&mut self.styles) {
            if addr.column > column {
                new_styles.insert(
                    CellAddress {
                        row: addr.row,
                        column: addr.column - 1,
                    },
                    style,
                );
            } else if addr.column < column {
                new_styles.insert(addr, style);
            }
        }
        self.styles = new_styles;
    }

    pub fn clear_range(&mut self, range: CellRange) {
        for row in range.start.row..=range.end.row {
            for column in range.start.column..=range.end.column {
                let addr = CellAddress { row, column };
                self.cells.remove(&addr);
                self.styles.remove(&addr);
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct Workbook {
    pub sheets: Vec<Sheet>,
    pub active_sheet: usize,
    pub file_path: Option<PathBuf>,
    pub dirty: bool,
    pub preservation_warnings: Vec<String>,
}

impl Default for Workbook {
    fn default() -> Self {
        Self {
            sheets: vec![Sheet::new("Sheet1")],
            active_sheet: 0,
            file_path: None,
            dirty: false,
            preservation_warnings: Vec::new(),
        }
    }
}

impl Workbook {
    pub fn add_sheet(&mut self, requested_name: &str) -> usize {
        let base = sanitize_sheet_name(requested_name);
        let mut name = base.clone();
        let mut suffix = 2_u32;
        while self.sheets.iter().any(|sheet| sheet.name.eq_ignore_ascii_case(&name)) {
            name = format!("{base}{suffix}");
            suffix += 1;
        }
        self.sheets.push(Sheet::new(name));
        self.sheets.len() - 1
    }

    pub fn active(&self) -> &Sheet {
        &self.sheets[self.active_sheet.min(self.sheets.len() - 1)]
    }
    pub fn active_mut(&mut self) -> &mut Sheet {
        let index = self.active_sheet.min(self.sheets.len() - 1);
        &mut self.sheets[index]
    }

    pub fn find_sheet(&self, name: &str) -> Option<usize> {
        let name_trimmed = name.trim().trim_matches('\'');
        self.sheets
            .iter()
            .position(|s| s.name.eq_ignore_ascii_case(name_trimmed))
    }

    pub fn rename_sheet(&mut self, index: usize, new_name: &str) -> Result<(), String> {
        if index >= self.sheets.len() {
            return Err("Chỉ mục sheet không hợp lệ".into());
        }
        let sanitized = sanitize_sheet_name(new_name);
        if sanitized.is_empty() {
            return Err("Tên sheet không được để trống".into());
        }
        if self
            .sheets
            .iter()
            .enumerate()
            .any(|(i, s)| i != index && s.name.eq_ignore_ascii_case(&sanitized))
        {
            return Err("Tên sheet đã tồn tại".into());
        }
        self.sheets[index].name = sanitized;
        self.dirty = true;
        Ok(())
    }

    pub fn delete_sheet(&mut self, index: usize) -> Result<(), String> {
        if self.sheets.len() <= 1 {
            return Err("Không thể xóa sheet duy nhất trong bảng tính".into());
        }
        if index >= self.sheets.len() {
            return Err("Chỉ mục sheet không hợp lệ".into());
        }
        self.sheets.remove(index);
        if self.active_sheet >= self.sheets.len() {
            self.active_sheet = self.sheets.len() - 1;
        }
        self.dirty = true;
        Ok(())
    }
}

pub fn export_tsv(sheet: &Sheet, range: CellRange) -> String {
    let mut output = String::new();
    for row in range.start.row..=range.end.row {
        for col in range.start.column..=range.end.column {
            if col > range.start.column {
                output.push('\t');
            }
            let val = sheet.get(CellAddress { row, column: col });
            output.push_str(&val.display_text());
        }
        if row < range.end.row {
            output.push_str("\r\n");
        }
    }
    output
}

pub fn import_tsv(tsv: &str) -> Vec<Vec<CellValue>> {
    let mut grid = Vec::new();
    for line in tsv.lines() {
        let row: Vec<CellValue> = line.split('\t').map(CellValue::from_input).collect();
        grid.push(row);
    }
    grid
}

fn sanitize_sheet_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '[' | ']' | ':' | '*' | '?' | '/' | '\\'))
        .take(31)
        .collect();
    if cleaned.is_empty() {
        "Sheet".to_string()
    } else {
        cleaned
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CsvError {
    #[error("CSV không hợp lệ: dấu ngoặc kép chưa được đóng")]
    UnclosedQuote,
    #[error("CSV vượt giới hạn 1.048.576 hàng")]
    TooManyRows,
    #[error("CSV vượt giới hạn 16.384 cột")]
    TooManyColumns,
    #[error("Vùng xuất CSV quá lớn; hãy chia nhỏ dữ liệu trước khi xuất")]
    ExportTooLarge,
}

pub fn parse_csv(input: &str) -> Result<Sheet, CsvError> {
    let mut sheet = Sheet::new("Sheet1");
    let mut row = 1_u32;
    let mut column = 1_u32;
    let mut field = String::new();
    let mut chars = input.chars().peekable();
    let mut quoted = false;
    let mut was_quoted = false;
    while let Some(ch) = chars.next() {
        if quoted {
            match ch {
                '"' if chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => quoted = false,
                _ => field.push(ch),
            }
            continue;
        }
        match ch {
            '"' if field.is_empty() && !was_quoted => {
                quoted = true;
                was_quoted = true;
            }
            ',' => {
                store_csv_field(&mut sheet, row, column, &field);
                field.clear();
                if column >= u32::from(MAX_COLUMNS) {
                    return Err(CsvError::TooManyColumns);
                }
                column += 1;
                was_quoted = false;
            }
            '\n' | '\r' => {
                if ch == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                store_csv_field(&mut sheet, row, column, &field);
                field.clear();
                if row == MAX_ROWS {
                    if chars.peek().is_some() {
                        return Err(CsvError::TooManyRows);
                    }
                } else {
                    row += 1;
                }
                column = 1;
                was_quoted = false;
            }
            _ => field.push(ch),
        }
    }
    if quoted {
        return Err(CsvError::UnclosedQuote);
    }
    if !field.is_empty() || column > 1 || was_quoted {
        store_csv_field(&mut sheet, row, column, &field);
    }
    Ok(sheet)
}

fn store_csv_field(sheet: &mut Sheet, row: u32, column: u32, field: &str) {
    if column <= u32::from(MAX_COLUMNS) {
        if let Ok(address) = CellAddress::new(row, column as u16) {
            sheet.set(address, CellValue::from_input(field));
        }
    }
}

pub fn write_csv(sheet: &Sheet) -> Result<String, CsvError> {
    let Some(range) = sheet.used_range() else {
        return Ok(String::new());
    };
    let cell_count =
        u64::from(range.end.row - range.start.row + 1) * u64::from(range.end.column - range.start.column + 1);
    if cell_count > 5_000_000 {
        return Err(CsvError::ExportTooLarge);
    }
    let mut output = String::new();
    for row in range.start.row..=range.end.row {
        for column in range.start.column..=range.end.column {
            if column > range.start.column {
                output.push(',');
            }
            let text = sheet.get(CellAddress { row, column }).display_text();
            if text.contains([',', '"', '\r', '\n']) {
                output.push('"');
                output.push_str(&text.replace('"', "\"\""));
                output.push('"');
            } else {
                output.push_str(&text);
            }
        }
        if row < range.end.row {
            output.push_str("\r\n");
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_excel_address_boundaries() {
        assert_eq!(
            CellAddress::parse("$XFD$1048576").unwrap(),
            CellAddress {
                row: MAX_ROWS,
                column: MAX_COLUMNS
            }
        );
        assert_eq!(CellAddress::parse("aa10").unwrap().to_string(), "AA10");
        assert_eq!(column_index("XFD").unwrap(), MAX_COLUMNS);
        assert!(CellAddress::parse("XFE1").is_err());
        assert!(CellAddress::parse("A1$").is_err());
    }

    #[test]
    fn sparse_sheet_tracks_only_populated_cells() {
        let mut sheet = Sheet::new("Data");
        sheet.set(CellAddress::parse("B2").unwrap(), CellValue::Text("x".into()));
        sheet.set(CellAddress::parse("XFD1048576").unwrap(), CellValue::Number(1.0));
        assert_eq!(sheet.populated_cell_count(), 2);
        assert_eq!(sheet.used_range().unwrap().end.row, MAX_ROWS);
    }

    #[test]
    fn csv_round_trip_quotes_and_preserves_vietnamese() {
        let source = "Tên,Giá\r\n\"Bàn, ghế\",\"1.200\"\r\n\"Tiếng Việt \"\"đẹp\"\"\",42";
        let sheet = parse_csv(source).unwrap();
        let output = write_csv(&sheet).unwrap();
        let reread = parse_csv(&output).unwrap();
        assert_eq!(
            reread.get(CellAddress::parse("A2").unwrap()),
            &CellValue::Text("Bàn, ghế".into())
        );
        assert_eq!(
            reread.get(CellAddress::parse("A3").unwrap()),
            &CellValue::Text("Tiếng Việt \"đẹp\"".into())
        );
    }

    #[test]
    fn sheet_names_are_unique_and_valid() {
        let mut book = Workbook::default();
        book.add_sheet("Sheet1");
        book.add_sheet("Bad/Name");
        assert_eq!(book.sheets[1].name, "Sheet12");
        assert_eq!(book.sheets[2].name, "BadName");
    }

    #[test]
    fn cell_styles_and_formatting() {
        let mut sheet = Sheet::new("StyleSheet");
        let a1 = CellAddress::parse("A1").unwrap();
        let style = CellStyle {
            bold: true,
            italic: false,
            text_color: Some([255, 0, 0]),
            bg_color: Some([255, 255, 0]),
            align: CellAlign::Center,
            num_format: NumFormat::Currency,
        };
        sheet.set_style(a1, style.clone());
        sheet.set(a1, CellValue::Number(1250.5));
        assert_eq!(sheet.get_style(a1), Some(&style));
        assert_eq!(sheet.get(a1).format_display(NumFormat::Currency), "$1250.50");
        assert_eq!(sheet.get(a1).format_display(NumFormat::Number), "1250.50");
        assert_eq!(sheet.get(a1).format_display(NumFormat::Percentage), "125050.00%");
    }

    #[test]
    fn row_and_column_insert_delete() {
        let mut sheet = Sheet::new("Table");
        let a1 = CellAddress::parse("A1").unwrap();
        let a2 = CellAddress::parse("A2").unwrap();
        let b1 = CellAddress::parse("B1").unwrap();
        sheet.set(a1, CellValue::Number(10.0));
        sheet.set(a2, CellValue::Number(20.0));
        sheet.set(b1, CellValue::Number(30.0));

        // Insert row at 2 -> A2 moves to A3
        sheet.insert_row(2);
        assert_eq!(sheet.get(CellAddress::parse("A1").unwrap()), &CellValue::Number(10.0));
        assert_eq!(sheet.get(CellAddress::parse("A2").unwrap()), &CellValue::Blank);
        assert_eq!(sheet.get(CellAddress::parse("A3").unwrap()), &CellValue::Number(20.0));

        // Delete row at 2 -> A3 moves back to A2
        sheet.delete_row(2);
        assert_eq!(sheet.get(CellAddress::parse("A2").unwrap()), &CellValue::Number(20.0));

        // Insert column at 2 (B) -> B1 moves to C1
        sheet.insert_column(2);
        assert_eq!(sheet.get(CellAddress::parse("C1").unwrap()), &CellValue::Number(30.0));
        assert_eq!(sheet.get(CellAddress::parse("B1").unwrap()), &CellValue::Blank);

        // Delete column at 2 -> C1 moves back to B1
        sheet.delete_column(2);
        assert_eq!(sheet.get(CellAddress::parse("B1").unwrap()), &CellValue::Number(30.0));
    }

    #[test]
    fn tsv_export_and_import() {
        let mut sheet = Sheet::new("TSV");
        sheet.set(CellAddress::parse("A1").unwrap(), CellValue::Text("Mã".into()));
        sheet.set(CellAddress::parse("B1").unwrap(), CellValue::Text("Giá".into()));
        sheet.set(CellAddress::parse("A2").unwrap(), CellValue::Text("SP01".into()));
        sheet.set(CellAddress::parse("B2").unwrap(), CellValue::Number(500.0));

        let tsv = export_tsv(&sheet, CellRange::parse("A1:B2").unwrap());
        let imported = import_tsv(&tsv);
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0][0], CellValue::Text("Mã".into()));
        assert_eq!(imported[1][1], CellValue::Number(500.0));
    }
}
