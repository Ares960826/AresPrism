//! Read a local Zotero SQLite library (not the zotero.org web API).
//!
//! Zotero keeps the live DB locked; we copy sqlite + WAL into a temp dir and
//! open the copy read-only.

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct ZoteroLocalState {
    inner: Mutex<Option<LocalSnapshot>>,
}

impl Default for ZoteroLocalState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

struct LocalSnapshot {
    #[allow(dead_code)]
    data_dir: PathBuf,
    db_path: PathBuf,
}

#[derive(Serialize, Clone)]
pub struct ZoteroLocalStatus {
    pub found: bool,
    pub data_dir: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ZoteroCollectionNode {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub item_count: i64,
    pub children: Vec<ZoteroCollectionNode>,
}

#[derive(Serialize, Clone)]
pub struct ZoteroLocalItem {
    pub key: String,
    pub title: String,
    pub creators: String,
    pub year: Option<String>,
    pub item_type: String,
    pub citekey: String,
}

#[derive(Serialize, Clone)]
pub struct ZoteroLocalItemDetail {
    pub item: ZoteroLocalItem,
    pub publication: Option<String>,
    pub abstract_note: Option<String>,
    pub bibtex: String,
}

fn default_data_dir() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join("Zotero"),
        home.join("Documents").join("Zotero"),
        zotero_profile_data_dir(&home).unwrap_or_default(),
    ];
    candidates.into_iter().find(|p| p.join("zotero.sqlite").is_file())
}

