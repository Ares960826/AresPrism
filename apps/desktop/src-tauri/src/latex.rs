use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};

const MAX_CONCURRENT: usize = 3;

/// Windows CREATE_NO_WINDOW flag to prevent console windows from flashing
/// when spawning TeXLive/Tectonic child processes from the GUI app.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Clone)]
struct BuildInfo {
    work_dir: PathBuf,
    main_file_name: String,
    source_prefix: PathBuf,
    synctex_index: Arc<std::sync::Mutex<Option<Arc<SynctexIndex>>>>,
}

#[derive(Clone)]
pub struct LatexCompilerState {
    last_builds: Arc<Mutex<HashMap<String, BuildInfo>>>,
    /// Per-project locks to prevent concurrent compilations on the same build directory.
    project_locks: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    semaphore: Arc<Semaphore>,
}

impl Default for LatexCompilerState {
    fn default() -> Self {
        Self {
            last_builds: Arc::new(Mutex::new(HashMap::new())),
            project_locks: Arc::new(Mutex::new(HashMap::new())),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT)),
        }
    }
}

#[derive(serde::Serialize)]
pub struct SynctexResult {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(serde::Serialize)]
pub struct SynctexViewResult {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// --- Helpers ---

fn extract_error_lines(log: &str) -> String {
    if log.is_empty() {
        return String::new();
    }

    let lines: Vec<&str> = log.lines().collect();

    let mut blocks: Vec<String> = Vec::new();
    let mut i = 0;
    while i < lines.len() && blocks.len() < 5 {
        let line = lines[i];
        let is_error_start =
            line.starts_with('!') || line.contains("Error:") || line.contains("error:");

        if is_error_start {
            let end = (i + 14).min(lines.len());
            blocks.push(lines[i..end].join("\n"));
            i = end;
            continue;
        }

        i += 1;
    }

    if !blocks.is_empty() {
        let mut result = blocks.join("\n\n");
        result.push_str("\n\n---- Engine output ----\n");
        let tail_start = lines.len().saturating_sub(20);
        result.push_str(&lines[tail_start..].join("\n"));
        return result;
    }

    if lines.iter().any(|l| l.contains("No pages of output")) {
        return "No pages of output. Add visible content to the document body.".to_string();
    }

    // Fallback: return tail of log
    let start = log.len().saturating_sub(500);
    log[start..].to_string()
}

/// Check if the log contains real TeX errors (! lines or Error: messages).
fn has_real_errors(log: &str) -> bool {
    log.lines()
        .any(|l| l.starts_with('!') || l.contains("Error:"))
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum TexEngine {
    Latex,
    XeLaTeX,
    LuaLaTeX,
}

/// Detect TeX engine from `% !TEX program = <engine>` magic comment in the first 20 lines.
fn detect_tex_engine(content: &str) -> Option<TexEngine> {
    for line in content.lines().take(20) {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix('%') {
            let rest = rest.trim();
            if let Some(rest) = rest.strip_prefix("!TEX") {
                let rest = rest.trim();
                if let Some(rest) = rest.strip_prefix("program") {
                    let rest = rest.trim();
                    if let Some(rest) = rest.strip_prefix('=') {
                        let engine = rest.trim().to_lowercase();
                        return match engine.as_str() {
                            "xelatex" => Some(TexEngine::XeLaTeX),
                            "lualatex" => Some(TexEngine::LuaLaTeX),
                            "pdflatex" | "latex" => Some(TexEngine::Latex),
                            _ => None,
                        };
                    }
                }
            }
        }
    }
    None
}

#[derive(Debug, PartialEq)]
enum BibTool {
    Biber,
    BibTeX,
    None,
}

/// Detect which bibliography tool is needed by scanning .tex content.
fn detect_bib_tool(content: &str) -> BibTool {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('%') {
            continue;
        }
        if trimmed.contains("\\usepackage") && trimmed.contains("biblatex") {
            return BibTool::Biber;
        }
    }
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('%') {
            continue;
        }
        if trimmed.contains("\\bibliography{") || trimmed.contains("\\addbibresource{") {
            return BibTool::BibTeX;
        }
    }
    BibTool::None
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum CompileBackend {
    Tectonic,
    Texlive,
    Latexmk,
}

fn parse_compile_backend(backend: Option<&str>, use_texlive: Option<bool>) -> CompileBackend {
    match backend.map(str::to_ascii_lowercase).as_deref() {
        Some("latexmk") => CompileBackend::Latexmk,
        Some("texlive") => CompileBackend::Texlive,
        Some("tectonic") => CompileBackend::Tectonic,
        _ if use_texlive == Some(true) => CompileBackend::Texlive,
        _ => CompileBackend::Tectonic,
    }
}

fn parse_engine_pref(pref: Option<&str>) -> Option<TexEngine> {
    match pref.map(str::to_ascii_lowercase).as_deref() {
        Some("pdflatex" | "latex") => Some(TexEngine::Latex),
        Some("xelatex") => Some(TexEngine::XeLaTeX),
        Some("lualatex") => Some(TexEngine::LuaLaTeX),
        _ => None,
    }
}

/// Infer engine from source when there is no `% !TEX program`.
/// pdfTeX-only primitives (`\pdfglyphtounicode`, glyphtounicode) must not run on XeLaTeX.
fn infer_tex_engine(content: &str) -> Option<TexEngine> {
    let lower = content.to_ascii_lowercase();
    if lower.contains("glyphtounicode")
        || lower.contains("\\pdfgentounicode")
        || lower.contains("\\pdfglyphtounicode")
    {
        return Some(TexEngine::Latex);
    }
    if lower.contains("{fontspec}")
        || lower.contains("{xecjk}")
        || lower.contains("\\setmainfont")
        || lower.contains("\\setcjkmainsfont")
        || lower.contains("\\setcjktmainfont")
    {
        return Some(TexEngine::XeLaTeX);
    }
    if lower.contains("{luacode}") || lower.contains("{luatextra}") {
        return Some(TexEngine::LuaLaTeX);
    }
    None
}

fn resolve_compile_engine(
    magic: Option<TexEngine>,
    inferred: Option<TexEngine>,
    preferred: Option<TexEngine>,
) -> TexEngine {
    magic.or(inferred).or(preferred).unwrap_or(TexEngine::Latex)
}

fn engine_bin_name(engine: TexEngine) -> &'static str {
    match engine {
        TexEngine::Latex => "pdflatex",
        TexEngine::XeLaTeX => "xelatex",
        TexEngine::LuaLaTeX => "lualatex",
    }
}

fn latexmk_args(engine: TexEngine) -> Vec<&'static str> {
    let engine_flag = match engine {
        TexEngine::Latex => "-pdf",
        TexEngine::XeLaTeX => "-xelatex",
        TexEngine::LuaLaTeX => "-lualatex",
    };
    vec![engine_flag, "-interaction=nonstopmode", "-synctex=1"]
}

fn unix_texlive_candidate_paths(name: &str) -> Vec<PathBuf> {
    let years = ["2026", "2025", "2024"];
    let mut paths = vec![PathBuf::from(format!("/Library/TeX/texbin/{name}"))];
    for year in years {
        paths.push(PathBuf::from(format!(
            "/usr/local/texlive/{year}/bin/universal-darwin/{name}"
        )));
        paths.push(PathBuf::from(format!(
            "/usr/local/texlive/{year}/bin/x86_64-linux/{name}"
        )));
    }
    paths.push(PathBuf::from(format!("/opt/homebrew/bin/{name}")));
    paths.push(PathBuf::from(format!("/usr/bin/{name}")));
    paths
}

fn windows_texlive_candidate_paths(name: &str) -> Vec<PathBuf> {
    ["2026", "2025", "2024"]
        .iter()
        .map(|year| PathBuf::from(format!("C:\\texlive\\{year}\\bin\\windows\\{name}.exe")))
        .collect()
}

