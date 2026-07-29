#!/bin/bash

# Auth Service Test Script
# Tests the complete authentication flow

BASE_URL="http://localhost:8787"
ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL for an existing admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD for that admin}"
ADMIN_SESSION=""
PROJECT_ID=""
ACCESS_TOKEN=""

echo "🧪 Auth Service Testing"
echo "======================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# 1. Test Admin Login
echo ""
echo "🔐 Step 1: Testing Admin Login..."
ADMIN_LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}")

HTTP_CODE=$(echo "$ADMIN_LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ADMIN_LOGIN_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Admin login successful"
    # Extract session cookie (simplified - in real scenario parse Set-Cookie header)
    ADMIN_SESSION=$(echo "$RESPONSE_BODY" | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)
    echo "   Session: ${ADMIN_SESSION:0:20}..."
else
    print_status 1 "Admin login failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# 3. Create a Project
echo ""
echo "🏗️  Step 3: Creating a test project..."
PROJECT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/admin/projects" \
    -H "Content-Type: application/json" \
    -H "Cookie: admin_session=$ADMIN_SESSION" \
    -d '{
        "name": "Test Project",
        "description": "A test project for authentication",
        "environments": ["production"]
    }')

HTTP_CODE=$(echo "$PROJECT_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$PROJECT_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    print_status 0 "Project created successfully"
    PROJECT_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "   Project ID: $PROJECT_ID"
    JWT_SECRET=$(echo "$RESPONSE_BODY" | grep -o '"jwtSecret":"[^"]*"' | cut -d'"' -f4)
    echo "   JWT Secret: ${JWT_SECRET:0:20}..."
else
    print_status 1 "Project creation failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# 4. Get Project Details
echo ""
echo "📋 Step 4: Getting project details..."
GET_PROJECT_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$BASE_URL/api/admin/projects/$PROJECT_ID" \
    -H "Cookie: admin_session=$ADMIN_SESSION")

HTTP_CODE=$(echo "$GET_PROJECT_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$GET_PROJECT_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Retrieved project details"
    echo "$RESPONSE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE_BODY"
else
    print_status 1 "Failed to get project (HTTP $HTTP_CODE)"
fi

# 5. Register a User
echo ""
echo "👤 Step 5: Registering a test user..."
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/register" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "testuser@example.com",
        "password": "TestUser123!",
        "firstName": "Test",
        "lastName": "User"
    }')

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$REGISTER_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    print_status 0 "User registered successfully"
    USER_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    echo "   User ID: $USER_ID"
    echo "   Access Token: ${ACCESS_TOKEN:0:30}..."
else
    print_status 1 "User registration failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# 6. Login User
echo ""
echo "🔓 Step 6: Testing user login..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "testuser@example.com",
        "password": "TestUser123!"
    }')

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "User login successful"
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    echo "   New Access Token: ${ACCESS_TOKEN:0:30}..."
else
    print_status 1 "User login failed (HTTP $HTTP_CODE)"
    echo "$RESPONSE_BODY"
    exit 1
fi

# 7. Get Current User (using token)
echo ""
echo "👁️  Step 7: Getting current user details..."
ME_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "$BASE_URL/api/auth/$PROJECT_ID/me" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

HTTP_CODE=$(echo "$ME_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$ME_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Retrieved current user"
    echo "$RESPONSE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE_BODY"
else
    print_status 1 "Failed to get current user (HTTP $HTTP_CODE)"
fi

# 8. Test Invalid Login
echo ""
echo "🚫 Step 8: Testing invalid login (should fail)..."
INVALID_LOGIN=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/auth/$PROJECT_ID/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "testuser@example.com",
        "password": "WrongPassword123!"
    }')

HTTP_CODE=$(echo "$INVALID_LOGIN" | tail -n1)

if [ "$HTTP_CODE" = "401" ]; then
    print_status 0 "Invalid login correctly rejected"
else
    print_status 1 "Invalid login should return 401 (got HTTP $HTTP_CODE)"
fi

# 9. List all projects (admin)
echo ""
echo "📚 Step 9: Listing all projects..."
LIST_PROJECTS=$(curl -s -w "\n%{http_code}" -X GET \
    "$BASE_URL/api/admin/projects" \
    -H "Cookie: admin_session=$ADMIN_SESSION")

HTTP_CODE=$(echo "$LIST_PROJECTS" | tail -n1)
RESPONSE_BODY=$(echo "$LIST_PROJECTS" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Retrieved projects list"
    echo "$RESPONSE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE_BODY"
else
    print_status 1 "Failed to list projects (HTTP $HTTP_CODE)"
fi

# Summary
echo ""
echo "======================================"
echo -e "${GREEN}✓ All tests passed successfully!${NC}"
echo "======================================"
echo ""
echo "Summary:"
echo "- Admin login: ✓"
echo "- Project creation: ✓"
echo "- User registration: ✓"
echo "- User login: ✓"
echo "- Token verification: ✓"
echo "- Invalid login rejection: ✓"
echo "- Project listing: ✓"
echo ""
echo "🎉 Auth service is working correctly!"