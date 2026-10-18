use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use nom_workbook::{CellAddress, CellAlign, CellStyle, CellValue, NumFormat, Sheet, Workbook};
use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;
use thiserror::Error;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_XML_BYTES: u64 = 64 * 1024 * 1024;
const MAX_WORKSHEETS: usize = 256;
const MAX_CELLS_PER_SHEET: usize = 1_000_000;

#[derive(Debug, Error)]
pub enum XlsxError {
    #[error("Không thể đọc hoặc ghi file: {0}")]
    Io(#[from] std::io::Error),
    #[error("Gói XLSX không hợp lệ: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("XML XLSX không hợp lệ: {0}")]
    Xml(String),
    #[error("Workbook vượt giới hạn an toàn: {0}")]
    Limit(String),
    #[error("Địa chỉ ô không hợp lệ: {0}")]
    Address(#[from] nom_workbook::AddressError),
    #[error("Workbook không có worksheet hợp lệ")]
    NoWorksheets,
}

pub fn load(path: impl AsRef<Path>) -> Result<Workbook, XlsxError> {
    let file = File::open(path.as_ref())?;
    let mut archive = ZipArchive::new(file)?;
    let workbook_xml = read_entry(&mut archive, "xl/workbook.xml")?;
    let rels_xml = read_entry(&mut archive, "xl/_rels/workbook.xml.rels")?;
    let relationships = parse_relationships(&rels_xml)?;
    let sheet_specs = parse_sheet_specs(&workbook_xml)?;
    if sheet_specs.is_empty() {
        return Err(XlsxError::NoWorksheets);
    }
    if sheet_specs.len() > MAX_WORKSHEETS {
        return Err(XlsxError::Limit("quá 256 worksheet".into()));
    }

    let shared_strings = match read_entry(&mut archive, "xl/sharedStrings.xml") {
        Ok(xml) => parse_shared_strings(&xml)?,
        Err(XlsxError::Zip(zip::result::ZipError::FileNotFound)) => Vec::new(),
        Err(error) => return Err(error),
    };
    let styles = match read_entry(&mut archive, "xl/styles.xml") {
        Ok(xml) => parse_styles(&xml)?,
        Err(_) => Vec::new(),
    };
    let mut workbook = Workbook::default();
    workbook.sheets.clear();
    for (name, relationship_id) in sheet_specs {
        let target = relationships
            .get(&relationship_id)
            .ok_or_else(|| XlsxError::Xml(format!("Thiếu relationship {relationship_id}")))?;
        let entry = normalize_sheet_target(target)?;
        let xml = read_entry(&mut archive, &entry)?;
        workbook
            .sheets
            .push(parse_worksheet(&name, &xml, &shared_strings, &styles)?);
    }
    if workbook.sheets.is_empty() {
        return Err(XlsxError::NoWorksheets);
    }
    workbook.active_sheet = 0;
    workbook.file_path = Some(path.as_ref().to_path_buf());
    workbook.dirty = false;
    workbook.preservation_warnings.push(
        "Các thành phần chưa hỗ trợ (biểu đồ, bảng nâng cao, macro, liên kết ngoài và metadata) không được giữ lại khi lưu lại.".into(),
    );
    Ok(workbook)
}

pub fn save(path: impl AsRef<Path>, workbook: &Workbook) -> Result<(), XlsxError> {
    if workbook.sheets.is_empty() {
        return Err(XlsxError::NoWorksheets);
    }
    if workbook.sheets.len() > MAX_WORKSHEETS {
        return Err(XlsxError::Limit("quá 256 worksheet".into()));
    }
    let path = path.as_ref();
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("workbook.xlsx");
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    let result = write_package(&temp_path, workbook);
    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(XlsxError::Io(error));
    }
    Ok(())
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<String, XlsxError> {
    let entry = archive.by_name(name)?;
    if entry.size() > MAX_XML_BYTES {
        return Err(XlsxError::Limit(format!("{name} quá lớn")));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.take(MAX_XML_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_XML_BYTES {
        return Err(XlsxError::Limit(format!("{name} quá lớn")));
    }
    String::from_utf8(bytes).map_err(|error| XlsxError::Xml(format!("{name} không phải UTF-8: {error}")))
}

fn attr_value(
    event: &BytesStart<'_>,
    name: &[u8],
    decoder: quick_xml::encoding::Decoder,
) -> Result<Option<String>, XlsxError> {
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.map_err(|error| XlsxError::Xml(error.to_string()))?;
        if attribute.key.as_ref() == name {
            return attribute
                .decoded_and_normalized_value(quick_xml::XmlVersion::Implicit1_0, decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| XlsxError::Xml(error.to_string()));
        }
    }
    Ok(None)
}

fn parse_relationships(xml: &str) -> Result<HashMap<String, String>, XlsxError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut relationships = HashMap::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event) | Event::Empty(event)) if event.local_name().as_ref() == b"Relationship" => {
                let id = attr_value(&event, b"Id", reader.decoder())?;
                let target = attr_value(&event, b"Target", reader.decoder())?;
                if let (Some(id), Some(target)) = (id, target) {
                    relationships.insert(id, target);
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(XlsxError::Xml(error.to_string())),
            _ => {}
        }
    }
    Ok(relationships)
}

