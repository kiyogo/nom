use nom_workbook::CellValue;

pub trait FormulaContext {
    fn cell(&self, reference: &str) -> CellValue;
    fn range(&self, first: &str, last: &str) -> Vec<CellValue>;
}

#[derive(Debug, Clone, PartialEq)]
enum Expr {
    Number(f64),
    Text(String),
    Boolean(bool),
    Reference(String),
    Range(String, String),
    Unary(String, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Text(String),
    Ident(String),
    Operator(String),
    LeftParen,
    RightParen,
    Comma,
    Colon,
    End,
}

pub fn evaluate(formula: &str, context: &impl FormulaContext) -> CellValue {
    let source = formula.strip_prefix('=').unwrap_or(formula);
    let tokens = match tokenize(source) {
        Ok(tokens) => tokens,
        Err(error) => return CellValue::Error(error),
    };
    let mut parser = Parser { tokens, position: 0 };
    let expression = match parser.expression(0) {
        Ok(expression) if parser.peek() == &Token::End => expression,
        _ => return CellValue::Error("#VALUE!".to_string()),
    };
    match evaluate_expr(&expression, context) {
        Value::Cell(value) => value,
        Value::Range(_) => CellValue::Error("#VALUE!".to_string()),
    }
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if ch.is_whitespace() {
            index += 1;
            continue;
        }
        if ch.is_ascii_digit() || (ch == '.' && chars.get(index + 1).is_some_and(char::is_ascii_digit)) {
            let start = index;
            index += 1;
            while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.') {
                index += 1;
            }
            if index < chars.len() && matches!(chars[index], 'e' | 'E') {
                index += 1;
                if index < chars.len() && matches!(chars[index], '+' | '-') {
                    index += 1;
                }
                while index < chars.len() && chars[index].is_ascii_digit() {
                    index += 1;
                }
            }
            let value: String = chars[start..index].iter().collect();
            tokens.push(Token::Number(value.parse().map_err(|_| "#VALUE!".to_string())?));
            continue;
        }
        if ch == '"' {
            index += 1;
            let mut value = String::new();
            let mut closed = false;
            while index < chars.len() {
                if chars[index] == '"' {
                    if chars.get(index + 1) == Some(&'"') {
                        value.push('"');
                        index += 2;
                    } else {
                        index += 1;
                        closed = true;
                        break;
                    }
                } else {
                    value.push(chars[index]);
                    index += 1;
                }
            }
            if !closed {
                return Err("#VALUE!".to_string());
            }
            tokens.push(Token::Text(value));
            continue;
        }
        if ch.is_ascii_alphabetic() || ch == '$' || ch == '_' || ch == '\'' {
            let start = index;
            let mut in_quoted_sheet = false;
            if ch == '\'' {
                in_quoted_sheet = true;
            }
            index += 1;
            while index < chars.len() {
                let c = chars[index];
                if c == '\'' {
                    in_quoted_sheet = !in_quoted_sheet;
                    index += 1;
                    continue;
                }
                if in_quoted_sheet || c.is_ascii_alphanumeric() || matches!(c, '$' | '_' | '.' | '!') {
                    index += 1;
                } else {
                    break;
                }
            }
            tokens.push(Token::Ident(chars[start..index].iter().collect()));
            continue;
        }
        match ch {
            '(' => tokens.push(Token::LeftParen),
            ')' => tokens.push(Token::RightParen),
            ',' => tokens.push(Token::Comma),
            ':' => tokens.push(Token::Colon),
            '+' | '-' | '*' | '/' | '^' | '%' | '&' | '=' | '<' | '>' => {
                let mut operator = ch.to_string();
                if index + 1 < chars.len() && matches!((ch, chars[index + 1]), ('<' | '>', '=') | ('<', '>')) {
                    operator.push(chars[index + 1]);
                    index += 1;
                }
                tokens.push(Token::Operator(operator));
            }
            _ => return Err("#VALUE!".to_string()),
        }
        index += 1;
    }
    tokens.push(Token::End);
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    fn peek(&self) -> &Token {
        &self.tokens[self.position]
    }
    fn take(&mut self) -> Token {
        let token = self.tokens[self.position].clone();
        self.position += 1;
        token
    }

    fn expression(&mut self, min_precedence: u8) -> Result<Expr, ()> {
        let mut left = match self.take() {
            Token::Number(value) => Expr::Number(value),
            Token::Text(value) => Expr::Text(value),
            Token::Operator(operator) if operator == "+" || operator == "-" => {
                Expr::Unary(operator, Box::new(self.expression(6)?))
            }
            Token::LeftParen => {
                let inner = self.expression(0)?;
                if self.take() != Token::RightParen {
                    return Err(());
                }
                inner
            }
            Token::Ident(name) => {
                if self.peek() == &Token::LeftParen {
                    self.take();
                    let mut arguments = Vec::new();
                    if self.peek() != &Token::RightParen {
                        loop {
                            arguments.push(self.expression(0)?);
                            if self.peek() != &Token::Comma {
                                break;
                            }
                            self.take();
                        }
                    }
                    if self.take() != Token::RightParen {
                        return Err(());
                    }
                    Expr::Call(name.to_ascii_uppercase(), arguments)
                } else if name.eq_ignore_ascii_case("TRUE") || name.eq_ignore_ascii_case("FALSE") {
                    Expr::Boolean(name.eq_ignore_ascii_case("TRUE"))
                } else {
                    let first = name;
                    if self.peek() == &Token::Colon {
                        self.take();
                        let Token::Ident(last) = self.take() else {
                            return Err(());
                        };
                        Expr::Range(first, last)
                    } else {
                        Expr::Reference(first)
                    }
                }
            }
            _ => return Err(()),
        };

        loop {
            let Token::Operator(operator) = self.peek() else {
                break;
            };
            let Some((precedence, right_associative)) = precedence(operator) else {
                break;
            };
            if precedence < min_precedence {
                break;
            }
            let operator = operator.clone();
            self.take();
            let right = self.expression(if right_associative { precedence } else { precedence + 1 })?;
            left = Expr::Binary(operator, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
}

fn precedence(operator: &str) -> Option<(u8, bool)> {
    Some(match operator {
        "=" | "<>" | "<" | ">" | "<=" | ">=" => (1, false),
        "&" => (2, false),
        "+" | "-" => (3, false),
        "*" | "/" => (4, false),
        "^" => (5, true),
        _ => return None,
    })
}

#[derive(Debug, Clone)]
pub struct RangeData {
    pub rows: usize,
    pub cols: usize,
    pub values: Vec<CellValue>,
}

#[derive(Debug, Clone)]
enum Value {
    Cell(CellValue),
    Range(RangeData),
}

pub fn split_sheet_ref(reference: &str) -> (Option<String>, String) {
    let reference = reference.trim();
    if let Some((sheet_part, cell_part)) = reference.split_once('!') {
        let sheet = sheet_part.trim().trim_matches('\'').to_string();
        (Some(sheet), cell_part.trim().to_string())
    } else {
        (None, reference.to_string())
    }
}

fn calculate_range_dimensions(first: &str, last: &str) -> (usize, usize) {
    let (_, cell1) = split_sheet_ref(first);
    let (_, cell2) = split_sheet_ref(last);
    if let (Ok(a1), Ok(a2)) = (
        nom_workbook::CellAddress::parse(&cell1),
        nom_workbook::CellAddress::parse(&cell2),
    ) {
        let rows = (a1.row.max(a2.row) - a1.row.min(a2.row) + 1) as usize;
        let cols = (a1.column.max(a2.column) - a1.column.min(a2.column) + 1) as usize;
        (rows, cols)
    } else {
        (1, 1)
    }
}

fn evaluate_expr(expression: &Expr, context: &impl FormulaContext) -> Value {
    match expression {
        Expr::Number(value) => Value::Cell(CellValue::Number(*value)),
        Expr::Text(value) => Value::Cell(CellValue::Text(value.clone())),
        Expr::Boolean(value) => Value::Cell(CellValue::Boolean(*value)),
        Expr::Reference(reference) => Value::Cell(context.cell(reference)),
        Expr::Range(first, last) => {
            let (rows, cols) = calculate_range_dimensions(first, last);
            let values = context.range(first, last);
            Value::Range(RangeData { rows, cols, values })
        }
        Expr::Unary(operator, inner) => {
            let value = scalar(evaluate_expr(inner, context));
            if let CellValue::Error(_) = value {
                return Value::Cell(value);
            }
            match number(&value) {
                Some(number) if operator == "-" => Value::Cell(CellValue::Number(-number)),
                Some(number) => Value::Cell(CellValue::Number(number)),
                None => Value::Cell(CellValue::Error("#VALUE!".to_string())),
            }
        }
        Expr::Binary(operator, left, right) => {
            let lhs = scalar(evaluate_expr(left, context));
            if matches!(lhs, CellValue::Error(_)) {
                return Value::Cell(lhs);
            }
            let rhs = scalar(evaluate_expr(right, context));
            if matches!(rhs, CellValue::Error(_)) {
                return Value::Cell(rhs);
            }
            Value::Cell(binary(operator, lhs, rhs))
        }
        Expr::Call(name, arguments) => call(name, arguments, context),
    }
}

fn scalar(value: Value) -> CellValue {
    match value {
        Value::Cell(value) => value,
        Value::Range(r) => r.values.into_iter().next().unwrap_or(CellValue::Blank),
    }
}

fn binary(operator: &str, left: CellValue, right: CellValue) -> CellValue {
    if operator == "&" {
        return CellValue::Text(left.display_text() + &right.display_text());
    }
    if matches!(operator, "=" | "<>" | "<" | ">" | "<=" | ">=") {
        let ordering = match (number(&left), number(&right)) {
            (Some(a), Some(b)) => a.partial_cmp(&b),
            _ => Some(
                left.display_text()
                    .to_lowercase()
                    .cmp(&right.display_text().to_lowercase()),
            ),
        };
        let Some(ordering) = ordering else {
            return CellValue::Error("#VALUE!".to_string());
        };
        return CellValue::Boolean(match operator {
            "=" => ordering.is_eq(),
            "<>" => !ordering.is_eq(),
            "<" => ordering.is_lt(),
            ">" => ordering.is_gt(),
            "<=" => !ordering.is_gt(),
            ">=" => !ordering.is_lt(),
            _ => false,
        });
    }
    let (Some(a), Some(b)) = (number(&left), number(&right)) else {
        return CellValue::Error("#VALUE!".to_string());
    };
    match operator {
        "+" => CellValue::Number(a + b),
        "-" => CellValue::Number(a - b),
        "*" => CellValue::Number(a * b),
        "/" if b == 0.0 => CellValue::Error("#DIV/0!".to_string()),
        "/" => CellValue::Number(a / b),
        "^" => CellValue::Number(a.powf(b)),
        _ => CellValue::Error("#VALUE!".to_string()),
    }
}

fn matches_criteria(cell: &CellValue, criteria: &CellValue) -> bool {
    let crit_text = criteria.display_text();
    let crit_trim = crit_text.trim();
    if let Some(rest) = crit_trim.strip_prefix(">=") {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return xn >= cn;
        }
    } else if let Some(rest) = crit_trim.strip_prefix("<=") {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return xn <= cn;
        }
    } else if let Some(rest) = crit_trim.strip_prefix("<>") {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return (xn - cn).abs() > f64::EPSILON;
        }
        return !cell.display_text().eq_ignore_ascii_case(rest.trim());
    } else if let Some(rest) = crit_trim.strip_prefix('>') {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return xn > cn;
        }
    } else if let Some(rest) = crit_trim.strip_prefix('<') {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return xn < cn;
        }
    } else if let Some(rest) = crit_trim.strip_prefix('=') {
        if let (Some(cn), Some(xn)) = (rest.trim().parse::<f64>().ok(), number(cell)) {
            return (xn - cn).abs() <= f64::EPSILON;
        }
        return cell.display_text().eq_ignore_ascii_case(rest.trim());
    }

    match (cell, criteria) {
        (CellValue::Number(a), CellValue::Number(b)) => (a - b).abs() <= f64::EPSILON,
        (CellValue::Boolean(a), CellValue::Boolean(b)) => a == b,
        _ => cell.display_text().eq_ignore_ascii_case(&crit_text),
    }
}

