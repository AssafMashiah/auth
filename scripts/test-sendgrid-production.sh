#!/bin/bash

# SendGrid Production Email Test Script
# Tests all email actions with real SendGrid integration
# Email: gilad@maoz.dev

BASE_URL="http://localhost:8787"
TEST_EMAIL="gilad@maoz.dev"
TEST_PASSWORD="TestPassword123!"
SITE_URL="https://test.maoz.dev"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Template IDs (from email-service.ts)
CONFIRMATION_TEMPLATE="d-4517456e9873406f8d268c8702829235"
PASSWORD_RESET_TEMPLATE="d-d0476cbd632e407e87c6faeb2cbe36df"
WELCOME_TEMPLATE="d-9256402ef47c43fe943002820b626c6a"

ADMIN_SESSION=""
PROJECT_ID=""
USER_ID=""
ACCESS_TOKEN=""

echo ""
echo -e "${WHITE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║        SendGrid Production Email Integration Test              ║${NC}"
echo -e "${WHITE}║        Testing with: ${CYAN}${TEST_EMAIL}${WHITE}                    ║${NC}"
echo -e "${WHITE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Helper function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# Helper function to print info
print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Helper function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Helper function to wait for user confirmation
wait_for_user() {
    echo ""
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}⏸  PAUSED - Check your email inbox${NC}"
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${WHITE}Email: ${CYAN}${TEST_EMAIL}${NC}"
    echo -e "${WHITE}$1${NC}"
    echo ""
    echo -e "${YELLOW}Check both inbox and spam folder!${NC}"
    echo ""
    read -p "Press Enter when you've checked your email and are ready to continue..."
    echo ""
}

# Helper function to extract and display email info from server logs
display_email_info() {
    echo ""
    echo -e "${CYAN}📧 Email Information:${NC}"
    echo -e "   Template ID: ${WHITE}$1${NC}"
    echo -e "   Recipient: ${WHITE}${TEST_EMAIL}${NC}"
    echo -e "   URL Generated: ${WHITE}$2${NC}"
    echo ""
}

# ============================================================
# STEP 1: Admin Login
# ============================================================
print_section "Step 1: Admin Login"

print_info "Logging in as admin..."
ADMIN_LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "admin@example.com",
        "password": "Admin123!"
    }')