fn zotero_profile_data_dir(home: &Path) -> Option<PathBuf> {
    let profiles_root = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/Zotero")
    } else if cfg!(target_os = "windows") {
        home.join("AppData/Roaming/Zotero/Zotero")
    } else {
        home.join(".zotero/zotero")
    };
    let ini = profiles_root.join("profiles.ini");
    let text = std::fs::read_to_string(ini).ok()?;
    let mut relative = true;
    let mut path: Option<String> = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("IsRelative=") {
            relative = rest.trim() == "1";
        }
        if let Some(rest) = line.strip_prefix("Path=") {
            path = Some(rest.trim().to_string());
        }
    }
    let profile = path?;
    let profile_dir = if relative {
        profiles_root.join(profile)
    } else {
        PathBuf::from(profile)
    };
    let prefs = std::fs::read_to_string(profile_dir.join("prefs.js")).ok()?;
    for line in prefs.lines() {
        if let Some(dir) = parse_pref_string(line, "extensions.zotero.dataDir") {
            let p = PathBuf::from(dir);
            if p.join("zotero.sqlite").is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn parse_pref_string(line: &str, key: &str) -> Option<String> {
    let needle = format!("user_pref(\"{key}\",");
    let rest = line.trim().strip_prefix(&needle)?.trim();
    let rest = rest.strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(rest[..end].replace("\\\\", "\\"))
}

fn copy_sqlite(data_dir: &Path) -> Result<PathBuf, String> {
    let src = data_dir.join("zotero.sqlite");
    if !src.is_file() {
        return Err(format!("No zotero.sqlite in {}", data_dir.display()));
    }
    let dest_dir = std::env::temp_dir()
        .join("ares-prism-zotero")
        .join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join("zotero.sqlite");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let extra = data_dir.join(format!("zotero.sqlite{suffix}"));
        if extra.is_file() {
            let _ = std::fs::copy(&extra, dest_dir.join(format!("zotero.sqlite{suffix}")));
        }
    }
    Ok(dest)
}

fn open_copy(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Open Zotero copy: {e}"))?;
    conn.pragma_update(None, "query_only", true)
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn with_db<T>(
    state: &ZoteroLocalState,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    let snap = guard.as_ref().ok_or_else(|| {
        "Zotero library is not open. Choose the local Zotero data folder.".to_string()
    })?;
    let conn = open_copy(&snap.db_path)?;
    f(&conn)
}

fn user_library_id(conn: &Connection) -> Result<i64, String> {
    let id: Option<i64> = conn
        .query_row(
            "SELECT libraryID FROM libraries WHERE type = 'user' ORDER BY libraryID LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(id.unwrap_or(1))
}

fn excluded_type_clause() -> &'static str {
    "i.itemTypeID NOT IN (SELECT itemTypeID FROM itemTypes WHERE typeName IN ('attachment','note','annotation'))"
}

fn is_deleted_clause() -> &'static str {
    "i.itemID NOT IN (SELECT itemID FROM deletedItems)"
}

#[tauri::command]
pub fn zotero_local_status() -> ZoteroLocalStatus {
    match default_data_dir() {
        Some(dir) => ZoteroLocalStatus {
            found: true,
            data_dir: Some(dir.to_string_lossy().into_owned()),
            error: None,
        },
        None => ZoteroLocalStatus {
            found: false,
            data_dir: None,
            error: Some("No local Zotero database found. Open Zotero once, or pick the data folder.".into()),
        },
    }
}

#[tauri::command]
pub fn zotero_local_open(
    state: tauri::State<'_, ZoteroLocalState>,
    data_dir: Option<String>,
) -> Result<ZoteroLocalStatus, String> {
    let dir = match data_dir {
        Some(s) => PathBuf::from(s),
        None => default_data_dir()
            .ok_or_else(|| "No local Zotero database found.".to_string())?,
    };
    let db_path = copy_sqlite(&dir)?;
    // Probe the copy.
    drop(open_copy(&db_path)?);
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(old) = guard.take() {
        if let Some(parent) = old.db_path.parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }
    *guard = Some(LocalSnapshot {
        data_dir: dir.clone(),
        db_path,
    });
    Ok(ZoteroLocalStatus {
        found: true,
        data_dir: Some(dir.to_string_lossy().into_owned()),
        error: None,
    })
}

#[tauri::command]
pub fn zotero_local_tree(
    state: tauri::State<'_, ZoteroLocalState>,
) -> Result<Vec<ZoteroCollectionNode>, String> {
    with_db(&state, |conn| {
        let library_id = user_library_id(conn)?;
        let mut stmt = conn
            .prepare(
                "SELECT c.key, c.collectionName, p.key, c.collectionID
                 FROM collections c
                 LEFT JOIN collections p ON p.collectionID = c.parentCollectionID
                 WHERE c.libraryID = ?1
                   AND c.collectionID NOT IN (SELECT collectionID FROM deletedCollections)
                 ORDER BY c.collectionName COLLATE NOCASE",
            )
            .or_else(|_| {
                conn.prepare(
                    "SELECT c.key, c.collectionName, p.key, c.collectionID
                     FROM collections c
                     LEFT JOIN collections p ON p.collectionID = c.parentCollectionID
                     WHERE c.libraryID = ?1
                     ORDER BY c.collectionName COLLATE NOCASE",
                )
            })
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([library_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut nodes: Vec<(String, String, Option<String>, i64)> = Vec::new();
        for row in rows {
            nodes.push(row.map_err(|e| e.to_string())?);
        }

        let mut counts: HashMap<i64, i64> = HashMap::new();
        if let Ok(mut count_stmt) = conn.prepare(&format!(
            "SELECT ci.collectionID, COUNT(*)
             FROM collectionItems ci
             JOIN items i ON i.itemID = ci.itemID
             WHERE {excl} AND {alive}
             GROUP BY ci.collectionID",
            excl = excluded_type_clause(),
            alive = is_deleted_clause(),
        )) {
            if let Ok(count_rows) = count_stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            }) {
                for row in count_rows.flatten() {
                    counts.insert(row.0, row.1);
                }
            }
        }

        let mut by_parent: HashMap<Option<String>, Vec<ZoteroCollectionNode>> = HashMap::new();
        for (key, name, parent_key, collection_id) in nodes {
            let item_count = counts.get(&collection_id).copied().unwrap_or(0);
            by_parent
                .entry(parent_key.clone())
                .or_default()
                .push(ZoteroCollectionNode {
                    key,
                    name,
                    parent_key,
                    item_count,
                    children: Vec::new(),
                });
        }

        fn attach(
            parent: Option<String>,
            by_parent: &mut HashMap<Option<String>, Vec<ZoteroCollectionNode>>,
        ) -> Vec<ZoteroCollectionNode> {
            let mut nodes = by_parent.remove(&parent).unwrap_or_default();
            for node in &mut nodes {
                node.children = attach(Some(node.key.clone()), by_parent);
            }
            nodes
        }

        Ok(attach(None, &mut by_parent))
    })
}

#[tauri::command]
pub fn zotero_local_items(
    state: tauri::State<'_, ZoteroLocalState>,
    collection_key: Option<String>,
) -> Result<Vec<ZoteroLocalItem>, String> {
    with_db(&state, |conn| {
        let library_id = user_library_id(conn)?;
        let sql = if collection_key.is_some() {
            format!(
                "SELECT i.itemID, i.key, t.typeName
                 FROM items i
                 JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                 JOIN collectionItems ci ON ci.itemID = i.itemID
                 JOIN collections c ON c.collectionID = ci.collectionID
                 WHERE c.key = ?1 AND i.libraryID = ?2 AND {excl} AND {alive}
                 ORDER BY i.dateModified DESC",
                excl = excluded_type_clause(),
                alive = is_deleted_clause(),
            )
        } else {
            format!(
                "SELECT i.itemID, i.key, t.typeName
                 FROM items i
                 JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                 WHERE i.libraryID = ?1 AND {excl} AND {alive}
                 ORDER BY i.dateModified DESC
                 LIMIT 400",
                excl = excluded_type_clause(),
                alive = is_deleted_clause(),
            )
        };

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut items = Vec::new();
        if let Some(key) = collection_key {
            let rows = stmt
                .query_map(rusqlite::params![key, library_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (id, key, ty) = row.map_err(|e| e.to_string())?;
                items.push(load_item(conn, id, key, ty)?);
            }
        } else {
            let rows = stmt
                .query_map([library_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (id, key, ty) = row.map_err(|e| e.to_string())?;
                items.push(load_item(conn, id, key, ty)?);
            }
        }
        Ok(items)
    })
}

#[tauri::command]
pub fn zotero_local_item_detail(
    state: tauri::State<'_, ZoteroLocalState>,
    item_key: String,
) -> Result<ZoteroLocalItemDetail, String> {
    with_db(&state, |conn| {
        let (item_id, ty): (i64, String) = conn
            .query_row(
                "SELECT i.itemID, t.typeName FROM items i
                 JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                 WHERE i.key = ?1",
                [&item_key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| format!("Item not found: {item_key}"))?;
        let item = load_item(conn, item_id, item_key, ty)?;
        let fields = item_fields(conn, item_id)?;
        Ok(ZoteroLocalItemDetail {
            publication: fields
                .get("publicationTitle")
                .cloned()
                .or_else(|| fields.get("bookTitle").cloned())
                .or_else(|| fields.get("proceedingsTitle").cloned())
                .or_else(|| fields.get("university").cloned()),
            abstract_note: fields.get("abstractNote").cloned(),
            bibtex: item_to_bibtex(&item, &fields, &item_creators(conn, item_id)?),
            item,
        })
    })
}

#[tauri::command]
pub fn zotero_local_bibtex(
    state: tauri::State<'_, ZoteroLocalState>,
    collection_key: Option<String>,
    item_key: Option<String>,
) -> Result<String, String> {
    with_db(&state, |conn| {
        if let Some(key) = item_key {
            let (item_id, ty): (i64, String) = conn
                .query_row(
                    "SELECT i.itemID, t.typeName FROM items i
                     JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                     WHERE i.key = ?1",
                    [&key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| format!("Item not found: {key}"))?;
            let item = load_item(conn, item_id, key, ty)?;
            let fields = item_fields(conn, item_id)?;
            let creators = item_creators(conn, item_id)?;
            return Ok(item_to_bibtex(&item, &fields, &creators));
        }

        let library_id = user_library_id(conn)?;
        let sql = if collection_key.is_some() {
            format!(
                "SELECT i.itemID, i.key, t.typeName
                 FROM items i
                 JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                 JOIN collectionItems ci ON ci.itemID = i.itemID
                 JOIN collections c ON c.collectionID = ci.collectionID
                 WHERE c.key = ?1 AND i.libraryID = ?2 AND {excl} AND {alive}
                 ORDER BY i.dateModified DESC",
                excl = excluded_type_clause(),
                alive = is_deleted_clause(),
            )
        } else {
            format!(
                "SELECT i.itemID, i.key, t.typeName
                 FROM items i
                 JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                 WHERE i.libraryID = ?1 AND {excl} AND {alive}
                 ORDER BY i.dateModified DESC
                 LIMIT 400",
                excl = excluded_type_clause(),
                alive = is_deleted_clause(),
            )
        };
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<(i64, String, String)> = if let Some(key) = collection_key.as_ref() {
            stmt.query_map(rusqlite::params![key, library_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
        } else {
            stmt.query_map([library_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
        };

        let mut out = String::new();
        for (id, key, ty) in rows {
            let item = load_item(conn, id, key, ty)?;
            let fields = item_fields(conn, id)?;
            let creators = item_creators(conn, id)?;
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&item_to_bibtex(&item, &fields, &creators));
            if !out.ends_with('\n') {
                out.push('\n');
            }
        }
        Ok(out)
    })
}

fn load_item(
    conn: &Connection,
    item_id: i64,
    key: String,
    item_type: String,
) -> Result<ZoteroLocalItem, String> {
    let fields = item_fields(conn, item_id)?;
    let creators = item_creators(conn, item_id)?;
    let title = fields
        .get("title")
        .cloned()
        .or_else(|| fields.get("shortTitle").cloned())
        .unwrap_or_else(|| "(untitled)".into());
    let year = fields
        .get("date")
        .and_then(|d| extract_year(d))
        .or_else(|| fields.get("year").and_then(|d| extract_year(d)));
    let extra = fields.get("extra").cloned().unwrap_or_default();
    let citekey = citekey_from_extra(&extra)
        .unwrap_or_else(|| generate_citekey(&creators, year.as_deref(), &title));
    let creator_label = format_creator_label(&creators);
    Ok(ZoteroLocalItem {
        key,
        title,
        creators: creator_label,
        year,
        item_type,
        citekey,
    })
}

fn item_fields(conn: &Connection, item_id: i64) -> Result<HashMap<String, String>, String> {
    let sqls = [
        "SELECT f.fieldName, v.value
         FROM itemData d
         JOIN itemDataValues v ON v.valueID = d.valueID
         JOIN fieldsCombined f ON f.fieldID = d.fieldID
         WHERE d.itemID = ?1",
        "SELECT f.fieldName, v.value
         FROM itemData d
         JOIN itemDataValues v ON v.valueID = d.valueID
         JOIN fields f ON f.fieldID = d.fieldID
         WHERE d.itemID = ?1",
    ];
    for sql in sqls {
        if let Ok(mut stmt) = conn.prepare(sql) {
            let rows = stmt.query_map([item_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            });
            if let Ok(rows) = rows {
                let mut map = HashMap::new();
                for row in rows.flatten() {
                    map.insert(row.0, row.1);
                }
                if !map.is_empty() {
                    return Ok(map);
                }
            }
        }
    }
    Ok(HashMap::new())
}

struct CreatorRow {
    first: String,
    last: String,
    kind: String,
}

fn item_creators(conn: &Connection, item_id: i64) -> Result<Vec<CreatorRow>, String> {
    let mut stmt = match conn.prepare(
        "SELECT c.firstName, c.lastName, ct.creatorType
         FROM itemCreators ic
         JOIN creators c ON c.creatorID = ic.creatorID
         JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID
         WHERE ic.itemID = ?1
         ORDER BY ic.orderIndex",
    ) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };
    let rows = stmt
        .query_map([item_id], |row| {
            Ok(CreatorRow {
                first: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                last: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                kind: row.get::<_, String>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn format_creator_label(creators: &[CreatorRow]) -> String {
    let preferred: Vec<&CreatorRow> = creators
        .iter()
        .filter(|c| c.kind == "author" || c.kind == "editor")
        .collect();
    let source: Vec<&CreatorRow> = if preferred.is_empty() {
        creators.iter().collect()
    } else {
        preferred
    };
    source
        .into_iter()
        .take(3)
        .map(|c| {
            if c.last.is_empty() {
                c.first.clone()
            } else if c.first.is_empty() {
                c.last.clone()
            } else {
                format!("{} {}", c.first, c.last)
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn extract_year(date: &str) -> Option<String> {
    let bytes = date.as_bytes();
    let mut i = 0;
    while i + 3 < bytes.len() {
        if bytes[i].is_ascii_digit()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
        {
            return Some(date[i..i + 4].to_string());
        }
        i += 1;
    }
    None
}

fn citekey_from_extra(extra: &str) -> Option<String> {
    for line in extra.lines() {
        let line = line.trim();
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("citation key:") {
            let original_rest = line[line.len() - rest.len()..].trim();
            if !original_rest.is_empty() {
                return Some(sanitize_citekey(original_rest));
            }
        }
        if let Some(rest) = line.strip_prefix("Citation Key:") {
            let key = rest.trim();
            if !key.is_empty() {
                return Some(sanitize_citekey(key));
            }
        }
    }
    None
}

fn sanitize_citekey(raw: &str) -> String {
    let mut out = String::new();
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == ':' {
            out.push(ch);
        }
    }
    if out.is_empty() {
        "ref".into()
    } else if out.as_bytes()[0].is_ascii_digit() {
        format!("ref{out}")
    } else {
        out
    }
}

fn generate_citekey(creators: &[CreatorRow], year: Option<&str>, title: &str) -> String {
    let last = creators
        .iter()
        .find(|c| c.kind == "author")
        .or_else(|| creators.first())
        .map(|c| {
            let s = if c.last.is_empty() {
                c.first.as_str()
            } else {
                c.last.as_str()
            };
            s.chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "ref".into());
    let year = year.unwrap_or("nd");
    let word = title
        .split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .find(|w| w.len() > 3)
        .unwrap_or_default();
    sanitize_citekey(&format!("{last}{year}{word}"))
}

fn bib_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('{', "\\{")
        .replace('}', "\\}")
}

fn bib_type(item_type: &str) -> &'static str {
    match item_type {
        "journalArticle" => "article",
        "conferencePaper" => "inproceedings",
        "book" => "book",
        "bookSection" => "incollection",
        "thesis" => "phdthesis",
        "report" => "techreport",
        "webpage" => "misc",
        "preprint" => "article",
        "manuscript" => "unpublished",
        _ => "misc",
    }
}

fn item_to_bibtex(
    item: &ZoteroLocalItem,
    fields: &HashMap<String, String>,
    creators: &[CreatorRow],
) -> String {
    let ty = bib_type(&item.item_type);
    let mut body = String::new();
    let authors: Vec<String> = creators
        .iter()
        .filter(|c| c.kind == "author")
        .map(|c| {
            if c.first.is_empty() {
                c.last.clone()
            } else {
                format!("{}, {}", c.last, c.first)
            }
        })
        .collect();
    let authors = if authors.is_empty() {
        creators
            .iter()
            .filter(|c| c.kind == "editor")
            .map(|c| format!("{}, {}", c.last, c.first))
            .collect::<Vec<_>>()
    } else {
        authors
    };
    if !authors.is_empty() {
        body.push_str(&format!(
            "  author = {{{}}},\n",
            bib_escape(&authors.join(" and "))
        ));
    }
    body.push_str(&format!("  title = {{{}}},\n", bib_escape(&item.title)));
    if let Some(year) = &item.year {
        body.push_str(&format!("  year = {{{year}}},\n"));
    }
    let field_map = [
        ("publicationTitle", "journal"),
        ("bookTitle", "booktitle"),
        ("proceedingsTitle", "booktitle"),
        ("publisher", "publisher"),
        ("university", "school"),
        ("volume", "volume"),
        ("issue", "number"),
        ("pages", "pages"),
        ("DOI", "doi"),
        ("doi", "doi"),
        ("url", "url"),
        ("ISSN", "issn"),
        ("isbn", "isbn"),
        ("place", "address"),
        ("series", "series"),
    ];
    for (src, dest) in field_map {
        if let Some(val) = fields.get(src) {
            if !val.is_empty() {
                body.push_str(&format!("  {dest} = {{{}}},\n", bib_escape(val)));
            }
        }
    }
    format!("@{}{{{},\n{}}}\n", ty, item.citekey, body)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn year_from_zotero_date() {
        assert_eq!(extract_year("2024-03-15"), Some("2024".into()));
        assert_eq!(extract_year("2020"), Some("2020".into()));
        assert_eq!(extract_year("accessed 2019-01"), Some("2019".into()));
        assert_eq!(extract_year("n.d."), None);
    }

    #[test]
    fn citation_key_in_extra() {
        assert_eq!(
            citekey_from_extra("Citation Key: smith2020deep"),
            Some("smith2020deep".into())
        );
        assert_eq!(
            citekey_from_extra("Some note\ncitation key: Foo_2021\n"),
            Some("Foo_2021".into())
        );
        assert_eq!(citekey_from_extra("nothing here"), None);
    }

    #[test]
    fn generated_citekey_is_stable() {
        let creators = vec![CreatorRow {
            first: "Jane".into(),
            last: "Smith".into(),
            kind: "author".into(),
        }];
        assert_eq!(
            generate_citekey(&creators, Some("2020"), "Deep Residual Learning"),
            "smith2020deep"
        );
    }

    fn seed_min_db(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE libraries (libraryID INTEGER PRIMARY KEY, type TEXT);
            CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT);
            CREATE TABLE fieldsCombined (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
            CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
            CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
            CREATE TABLE items (
              itemID INTEGER PRIMARY KEY, itemTypeID INTEGER, libraryID INTEGER, key TEXT,
              dateModified TEXT
            );
            CREATE TABLE deletedItems (itemID INTEGER PRIMARY KEY);
            CREATE TABLE collections (
              collectionID INTEGER PRIMARY KEY, collectionName TEXT,
              parentCollectionID INTEGER, libraryID INTEGER, key TEXT
            );
            CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
            CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT);
            CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT);
            CREATE TABLE itemCreators (
              itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER
            );
            INSERT INTO libraries VALUES (1, 'user');
            INSERT INTO itemTypes VALUES (1, 'journalArticle'), (2, 'attachment'), (3, 'note');
            INSERT INTO fieldsCombined VALUES (1, 'title'), (2, 'date'), (3, 'publicationTitle'), (4, 'extra');
            INSERT INTO creatorTypes VALUES (1, 'author');
            INSERT INTO creators VALUES (1, 'Jane', 'Smith');
            INSERT INTO items VALUES (10, 1, 1, 'ABCD1234', '2024-01-01');
            INSERT INTO itemDataValues VALUES (1, 'Deep Residual Networks'), (2, '2020-06'), (3, 'CVPR'), (4, 'Citation Key: smith2020deep');
            INSERT INTO itemData VALUES (10, 1, 1), (10, 2, 2), (10, 3, 3), (10, 4, 4);
            INSERT INTO itemCreators VALUES (10, 1, 1, 0);
            INSERT INTO collections VALUES (5, 'Vision', NULL, 1, 'COL1');
            INSERT INTO collectionItems VALUES (5, 10);
            ",
        )
        .expect("seed");
    }

    #[test]
    fn tree_and_bibtex_from_min_schema() {
        let conn = Connection::open_in_memory().expect("mem");
        seed_min_db(&conn);
        let library_id = user_library_id(&conn).expect("lib");
        assert_eq!(library_id, 1);

        let item = load_item(&conn, 10, "ABCD1234".into(), "journalArticle".into()).expect("item");
        assert_eq!(item.citekey, "smith2020deep");
        assert_eq!(item.year.as_deref(), Some("2020"));
        let fields = item_fields(&conn, 10).expect("fields");
        let creators = item_creators(&conn, 10).expect("creators");
        let bib = item_to_bibtex(&item, &fields, &creators);
        assert!(bib.contains("@article{smith2020deep,"));
        assert!(bib.contains("journal = {CVPR}"));
        assert!(bib.contains("author = {Smith, Jane}"));
    }
}