pub fn excel_serial_date(year: i32, month: i32, day: i32) -> f64 {
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    let jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    (jdn - 2415019) as f64
}

pub fn excel_from_serial_date(serial: f64) -> (i32, i32, i32) {
    let days = serial.floor() as i64;
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
    (year as i32, month as i32, day as i32)
}

fn call(name: &str, arguments: &[Expr], context: &impl FormulaContext) -> Value {
    // 1. Short-circuit control flow functions
    if name == "IF" {
        if !(2..=3).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let condition = scalar(evaluate_expr(&arguments[0], context));
        if matches!(condition, CellValue::Error(_)) {
            return Value::Cell(condition);
        }
        let truth = boolean(&condition);
        return evaluate_expr(
            if truth {
                &arguments[1]
            } else {
                arguments.get(2).unwrap_or(&Expr::Boolean(false))
            },
            context,
        );
    }
    if name == "IFS" {
        if arguments.len() < 2 || arguments.len() % 2 != 0 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        for chunk in arguments.chunks_exact(2) {
            let cond = scalar(evaluate_expr(&chunk[0], context));
            if matches!(cond, CellValue::Error(_)) {
                return Value::Cell(cond);
            }
            if boolean(&cond) {
                return evaluate_expr(&chunk[1], context);
            }
        }
        return Value::Cell(CellValue::Error("#N/A".to_string()));
    }
    if name == "SWITCH" {
        if arguments.len() < 3 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let target = scalar(evaluate_expr(&arguments[0], context));
        let mut idx = 1;
        while idx + 1 < arguments.len() {
            let case_val = scalar(evaluate_expr(&arguments[idx], context));
            if target == case_val {
                return evaluate_expr(&arguments[idx + 1], context);
            }
            idx += 2;
        }
        if idx < arguments.len() {
            return evaluate_expr(&arguments[idx], context);
        }
        return Value::Cell(CellValue::Error("#N/A".to_string()));
    }
    if name == "IFERROR" {
        if arguments.len() != 2 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let result = evaluate_expr(&arguments[0], context);
        return if matches!(result, Value::Cell(CellValue::Error(_))) {
            evaluate_expr(&arguments[1], context)
        } else {
            result
        };
    }
    if name == "IFNA" {
        if arguments.len() != 2 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let result = evaluate_expr(&arguments[0], context);
        return if matches!(&result, Value::Cell(CellValue::Error(e)) if e == "#N/A") {
            evaluate_expr(&arguments[1], context)
        } else {
            result
        };
    }
    if name == "CHOOSE" {
        if arguments.is_empty() {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let index_val = scalar(evaluate_expr(&arguments[0], context));
        let Some(idx) = number(&index_val).map(|n| n as usize) else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        if idx == 0 || idx >= arguments.len() {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        return evaluate_expr(&arguments[idx], context);
    }

    // 2. Lookup & Reference functions that inspect 2D ranges
    if name == "ROWS" {
        if arguments.len() != 1 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        return match evaluate_expr(&arguments[0], context) {
            Value::Range(r) => Value::Cell(CellValue::Number(r.rows as f64)),
            Value::Cell(_) => Value::Cell(CellValue::Number(1.0)),
        };
    }
    if name == "COLUMNS" {
        if arguments.len() != 1 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        return match evaluate_expr(&arguments[0], context) {
            Value::Range(r) => Value::Cell(CellValue::Number(r.cols as f64)),
            Value::Cell(_) => Value::Cell(CellValue::Number(1.0)),
        };
    }
    if name == "ROW" {
        if arguments.is_empty() {
            return Value::Cell(CellValue::Number(1.0));
        }
        if let Expr::Reference(ref_str) = &arguments[0] {
            let (_, cell) = split_sheet_ref(ref_str);
            if let Ok(addr) = nom_workbook::CellAddress::parse(&cell) {
                return Value::Cell(CellValue::Number(addr.row as f64));
            }
        }
        return Value::Cell(CellValue::Number(1.0));
    }
    if name == "COLUMN" {
        if arguments.is_empty() {
            return Value::Cell(CellValue::Number(1.0));
        }
        if let Expr::Reference(ref_str) = &arguments[0] {
            let (_, cell) = split_sheet_ref(ref_str);
            if let Ok(addr) = nom_workbook::CellAddress::parse(&cell) {
                return Value::Cell(CellValue::Number(addr.column as f64));
            }
        }
        return Value::Cell(CellValue::Number(1.0));
    }
    if name == "INDEX" {
        if arguments.len() < 2 || arguments.len() > 3 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let range_val = evaluate_expr(&arguments[0], context);
        let row_idx = scalar(evaluate_expr(&arguments[1], context));
        let col_idx = if arguments.len() == 3 {
            scalar(evaluate_expr(&arguments[2], context))
        } else {
            CellValue::Number(1.0)
        };
        let (Some(r), Some(c)) = (number(&row_idx), number(&col_idx)) else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        let (r, c) = (r as usize, c as usize);
        return match range_val {
            Value::Range(data) => {
                if r == 0 || r > data.rows || c == 0 || c > data.cols {
                    Value::Cell(CellValue::Error("#REF!".to_string()))
                } else {
                    let idx = (r - 1) * data.cols + (c - 1);
                    Value::Cell(data.values.get(idx).cloned().unwrap_or(CellValue::Blank))
                }
            }
            Value::Cell(cell) if r == 1 && c == 1 => Value::Cell(cell),
            _ => Value::Cell(CellValue::Error("#REF!".to_string())),
        };
    }
    if name == "VLOOKUP" {
        if !(3..=4).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let lookup_val = scalar(evaluate_expr(&arguments[0], context));
        let range_val = evaluate_expr(&arguments[1], context);
        let col_idx_val = scalar(evaluate_expr(&arguments[2], context));
        let exact_match = if arguments.len() == 4 {
            let exact_val = scalar(evaluate_expr(&arguments[3], context));
            !boolean(&exact_val) // FALSE = exact match
        } else {
            false
        };
        let Some(col_idx) = number(&col_idx_val).map(|n| n as usize) else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        let Value::Range(data) = range_val else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        if col_idx == 0 || col_idx > data.cols {
            return Value::Cell(CellValue::Error("#REF!".to_string()));
        }

        let mut found_row = None;
        for r in 0..data.rows {
            let cell = &data.values[r * data.cols];
            if matches_criteria(cell, &lookup_val) {
                found_row = Some(r);
                break;
            }
        }
        if let Some(r) = found_row {
            let res = data.values[r * data.cols + (col_idx - 1)].clone();
            return Value::Cell(res);
        } else if !exact_match {
            // Approximate match on sorted data: find last element <= lookup_val
            let mut best_r = None;
            for r in 0..data.rows {
                let cell = &data.values[r * data.cols];
                if let (Some(a), Some(b)) = (number(cell), number(&lookup_val)) {
                    if a <= b {
                        best_r = Some(r);
                    }
                }
            }
            if let Some(r) = best_r {
                let res = data.values[r * data.cols + (col_idx - 1)].clone();
                return Value::Cell(res);
            }
        }
        return Value::Cell(CellValue::Error("#N/A".to_string()));
    }
    if name == "HLOOKUP" {
        if !(3..=4).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let lookup_val = scalar(evaluate_expr(&arguments[0], context));
        let range_val = evaluate_expr(&arguments[1], context);
        let row_idx_val = scalar(evaluate_expr(&arguments[2], context));
        let Some(row_idx) = number(&row_idx_val).map(|n| n as usize) else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        let Value::Range(data) = range_val else {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        };
        if row_idx == 0 || row_idx > data.rows {
            return Value::Cell(CellValue::Error("#REF!".to_string()));
        }

        for c in 0..data.cols {
            let cell = &data.values[c];
            if matches_criteria(cell, &lookup_val) {
                let res = data.values[(row_idx - 1) * data.cols + c].clone();
                return Value::Cell(res);
            }
        }
        return Value::Cell(CellValue::Error("#N/A".to_string()));
    }
    if name == "MATCH" {
        if !(2..=3).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let lookup_val = scalar(evaluate_expr(&arguments[0], context));
        let range_val = evaluate_expr(&arguments[1], context);
        let items = match range_val {
            Value::Range(r) => r.values,
            Value::Cell(c) => vec![c],
        };
        for (i, cell) in items.iter().enumerate() {
            if matches_criteria(cell, &lookup_val) {
                return Value::Cell(CellValue::Number((i + 1) as f64));
            }
        }
        return Value::Cell(CellValue::Error("#N/A".to_string()));
    }

    // 3. Conditional Aggregation: SUMIF, COUNTIF, AVERAGEIF
    if name == "SUMIF" {
        if !(2..=3).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let range_items = match evaluate_expr(&arguments[0], context) {
            Value::Range(r) => r.values,
            Value::Cell(c) => vec![c],
        };
        let criteria = scalar(evaluate_expr(&arguments[1], context));
        let sum_items = if arguments.len() == 3 {
            match evaluate_expr(&arguments[2], context) {
                Value::Range(r) => r.values,
                Value::Cell(c) => vec![c],
            }
        } else {
            range_items.clone()
        };
        let mut total = 0.0;
        for (i, cell) in range_items.iter().enumerate() {
            if matches_criteria(cell, &criteria) {
                if let Some(target) = sum_items.get(i) {
                    total += number(target).unwrap_or(0.0);
                }
            }
        }
        return Value::Cell(CellValue::Number(total));
    }
    if name == "COUNTIF" {
        if arguments.len() != 2 {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let range_items = match evaluate_expr(&arguments[0], context) {
            Value::Range(r) => r.values,
            Value::Cell(c) => vec![c],
        };
        let criteria = scalar(evaluate_expr(&arguments[1], context));
        let count = range_items.iter().filter(|c| matches_criteria(c, &criteria)).count();
        return Value::Cell(CellValue::Number(count as f64));
    }
    if name == "AVERAGEIF" {
        if !(2..=3).contains(&arguments.len()) {
            return Value::Cell(CellValue::Error("#VALUE!".to_string()));
        }
        let range_items = match evaluate_expr(&arguments[0], context) {
            Value::Range(r) => r.values,
            Value::Cell(c) => vec![c],
        };
        let criteria = scalar(evaluate_expr(&arguments[1], context));
        let avg_items = if arguments.len() == 3 {
            match evaluate_expr(&arguments[2], context) {
                Value::Range(r) => r.values,
                Value::Cell(c) => vec![c],
            }
        } else {
            range_items.clone()
        };
        let mut total = 0.0;
        let mut count = 0usize;
        for (i, cell) in range_items.iter().enumerate() {
            if matches_criteria(cell, &criteria) {
                if let Some(target) = avg_items.get(i) {
                    if let Some(n) = number(target) {
                        total += n;
                        count += 1;
                    }
                }
            }
        }
        if count == 0 {
            return Value::Cell(CellValue::Error("#DIV/0!".to_string()));
        }
        return Value::Cell(CellValue::Number(total / count as f64));
    }

    // 4. Evaluate all arguments into flat list for general functions
    let mut values = Vec::new();
    for argument in arguments {
        match evaluate_expr(argument, context) {
            Value::Cell(CellValue::Error(error)) => return Value::Cell(CellValue::Error(error)),
            Value::Cell(value) => values.push(value),
            Value::Range(range) => {
                if let Some(CellValue::Error(error)) =
                    range.values.iter().find(|value| matches!(value, CellValue::Error(_)))
                {
                    return Value::Cell(CellValue::Error(error.clone()));
                }
                values.extend(range.values);
            }
        }
    }

    let numbers: Vec<f64> = values.iter().filter_map(number).collect();

    // 5. Math & Statistics
    let result = match name {
        "SUM" => CellValue::Number(numbers.iter().sum()),
        "AVERAGE" if numbers.is_empty() => CellValue::Error("#DIV/0!".to_string()),
        "AVERAGE" => CellValue::Number(numbers.iter().sum::<f64>() / numbers.len() as f64),
        "MIN" => CellValue::Number(numbers.iter().copied().reduce(f64::min).unwrap_or(0.0)),
        "MAX" => CellValue::Number(numbers.iter().copied().reduce(f64::max).unwrap_or(0.0)),
        "COUNT" => CellValue::Number(numbers.len() as f64),
        "COUNTA" => CellValue::Number(values.iter().filter(|value| **value != CellValue::Blank).count() as f64),
        "COUNTBLANK" => CellValue::Number(
            values
                .iter()
                .filter(|v| **v == CellValue::Blank || matches!(v, CellValue::Text(s) if s.is_empty()))
                .count() as f64,
        ),
        "PRODUCT" => CellValue::Number(numbers.iter().product()),
        "ABS" if values.len() == 1 => number(&values[0])
            .map(|n| CellValue::Number(n.abs()))
            .unwrap_or_else(|| CellValue::Error("#VALUE!".to_string())),
        "MOD" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(_), Some(d)) if d == 0.0 => CellValue::Error("#DIV/0!".to_string()),
            (Some(n), Some(d)) => CellValue::Number(n - d * (n / d).floor()),
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "ROUND" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(n), Some(digits)) => {
                let factor = 10f64.powi(digits as i32);
                CellValue::Number((n * factor).round() / factor)
            }
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "ROUNDUP" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(n), Some(digits)) => {
                let factor = 10f64.powi(digits as i32);
                if n >= 0.0 {
                    CellValue::Number((n * factor).ceil() / factor)
                } else {
                    CellValue::Number((n * factor).floor() / factor)
                }
            }
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "ROUNDDOWN" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(n), Some(digits)) => {
                let factor = 10f64.powi(digits as i32);
                if n >= 0.0 {
                    CellValue::Number((n * factor).floor() / factor)
                } else {
                    CellValue::Number((n * factor).ceil() / factor)
                }
            }
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "INT" if values.len() == 1 => number(&values[0])
            .map(|n| CellValue::Number(n.floor()))
            .unwrap_or_else(|| CellValue::Error("#VALUE!".to_string())),
        "TRUNC" if !values.is_empty() => {
            let digits = if values.len() > 1 {
                number(&values[1]).unwrap_or(0.0) as i32
            } else {
                0
            };
            match number(&values[0]) {
                Some(n) => {
                    let factor = 10f64.powi(digits);
                    CellValue::Number((n * factor).trunc() / factor)
                }
                None => CellValue::Error("#VALUE!".to_string()),
            }
        }
        "CEILING" if !values.is_empty() => {
            let sig = if values.len() > 1 {
                number(&values[1]).unwrap_or(1.0)
            } else {
                1.0
            };
            match number(&values[0]) {
                Some(_) if sig == 0.0 => CellValue::Number(0.0),
                Some(n) => CellValue::Number((n / sig).ceil() * sig),
                None => CellValue::Error("#VALUE!".to_string()),
            }
        }
        "FLOOR" if !values.is_empty() => {
            let sig = if values.len() > 1 {
                number(&values[1]).unwrap_or(1.0)
            } else {
                1.0
            };
            match number(&values[0]) {
                Some(_) if sig == 0.0 => CellValue::Number(0.0),
                Some(n) => CellValue::Number((n / sig).floor() * sig),
                None => CellValue::Error("#VALUE!".to_string()),
            }
        }
        "POWER" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(n), Some(p)) => CellValue::Number(n.powf(p)),
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "SQRT" if values.len() == 1 => match number(&values[0]) {
            Some(n) if n < 0.0 => CellValue::Error("#NUM!".to_string()),
            Some(n) => CellValue::Number(n.sqrt()),
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "EXP" if values.len() == 1 => match number(&values[0]) {
            Some(n) => CellValue::Number(n.exp()),
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "LN" if values.len() == 1 => match number(&values[0]) {
            Some(n) if n <= 0.0 => CellValue::Error("#NUM!".to_string()),
            Some(n) => CellValue::Number(n.ln()),
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "LOG10" if values.len() == 1 => match number(&values[0]) {
            Some(n) if n <= 0.0 => CellValue::Error("#NUM!".to_string()),
            Some(n) => CellValue::Number(n.log10()),
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "LOG" if !values.is_empty() => {
            let base = if values.len() > 1 {
                number(&values[1]).unwrap_or(10.0)
            } else {
                10.0
            };
            match number(&values[0]) {
                Some(n) if n <= 0.0 || base <= 0.0 || (base - 1.0).abs() < f64::EPSILON => {
                    CellValue::Error("#NUM!".to_string())
                }
                Some(n) => CellValue::Number(n.log(base)),
                None => CellValue::Error("#VALUE!".to_string()),
            }
        }
        "SIN" if values.len() == 1 => number(&values[0])
            .map(|n| CellValue::Number(n.sin()))
            .unwrap_or_else(|| CellValue::Error("#VALUE!".to_string())),
        "COS" if values.len() == 1 => number(&values[0])
            .map(|n| CellValue::Number(n.cos()))
            .unwrap_or_else(|| CellValue::Error("#VALUE!".to_string())),
        "TAN" if values.len() == 1 => number(&values[0])
            .map(|n| CellValue::Number(n.tan()))
            .unwrap_or_else(|| CellValue::Error("#VALUE!".to_string())),
        "PI" => CellValue::Number(std::f64::consts::PI),
        "RAND" => {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos();
            CellValue::Number((nanos % 1_000_000) as f64 / 1_000_000.0)
        }
        "RANDBETWEEN" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(bottom), Some(top)) => {
                let b = bottom as i64;
                let t = top as i64;
                if b > t {
                    CellValue::Error("#NUM!".to_string())
                } else {
                    let nanos = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .subsec_nanos() as i64;
                    let diff = (t - b + 1).max(1);
                    CellValue::Number((b + (nanos % diff)) as f64)
                }
            }
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "MEDIAN" if !numbers.is_empty() => {
            let mut sorted = numbers.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let len = sorted.len();
            if len % 2 == 1 {
                CellValue::Number(sorted[len / 2])
            } else {
                CellValue::Number((sorted[len / 2 - 1] + sorted[len / 2]) / 2.0)
            }
        }
        "MEDIAN" => CellValue::Error("#NUM!".to_string()),
        "LARGE" if values.len() >= 2 => {
            let k = number(&values[values.len() - 1]).unwrap_or(1.0) as usize;
            let mut nums: Vec<f64> = values[..values.len() - 1].iter().filter_map(number).collect();
            nums.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
            if k == 0 || k > nums.len() {
                CellValue::Error("#NUM!".to_string())
            } else {
                CellValue::Number(nums[k - 1])
            }
        }
        "SMALL" if values.len() >= 2 => {
            let k = number(&values[values.len() - 1]).unwrap_or(1.0) as usize;
            let mut nums: Vec<f64> = values[..values.len() - 1].iter().filter_map(number).collect();
            nums.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            if k == 0 || k > nums.len() {
                CellValue::Error("#NUM!".to_string())
            } else {
                CellValue::Number(nums[k - 1])
            }
        }

        // 6. Logical functions
        "AND" => CellValue::Boolean(values.iter().all(boolean)),
        "OR" => CellValue::Boolean(values.iter().any(boolean)),
        "NOT" if values.len() == 1 => CellValue::Boolean(!boolean(&values[0])),
        "XOR" => {
            let count = values.iter().filter(|v| boolean(v)).count();
            CellValue::Boolean(count % 2 == 1)
        }
        "TRUE" => CellValue::Boolean(true),
        "FALSE" => CellValue::Boolean(false),

        // 7. Text functions
        "LEFT" if !values.is_empty() => {
            let n = if values.len() > 1 {
                number(&values[1]).unwrap_or(1.0) as usize
            } else {
                1
            };
            let text = values[0].display_text();
            let res: String = text.chars().take(n).collect();
            CellValue::Text(res)
        }
        "RIGHT" if !values.is_empty() => {
            let n = if values.len() > 1 {
                number(&values[1]).unwrap_or(1.0) as usize
            } else {
                1
            };
            let text = values[0].display_text();
            let count = text.chars().count();
            let skip = count.saturating_sub(n);
            let res: String = text.chars().skip(skip).collect();
            CellValue::Text(res)
        }
        "MID" if values.len() >= 3 => {
            let text = values[0].display_text();
            let start = number(&values[1]).unwrap_or(1.0) as usize;
            let len = number(&values[2]).unwrap_or(0.0) as usize;
            if start == 0 {
                CellValue::Error("#VALUE!".to_string())
            } else {
                let res: String = text.chars().skip(start - 1).take(len).collect();
                CellValue::Text(res)
            }
        }
        "LEN" if values.len() == 1 => CellValue::Number(values[0].display_text().chars().count() as f64),
        "TRIM" if values.len() == 1 => {
            let text = values[0].display_text();
            let words: Vec<&str> = text.split_whitespace().collect();
            CellValue::Text(words.join(" "))
        }
        "UPPER" if values.len() == 1 => CellValue::Text(values[0].display_text().to_uppercase()),
        "LOWER" if values.len() == 1 => CellValue::Text(values[0].display_text().to_lowercase()),
        "PROPER" if values.len() == 1 => {
            let text = values[0].display_text();
            let mut result = String::new();
            let mut capitalize_next = true;
            for ch in text.chars() {
                if ch.is_whitespace() || ch.is_ascii_punctuation() {
                    result.push(ch);
                    capitalize_next = true;
                } else if capitalize_next {
                    result.extend(ch.to_uppercase());
                    capitalize_next = false;
                } else {
                    result.extend(ch.to_lowercase());
                }
            }
            CellValue::Text(result)
        }
        "CONCAT" | "CONCATENATE" => {
            let mut text = String::new();
            for v in values {
                text.push_str(&v.display_text());
            }
            CellValue::Text(text)
        }
        "TEXTJOIN" if values.len() >= 3 => {
            let delim = values[0].display_text();
            let ignore_empty = boolean(&values[1]);
            let parts: Vec<String> = values[2..]
                .iter()
                .map(|v| v.display_text())
                .filter(|s| !ignore_empty || !s.is_empty())
                .collect();
            CellValue::Text(parts.join(&delim))
        }
        "EXACT" if values.len() == 2 => CellValue::Boolean(values[0].display_text() == values[1].display_text()),
        "REPT" if values.len() == 2 => {
            let text = values[0].display_text();
            let count = number(&values[1]).unwrap_or(0.0) as usize;
            CellValue::Text(text.repeat(count))
        }
        "REPLACE" if values.len() == 4 => {
            let text = values[0].display_text();
            let start = number(&values[1]).unwrap_or(1.0) as usize;
            let num = number(&values[2]).unwrap_or(0.0) as usize;
            let new_text = values[3].display_text();
            if start == 0 {
                CellValue::Error("#VALUE!".to_string())
            } else {
                let chars: Vec<char> = text.chars().collect();
                let mut out: String = chars.iter().take(start - 1).collect();
                out.push_str(&new_text);
                out.extend(chars.iter().skip(start - 1 + num));
                CellValue::Text(out)
            }
        }
        "SUBSTITUTE" if values.len() >= 3 => {
            let text = values[0].display_text();
            let old = values[1].display_text();
            let new = values[2].display_text();
            if old.is_empty() {
                CellValue::Text(text)
            } else if values.len() == 4 {
                let instance = number(&values[3]).unwrap_or(1.0) as usize;
                let mut count = 0;
                let mut out = String::new();
                let mut remaining = text.as_str();
                while let Some(pos) = remaining.find(&old) {
                    count += 1;
                    out.push_str(&remaining[..pos]);
                    if count == instance {
                        out.push_str(&new);
                    } else {
                        out.push_str(&old);
                    }
                    remaining = &remaining[pos + old.len()..];
                }
                out.push_str(remaining);
                CellValue::Text(out)
            } else {
                CellValue::Text(text.replace(&old, &new))
            }
        }
        "VALUE" if values.len() == 1 => match number(&values[0]) {
            Some(n) => CellValue::Number(n),
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "TEXT" if values.len() == 2 => {
            let fmt = values[1].display_text();
            match number(&values[0]) {
                Some(n) if fmt.contains('%') => CellValue::Text(format!("{:.2}%", n * 100.0)),
                Some(n) if fmt.contains('$') => CellValue::Text(format!("${:.2}", n)),
                Some(n) => CellValue::Text(format!("{:.2}", n)),
                None => CellValue::Text(values[0].display_text()),
            }
        }

        // 8. Date and Time functions
        "TODAY" => {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64();
            let serial = (25569.0 + (secs / 86400.0)).floor();
            CellValue::Number(serial)
        }
        "NOW" => {
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64();
            let serial = 25569.0 + (secs / 86400.0);
            CellValue::Number(serial)
        }
        "DATE" if values.len() == 3 => match (number(&values[0]), number(&values[1]), number(&values[2])) {
            (Some(y), Some(m), Some(d)) => CellValue::Number(excel_serial_date(y as i32, m as i32, d as i32)),
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "TIME" if values.len() == 3 => match (number(&values[0]), number(&values[1]), number(&values[2])) {
            (Some(h), Some(m), Some(s)) => CellValue::Number((h * 3600.0 + m * 60.0 + s) / 86400.0),
            _ => CellValue::Error("#VALUE!".to_string()),
        },
        "YEAR" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let (y, _, _) = excel_from_serial_date(n);
                CellValue::Number(y as f64)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "MONTH" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let (_, m, _) = excel_from_serial_date(n);
                CellValue::Number(m as f64)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "DAY" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let (_, _, d) = excel_from_serial_date(n);
                CellValue::Number(d as f64)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "HOUR" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let frac = n.fract();
                let hours = (frac * 24.0).floor() % 24.0;
                CellValue::Number(hours)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "MINUTE" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let frac = n.fract();
                let mins = ((frac * 24.0).fract() * 60.0).floor() % 60.0;
                CellValue::Number(mins)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "SECOND" if values.len() == 1 => match number(&values[0]) {
            Some(n) => {
                let secs = ((n.fract() * 86400.0).round()) % 60.0;
                CellValue::Number(secs)
            }
            None => CellValue::Error("#VALUE!".to_string()),
        },
        "DAYS" if values.len() == 2 => match (number(&values[0]), number(&values[1])) {
            (Some(end), Some(start)) => CellValue::Number(end.floor() - start.floor()),
            _ => CellValue::Error("#VALUE!".to_string()),
        },

        _ => CellValue::Error("#NAME?".to_string()),
    };
    Value::Cell(result)
}

fn number(value: &CellValue) -> Option<f64> {
    match value {
        CellValue::Number(number) => Some(*number),
        CellValue::Boolean(true) => Some(1.0),
        CellValue::Boolean(false) | CellValue::Blank => Some(0.0),
        CellValue::Text(text) => text.trim().parse().ok(),
        CellValue::Formula(text) => text.trim().parse().ok(),
        CellValue::Error(_) => None,
    }
}

fn boolean(value: &CellValue) -> bool {
    match value {
        CellValue::Boolean(value) => *value,
        CellValue::Number(value) => *value != 0.0,
        CellValue::Text(value) => !value.is_empty(),
        CellValue::Blank => false,
        CellValue::Formula(value) => !value.is_empty(),
        CellValue::Error(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct Context(HashMap<String, CellValue>);
    impl FormulaContext for Context {
        fn cell(&self, reference: &str) -> CellValue {
            let (_, cell) = split_sheet_ref(reference);
            self.0
                .get(&cell.to_ascii_uppercase())
                .cloned()
                .unwrap_or(CellValue::Blank)
        }
        fn range(&self, first: &str, last: &str) -> Vec<CellValue> {
            let (_, cell1) = split_sheet_ref(first);
            let (_, cell2) = split_sheet_ref(last);
            let (Ok(a1), Ok(a2)) = (
                nom_workbook::CellAddress::parse(&cell1),
                nom_workbook::CellAddress::parse(&cell2),
            ) else {
                return vec![];
            };
            let mut res = Vec::new();
            for r in a1.row..=a2.row {
                for c in a1.column..=a2.column {
                    let key = nom_workbook::CellAddress { row: r, column: c }.to_string();
                    res.push(self.0.get(&key).cloned().unwrap_or(CellValue::Blank));
                }
            }
            res
        }
    }

    #[test]
    fn evaluates_precedence_references_and_ranges() {
        let mut context = Context(HashMap::new());
        context.0.insert("A1".into(), CellValue::Number(10.0));
        context.0.insert("A2".into(), CellValue::Number(20.0));
        assert_eq!(evaluate("=1+2*3^2", &context), CellValue::Number(19.0));
        assert_eq!(evaluate("=SUM(A1:A2)*2", &context), CellValue::Number(60.0));
    }

    #[test]
    fn if_short_circuits_unused_error_branch() {
        assert_eq!(
            evaluate("=IF(FALSE,1/0,10)", &Context(HashMap::new())),
            CellValue::Number(10.0)
        );
    }

    #[test]
    fn reports_division_and_unknown_function_errors() {
        let context = Context(HashMap::new());
        assert_eq!(evaluate("=1/0", &context), CellValue::Error("#DIV/0!".into()));
        assert_eq!(evaluate("=UNKNOWN(1)", &context), CellValue::Error("#NAME?".into()));
    }

    #[test]
    fn math_and_stats_functions() {
        let mut context = Context(HashMap::new());
        context.0.insert("A1".into(), CellValue::Number(10.0));
        context.0.insert("A2".into(), CellValue::Number(20.0));
        context.0.insert("A3".into(), CellValue::Number(30.0));
        assert_eq!(evaluate("=AVERAGE(A1:A3)", &context), CellValue::Number(20.0));
        assert_eq!(evaluate("=MIN(A1:A3)", &context), CellValue::Number(10.0));
        assert_eq!(evaluate("=MAX(A1:A3)", &context), CellValue::Number(30.0));
        assert_eq!(evaluate("=COUNT(A1:A3)", &context), CellValue::Number(3.0));
        assert_eq!(evaluate("=PRODUCT(A1:A2)", &context), CellValue::Number(200.0));
        assert_eq!(evaluate("=ROUND(12.3456, 2)", &context), CellValue::Number(12.35));
        assert_eq!(evaluate("=MOD(10, 3)", &context), CellValue::Number(1.0));
        assert_eq!(evaluate("=POWER(2, 3)", &context), CellValue::Number(8.0));
        assert_eq!(evaluate("=SQRT(16)", &context), CellValue::Number(4.0));
    }

    #[test]
    fn criteria_and_lookup_functions() {
        let mut context = Context(HashMap::new());
        context.0.insert("A1".into(), CellValue::Text("Táo".into()));
        context.0.insert("B1".into(), CellValue::Number(50.0));
        context.0.insert("A2".into(), CellValue::Text("Cam".into()));
        context.0.insert("B2".into(), CellValue::Number(30.0));
        context.0.insert("A3".into(), CellValue::Text("Táo".into()));
        context.0.insert("B3".into(), CellValue::Number(20.0));

        assert_eq!(evaluate("=COUNTIF(A1:A3, \"Táo\")", &context), CellValue::Number(2.0));
        assert_eq!(
            evaluate("=SUMIF(A1:A3, \"Táo\", B1:B3)", &context),
            CellValue::Number(70.0)
        );
        assert_eq!(
            evaluate("=VLOOKUP(\"Cam\", A1:B3, 2, FALSE)", &context),
            CellValue::Number(30.0)
        );
        assert_eq!(evaluate("=INDEX(A1:B3, 2, 1)", &context), CellValue::Text("Cam".into()));
        assert_eq!(evaluate("=MATCH(\"Cam\", A1:A3)", &context), CellValue::Number(2.0));
        assert_eq!(evaluate("=ROWS(A1:B3)", &context), CellValue::Number(3.0));
        assert_eq!(evaluate("=COLUMNS(A1:B3)", &context), CellValue::Number(2.0));
    }

    #[test]
    fn text_and_date_functions() {
        let context = Context(HashMap::new());
        assert_eq!(
            evaluate("=UPPER(\"vietnam\")", &context),
            CellValue::Text("VIETNAM".into())
        );
        assert_eq!(evaluate("=LOWER(\"ABC\")", &context), CellValue::Text("abc".into()));
        assert_eq!(evaluate("=LEN(\"Tiếng Việt\")", &context), CellValue::Number(10.0));
        assert_eq!(evaluate("=LEFT(\"Hà Nội\", 2)", &context), CellValue::Text("Hà".into()));
        assert_eq!(
            evaluate("=RIGHT(\"Hà Nội\", 3)", &context),
            CellValue::Text("Nội".into())
        );
        assert_eq!(
            evaluate("=CONCAT(\"A\", \"B\", \"C\")", &context),
            CellValue::Text("ABC".into())
        );
        assert_eq!(evaluate("=DATE(2026, 10, 12)", &context), CellValue::Number(46307.0));
        assert_eq!(evaluate("=YEAR(46307)", &context), CellValue::Number(2026.0));
        assert_eq!(evaluate("=MONTH(46307)", &context), CellValue::Number(10.0));
        assert_eq!(evaluate("=DAY(46307)", &context), CellValue::Number(12.0));
    }
}