/// Resolve a TeXLive engine binary to its full path.
/// GUI apps on macOS lack the user's shell PATH, so we check standard
/// TeXLive installation locations and fall back to a login-shell query.
fn find_texlive_binary(name: &str) -> Result<PathBuf, String> {
    // 1. Try PATH (works when launched from terminal)
    if let Ok(path) = which::which(name) {
        return Ok(path);
    }

    // 2. Check standard TeXLive locations
    #[cfg(not(target_os = "windows"))]
    {
        for p in unix_texlive_candidate_paths(name) {
            if p.exists() {
                return Ok(p);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for p in windows_texlive_candidate_paths(name) {
            if p.exists() {
                return Ok(p);
            }
        }
    }

    // 3. macOS: ask login shell for PATH
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("/bin/zsh")
            .args(["-l", "-c", &format!("which {}", name)])
            .output()
        {
            if output.status.success() {
                let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let p = PathBuf::from(&resolved);
                if p.exists() {
                    return Ok(p);
                }
            }
        }
    }

    Err(format!(
        "{} not found. Install TeXLive or add it to your PATH.",
        name
    ))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            // Skip hidden directories (.git, .claudeprism, etc.)
            let name = entry.file_name();
            if name.to_string_lossy().starts_with('.') {
                continue;
            }
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Sync only source files (.tex, .bib, .sty, .cls, .bst, images, .pdf figures) from project to build dir.
/// Skips build artifacts (.aux, .log, .toc, .synctex.gz, etc.) to preserve them.
/// Note: .pdf is NOT skipped — figure PDFs must be synced. The output PDF is managed by compile_latex.
fn sync_source_files(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let file_name = entry.file_name();
        let dst_path = dst.join(&file_name);
        if src_path.is_dir() {
            let name = file_name.to_string_lossy();
            if name.starts_with('.') || matches!(name.as_ref(), "node_modules" | "target" | "dist")
            {
                continue;
            }
            sync_source_files(&src_path, &dst_path)?;
        } else {
            let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let is_artifact = matches!(
                ext,
                "aux"
                    | "log"
                    | "toc"
                    | "lof"
                    | "lot"
                    | "out"
                    | "nav"
                    | "snm"
                    | "vrb"
                    | "bbl"
                    | "blg"
                    | "fls"
                    | "fdb_latexmk"
                    | "synctex"
                    | "idx"
                    | "ind"
                    | "ilg"
                    | "glo"
                    | "gls"
                    | "glg"
                    | "fmt"
                    | "xdv"
            );
            let is_synctex = src_path.to_string_lossy().ends_with(".synctex.gz");
            if !is_artifact && !is_synctex {
                // Cloud storage (Dropbox/iCloud) may keep files as online-only
                // placeholders with 0 bytes. Reading the file forces a download.
                let metadata = std::fs::metadata(&src_path)?;

                if metadata.len() > 0 {
                    if let Ok(dst_meta) = std::fs::metadata(&dst_path) {
                        if metadata.len() == dst_meta.len() {
                            if let (Ok(src_m), Ok(dst_m)) =
                                (metadata.modified(), dst_meta.modified())
                            {
                                if src_m == dst_m {
                                    continue;
                                }
                            }
                        }
                    }
                }

                if metadata.len() == 0 {
                    // Attempt to materialize the file by reading it
                    let data = std::fs::read(&src_path)?;
                    if !data.is_empty() {
                        std::fs::write(&dst_path, &data)?;
                    } else {
                        std::fs::copy(&src_path, &dst_path)?;
                    }
                } else {
                    std::fs::copy(&src_path, &dst_path)?;
                }
            }
        }
    }
    Ok(())
}

/// Persistent build directory inside the project.
/// Stored in `<project>/.prism/build/` — hidden from file tree (dot-prefix is filtered).
fn persistent_build_dir(project_dir: &str) -> PathBuf {
    PathBuf::from(project_dir.trim_end_matches(['/', '\\']))
        .join(".prism")
        .join("build")
}

fn jobname_from_main_file(main_file: &str) -> String {
    let stem = Path::new(main_file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");
    let safe: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = if safe.is_empty() { "document" } else { &safe };
    if Path::new(main_file)
        .parent()
        .is_none_or(|parent| parent.as_os_str().is_empty())
    {
        safe.to_string()
    } else {
        // Several subprojects commonly contain main.tex. Keep their build
        // artifacts separate without creating an unbounded directory name.
        let hash = main_file
            .as_bytes()
            .iter()
            .fold(0xcbf29ce484222325_u64, |h, byte| {
                (h ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            });
        format!("{safe}-{hash:016x}")
    }
}

fn persistent_build_dir_for(project_dir: &str, main_file: &str) -> PathBuf {
    persistent_build_dir(project_dir).join(jobname_from_main_file(main_file))
}

// --- Thread priority ---

/// Lower the current thread's scheduling priority so CPU-heavy compilation
/// does not starve the WebView's main thread (and thus the UI / typing).
fn lower_thread_priority() {
    #[cfg(target_os = "macos")]
    {
        // QOS_CLASS_UTILITY (0x11) — lower than default, appropriate for long-running work.
        extern "C" {
            fn pthread_set_qos_class_self_np(qos_class: u32, relative_priority: i32) -> i32;
        }
        unsafe { pthread_set_qos_class_self_np(0x11, 0) };
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        extern "C" {
            fn nice(inc: i32) -> i32;
        }
        unsafe { nice(10) };
    }
}

// --- Tectonic Compilation ---

pub(crate) fn compile_with_tectonic(work_dir: &Path, main_file: &str) -> Result<(), String> {
    use tectonic::config::PersistentConfig;
    use tectonic::driver::{OutputFormat, PassSetting, ProcessingSessionBuilder};
    use tectonic::status::NoopStatusBackend;

    let mut status = NoopStatusBackend {};

    let config = PersistentConfig::open(false)
        .map_err(|e| format!("Failed to open tectonic config: {}", e))?;

    let bundle = config.default_bundle(false, &mut status).map_err(|e| {
        format!(
            "Failed to load tectonic bundle (check network connection): {}",
            e
        )
    })?;

    let format_cache = config
        .format_cache_path()
        .map_err(|e| format!("Failed to get format cache path: {}", e))?;

    let mut builder = ProcessingSessionBuilder::default();
    builder
        .bundle(bundle)
        .primary_input_path(work_dir.join(main_file))
        .tex_input_name(main_file)
        .filesystem_root(work_dir)
        .output_dir(work_dir)
        .format_name("latex")
        .format_cache_path(format_cache)
        .output_format(OutputFormat::Pdf)
        .pass(PassSetting::Default)
        .synctex(true)
        .keep_intermediates(true)
        .keep_logs(true);

    let mut session = builder
        .create(&mut status)
        .map_err(|e| format!("Failed to create tectonic session: {}", e))?;

    session.run(&mut status).map_err(|e| format!("{}", e))?;

    Ok(())
}

/// Run tectonic compilation in an isolated subprocess.
///
/// This avoids the font cache assertion failure (`font_cache.fonts == NULL`)
/// that occurs when tectonic is called multiple times in the same process.
/// The C-level static `font_cache` in `dpx-pdffont.c` is not cleaned up
/// on compilation failure, causing subsequent calls to abort.
///
/// By spawning a subprocess, each compilation gets a fresh process with
/// clean global state, and cleanup happens automatically on process exit.
fn compile_with_tectonic_subprocess(work_dir: &Path, main_file: &str) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;

    let mut cmd = std::process::Command::new(&exe);
    cmd.args(["--tectonic-compile", &work_dir.to_string_lossy(), main_file])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to spawn tectonic subprocess: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}

// --- TeXLive Compilation ---

/// Build a PATH that includes the TeXLive bin directory so that xelatex
/// can find xdvipdfmx, kpsewhich, and other tools it invokes internally.
/// GUI apps on macOS have a minimal PATH that doesn't include TeXLive.
fn texlive_env_path(engine: &Path) -> String {
    let texbin = engine
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let current_path = std::env::var("PATH").unwrap_or_default();
    if current_path.contains(&texbin) {
        current_path
    } else {
        #[cfg(target_os = "windows")]
        {
            format!("{};{}", texbin, current_path)
        }
        #[cfg(not(target_os = "windows"))]
        {
            format!("{}:{}", texbin, current_path)
        }
    }
}

/// Run a single TeX engine pass.  Never returns `Err` for a non-zero exit
/// code — TeXLive returns non-zero for warnings, font substitutions, etc.
/// The only `Err` is when the process cannot be *spawned* at all.
/// The caller decides success by checking whether the PDF was produced.
fn run_texlive_pass(
    engine: &Path,
    args: &[&str],
    main_file: &Path,
    work_dir: &Path,
) -> Result<(), String> {
    let mut cmd = std::process::Command::new(engine);
    cmd.args(args)
        .arg(main_file)
        .current_dir(work_dir)
        .env("PATH", texlive_env_path(engine))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch {}: {}", engine.display(), e))?;

    // TeXLive returns non-zero on warnings too — don't fail here.
    // The caller decides success by checking whether the PDF was produced.
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            eprintln!("[texlive] engine stderr: {}", stderr.trim());
        }
    }
    Ok(())
}

fn compile_with_latexmk(work_dir: &Path, main_file: &str, engine: TexEngine) -> Result<(), String> {
    let latexmk = find_texlive_binary("latexmk")?;
    let engine_path = find_texlive_binary(engine_bin_name(engine))?;
    let env_path = texlive_env_path(&engine_path);
    eprintln!(
        "[latexmk] backend: {} ({}) via {}",
        engine_bin_name(engine),
        engine_path.display(),
        latexmk.display()
    );

    let args = latexmk_args(engine);
    let mut cmd = std::process::Command::new(&latexmk);
    cmd.args(&args)
        .arg(main_file)
        .current_dir(work_dir)
        .env("PATH", env_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to launch latexmk: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.trim().is_empty() {
            eprintln!("[latexmk] stderr: {}", stderr.trim());
        }
    }
    Ok(())
}

