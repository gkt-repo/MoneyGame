#!/usr/bin/env python3
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

USER_ICON_SRC = "/home/gulshan/.gemini/antigravity/brain/c936982d-58b8-45fb-bc87-8c77b2811afe/user_app_tilted_perfect_neg14.png"
ADMIN_ICON_SRC = "/home/gulshan/.gemini/antigravity/brain/c936982d-58b8-45fb-bc87-8c77b2811afe/admin_app_executive_shield.png"

def process_app_icons(app_type, src_path):
    print(f"\nProcessing icons for {app_type} from {src_path}...")
    img = Image.open(src_path).convert("RGBA")
    
    app_dir = os.path.join(PROJECT_ROOT, "apps", f"{app_type}-app")
    web_dir = os.path.join(PROJECT_ROOT, "apps", f"{app_type}-web")
    
    # 1. Master asset
    assets_icon_dir = os.path.join(app_dir, "assets", "icon")
    os.makedirs(assets_icon_dir, exist_ok=True)
    master_png_path = os.path.join(assets_icon_dir, "app_icon.png")
    img.resize((1024, 1024), Image.Resampling.LANCZOS).save(master_png_path, "PNG", optimize=True)
    print(f"Saved master icon: {master_png_path}")
    
    # 2. Android mipmaps
    android_res_dir = os.path.join(app_dir, "android", "app", "src", "main", "res")
    android_sizes = {
        "mipmap-mdpi": (48, 48),
        "mipmap-hdpi": (72, 72),
        "mipmap-xhdpi": (96, 96),
        "mipmap-xxhdpi": (144, 144),
        "mipmap-xxxhdpi": (192, 192)
    }
    for folder, size in android_sizes.items():
        folder_path = os.path.join(android_res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        target = os.path.join(folder_path, "ic_launcher.png")
        img.resize(size, Image.Resampling.LANCZOS).save(target, "PNG", optimize=True)
        print(f"Saved Android {folder} ({size[0]}x{size[1]}): {target}")
    
    # 3. iOS AppIcon
    ios_iconset_dir = os.path.join(app_dir, "ios", "Runner", "Assets.xcassets", "AppIcon.appiconset")
    ios_sizes = {
        "Icon-App-20x20@1x.png": (20, 20),
        "Icon-App-20x20@2x.png": (40, 40),
        "Icon-App-20x20@3x.png": (60, 60),
        "Icon-App-29x29@1x.png": (29, 29),
        "Icon-App-29x29@2x.png": (58, 58),
        "Icon-App-29x29@3x.png": (87, 87),
        "Icon-App-40x40@1x.png": (40, 40),
        "Icon-App-40x40@2x.png": (80, 80),
        "Icon-App-40x40@3x.png": (120, 120),
        "Icon-App-60x60@2x.png": (120, 120),
        "Icon-App-60x60@3x.png": (180, 180),
        "Icon-App-76x76@1x.png": (76, 76),
        "Icon-App-76x76@2x.png": (152, 152),
        "Icon-App-83.5x83.5@2x.png": (167, 167),
        "Icon-App-1024x1024@1x.png": (1024, 1024)
    }
    if os.path.exists(ios_iconset_dir):
        for name, size in ios_sizes.items():
            target = os.path.join(ios_iconset_dir, name)
            img.resize(size, Image.Resampling.LANCZOS).save(target, "PNG", optimize=True)
            print(f"Saved iOS {name} ({size[0]}x{size[1]})")

    # 4. Flutter Web icons
    flutter_web_dir = os.path.join(app_dir, "web")
    if os.path.exists(flutter_web_dir):
        img.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(flutter_web_dir, "favicon.png"), "PNG")
        icons_dir = os.path.join(flutter_web_dir, "icons")
        os.makedirs(icons_dir, exist_ok=True)
        img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "Icon-192.png"), "PNG")
        img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "Icon-512.png"), "PNG")
        img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "Icon-maskable-192.png"), "PNG")
        img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(icons_dir, "Icon-maskable-512.png"), "PNG")
        print(f"Saved Flutter Web icons in {flutter_web_dir}")

    # 5. React Web App public and dist directories
    if os.path.exists(web_dir):
        for sub in ["public", "dist"]:
            target_dir = os.path.join(web_dir, sub)
            if os.path.exists(target_dir):
                img.resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(target_dir, "favicon.png"), "PNG")
                img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(target_dir, "logo.png"), "PNG")
                print(f"Saved React Web icons in {target_dir}")

if __name__ == "__main__":
    process_app_icons("user", USER_ICON_SRC)
    process_app_icons("admin", ADMIN_ICON_SRC)
    print("\nAll app icons successfully generated!")
