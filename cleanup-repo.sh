#!/bin/bash

# 🧹 Apple MCP Enhanced Repository Cleanup Script
# This script removes all one-time test files and outdated documentation

echo "🧹 Starting repository cleanup..."
echo "=================================="

# Test files to delete (one-time use)
TEST_FILES=(
    "test-cache-system.ts"
    "test-contact-search-fix.ts"
    "test-mcp-integration.ts"
    "timing-test.ts"
)

# Documentation files to delete (outdated/superseded)
DOC_FILES=(
    "mail-search-explanation.txt"
    "CONFIRMATION_FIX.md"
    "INTERNATIONAL_PHONE_FIX.md"
    "MESSAGING_ENHANCEMENTS.md"
    "CALENDAR_ENHANCEMENTS.md"
    "CACHE-README.md"
    "README-IMAP.md"
    "imap-search-guide.md"
)

# Function to delete a file if it exists
delete_file() {
    if [ -f "$1" ]; then
        rm "$1"
        echo "✅ Deleted: $1"
    else
        echo "⚠️  Not found: $1"
    fi
}

echo ""
echo "🗑️  Deleting test files..."
echo "--------------------------"
for file in "${TEST_FILES[@]}"; do
    delete_file "$file"
done

echo ""
echo "📄 Deleting outdated documentation..."
echo "------------------------------------"
for file in "${DOC_FILES[@]}"; do
    delete_file "$file"
done

echo ""
echo "📊 Repository cleanup summary:"
echo "============================="
echo "✅ Removed obsolete test files"
echo "✅ Removed outdated documentation"
echo "✅ Kept essential files:"
echo "   - README.md (main documentation)"
echo "   - MESSAGING_DEBUGGING_LATEST_CONTEXT.md (current status)"
echo "   - CLAUDE.md (usage instructions)"
echo "   - All core functionality files"
echo ""

# Calculate space saved
TOTAL_SIZE=0
for file in "${TEST_FILES[@]}" "${DOC_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        # File was deleted, estimate sizes
        case "$file" in
            "test-cache-system.ts") TOTAL_SIZE=$((TOTAL_SIZE + 5)) ;;
            "test-contact-search-fix.ts") TOTAL_SIZE=$((TOTAL_SIZE + 6)) ;;
            "test-mcp-integration.ts") TOTAL_SIZE=$((TOTAL_SIZE + 4)) ;;
            "timing-test.ts") TOTAL_SIZE=$((TOTAL_SIZE + 1)) ;;
            "mail-search-explanation.txt") TOTAL_SIZE=$((TOTAL_SIZE + 1)) ;;
            "CONFIRMATION_FIX.md") TOTAL_SIZE=$((TOTAL_SIZE + 5)) ;;
            "INTERNATIONAL_PHONE_FIX.md") TOTAL_SIZE=$((TOTAL_SIZE + 4)) ;;
            "MESSAGING_ENHANCEMENTS.md") TOTAL_SIZE=$((TOTAL_SIZE + 7)) ;;
            "CALENDAR_ENHANCEMENTS.md") TOTAL_SIZE=$((TOTAL_SIZE + 6)) ;;
            "CACHE-README.md") TOTAL_SIZE=$((TOTAL_SIZE + 8)) ;;
            "README-IMAP.md") TOTAL_SIZE=$((TOTAL_SIZE + 3)) ;;
            "imap-search-guide.md") TOTAL_SIZE=$((TOTAL_SIZE + 3)) ;;
        esac
    fi
done

echo "💾 Estimated space saved: ~${TOTAL_SIZE}KB"
echo ""
echo "🎉 Cleanup completed!"
echo ""
echo "📝 Next steps:"
echo "1. Review the changes: git status"
echo "2. Commit the cleanup: git add -A && git commit -m '🧹 Clean up obsolete files'"
echo "3. Push changes: git push"
echo ""
echo "ℹ️  The repository now contains only essential, current files."