fn parse_sheet_specs(xml: &str) -> Result<Vec<(String, String)>, XlsxError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut sheets = Vec::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event) | Event::Empty(event)) if event.local_name().as_ref() == b"sheet" => {
                let name = attr_value(&event, b"name", reader.decoder())?;
                let id = attr_value(&event, b"r:id", reader.decoder())?;
                if let (Some(name), Some(id)) = (name, id) {
                    sheets.push((name, id));
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(XlsxError::Xml(error.to_string())),
            _ => {}
        }
    }
    Ok(sheets)
}

fn normalize_sheet_target(target: &str) -> Result<String, XlsxError> {
    let normalized = target.trim_start_matches('/');
    let full = if normalized.starts_with("xl/") {
        normalized.to_string()
    } else {
        format!("xl/{normalized}")
    };
    if full.split('/').any(|part| part == "..") || !full.starts_with("xl/worksheets/") {
        return Err(XlsxError::Xml(
            "worksheet relationship nằm ngoài thư mục worksheets".into(),
        ));
    }
    Ok(full)
}

fn parse_shared_strings(xml: &str) -> Result<Vec<String>, XlsxError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut values = Vec::new();
    let mut in_item = false;
    let mut in_text = false;
    let mut current = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => match event.local_name().as_ref() {
                b"si" => {
                    in_item = true;
                    current.clear();
                }
                b"t" if in_item => in_text = true,
                _ => {}
            },
            Ok(Event::Empty(event)) if event.local_name().as_ref() == b"t" && in_item => {}
            Ok(Event::Text(event)) if in_text => current.push_str(&decode_text(
                event.decode().map_err(|e| XlsxError::Xml(e.to_string()))?.as_ref(),
            )?),
            Ok(Event::GeneralRef(event)) if in_text => current.push_str(&decode_reference(&event)?),
            Ok(Event::End(event)) => match event.local_name().as_ref() {
                b"t" => in_text = false,
                b"si" => {
                    values.push(std::mem::take(&mut current));
                    in_item = false;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => return Err(XlsxError::Xml(error.to_string())),
            _ => {}
        }
    }
    Ok(values)
}

