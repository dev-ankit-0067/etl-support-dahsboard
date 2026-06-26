#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"
NGINX_SITE = Path("/etc/nginx/sites-available/default")


def run(cmd, cwd=None, env=None, check=True):
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, env=env, check=check)


def has_command(name: str) -> bool:
    return shutil.which(name) is not None


def sudo_prefix() -> list[str]:
    return ["sudo"] if shutil.which("sudo") else []


def ensure_system_packages() -> None:
    if os.geteuid() != 0 and shutil.which("sudo") is None:
        raise SystemExit("This setup needs sudo or root privileges to install system packages.")

    if shutil.which("apt-get"):
        run([*sudo_prefix(), "apt-get", "update"])
        packages = []
        if not has_command("python3"):
            packages.append("python3")
        if not has_command("python3") or not has_command("python3-venv"):
            packages.append("python3-venv")
        if not has_command("pip3") and not has_command("python3"):
            packages.append("python3-pip")
        if not has_command("node"):
            packages.append("nodejs")
        if not has_command("npm"):
            packages.append("npm")
        if not has_command("nginx"):
            packages.append("nginx")
        if packages:
            run([*sudo_prefix(), "apt-get", "install", "-y", *packages])
    else:
        raise SystemExit("Unsupported OS. Expected apt-get-based Linux distribution.")


def ensure_pnpm() -> None:
    if has_command("pnpm"):
        return
    if not has_command("npm"):
        raise SystemExit("npm is required to install pnpm")
    run(["npm", "install", "-g", "pnpm"])


def ensure_python_env() -> None:
    if not VENV_DIR.exists():
        run([sys.executable, "-m", "venv", str(VENV_DIR)])
    python_bin = VENV_DIR / "bin" / "python"
    run([str(python_bin), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(python_bin), "-m", "pip", "install", "-r", str(ROOT / "aws-backend" / "requirements.txt")])


def install_frontend_dependencies() -> None:
    run(["pnpm", "install", "--frozen-lockfile"], cwd=ROOT)
    run(["pnpm", "--dir", "artifacts/etl-dashboard", "run", "build"], cwd=ROOT)


def install_nginx_config() -> None:
    source = ROOT / "nginx" / "default.conf"
    run([*sudo_prefix(), "cp", str(source), str(NGINX_SITE)])
    run([*sudo_prefix(), "ln", "-sfn", str(NGINX_SITE), "/etc/nginx/sites-enabled/default"])
    if (Path("/etc/nginx/conf.d/default.conf")).exists():
        run([*sudo_prefix(), "rm", "-f", "/etc/nginx/conf.d/default.conf"])
    run([*sudo_prefix(), "nginx", "-t"])
    run([*sudo_prefix(), "service", "nginx", "restart"], check=False)


def main() -> None:
    print("Setting up the ETL support dashboard...")
    ensure_system_packages()
    ensure_pnpm()
    ensure_python_env()
    install_frontend_dependencies()
    install_nginx_config()
    print("Setup completed successfully.")
    print("Run ./startup.sh to start the backend and frontend.")


if __name__ == "__main__":
    main()