fn compile_with_texlive(
    work_dir: &Path,
    main_file: &str,
    engine: TexEngine,
    tex_content: &str,
) -> Result<(), String> {
    let engine_name = engine_bin_name(engine);

    let engine_path = find_texlive_binary(engine_name)?;
    let env_path = texlive_env_path(&engine_path);
    eprintln!(
        "[texlive] backend: {} ({})",
        engine_name,
        engine_path.display()
    );
    let bib_tool = detect_bib_tool(tex_content);

    // Use "." as output-directory since current_dir is already work_dir.
    // Absolute paths break when they contain ~ (e.g. iCloud's com~apple~CloudDocs)
    // because TeX interprets ~ as a home directory shortcut.
    let output_dir_arg = "-output-directory=.".to_string();
    // Do NOT use -halt-on-error: xelatex is a pipeline (xetex → .xdv → xdvipdfmx → .pdf).
    // With -halt-on-error, recoverable warnings (e.g. missing font shapes) cause xetex to
    // exit non-zero, and the xelatex wrapper skips the xdvipdfmx step — producing .xdv but
    // no .pdf.  -interaction=nonstopmode alone is sufficient to avoid interactive prompts.
    let common_args: Vec<&str> = vec!["-synctex=1", "-interaction=nonstopmode", &output_dir_arg];

    let main_file_path = Path::new(main_file);

    // Pass 1
    run_texlive_pass(&engine_path, &common_args, main_file_path, work_dir)?;

    // Bib pass (if needed)
    let main_stem = Path::new(main_file)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");

    match bib_tool {
        BibTool::Biber => {
            let biber_path = find_texlive_binary("biber")?;
            let mut cmd = std::process::Command::new(&biber_path);
            cmd.arg(main_stem)
                .current_dir(work_dir)
                .env("PATH", &env_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let output = cmd
                .output()
                .map_err(|e| format!("Failed to run biber: {}", e))?;
            if !output.status.success() {
                eprintln!(
                    "[texlive] biber warning: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        }
        BibTool::BibTeX => {
            let bibtex_path = find_texlive_binary("bibtex")?;
            let aux_file = work_dir.join(format!("{}.aux", main_stem));
            let mut cmd = std::process::Command::new(&bibtex_path);
            cmd.arg(&aux_file)
                .current_dir(work_dir)
                .env("PATH", &env_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let output = cmd
                .output()
                .map_err(|e| format!("Failed to run bibtex: {}", e))?;
            if !output.status.success() {
                eprintln!(
                    "[texlive] bibtex warning: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        }
        BibTool::None => {}
    }

    // Pass 2: resolve references / TOC
    run_texlive_pass(&engine_path, &common_args, &main_file_path, work_dir)?;

    // Pass 3: stabilize citations (only if bib was used)
    if !matches!(bib_tool, BibTool::None) {
        run_texlive_pass(&engine_path, &common_args, &main_file_path, work_dir)?;
    }

    let pdf_path = work_dir.join(format!("{}.pdf", main_stem));
    let xdv_path = work_dir.join(format!("{}.xdv", main_stem));

    // Fallback: if xelatex produced .xdv but no .pdf (e.g. xdvipdfmx was skipped due to
    // warnings), manually run xdvipdfmx to convert .xdv → .pdf.
    if !pdf_path.exists() && xdv_path.exists() {
        eprintln!("[texlive] .xdv exists but no .pdf — running xdvipdfmx manually");
        if let Ok(xdvipdfmx) = find_texlive_binary("xdvipdfmx") {
            let mut cmd = std::process::Command::new(&xdvipdfmx);
            cmd.args(["-o", &pdf_path.to_string_lossy()])
                .arg(&xdv_path)
                .current_dir(work_dir)
                .env("PATH", &env_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let output = cmd
                .output()
                .map_err(|e| format!("Failed to launch xdvipdfmx: {}", e))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.trim().is_empty() {
                    eprintln!("[texlive] xdvipdfmx stderr: {}", stderr.trim());
                }
            }
        }
    }

    // Success is determined by whether the PDF exists, not by exit codes.
    // The caller (compile_latex) checks pdf_path.exists() and reads the log for errors.
    Ok(())
}

// --- SyncTeX Native Parser ---

#[derive(Clone)]
struct SynctexNode {
    tag: u32,
    line: u32,
    page: u32,
    h: f64, // PDF points
    v: f64, // PDF points
    width: f64,
    height: f64,
}

#[derive(Clone, Default)]
struct SynctexIndex {
    inputs: HashMap<u32, String>,
    nodes: Vec<SynctexNode>,
}

fn parse_synctex_input_line(line: &str, inputs: &mut HashMap<u32, String>) {
    let Some(rest) = line.strip_prefix("Input:") else {
        return;
    };
    if let Some(colon_pos) = rest.find(':') {
        if let Ok(tag) = rest[..colon_pos].parse::<u32>() {
            inputs.insert(tag, rest[colon_pos + 1..].to_string());
        }
    }
}

fn parse_synctex_index(data: &str) -> SynctexIndex {
    let mut inputs: HashMap<u32, String> = HashMap::new();
    let mut magnification: f64 = 1000.0;
    let mut unit: f64 = 1.0;
    let mut x_offset: f64 = 0.0;
    let mut y_offset: f64 = 0.0;

    let mut in_content = false;
    let mut current_page: u32 = 0;
    let mut nodes: Vec<SynctexNode> = Vec::new();

    for raw_line in data.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if !in_content {
            if line.starts_with("Input:") {
                parse_synctex_input_line(line, &mut inputs);
            } else if let Some(rest) = line.strip_prefix("Magnification:") {
                magnification = rest.trim().parse().unwrap_or(1000.0);
            } else if let Some(rest) = line.strip_prefix("Unit:") {
                unit = rest.trim().parse().unwrap_or(1.0);
            } else if let Some(rest) = line.strip_prefix("X Offset:") {
                x_offset = rest.trim().parse().unwrap_or(0.0);
            } else if let Some(rest) = line.strip_prefix("Y Offset:") {
                y_offset = rest.trim().parse().unwrap_or(0.0);
            } else if line == "Content:" {
                in_content = true;
            }
            continue;
        }

        if line.starts_with("Postamble:") {
            break;
        }
        if line.starts_with("Input:") {
            parse_synctex_input_line(line, &mut inputs);
            continue;
        }

        let first_byte = match line.as_bytes().first() {
            Some(b) => *b,
            None => continue,
        };
        match first_byte {
            b'{' => {
                current_page = line.get(1..).and_then(|s| s.parse().ok()).unwrap_or(0);
            }
            b'}' => {
                current_page = 0;
            }
            // Box/node records: [, (, h, v, k, x, g, $
            b'[' | b'(' | b'h' | b'v' | b'k' | b'x' | b'g' | b'$' if current_page > 0 => {
                // Convert synctex internal units to PDF points (bp)
                // 1 TeX pt = 65536 sp; 1 inch = 72.27 TeX pt = 72 PDF bp
                let factor = unit * magnification / (1000.0 * 65536.0) * 72.0 / 72.27;
                if let Some(mut node) = line
                    .get(1..)
                    .and_then(|s| parse_synctex_node(s, factor, x_offset, y_offset))
                {
                    node.page = current_page;
                    nodes.push(node);
                }
            }
            _ => {}
        }
    }

    SynctexIndex { inputs, nodes }
}

fn is_project_source_file(path: &str) -> bool {
    let lower = path.replace('\\', "/").to_ascii_lowercase();
    if lower.contains("texmf") || lower.contains("/tex/latex/") {
        return false;
    }
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    name.ends_with(".tex") || name.ends_with(".ltx")
}

fn normalize_synctex_path(path: &str) -> String {
    let mut file = path.replace('\\', "/");
    while let Some(rest) = file.strip_prefix("./") {
        file = rest.to_string();
    }
    while file.contains("/./") {
        file = file.replace("/./", "/");
    }
    file
}

fn synctex_file_matches(input_path: &str, wanted: &str) -> bool {
    let input = normalize_synctex_path(input_path);
    let wanted = normalize_synctex_path(wanted);
    if input == wanted {
        return true;
    }
    input.ends_with(&format!("/{wanted}"))
}

/// Parse synctex data and find the source location closest to (target_x, target_y) on target_page.
#[cfg(test)]
fn parse_synctex_data(
    data: &str,
    target_page: u32,
    target_x: f64,
    target_y: f64,
) -> Option<(String, u32, u32)> {
    let index = parse_synctex_index(data);
    synctex_edit_lookup(&index, target_page, target_x, target_y)
}

fn synctex_edit_lookup(
    index: &SynctexIndex,
    target_page: u32,
    target_x: f64,
    target_y: f64,
) -> Option<(String, u32, u32)> {
    let mut ranked: Vec<(f64, usize)> = Vec::new();
    for (i, node) in index.nodes.iter().enumerate() {
        if node.page != target_page {
            continue;
        }
        let dx = node.h - target_x;
        let dy = node.v - target_y;
        ranked.push((dx * dx + dy * dy, i));
    }
    ranked.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut fallback: Option<(String, u32)> = None;
    for (_, i) in ranked {
        let node = &index.nodes[i];
        let Some(filename) = index.inputs.get(&node.tag) else {
            continue;
        };
        if is_project_source_file(filename) {
            return Some((filename.clone(), node.line, 0));
        }
        if fallback.is_none() {
            fallback = Some((filename.clone(), node.line));
        }
    }
    fallback.map(|(file, line)| (file, line, 0))
}

fn synctex_view_lookup(
    index: &SynctexIndex,
    file: &str,
    line: u32,
) -> Option<(u32, f64, f64, f64, f64)> {
    let mut exact: Option<&SynctexNode> = None;
    let mut nearest: Option<(u32, &SynctexNode)> = None;
    for node in &index.nodes {
        let Some(path) = index.inputs.get(&node.tag) else {
            continue;
        };
        if !synctex_file_matches(path, file) {
            continue;
        }
        if node.line == line {
            if exact.is_none_or(|cur| node.width >= cur.width) {
                exact = Some(node);
            }
        } else {
            let dist = node.line.abs_diff(line);
            if nearest.is_none_or(|(best_dist, cur)| {
                dist < best_dist || (dist == best_dist && node.width >= cur.width)
            }) {
                nearest = Some((dist, node));
            }
        }
    }
    let node = exact.or(nearest.map(|(_, n)| n))?;
    let width = if node.width > 1.0 { node.width } else { 72.0 };
    let height = if node.height > 1.0 { node.height } else { 12.0 };
    Some((node.page, node.h, node.v, width, height))
}

/// Parse a synctex node record (after stripping the type character).
/// Format: `<tag>,<line>,<column>:<h>,<v>[:<W>,<H>,<D>]`
fn parse_synctex_node(s: &str, factor: f64, x_offset: f64, y_offset: f64) -> Option<SynctexNode> {
    let colon_parts: Vec<&str> = s.splitn(4, ':').collect();
    if colon_parts.len() < 2 {
        return None;
    }

    // Parse tag and line (ignore column)
    let first_part = colon_parts.first()?;
    let tlc: Vec<&str> = first_part.splitn(3, ',').collect();
    if tlc.len() < 2 {
        return None;
    }
    let tag: u32 = tlc.first()?.parse().ok()?;
    let line: u32 = tlc.get(1)?.parse().ok()?;

    // Parse h, v coordinates
    let second_part = colon_parts.get(1)?;
    let hv: Vec<&str> = second_part.splitn(2, ',').collect();
    if hv.len() < 2 {
        return None;
    }
    let h_raw: i64 = hv.first()?.parse().ok()?;
    let v_raw: i64 = hv.get(1)?.parse().ok()?;

    let h = h_raw as f64 * factor + x_offset;
    let v = v_raw as f64 * factor + y_offset;

    let mut width = 0.0;
    let mut height = 0.0;
    if let Some(dims) = colon_parts.get(2) {
        let parts: Vec<&str> = dims.splitn(3, ',').collect();
        if parts.len() >= 2 {
            let w_raw: f64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0.0);
            let h_raw_dim: f64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
            let d_raw: f64 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0);
            width = w_raw * factor;
            height = (h_raw_dim + d_raw) * factor;
        }
    }

    Some(SynctexNode {
        tag,
        line,
        page: 0,
        h,
        v,
        width,
        height,
    })
}

// --- Tauri Commands ---

#[derive(serde::Serialize)]
pub struct TexliveStatus {
    pub available: bool,
    pub engines: Vec<String>,
    pub version: Option<String>,
}

#[tauri::command]
pub fn detect_texlive() -> TexliveStatus {
    let engines_to_check = ["pdflatex", "xelatex", "lualatex", "latexmk"];
    let mut found_engines = Vec::new();

    for name in &engines_to_check {
        if find_texlive_binary(name).is_ok() {
            found_engines.push(name.to_string());
        }
    }

    let version = find_texlive_binary("pdflatex").ok().and_then(|path| {
        let mut cmd = std::process::Command::new(&path);
        cmd.arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output().ok().and_then(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.lines().next().map(|l| l.to_string())
        })
    });

    TexliveStatus {
        available: !found_engines.is_empty(),
        engines: found_engines,
        version,
    }
}

#[tauri::command]
pub async fn compile_latex(
    state: tauri::State<'_, LatexCompilerState>,
    project_dir: String,
    main_file: String,
    use_texlive: Option<bool>,
    backend: Option<String>,
    engine: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    // Queue across all windows instead of rejecting normal bursts.
    let _permit = state
        .semaphore
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "Compiler queue closed".to_string())?;

    // Lock per (project, main file) so independent documents can compile together.
    let lock_key = format!("{}::{main_file}", project_dir);
    let project_lock = {
        let mut locks = state.project_locks.lock().await;
        locks
            .entry(lock_key)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    };
    let _project_guard = project_lock.lock().await;

    let t0 = std::time::Instant::now();
    let mut compile_backend = parse_compile_backend(backend.as_deref(), use_texlive);
    let preferred_engine = parse_engine_pref(engine.as_deref());

    let main_path = Path::new(&main_file);
    let main_file_name = main_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document")
        .to_string();
    let source_prefix = main_path.parent().unwrap_or(Path::new("")).to_path_buf();
    let compile_main = main_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid main TeX file name")?
        .to_string();

    // Set up build directory (offload blocking I/O to avoid starving the async runtime)
    let work_dir = persistent_build_dir_for(&project_dir, &main_file);
    let compile_dir = work_dir.join(&source_prefix);
    let is_reuse = work_dir.exists();

    {
        let work_dir = work_dir.clone();
        let project_dir = project_dir.clone();
        tokio::task::spawn_blocking(move || {
            if is_reuse {
                sync_source_files(Path::new(&project_dir), &work_dir)
                    .map_err(|e| format!("Failed to sync project: {}", e))
            } else {
                std::fs::create_dir_all(&work_dir)
                    .map_err(|e| format!("Failed to create build dir: {}", e))?;
                copy_dir_recursive(Path::new(&project_dir), &work_dir)
                    .map_err(|e| format!("Failed to copy project: {}", e))
            }
        })
        .await
        .map_err(|e| format!("File sync task panicked: {}", e))??;
    }

    eprintln!(
        "[latex] +{:.0}ms {} ({}, backend={})",
        t0.elapsed().as_millis(),
        if is_reuse {
            "sync source files"
        } else {
            "full copy"
        },
        if is_reuse { "reuse" } else { "first build" },
        match compile_backend {
            CompileBackend::Tectonic => "tectonic",
            CompileBackend::Texlive => "texlive",
            CompileBackend::Latexmk => "latexmk",
        }
    );

    // Remove stale PDF so a failed compile doesn't return the previous result.
    let pdf_path = compile_dir.join(format!("{}.pdf", main_file_name));
    let _ = std::fs::remove_file(&pdf_path);

    // Verify the main TeX file exists before attempting compilation
    let main_tex_path = compile_dir.join(&compile_main);
    if !main_tex_path.exists() {
        return Err(format!(
            "Compilation failed\n\nNo .tex file found: \"{}\". Create a document.tex or main.tex file to compile.",
            main_file
        ));
    }

    // Detect TeX engine from magic comment, then the caller's preferred default.
    let main_tex_content = std::fs::read_to_string(&main_tex_path).unwrap_or_default();
    let engine = resolve_compile_engine(
        detect_tex_engine(&main_tex_content),
        infer_tex_engine(&main_tex_content),
        preferred_engine,
    );
    // Tectonic is XeTeX-based and cannot run pdfTeX primitives such as
    // `\pdfglyphtounicode`. Fall back to TeX Live / latexmk for those files.
    if compile_backend == CompileBackend::Tectonic && engine == TexEngine::Latex {
        compile_backend = if find_texlive_binary("pdflatex").is_ok() {
            CompileBackend::Texlive
        } else {
            CompileBackend::Latexmk
        };
        eprintln!(
            "[latex] tectonic cannot run pdfTeX-only source; using {:?}",
            compile_backend
        );
    }
    let engine_name_for_label = engine_bin_name(engine);
    let backend_label = match compile_backend {
        CompileBackend::Tectonic => "Tectonic".to_string(),
        CompileBackend::Texlive => format!("TeXLive/{engine_name_for_label}"),
        CompileBackend::Latexmk => format!("latexmk/{engine_name_for_label}"),
    };

    if compile_backend == CompileBackend::Tectonic && engine == TexEngine::LuaLaTeX {
        return Err(
            "Compilation failed\n\nThis document requires LuaLaTeX (% !TEX program = lualatex). \
             Tectonic cannot run LuaLaTeX. Switch the compiler to latexmk or TeXLive."
                .to_string(),
        );
    }

    let compile_result = match compile_backend {
        CompileBackend::Texlive => {
            let work_dir_clone = compile_dir.clone();
            let main_file_clone = compile_main.clone();
            let result = tokio::task::spawn_blocking(move || {
                lower_thread_priority();
                compile_with_texlive(&work_dir_clone, &main_file_clone, engine, &main_tex_content)
            })
            .await
            .map_err(|e| format!("Compilation task panicked: {}", e))?;
            eprintln!(
                "[latex] +{:.0}ms texlive done (ok={})",
                t0.elapsed().as_millis(),
                result.is_ok()
            );
            result
        }
        CompileBackend::Latexmk => {
            let work_dir_clone = compile_dir.clone();
            let main_file_clone = compile_main.clone();
            let result = tokio::task::spawn_blocking(move || {
                lower_thread_priority();
                compile_with_latexmk(&work_dir_clone, &main_file_clone, engine)
            })
            .await
            .map_err(|e| format!("Compilation task panicked: {}", e))?;
            eprintln!(
                "[latex] +{:.0}ms latexmk done (ok={})",
                t0.elapsed().as_millis(),
                result.is_ok()
            );
            result
        }
        CompileBackend::Tectonic => {
            // Isolate C-level global state (font cache, etc.) in a subprocess.
            let work_dir_clone = compile_dir.clone();
            let main_file_clone = compile_main.clone();
            let result = tokio::task::spawn_blocking(move || {
                lower_thread_priority();
                compile_with_tectonic_subprocess(&work_dir_clone, &main_file_clone)
            })
            .await
            .map_err(|e| format!("Compilation task panicked: {}", e))?;
            eprintln!(
                "[latex] +{:.0}ms tectonic done (ok={})",
                t0.elapsed().as_millis(),
                result.is_ok()
            );
            result
        }
    };

    let log_path = compile_dir.join(format!("{}.log", main_file_name));

    // Handle "No pages of output" — retry with \AtEndDocument{\null} injection (Tectonic only).
    // TeXLive multi-pass handles this differently; the injection is Tectonic-specific.
    if compile_backend == CompileBackend::Tectonic && !pdf_path.exists() {
        let log_path_clone = log_path.clone();
        let main_tex = compile_dir.join(&compile_main);
        let pdf_path_clone = pdf_path.clone();
        let main_file_clone = compile_main.clone();
        let work_dir_clone = compile_dir.clone();

        let needs_retry = tokio::task::spawn_blocking(move || {
            let log_content = std::fs::read_to_string(&log_path_clone).unwrap_or_default();
            if !log_content.contains("No pages of output") || has_real_errors(&log_content) {
                return Ok(false);
            }
            eprintln!("[latex] no pages of output — retrying with \\null injection");
            if let Ok(content) = std::fs::read_to_string(&main_tex) {
                if let Some(pos) = content.find("\\begin{document}") {
                    let modified = format!(
                        "{}\\AtEndDocument{{\\null}}{}",
                        &content[..pos],
                        &content[pos..]
                    );
                    let _ = std::fs::write(&main_tex, &modified);
                    return Ok(true);
                }
            }
            Ok::<bool, String>(false)
        })
        .await
        .map_err(|e| format!("Retry prep panicked: {}", e))??;

        if needs_retry {
            let retry_result = tokio::task::spawn_blocking(move || {
                compile_with_tectonic_subprocess(&work_dir_clone, &main_file_clone)
            })
            .await
            .map_err(|e| format!("Retry task panicked: {}", e))?;
            eprintln!(
                "[latex] empty-body retry: ok={} pdf_exists={}",
                retry_result.is_ok(),
                pdf_path_clone.exists()
            );
        }
    }

    // Store build info
    {
        let mut builds = state.last_builds.lock().await;
        let info = BuildInfo {
            work_dir: compile_dir.clone(),
            main_file_name: main_file_name.clone(),
            source_prefix,
            synctex_index: Arc::new(std::sync::Mutex::new(None)),
        };
        builds.insert(project_dir.clone(), info.clone());
        builds.insert(format!("{}::{main_file}", project_dir), info);
    }

    if pdf_path.exists() {
        let pdf_path_clone = pdf_path.clone();
        let pdf_bytes = tokio::task::spawn_blocking(move || std::fs::read(&pdf_path_clone))
            .await
            .map_err(|e| format!("PDF read task panicked: {}", e))?
            .map_err(|e| format!("Failed to read PDF: {}", e))?;
        eprintln!(
            "[latex] +{:.0}ms total (reuse={}, backend={}) pdf_size={}KB",
            t0.elapsed().as_millis(),
            is_reuse,
            backend_label,
            pdf_bytes.len() / 1024
        );
        Ok(tauri::ipc::Response::new(pdf_bytes))
    } else {
        let log_content = std::fs::read_to_string(&log_path).unwrap_or_default();
        let details = extract_error_lines(&log_content);
        let msg = if details.is_empty() {
            match compile_result {
                Err(e) => e,
                Ok(_) => "Compilation failed: no PDF generated".to_string(),
            }
        } else {
            details
        };
        Err(format!("Compilation failed ({})\n\n{}", backend_label, msg))
    }
}

/// Read only a PDF produced by a known build; child windows do not need a
/// broad filesystem scope for hidden build directories.
#[tauri::command]
pub async fn read_compiled_pdf(
    state: tauri::State<'_, LatexCompilerState>,
    project_dir: String,
    main_file: String,
) -> Result<tauri::ipc::Response, String> {
    let path = {
        let builds = state.last_builds.lock().await;
        let build = builds
            .get(&format!("{project_dir}::{main_file}"))
            .ok_or("No compiled PDF is available for this document")?;
        build.work_dir.join(format!("{}.pdf", build.main_file_name))
    };
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn build_synctex_index(build: &BuildInfo) -> Result<Arc<SynctexIndex>, String> {
    let mut cached = build
        .synctex_index
        .lock()
        .map_err(|_| "SyncTeX cache unavailable")?;
    if let Some(index) = cached.as_ref() {
        return Ok(index.clone());
    }
    let gz = build
        .work_dir
        .join(format!("{}.synctex.gz", build.main_file_name));
    let plain = build
        .work_dir
        .join(format!("{}.synctex", build.main_file_name));
    let data = if gz.exists() {
        let compressed = std::fs::read(gz).map_err(|e| e.to_string())?;
        let mut decoder = flate2::read::GzDecoder::new(&compressed[..]);
        let mut data = String::new();
        decoder
            .read_to_string(&mut data)
            .map_err(|e| e.to_string())?;
        data
    } else {
        std::fs::read_to_string(plain).map_err(|e| format!("No readable SyncTeX data: {e}"))?
    };
    let index = Arc::new(parse_synctex_index(&data));
    *cached = Some(index.clone());
    Ok(index)
}

#[tauri::command]
pub async fn synctex_edit(
    state: tauri::State<'_, LatexCompilerState>,
    project_dir: String,
    page: u32,
    x: f64,
    y: f64,
    main_file: Option<String>,
) -> Result<SynctexResult, String> {
    let builds = state.last_builds.lock().await;
    let keyed = main_file
        .as_deref()
        .map(|file| format!("{project_dir}::{file}"));
    let build = keyed
        .as_ref()
        .and_then(|key| builds.get(key))
        .or_else(|| {
            if keyed.is_none() {
                builds.get(&project_dir)
            } else {
                None
            }
        })
        .ok_or("No build found for this project")?;

    let build = build.clone();
    let work_dir = build.work_dir.clone();
    let source_prefix = build.source_prefix.clone();
    drop(builds);
    let (mut file, line, column) = tokio::task::spawn_blocking(move || {
        let index = build_synctex_index(&build)?;
        synctex_edit_lookup(&index, page, x, y)
            .ok_or_else(|| "Could not resolve source location".to_string())
    })
    .await
    .map_err(|e| format!("SyncTeX task panicked: {e}"))??;

    file = synctex_source_to_project(&file, &work_dir, &source_prefix);

    Ok(SynctexResult { file, line, column })
}

fn strip_synctex_workdir_prefix(file: &str, work_dir: &Path) -> String {
    let mut file = normalize_synctex_path(file);
    let work_dir_str = normalize_synctex_path(&work_dir.to_string_lossy());
    if let Some(rest) = file.strip_prefix(&format!("{work_dir_str}/")) {
        file = rest.to_string();
    }
    normalize_synctex_path(&file)
}

fn synctex_source_to_project(file: &str, work_dir: &Path, source_prefix: &Path) -> String {
    let file = strip_synctex_workdir_prefix(file, work_dir);
    if Path::new(&file).is_absolute() || source_prefix.as_os_str().is_empty() {
        file
    } else {
        normalize_synctex_path(&source_prefix.join(file).to_string_lossy())
    }
}

fn project_source_to_compile(file: &str, source_prefix: &Path) -> String {
    Path::new(file)
        .strip_prefix(source_prefix)
        .unwrap_or(Path::new(file))
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
pub async fn synctex_view(
    state: tauri::State<'_, LatexCompilerState>,
    project_dir: String,
    file: String,
    line: u32,
    main_file: Option<String>,
    column: Option<u32>,
) -> Result<SynctexViewResult, String> {
    let builds = state.last_builds.lock().await;
    let keyed = main_file
        .as_deref()
        .map(|name| format!("{project_dir}::{name}"));
    let build = keyed
        .as_ref()
        .and_then(|key| builds.get(key))
        .or_else(|| {
            if keyed.is_none() {
                builds.get(&project_dir)
            } else {
                None
            }
        })
        .ok_or("No build found for this project")?;

    let build = build.clone();
    drop(builds);
    let (page, x, y, width, height) = tokio::task::spawn_blocking(move || {
        let compile_file = project_source_to_compile(&file, &build.source_prefix);
        if let Some(location) =
            native_synctex_view(&build, &compile_file, line, column.unwrap_or(1))
        {
            return Ok(location);
        }
        let index = build_synctex_index(&build)?;
        synctex_view_lookup(&index, &compile_file, line)
            .ok_or_else(|| "Could not resolve PDF location".to_string())
    })
    .await
    .map_err(|e| format!("SyncTeX task panicked: {e}"))??;

    Ok(SynctexViewResult {
        page,
        x,
        y,
        width,
        height,
    })
}

fn native_synctex_view(
    build: &BuildInfo,
    file: &str,
    line: u32,
    column: u32,
) -> Option<(u32, f64, f64, f64, f64)> {
    let binary = find_texlive_binary("synctex").ok()?;
    let mut command = std::process::Command::new(binary);
    command
        .current_dir(&build.work_dir)
        .args(["view", "-i", &format!("{line}:{column}:{file}"), "-o"])
        .arg(build.work_dir.join(format!("{}.pdf", build.main_file_name)));
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_synctex_view_output(&String::from_utf8_lossy(&output.stdout))
}
fn parse_synctex_view_output(output: &str) -> Option<(u32, f64, f64, f64, f64)> {
    let mut fields = HashMap::new();
    for line in output.lines() {
        if line.starts_with("SyncTeX result end") {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            fields.entry(key).or_insert(value.trim());
        }
    }
    let page = fields.get("Page")?.parse().ok()?;
    let x: f64 = fields.get("x")?.parse().ok()?;
    let y: f64 = fields.get("y")?.parse().ok()?;
    let width: f64 = fields.get("W").and_then(|s| s.parse().ok()).unwrap_or(72.0);
    let height: f64 = fields.get("H").and_then(|s| s.parse().ok()).unwrap_or(12.0);
    Some((page, x, y, width.abs().max(1.0), height.abs().max(1.0)))
}

/// Clear in-memory build state on app exit.
/// Persistent build directories are intentionally kept for fast restart.
pub async fn cleanup_all_builds(state: &LatexCompilerState) {
    let mut builds = state.last_builds.lock().await;
    builds.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- detect_bib_tool ---

    #[test]
    fn native_synctex_locates_included_source_in_each_parallel_root() {
        if find_texlive_binary("pdflatex").is_err() || find_texlive_binary("synctex").is_err() {
            return;
        }
        let parent = tempfile::tempdir().unwrap();
        for (name, pages) in [("a", 1), ("b", 2)] {
            let dir = parent.path().join(name);
            std::fs::create_dir_all(dir.join("sections")).unwrap();
            let prefix = "First page.\\newpage\n".repeat(pages);
            std::fs::write(dir.join("main.tex"), format!("\\documentclass{{article}}\n\\begin{{document}}\n{prefix}\\input{{sections/method}}\n\\end{{document}}\n")).unwrap();
            std::fs::write(
                dir.join("sections/method.tex"),
                "Method target on its own page.\n",
            )
            .unwrap();
            compile_with_texlive(
                &dir,
                "main.tex",
                TexEngine::Latex,
                &std::fs::read_to_string(dir.join("main.tex")).unwrap(),
            )
            .unwrap();
            let build = BuildInfo {
                work_dir: dir,
                main_file_name: "main".into(),
                source_prefix: name.into(),
                synctex_index: Arc::new(std::sync::Mutex::new(None)),
            };
            let location = native_synctex_view(&build, "sections/method.tex", 1, 1).unwrap();
            assert_eq!(location.0, pages as u32 + 1);
            assert!(location.1.is_finite() && location.2.is_finite());
        }
    }

    #[test]
    fn nested_synctex_paths_round_trip_to_project_files() {
        let work_dir = Path::new("/project/.prism/build/main-123/paper-a");
        let source_prefix = Path::new("paper-a");
        let source = synctex_source_to_project(
            "/project/.prism/build/main-123/paper-a/./sections/intro.tex",
            work_dir,
            source_prefix,
        );
        assert_eq!(source, "paper-a/sections/intro.tex");
        assert_eq!(
            project_source_to_compile(&source, source_prefix),
            "sections/intro.tex"
        );
    }

    #[test]
    fn synctex_cache_reuses_index_until_next_build() {
        let root = std::env::temp_dir().join(format!("ares-synctex-cache-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("main.synctex");
        std::fs::write(&path, "Input:1:main.tex\n").unwrap();
        let build = BuildInfo {
            work_dir: root.clone(),
            main_file_name: "main".into(),
            source_prefix: PathBuf::new(),
            synctex_index: Arc::new(std::sync::Mutex::new(None)),
        };
        let first = build_synctex_index(&build).unwrap();
        std::fs::remove_file(&path).unwrap();
        let cached = build_synctex_index(&build).unwrap();
        assert!(Arc::ptr_eq(&first, &cached));
        let next = BuildInfo {
            synctex_index: Arc::new(std::sync::Mutex::new(None)),
            ..build
        };
        assert!(build_synctex_index(&next).is_err());
        let _ = std::fs::remove_dir(&root);
    }

    #[test]
    fn test_detect_bib_tool_biber() {
        let content =
            "\\documentclass{article}\n\\usepackage{biblatex}\n\\begin{document}\n\\end{document}";
        assert_eq!(detect_bib_tool(content), BibTool::Biber);
    }

    #[test]
    fn test_detect_bib_tool_biblatex_with_options() {
        let content = "\\documentclass{article}\n\\usepackage[style=apa,backend=biber]{biblatex}\n\\begin{document}";
        assert_eq!(detect_bib_tool(content), BibTool::Biber);
    }

    #[test]
    fn test_detect_bib_tool_bibtex() {
        let content = "\\documentclass{article}\n\\bibliography{refs}\n\\end{document}";
        assert_eq!(detect_bib_tool(content), BibTool::BibTeX);
    }

    #[test]
    fn test_detect_bib_tool_addbibresource() {
        let content = "\\documentclass{article}\n\\addbibresource{refs.bib}\n\\end{document}";
        assert_eq!(detect_bib_tool(content), BibTool::BibTeX);
    }

    #[test]
    fn test_detect_bib_tool_none() {
        let content = "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}";
        assert_eq!(detect_bib_tool(content), BibTool::None);
    }

    #[test]
    fn test_detect_bib_tool_commented_out() {
        let content = "\\documentclass{article}\n% \\bibliography{refs}\n% \\usepackage{biblatex}\n\\end{document}";
        assert_eq!(detect_bib_tool(content), BibTool::None);
    }

    // --- extract_error_lines ---

    #[test]
    fn test_extract_error_lines_empty_log() {
        assert_eq!(extract_error_lines(""), "");
    }

    #[test]
    fn test_extract_error_lines_no_pages() {
        let log = "Some preamble\nNo pages of output.\nSome trailing";
        let result = extract_error_lines(log);
        assert_eq!(
            result,
            "No pages of output. Add visible content to the document body."
        );
    }

    #[test]
    fn test_extract_error_lines_with_errors() {
        let log = "line 1\n! Undefined control sequence.\nline 3\n! Missing $ inserted.\nline 5";
        let result = extract_error_lines(log);
        assert!(result.contains("Undefined control sequence"));
        assert!(result.contains("Missing $ inserted"));
    }

    #[test]
    fn test_extract_error_lines_error_colon() {
        let log = "stuff\nLatex Error: Bad math environment\nmore stuff";
        let result = extract_error_lines(log);
        assert!(result.contains("Error:"));
    }

    #[test]
    fn test_extract_error_lines_no_errors_returns_tail() {
        let log = "a".repeat(1000);
        let result = extract_error_lines(&log);
        // Should return last 500 chars
        assert_eq!(result.len(), 500);
    }

    #[test]
    fn test_extract_error_lines_limits_to_10() {
        let mut log = String::new();
        for i in 0..20 {
            log.push_str(&format!("! Error number {}\n", i));
        }
        let result = extract_error_lines(&log);
        assert!(result.contains("---- Engine output ----"));
        let count = result.lines().count();
        assert!(count <= 120);
    }

    // --- persistent_build_dir ---

    #[test]
    fn test_persistent_build_dir() {
        let dir = persistent_build_dir("/Users/dev/my-project");
        assert_eq!(dir, PathBuf::from("/Users/dev/my-project/.prism/build"));
    }

    #[test]
    fn test_persistent_build_dir_for_isolates_jobname() {
        let main = persistent_build_dir_for("/paper", "main.tex");
        let supp = persistent_build_dir_for("/paper", "supplement.tex");
        assert_eq!(main, PathBuf::from("/paper/.prism/build/main"));
        assert_eq!(supp, PathBuf::from("/paper/.prism/build/supplement"));
        assert_ne!(main, supp);
    }

    // --- parse_synctex_node ---

    #[test]
    fn test_parse_synctex_node_basic() {
        // Format: tag,line,column:h,v
        let node = parse_synctex_node("1,42,0:1000,2000", 1.0, 0.0, 0.0);
        assert!(node.is_some());
        let node = node.unwrap();
        assert_eq!(node.tag, 1);
        assert_eq!(node.line, 42);
        assert_eq!(node.h, 1000.0);
        assert_eq!(node.v, 2000.0);
    }

    #[test]
    fn test_parse_synctex_node_with_dimensions() {
        // Format: tag,line,column:h,v:W,H,D
        let node = parse_synctex_node("3,10,0:500,600:100,20,5", 1.0, 0.0, 0.0);
        assert!(node.is_some());
        let node = node.unwrap();
        assert_eq!(node.tag, 3);
        assert_eq!(node.line, 10);
    }

    #[test]
    fn test_parse_synctex_node_with_offset() {
        let node = parse_synctex_node("1,1,0:0,0", 1.0, 10.0, 20.0);
        let node = node.unwrap();
        assert_eq!(node.h, 10.0); // 0 * 1.0 + 10.0
        assert_eq!(node.v, 20.0); // 0 * 1.0 + 20.0
    }

    #[test]
    fn test_parse_synctex_node_invalid_missing_colon() {
        assert!(parse_synctex_node("1,1,0", 1.0, 0.0, 0.0).is_none());
    }

    #[test]
    fn test_parse_synctex_node_invalid_missing_comma() {
        assert!(parse_synctex_node("1:100,200", 1.0, 0.0, 0.0).is_none());
    }

    // --- parse_synctex_data ---

    #[test]
    fn test_parse_synctex_data_basic() {
        let data = "\
SyncTeX Version:1
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h1,5,0:1000,2000:500,100,0
}1
Postamble:
";
        let result = parse_synctex_data(data, 1, 50.0, 50.0);
        assert!(result.is_some());
        let (file, line, _col) = result.unwrap();
        assert_eq!(file, "./main.tex");
        assert_eq!(line, 5);
    }

    #[test]
    fn test_parse_synctex_data_wrong_page() {
        let data = "\
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h1,5,0:1000,2000
}1
Postamble:
";
        // Looking for page 2 but data only has page 1
        let result = parse_synctex_data(data, 2, 50.0, 50.0);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_synctex_data_closest_node() {
        let data = "\
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h1,10,0:0,0
h1,20,0:100000000,100000000
}1
Postamble:
";
        // (0, 0) is closer to the first node
        let result = parse_synctex_data(data, 1, 0.0, 0.0);
        assert!(result.is_some());
        let (_, line, _) = result.unwrap();
        assert_eq!(line, 10);
    }

    #[test]
    fn test_parse_synctex_data_empty() {
        let result = parse_synctex_data("", 1, 0.0, 0.0);
        assert!(result.is_none());
    }

    // --- extract_error_lines additional edge cases ---

    #[test]
    fn test_extract_error_lines_mixed_error_formats() {
        let log = "preamble\n! LaTeX Error: File not found.\nl.42 \\input{missing}\nerror: compilation stopped";
        let result = extract_error_lines(log);
        assert!(result.contains("LaTeX Error"));
        assert!(result.contains("error: compilation stopped"));
    }

    #[test]
    fn test_extract_error_lines_short_log_no_errors() {
        let log = "This is a short log without errors";
        let result = extract_error_lines(log);
        // Short log (< 500 chars) returned as tail
        assert_eq!(result, log);
    }

    // --- parse_synctex_node additional edge cases ---

    #[test]
    fn test_parse_synctex_node_negative_coordinates() {
        let node = parse_synctex_node("1,1,0:-500,300", 1.0, 0.0, 0.0);
        assert!(node.is_some());
        let n = node.unwrap();
        assert_eq!(n.h, -500.0);
        assert_eq!(n.v, 300.0);
    }

    #[test]
    fn test_parse_synctex_node_factor_scaling() {
        // factor=2.0 should double the coordinates
        let node = parse_synctex_node("1,1,0:100,200", 2.0, 0.0, 0.0);
        let n = node.unwrap();
        assert_eq!(n.h, 200.0);
        assert_eq!(n.v, 400.0);
    }

    #[test]
    fn test_parse_synctex_node_zero_tag_and_line() {
        let node = parse_synctex_node("0,0,0:0,0", 1.0, 0.0, 0.0);
        let n = node.unwrap();
        assert_eq!(n.tag, 0);
        assert_eq!(n.line, 0);
    }

    // --- parse_synctex_data additional edge cases ---

    #[test]
    fn test_parse_synctex_data_multiple_inputs() {
        let data = "\
Input:1:./main.tex
Input:2:./chapter1.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h2,15,0:500,500
}1
Postamble:
";
        let result = parse_synctex_data(data, 1, 0.0, 0.0);
        assert!(result.is_some());
        let (file, line, _) = result.unwrap();
        assert_eq!(file, "./chapter1.tex");
        assert_eq!(line, 15);
    }

    #[test]
    fn test_parse_synctex_data_input_in_content_section() {
        let data = "\
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h1,5,0:10,10
Input:55:./sections/related_work.tex
h55,65,0:200,400
}1
Postamble:
";
        let result = parse_synctex_data(data, 1, 200.0, 400.0);
        assert!(result.is_some());
        let (file, line, _) = result.unwrap();
        assert_eq!(file, "./sections/related_work.tex");
        assert_eq!(line, 65);
    }

    #[test]
    fn test_synctex_view_lookup_included_file() {
        let data = "\
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{2
Input:55:./sections/related_work.tex
[55,30,0:100,200:400,12,2
}2
Postamble:
";
        let index = parse_synctex_index(data);
        let result = synctex_view_lookup(&index, "sections/related_work.tex", 30);
        assert!(result.is_some());
        let (page, x, y, width, height) = result.unwrap();
        assert_eq!(page, 2);
        assert!(x > 0.0);
        assert!(y > 0.0);
        assert!(width > 0.0);
        assert!(height > 0.0);
    }

    #[test]
    fn test_synctex_file_matches_build_copy_path() {
        assert!(synctex_file_matches(
            "/tmp/.prism/build/main/./sections/introduction.tex",
            "sections/introduction.tex",
        ));
        assert!(!synctex_file_matches(
            "/tmp/.prism/build/main/./sections/introduction.tex",
            "sections/related_work.tex",
        ));
    }

    #[test]
    fn test_parse_synctex_data_multiple_pages() {
        let data = "\
Input:1:./main.tex
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
h1,5,0:100,100
}1
{2
h1,25,0:200,200
}2
Postamble:
";
        let result = parse_synctex_data(data, 2, 200.0, 200.0);
        assert!(result.is_some());
        let (_, line, _) = result.unwrap();
        assert_eq!(line, 25);
    }

    // --- extract_error_lines: real errors take priority over "No pages of output" ---

    #[test]
    fn test_extract_error_lines_real_errors_over_no_pages() {
        let log = "Some preamble\n! LaTeX Error: File `missing.sty' not found.\nNo pages of output.\nMore stuff";
        let result = extract_error_lines(log);
        assert!(
            result.contains("LaTeX Error"),
            "real error should be shown, got: {}",
            result
        );
        assert!(
            !result.contains("Add visible content"),
            "No pages fallback should NOT appear"
        );
    }

    // --- has_real_errors ---

    #[test]
    fn test_has_real_errors_with_bang() {
        assert!(has_real_errors("ok\n! Undefined control sequence.\nmore"));
    }

    #[test]
    fn test_has_real_errors_with_error_colon() {
        assert!(has_real_errors("LaTeX Error: Bad math\nstuff"));
    }

    #[test]
    fn test_has_real_errors_none() {
        assert!(!has_real_errors("This is pdfTeX\nNo pages of output.\n"));
    }

    // --- detect_tex_engine ---

    #[test]
    fn test_detect_tex_engine_xelatex() {
        let content = "% !TEX program = xelatex\n\\documentclass{article}\n";
        assert_eq!(detect_tex_engine(content), Some(TexEngine::XeLaTeX));
    }

    #[test]
    fn test_detect_tex_engine_pdflatex() {
        let content = "% !TEX program = pdflatex\n\\documentclass{article}\n";
        assert_eq!(detect_tex_engine(content), Some(TexEngine::Latex));
    }

    #[test]
    fn test_detect_tex_engine_lualatex() {
        let content = "% !TEX program = lualatex\n\\documentclass{article}\n";
        assert_eq!(detect_tex_engine(content), Some(TexEngine::LuaLaTeX));
    }

    #[test]
    fn test_detect_tex_engine_none() {
        let content = "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n";
        assert_eq!(detect_tex_engine(content), None);
    }

    #[test]
    fn test_detect_tex_engine_case_insensitive() {
        let content = "% !TEX program = XeLaTeX\n";
        assert_eq!(detect_tex_engine(content), Some(TexEngine::XeLaTeX));
    }

    #[test]
    fn test_detect_tex_engine_no_spaces() {
        let content = "%!TEX program=xelatex\n";
        assert_eq!(detect_tex_engine(content), Some(TexEngine::XeLaTeX));
    }

    #[test]
    fn test_unix_texlive_candidates_include_mactex_and_2026_latexmk() {
        let paths = unix_texlive_candidate_paths("latexmk");
        let rendered: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        assert!(rendered.contains(&"/Library/TeX/texbin/latexmk".to_string()));
        assert!(rendered
            .iter()
            .any(|p| p.contains("/usr/local/texlive/2026/") && p.ends_with("latexmk")));
        assert!(rendered
            .iter()
            .any(|p| p.contains("/usr/local/texlive/2024/") && p.ends_with("latexmk")));
    }

    #[test]
    fn test_windows_texlive_candidates_include_2026() {
        let paths = windows_texlive_candidate_paths("pdflatex");
        let rendered: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        assert!(rendered.iter().any(|p| p.contains("\\texlive\\2026\\")));
        assert!(rendered.iter().any(|p| p.ends_with("pdflatex.exe")));
    }

    #[test]
    fn test_latexmk_args_pdflatex() {
        assert_eq!(
            latexmk_args(TexEngine::Latex),
            ["-pdf", "-interaction=nonstopmode", "-synctex=1"]
        );
    }

    #[test]
    fn test_latexmk_args_lualatex() {
        assert_eq!(
            latexmk_args(TexEngine::LuaLaTeX),
            ["-lualatex", "-interaction=nonstopmode", "-synctex=1"]
        );
    }

    #[test]
    fn test_latexmk_args_xelatex() {
        assert_eq!(
            latexmk_args(TexEngine::XeLaTeX),
            ["-xelatex", "-interaction=nonstopmode", "-synctex=1"]
        );
    }

    #[test]
    fn test_resolve_compile_engine_magic_comment_wins() {
        assert_eq!(
            resolve_compile_engine(
                Some(TexEngine::LuaLaTeX),
                Some(TexEngine::Latex),
                Some(TexEngine::XeLaTeX),
            ),
            TexEngine::LuaLaTeX
        );
    }

    #[test]
    fn test_resolve_compile_engine_defaults_to_pdflatex() {
        assert_eq!(resolve_compile_engine(None, None, None), TexEngine::Latex);
    }

    #[test]
    fn test_infer_tex_engine_glyphtounicode_is_pdflatex() {
        let content = "\\documentclass{article}\n\\input{glyphtounicode}\\pdfgentounicode=1\n";
        assert_eq!(infer_tex_engine(content), Some(TexEngine::Latex));
        assert_eq!(
            resolve_compile_engine(None, infer_tex_engine(content), Some(TexEngine::XeLaTeX)),
            TexEngine::Latex
        );
    }

    #[test]
    fn test_infer_tex_engine_fontspec_is_xelatex() {
        let content = "\\documentclass{article}\n\\usepackage{fontspec}\n";
        assert_eq!(infer_tex_engine(content), Some(TexEngine::XeLaTeX));
    }

    #[test]
    fn test_magic_comment_wins_over_inference() {
        let content = "% !TEX program = xelatex\n\\input{glyphtounicode}\n";
        assert_eq!(
            resolve_compile_engine(
                detect_tex_engine(content),
                infer_tex_engine(content),
                Some(TexEngine::Latex),
            ),
            TexEngine::XeLaTeX
        );
    }

    #[test]
    fn test_parse_compile_backend_latexmk() {
        assert_eq!(
            parse_compile_backend(Some("latexmk"), None),
            CompileBackend::Latexmk
        );
    }

    #[test]
    fn test_parse_compile_backend_legacy_use_texlive() {
        assert_eq!(
            parse_compile_backend(None, Some(true)),
            CompileBackend::Texlive
        );
    }

    #[test]
    fn test_parse_engine_pref_auto_is_none() {
        assert_eq!(parse_engine_pref(Some("auto")), None);
        assert_eq!(parse_engine_pref(None), None);
        assert_eq!(parse_engine_pref(Some("pdflatex")), Some(TexEngine::Latex));
    }

    #[test]
    fn test_compile_with_latexmk_minimal_article() {
        if find_texlive_binary("latexmk").is_err() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("main.tex"),
            "\\documentclass{article}\\begin{document}Hello\\end{document}\n",
        )
        .unwrap();
        compile_with_latexmk(dir.path(), "main.tex", TexEngine::Latex).unwrap();
        assert!(
            dir.path().join("main.pdf").exists(),
            "latexmk should produce main.pdf"
        );
    }

    #[test]
    fn test_compile_env_fixture_with_latexmk() {
        let Ok(dir) = std::env::var("ARES_PRISM_LATEXMK_FIXTURE") else {
            return;
        };
        let path = PathBuf::from(dir);
        compile_with_latexmk(&path, "main.tex", TexEngine::Latex)
            .expect("latexmk compile of fixture should start");
        assert!(
            path.join("main.pdf").exists(),
            "latexmk should produce main.pdf for the fixture"
        );
    }

    // --- persistent_build_dir edge case ---

    #[test]
    fn test_persistent_build_dir_trailing_slash() {
        let dir = persistent_build_dir("/project/");
        assert_eq!(dir, PathBuf::from("/project/.prism/build"));
    }

    #[test]
    fn nested_main_files_have_separate_build_directories() {
        let first = persistent_build_dir_for("/project", "draft-a/main.tex");
        let second = persistent_build_dir_for("/project", "draft-b/main.tex");
        assert_ne!(first, second);
        assert_eq!(
            persistent_build_dir_for("/project", "main.tex"),
            PathBuf::from("/project/.prism/build/main")
        );
    }

    #[test]
    fn texlive_compiles_nested_main_with_relative_input() {
        if find_texlive_binary("pdflatex").is_err() {
            return;
        }
        let source = tempfile::tempdir().unwrap();
        let project = source.path().join("paper-a");
        std::fs::create_dir_all(project.join("sections")).unwrap();
        let main = "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
        std::fs::write(project.join("main.tex"), main).unwrap();
        std::fs::write(project.join("sections/intro.tex"), "Nested source works.\n").unwrap();
        let build = tempfile::tempdir().unwrap();
        copy_dir_recursive(source.path(), build.path()).unwrap();
        let compile_dir = build.path().join("paper-a");
        compile_with_texlive(&compile_dir, "main.tex", TexEngine::Latex, main).unwrap();
        assert!(compile_dir.join("main.pdf").exists());
        assert!(std::fs::read_to_string(compile_dir.join("main.log"))
            .unwrap()
            .contains("sections/intro.tex"));
    }

    #[test]
    fn latexmk_compiles_nested_main_with_relative_input() {
        if find_texlive_binary("latexmk").is_err() {
            return;
        }
        let build = tempfile::tempdir().unwrap();
        let compile_dir = build.path().join("paper-a");
        std::fs::create_dir_all(compile_dir.join("sections")).unwrap();
        std::fs::write(
            compile_dir.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(
            compile_dir.join("sections/intro.tex"),
            "Nested source works.\n",
        )
        .unwrap();
        compile_with_latexmk(&compile_dir, "main.tex", TexEngine::Latex).unwrap();
        assert!(compile_dir.join("main.pdf").exists());
        assert!(std::fs::read_to_string(compile_dir.join("main.log"))
            .unwrap()
            .contains("sections/intro.tex"));
    }

    #[test]
    fn parallel_nested_mains_keep_their_own_sources_and_pdfs() {
        if find_texlive_binary("pdflatex").is_err() {
            return;
        }
        let source = tempfile::tempdir().unwrap();
        let main = "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
        for (paper, marker) in [("paper-a", "BUILD_A"), ("paper-b", "BUILD_B")] {
            let dir = source.path().join(paper);
            std::fs::create_dir_all(dir.join("sections")).unwrap();
            std::fs::write(dir.join("main.tex"), main).unwrap();
            std::fs::write(
                dir.join("sections/intro.tex"),
                format!("\\typeout{{{marker}}}\n{marker}\n"),
            )
            .unwrap();
        }

        let source_path = source.path().to_path_buf();
        std::thread::scope(|scope| {
            let builds: Vec<_> = [("paper-a", "BUILD_A"), ("paper-b", "BUILD_B")]
                .into_iter()
                .map(|(paper, marker)| {
                    let source_path = source_path.clone();
                    scope.spawn(move || {
                        let relative_main = format!("{paper}/main.tex");
                        let work_dir =
                            persistent_build_dir_for(source_path.to_str().unwrap(), &relative_main);
                        copy_dir_recursive(&source_path, &work_dir).unwrap();
                        let compile_dir = work_dir.join(paper);
                        compile_with_texlive(&compile_dir, "main.tex", TexEngine::Latex, main)
                            .unwrap();
                        let log = std::fs::read_to_string(compile_dir.join("main.log")).unwrap();
                        let pdf = std::fs::read(compile_dir.join("main.pdf")).unwrap();
                        assert!(log.contains(marker), "{paper} read the wrong section");
                        (log, pdf)
                    })
                })
                .collect();
            let mut builds = builds.into_iter();
            let first = builds.next().unwrap().join().unwrap();
            let second = builds.next().unwrap().join().unwrap();
            assert!(!first.0.contains("BUILD_B"));
            assert!(!second.0.contains("BUILD_A"));
            assert_ne!(first.1, second.1);
        });
    }

    // --- copy_dir_recursive integration tests ---

    #[test]
    fn test_copy_dir_recursive_nested() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        // Create nested structure
        std::fs::create_dir_all(src.path().join("sub").join("deep")).unwrap();
        std::fs::write(src.path().join("top.tex"), "top").unwrap();
        std::fs::write(src.path().join("sub").join("mid.tex"), "mid").unwrap();
        std::fs::write(
            src.path().join("sub").join("deep").join("bottom.tex"),
            "bottom",
        )
        .unwrap();

        copy_dir_recursive(src.path(), dst.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(dst.path().join("top.tex")).unwrap(),
            "top"
        );
        assert_eq!(
            std::fs::read_to_string(dst.path().join("sub").join("mid.tex")).unwrap(),
            "mid"
        );
        assert_eq!(
            std::fs::read_to_string(dst.path().join("sub").join("deep").join("bottom.tex"))
                .unwrap(),
            "bottom"
        );
    }

    #[test]
    fn test_copy_dir_recursive_skips_hidden_dirs() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::create_dir_all(src.path().join(".git")).unwrap();
        std::fs::write(src.path().join(".git").join("config"), "secret").unwrap();
        std::fs::write(src.path().join("main.tex"), "doc").unwrap();

        copy_dir_recursive(src.path(), dst.path()).unwrap();

        assert!(dst.path().join("main.tex").exists());
        assert!(!dst.path().join(".git").exists(), ".git should be skipped");
    }

    #[test]
    fn test_copy_dir_recursive_empty_subdir() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::create_dir_all(src.path().join("empty_sub")).unwrap();
        std::fs::write(src.path().join("a.tex"), "a").unwrap();

        copy_dir_recursive(src.path(), dst.path()).unwrap();

        assert!(dst.path().join("empty_sub").exists());
        assert!(dst.path().join("empty_sub").is_dir());
    }

    // --- sync_source_files integration tests ---

    #[test]
    fn test_sync_source_files_copies_sources() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::write(src.path().join("main.tex"), "doc").unwrap();
        std::fs::write(src.path().join("refs.bib"), "bib").unwrap();
        std::fs::write(src.path().join("style.sty"), "sty").unwrap();

        sync_source_files(src.path(), dst.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(dst.path().join("main.tex")).unwrap(),
            "doc"
        );
        assert_eq!(
            std::fs::read_to_string(dst.path().join("refs.bib")).unwrap(),
            "bib"
        );
        assert_eq!(
            std::fs::read_to_string(dst.path().join("style.sty")).unwrap(),
            "sty"
        );
    }

    #[test]
    fn test_sync_source_files_skips_artifacts() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::write(src.path().join("main.tex"), "doc").unwrap();
        std::fs::write(src.path().join("main.aux"), "aux").unwrap();
        std::fs::write(src.path().join("main.log"), "log").unwrap();
        std::fs::write(src.path().join("main.synctex.gz"), "sync").unwrap();

        sync_source_files(src.path(), dst.path()).unwrap();

        assert!(dst.path().join("main.tex").exists());
        assert!(!dst.path().join("main.aux").exists());
        assert!(!dst.path().join("main.log").exists());
        assert!(!dst.path().join("main.synctex.gz").exists());
    }

    #[test]
    fn test_sync_source_files_recursive_and_skips_hidden() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::create_dir_all(src.path().join("chapters")).unwrap();
        std::fs::create_dir_all(src.path().join(".claudeprism")).unwrap();
        std::fs::write(src.path().join("chapters").join("ch1.tex"), "ch1").unwrap();
        std::fs::write(src.path().join("chapters").join("ch1.aux"), "aux").unwrap();
        std::fs::write(src.path().join(".claudeprism").join("data"), "data").unwrap();

        sync_source_files(src.path(), dst.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(dst.path().join("chapters").join("ch1.tex")).unwrap(),
            "ch1"
        );
        assert!(!dst.path().join("chapters").join("ch1.aux").exists());
        assert!(!dst.path().join(".claudeprism").exists());
    }

    // --- sync_source_files copies figure PDFs ---

    #[test]
    fn test_sync_source_files_copies_figure_pdfs() {
        // .pdf files (e.g. figures) must be synced — they are NOT artifacts.
        // The output PDF is managed by compile_latex (explicit remove_file).
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        std::fs::create_dir_all(src.path().join("figures")).unwrap();
        std::fs::write(src.path().join("main.tex"), "doc").unwrap();
        std::fs::write(src.path().join("figures").join("chart.pdf"), "pdf figure").unwrap();

        sync_source_files(src.path(), dst.path()).unwrap();

        assert!(dst.path().join("main.tex").exists());
        assert_eq!(
            std::fs::read_to_string(dst.path().join("figures").join("chart.pdf")).unwrap(),
            "pdf figure"
        );
    }

    #[test]
    fn test_sync_source_files_overwrites_changed_tex_content() {
        // Regression: when a user empties a file, sync must overwrite
        // the old content in the build dir with the empty content.
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        // Old content in build dir
        std::fs::write(dst.path().join("main.tex"), "old content").unwrap();
        // User emptied the file
        std::fs::write(src.path().join("main.tex"), "").unwrap();

        sync_source_files(src.path(), dst.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(dst.path().join("main.tex")).unwrap(),
            ""
        );
    }

    // --- persistent_build_dir ---

    #[test]
    fn test_stale_pdf_removal_pattern() {
        // Simulates the pattern used in compile_latex: remove stale PDF
        // before compilation so a failed compile doesn't return old results.
        let build_dir = tempfile::tempdir().unwrap();
        let pdf_path = build_dir.path().join("document.pdf");

        // Simulate previous successful build left a PDF
        std::fs::write(&pdf_path, "old pdf data").unwrap();
        assert!(pdf_path.exists());

        // This is what compile_latex does before running tectonic
        let _ = std::fs::remove_file(&pdf_path);
        assert!(!pdf_path.exists());

        // If compilation fails, pdf_path.exists() is false → error returned
    }

    #[test]
    fn test_stale_pdf_removal_no_existing_file() {
        // remove_file on a non-existent path should not panic (we use let _ =)
        let build_dir = tempfile::tempdir().unwrap();
        let pdf_path = build_dir.path().join("document.pdf");

        assert!(!pdf_path.exists());
        let result = std::fs::remove_file(&pdf_path);
        // It's an error but we ignore it with let _ =
        assert!(result.is_err());
    }
}