fn parse_worksheet(name: &str, xml: &str, shared_strings: &[String], styles: &[CellStyle]) -> Result<Sheet, XlsxError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut sheet = Sheet::new(name);
    let mut current_cell: Option<(CellAddress, String, Option<String>, String, Option<usize>)> = None;
    let mut active_field: Option<u8> = None; // 1=formula, 2=value, 3=inline/shared text
    let mut count = 0;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => match event.local_name().as_ref() {
                b"c" => {
                    let Some(reference) = attr_value(&event, b"r", reader.decoder())? else {
                        continue;
                    };
                    let address = CellAddress::parse(&reference)?;
                    let kind = attr_value(&event, b"t", reader.decoder())?.unwrap_or_default();
                    let style_idx = attr_value(&event, b"s", reader.decoder())?.and_then(|s| s.parse::<usize>().ok());
                    current_cell = Some((address, kind, None, String::new(), style_idx));
                }
                b"f" if current_cell.is_some() => active_field = Some(1),
                b"v" if current_cell.is_some() => active_field = Some(2),
                b"t" if current_cell.is_some() => active_field = Some(3),
                _ => {}
            },
            Ok(Event::Empty(event)) if event.local_name().as_ref() == b"c" => {
                if let Some(reference) = attr_value(&event, b"r", reader.decoder())? {
                    let address = CellAddress::parse(&reference)?;
                    let kind = attr_value(&event, b"t", reader.decoder())?.unwrap_or_default();
                    let style_idx = attr_value(&event, b"s", reader.decoder())?.and_then(|s| s.parse::<usize>().ok());
                    current_cell = Some((address, kind, None, String::new(), style_idx));
                    commit_cell(&mut sheet, current_cell.take(), shared_strings, styles)?;
                    count += 1;
                }
            }
            Ok(Event::Text(event)) if active_field.is_some() => {
                if let Some(cell) = current_cell.as_mut() {
                    let value = decode_text(event.decode().map_err(|e| XlsxError::Xml(e.to_string()))?.as_ref())?;
                    match active_field {
                        Some(1) => cell.2 = Some(value),
                        _ => cell.3.push_str(&value),
                    }
                }
            }
            Ok(Event::GeneralRef(event)) if active_field.is_some() => {
                if let Some(cell) = current_cell.as_mut() {
                    let value = decode_reference(&event)?;
                    match active_field {
                        Some(1) => cell.2.get_or_insert_with(String::new).push_str(&value),
                        _ => cell.3.push_str(&value),
                    }
                }
            }
            Ok(Event::End(event)) => match event.local_name().as_ref() {
                b"f" | b"v" | b"t" => active_field = None,
                b"c" => {
                    commit_cell(&mut sheet, current_cell.take(), shared_strings, styles)?;
                    count += 1;
                    if count > MAX_CELLS_PER_SHEET {
                        return Err(XlsxError::Limit(format!("worksheet {name} có quá nhiều ô")));
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => return Err(XlsxError::Xml(error.to_string())),
            _ => {}
        }
    }
    Ok(sheet)
}

fn commit_cell(
    sheet: &mut Sheet,
    cell: Option<(CellAddress, String, Option<String>, String, Option<usize>)>,
    shared_strings: &[String],
    styles: &[CellStyle],
) -> Result<(), XlsxError> {
    let Some((address, kind, formula, raw, style_idx)) = cell else {
        return Ok(());
    };
    let value = if let Some(formula) = formula {
        CellValue::Formula(formula)
    } else {
        match kind.as_str() {
            "inlineStr" | "str" => CellValue::Text(raw),
            "s" => {
                let index = raw
                    .parse::<usize>()
                    .map_err(|_| XlsxError::Xml("shared string index sai".into()))?;
                CellValue::Text(
                    shared_strings
                        .get(index)
                        .cloned()
                        .ok_or_else(|| XlsxError::Xml("shared string index vượt giới hạn".into()))?,
                )
            }
            "b" => CellValue::Boolean(raw == "1"),
            "e" => CellValue::Error(raw),
            _ if raw.is_empty() => CellValue::Blank,
            _ => match raw.parse::<f64>() {
                Ok(number) if number.is_finite() => CellValue::Number(number),
                _ => CellValue::Text(raw),
            },
        }
    };
    sheet.set(address, value);
    if let Some(idx) = style_idx {
        if let Some(style) = styles.get(idx) {
            if !style.is_default() {
                sheet.set_style(address, style.clone());
            }
        }
    }
    Ok(())
}

fn decode_text(input: &str) -> Result<String, XlsxError> {
    Ok(input.to_string())
}

