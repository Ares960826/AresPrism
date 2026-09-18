import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const env = { ...process.env };

function appendEnvFlag(name, flag) {
  const current = env[name] ?? "";
  env[name] = current.includes(flag)
    ? current
    : [current, flag].filter(Boolean).join(" ");
}

function prependPkgConfigPath(dir) {
  if (!existsSync(dir)) return;
  const current = env.PKG_CONFIG_PATH ?? "";
  if (current.split(":").includes(dir)) return;
  env.PKG_CONFIG_PATH = current ? `${dir}:${current}` : dir;
}

function prependCpath(dir) {
  if (!existsSync(dir)) return;
  const current = env.CPATH ?? "";
  if (current.split(":").includes(dir)) return;
  env.CPATH = current ? `${dir}:${current}` : dir;
}

if (process.platform === "darwin") {
  for (const prefix of ["/opt/homebrew/opt", "/usr/local/opt"]) {
    for (const pkg of ["icu4c@78", "icu4c", "harfbuzz"]) {
      prependPkgConfigPath(join(prefix, pkg, "lib/pkgconfig"));
    }
  }
  // tectonic includes <harfbuzz/hb.h>; Homebrew pkg-config points inside
  // include/harfbuzz, so the parent include dir must be on CPATH.
  prependCpath("/opt/homebrew/include");
  prependCpath("/usr/local/include");
  // Homebrew ICU 78 headers need C++17; tectonic's default is C++14.
  env.CXXFLAGS = [env.CXXFLAGS, "-std=c++17"].filter(Boolean).join(" ");
}

if (process.platform === "win32") {
  env.VCPKG_ROOT ||= join(env.USERPROFILE ?? "", "vcpkg");
  env.TECTONIC_DEP_BACKEND = "vcpkg";
  env.VCPKGRS_TRIPLET = "x64-windows-static-release";
  env.VCPKG_DEFAULT_TRIPLET = env.VCPKGRS_TRIPLET;
  appendEnvFlag("RUSTFLAGS", "-Ctarget-feature=+crt-static");
  env.CXXFLAGS = [env.CXXFLAGS, "/std:c++17"].filter(Boolean).join(" ");
}

const args = ["--filter=@claude-prism/desktop", "tauri", "build"];

if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  args.push("--config", "src-tauri/tauri.local-build.conf.json");
}

const child =
  process.platform === "win32"
    ? spawn(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `corepack pnpm ${args.join(" ")}`],
        {
          env,
          stdio: "inherit",
        },
      )
    : spawn("pnpm", args, {
        env,
        stdio: "inherit",
      });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
