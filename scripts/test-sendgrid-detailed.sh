#!/bin/bash

# SendGrid Detailed Email Test Script
# Tests different email types to isolate issues

BASE_URL="http://localhost:8787"
ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL for an existing admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD for that admin}"
ADMIN_SESSION=""
PROJECT_ID="1d12e5732e0d32b9500a7f6c0f01b54e"  # e2e-test-project
USER_ID="9ded92ef-d8b6-4afa-a931-41dc169d5055"  # gilad@maoz.dev
TO_EMAIL="gilad@maoz.dev"

echo "🔍 SendGrid Email Diagnostic Test"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test 1: Get Admin Session
echo "📝 Step 1: Getting Admin Session"
ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}")

HTTP_CODE=$(echo "$ADMIN_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$ADMIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    ADMIN_SESSION=$(echo "$RESPONSE_BODY" | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓${NC} Admin session obtained"
else
    echo -e "${RED}✗${NC} Admin login failed"
    echo "$RESPONSE_BODY"
    exit 1
fi

echo ""
echo "🧪 Step 2: Testing Different Email Scenarios"
echo "=============================================="

# Test 2A: Resend Verification Email (Confirmation)
echo ""
echo "📧 Test A: Resend Verification Email"
echo "   (This should send confirmation email with template d-4517456e9873406f8d268c8702829235)"

CONFIRM_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/projects/$PROJECT_ID/users/$USER_ID/resend-verification" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Session: $ADMIN_SESSION" \
    -d '{}')

HTTP_CODE=$(echo "$CONFIRM_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$CONFIRM_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} API call successful (200 OK)"
    echo "   Response: $RESPONSE_BODY"
else
    echo -e "${RED}✗${NC} API call failed (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
fi

echo ""
echo "🔍 Expected in logs:"
echo "   - 'Sending email to SendGrid:' with templateId 'd-4517456e9873406f8d268c8702829235'"
echo "   - 'Email sent successfully:' message"
echo "   - Confirmation email should be delivered to: $TO_EMAIL"

echo ""
echo "🔑 Test B: Forgot Password Email (for comparison)"
echo "   (This should send password reset email with template d-d0476cbd632e407e87c6faeb2cbe36df)"

FORGOT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/forgot-password" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TO_EMAIL\"}")

HTTP_CODE=$(echo "$FORGOT_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$FORGOT_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} API call successful (200 OK)"
    echo "   Response: $RESPONSE_BODY"
else
    echo -e "${RED}✗${NC} API call failed (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
fi

echo ""
echo "🔍 Expected in logs:"
echo "   - 'Sending email to SendGrid:' with templateId 'd-d0476cbd632e407e87c6faeb2cbe36df'"
echo "   - 'Email sent successfully:' message"
echo "   - Password reset email should be delivered to: $TO_EMAIL"

echo ""
echo "📋 Analysis Summary:"
echo "==================="
echo ""
echo "If you received the password reset email but NOT the confirmation email:"
echo "   → Issue is with confirmation template (d-4517456e9873406f8d268c8702829235)"
echo "   → Check template content, variables, and format in SendGrid"
echo ""
echo "If you received neither email:"
echo "   → Check SendGrid delivery logs in SendGrid dashboard"
echo "   → Verify API key and sender authentication"
echo ""
echo "If you received both emails:"
echo "   → Check email filters/spam folder for confirmation emails"
echo "   → Verify template content doesn't trigger spam filters"
echo ""
echo "📍 Next steps based on results:"
echo "   1. Check dev.log for detailed SendGrid API calls"
echo "   2. Check SendGrid dashboard for delivery status"
echo "   3. Compare working vs non-working templates"
echo ""

echo "🎯 Test completed. Check your email inbox and the development logs."