fn decode_reference(reference: &quick_xml::events::BytesRef<'_>) -> Result<String, XlsxError> {
    let name = std::str::from_utf8(reference.as_ref()).map_err(|error| XlsxError::Xml(error.to_string()))?;
    if let Some(code) = name.strip_prefix("#x") {
        return char::from_u32(u32::from_str_radix(code, 16).map_err(|e| XlsxError::Xml(e.to_string()))?)
            .map(|value| value.to_string())
            .ok_or_else(|| XlsxError::Xml("XML character reference không hợp lệ".into()));
    }
    if let Some(code) = name.strip_prefix('#') {
        return char::from_u32(
            code.parse()
                .map_err(|e: std::num::ParseIntError| XlsxError::Xml(e.to_string()))?,
        )
        .map(|value| value.to_string())
        .ok_or_else(|| XlsxError::Xml("XML character reference không hợp lệ".into()));
    }
    match name {
        "amp" => Ok("&".into()),
        "lt" => Ok("<".into()),
        "gt" => Ok(">".into()),
        "quot" => Ok("\"".into()),
        "apos" => Ok("'".into()),
        _ => Err(XlsxError::Xml(format!("XML entity không hỗ trợ: &{name};"))),
    }
}

fn parse_hex_rgb(hex: &str) -> Option<[u8; 3]> {
    let clean = hex.trim();
    if clean.len() == 8 {
        let r = u8::from_str_radix(&clean[2..4], 16).ok()?;
        let g = u8::from_str_radix(&clean[4..6], 16).ok()?;
        let b = u8::from_str_radix(&clean[6..8], 16).ok()?;
        Some([r, g, b])
    } else if clean.len() == 6 {
        let r = u8::from_str_radix(&clean[0..2], 16).ok()?;
        let g = u8::from_str_radix(&clean[2..4], 16).ok()?;
        let b = u8::from_str_radix(&clean[4..6], 16).ok()?;
        Some([r, g, b])
    } else {
        None
    }
}

#[derive(Debug, Clone, Default)]
struct ParsedFont {
    bold: bool,
    italic: bool,
    color: Option<[u8; 3]>,
}

#[derive(Debug, Clone, Default)]
struct ParsedFill {
    bg_color: Option<[u8; 3]>,
}

