#!/bin/bash

# Simple Auth Service Test Script
BASE_URL="http://localhost:8787"
ADMIN_EMAIL="${ADMIN_EMAIL:?Set ADMIN_EMAIL for an existing admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD for that admin}"

echo "🧪 Testing Auth Service"
echo "======================="
echo ""

# Test 1: Admin Login
echo "1️⃣  Testing admin login..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

echo "Response: $RESPONSE"
SESSION_TOKEN=$(echo $RESPONSE | grep -o '"sessionToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"
echo "Session Token: ${SESSION_TOKEN:0:30}..."
echo ""

# Test 2: Create Project
echo "2️⃣  Testing project creation..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/projects" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Session: $SESSION_TOKEN" \
  -d '{"name":"test-project","description":"Test Project Description","environments":["production"]}')

echo "Response: $RESPONSE"
PROJECT_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Project creation failed"
  exit 1
fi

echo "✅ Project created"
echo "Project ID: $PROJECT_ID"
echo ""

# Test 3: Register User
echo "3️⃣  Testing user registration..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/$PROJECT_ID/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","firstName":"Test","lastName":"User"}')

echo "Response: $RESPONSE"
ACCESS_TOKEN=$(echo $RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ User registration failed"
  exit 1
fi

echo "✅ User registered"
echo "Access Token: ${ACCESS_TOKEN:0:30}..."
echo ""

# Test 4: Login User
echo "4️⃣  Testing user login..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/$PROJECT_ID/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}')

echo "Response: $RESPONSE"
NEW_TOKEN=$(echo $RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$NEW_TOKEN" ]; then
  echo "❌ User login failed"
  exit 1
fi

echo "✅ User login successful"
echo ""

# Test 5: Get Current User
echo "5️⃣  Testing get current user..."
RESPONSE=$(curl -s -X GET "$BASE_URL/api/auth/$PROJECT_ID/me" \
  -H "Authorization: Bearer $NEW_TOKEN")

echo "Response: $RESPONSE"
USER_EMAIL=$(echo $RESPONSE | grep -o '"email":"[^"]*"' | cut -d'"' -f4)

if [ "$USER_EMAIL" != "test@example.com" ]; then
  echo "❌ Get current user failed"
  exit 1
fi

echo "✅ Got current user"
echo ""

# Test 6: List Projects
echo "6️⃣  Testing list projects..."
RESPONSE=$(curl -s -X GET "$BASE_URL/api/admin/projects" \
  -H "X-Admin-Session: $SESSION_TOKEN")

echo "Response: $RESPONSE"
echo ""

echo "======================================"
echo "✅ All tests passed!"
echo "======================================"