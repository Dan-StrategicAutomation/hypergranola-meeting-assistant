#!/bin/bash

# Repository Cleanup Script for HyperGranola Meeting Assistant
# This script removes unnecessary files and directories to clean up the repository

echo "🧹 Starting repository cleanup..."

# Function to safely remove files and directories
safe_remove() {
    if [ -e "$1" ]; then
        echo "🗑️  Removing $1"
        rm -rf "$1"
    else
        echo "✅ $1 already clean"
    fi
}

# Function to check and remove large files
check_large_files() {
    echo "🔍 Checking for large files..."
    find . -type f -size +50M -not -path './node_modules/*' -not -path './.git/*' | while read -r file; do
        echo "⚠️  Large file found: $file ($(du -h "$file" | cut -f1))"
        read -p "Remove this large file? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f "$file"
            echo "🗑️  Removed $file"
        fi
    done
}

# 1. Clean up build artifacts
echo "🛠️  Cleaning build artifacts..."
safe_remove "dist"
safe_remove "build"
safe_remove "*.local"
safe_remove "*.log"
safe_remove "*.tgz"
safe_remove "yarn-error.log"
safe_remove "npm-debug.log"

# 2. Clean up Tauri-specific build files
echo "🛠️  Cleaning Tauri build files..."
safe_remove "src-tauri/target"
safe_remove "src-tauri/debug"
safe_remove "src-tauri/release"
safe_remove "src-tauri/*.rlib"
safe_remove "src-tauri/*.so"
safe_remove "src-tauri/*.dylib"
safe_remove "src-tauri/*.dll"
safe_remove "src-tauri/*.exe"
safe_remove "src-tauri/*.pdb"

# 3. Clean up generated files
echo "🛠️  Cleaning generated files..."
safe_remove "*.gen.ts"
safe_remove "*.d.ts"
safe_remove "*.js.map"
safe_remove "*.css.map"

# 4. Clean up cache and temporary files
echo "🛠️  Cleaning cache and temporary files..."
safe_remove ".cache"
safe_remove "temp"
safe_remove "tmp"
safe_remove "*.tmp"
safe_remove "*.temp"
safe_remove "*.cache"
safe_remove "*.swp"
safe_remove "*.swo"
safe_remove "*.bak"
safe_remove "*.backup"
safe_remove "*.orig"

# 5. Clean up documentation build files
echo "🛠️  Cleaning documentation files..."
safe_remove "docs"
safe_remove "*.html"
safe_remove "*.pdf"

# 6. Check for and optionally remove large files
check_large_files

# 7. Clean up environment files (but keep .env.example)
echo "🛠️  Cleaning environment files..."
if [ -f ".env" ] && [ ! -f ".env.example" ]; then
    echo "📋 Found .env file, creating .env.example backup"
    cp ".env" ".env.example"
    echo "🔑 .env.example created (copy .env.example to .env and add your keys)"
fi
safe_remove ".env"
safe_remove ".env.local"
safe_remove ".env.*.local"

# 8. Clean up IDE-specific files
echo "🛠️  Cleaning IDE files..."
safe_remove ".idea"
safe_remove "*.iml"
safe_remove "*.ipr"
safe_remove "*.iws"

# 9. Clean up system files
echo "🛠️  Cleaning system files..."
safe_remove ".DS_Store"
safe_remove "Thumbs.db"
safe_remove "Desktop.ini"

# 10. Clean up test and coverage files
echo "🛠️  Cleaning test files..."
safe_remove "coverage"
safe_remove ".nyc_output"
safe_remove "*.lcov"
safe_remove "*.profraw"
safe_remove "*.profdata"

# 11. Clean up Rust-specific files
echo "🛠️  Cleaning Rust files..."
safe_remove "*.rs.bk"
safe_remove "*.rs~"
safe_remove "*.rs.orig"

# 12. Clean up package manager files (keep lock files for reproducibility)
echo "📦 Keeping package lock files for reproducibility"
# safe_remove "package-lock.json"
# safe_remove "yarn.lock"
# safe_remove "pnpm-lock.yaml"
# safe_remove "Cargo.lock"

echo "🎉 Repository cleanup completed!"
echo ""
echo "📊 Summary of cleanup:"
echo "   ✅ Build artifacts removed"
echo "   ✅ Tauri build files cleaned"
echo "   ✅ Generated files removed"
echo "   ✅ Cache and temporary files cleared"
echo "   ✅ Documentation files cleaned"
echo "   ✅ Large files checked"
echo "   ✅ Environment files organized"
echo "   ✅ IDE files removed"
echo "   ✅ System files cleaned"
echo "   ✅ Test files removed"
echo "   ✅ Rust backup files removed"
echo "   ⏳ Package lock files preserved for reproducibility"

echo ""
echo "💡 Next steps:"
echo "   1. Run 'git status' to review changes"
echo "   2. Add cleaned files to .gitignore if needed"
echo "   3. Commit the cleanup changes"
echo "   4. Ready for implementation!"