fn parse_styles(xml: &str) -> Result<Vec<CellStyle>, XlsxError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut fonts = Vec::new();
    let mut fills = Vec::new();
    let mut cell_xfs = Vec::new();

    let mut in_fonts = false;
    let mut in_font = false;
    let mut cur_font = ParsedFont::default();

    let mut in_fills = false;
    let mut in_fill = false;
    let mut cur_fill = ParsedFill::default();

    let mut in_cell_xfs = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => match event.local_name().as_ref() {
                b"fonts" => in_fonts = true,
                b"font" if in_fonts => {
                    in_font = true;
                    cur_font = ParsedFont::default();
                }
                b"b" if in_font => cur_font.bold = true,
                b"i" if in_font => cur_font.italic = true,
                b"color" if in_font => {
                    if let Some(rgb) = attr_value(&event, b"rgb", reader.decoder())? {
                        cur_font.color = parse_hex_rgb(&rgb);
                    }
                }
                b"fills" => in_fills = true,
                b"fill" if in_fills => {
                    in_fill = true;
                    cur_fill = ParsedFill::default();
                }
                b"fgColor" if in_fill => {
                    if let Some(rgb) = attr_value(&event, b"rgb", reader.decoder())? {
                        cur_fill.bg_color = parse_hex_rgb(&rgb);
                    }
                }
                b"cellXfs" => in_cell_xfs = true,
                b"xf" if in_cell_xfs => {
                    let font_id: usize = attr_value(&event, b"fontId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    let fill_id: usize = attr_value(&event, b"fillId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    let num_fmt_id: u32 = attr_value(&event, b"numFmtId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    cell_xfs.push((font_id, fill_id, num_fmt_id, CellAlign::General));
                }
                b"alignment" if in_cell_xfs => {
                    if let Some((_, _, _, align)) = cell_xfs.last_mut() {
                        if let Some(horiz) = attr_value(&event, b"horizontal", reader.decoder())? {
                            *align = match horiz.as_str() {
                                "left" => CellAlign::Left,
                                "center" => CellAlign::Center,
                                "right" => CellAlign::Right,
                                _ => CellAlign::General,
                            };
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::Empty(event)) => match event.local_name().as_ref() {
                b"b" if in_font => cur_font.bold = true,
                b"i" if in_font => cur_font.italic = true,
                b"color" if in_font => {
                    if let Some(rgb) = attr_value(&event, b"rgb", reader.decoder())? {
                        cur_font.color = parse_hex_rgb(&rgb);
                    }
                }
                b"fgColor" if in_fill => {
                    if let Some(rgb) = attr_value(&event, b"rgb", reader.decoder())? {
                        cur_fill.bg_color = parse_hex_rgb(&rgb);
                    }
                }
                b"xf" if in_cell_xfs => {
                    let font_id: usize = attr_value(&event, b"fontId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    let fill_id: usize = attr_value(&event, b"fillId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    let num_fmt_id: u32 = attr_value(&event, b"numFmtId", reader.decoder())?
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    cell_xfs.push((font_id, fill_id, num_fmt_id, CellAlign::General));
                }
                b"alignment" if in_cell_xfs => {
                    if let Some((_, _, _, align)) = cell_xfs.last_mut() {
                        if let Some(horiz) = attr_value(&event, b"horizontal", reader.decoder())? {
                            *align = match horiz.as_str() {
                                "left" => CellAlign::Left,
                                "center" => CellAlign::Center,
                                "right" => CellAlign::Right,
                                _ => CellAlign::General,
                            };
                        }
                    }
                }
                _ => {}
            },
            Ok(Event::End(event)) => match event.local_name().as_ref() {
                b"fonts" => in_fonts = false,
                b"font" if in_fonts => {
                    fonts.push(std::mem::take(&mut cur_font));
                    in_font = false;
                }
                b"fills" => in_fills = false,
                b"fill" if in_fills => {
                    fills.push(std::mem::take(&mut cur_fill));
                    in_fill = false;
                }
                b"cellXfs" => in_cell_xfs = false,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(error) => return Err(XlsxError::Xml(error.to_string())),
            _ => {}
        }
    }

    let mut styles = Vec::new();
    for (font_id, fill_id, num_fmt_id, align) in cell_xfs {
        let font = fonts.get(font_id);
        let fill = fills.get(fill_id);
        let num_format = match num_fmt_id {
            1..=4 => NumFormat::Number,
            5..=8 | 44 | 164 => NumFormat::Currency,
            9 | 10 => NumFormat::Percentage,
            14..=17 | 22 => NumFormat::Date,
            _ => NumFormat::General,
        };
        styles.push(CellStyle {
            bold: font.map(|f| f.bold).unwrap_or(false),
            italic: font.map(|f| f.italic).unwrap_or(false),
            text_color: font.and_then(|f| f.color),
            bg_color: fill.and_then(|f| f.bg_color),
            align,
            num_format,
        });
    }

    Ok(styles)
}

struct StyleRegistry {
    styles: Vec<CellStyle>,
}

impl StyleRegistry {
    fn new(workbook: &Workbook) -> Self {
        let mut styles = vec![CellStyle::default()];
        for sheet in &workbook.sheets {
            for (_, style) in sheet.styles() {
                if !style.is_default() && !styles.contains(style) {
                    styles.push(style.clone());
                }
            }
        }
        Self { styles }
    }

    fn index_of(&self, style: &CellStyle) -> usize {
        self.styles.iter().position(|s| s == style).unwrap_or(0)
    }

    fn to_styles_xml(&self) -> String {
        let mut fonts: Vec<(bool, bool, Option<[u8; 3]>)> = vec![(false, false, None)];
        let mut fills: Vec<Option<[u8; 3]>> = vec![None, None];

        for style in &self.styles {
            let f = (style.bold, style.italic, style.text_color);
            if !fonts.contains(&f) {
                fonts.push(f);
            }
            if let Some(bg) = style.bg_color {
                if !fills.contains(&Some(bg)) {
                    fills.push(Some(bg));
                }
            }
        }

        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">"#,
        );

        xml.push_str(&format!("<fonts count=\"{}\">", fonts.len()));
        for &(b, i, col) in &fonts {
            xml.push_str("<font><sz val=\"11\"/><name val=\"Calibri\"/>");
            if b {
                xml.push_str("<b/>");
            }
            if i {
                xml.push_str("<i/>");
            }
            if let Some([r, g, b_val]) = col {
                xml.push_str(&format!("<color rgb=\"FF{:02X}{:02X}{:02X}\"/>", r, g, b_val));
            }
            xml.push_str("</font>");
        }
        xml.push_str("</fonts>");

        xml.push_str(&format!("<fills count=\"{}\">", fills.len()));
        xml.push_str(
            "<fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>",
        );
        for fill in fills.iter().skip(2) {
            if let Some([r, g, b_val]) = fill {
                xml.push_str(&format!("<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FF{:02X}{:02X}{:02X}\"/></patternFill></fill>", r, g, b_val));
            }
        }
        xml.push_str("</fills>");

        xml.push_str("<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>");
        xml.push_str(
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>",
        );

        xml.push_str(&format!("<cellXfs count=\"{}\">", self.styles.len()));
        for style in &self.styles {
            let font_id = fonts
                .iter()
                .position(|f| *f == (style.bold, style.italic, style.text_color))
                .unwrap_or(0);
            let fill_id = if let Some(bg) = style.bg_color {
                fills.iter().position(|f| *f == Some(bg)).unwrap_or(0)
            } else {
                0
            };
            let num_fmt_id = match style.num_format {
                NumFormat::General => 0,
                NumFormat::Number => 2,
                NumFormat::Currency => 164,
                NumFormat::Percentage => 9,
                NumFormat::Date => 14,
            };
            let align_str = match style.align {
                CellAlign::General => "",
                CellAlign::Left => "<alignment horizontal=\"left\"/>",
                CellAlign::Center => "<alignment horizontal=\"center\"/>",
                CellAlign::Right => "<alignment horizontal=\"right\"/>",
            };
            let apply_align = if !align_str.is_empty() {
                " applyAlignment=\"1\""
            } else {
                ""
            };
            xml.push_str(&format!(
                "<xf numFmtId=\"{num_fmt_id}\" fontId=\"{font_id}\" fillId=\"{fill_id}\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyNumberFormat=\"1\"{apply_align}>{align_str}</xf>"
            ));
        }
        xml.push_str("</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>");
        xml
    }
}

fn write_package(path: &Path, workbook: &Workbook) -> Result<(), XlsxError> {
    let file = File::create(path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let registry = StyleRegistry::new(workbook);
    let mut entries = Vec::<(String, String)>::new();
    entries.push(("[Content_Types].xml".into(), content_types(workbook.sheets.len())));
    entries.push(("_rels/.rels".into(), ROOT_RELS.into()));
    entries.push(("xl/workbook.xml".into(), workbook_xml(workbook)));
    entries.push((
        "xl/_rels/workbook.xml.rels".into(),
        workbook_rels(workbook.sheets.len()),
    ));
    entries.push(("xl/styles.xml".into(), registry.to_styles_xml()));
    for (index, sheet) in workbook.sheets.iter().enumerate() {
        entries.push((
            format!("xl/worksheets/sheet{}.xml", index + 1),
            worksheet_xml(sheet, &registry),
        ));
    }
    for (name, content) in entries {
        zip.start_file(name, options)?;
        zip.write_all(content.as_bytes())?;
    }
    let file = zip.finish()?;
    file.sync_all()?;
    Ok(())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn content_types(sheets: usize) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>"#,
    );
    for index in 1..=sheets {
        xml.push_str(&format!("<Override PartName=\"/xl/worksheets/sheet{index}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"));
    }
    xml.push_str("</Types>");
    xml
}

fn workbook_xml(workbook: &Workbook) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>"#,
    );
    for (index, sheet) in workbook.sheets.iter().enumerate() {
        xml.push_str(&format!(
            "<sheet name=\"{}\" sheetId=\"{}\" r:id=\"rId{}\"/>",
            xml_escape(&sheet.name),
            index + 1,
            index + 1
        ));
    }
    xml.push_str("</sheets><calcPr calcMode=\"auto\" fullCalcOnLoad=\"1\" forceFullCalc=\"1\"/></workbook>");
    xml
}

fn workbook_rels(sheets: usize) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
    );
    for index in 1..=sheets {
        xml.push_str(&format!("<Relationship Id=\"rId{index}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{index}.xml\"/>"));
    }
    xml.push_str(&format!("<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>", sheets + 1));
    xml
}