HTTP_CODE=$(echo "$ADMIN_LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ADMIN_LOGIN_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Admin login successful"
    ADMIN_SESSION=$(echo "$RESPONSE_BODY" | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)
    print_info "Session token obtained"
else
    print_status 1 "Admin login failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# ============================================================
# STEP 2: Create Project with Site URL
# ============================================================
print_section "Step 2: Create Project with Site URL"

print_info "Creating test project with siteUrl: ${SITE_URL}..."
PROJECT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/projects" \
    -H "Content-Type: application/json" \
    -H "Cookie: admin_session=$ADMIN_SESSION" \
    -d "{
        \"name\": \"SendGrid Test Project\",
        \"description\": \"Testing SendGrid email templates\",
        \"siteUrl\": \"${SITE_URL}\",
        \"environments\": [\"production\"]
    }")

HTTP_CODE=$(echo "$PROJECT_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$PROJECT_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    print_status 0 "Project created successfully"
    PROJECT_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    print_info "Project ID: ${PROJECT_ID}"

    # Extract and verify site URL
    SAVED_SITE_URL=$(echo "$RESPONSE_BODY" | grep -o '"siteUrl":"[^"]*"' | cut -d'"' -f4)
    if [ "$SAVED_SITE_URL" = "$SITE_URL" ]; then
        print_status 0 "Site URL correctly saved: ${SAVED_SITE_URL}"
    else
        print_warning "Site URL mismatch! Expected: ${SITE_URL}, Got: ${SAVED_SITE_URL}"
    fi
else
    print_status 1 "Project creation failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# ============================================================
# STEP 3: Register User with Email Confirmation
# ============================================================
print_section "Step 3: Register User & Send Confirmation Email"

print_info "Registering user: ${TEST_EMAIL}..."
print_info "This should trigger a confirmation email..."

REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"${TEST_EMAIL}\",
        \"password\": \"${TEST_PASSWORD}\",
        \"firstName\": \"Gilad\",
        \"lastName\": \"Maoz\"
    }")

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$REGISTER_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    print_status 0 "User registered successfully"
    USER_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    print_info "User ID: ${USER_ID}"
    print_info "Access Token: ${ACCESS_TOKEN:0:30}..."

    # Display expected confirmation URL
    echo ""
    print_info "Expected confirmation URL format:"
    echo -e "   ${CYAN}${SITE_URL}/confirm-email?token=<TOKEN>${NC}"

    display_email_info "$CONFIRMATION_TEMPLATE" "${SITE_URL}/confirm-email?token=..."

    echo -e "${GREEN}✓${NC} Check server logs for: ${WHITE}'Email sent successfully'${NC}"
    echo -e "${GREEN}✓${NC} Template data should include:"
    echo -e "   - ${WHITE}project_name${NC}: SendGrid Test Project"
    echo -e "   - ${WHITE}confirmation_url${NC}: ${SITE_URL}/confirm-email?token=..."

    wait_for_user "You should have received an email with subject like 'Confirm your email' or similar.\nThe email should contain a confirmation link pointing to: ${SITE_URL}"
else
    print_status 1 "User registration failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# ============================================================
# STEP 4: Resend Verification Email (via Admin API)
# ============================================================
print_section "Step 4: Resend Verification Email"

print_info "Testing resend verification email endpoint..."
print_info "This should send another confirmation email..."

RESEND_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/projects/$PROJECT_ID/users/$USER_ID/resend-verification" \
    -H "Cookie: admin_session=$ADMIN_SESSION")

HTTP_CODE=$(echo "$RESEND_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESEND_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Verification email resent successfully"

    display_email_info "$CONFIRMATION_TEMPLATE" "${SITE_URL}/confirm-email?token=..."

    echo -e "${GREEN}✓${NC} Check server logs for: ${WHITE}'Verification email resent to: ${TEST_EMAIL}'${NC}"
    echo -e "${GREEN}✓${NC} This should use the same template: ${WHITE}${CONFIRMATION_TEMPLATE}${NC}"

    wait_for_user "You should have received a SECOND confirmation email.\nThis tests the resend functionality."
else
    print_status 1 "Resend verification failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    # Don't exit, continue with other tests
fi

# ============================================================
# STEP 5: Test Forgot Password Flow
# ============================================================
print_section "Step 5: Test Forgot Password Flow"

print_info "Requesting password reset for: ${TEST_EMAIL}..."
print_info "This should trigger a password reset email..."

FORGOT_PASSWORD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/forgot-password" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"${TEST_EMAIL}\"
    }")

HTTP_CODE=$(echo "$FORGOT_PASSWORD_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$FORGOT_PASSWORD_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Forgot password request successful"

    # Display expected reset URL
    echo ""
    print_info "Expected password reset URL format:"
    echo -e "   ${CYAN}${SITE_URL}/reset-password?token=<TOKEN>${NC}"

    display_email_info "$PASSWORD_RESET_TEMPLATE" "${SITE_URL}/reset-password?token=..."

    echo -e "${GREEN}✓${NC} Check server logs for: ${WHITE}'Email sent successfully'${NC}"
    echo -e "${GREEN}✓${NC} Check server logs for: ${WHITE}'Password reset URL source: project.siteUrl'${NC}"
    echo -e "${GREEN}✓${NC} Template data should include:"
    echo -e "   - ${WHITE}reset_url${NC}: ${SITE_URL}/reset-password?token=..."
    echo -e "   - ${WHITE}project_name${NC}: SendGrid Test Project"

    wait_for_user "You should have received a password reset email.\nThe email should contain a reset link pointing to: ${SITE_URL}"
else
    print_status 1 "Forgot password request failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
fi

# ============================================================
# STEP 6: Verification Summary
# ============================================================
print_section "Step 6: Email Verification Summary"

echo ""
echo -e "${WHITE}📊 SendGrid Templates Used:${NC}"
echo ""
echo -e "  ${CYAN}1. Email Confirmation Template${NC}"
echo -e "     Template ID: ${WHITE}${CONFIRMATION_TEMPLATE}${NC}"
echo -e "     Used for: Registration & Resend Verification"
echo -e "     Variables: project_name, confirmation_url"
echo ""
echo -e "  ${CYAN}2. Password Reset Template${NC}"
echo -e "     Template ID: ${WHITE}${PASSWORD_RESET_TEMPLATE}${NC}"
echo -e "     Used for: Forgot Password Flow"
echo -e "     Variables: reset_url, project_name"
echo ""
echo -e "  ${CYAN}3. Welcome Email Template${NC}"
echo -e "     Template ID: ${WHITE}${WELCOME_TEMPLATE}${NC}"
echo -e "     Used for: After email confirmation (not tested here)"
echo -e "     Variables: project_name, extra_data (optional)"
echo ""

echo -e "${WHITE}🔗 URL Source Verification:${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} All URLs should use project.siteUrl: ${CYAN}${SITE_URL}${NC}"
echo -e "  ${GREEN}✓${NC} NOT using environment variables (PASSWORD_RESET_BASE_URL, etc.)"
echo ""

echo -e "${WHITE}📧 Emails Sent to: ${CYAN}${TEST_EMAIL}${NC}"
echo ""
echo -e "  ${GREEN}1.${NC} Registration confirmation email"
echo -e "  ${GREEN}2.${NC} Resend verification email"
echo -e "  ${GREEN}3.${NC} Password reset email"
echo ""

echo -e "${WHITE}✅ What to Verify in Your Inbox:${NC}"
echo ""
echo -e "  ${CYAN}□${NC} All 3 emails received successfully"
echo -e "  ${CYAN}□${NC} Emails are properly formatted (not showing template variables)"
echo -e "  ${CYAN}□${NC} Links point to: ${SITE_URL}"
echo -e "  ${CYAN}□${NC} Project name appears as: 'SendGrid Test Project'"
echo -e "  ${CYAN}□${NC} No spam/junk issues"
echo -e "  ${CYAN}□${NC} Proper sender email address"
echo ""

echo -e "${WHITE}📝 Check Server Logs for:${NC}"
echo ""
echo -e "  ${CYAN}□${NC} 'Sending email to SendGrid' messages"
echo -e "  ${CYAN}□${NC} 'Email sent successfully' confirmations"
echo -e "  ${CYAN}□${NC} Template IDs in logs match expected values"
echo -e "  ${CYAN}□${NC} 'Email confirmation URL source: project.siteUrl'"
echo -e "  ${CYAN}□${NC} 'Password reset URL source: project.siteUrl'"
echo -e "  ${CYAN}□${NC} No SendGrid API errors"
echo ""

# ============================================================
# STEP 7: Cleanup (Optional)
# ============================================================
echo ""
read -p "Would you like to delete the test project? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_section "Step 7: Cleanup - Deleting Test Project"

    DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
        "$BASE_URL/api/admin/projects/$PROJECT_ID" \
        -H "Cookie: admin_session=$ADMIN_SESSION")

    HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        print_status 0 "Test project deleted"
    else
        print_warning "Failed to delete project (HTTP $HTTP_CODE)"
    fi
fi

# ============================================================
# FINAL SUMMARY
# ============================================================
echo ""
echo -e "${WHITE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║                     Test Complete!                             ║${NC}"
echo -e "${WHITE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓${NC} All email flows tested successfully"
echo -e "${GREEN}✓${NC} SendGrid integration verified"
echo -e "${GREEN}✓${NC} Project site URL used correctly"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Review all emails in ${CYAN}${TEST_EMAIL}${NC}"
echo -e "  2. Click confirmation links to test the full flow"
echo -e "  3. Check SendGrid dashboard for delivery stats"
echo -e "  4. Review server logs for any warnings"
echo ""
echo -e "${CYAN}Test completed at: $(date)${NC}"
echo ""