fn worksheet_xml(sheet: &Sheet, registry: &StyleRegistry) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData>"#,
    );
    let mut current_row = 0;
    for (address, value) in sheet.cells() {
        if address.row != current_row {
            if current_row != 0 {
                xml.push_str("</row>");
            }
            current_row = address.row;
            xml.push_str(&format!("<row r=\"{current_row}\">"));
        }
        let reference = address.to_string();
        let s_attr = if let Some(style) = sheet.get_style(address) {
            let idx = registry.index_of(style);
            if idx > 0 {
                format!(" s=\"{idx}\"")
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        match value {
            CellValue::Blank => {}
            CellValue::Text(text) => xml.push_str(&format!(
                "<c r=\"{reference}\"{s_attr} t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>",
                xml_escape(text)
            )),
            CellValue::Number(number) if number.is_finite() => {
                xml.push_str(&format!("<c r=\"{reference}\"{s_attr}><v>{number}</v></c>"))
            }
            CellValue::Number(_) => xml.push_str(&format!("<c r=\"{reference}\"{s_attr} t=\"e\"><v>#NUM!</v></c>")),
            CellValue::Boolean(value) => xml.push_str(&format!(
                "<c r=\"{reference}\"{s_attr} t=\"b\"><v>{}</v></c>",
                if *value { 1 } else { 0 }
            )),
            CellValue::Formula(formula) => xml.push_str(&format!(
                "<c r=\"{reference}\"{s_attr}><f>{}</f><v></v></c>",
                xml_escape(formula.strip_prefix('=').unwrap_or(formula))
            )),
            CellValue::Error(error) => xml.push_str(&format!(
                "<c r=\"{reference}\"{s_attr} t=\"e\"><v>{}</v></c>",
                xml_escape(error)
            )),
        }
    }
    if current_row != 0 {
        xml.push_str("</row>");
    }
    xml.push_str("</sheetData></worksheet>");
    xml
}

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path() -> std::path::PathBuf {
        let suffix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("nom-sheet-{suffix}.xlsx"))
    }

    #[test]
    fn xlsx_round_trip_keeps_sheets_values_and_formulas() {
        let path = temp_path();
        let mut workbook = Workbook::default();
        let first = CellAddress::parse("A1").unwrap();
        let formula = CellAddress::parse("B1").unwrap();
        workbook
            .active_mut()
            .set(first, CellValue::Text("Tiếng Việt & Excel".into()));
        workbook
            .active_mut()
            .set(formula, CellValue::Formula("SUM(C1:C2)".into()));
        let second_sheet = workbook.add_sheet("Doanh thu 2026");
        workbook.sheets[second_sheet].set(CellAddress::parse("C1").unwrap(), CellValue::Number(123.5));
        save(&path, &workbook).unwrap();
        save(&path, &workbook).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.sheets.len(), 2);
        assert_eq!(
            loaded.sheets[0].get(first),
            &CellValue::Text("Tiếng Việt & Excel".into())
        );
        assert_eq!(loaded.sheets[0].get(formula), &CellValue::Formula("SUM(C1:C2)".into()));
        assert_eq!(
            loaded.sheets[1].get(CellAddress::parse("C1").unwrap()),
            &CellValue::Number(123.5)
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn xlsx_round_trip_preserves_styles_and_number_formats() {
        let path = temp_path();
        let mut workbook = Workbook::default();
        let a1 = CellAddress::parse("A1").unwrap();
        let style = CellStyle {
            bold: true,
            italic: true,
            text_color: Some([0, 100, 200]),
            bg_color: Some([240, 248, 255]),
            align: CellAlign::Center,
            num_format: NumFormat::Currency,
        };
        workbook.active_mut().set(a1, CellValue::Number(999.5));
        workbook.active_mut().set_style(a1, style.clone());

        save(&path, &workbook).unwrap();
        let loaded = load(&path).unwrap();
        let loaded_style = loaded.sheets[0].get_style(a1).expect("style should be preserved");
        assert_eq!(loaded_style.bold, true);
        assert_eq!(loaded_style.italic, true);
        assert_eq!(loaded_style.align, CellAlign::Center);
        assert_eq!(loaded_style.num_format, NumFormat::Currency);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_relationships_that_escape_worksheet_folder() {
        assert!(normalize_sheet_target("../../outside.xml").is_err());
    }
}
